Run the council PR review tool on PR $ARGUMENTS.

Steps:
1. Get the GitHub token: `GITHUB_TOKEN=$(gh auth token)`
2. Run the review CLI: `GITHUB_TOKEN=$GITHUB_TOKEN npx tsx tools/pr-reviewer/cli.ts $ARGUMENTS`
3. Display the full output to the user
4. If the user included `--comment`, confirm before running

The tool auto-loads config from `.council-review.json` and env from `.env.local`.

Common usage:
- `/review 9137` — dry run review of PR 9137 (repo from config)
- `/review 9137 --comment` — review and post inline comments
- `/review 9137 --report` — review and save markdown report
- `/review --repo twilio-internal/other-repo --pr 123` — different repo
- `/review --local` — review local git diff
