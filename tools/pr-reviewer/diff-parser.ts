import { FileDiff, DiffHunk, DiffLine } from "./types";

export function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileParts = raw.split(/^diff --git /m).filter(Boolean);

  for (const part of fileParts) {
    const lines = part.split("\n");
    const headerMatch = lines[0]?.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const path = headerMatch[2];
    const fullPart = "diff --git " + part;

    // Skip binary files
    if (part.includes("Binary files")) continue;

    let status: FileDiff["status"] = "modified";
    if (part.includes("new file mode")) status = "added";
    else if (part.includes("deleted file mode")) status = "deleted";
    else if (part.includes("rename from")) status = "renamed";

    const hunks: DiffHunk[] = [];
    const hunkRegex = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/gm;
    let match: RegExpExecArray | null;

    while ((match = hunkRegex.exec(part)) !== null) {
      const oldStart = parseInt(match[1], 10);
      const oldCount = parseInt(match[2] || "1", 10);
      const newStart = parseInt(match[3], 10);
      const newCount = parseInt(match[4] || "1", 10);

      const hunkStartIdx = part.indexOf(match[0]) + match[0].length;
      const nextHunkIdx = part.indexOf("\n@@", hunkStartIdx);
      const hunkBody = nextHunkIdx === -1
        ? part.slice(hunkStartIdx)
        : part.slice(hunkStartIdx, nextHunkIdx);

      const hunkLines: DiffLine[] = [];
      let oldLine = oldStart;
      let newLine = newStart;

      for (const line of hunkBody.split("\n")) {
        if (line === "") continue;
        if (line.startsWith("\\ No newline")) continue;

        if (line.startsWith("+")) {
          hunkLines.push({ type: "add", content: line.slice(1), newLineNumber: newLine });
          newLine++;
        } else if (line.startsWith("-")) {
          hunkLines.push({ type: "delete", content: line.slice(1), oldLineNumber: oldLine });
          oldLine++;
        } else if (line.startsWith(" ")) {
          hunkLines.push({ type: "context", content: line.slice(1), newLineNumber: newLine, oldLineNumber: oldLine });
          oldLine++;
          newLine++;
        }
      }

      hunks.push({ oldStart, oldCount, newStart, newCount, lines: hunkLines });
    }

    files.push({ path, status, hunks, rawDiff: fullPart });
  }

  return files;
}

export function findLineForSnippet(
  file: FileDiff,
  snippet: string
): { line: number; side: "RIGHT" | "LEFT" } | null {
  const trimmed = snippet.trim();
  if (!trimmed) return null;

  // Exact match first
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.content.trim() === trimmed) {
        if (line.type === "delete" && line.oldLineNumber) {
          return { line: line.oldLineNumber, side: "LEFT" };
        }
        if (line.newLineNumber) {
          return { line: line.newLineNumber, side: "RIGHT" };
        }
      }
    }
  }

  // Fuzzy: check if snippet is contained within a line or vice versa
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      const lineContent = line.content.trim();
      if (lineContent.includes(trimmed) || trimmed.includes(lineContent)) {
        if (lineContent.length < 3) continue; // skip trivially short matches
        if (line.type === "delete" && line.oldLineNumber) {
          return { line: line.oldLineNumber, side: "LEFT" };
        }
        if (line.newLineNumber) {
          return { line: line.newLineNumber, side: "RIGHT" };
        }
      }
    }
  }

  return null;
}

export function getDiffLineCount(file: FileDiff): number {
  let count = 0;
  for (const hunk of file.hunks) {
    count += hunk.lines.length;
  }
  return count;
}
