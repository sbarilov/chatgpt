import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { reviewPR, reviewLocal } from "./reviewer";
import { postReview, fetchPRMetadata } from "./github";
import { loadConfig, loadEnvFile, resolveEnv } from "./config";

// Load env file before anything else
loadEnvFile();

function usage(): never {
  console.error(`Council PR Review — Multi-model AI code review

Usage:
  council-review <pr-number> [options]
  council-review --repo owner/repo --pr <number> [options]
  council-review --local [--base main] [options]

Options:
  --repo <owner/repo>    GitHub repository (overrides config file)
  --pr <number>          Pull request number
  --local                Review local git diff instead of a GitHub PR
  --base <branch>        Base branch for local diff (default: main)
  --config <path>        Path to config file (default: auto-detect .council-review.json)
  --models <m1,m2,...>   Models to use (overrides config file)
  --style <style>        Council style: sequential|roundtable|synthesis (overrides config)
  --rounds <n>           Rounds for roundtable mode (overrides config)
  --no-roles             Disable automatic role assignment
  --comment              Post review as inline comments on the GitHub PR
  --report               Save review report to a markdown file
  --report-path <path>   Custom report file path (default: council-review-<PR>.md)
  --help                 Show this help message

Config file (.council-review.json):
  Place in project root. Supports: repo, models, style, rounds, roles,
  systemInstructions, jira settings. See docs for full schema.

Environment:
  OPENAI_API_KEY         Required for OpenAI models (auto-loaded from .env.local)
  GITHUB_TOKEN           Required for PR mode (and --comment)
  JIRA_API_TOKEN         Optional: Jira integration (auto-loaded from .env.local)
  JIRA_BASE_URL          Optional: from config or env
  JIRA_USER_EMAIL        Optional: from config or env`);
  process.exit(1);
}

function formatSource(model: string, roles: Record<string, string>): string {
  const role = roles[model];
  const roleName = role ? role.split(":")[0].trim() : null;
  return roleName ? `${model} (${roleName})` : model;
}

function formatReview(
  title: string,
  review: Awaited<ReturnType<typeof reviewPR>>["review"],
  cost: Awaited<ReturnType<typeof reviewPR>>["cost"],
  roles: Record<string, string>,
  models: string[],
  style: string,
  elapsed: string
): string {
  const lines: string[] = [];

  lines.push(`\n=== Review: "${title}" ===`);
  const modelList = models.map((m) => formatSource(m, roles)).join(", ");
  lines.push(`Models: ${modelList}`);
  lines.push(`Style: ${style}`);
  lines.push(`Cost: ${cost.apiCalls} API calls in ${elapsed}s`);

  lines.push(`\n--- SUMMARY ---`);
  lines.push(review.summary);

  if (review.comments.length > 0) {
    lines.push(`\n--- INLINE COMMENTS (${review.comments.length}) ---`);
    for (const c of review.comments) {
      const sources = c.modelSource.map((m) => formatSource(m, roles)).join(", ");
      lines.push(
        `[${c.severity.toUpperCase().padEnd(10)}] ${c.path}:${c.line} — ${c.body} (${sources})`
      );
    }
  } else {
    lines.push(`\nNo inline comments.`);
  }

  if (review.event === "REQUEST_CHANGES") {
    lines.push(`\nVerdict: REQUEST_CHANGES (critical issues found)`);
  } else {
    lines.push(`\nVerdict: COMMENT (no critical issues)`);
  }

  return lines.join("\n");
}

function formatMarkdownReport(
  title: string,
  review: Awaited<ReturnType<typeof reviewPR>>["review"],
  cost: Awaited<ReturnType<typeof reviewPR>>["cost"],
  roles: Record<string, string>,
  models: string[],
  style: string,
  elapsed: string
): string {
  const lines: string[] = [];

  lines.push(`# Council PR Review: "${title}"`);
  lines.push("");
  const modelList = models.map((m) => formatSource(m, roles)).join(", ");
  lines.push(`**Models:** ${modelList}`);
  lines.push(`**Style:** ${style}`);
  lines.push(`**Cost:** ${cost.apiCalls} API calls in ${elapsed}s`);
  lines.push(`**Verdict:** ${review.event === "REQUEST_CHANGES" ? "REQUEST CHANGES" : "COMMENT"}`);
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(review.summary);
  lines.push("");

  if (review.comments.length > 0) {
    lines.push(`## Inline Comments (${review.comments.length})`);
    lines.push("");
    lines.push("| Severity | File | Line | Issue | Found by |");
    lines.push("|----------|------|------|-------|----------|");
    for (const c of review.comments) {
      const sources = c.modelSource.map((m) => formatSource(m, roles)).join(", ");
      lines.push(
        `| ${c.severity.toUpperCase()} | \`${c.path}\` | ${c.line} | ${c.body.replace(/\|/g, "\\|")} | ${sources} |`
      );
    }
  }

  return lines.join("\n");
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      repo: { type: "string" },
      pr: { type: "string" },
      local: { type: "boolean", default: false },
      base: { type: "string" },
      config: { type: "string" },
      models: { type: "string" },
      style: { type: "string" },
      rounds: { type: "string" },
      "no-roles": { type: "boolean", default: false },
      comment: { type: "boolean", default: false },
      report: { type: "boolean", default: false },
      "report-path": { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });

  if (values.help) usage();

  // Load config
  const config = loadConfig(values.config);
  resolveEnv(config);

  // CLI args override config
  const models = values.models ? values.models.split(",") : config.models;
  const style = (values.style as "sequential" | "roundtable" | "synthesis") || config.style;
  const rounds = values.rounds ? parseInt(values.rounds, 10) : config.rounds;
  const useRoles = !values["no-roles"] && config.useRoles;
  const roleConfigs = useRoles ? config.roles : undefined;
  const systemInstructions = config.systemInstructions;

  const status = (msg: string) => process.stderr.write(`[status] ${msg}\n`);
  const startTime = Date.now();

  if (!["sequential", "roundtable", "synthesis"].includes(style)) {
    console.error(`Error: --style must be sequential, roundtable, or synthesis\n`);
    usage();
  }

  try {
    if (values.local) {
      // Local mode
      const base = values.base || "main";
      status(`Generating diff against ${base}...`);

      const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
      const rawDiff = execSync(`git diff ${base}...HEAD`, { encoding: "utf8" });

      if (!rawDiff.trim()) {
        console.error(`No diff found between ${base} and HEAD. Nothing to review.`);
        process.exit(0);
      }

      const title = execSync("git log -1 --format=%s", { encoding: "utf8" }).trim();
      const description = execSync(`git log ${base}..HEAD --format=%B`, { encoding: "utf8" }).trim();

      status(`Branch: ${branch}, ${rawDiff.split("\n").length} diff lines`);

      const { review, cost, roles } = await reviewLocal({
        rawDiff,
        title,
        description,
        branch,
        models,
        style,
        rounds,
        useRoles,
        roleConfigs,
        systemInstructions,
        onStatus: status,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const output = formatReview(title, review, cost, roles, models, style, elapsed);
      console.log(output);

      if (values.report) {
        const reportPath = values["report-path"] || `council-review-local.md`;
        const md = formatMarkdownReport(title, review, cost, roles, models, style, elapsed);
        writeFileSync(reportPath, md);
        console.log(`\nReport saved to ${reportPath}`);
      }
    } else {
      // PR mode — get PR number from positional arg or --pr flag
      const prArg = positionals[0] || values.pr;
      if (!prArg) {
        console.error("Error: provide a PR number as argument or use --pr <number> (or --local)\n");
        usage();
      }

      const prNumber = parseInt(prArg, 10);
      if (isNaN(prNumber)) {
        console.error(`Error: PR number must be a number, got "${prArg}"\n`);
        usage();
      }

      // Repo from --repo flag or config file
      const repoStr = values.repo || config.repo;
      if (!repoStr) {
        console.error("Error: --repo is required (or set 'repo' in .council-review.json)\n");
        usage();
      }

      const [owner, repo] = repoStr.split("/");
      if (!owner || !repo) {
        console.error("Error: repo must be in owner/repo format\n");
        usage();
      }

      status(`Reviewing ${repoStr}#${prNumber}...`);

      const { review, cost, roles } = await reviewPR({
        owner,
        repo,
        pr: prNumber,
        models,
        style,
        rounds,
        useRoles,
        roleConfigs,
        systemInstructions,
        onStatus: status,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const metadata = await fetchPRMetadata(owner, repo, prNumber);
      const output = formatReview(metadata.title, review, cost, roles, models, style, elapsed);
      console.log(output);

      if (values.comment) {
        status("Posting review to GitHub...");
        await postReview(owner, repo, prNumber, metadata.headSha, review, roles);
        console.log(`\nReview posted to GitHub.`);
      }

      if (values.report) {
        const reportPath = values["report-path"] || `council-review-${prNumber}.md`;
        const md = formatMarkdownReport(
          metadata.title,
          review,
          cost,
          roles,
          models,
          style,
          elapsed
        );
        writeFileSync(reportPath, md);
        console.log(`\nReport saved to ${reportPath}`);
      }
    }
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
