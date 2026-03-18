export interface PRMetadata {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  headSha: string;
  branch: string;
}

export interface DiffLine {
  type: "add" | "delete" | "context";
  content: string;
  newLineNumber?: number;
  oldLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  hunks: DiffHunk[];
  rawDiff: string;
}

export interface ReviewComment {
  path: string;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
  severity: "critical" | "warning" | "suggestion" | "nitpick";
  category: string;
  modelSource: string[];
}

export interface ModelPerspective {
  model: string;
  role: string;
  summary: string;
}

export interface PRReview {
  summary: string;
  comments: ReviewComment[];
  event: "COMMENT" | "REQUEST_CHANGES";
  modelPerspectives: ModelPerspective[];
}

export interface ModelFinding {
  snippet: string;
  severity: "critical" | "warning" | "suggestion" | "nitpick";
  category: string;
  body: string;
}
