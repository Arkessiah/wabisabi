/**
 * Glob Tool
 *
 * Find files matching a glob pattern using Bun's native Glob API.
 * Security: Uses Bun.Glob (implemented in Zig) to prevent ReDoS vulnerabilities.
 */

import { statSync } from "fs";
import { resolve, isAbsolute } from "path";
import { Glob } from "bun";
import { z } from "zod";
import { defineTool, validatePathWithinProject } from "./index.js";

const MAX_RESULTS = 100;

interface FileEntry {
  path: string;
  mtime: number;
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

    // Security: Validate path is within project root
    const validation = validatePathWithinProject(searchPath, ctx.projectRoot);
    if (!validation.valid) {
      return {
        title: "Access denied",
        output: `⛔ ${validation.error}`,
        metadata: { error: true, blocked: true, path: searchPath },
      };
    }

    // Security: Use Bun.Glob (implemented in Zig) to prevent ReDoS vulnerabilities
    // Manual regex conversion is vulnerable to catastrophic backtracking
    const glob = new Glob(args.pattern);
    const results: FileEntry[] = [];

    try {
      // Scan directory with pattern
      for await (const file of glob.scan({ cwd: searchPath })) {
        if (results.length >= MAX_RESULTS) break;

        const fullPath = resolve(searchPath, file);

        try {
          const stat = statSync(fullPath);
          results.push({ path: fullPath, mtime: stat.mtimeMs });
        } catch {
          // File might have been deleted during scan
          results.push({ path: fullPath, mtime: 0 });
        }
      }
    } catch (error) {
      return {
        title: "Glob error",
        output: `Cannot execute glob pattern "${args.pattern}": ${error instanceof Error ? error.message : "unknown error"}`,
        metadata: { error: true, pattern: args.pattern },
      };
    }

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
