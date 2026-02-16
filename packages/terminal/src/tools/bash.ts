/**
 * Bash Tool
 *
 * Executes shell commands with timeout and output capture.
 */

import { spawn } from "child_process";
import { resolve, isAbsolute } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

export const bashTool = defineTool("bash", {
  description:
    "Execute a shell command and return its output. Commands run in bash/zsh with a configurable timeout.",
  parameters: z.object({
    command: z.string().describe("The shell command to execute"),
    timeout: z
      .number()
      .optional()
      .describe("Timeout in milliseconds (default: 120000)"),
    workdir: z
      .string()
      .optional()
      .describe("Working directory for the command"),
    description: z
      .string()
      .optional()
      .describe("Short description of what this command does"),
  }),
  async execute(args, ctx) {
    const timeout = args.timeout || DEFAULT_TIMEOUT;
    const workdir = args.workdir
      ? isAbsolute(args.workdir)
        ? args.workdir
        : resolve(ctx.projectRoot, args.workdir)
      : ctx.projectRoot;

    const shell = process.env.SHELL || "/bin/bash";

    return new Promise<{
      title: string;
      output: string;
      metadata: Record<string, unknown>;
    }>((resolvePromise) => {
      const chunks: Buffer[] = [];
      let timedOut = false;

      const proc = spawn(shell, ["-c", args.command], {
        cwd: workdir,
        env: { ...process.env },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      }, timeout);

      proc.stdout?.on("data", (data: Buffer) => chunks.push(data));
      proc.stderr?.on("data", (data: Buffer) => chunks.push(data));

      proc.on("close", (code) => {
        clearTimeout(timer);
        const output = Buffer.concat(chunks).toString("utf-8");

        let statusMsg = "";
        if (timedOut) {
          statusMsg = `\n\nCommand timed out after ${timeout / 1000}s.`;
        } else if (code !== 0) {
          statusMsg = `\n\nCommand exited with code ${code}.`;
        }

        resolvePromise({
          title: args.description || `bash: ${args.command.slice(0, 60)}`,
          output: output + statusMsg,
          metadata: {
            command: args.command,
            exitCode: code,
            timedOut,
            workdir,
          },
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolvePromise({
          title: `bash error: ${args.command.slice(0, 60)}`,
          output: `Failed to execute command: ${err.message}`,
          metadata: {
            command: args.command,
            error: true,
            errorMessage: err.message,
          },
        });
      });

      // Handle abort signal
      if (ctx.abort) {
        ctx.abort.addEventListener("abort", () => {
          proc.kill("SIGTERM");
        });
      }
    });
  },
});
