/**
 * Daemon — Schemas & Types
 *
 * The daemon is the background process that lets work outlive the terminal
 * session (goal loops, scheduled tasks). It is **opt-in**: disabled by default,
 * and nothing starts it implicitly.
 */

import { z } from "zod";

export const DaemonConfigSchema = z.object({
  /**
   * OFF by default and on purpose. A background process that survives the
   * terminal changes what wabisabi is; the user turns it on deliberately.
   */
  enabled: z.boolean().default(false),
  /**
   * Loopback port. 0 = let the OS pick a free one (recommended: avoids
   * collisions and the port is published in the lock file anyway).
   * The daemon ALWAYS binds 127.0.0.1; there is no setting to change that.
   */
  port: z.number().int().min(0).max(65535).default(0),
  /** Rotate the log once it grows past this size, in bytes. */
  logMaxBytes: z.number().int().min(1024).default(1_048_576),
  /** How many rotated log files to keep. */
  logKeep: z.number().int().min(0).max(20).default(3),
});

export type DaemonConfig = z.infer<typeof DaemonConfigSchema>;

/**
 * Contents of `~/.wabisabi/daemon.lock`. Written with mode 0600 because it
 * carries the control token.
 */
export interface DaemonLock {
  pid: number;
  port: number;
  /** Per-instance control token. Never logged, never printed. */
  token: string;
  startedAt: number;
  version: string;
}

export interface DaemonStatus {
  running: boolean;
  /** Why there is (or is not) a usable lock. See `lock.ts` LockState. */
  lockState?: "missing" | "alive" | "dead" | "unreadable";
  pid?: number;
  port?: number;
  startedAt?: number;
  version?: string;
  uptimeMs?: number;
  /**
   * A lock exists that no live process backs. It is NOT cleared by reading;
   * the next `start` replaces it.
   */
  staleLock?: boolean;
}
