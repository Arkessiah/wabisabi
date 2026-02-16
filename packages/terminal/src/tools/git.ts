/**
 * Git Tool
 *
 * Provides git operations: status, diff, log, commit, branch, add.
 * Wraps git CLI commands with structured output.
 */

import { spawn } from "child_process";
import { z } from "zod";
import { defineTool } from "./index.js";

const TIMEOUT = 30_000;

function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => proc.kill("SIGTERM"), TIMEOUT);

    proc.stdout.on("data", (d: Buffer) => stdout.push(d));
    proc.stderr.on("data", (d: Buffer) => stderr.push(d));

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(stdout).toString("utf-8"),
        stderr: Buffer.concat(stderr).toString("utf-8"),
        code: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, code: 1 });
    });
  });
}

export const gitTool = defineTool("git", {
  description:
    "Run git operations: status, diff, log, commit, branch, add, checkout. Use subcommand to specify the operation.",
  parameters: z.object({
    subcommand: z
      .enum(["status", "diff", "log", "commit", "branch", "add", "checkout", "stash", "show"])
      .describe("The git operation to perform"),
    args: z
      .string()
      .optional()
      .describe("Additional arguments (e.g. file paths, branch name, commit message)"),
    message: z
      .string()
      .optional()
      .describe("Commit message (for commit subcommand)"),
  }),
  async execute(params, ctx) {
    const cwd = ctx.projectRoot;

    // Build the git command arguments
    let gitArgs: string[];

    switch (params.subcommand) {
      case "status":
        gitArgs = ["status", "--short", "--branch"];
        break;

      case "diff":
        gitArgs = ["diff"];
        if (params.args) gitArgs.push(...params.args.split(/\s+/));
        else gitArgs.push("--stat");
        break;

      case "log":
        gitArgs = [
          "log",
          "--oneline",
          "--graph",
          "--decorate",
          "-20",
        ];
        if (params.args) gitArgs.push(...params.args.split(/\s+/));
        break;

      case "commit":
        if (!params.message && !params.args) {
          return {
            title: "git commit: missing message",
            output: "Commit requires a message. Use the 'message' parameter.",
            metadata: { error: true },
          };
        }
        gitArgs = ["commit", "-m", params.message || params.args || ""];
        break;

      case "branch":
        gitArgs = ["branch"];
        if (params.args) gitArgs.push(...params.args.split(/\s+/));
        else gitArgs.push("-a", "--sort=-committerdate");
        break;

      case "add":
        if (!params.args) {
          return {
            title: "git add: missing files",
            output: "Specify files to add. Use args='.' to add all, or specific paths.",
            metadata: { error: true },
          };
        }
        gitArgs = ["add", ...params.args.split(/\s+/)];
        break;

      case "checkout":
        if (!params.args) {
          return {
            title: "git checkout: missing target",
            output: "Specify a branch name or file path.",
            metadata: { error: true },
          };
        }
        gitArgs = ["checkout", ...params.args.split(/\s+/)];
        break;

      case "stash":
        gitArgs = ["stash"];
        if (params.args) gitArgs.push(...params.args.split(/\s+/));
        break;

      case "show":
        gitArgs = ["show", "--stat"];
        if (params.args) gitArgs.push(...params.args.split(/\s+/));
        break;

      default:
        return {
          title: "git: unknown subcommand",
          output: `Unknown subcommand: ${params.subcommand}`,
          metadata: { error: true },
        };
    }

    const result = await runGit(gitArgs, cwd);
    const output = (result.stdout + result.stderr).trim();

    return {
      title: `git ${params.subcommand}${result.code !== 0 ? " (failed)" : ""}`,
      output: output || "(no output)",
      metadata: {
        subcommand: params.subcommand,
        exitCode: result.code,
        error: result.code !== 0,
      },
    };
  },
});
