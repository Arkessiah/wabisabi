/**
 * Glob Tool
 *
 * Find files matching a glob pattern.
 */

import { readdirSync, statSync } from "fs";
import { resolve, isAbsolute, join, relative } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";

const MAX_RESULTS = 100;
const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", "target", "vendor",
  ".idea", ".vscode", "coverage",
]);

function matchGlob(fileName: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".")
    .replace(/<<GLOBSTAR>>/g, ".*");
  return new RegExp(`^${regexStr}$`).test(fileName);
}

interface FileEntry {
  path: string;
  mtime: number;
}

function findFiles(
  dir: string,
  pattern: string,
  results: FileEntry[],
  baseDir: string,
): void {
  if (results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) {
        findFiles(fullPath, pattern, results, baseDir);
      }
    } else if (entry.isFile()) {
      const relPath = relative(baseDir, fullPath);
      if (matchGlob(relPath, pattern) || matchGlob(entry.name, pattern)) {
        try {
          const stat = statSync(fullPath);
          results.push({ path: fullPath, mtime: stat.mtimeMs });
        } catch {
          results.push({ path: fullPath, mtime: 0 });
        }
      }
    }
  }
}

export const globTool = defineTool("glob", {
  description:
    "Find files matching a glob pattern. Results are sorted by modification time (newest first).",
  parameters: z.object({
    pattern: z
      .string()
      .describe("Glob pattern to match files (e.g., '**/*.ts', 'src/**/*.js')"),
    path: z
      .string()
      .optional()
      .describe("Directory to search in (default: project root)"),
  }),
  async execute(args, ctx) {
    const searchPath = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(ctx.projectRoot, args.path)
      : ctx.projectRoot;

    const results: FileEntry[] = [];
    findFiles(searchPath, args.pattern, results, searchPath);

    // Sort by mtime descending (newest first)
    results.sort((a, b) => b.mtime - a.mtime);

    if (results.length === 0) {
      return {
        title: "No files found",
        output: `No files matching "${args.pattern}" in ${searchPath}`,
        metadata: { count: 0, truncated: false },
      };
    }

    const truncated = results.length >= MAX_RESULTS;
    const output = results.map((f) => f.path).join("\n");

    return {
      title: `glob: ${args.pattern}`,
      output:
        output +
        (truncated ? `\n\n(Results truncated at ${MAX_RESULTS} files)` : ""),
      metadata: { count: results.length, truncated },
    };
  },
});
