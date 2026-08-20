/**
 * Worktree isolation for goals that write
 *
 * A goal running with `autonomousTools: inherit` can edit files and run shell
 * commands with nobody watching. Doing that **in the user's working tree** means
 * waking up to a repo someone else has been editing, mixed with your own
 * uncommitted work, with no clean way to tell the two apart or undo one.
 *
 * So a writing goal gets its own `git worktree`: same repository and history,
 * separate working directory and branch. The result is reviewable as a diff and
 * discardable in one command. That is the difference between a mode nobody dares
 * enable and one worth using.
 *
 * The consequence, accepted deliberately: **`inherit` outside a git repository is
 * refused**. Without a repo there is no isolation and no undo, and an unattended
 * loop that writes into an unversioned directory is not something to offer.
 */

import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const GIT_TIMEOUT = 30_000;

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

export function runGit(args: string[], cwd: string, timeout = GIT_TIMEOUT): Promise<GitResult> {
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => proc.kill("SIGTERM"), timeout);

    proc.stdout.on("data", (d: Buffer) => out.push(d));
    proc.stderr.on("data", (d: Buffer) => err.push(d));
    proc.on("error", () =>
      resolve({ stdout: "", stderr: "no se pudo ejecutar git", code: 127 }),
    );
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(out).toString("utf-8"),
        stderr: Buffer.concat(err).toString("utf-8"),
        code: code ?? 1,
      });
    });
  });
}

export function worktreeRoot(): string {
  return join(homedir(), ".wabisabi", "worktrees");
}

/** Branch and directory names derived from the session, so they are stable. */
export function worktreeNames(sessionId: string): { dir: string; branch: string } {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 64);
  return { dir: join(worktreeRoot(), safe), branch: `wabisabi/goal-${safe}` };
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const res = await runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  return res.code === 0 && res.stdout.trim() === "true";
}

export type EnsureResult =
  | { ok: true; path: string; branch: string; created: boolean; baseCommit: string }
  | { ok: false; error: string };

/**
 * Get the goal's worktree, creating it if needed.
 *
 * Branches from **HEAD**, not from the dirty working tree: the goal starts from a
 * committed, known state. The user's uncommitted work is therefore NOT visible to
 * the goal — which is the point (it cannot damage what it cannot see), but it is
 * surprising enough that callers should say so.
 */
export async function ensureWorktree(projectRoot: string, sessionId: string): Promise<EnsureResult> {
  if (!(await isGitRepo(projectRoot))) {
    return {
      ok: false,
      error:
        "el proyecto no es un repositorio git: sin aislamiento no hay forma de revisar ni deshacer " +
        "lo que escriba un objetivo autonomo",
    };
  }

  const head = await runGit(["rev-parse", "HEAD"], projectRoot);
  if (head.code !== 0) {
    return { ok: false, error: "el repositorio no tiene commits todavia" };
  }
  const baseCommit = head.stdout.trim();

  const { dir, branch } = worktreeNames(sessionId);

  // Already there and still registered: reuse it, so a goal keeps its progress
  // across ticks and across daemon restarts.
  if (existsSync(dir)) {
    const list = await runGit(["worktree", "list", "--porcelain"], projectRoot);
    if (list.stdout.includes(dir)) {
      return { ok: true, path: dir, branch, created: false, baseCommit };
    }
    // Directory left behind without a registration: git refuses to reuse it.
    return {
      ok: false,
      error: `existe ${dir} pero git no lo reconoce como worktree; borralo a mano para continuar`,
    };
  }

  const add = await runGit(["worktree", "add", "-b", branch, dir, baseCommit], projectRoot);
  if (add.code !== 0) {
    // A leftover branch from a previous goal on the same session is the common case.
    const retry = await runGit(["worktree", "add", dir, branch], projectRoot);
    if (retry.code !== 0) {
      return { ok: false, error: `no se pudo crear el worktree: ${add.stderr.trim() || add.stdout.trim()}` };
    }
  }

  return { ok: true, path: dir, branch, created: true, baseCommit };
}

export interface WorktreeChanges {
  /** Files touched, as `git status --porcelain` reports them. */
  files: string[];
  /** True when the goal has written nothing at all. */
  clean: boolean;
  diff: string;
}

/**
 * What the goal has done, for the user to review.
 *
 * `git diff HEAD` does NOT show untracked files, so a goal whose whole
 * contribution is a new file would be reported as an empty diff — the opposite
 * of what a review needs. `add -N` (intent-to-add) registers the new paths so
 * they appear in the diff; it touches the worktree's index but stages no
 * content, and the worktree is disposable anyway.
 */
export async function worktreeChanges(path: string, maxDiffChars = 20_000): Promise<WorktreeChanges> {
  const status = await runGit(["status", "--porcelain", "-uall"], path);
  const files = status.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  await runGit(["add", "-N", "-A"], path);
  const diff = await runGit(["diff", "HEAD"], path);
  const text = diff.stdout;

  return {
    files,
    clean: files.length === 0,
    diff: text.length > maxDiffChars ? text.slice(0, maxDiffChars) + "\n[...diff truncado]" : text,
  };
}

/**
 * Remove the worktree.
 * `force` is required when it has uncommitted changes — deleting a goal's work
 * should be deliberate, so the default refuses.
 */
export async function removeWorktree(
  projectRoot: string,
  sessionId: string,
  options: { force?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const { dir, branch } = worktreeNames(sessionId);
  if (!existsSync(dir)) return { ok: true };

  const args = ["worktree", "remove", dir];
  if (options.force) args.push("--force");

  const res = await runGit(args, projectRoot);
  if (res.code !== 0) {
    return { ok: false, error: res.stderr.trim() || res.stdout.trim() };
  }

  // Best effort: the branch keeps the history if the user wants it back.
  if (options.force) await runGit(["branch", "-D", branch], projectRoot);

  return { ok: true };
}
