/**
 * Session Goal — persistence
 *
 * One goal per session, in `~/.wabisabi/goals/<sessionId>.json`.
 *
 * Keyed by session id, not by goal id: a session carries **one** goal at a time,
 * so the mapping is deterministic and a new goal simply replaces the file. The id
 * inside the payload is what guards against a stale loop writing over a newer goal.
 *
 * The objective text lives here rather than inside the session transcript because
 * it can be several KB and the transcript is rewritten on every turn.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { atomicWriteFileSync } from "../utils/atomic-write.js";
import { SessionGoalSchema, MAX_OBJECTIVE_CHARS, type SessionGoal } from "./schema.js";

/** Session ids come from our own generator; validate before touching the FS anyway. */
const SAFE_ID = /^[A-Za-z0-9._-]{1,128}$/;

export class GoalStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || join(homedir(), ".wabisabi", "goals");
  }

  private pathFor(sessionId: string): string | null {
    // A session id is user-influenceable in principle; never let it escape the
    // goals directory.
    if (!SAFE_ID.test(sessionId)) return null;
    return join(this.baseDir, `${sessionId}.json`);
  }

  /** Read the goal for a session, or null when there is none or it is unusable. */
  get(sessionId: string): SessionGoal | null {
    const path = this.pathFor(sessionId);
    if (!path || !existsSync(path)) return null;

    try {
      const parsed = SessionGoalSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  /**
   * Persist a goal. Returns false when the write could not happen, so a caller
   * that must not proceed unpersisted can tell — a goal the loop believes in but
   * that did not reach disk would restart from scratch after a crash.
   */
  save(goal: SessionGoal): boolean {
    const path = this.pathFor(goal.sessionId);
    if (!path) return false;

    const clamped: SessionGoal = {
      ...goal,
      objective: goal.objective.slice(0, MAX_OBJECTIVE_CHARS),
      updatedAt: goal.updatedAt,
    };

    try {
      mkdirSync(this.baseDir, { recursive: true });
      atomicWriteFileSync(path, JSON.stringify(clamped, null, 2), { encoding: "utf-8" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Write only if the stored goal still has the same id.
   * Stale-write guard: a loop that was mid-tick when the user cleared the goal
   * and started a new one must not resurrect the old state.
   */
  saveIfCurrent(goal: SessionGoal): boolean {
    const current = this.get(goal.sessionId);
    if (current && current.id !== goal.id) return false;
    return this.save(goal);
  }

  clear(sessionId: string): void {
    const path = this.pathFor(sessionId);
    if (!path) return;
    try {
      if (existsSync(path)) unlinkSync(path);
    } catch {
      // Best effort; a goal file that cannot be removed is reported by get().
    }
  }

  /** Every goal on disk. Unreadable files are skipped, never fatal. */
  list(): SessionGoal[] {
    if (!existsSync(this.baseDir)) return [];

    let entries: string[];
    try {
      entries = readdirSync(this.baseDir);
    } catch {
      return [];
    }

    const goals: SessionGoal[] = [];
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const goal = this.get(entry.slice(0, -".json".length));
      if (goal) goals.push(goal);
    }
    return goals;
  }

  /** Goals the loop should be driving. */
  listActive(): SessionGoal[] {
    return this.list().filter((g) => g.status === "active");
  }
}
