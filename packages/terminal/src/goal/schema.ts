/**
 * Session Goal — Schemas & Types
 *
 * A goal keeps a session working toward an objective instead of answering one
 * turn. The loop that drives it lives in the daemon, so it survives the terminal.
 *
 * Design note: the working agent has **no channel to declare itself done**.
 * Termination is decided by an independent auditor (the small model) or by a
 * hard stop (budget, turn cap). An agent that grades its own work always passes.
 */

import { z } from "zod";

/** Hard cap on auto-continuations, whatever the auditor says. */
export const MAX_AUTO_TURNS = 20;
/** Consecutive `blocked` verdicts before the goal actually settles. */
export const BLOCKED_STREAK_LIMIT = 3;
/** Consecutive failed/unavailable audits tolerated before settling as blocked. */
export const AUDIT_FAIL_LIMIT = 2;
/** Objective text is clamped to this before being stored. */
export const MAX_OBJECTIVE_CHARS = 5_000;

export const GoalStatusSchema = z.enum([
  "active",
  "paused",
  "blocked",
  "budgetLimited",
  "complete",
]);
export type GoalStatus = z.infer<typeof GoalStatusSchema>;

export const GoalVerdictSchema = z.enum(["continue", "complete", "blocked"]);
export type GoalVerdict = z.infer<typeof GoalVerdictSchema>;

export const SessionGoalSchema = z.object({
  /** Opaque per-goal id; guards against stale writes from an older loop. */
  id: z.string(),
  sessionId: z.string(),
  objective: z.string().max(MAX_OBJECTIVE_CHARS),
  status: GoalStatusSchema.default("active"),

  /** Optional ceiling on tokens the goal may spend. */
  tokenBudget: z.number().int().positive().optional(),
  /** tokensCommitted + current segment. Monotonic. */
  tokensUsed: z.number().int().min(0).default(0),
  /** Snapshot of the newest pre-goal turn; the segment's zero. */
  tokensBaseline: z.number().int().min(0).default(0),
  /** Closed segments' total. One segment per compaction. */
  tokensCommitted: z.number().int().min(0).default(0),

  /** Auto-continuations sent so far. */
  turnsUsed: z.number().int().min(0).default(0),
  /** Consecutive `blocked` verdicts. */
  blockedStreak: z.number().int().min(0).default(0),
  /** Consecutive failed or unavailable audits. */
  auditFailStreak: z.number().int().min(0).default(0),

  /** Latest auditor note, for the user. */
  note: z.string().max(280).optional(),
  /** Why it settled, or 'resumed' as a kickoff signal. */
  statusReason: z.string().optional(),

  createdAt: z.number(),
  updatedAt: z.number(),
});

export type SessionGoal = z.infer<typeof SessionGoalSchema>;

/** What the auditor returns. */
export interface AuditResult {
  verdict: GoalVerdict;
  note: string;
}

/** What one tick decided, so the caller can act and the user can be told. */
export type GoalDecision =
  /** Send another continuation. */
  | { action: "continue"; reason: "audited" | "post-compaction" | "resumed-after-abort"; goal: SessionGoal }
  /** Goal reached a terminal state. */
  | { action: "settle"; status: Exclude<GoalStatus, "active">; reason: string; goal: SessionGoal }
  /** Nothing to do right now; the next idle re-arms the loop. */
  | { action: "wait"; reason: string; goal: SessionGoal };
