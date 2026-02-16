/**
 * Edit Tool
 *
 * Search-and-replace editing with multiple matching strategies.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, isAbsolute } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";
import { generateDiff } from "./diff.js";

// ── Replacer Strategies ────────────────────────────────────────

interface ReplacerResult {
  content: string;
  matchCount: number;
}

function simpleReplacer(
  content: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean,
): ReplacerResult | null {
  const idx = content.indexOf(oldStr);
  if (idx === -1) return null;

  if (replaceAll) {
    const parts = content.split(oldStr);
    return {
      content: parts.join(newStr),
      matchCount: parts.length - 1,
    };
  }

  // Check for uniqueness
  const secondIdx = content.indexOf(oldStr, idx + 1);
  if (secondIdx !== -1) return null; // Ambiguous - multiple matches

  return {
    content: content.slice(0, idx) + newStr + content.slice(idx + oldStr.length),
    matchCount: 1,
  };
}

function lineTrimmedReplacer(
  content: string,
  oldStr: string,
  newStr: string,
): ReplacerResult | null {
  const contentLines = content.split("\n");
  const searchLines = oldStr.split("\n").map((l) => l.trim());

  let matchStart = -1;
  let matchCount = 0;

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (contentLines[i + j].trim() !== searchLines[j]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      if (matchCount > 0) return null; // Ambiguous
      matchStart = i;
      matchCount++;
    }
  }

  if (matchStart === -1) return null;

  const before = contentLines.slice(0, matchStart);
  const after = contentLines.slice(matchStart + searchLines.length);
  const result = [...before, ...newStr.split("\n"), ...after].join("\n");

  return { content: result, matchCount: 1 };
}

function whitespaceNormalizedReplacer(
  content: string,
  oldStr: string,
  newStr: string,
): ReplacerResult | null {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normalizedContent = normalize(content);
  const normalizedSearch = normalize(oldStr);

  const idx = normalizedContent.indexOf(normalizedSearch);
  if (idx === -1) return null;

  // Find the actual position in original content
  let origPos = 0;
  let normPos = 0;
  const contentChars = content.split("");

  // Map normalized position back to original
  while (normPos < idx && origPos < contentChars.length) {
    if (/\s/.test(contentChars[origPos])) {
      // Skip consecutive whitespace in original
      while (origPos < contentChars.length && /\s/.test(contentChars[origPos])) {
        origPos++;
      }
      normPos++; // One space in normalized
    } else {
      origPos++;
      normPos++;
    }
  }

  // Find end position
  let origEnd = origPos;
  let normEnd = normPos;
  while (normEnd < idx + normalizedSearch.length && origEnd < contentChars.length) {
    if (/\s/.test(contentChars[origEnd])) {
      while (origEnd < contentChars.length && /\s/.test(contentChars[origEnd])) {
        origEnd++;
      }
      normEnd++;
    } else {
      origEnd++;
      normEnd++;
    }
  }

  const result =
    content.slice(0, origPos) + newStr + content.slice(origEnd);

  return { content: result, matchCount: 1 };
}

function blockAnchorReplacer(
  content: string,
  oldStr: string,
  newStr: string,
): ReplacerResult | null {
  const contentLines = content.split("\n");
  const searchLines = oldStr.split("\n");

  if (searchLines.length < 2) return null;

  const firstLine = searchLines[0].trim();
  const lastLine = searchLines[searchLines.length - 1].trim();

  let matchStart = -1;
  let matchCount = 0;

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    if (
      contentLines[i].trim() === firstLine &&
      contentLines[i + searchLines.length - 1].trim() === lastLine
    ) {
      if (matchCount > 0) return null; // Ambiguous
      matchStart = i;
      matchCount++;
    }
  }

  if (matchStart === -1) return null;

  const before = contentLines.slice(0, matchStart);
  const after = contentLines.slice(matchStart + searchLines.length);
  const result = [...before, ...newStr.split("\n"), ...after].join("\n");

  return { content: result, matchCount: 1 };
}

// ── Edit Tool ──────────────────────────────────────────────────

export const editTool = defineTool("edit", {
  description:
    "Search and replace text in a file. Tries exact match first, then fuzzy strategies. Use replaceAll to replace all occurrences.",
  parameters: z.object({
    filePath: z.string().describe("Absolute or relative path to the file"),
    oldString: z.string().describe("The text to find and replace"),
    newString: z.string().describe("The replacement text"),
    replaceAll: z
      .boolean()
      .optional()
      .default(false)
      .describe("Replace all occurrences (default: false)"),
  }),
  async execute(args, ctx) {
    const filePath = isAbsolute(args.filePath)
      ? args.filePath
      : resolve(ctx.projectRoot, args.filePath);

    if (!existsSync(filePath)) {
      return {
        title: "File not found",
        output: `File not found: ${filePath}`,
        metadata: { error: true, filePath },
      };
    }

    if (args.oldString === args.newString) {
      return {
        title: "No change",
        output: "oldString and newString are identical. No changes made.",
        metadata: { error: true },
      };
    }

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (err) {
      return {
        title: "Read error",
        output: `Cannot read "${filePath}": ${err instanceof Error ? err.message : "permission denied"}`,
        metadata: { error: true, filePath },
      };
    }

    // Try strategies in order
    const strategies = [
      { name: "exact", fn: () => simpleReplacer(content, args.oldString, args.newString, args.replaceAll) },
      { name: "line-trimmed", fn: () => lineTrimmedReplacer(content, args.oldString, args.newString) },
      { name: "block-anchor", fn: () => blockAnchorReplacer(content, args.oldString, args.newString) },
      { name: "whitespace-normalized", fn: () => whitespaceNormalizedReplacer(content, args.oldString, args.newString) },
    ];

    for (const strategy of strategies) {
      const result = strategy.fn();
      if (result) {
        try {
          writeFileSync(filePath, result.content, "utf-8");
        } catch (err) {
          return {
            title: "Write error",
            output: `Matched but cannot write "${filePath}": ${err instanceof Error ? err.message : "permission denied"}`,
            metadata: { error: true, filePath },
          };
        }

        const diff = generateDiff(filePath, content, result.content);

        return {
          title: `Edited ${filePath} (${strategy.name}, ${result.matchCount} match${result.matchCount > 1 ? "es" : ""})`,
          output: diff,
          metadata: {
            filePath,
            strategy: strategy.name,
            matchCount: result.matchCount,
          },
        };
      }
    }

    // No strategy matched
    const occurrences = content.split(args.oldString).length - 1;
    let errorMsg = `Could not find "${args.oldString.slice(0, 100)}${args.oldString.length > 100 ? "..." : ""}" in ${filePath}.`;

    if (occurrences > 1 && !args.replaceAll) {
      errorMsg = `Found ${occurrences} occurrences of the search text. Use replaceAll: true to replace all, or provide a more specific oldString.`;
    }

    return {
      title: "Edit failed",
      output: errorMsg,
      metadata: { error: true, filePath },
    };
  },
});
