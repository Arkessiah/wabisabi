/**
 * Diff Utility
 *
 * Generates unified diff output for file changes.
 * No external dependencies - implements Myers diff algorithm subset.
 */

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

/**
 * Generate a unified diff between two strings.
 * Context: 3 lines before/after each change.
 */
export function generateDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
  contextLines = 3,
): string {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Simple LCS-based diff
  const changes = computeChanges(oldLines, newLines);
  if (changes.length === 0) return "No changes.";

  const hunks = groupIntoHunks(changes, oldLines, newLines, contextLines);
  if (hunks.length === 0) return "No changes.";

  const output: string[] = [];
  output.push(`--- a/${filePath}`);
  output.push(`+++ b/${filePath}`);

  for (const hunk of hunks) {
    output.push(
      `@@ -${hunk.oldStart + 1},${hunk.oldCount} +${hunk.newStart + 1},${hunk.newCount} @@`,
    );
    output.push(...hunk.lines);
  }

  // Add summary
  const added = changes.filter((c) => c.type === "add").length;
  const removed = changes.filter((c) => c.type === "remove").length;
  output.push(`\n${added} addition${added !== 1 ? "s" : ""}, ${removed} deletion${removed !== 1 ? "s" : ""}`);

  return output.join("\n");
}

interface Change {
  type: "add" | "remove" | "equal";
  oldIdx: number;
  newIdx: number;
  line: string;
}

function computeChanges(oldLines: string[], newLines: string[]): Change[] {
  // Build a simple edit script using longest common subsequence
  const m = oldLines.length;
  const n = newLines.length;

  // For very large files, fall back to summary
  if (m + n > 5000) {
    return computeChangesFast(oldLines, newLines);
  }

  // DP for LCS
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find changes
  const changes: Change[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      changes.unshift({
        type: "equal",
        oldIdx: i - 1,
        newIdx: j - 1,
        line: oldLines[i - 1],
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({
        type: "add",
        oldIdx: i,
        newIdx: j - 1,
        line: newLines[j - 1],
      });
      j--;
    } else {
      changes.unshift({
        type: "remove",
        oldIdx: i - 1,
        newIdx: j,
        line: oldLines[i - 1],
      });
      i--;
    }
  }

  return changes;
}

function computeChangesFast(
  oldLines: string[],
  newLines: string[],
): Change[] {
  // For large files, do a line-by-line comparison with some context
  const changes: Change[] = [];
  const maxLen = Math.max(oldLines.length, newLines.length);

  for (let i = 0; i < maxLen; i++) {
    if (i < oldLines.length && i < newLines.length) {
      if (oldLines[i] === newLines[i]) {
        changes.push({ type: "equal", oldIdx: i, newIdx: i, line: oldLines[i] });
      } else {
        changes.push({ type: "remove", oldIdx: i, newIdx: i, line: oldLines[i] });
        changes.push({ type: "add", oldIdx: i, newIdx: i, line: newLines[i] });
      }
    } else if (i < oldLines.length) {
      changes.push({ type: "remove", oldIdx: i, newIdx: newLines.length, line: oldLines[i] });
    } else {
      changes.push({ type: "add", oldIdx: oldLines.length, newIdx: i, line: newLines[i] });
    }
  }

  return changes;
}

function groupIntoHunks(
  changes: Change[],
  _oldLines: string[],
  _newLines: string[],
  contextLines: number,
): DiffHunk[] {
  // Find ranges of changes
  const changeIndices: number[] = [];
  for (let i = 0; i < changes.length; i++) {
    if (changes[i].type !== "equal") {
      changeIndices.push(i);
    }
  }

  if (changeIndices.length === 0) return [];

  // Group nearby changes into hunks
  const groups: number[][] = [];
  let currentGroup: number[] = [changeIndices[0]];

  for (let i = 1; i < changeIndices.length; i++) {
    const gap = changeIndices[i] - changeIndices[i - 1];
    if (gap <= contextLines * 2 + 1) {
      currentGroup.push(changeIndices[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [changeIndices[i]];
    }
  }
  groups.push(currentGroup);

  // Build hunks with context
  const hunks: DiffHunk[] = [];

  for (const group of groups) {
    const start = Math.max(0, group[0] - contextLines);
    const end = Math.min(changes.length - 1, group[group.length - 1] + contextLines);

    const lines: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    let oldStart = 0;
    let newStart = 0;
    let firstOld = true;
    let firstNew = true;

    for (let i = start; i <= end; i++) {
      const change = changes[i];
      switch (change.type) {
        case "equal":
          lines.push(` ${change.line}`);
          if (firstOld) { oldStart = change.oldIdx; firstOld = false; }
          if (firstNew) { newStart = change.newIdx; firstNew = false; }
          oldCount++;
          newCount++;
          break;
        case "remove":
          lines.push(`-${change.line}`);
          if (firstOld) { oldStart = change.oldIdx; firstOld = false; }
          if (firstNew) { newStart = change.newIdx; firstNew = false; }
          oldCount++;
          break;
        case "add":
          lines.push(`+${change.line}`);
          if (firstOld) { oldStart = change.oldIdx; firstOld = false; }
          if (firstNew) { newStart = change.newIdx; firstNew = false; }
          newCount++;
          break;
      }
    }

    hunks.push({ oldStart, oldCount, newStart, newCount, lines });
  }

  return hunks;
}
