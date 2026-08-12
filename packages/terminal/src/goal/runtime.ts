/**
 * Session Goal — runtime
 *
 * Drives active goals inside the daemon. Everything that touches the world is an
 * injected dependency, so the loop itself is testable without a model, an agent
 * or a real clock.
 *
 * Ordering rule that costs data if broken: **persist the accounting and the turn
 * counter BEFORE dispatching the continuation.** A crash after the write just
 * waits for the next tick; a crash after dispatching but before writing would
 * send the same continuation twice and never count either.
 */

import type { GoalStore } from "./store.js";
import { accountTokens, decide, type AuditOutcome, type TranscriptFacts, type TurnUsage } from "./tick.js";
import type { GoalDecision, SessionGoal } from "./schema.js";

export interface GoalRuntimeDeps {
  store: GoalStore;
  /** Everything the tick may know about a session, gathered by the caller. */
  readFacts: (goal: SessionGoal) => Promise<TranscriptFacts>;
  /** Ask the independent auditor about this goal's last turn. */
  audit: (goal: SessionGoal, facts: TranscriptFacts) => Promise<AuditOutcome>;
  /** Send one continuation. Resolves when the turn has been dispatched. */
  dispatch: (goal: SessionGoal) => Promise<void>;
  /** Told when a goal reaches a terminal state, so the user hears about it. */
  onSettled?: (goal: SessionGoal, reason: string) => void;
  log?: (message: string) => void;
}

export interface TickOutcome {
  sessionId: string;
  action: GoalDecision["action"];
  reason: string;
  /** False when the decision could not be persisted; nothing was dispatched. */
  persisted: boolean;
}

/**
 * One pass over one goal.
 *
 * `decide` is pure and takes the audit as a thunk, but the audit is async, so it
 * is resolved first when the tick could possibly need it and handed in.
 */
export async function tickGoal(
  deps: GoalRuntimeDeps,
  goal: SessionGoal,
): Promise<TickOutcome> {
  const facts = await deps.readFacts(goal);

  // Fold the newest turn's usage in before deciding, so the budget check sees
  // what the last turn actually cost rather than the previous tick's figure.
  const accounted: SessionGoal = {
    ...goal,
    ...accountTokens(goal, facts.latestUsage, {
      compactionClosedSegment: facts.lastIsCompactionSummary,
    }),
  };

  // Resolving the audit eagerly would spend a model call on every tick, including
  // the ones that bail early. Probe with a thunk that records whether it was
  // needed, then re-run the decision with the real verdict only if it was.
  let auditNeeded = false;
  const probe = decide(accounted, facts, () => {
    auditNeeded = true;
    return { ok: false, reason: "probe" };
  });

  let decision: GoalDecision;
  if (auditNeeded) {
    const outcome = await deps.audit(accounted, facts);
    decision = decide(accounted, facts, () => outcome);
  } else {
    decision = probe;
  }

  if (decision.action === "wait") {
    return { sessionId: goal.sessionId, action: "wait", reason: decision.reason, persisted: true };
  }

  const next: SessionGoal = { ...decision.goal, updatedAt: Date.now() };

  // Stale-write guard: if the user replaced the goal while we were auditing, our
  // state is about a goal that no longer exists.
  const persisted = deps.store.saveIfCurrent(next);
  if (!persisted) {
    deps.log?.(`objetivo de ${goal.sessionId}: descartado, la meta cambio durante el tick`);
    return {
      sessionId: goal.sessionId,
      action: decision.action,
      reason: "meta reemplazada durante el tick",
      persisted: false,
    };
  }

  if (decision.action === "settle") {
    deps.log?.(`objetivo de ${goal.sessionId} asentado como ${decision.status}: ${decision.reason}`);
    deps.onSettled?.(next, decision.reason);
    return {
      sessionId: goal.sessionId,
      action: "settle",
      reason: decision.reason,
      persisted: true,
    };
  }

  // Persisted first, dispatched second. See the ordering note at the top.
  await deps.dispatch(next);
  deps.log?.(`objetivo de ${goal.sessionId}: continuacion ${next.turnsUsed} (${decision.reason})`);

  return {
    sessionId: goal.sessionId,
    action: "continue",
    reason: decision.reason,
    persisted: true,
  };
}

/**
 * One pass over every active goal.
 * A goal that throws is logged and skipped: one broken session must not stop the
 * others, and must not take the daemon down with it.
 */
export async function tickAll(deps: GoalRuntimeDeps): Promise<TickOutcome[]> {
  const goals = deps.store.listActive();
  const results: TickOutcome[] = [];

  for (const goal of goals) {
    try {
      results.push(await tickGoal(deps, goal));
    } catch (error) {
      deps.log?.(
        `objetivo de ${goal.sessionId}: tick fallido, se reintenta en el siguiente ciclo (${String(error)})`,
      );
      results.push({
        sessionId: goal.sessionId,
        action: "wait",
        reason: "tick fallido",
        persisted: false,
      });
    }
  }

  return results;
}

export interface GoalLoopHandle {
  stop: () => void;
  /** Run one cycle now, for tests and for a manual nudge. */
  runOnce: () => Promise<TickOutcome[]>;
}

/**
 * Start the periodic loop. Deliberately a plain interval rather than an event
 * subscription: the daemon has no live channel into a CLI that may not be
 * running, so the loop's own cadence is the only trigger it can rely on.
 */
export function startGoalLoop(
  deps: GoalRuntimeDeps,
  intervalMs = 15_000,
): GoalLoopHandle {
  let running = false;
  let stopped = false;

  const runOnce = async (): Promise<TickOutcome[]> => {
    // Never overlap cycles: a slow audit would otherwise stack ticks and could
    // dispatch two continuations for the same goal.
    if (running) return [];
    running = true;
    try {
      return await tickAll(deps);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    if (!stopped) void runOnce();
  }, intervalMs);
  // Do not hold the process open on this alone; the daemon's server does that.
  timer.unref?.();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    runOnce,
  };
}

export type { TurnUsage };
