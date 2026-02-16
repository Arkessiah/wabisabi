/**
 * RAM (Working Memory) Schema
 *
 * Hierarchical memory model inspired by SpikingBrain architecture:
 * - Short-term: Current conversation (managed by BaseAgent)
 * - Working memory: Pinned items, active context, cross-session continuity
 * - Long-term: Soul.json (managed by SoulManager)
 *
 * RAM bridges the gap between ephemeral conversation and persistent soul.
 */

import { z } from "zod";

// ── Pinned Items ─────────────────────────────────────────────

export const PinnedItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  type: z.enum(["decision", "fact", "task", "instruction", "reference"]),
  source: z.enum(["user", "agent", "system"]),
  createdAt: z.string(), // ISO timestamp
  expiresAt: z.string().nullable().default(null), // null = permanent
  importance: z.number().min(0).max(1).default(0.5),
});

// ── Active Context ───────────────────────────────────────────

export const ActiveFileSchema = z.object({
  path: z.string(),
  lastAccessed: z.string(),
  accessCount: z.number().default(1),
  summary: z.string().optional(), // Brief description of what's in the file
});

export const ActiveTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["active", "paused", "completed"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  subtasks: z.array(z.string()).default([]),
});

// ── Device Profile ───────────────────────────────────────────

export const DeviceProfileSchema = z.object({
  type: z.enum(["mobile", "laptop", "desktop", "server"]).default("laptop"),
  maxContextTokens: z.number().default(65_536),
  maxWorkingMemoryItems: z.number().default(50),
  compactionThreshold: z.number().min(0.5).max(0.95).default(0.75),
});

// ── Complexity Classification ────────────────────────────────

export const ComplexityLevelSchema = z.enum(["simple", "moderate", "complex"]);

// ── Full RAM Schema ──────────────────────────────────────────

export const RamSchema = z.object({
  metadata: z.object({
    version: z.string().default("1.0.0"),
    updatedAt: z.string(),
    sessionCount: z.number().default(0),
  }),
  pins: z.array(PinnedItemSchema).default([]),
  activeFiles: z.array(ActiveFileSchema).default([]),
  activeTasks: z.array(ActiveTaskSchema).default([]),
  deviceProfile: DeviceProfileSchema.default({}),
  lastSessionSummary: z.string().nullable().default(null),
});

// ── Types ────────────────────────────────────────────────────

export type PinnedItem = z.infer<typeof PinnedItemSchema>;
export type ActiveFile = z.infer<typeof ActiveFileSchema>;
export type ActiveTask = z.infer<typeof ActiveTaskSchema>;
export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;
export type ComplexityLevel = z.infer<typeof ComplexityLevelSchema>;
export type Ram = z.infer<typeof RamSchema>;
