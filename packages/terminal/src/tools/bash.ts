/**
 * Bash Tool
 *
 * Executes shell commands with timeout and output capture.
 *
 * Security features:
 * - Environment variable allowlist (no secrets leaked)
 * - Command blocklist (prevents destructive operations)
 * - Command validation before execution
 */

import { spawn } from "child_process";
import { resolve, isAbsolute } from "path";
import { z } from "zod";
import { defineTool } from "./index.js";

const DEFAULT_TIMEOUT = 120_000; // 2 minutes

// ── Security: Environment Variable Allowlist ──────────────────

/**
 * Only allow safe, non-sensitive environment variables
 * Blocks API keys, tokens, passwords, and other secrets
 */
const ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "USER",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
  "PWD",
  "OLDPWD",
  "EDITOR",
  "VISUAL",
  "PAGER",
  "MANPATH",
  "COLORTERM",
  "FORCE_COLOR", // Allow color output
  "NODE_ENV",
  "TZ",
] as const;

function getSafeEnv(): Record<string, string> {
  const safeEnv: Record<string, string> = {};
  for (const key of ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) {
      safeEnv[key] = value;
    }
  }
  return safeEnv;
}

// ── Security: Command Blocklist ───────────────────────────────

/**
 * Block dangerous commands that could cause data loss or system damage
 */
const COMMAND_BLOCKLIST = [
  /rm\s+-rf\s+\//i, // rm -rf / (filesystem wipe)
  /rm\s+-rf\s+~\//i, // rm -rf ~/ (home directory wipe)
  /rm\s+-rf\s+\*/i, // rm -rf * (current dir wipe)
  /dd\s+.*of=/i, // dd ... of= (disk overwrite)
  /mkfs\./i, // mkfs.* (format filesystem)
  /:\(\)\{\s*:\|:&\s*\};:/i, // fork bomb
  />\/dev\/sd[a-z]/i, // write to raw disk device
  /sudo\s+rm/i, // sudo rm (elevated deletion)
  /chmod\s+-R\s+000/i, // chmod -R 000 (permission destruction)
  /chown\s+-R\s+root/i, // chown -R root (ownership hijack)
  /curl.*\|\s*sh/i, // curl | sh (remote code execution)
  /wget.*\|\s*sh/i, // wget | sh (remote code execution)
  />\s*\/dev\/null\s+2>&1.*&$/i, // background with no output (suspicious)
];

function validateCommand(command: string): { valid: boolean; error?: string } {
  for (const pattern of COMMAND_BLOCKLIST) {
    if (pattern.test(command)) {
      return {
        valid: false,
        error: `Command blocked: potentially destructive operation detected`,
      };
    }
  }
  return { valid: true };
}

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
    // Security: Validate command against blocklist
    const validation = validateCommand(args.command);
    if (!validation.valid) {
      return {
        title: `bash: ${args.command.slice(0, 60)}`,
        output: `⛔ Security Error: ${validation.error}\n\nCommand was blocked for safety.`,
        metadata: {
          command: args.command,
          blocked: true,
          error: validation.error,
        },
      };
    }

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
        env: getSafeEnv(), // Security: Use allowlisted env vars only
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
