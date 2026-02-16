/**
 * SOUL.ms Schema
 *
 * Zod schemas for the personal memory system.
 * The SOUL is the user's digital brain that evolves with every interaction:
 * preferences, usage patterns, learnings, and implicit feedback.
 *
 * Note: SOUL_TEAM and karma live in Substratum (backend).
 */

import { z } from "zod";

// ── Preferences ──────────────────────────────────────────────

export const UserPreferencesSchema = z.object({
  language: z
    .enum(["espanol", "ingles", "bilingue"])
    .default("espanol"),
  technicalLevel: z
    .enum(["junior", "intermedio", "senior", "experto"])
    .default("senior"),
  responseTone: z
    .enum(["formal", "casual", "tecnico"])
    .default("tecnico"),
  responseLength: z
    .enum(["breve", "medio", "detallado"])
    .default("medio"),
  preferredFormat: z
    .enum(["markdown", "texto-plano", "codigo-formateado"])
    .default("markdown"),
});

// ── Usage Patterns ───────────────────────────────────────────

export const ToolUsageSchema = z.object({
  name: z.string(),
  totalUses: z.number().default(0),
  lastUsed: z.string().nullable().default(null), // ISO timestamp
});

export const TaskPatternSchema = z.object({
  category: z.string(), // debugging, documentacion, refactoring, etc.
  count: z.number().default(0),
  lastSeen: z.string().nullable().default(null),
});

export const ModelPreferenceSchema = z.object({
  model: z.string(),
  totalUses: z.number().default(0),
  successRate: z.number().min(0).max(1).default(0.5),
});

export const UsagePatternsSchema = z.object({
  toolUsage: z.array(ToolUsageSchema).default([]),
  taskPatterns: z.array(TaskPatternSchema).default([]),
  modelPreferences: z.array(ModelPreferenceSchema).default([]),
  totalSessions: z.number().default(0),
  totalInteractions: z.number().default(0),
});

// ── Learnings ────────────────────────────────────────────────

export const ExplainedConceptSchema = z.object({
  topic: z.string(),
  timesExplained: z.number().default(1),
  lastTime: z.string(), // ISO timestamp
});

export const CommonErrorSchema = z.object({
  error: z.string(),
  count: z.number().default(1),
  preferredSolutions: z.array(z.string()).default([]),
});

export const PreferredSolutionSchema = z.object({
  problem: z.string(),
  solution: z.string(),
  timesUsed: z.number().default(1),
});

export const ProjectContextSchema = z.object({
  projectPath: z.string(),
  name: z.string(),
  technologies: z.array(z.string()).default([]),
  lastAccess: z.string(), // ISO timestamp
});

export const LearningsSchema = z.object({
  explainedConcepts: z.array(ExplainedConceptSchema).default([]),
  commonErrors: z.array(CommonErrorSchema).default([]),
  preferredSolutions: z.array(PreferredSolutionSchema).default([]),
  projectContexts: z.array(ProjectContextSchema).default([]),
});

// ── Implicit Feedback ────────────────────────────────────────

export const FeedbackSchema = z.object({
  totalResponses: z.number().default(0),
  accepted: z.number().default(0),   // User continued without complaint
  rejected: z.number().default(0),   // User asked to redo
  modified: z.number().default(0),   // User edited the result
  rejectionReasons: z
    .array(
      z.object({
        reason: z.string(),
        count: z.number().default(1),
      }),
    )
    .default([]),
});

// ── Full SOUL Schema ─────────────────────────────────────────

export const SoulSchema = z.object({
  metadata: z.object({
    id: z.string(),
    version: z.string().default("1.0.0"),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  preferences: UserPreferencesSchema.default({}),
  usagePatterns: UsagePatternsSchema.default({}),
  learnings: LearningsSchema.default({}),
  feedback: FeedbackSchema.default({}),
});

// ── Types ────────────────────────────────────────────────────

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export type ToolUsage = z.infer<typeof ToolUsageSchema>;
export type TaskPattern = z.infer<typeof TaskPatternSchema>;
export type ModelPreference = z.infer<typeof ModelPreferenceSchema>;
export type UsagePatterns = z.infer<typeof UsagePatternsSchema>;
export type ExplainedConcept = z.infer<typeof ExplainedConceptSchema>;
export type CommonError = z.infer<typeof CommonErrorSchema>;
export type PreferredSolution = z.infer<typeof PreferredSolutionSchema>;
export type ProjectContext = z.infer<typeof ProjectContextSchema>;
export type Learnings = z.infer<typeof LearningsSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type Soul = z.infer<typeof SoulSchema>;
