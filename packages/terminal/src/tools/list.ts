/**
 * List Tool
 *
 * Shows directory tree structure with sensible defaults.
 */

import { readdirSync, statSync } from "fs";
import { resolve, isAbsolute, join, basename } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";

const MAX_FILES = 100;
const DEFAULT_IGNORE = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", "target", "vendor",
  ".idea", ".vscode", "coverage", "logs", ".zig-cache",
  "bin", "obj", ".DS_Store", ".turbo", ".cache",
  "env", ".env", ".tsbuildinfo",
]);

interface TreeEntry {
  name: string;
  isDir: boolean;
  children?: TreeEntry[];
}

function buildTree(
  dir: string,
  ignore: Set<string>,
  depth: number,
  counter: { count: number },
): TreeEntry[] {
  if (depth > 5 || counter.count >= MAX_FILES) return [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const result: TreeEntry[] = [];

  for (const entry of entries) {
    if (counter.count >= MAX_FILES) break;
    if (ignore.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

    counter.count++;

    if (entry.isDirectory()) {
      const children = buildTree(
        join(dir, entry.name),
        ignore,
        depth + 1,
        counter,
      );
      result.push({ name: entry.name, isDir: true, children });
    } else {
      result.push({ name: entry.name, isDir: false });
    }
  }

  return result;
}

function renderTree(entries: TreeEntry[], prefix: string = ""): string {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    const suffix = entry.isDir ? "/" : "";
    lines.push(`${prefix}${connector}${entry.name}${suffix}`);

    if (entry.children && entry.children.length > 0) {
      lines.push(renderTree(entry.children, prefix + childPrefix));
    }
  }

  return lines.join("\n");
}

export const listTool = defineTool("list", {
  description:
    "List directory contents as a tree structure. Ignores common non-essential directories by default.",
  parameters: z.object({
    path: z
      .string()
      .optional()
      .describe("Directory path to list (default: project root)"),
    ignore: z
      .array(z.string())
      .optional()
      .describe("Additional directory names to ignore"),
  }),
  async execute(args, ctx) {
    const dirPath = args.path
      ? isAbsolute(args.path)
        ? args.path
        : resolve(ctx.projectRoot, args.path)
      : ctx.projectRoot;

    const ignoreSet = new Set([
      ...DEFAULT_IGNORE,
      ...(args.ignore || []),
    ]);

    const counter = { count: 0 };
    const tree = buildTree(dirPath, ignoreSet, 0, counter);

    if (tree.length === 0) {
      return {
        title: "Empty directory",
        output: `${dirPath}/ (empty or all entries ignored)`,
        metadata: { count: 0, truncated: false },
      };
    }

    const header = `${basename(dirPath)}/`;
    const treeOutput = renderTree(tree);
    const truncated = counter.count >= MAX_FILES;

    let output = `${header}\n${treeOutput}`;
    if (truncated) {
      output += `\n\n(Truncated at ${MAX_FILES} entries)`;
    }

    return {
      title: `list: ${dirPath}`,
      output,
      metadata: { count: counter.count, truncated },
    };
  },
});
