export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  acceptanceCriteria: string;
  status: string;
  type: string;
}

function getJiraAuth(): { baseUrl: string; authHeader: string } | null {
  const token = process.env.JIRA_API_TOKEN;
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_USER_EMAIL;
  if (!token || !baseUrl || !email) return null;
  const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
  return { baseUrl, authHeader };
}

// Extract ticket key from PR description or branch name
// Matches patterns like CSC-139, PROJ-123, etc.
export function extractTicketKey(prBody: string, branchName: string): string | null {
  // Try PR body first — look for Jira links or ticket references
  const linkMatch = prBody.match(/atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/);
  if (linkMatch) return linkMatch[1];

  // Look for [TICKET-123] or TICKET-123 pattern in body
  const bodyMatch = prBody.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  if (bodyMatch) return bodyMatch[1];

  // Try branch name
  const branchMatch = branchName.match(/^([A-Z][A-Z0-9]+-\d+)/);
  if (branchMatch) return branchMatch[1];

  // Case-insensitive branch match (branches are often lowercase)
  const branchMatchLower = branchName.match(/^([a-zA-Z][a-zA-Z0-9]+-\d+)/i);
  if (branchMatchLower) return branchMatchLower[1].toUpperCase();

  return null;
}

// Convert Atlassian Document Format to plain text
function adfToText(node: any): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";

  const children = node.content || [];
  const text = children.map(adfToText).join("");

  switch (node.type) {
    case "paragraph":
      return text + "\n";
    case "heading":
      return text + "\n";
    case "bulletList":
    case "orderedList":
      return text;
    case "listItem":
      return "- " + text;
    case "codeBlock":
      return "```\n" + text + "\n```\n";
    default:
      return text;
  }
}

export async function fetchJiraTicket(ticketKey: string): Promise<JiraTicket | null> {
  const auth = getJiraAuth();
  if (!auth) return null;

  try {
    const res = await fetch(
      `${auth.baseUrl}/rest/api/3/issue/${ticketKey}?fields=summary,description,status,issuetype,customfield_10137`,
      {
        headers: {
          Authorization: auth.authHeader,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      console.error(`Jira API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    const fields = data.fields || {};

    return {
      key: data.key,
      summary: fields.summary || "",
      description: adfToText(fields.description).trim(),
      acceptanceCriteria: adfToText(fields.customfield_10137).trim(),
      status: fields.status?.name || "",
      type: fields.issuetype?.name || "",
    };
  } catch (err: any) {
    console.error(`Failed to fetch Jira ticket ${ticketKey}:`, err.message);
    return null;
  }
}

export function formatTicketContext(ticket: JiraTicket): string {
  let ctx = `## Jira Ticket: ${ticket.key}\n`;
  ctx += `**Type:** ${ticket.type} | **Status:** ${ticket.status}\n`;
  ctx += `**Summary:** ${ticket.summary}\n`;

  if (ticket.description) {
    ctx += `\n**Description:**\n${ticket.description}\n`;
  }

  if (ticket.acceptanceCriteria) {
    ctx += `\n**Acceptance Criteria:**\n${ticket.acceptanceCriteria}\n`;
  }

  return ctx;
}
