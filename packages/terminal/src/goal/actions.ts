/**
 * Session Goal — user actions
 *
 * Create, pause, resume and clear a goal. Everything the user does to a goal
 * goes through here so the CLI and the REPL cannot drift apart.
 *
 * The daemon's loop only ever *reads* intent from disk: it never creates a goal
 * on its own. That asymmetry is deliberate — an autonomous loop that could also
 * decide what to work on would be answerable to nobody.
 */

import { randomBytes } from "crypto";
import { GoalStore } from "./store.js";
import { MAX_OBJECTIVE_CHARS, type SessionGoal, type GoalStatus } from "./schema.js";
import { resume as resumeGoal } from "./tick.js";
import type { SessionInfo } from "../session/types.js";

export interface CreateGoalInput {
  session: SessionInfo;
  objective: string;
  tokenBudget?: number;
}

export type ActionResult =
  | { ok: true; goal: SessionGoal; note?: string }
  | { ok: false; error: string };

/**
 * Baseline for token accounting: what the conversation already cost before the
 * goal existed. Without it the first tick would bill the whole prior session
 * against the goal's budget.
 */
export function baselineFrom(session: SessionInfo): number {
  const last = (session.messages ?? [])
    .filter((m) => m.role === "assistant" && m.usage)
    .slice(-1)[0];

  if (!last?.usage) return 0;
  return last.usage.promptTokens + last.usage.completionTokens + (last.usage.cacheReadTokens ?? 0);
}

export function createGoal(store: GoalStore, input: CreateGoalInput): ActionResult {
  const objective = input.objective.trim();

  if (objective.length === 0) {
    return { ok: false, error: "el objetivo esta vacio" };
  }
  if (objective.length > MAX_OBJECTIVE_CHARS) {
    // Clipping it would change what the auditor judges, silently.
    return {
      ok: false,
      error: `el objetivo supera ${MAX_OBJECTIVE_CHARS} caracteres (${objective.length})`,
    };
  }
  if (input.tokenBudget !== undefined && input.tokenBudget <= 0) {
    return { ok: false, error: "el presupuesto debe ser un entero positivo" };
  }

  const now = Date.now();
  const previous = store.get(input.session.id);

  const goal: SessionGoal = {
    // A fresh id even when replacing: it is what invalidates writes from a tick
    // that was still running against the old goal.
    id: randomBytes(8).toString("hex"),
    sessionId: input.session.id,
    objective,
    status: "active",
    ...(input.tokenBudget !== undefined ? { tokenBudget: input.tokenBudget } : {}),
    tokensUsed: 0,
    tokensBaseline: baselineFrom(input.session),
    tokensCommitted: 0,
    turnsUsed: 0,
    blockedStreak: 0,
    auditFailStreak: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (!store.save(goal)) {
    return { ok: false, error: "no se pudo guardar el objetivo" };
  }

  return {
    ok: true,
    goal,
    ...(previous ? { note: `reemplaza al objetivo anterior (${previous.status})` } : {}),
  };
}

function transition(
  store: GoalStore,
  sessionId: string,
  apply: (goal: SessionGoal) => SessionGoal | { error: string },
): ActionResult {
  const goal = store.get(sessionId);
  if (!goal) return { ok: false, error: "esta sesion no tiene objetivo" };

  const next = apply(goal);
  if ("error" in next) return { ok: false, error: next.error };

  const stamped = { ...next, updatedAt: Date.now() };
  if (!store.saveIfCurrent(stamped)) {
    return { ok: false, error: "el objetivo cambio mientras se actualizaba" };
  }
  return { ok: true, goal: stamped };
}

export function pauseGoal(store: GoalStore, sessionId: string): ActionResult {
  return transition(store, sessionId, (goal) => {
    if (goal.status === "paused") return { error: "el objetivo ya estaba pausado" };
    if (goal.status !== "active") {
      return { error: `un objetivo ${goal.status} no se puede pausar` };
    }
    return { ...goal, status: "paused" as GoalStatus, statusReason: "paused-by-user" };
  });
}

export function resumeGoalAction(store: GoalStore, sessionId: string): ActionResult {
  return transition(store, sessionId, (goal) => {
    if (goal.status === "active") return { error: "el objetivo ya estaba activo" };
    if (goal.status === "complete") {
      return { error: "un objetivo cumplido no se reanuda; crea uno nuevo" };
    }
    // Fresh tolerance: a goal the user deliberately revived should not die on
    // the same streak that stopped it.
    return resumeGoal(goal, goal.statusReason === "aborted");
  });
}

export function clearGoal(store: GoalStore, sessionId: string): { ok: boolean; error?: string } {
  if (!store.get(sessionId)) return { ok: false, error: "esta sesion no tiene objetivo" };
  store.clear(sessionId);
  return { ok: true };
}

/** One-line summary for the CLI and the REPL. */
export function describeGoal(goal: SessionGoal): string {
  const budget =
    goal.tokenBudget !== undefined
      ? ` · ${goal.tokensUsed}/${goal.tokenBudget} tokens`
      : goal.tokensUsed > 0
        ? ` · ${goal.tokensUsed} tokens`
        : "";

  return `[${goal.status}] ${goal.objective.split("\n")[0]?.slice(0, 60)} · turno ${goal.turnsUsed}${budget}`;
}
