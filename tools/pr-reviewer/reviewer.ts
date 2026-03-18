import { fetchPRMetadata, fetchPRDiff } from "./github";
import { parseDiff, findLineForSnippet, getDiffLineCount } from "./diff-parser";
import {
  assignRoles,
  buildFileReviewPromptWithContext,
  buildChunkedFileReviewPromptWithContext,
  buildSummaryCouncilPrompt,
} from "./prompts";
import { queryModel } from "@/lib/council-engine";
import { runCouncilWithSynthesis } from "@/lib/council-engine";
import { extractTicketKey, fetchJiraTicket, formatTicketContext } from "./jira";
import {
  FileDiff,
  ReviewComment,
  PRReview,
  ModelFinding,
  ModelPerspective,
} from "./types";

const SKIP_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.lock$/,
  /\.min\.(js|css)$/,
  /\.generated\./,
  /\.snap$/,
  /dist\//,
  /build\//,
  /\.map$/,
];

const MAX_FILE_DIFF_LINES = 1000;
const MAX_INLINE_COMMENTS = 40;
const CHUNK_LINE_LIMIT = 800;
const CHUNK_FILE_LINE_THRESHOLD = 100;

interface ReviewOptions {
  owner: string;
  repo: string;
  pr: number;
  models: string[];
  style: "synthesis" | "roundtable" | "sequential";
  rounds: number;
  useRoles: boolean;
  onStatus?: (message: string) => void;
}

interface LocalReviewOptions {
  rawDiff: string;
  title: string;
  description: string;
  branch: string;
  models: string[];
  style: "synthesis" | "roundtable" | "sequential";
  rounds: number;
  useRoles: boolean;
  onStatus?: (message: string) => void;
}

interface CostTracker {
  apiCalls: number;
  models: Set<string>;
}

interface ReviewResult {
  review: PRReview;
  cost: CostTracker;
  roles: Record<string, string>;
}

function shouldSkipFile(file: FileDiff): boolean {
  if (file.status === "deleted") return true;
  return SKIP_PATTERNS.some((p) => p.test(file.path));
}

function parseFindings(raw: string): ModelFinding[] {
  let cleaned = raw.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f: any) => f && typeof f.snippet === "string" && typeof f.body === "string"
    );
  } catch {
    const arrayMatch = raw.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        const parsed = JSON.parse(arrayMatch[0]);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
          (f: any) => f && typeof f.snippet === "string" && typeof f.body === "string"
        );
      } catch {
        return [];
      }
    }
    return [];
  }
}

function chunkFiles(files: FileDiff[]): FileDiff[][] {
  const chunks: FileDiff[][] = [];
  const largeFiles: FileDiff[] = [];
  const smallFiles: FileDiff[] = [];

  for (const file of files) {
    const lineCount = getDiffLineCount(file);
    if (lineCount > CHUNK_FILE_LINE_THRESHOLD) {
      largeFiles.push(file);
    } else {
      smallFiles.push(file);
    }
  }

  for (const file of largeFiles) {
    chunks.push([file]);
  }

  let currentChunk: FileDiff[] = [];
  let currentLines = 0;
  for (const file of smallFiles) {
    const lineCount = getDiffLineCount(file);
    if (currentLines + lineCount > CHUNK_LINE_LIMIT && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentLines = 0;
    }
    currentChunk.push(file);
    currentLines += lineCount;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Core review logic shared between PR and local modes
async function reviewDiff(params: {
  rawDiff: string;
  title: string;
  description: string;
  branch: string;
  models: string[];
  style: "synthesis" | "roundtable" | "sequential";
  rounds: number;
  useRoles: boolean;
  onStatus?: (message: string) => void;
}): Promise<ReviewResult> {
  const { rawDiff, title, description, branch, models, style, rounds, useRoles, onStatus } = params;
  const cost: CostTracker = { apiCalls: 0, models: new Set(models) };

  // Jira ticket context
  let jiraContext: string | undefined;
  const ticketKey = extractTicketKey(description, branch);
  if (ticketKey) {
    onStatus?.(`Found Jira ticket: ${ticketKey}, fetching...`);
    const ticket = await fetchJiraTicket(ticketKey);
    if (ticket) {
      jiraContext = formatTicketContext(ticket);
      onStatus?.(`Jira context loaded: ${ticket.summary}`);
    } else {
      onStatus?.(`Could not fetch Jira ticket ${ticketKey} (missing credentials or not found)`);
    }
  } else {
    onStatus?.("No Jira ticket found in PR description or branch name");
  }

  // Parse diff
  const allFiles = parseDiff(rawDiff);
  onStatus?.(`Parsed ${allFiles.length} files from diff`);

  // Filter
  const skippedFiles: string[] = [];
  const oversizedFiles: string[] = [];
  const reviewFiles: FileDiff[] = [];

  for (const file of allFiles) {
    if (shouldSkipFile(file)) {
      skippedFiles.push(file.path);
      continue;
    }
    const lineCount = getDiffLineCount(file);
    if (lineCount > MAX_FILE_DIFF_LINES) {
      oversizedFiles.push(`${file.path} (${lineCount} lines)`);
      continue;
    }
    reviewFiles.push(file);
  }

  if (skippedFiles.length > 0) {
    onStatus?.(`Skipped ${skippedFiles.length} files (lockfiles/generated/deleted)`);
  }
  if (oversizedFiles.length > 0) {
    onStatus?.(`Skipped ${oversizedFiles.length} oversized files: ${oversizedFiles.join(", ")}`);
  }

  // Assign roles
  const roles = useRoles ? assignRoles(models) : {};

  // Chunk files
  const chunks = chunkFiles(reviewFiles);
  onStatus?.(`Reviewing ${reviewFiles.length} files in ${chunks.length} chunks across ${models.length} models...`);

  // Phase A: Parallel file review
  const allComments: ReviewComment[] = [];

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    onStatus?.(`Reviewing chunk ${ci + 1}/${chunks.length} (${chunk.map((f) => f.path).join(", ")})...`);

    const isSingleFile = chunk.length === 1;

    const reviewPromises = models.map(async (model) => {
      const role = roles[model] || "General Code Reviewer";
      const messages = isSingleFile
        ? buildFileReviewPromptWithContext(chunk[0], role, jiraContext)
        : buildChunkedFileReviewPromptWithContext(chunk, role, jiraContext);

      const result = await queryModel(model, messages);
      cost.apiCalls++;

      if (result.error || !result.content) return [];

      const findings = parseFindings(result.content);
      return findings.map((f) => ({ ...f, model, file: (f as any).file }));
    });

    const results = await Promise.allSettled(reviewPromises);

    for (const result of results) {
      if (result.status !== "fulfilled") continue;

      for (const finding of result.value) {
        const filePath = finding.file || (isSingleFile ? chunk[0].path : null);
        if (!filePath) continue;

        const file = chunk.find((f) => f.path === filePath) || chunk[0];
        const lineInfo = findLineForSnippet(file, finding.snippet);

        if (lineInfo) {
          const existing = allComments.find(
            (c) => c.path === file.path && c.line === lineInfo.line && c.side === lineInfo.side
          );
          if (existing) {
            if (!existing.modelSource.includes(finding.model)) {
              existing.modelSource.push(finding.model);
            }
            const severityOrder = ["critical", "warning", "suggestion", "nitpick"];
            if (severityOrder.indexOf(finding.severity) < severityOrder.indexOf(existing.severity)) {
              existing.severity = finding.severity;
              existing.body = finding.body;
              existing.category = finding.category;
            }
          } else {
            allComments.push({
              path: file.path,
              line: lineInfo.line,
              side: lineInfo.side,
              body: finding.body,
              severity: finding.severity || "suggestion",
              category: finding.category || "general",
              modelSource: [finding.model],
            });
          }
        }
      }
    }
  }

  // Prioritize and cap
  const severityOrder = ["critical", "warning", "suggestion", "nitpick"];
  allComments.sort((a, b) => {
    const diff = severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity);
    if (diff !== 0) return diff;
    return b.modelSource.length - a.modelSource.length;
  });

  const cappedComments = allComments.slice(0, MAX_INLINE_COMMENTS);

  // Phase B: Summary via council deliberation
  onStatus?.("Running council deliberation for PR summary...");

  const commentsSummary = cappedComments.length > 0
    ? cappedComments
        .map(
          (c) =>
            `[${c.severity.toUpperCase()}] ${c.path}:${c.line} — ${c.body} (${c.category}, found by ${c.modelSource.join(", ")})`
        )
        .join("\n")
    : "No specific issues found.";

  const summaryMessages = buildSummaryCouncilPrompt(
    title,
    description,
    commentsSummary,
    reviewFiles.length,
    jiraContext
  );

  const councilResult = await runCouncilWithSynthesis({
    models,
    messages: summaryMessages,
    style,
    rounds,
    roles: useRoles ? roles : undefined,
    onStatus,
  });
  cost.apiCalls += models.length * (style === "roundtable" ? rounds : 1) + 1;

  const perspectives: ModelPerspective[] = [];
  for (const round of councilResult.rounds) {
    for (const resp of round.responses) {
      if (!resp.error && resp.content) {
        const role = roles[resp.model] || "General Reviewer";
        const roleName = role.split(":")[0] || role;
        perspectives.push({
          model: resp.model,
          role: roleName,
          summary: resp.content.slice(0, 500) + (resp.content.length > 500 ? "..." : ""),
        });
      }
    }
  }

  const hasCritical = cappedComments.some((c) => c.severity === "critical");
  const event = hasCritical ? "REQUEST_CHANGES" : "COMMENT";

  return {
    review: {
      summary: councilResult.synthesis,
      comments: cappedComments,
      event,
      modelPerspectives: perspectives,
    },
    cost,
    roles,
  };
}

export async function reviewPR(options: ReviewOptions): Promise<ReviewResult> {
  const { owner, repo, pr, models, style, rounds, useRoles, onStatus } = options;

  onStatus?.("Fetching PR metadata and diff...");
  const [metadata, rawDiff] = await Promise.all([
    fetchPRMetadata(owner, repo, pr),
    fetchPRDiff(owner, repo, pr),
  ]);

  const result = await reviewDiff({
    rawDiff,
    title: metadata.title,
    description: metadata.body,
    branch: metadata.branch,
    models,
    style,
    rounds,
    useRoles,
    onStatus,
  });

  result.cost.apiCalls += 2; // GitHub API calls

  return result;
}

export async function reviewLocal(options: LocalReviewOptions): Promise<ReviewResult> {
  return reviewDiff(options);
}
