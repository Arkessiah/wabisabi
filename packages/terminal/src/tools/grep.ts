/**
 * Grep Tool
 *
 * Searches file contents using ripgrep (with fallback to Node.js regex).
 */

import { execSync } from "child_process";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, isAbsolute, join, relative } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";

const MAX_MATCHES = 100;

function hasRipgrep(): boolean {
  try {
    execSync("which rg", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function grepWithRipgrep(
  pattern: string,
  searchPath: string,
  include?: string,
): string {
  const args = [
    "rg",
    "-nH",
    "--no-messages",
    "--hidden",
    "--max-count",
    String(MAX_MATCHES),
  ];

  if (include) {
    args.push("--glob", include);
  }

  args.push("--", pattern, searchPath);

  try {
    const output = execSync(args.join(" "), {
      maxBuffer: 1024 * 1024,
      encoding: "utf-8",
    });
    return output;
  } catch (error: any) {
    // Exit code 1 = no matches (not an error)
    if (error.status === 1) return "";
    // Exit code 2 = errors but might have partial output
    if (error.stdout) return error.stdout;
    return "";
  }
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", "target", "vendor",
  ".idea", ".vscode", "coverage",
]);

function grepFallback(
  pattern: string,
  searchPath: string,
  include?: string,
): string {
  const regex = new RegExp(pattern, "g");
  const results: string[] = [];
  const includeRegex = include
    ? new RegExp(include.replace(/\*/g, ".*").replace(/\?/g, "."))
    : null;

  function walk(dir: string): void {
    if (results.length >= MAX_MATCHES) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= MAX_MATCHES) break;

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          walk(join(dir, entry.name));
        }
      } else if (entry.isFile()) {
        const filePath = join(dir, entry.name);
        if (includeRegex && !includeRegex.test(entry.name)) continue;

        try {
          const content = readFileSync(filePath, "utf-8");
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push(`${filePath}:${i + 1}:${lines[i]}`);
              if (results.length >= MAX_MATCHES) break;
            }
            regex.lastIndex = 0;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walk(searchPath);
  return results.join("\n");
}

export const grepTool = defineTool("grep", {
  description:
    "Search file contents for a regex pattern. Uses ripgrep if available, otherwise falls back to recursive regex search.",
  parameters: z.object({
    pattern: z.string().describe("Regex pattern to search for"),
    path: z
      .string()
      .optional()
      .describe("Directory to search in (default: project root)"),
    include: z
      .string()
      .optional()
      .describe("Glob pattern to filter files (e.g., '*.ts', '*.js')"),
  }),
  async execute(args, ctx) {
    const searchPath = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(ctx.projectRoot, args.path)
      : ctx.projectRoot;

    // Validate regex before running
    try {
      new RegExp(args.pattern);
    } catch (err) {
      return {
        title: "Invalid pattern",
        output: `Invalid regex pattern "${args.pattern}": ${err instanceof Error ? err.message : "syntax error"}`,
        metadata: { error: true, matches: 0, truncated: false },
      };
    }

    const useRg = hasRipgrep();
    const rawOutput = useRg
      ? grepWithRipgrep(args.pattern, searchPath, args.include)
      : grepFallback(args.pattern, searchPath, args.include);

    if (!rawOutput.trim()) {
      return {
        title: "No matches",
        output: `No matches found for pattern "${args.pattern}" in ${searchPath}`,
        metadata: { matches: 0, truncated: false },
      };
    }

    // Parse and group results by file
    const lines = rawOutput.trim().split("\n");
    const byFile = new Map<string, string[]>();

    for (const line of lines) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      const file = line.slice(0, colonIdx);
      const rest = line.slice(colonIdx + 1);
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file)!.push(rest);
    }

    const parts: string[] = [`Found ${lines.length} matches\n`];
    for (const [file, matches] of byFile) {
      const relPath = relative(ctx.projectRoot, file) || file;
      parts.push(`${relPath}:`);
      for (const match of matches) {
        parts.push(`  ${match}`);
      }
      parts.push("");
    }

    const truncated = lines.length >= MAX_MATCHES;
    if (truncated) {
      parts.push(`\n(Results truncated at ${MAX_MATCHES} matches)`);
    }

    return {
      title: `grep: ${args.pattern}`,
      output: parts.join("\n"),
      metadata: { matches: lines.length, truncated, engine: useRg ? "ripgrep" : "fallback" },
    };
  },
});
