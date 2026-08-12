/**
 * Session Goal — decision logic
 *
 * Pure functions. No I/O, no clock beyond what is passed in, no agent, no model.
 * Everything subtle about goal loops lives here so it can be tested exhaustively:
 * the order of the terminal checks, the streaks, what a compaction means, and
 * what an unavailable auditor is allowed to do.
 */

import {
  AUDIT_FAIL_LIMIT,
  BLOCKED_STREAK_LIMIT,
  MAX_AUTO_TURNS,
  type AuditResult,
  type GoalDecision,
  type SessionGoal,
} from "./schema.js";

/** Token usage of one completed assistant turn, as the provider reported it. */
export interface TurnUsage {
  input: number;
  output: number;
  /** Tokens served from cache. Part of what the turn actually cost. */
  cacheRead?: number;
}

/**
 * What the loop can observe about the conversation right now.
 * Deliberately a plain snapshot: the tick must not go and fetch anything.
 */
export interface TranscriptFacts {
  /** The session has an assistant reply to audit at all. */
  hasAssistantTurn: boolean;
  /** Trailing user message or an unfinished reply: the turn is still in flight. */
  quiescent: boolean;
  /** The last assistant message is a compaction summary, not real work. */
  lastIsCompactionSummary: boolean;
  /** The last turn ended in a provider/tool error. */
  lastTurnErrored: boolean;
  /** The user explicitly aborted the last turn. */
  lastTurnAborted: boolean;
  /** Usage of the newest completed assistant turn, when the provider gave it. */
  latestUsage?: TurnUsage;
}

/**
 * Cost of a turn as a SNAPSHOT, not a sum.
 *
 * Earlier turns' inputs and outputs fold into the next turn's cache, so the
 * latest snapshot already prices the whole run. Summing across messages
 * double-counts.
 */
export function turnCost(usage: TurnUsage): number {
  return usage.input + usage.output + (usage.cacheRead ?? 0);
}

/**
 * Tokens attributable to the goal, given the newest snapshot.
 *
 * Segmented because compaction breaks the snapshot chain: the summary turn read
 * the whole context, so its snapshot prices the compaction itself and closes the
 * segment; the next segment restarts from a zero baseline.
 *
 * Kept monotonic: an unflagged context shrink must never walk the budget backwards.
 */
export function accountTokens(
  goal: SessionGoal,
  usage: TurnUsage | undefined,
  opts: { compactionClosedSegment?: boolean } = {},
): { tokensUsed: number; tokensCommitted: number; tokensBaseline: number } {
  if (!usage) {
    return {
      tokensUsed: goal.tokensUsed,
      tokensCommitted: goal.tokensCommitted,
      tokensBaseline: goal.tokensBaseline,
    };
  }

  const snapshot = turnCost(usage);

  if (opts.compactionClosedSegment) {
    // The summary's own snapshot is the price of the segment that just ended.
    const committed = goal.tokensCommitted + Math.max(0, snapshot - goal.tokensBaseline);
    return {
      tokensUsed: Math.max(goal.tokensUsed, committed),
      tokensCommitted: committed,
      tokensBaseline: 0,
    };
  }

  const segment = Math.max(0, snapshot - goal.tokensBaseline);
  const used = goal.tokensCommitted + segment;

  return {
    // Monotonic on purpose: never let the budget move backwards.
    tokensUsed: Math.max(goal.tokensUsed, used),
    tokensCommitted: goal.tokensCommitted,
    tokensBaseline: goal.tokensBaseline,
  };
}

/** Outcome of asking the auditor, including the case where we could not ask. */
export type AuditOutcome =
  | { ok: true; result: AuditResult }
  | { ok: false; reason: string };

/**
 * Decide what the loop does now.
 *
 * Order matters and is cheapest-first: anything that settles the goal without
 * spending a model call is checked before the audit.
 */
export function decide(
  goal: SessionGoal,
  facts: TranscriptFacts,
  audit: () => AuditOutcome,
): GoalDecision {
  // --- Not our turn to act -------------------------------------------------
  if (goal.status !== "active") {
    return { action: "wait", reason: `objetivo en estado ${goal.status}`, goal };
  }
  if (!facts.hasAssistantTurn) {
    return { action: "wait", reason: "aun no hay respuesta que auditar", goal };
  }
  if (!facts.quiescent) {
    return { action: "wait", reason: "hay un turno en curso", goal };
  }

  // A user abort PAUSES; it never blocks. "Stop" must mean stop on both axes,
  // and the loop must not send a continuation over an explicit stop.
  if (facts.lastTurnAborted) {
    return {
      action: "settle",
      status: "paused",
      reason: "el usuario aborto el turno",
      goal: { ...goal, status: "paused", statusReason: "aborted" },
    };
  }

  // --- Hard stops, cheapest first -----------------------------------------
  if (facts.lastTurnErrored) {
    return settleBlocked(goal, "el ultimo turno termino en error");
  }

  if (goal.tokenBudget !== undefined && goal.tokensUsed >= goal.tokenBudget) {
    return {
      action: "settle",
      status: "budgetLimited",
      reason: `presupuesto agotado (${goal.tokensUsed}/${goal.tokenBudget})`,
      goal: { ...goal, status: "budgetLimited", statusReason: "budget" },
    };
  }

  if (goal.turnsUsed >= MAX_AUTO_TURNS) {
    return settleBlocked(goal, `tope de ${MAX_AUTO_TURNS} continuaciones automaticas`);
  }

  // --- Never judge a retelling --------------------------------------------
  // Running into the context window mid-work is by definition "in progress".
  // The summary is not evidence of anything, so it must not be audited.
  if (facts.lastIsCompactionSummary) {
    return {
      action: "continue",
      reason: "post-compaction",
      goal: { ...goal, turnsUsed: goal.turnsUsed + 1, auditFailStreak: 0 },
    };
  }

  // --- The audit is the only termination authority besides the hard stops --
  const outcome = audit();

  if (!outcome.ok) {
    const streak = goal.auditFailStreak + 1;
    if (streak >= AUDIT_FAIL_LIMIT) {
      // A dead auditor must never drive the loop blind. Settling resets the
      // streak so a Resume gets fresh tolerance.
      return settleBlocked(goal, `auditoria no disponible (${outcome.reason})`, {
        auditFailStreak: 0,
      });
    }
    // Tolerate exactly one unaudited continuation.
    return {
      action: "continue",
      reason: "audited",
      goal: { ...goal, turnsUsed: goal.turnsUsed + 1, auditFailStreak: streak },
    };
  }

  const { verdict, note } = outcome.result;

  if (verdict === "complete") {
    return {
      action: "settle",
      status: "complete",
      reason: note || "objetivo cumplido",
      goal: { ...goal, status: "complete", note, statusReason: "complete", auditFailStreak: 0 },
    };
  }

  if (verdict === "blocked") {
    const streak = goal.blockedStreak + 1;
    if (streak >= BLOCKED_STREAK_LIMIT) {
      return settleBlocked(goal, note || "bloqueado", { blockedStreak: 0, note });
    }
    // One snag must not end a goal: keep going and let the streak build.
    return {
      action: "continue",
      reason: "audited",
      goal: {
        ...goal,
        turnsUsed: goal.turnsUsed + 1,
        blockedStreak: streak,
        auditFailStreak: 0,
        note,
      },
    };
  }

  return {
    action: "continue",
    reason: "audited",
    goal: {
      ...goal,
      turnsUsed: goal.turnsUsed + 1,
      blockedStreak: 0,
      auditFailStreak: 0,
      note,
    },
  };
}

function settleBlocked(
  goal: SessionGoal,
  reason: string,
  extra: Partial<SessionGoal> = {},
): GoalDecision {
  return {
    action: "settle",
    status: "blocked",
    reason,
    goal: { ...goal, status: "blocked", statusReason: reason, ...extra },
  };
}

/**
 * Resume an interrupted goal. Resuming over an aborted tail skips the audit and
 * goes straight to a continuation: there is nothing new to judge yet.
 */
export function resume(goal: SessionGoal, wasAborted: boolean): SessionGoal {
  return {
    ...goal,
    status: "active",
    statusReason: "resumed",
    // Fresh tolerance: a goal the user deliberately revived should not die on
    // the streak that killed it.
    blockedStreak: 0,
    auditFailStreak: wasAborted ? 0 : goal.auditFailStreak,
  };
}
