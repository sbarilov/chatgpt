import { parseArgs } from "node:util";
import { reviewPR } from "./reviewer";
import { postReview, fetchPRMetadata } from "./github";

const DEFAULT_MODELS = ["gpt-5.4", "gpt-5.3-chat-latest", "o3", "gpt-5.2", "gpt-5.4-mini"];

function usage(): never {
  console.error(`Usage: npx tsx tools/pr-reviewer/cli.ts --repo owner/repo --pr 123 [options]

Options:
  --repo <owner/repo>    GitHub repository (required)
  --pr <number>          Pull request number (required)
  --models <m1,m2,...>   Models to use (default: gpt-5.4,gpt-5.3-chat-latest,o3,gpt-5.2,gpt-5.4-mini)
  --style <style>        Council style: sequential|roundtable|synthesis (default: sequential)
  --rounds <n>           Rounds for roundtable mode (default: 2)
  --no-roles             Disable automatic role assignment
  --post                 Post review to GitHub (otherwise stdout only)
  --help                 Show this help message

Environment:
  OPENAI_API_KEY         Required for OpenAI models
  GEMINI_API_KEY         Required for Gemini models
  GITHUB_TOKEN           Required for fetching PR data (and --post)`);
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      repo: { type: "string" },
      pr: { type: "string" },
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
  if (!values.repo || !values.pr) {
    console.error("Error: --repo and --pr are required\n");
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

  const models = values.models ? values.models.split(",") : DEFAULT_MODELS;
  const style = (values.style as "sequential" | "roundtable" | "synthesis") || "sequential";
  const rounds = values.rounds ? parseInt(values.rounds, 10) : 2;
  const useRoles = !values["no-roles"];
  const shouldPost = values.post || false;

  if (!["sequential", "roundtable", "synthesis"].includes(style)) {
    console.error(`Error: --style must be sequential, roundtable, or synthesis\n`);
    usage();
  }

  const status = (msg: string) => process.stderr.write(`[status] ${msg}\n`);

  const startTime = Date.now();

  try {
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

    // Format output
    console.log(`\n=== PR Review: "${(await fetchPRMetadata(owner, repo, prNumber)).title}" (#${prNumber}) ===`);
    const modelList = models
      .map((m) => {
        const role = roles[m];
        const roleName = role ? role.split(":")[0].trim() : null;
        return roleName ? `${m} (${roleName})` : m;
      })
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
          .map((m) => {
            const role = roles[m];
            const roleName = role ? role.split(":")[0].trim() : null;
            return roleName ? `${m} (${roleName})` : m;
          })
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

    // Post to GitHub
    if (shouldPost) {
      status("Posting review to GitHub...");
      const metadata = await fetchPRMetadata(owner, repo, prNumber);
      await postReview(owner, repo, prNumber, metadata.headSha, review, roles);
      console.log(`\nReview posted to GitHub.`);
    }
  } catch (err: any) {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
