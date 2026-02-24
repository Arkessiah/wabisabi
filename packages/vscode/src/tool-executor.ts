/**
 * Tool Executor
 *
 * Executes LLM tool calls in the VS Code extension host context.
 * Implements: read, grep, glob, list, bash, edit, write.
 * Agent-specific tool access (BUILD gets all, PLAN/SEARCH get read-only).
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { execSync } from "child_process";
import type { ToolSpec } from "./llm-client";

// ── Types ────────────────────────────────────────────────────────

export interface ToolResult {
  title: string;
  output: string;
}

type AgentType = "build" | "plan" | "search";

// ── Path security ────────────────────────────────────────────────

function validatePath(filePath: string, workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot, filePath);
  if (!resolved.startsWith(workspaceRoot)) {
    throw new Error(`Path outside workspace: ${filePath}`);
  }
  return resolved;
}

function addLineNumbers(content: string, offset = 0): string {
  return content
    .split("\n")
    .map((line, i) => `${String(i + 1 + offset).padStart(6)}\u2192${line}`)
    .join("\n");
}

// ── ToolExecutor ─────────────────────────────────────────────────

export class ToolExecutor {
  constructor(private workspaceRoot: string) {}

  async execute(name: string, argsJson: string): Promise<ToolResult> {
    let args: any;
    try {
      args = JSON.parse(argsJson);
    } catch {
      return { title: name, output: `Error: invalid JSON arguments` };
    }

    try {
      switch (name) {
        case "read": return await this.toolRead(args);
        case "grep": return await this.toolGrep(args);
        case "glob": return await this.toolGlob(args);
        case "list": return await this.toolList(args);
        case "bash": return await this.toolBash(args);
        case "edit": return await this.toolEdit(args);
        case "write": return await this.toolWrite(args);
        default: return { title: name, output: `Unknown tool: ${name}` };
      }
    } catch (err: any) {
      return { title: name, output: `Error: ${err.message}` };
    }
  }

  getToolSpecs(agent: AgentType): ToolSpec[] {
    const readOnly = [TOOL_READ, TOOL_GREP, TOOL_GLOB, TOOL_LIST];
    if (agent === "plan" || agent === "search") return readOnly;
    return [...readOnly, TOOL_BASH, TOOL_EDIT, TOOL_WRITE];
  }

  // ── Tool implementations ────────────────────────────────────

  private async toolRead(args: { filePath: string; offset?: number; limit?: number }): Promise<ToolResult> {
    const resolved = validatePath(args.filePath, this.workspaceRoot);
    if (!fs.existsSync(resolved)) {
      return { title: "read", output: `File not found: ${args.filePath}` };
    }
    const content = fs.readFileSync(resolved, "utf-8");
    const lines = content.split("\n");
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 2000;
    const slice = lines.slice(offset, offset + limit);
    const numbered = addLineNumbers(slice.join("\n"), offset);
    const truncated = lines.length > offset + limit ? `\n... (${lines.length - offset - limit} more lines)` : "";
    return { title: `read ${args.filePath}`, output: numbered + truncated };
  }

  private async toolGrep(args: { pattern: string; path?: string; include?: string }): Promise<ToolResult> {
    const searchPath = args.path
      ? validatePath(args.path, this.workspaceRoot)
      : this.workspaceRoot;

    try {
      const rgArgs = [args.pattern, searchPath, "-n", "--max-count=50", "--color=never"];
      if (args.include) {
        rgArgs.push("--glob", args.include);
      }
      const result = execSync(`rg ${rgArgs.map(a => `'${a}'`).join(" ")}`, {
        cwd: this.workspaceRoot,
        timeout: 10000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      });
      return { title: `grep "${args.pattern}"`, output: result.trim() || "No matches" };
    } catch (err: any) {
      if (err.status === 1) return { title: `grep "${args.pattern}"`, output: "No matches" };
      // Fallback: simple Node.js grep
      return this.fallbackGrep(args.pattern, searchPath);
    }
  }

  private fallbackGrep(pattern: string, dir: string): ToolResult {
    const regex = new RegExp(pattern, "gi");
    const results: string[] = [];
    const walk = (d: string) => {
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        try {
          const content = fs.readFileSync(full, "utf-8");
          content.split("\n").forEach((line, i) => {
            if (regex.test(line)) {
              results.push(`${path.relative(this.workspaceRoot, full)}:${i + 1}:${line.trim()}`);
            }
          });
        } catch { /* binary or unreadable */ }
        if (results.length >= 50) return;
      }
    };
    walk(dir);
    return { title: `grep "${pattern}"`, output: results.join("\n") || "No matches" };
  }

  private async toolGlob(args: { pattern: string; path?: string }): Promise<ToolResult> {
    const searchPath = args.path
      ? validatePath(args.path, this.workspaceRoot)
      : this.workspaceRoot;

    const results: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 10 || results.length >= 200) return;
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(this.workspaceRoot, full);
          if (minimatch(rel, args.pattern)) {
            results.push(rel);
          }
          if (entry.isDirectory()) walk(full, depth + 1);
        }
      } catch { /* permission denied */ }
    };
    walk(searchPath, 0);
    return { title: `glob "${args.pattern}"`, output: results.join("\n") || "No matches" };
  }

  private async toolList(args: { path?: string; depth?: number }): Promise<ToolResult> {
    const targetPath = args.path
      ? validatePath(args.path, this.workspaceRoot)
      : this.workspaceRoot;
    const maxDepth = args.depth ?? 3;

    const lines: string[] = [];
    const walk = (dir: string, prefix: string, depth: number) => {
      if (depth > maxDepth) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
          .filter(e => !e.name.startsWith(".") && e.name !== "node_modules")
          .sort((a, b) => a.name.localeCompare(b.name));
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          const isLast = i === entries.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const nextPrefix = isLast ? "    " : "│   ";
          lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name), prefix + nextPrefix, depth + 1);
          }
        }
      } catch { /* permission denied */ }
    };
    walk(targetPath, "", 0);
    return { title: `list ${args.path || "."}`, output: lines.join("\n") || "(empty)" };
  }

  private async toolBash(args: { command: string }): Promise<ToolResult> {
    // Safety: ask VS Code confirmation for destructive commands
    const dangerous = /\b(rm\s+-rf|dd\s+|mkfs|format|drop\s+|delete\s+from)\b/i;
    if (dangerous.test(args.command)) {
      const choice = await vscode.window.showWarningMessage(
        `WabiSabi wants to run: ${args.command}`,
        { modal: true },
        "Allow",
      );
      if (choice !== "Allow") {
        return { title: "bash", output: "Command rejected by user" };
      }
    }

    try {
      const result = execSync(args.command, {
        cwd: this.workspaceRoot,
        timeout: 30000,
        encoding: "utf-8",
        maxBuffer: 2 * 1024 * 1024,
      });
      return { title: `bash: ${args.command.substring(0, 60)}`, output: result.trim() };
    } catch (err: any) {
      const output = err.stdout || err.stderr || err.message;
      return { title: `bash: ${args.command.substring(0, 60)}`, output: `Exit ${err.status ?? 1}\n${output}` };
    }
  }

  private async toolEdit(args: { filePath: string; search: string; replace: string }): Promise<ToolResult> {
    const resolved = validatePath(args.filePath, this.workspaceRoot);
    if (!fs.existsSync(resolved)) {
      return { title: "edit", output: `File not found: ${args.filePath}` };
    }
    const content = fs.readFileSync(resolved, "utf-8");
    if (!content.includes(args.search)) {
      return { title: "edit", output: `Search string not found in ${args.filePath}` };
    }
    const updated = content.replace(args.search, args.replace);
    fs.writeFileSync(resolved, updated, "utf-8");
    return { title: `edit ${args.filePath}`, output: `Replaced ${args.search.length} chars` };
  }

  private async toolWrite(args: { filePath: string; content: string }): Promise<ToolResult> {
    const resolved = validatePath(args.filePath, this.workspaceRoot);
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolved, args.content, "utf-8");
    return { title: `write ${args.filePath}`, output: `Written ${args.content.length} bytes` };
  }
}

// ── Simple minimatch for glob patterns ───────────────────────────

function minimatch(filepath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regex}$`).test(filepath);
}

// ── Tool Specs (OpenAI function calling format) ──────────────────

const TOOL_READ: ToolSpec = {
  type: "function",
  function: {
    name: "read",
    description: "Read a file's contents with line numbers. Use offset/limit for large files.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file (relative to workspace)" },
        offset: { type: "number", description: "Starting line (0-indexed)" },
        limit: { type: "number", description: "Max lines to read (default 2000)" },
      },
      required: ["filePath"],
    },
  },
};

const TOOL_GREP: ToolSpec = {
  type: "function",
  function: {
    name: "grep",
    description: "Search file contents with regex pattern. Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex pattern to search for" },
        path: { type: "string", description: "Directory or file to search in" },
        include: { type: "string", description: "Glob pattern to filter files (e.g. '*.ts')" },
      },
      required: ["pattern"],
    },
  },
};

const TOOL_GLOB: ToolSpec = {
  type: "function",
  function: {
    name: "glob",
    description: "Find files matching a glob pattern (e.g. '**/*.ts', 'src/**/*.test.*')",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern" },
        path: { type: "string", description: "Directory to search in" },
      },
      required: ["pattern"],
    },
  },
};

const TOOL_LIST: ToolSpec = {
  type: "function",
  function: {
    name: "list",
    description: "Show directory tree structure",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path" },
        depth: { type: "number", description: "Max depth (default 3)" },
      },
    },
  },
};

const TOOL_BASH: ToolSpec = {
  type: "function",
  function: {
    name: "bash",
    description: "Run a shell command. Use for build, test, install, git, etc.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
};

const TOOL_EDIT: ToolSpec = {
  type: "function",
  function: {
    name: "edit",
    description: "Search and replace text in a file. The search string must be an exact match.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file" },
        search: { type: "string", description: "Exact text to find" },
        replace: { type: "string", description: "Replacement text" },
      },
      required: ["filePath", "search", "replace"],
    },
  },
};

const TOOL_WRITE: ToolSpec = {
  type: "function",
  function: {
    name: "write",
    description: "Create or overwrite a file with the given content.",
    parameters: {
      type: "object",
      properties: {
        filePath: { type: "string", description: "Path to the file" },
        content: { type: "string", description: "File content" },
      },
      required: ["filePath", "content"],
    },
  },
};
