import { parseArgs } from "node:util";
import { execSync } from "node:child_process";
import { reviewPR, reviewLocal } from "./reviewer";
import { postReview, fetchPRMetadata } from "./github";

const DEFAULT_MODELS = ["gpt-5.4", "gpt-5.3-chat-latest", "o3", "gpt-5.2", "gpt-5.4-mini"];

function usage(): never {
  console.error(`Usage:
  PR mode:    npx tsx tools/pr-reviewer/cli.ts --repo owner/repo --pr 123 [options]
  Local mode: npx tsx tools/pr-reviewer/cli.ts --local [--base main] [options]

Options:
  --repo <owner/repo>    GitHub repository (PR mode)
  --pr <number>          Pull request number (PR mode)
  --local                Review local git diff instead of a GitHub PR
  --base <branch>        Base branch for local diff (default: main)
  --models <m1,m2,...>   Models to use (default: gpt-5.4,gpt-5.3-chat-latest,o3,gpt-5.2,gpt-5.4-mini)
  --style <style>        Council style: sequential|roundtable|synthesis (default: sequential)
  --rounds <n>           Rounds for roundtable mode (default: 2)
  --no-roles             Disable automatic role assignment
  --post                 Post review to GitHub (PR mode only)
  --help                 Show this help message

Environment:
  OPENAI_API_KEY         Required for OpenAI models
  GITHUB_TOKEN           Required for PR mode (and --post)
  JIRA_API_TOKEN         Optional: Jira integration for ticket context
  JIRA_BASE_URL          Optional: Jira instance URL
  JIRA_USER_EMAIL        Optional: Jira auth email`);
  process.exit(1);
}

function formatSource(model: string, roles: Record<string, string>): string {
  const role = roles[model];
  const roleName = role ? role.split(":")[0].trim() : null;
  return roleName ? `${model} (${roleName})` : model;
}

function formatOutput(
  title: string,
  review: Awaited<ReturnType<typeof reviewPR>>["review"],
  cost: Awaited<ReturnType<typeof reviewPR>>["cost"],
  roles: Record<string, string>,
  models: string[],
  style: string,
  elapsed: string
) {
  console.log(`\n=== Review: "${title}" ===`);
  const modelList = models
    .map((m) => formatSource(m, roles))
    .join(", ");
  console.log(`Models: ${modelList}`);
  console.log(`Style: ${style}`);
  console.log(`Cost: ${cost.apiCalls} API calls in ${elapsed}s`);

  console.log(`\n--- SUMMARY ---`);
  console.log(review.summary);

  if (review.comments.length > 0) {
    console.log(`\n--- INLINE COMMENTS (${review.comments.length}) ---`);
    for (const c of review.comments) {
      const sources = c.modelSource
        .map((m) => formatSource(m, roles))
        .join(", ");
      console.log(`[${c.severity.toUpperCase().padEnd(10)}] ${c.path}:${c.line} — ${c.body} (${sources})`);
    }
  } else {
    console.log(`\nNo inline comments.`);
  }

  if (review.event === "REQUEST_CHANGES") {
    console.log(`\nVerdict: REQUEST_CHANGES (critical issues found)`);
  } else {
    console.log(`\nVerdict: COMMENT (no critical issues)`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string" },
      pr: { type: "string" },
      local: { type: "boolean", default: false },
      base: { type: "string" },
      models: { type: "string" },
      style: { type: "string" },
      rounds: { type: "string" },
      "no-roles": { type: "boolean", default: false },
      post: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) usage();

  const models = values.models ? values.models.split(",") : DEFAULT_MODELS;
  const style = (values.style as "sequential" | "roundtable" | "synthesis") || "sequential";
  const rounds = values.rounds ? parseInt(values.rounds, 10) : 2;
  const useRoles = !values["no-roles"];
  const status = (msg: string) => process.stderr.write(`[status] ${msg}\n`);
  const startTime = Date.now();

  if (!["sequential", "roundtable", "synthesis"].includes(style)) {
    console.error(`Error: --style must be sequential, roundtable, or synthesis\n`);
    usage();
  }

  try {
    if (values.local) {
      // Local mode: review git diff
      const base = values.base || "main";
      status(`Generating diff against ${base}...`);

      const branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
      const rawDiff = execSync(`git diff ${base}...HEAD`, { encoding: "utf8" });

      if (!rawDiff.trim()) {
        console.error(`No diff found between ${base} and HEAD. Nothing to review.`);
        process.exit(0);
      }

      // Try to get a title from the latest commit
      const title = execSync("git log -1 --format=%s", { encoding: "utf8" }).trim();

      // Try to get description from commit messages
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
        onStatus: status,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      formatOutput(title, review, cost, roles, models, style, elapsed);

    } else {
      // PR mode
      if (!values.repo || !values.pr) {
        console.error("Error: --repo and --pr are required (or use --local)\n");
        usage();
      }

      const [owner, repo] = values.repo.split("/");
      if (!owner || !repo) {
        console.error("Error: --repo must be in owner/repo format\n");
        usage();
      }

      const prNumber = parseInt(values.pr, 10);
      if (isNaN(prNumber)) {
        console.error("Error: --pr must be a number\n");
        usage();
      }

      const { review, cost, roles } = await reviewPR({
        owner,
        repo,
        pr: prNumber,
        models,
        style,
        rounds,
        useRoles,
        onStatus: status,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const metadata = await fetchPRMetadata(owner, repo, prNumber);
      formatOutput(metadata.title, review, cost, roles, models, style, elapsed);

      if (values.post) {
        status("Posting review to GitHub...");
        await postReview(owner, repo, prNumber, metadata.headSha, review, roles);
        console.log(`\nReview posted to GitHub.`);
      }
    }
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
