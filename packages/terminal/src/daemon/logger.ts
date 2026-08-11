/**
 * Daemon logger
 *
 * Append-only log at `~/.wabisabi/logs/daemon.log`, rotated by size.
 * A detached process has no terminal, so this file is the only way to find out
 * what it did — but an unbounded log on a process meant to run for weeks is a
 * disk-filling bug, hence rotation.
 *
 * Never log secrets: not the control token, not credentials, not user content.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "fs";
import { join } from "path";
import { homedir } from "os";

export type LogLevel = "info" | "warn" | "error";

export function defaultLogDir(): string {
  return join(homedir(), ".wabisabi", "logs");
}

export function defaultLogPath(): string {
  return join(defaultLogDir(), "daemon.log");
}

export class DaemonLogger {
  constructor(
    private logPath: string = defaultLogPath(),
    private maxBytes: number = 1_048_576,
    private keep: number = 3,
  ) {}

  /** Write one line. Never throws: logging must not take the daemon down. */
  log(level: LogLevel, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;
    try {
      mkdirSync(join(this.logPath, ".."), { recursive: true });
      this.rotateIfNeeded(line.length);
      appendFileSync(this.logPath, line, "utf-8");
    } catch {
      // A daemon that cannot write its log still has to keep working.
    }
  }

  info(message: string): void {
    this.log("info", message);
  }

  warn(message: string): void {
    this.log("warn", message);
  }

  error(message: string): void {
    this.log("error", message);
  }

  /** Rotate when the next line would push the file past the limit. */
  private rotateIfNeeded(incomingBytes: number): void {
    if (!existsSync(this.logPath)) return;

    let size: number;
    try {
      size = statSync(this.logPath).size;
    } catch {
      return;
    }
    if (size + incomingBytes <= this.maxBytes) return;

    // Drop the oldest, shift the rest down: daemon.log.2 -> .3, .1 -> .2, log -> .1
    if (this.keep <= 0) {
      try {
        unlinkSync(this.logPath);
      } catch {
        /* ignore */
      }
      return;
    }

    try {
      const oldest = `${this.logPath}.${this.keep}`;
      if (existsSync(oldest)) unlinkSync(oldest);

      for (let i = this.keep - 1; i >= 1; i--) {
        const from = `${this.logPath}.${i}`;
        if (existsSync(from)) renameSync(from, `${this.logPath}.${i + 1}`);
      }

      renameSync(this.logPath, `${this.logPath}.1`);
    } catch {
      // If rotation fails we keep appending: a big log beats losing the trail.
    }
  }
}
