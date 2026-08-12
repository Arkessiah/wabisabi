/**
 * Daemon lock file
 *
 * `~/.wabisabi/daemon.lock` is the single source of truth for "is a daemon
 * running, and how do I talk to it".
 *
 * The rule that matters: **a lock whose process is dead is stale, not a running
 * daemon.** A crashed or SIGKILLed daemon leaves its lock behind; treating that
 * as "already running" would make the daemon unstartable until the user deletes
 * a file they do not know about. Every read therefore verifies the PID is alive.
 */

import { existsSync, readFileSync, unlinkSync, mkdirSync, chmodSync } from "fs";
import { atomicWriteFileSync } from "../utils/atomic-write.js";
import { join, dirname } from "path";
import { homedir } from "os";
import { randomBytes } from "crypto";
import type { DaemonLock } from "./schema.js";

/** Owner read/write only: the lock carries the control token. */
const LOCK_MODE = 0o600;

export function defaultLockPath(): string {
  return join(homedir(), ".wabisabi", "daemon.lock");
}

/** Cryptographically random per-instance control token. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Whether a PID belongs to a live process.
 * `kill(pid, 0)` does not signal; it only probes. EPERM means the process
 * exists but belongs to another user — alive for our purposes.
 */
export function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function parseLock(raw: string): DaemonLock | null {
  try {
    const data = JSON.parse(raw) as Partial<DaemonLock>;
    if (
      typeof data.pid !== "number" ||
      typeof data.port !== "number" ||
      typeof data.token !== "string" ||
      !data.token
    ) {
      return null;
    }
    return {
      pid: data.pid,
      port: data.port,
      token: data.token,
      startedAt: typeof data.startedAt === "number" ? data.startedAt : 0,
      version: typeof data.version === "string" ? data.version : "unknown",
    };
  } catch {
    return null;
  }
}

/**
 * Why there is no usable lock. Kept explicit because **"cannot tell" must never
 * collapse into "dead"**: clearing a lock we merely failed to read could delete
 * the record of a live daemon and let a second one start beside it.
 */
export type LockState =
  /** No lock file at all. */
  | "missing"
  /** Lock read and its process answers. */
  | "alive"
  /** Lock read and its PID is provably gone. Safe to replace. */
  | "dead"
  /** Unreadable or malformed. Provably nothing; do NOT infer death. */
  | "unreadable";

export interface LockReadResult {
  /** The lock, only when its process is alive. */
  lock: DaemonLock | null;
  state: LockState;
  /** Kept for callers that only need "there is something to replace". */
  stale: boolean;
}

/**
 * Read the lock. A malformed lock is treated as stale rather than as an error:
 * a truncated write must not wedge the daemon permanently.
 */
export function readLock(lockPath: string = defaultLockPath()): LockReadResult {
  if (!existsSync(lockPath)) return { lock: null, state: "missing", stale: false };

  let raw: string;
  try {
    raw = readFileSync(lockPath, "utf-8");
  } catch {
    return { lock: null, state: "unreadable", stale: true };
  }

  const lock = parseLock(raw);
  if (!lock) return { lock: null, state: "unreadable", stale: true };
  if (!isProcessAlive(lock.pid)) return { lock: null, state: "dead", stale: true };

  return { lock, state: "alive", stale: false };
}

/** Remove the lock file. Never throws: a missing lock is the desired state. */
export function clearLock(lockPath: string = defaultLockPath()): void {
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch {
    // Best effort: an unremovable lock is reported by readLock as stale anyway.
  }
}

/**
 * Write the lock with owner-only permissions.
 * chmod is applied after the write because the umask can loosen the mode given
 * to writeFileSync.
 */
export function writeLock(lock: DaemonLock, lockPath: string = defaultLockPath()): void {
  mkdirSync(dirname(lockPath), { recursive: true });
  // Atomic (temp + fsync + rename): a reader must never observe a half-written
  // lock. A partial read would look malformed, an observer would call it stale,
  // and a second daemon would start alongside the live one.
  atomicWriteFileSync(lockPath, JSON.stringify(lock, null, 2), {
    encoding: "utf-8",
    mode: LOCK_MODE,
  });
  try {
    chmodSync(lockPath, LOCK_MODE);
  } catch {
    // Filesystems without POSIX modes (some Windows setups) cannot enforce this.
  }
}

/**
 * Claim the lock for this process.
 * Returns the existing lock when a LIVE daemon already holds it, so the caller
 * refuses to start a second instance. A stale lock is cleared and the claim
 * proceeds.
 */
export function claimLock(
  lock: Omit<DaemonLock, "startedAt"> & { startedAt?: number },
  lockPath: string = defaultLockPath(),
): { claimed: true; lock: DaemonLock } | { claimed: false; heldBy: DaemonLock } {
  const current = readLock(lockPath);
  if (current.lock) return { claimed: false, heldBy: current.lock };
  if (current.stale) clearLock(lockPath);

  const full: DaemonLock = { ...lock, startedAt: lock.startedAt ?? Date.now() };
  writeLock(full, lockPath);
  return { claimed: true, lock: full };
}
