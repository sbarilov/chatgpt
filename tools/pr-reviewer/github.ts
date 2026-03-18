import { PRMetadata, PRReview } from "./types";

const API_BASE = "https://api.github.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable is required");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function fetchPRMetadata(owner: string, repo: string, pr: number): Promise<PRMetadata> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to fetch PR metadata: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return {
    owner,
    repo,
    number: pr,
    title: data.title,
    body: data.body || "",
    author: data.user?.login || "",
    headSha: data.head?.sha || "",
    branch: data.head?.ref || "",
  };
}

export async function fetchPRDiff(owner: string, repo: string, pr: number): Promise<string> {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr}`, {
    headers: {
      ...getHeaders(),
      Accept: "application/vnd.github.diff",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch PR diff: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function postReview(
  owner: string,
  repo: string,
  pr: number,
  headSha: string,
  review: PRReview,
  roles?: Record<string, string>
): Promise<void> {
  const formatSource = (models: string[]) =>
    models
      .map((m) => {
        const role = roles?.[m];
        const roleName = role ? role.split(":")[0].trim() : null;
        return roleName ? `${m} (${roleName})` : m;
      })
      .join(", ");

  const comments = review.comments
    .filter((c) => c.line > 0)
    .map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: `**[${c.severity.toUpperCase()}]** ${c.body}\n\n_${c.category} | Found by: ${formatSource(c.modelSource)}_`,
    }));

  // Build inline comments summary for the review body
  let reviewBody = review.summary;

  if (review.comments.length > 0) {
    reviewBody += "\n\n---\n\n## Inline Comments Summary\n\n";
    reviewBody += "| Severity | File | Line | Issue | Found by |\n";
    reviewBody += "|----------|------|------|-------|----------|\n";
    for (const c of review.comments) {
      const severity = c.severity.toUpperCase();
      const source = formatSource(c.modelSource);
      const escapedBody = c.body.replace(/\|/g, "\\|").replace(/\n/g, " ");
      reviewBody += `| ${severity} | \`${c.path}\` | ${c.line} | ${escapedBody} | ${source} |\n`;
    }
  }

  const body = {
    commit_id: headSha,
    body: reviewBody,
    event: review.event,
    comments,
  };

  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/pulls/${pr}/reviews`, {
    method: "POST",
    headers: {
      ...getHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Failed to post review: ${res.status} ${res.statusText}\n${errBody}`);
  }
}
