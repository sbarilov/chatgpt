import { FileDiff } from "./types";
import { RoleConfig } from "./config";

export const PR_ROLES: Record<string, string> = {
  "Security Reviewer":
    "Focus on vulnerabilities, injection attacks, authentication issues, secret exposure, unsafe data handling, and XSS/CSRF risks.",
  Architect:
    "Focus on system design, separation of concerns, API contracts, component boundaries, dependency direction, and whether the change fits the broader codebase architecture.",
  "Bug Hunter":
    "Focus on logic errors, off-by-one mistakes, edge cases, race conditions, null/undefined handling, and incorrect assumptions.",
  "Engineering Best Practices":
    "Focus on error handling, logging, naming conventions, DRY violations, SOLID principles, proper use of language/framework idioms, and code that will be easy to debug in production.",
  "Maintainability & Tests":
    "Focus on test coverage for new code, test quality, missing edge case tests, code that will be hard to maintain or extend, unclear abstractions, and future technical debt.",
};

export const ROLE_NAMES = Object.keys(PR_ROLES);

export function assignRoles(models: string[], roleConfigs?: RoleConfig[]): Record<string, string> {
  const roles: Record<string, string> = {};

  if (roleConfigs && roleConfigs.length > 0) {
    for (let i = 0; i < models.length; i++) {
      const rc = roleConfigs[i % roleConfigs.length];
      let fullRole = `${rc.name}: ${rc.instructions}`;
      if (rc.additionalInstructions) {
        fullRole += ` Additionally: ${rc.additionalInstructions}`;
      }
      roles[models[i]] = fullRole;
    }
  } else {
    for (let i = 0; i < models.length; i++) {
      const roleName = ROLE_NAMES[i % ROLE_NAMES.length];
      roles[models[i]] = `${roleName}: ${PR_ROLES[roleName]}`;
    }
  }

  return roles;
}

function buildSystemPrompt(role: string, systemInstructions?: string, jiraContext?: string): string {
  let prompt = `You are a code reviewer with the following specialization: ${role}`;

  if (systemInstructions) {
    prompt += `\n\nProject context: ${systemInstructions}`;
  }

  prompt += `

Review the provided diff and find issues. Return ONLY a JSON array of findings. Each finding must include a "snippet" field with the exact code from the diff (not a line number). If there are no issues, return an empty array [].

Response format:
[{
  "snippet": "exact code snippet from the diff",
  "severity": "critical" | "warning" | "suggestion" | "nitpick",
  "category": "short category label",
  "body": "description of the issue and how to fix it"
}]

Rules:
- Only comment on code that appears in the diff (added or modified lines)
- The "snippet" must be an exact substring of a line in the diff
- Be specific and actionable
- Do not flag trivially correct code
- Prioritize important issues over style nitpicks`;

  if (jiraContext) {
    prompt += `\n\nContext from the Jira ticket for this PR:\n${jiraContext}\n\nUse this context to understand what the code is trying to achieve. Flag if the implementation doesn't match the requirements.`;
  }

  return prompt;
}

function buildChunkedSystemPrompt(role: string, systemInstructions?: string, jiraContext?: string): string {
  let prompt = `You are a code reviewer with the following specialization: ${role}`;

  if (systemInstructions) {
    prompt += `\n\nProject context: ${systemInstructions}`;
  }

  prompt += `

Review the provided diffs and find issues. Return ONLY a JSON array of findings. Each finding must include a "file" field and a "snippet" field with the exact code from the diff (not a line number). If there are no issues, return an empty array [].

Response format:
[{
  "file": "path/to/file.ts",
  "snippet": "exact code snippet from the diff",
  "severity": "critical" | "warning" | "suggestion" | "nitpick",
  "category": "short category label",
  "body": "description of the issue and how to fix it"
}]

Rules:
- Only comment on code that appears in the diff (added or modified lines)
- The "snippet" must be an exact substring of a line in the diff
- Be specific and actionable
- Do not flag trivially correct code
- Prioritize important issues over style nitpicks`;

  if (jiraContext) {
    prompt += `\n\nContext from the Jira ticket for this PR:\n${jiraContext}\n\nUse this context to understand what the code is trying to achieve. Flag if the implementation doesn't match the requirements.`;
  }

  return prompt;
}

export function buildFileReviewPromptWithContext(
  file: FileDiff,
  role: string,
  jiraContext?: string,
  systemInstructions?: string
): { role: string; content: string }[] {
  return [
    {
      role: "system",
      content: buildSystemPrompt(role, systemInstructions, jiraContext),
    },
    {
      role: "user",
      content: `Review this diff for file: ${file.path}\n\n\`\`\`diff\n${file.rawDiff}\n\`\`\``,
    },
  ];
}

export function buildChunkedFileReviewPromptWithContext(
  files: FileDiff[],
  role: string,
  jiraContext?: string,
  systemInstructions?: string
): { role: string; content: string }[] {
  const diffBlock = files.map((f) => `--- File: ${f.path} ---\n${f.rawDiff}`).join("\n\n");

  return [
    {
      role: "system",
      content: buildChunkedSystemPrompt(role, systemInstructions, jiraContext),
    },
    {
      role: "user",
      content: `Review these diffs:\n\n${diffBlock}`,
    },
  ];
}

export function buildSummaryCouncilPrompt(
  prTitle: string,
  prBody: string,
  commentsSummary: string,
  fileCount: number,
  jiraContext?: string,
  systemInstructions?: string
): { role: string; content: string }[] {
  const jiraSection = jiraContext ? `\n**Jira Ticket Context:**\n${jiraContext}\n` : "";
  const sysSection = systemInstructions ? `\n**Project Context:** ${systemInstructions}\n` : "";

  return [
    {
      role: "user",
      content: `You are reviewing a pull request. Here is the context:

**PR Title:** ${prTitle}
**PR Description:** ${prBody || "(no description)"}
**Files changed:** ${fileCount}
${sysSection}${jiraSection}
**Issues found by automated review:**
${commentsSummary}

Provide an overall assessment of this PR. Discuss:
1. The most important issues found (if any)
2. Whether the changes align with the Jira ticket goals and acceptance criteria (if available)
3. Overall code quality and patterns observed
4. Whether this PR is safe to merge or needs changes

Be concise and direct. Focus on what matters most.`,
    },
  ];
}

// Legacy exports for backward compatibility with existing code
export function buildFileReviewPrompt(file: FileDiff, role: string): { role: string; content: string }[] {
  return buildFileReviewPromptWithContext(file, role);
}

export function buildChunkedFileReviewPrompt(
  files: FileDiff[],
  role: string
): { role: string; content: string }[] {
  return buildChunkedFileReviewPromptWithContext(files, role);
}
