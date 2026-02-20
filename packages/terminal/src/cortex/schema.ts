/**
 * Cortex ML Core - Schemas & Types
 *
 * Zod schemas for Cortex configuration and result types.
 * Cortex is a local ML pre-processor that reduces main LLM token consumption
 * by handling simple tasks (classification, summarization, compaction) locally.
 */

import { z } from "zod";

// ── Config Schema ──────────────────────────────────────────

export const CortexThresholdsSchema = z.object({
  /** Tool results above this char count get summarized */
  summarizeAbove: z.number().default(500),
  /** Context token count above which compaction triggers */
  compactAbove: z.number().default(8000),
  /** Minimum confidence to attempt local answering */
  answerConfidence: z.number().min(0).max(1).default(0.8),
});

export const CortexConfigSchema = z.object({
  enabled: z.boolean().default(true),
  /** Small model for local inference (must be fast, <1B params ideal) */
  model: z.string().default("qwen2.5:0.5b"),
  /** Ollama endpoint override. If omitted, uses first healthy cluster node */
  endpoint: z.string().optional(),
  /** Hard timeout in ms for any Cortex call */
  timeout: z.number().default(3000),
  thresholds: CortexThresholdsSchema.default({}),
});

// ── Result Types ───────────────────────────────────────────

export type CortexConfig = z.infer<typeof CortexConfigSchema>;
export type CortexThresholds = z.infer<typeof CortexThresholdsSchema>;

export type Complexity = "simple" | "moderate" | "complex";
export type Category = "factual" | "calculation" | "code" | "creative" | "system";

export interface ClassifyResult {
  complexity: Complexity;
  category: Category;
  canAnswerLocally: boolean;
  confidence: number;
}

export interface CortexStats {
  classified: number;
  answered: number;
  summarized: number;
  compacted: number;
  tokensSaved: number;
  errors: number;
  fallbacks: number;
}

export const DEFAULT_STATS: CortexStats = {
  classified: 0,
  answered: 0,
  summarized: 0,
  compacted: 0,
  tokensSaved: 0,
  errors: 0,
  fallbacks: 0,
};
