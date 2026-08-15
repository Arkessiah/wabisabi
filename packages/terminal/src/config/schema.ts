/**
 * WabiSabi Configuration Schemas
 *
 * Zod schemas for global and project-level configuration.
 * Supports both legacy (flat strings) and new (providers object) formats.
 */

import { z } from "zod";
import { CortexConfigSchema } from "../cortex/schema.js";
import { DaemonConfigSchema } from "../daemon/schema.js";
import { GoalConfigSchema } from "../goal/schema.js";

// ── Tool Permissions ───────────────────────────────────────────

export const ToolPermissionsSchema = z.object({
  allowFileRead: z.boolean().default(true),
  allowFileWrite: z.boolean().default(false),
  allowBash: z.boolean().default(false),
  allowGrep: z.boolean().default(true),
  allowGlob: z.boolean().default(true),
  allowList: z.boolean().default(true),
});

// ── Provider Schemas ───────────────────────────────────────────

export const OllamaNodeSchema = z.object({
  name: z.string(),
  url: z.string(),
  gpu: z.enum(["nvidia", "amd", "metal", "cpu"]).optional(),
  priority: z.number().min(1).max(10).default(5),
});

export const OllamaProviderSchema = z.object({
  mode: z.enum(["local", "cluster"]).default("local"),
  nodes: z.array(OllamaNodeSchema).default([
    { name: "local", url: "http://localhost:11434", priority: 5 },
  ]),
});

export const SubstratumProviderSchema = z.object({
  enabled: z.boolean().default(false),
  url: z.string().default("https://api.substratum.dev"),
  apiKey: z.string().optional(),
});

export const ProvidersSchema = z.object({
  substratum: SubstratumProviderSchema.default({}),
  ollama: OllamaProviderSchema.default({}),
});

// ── Global Config ──────────────────────────────────────────────

export const GlobalConfigSchema = z.object({
  model: z.string().default("llama3.2"),
  locale: z.enum(["en", "es", "auto"]).default("auto"),
  providerStrategy: z
    .enum([
      "local",           // Ollama only (single instance)
      "cluster",         // Ollama cluster only
      "cloud",           // Substratum only
      "cluster-cloud",   // Cluster + Substratum
      "hybrid-local-first",   // Local Ollama + Substratum (local preferred)
      "hybrid-cloud-first",   // Substratum + Local Ollama (cloud preferred)
      "hybrid-full",          // Local + Cluster + Substratum (distribute load)
    ])
    .default("hybrid-local-first"),
  // Legacy fields (backward-compat, migrated to providers on load)
  substratum: z.string().optional(),
  ollama: z.string().optional(),
  apiKey: z.string().optional(),
  // New: structured providers config
  providers: ProvidersSchema.optional(),
  privacy: z
    .enum(["local", "hybrid", "semi", "full"])
    .default("hybrid"),
  tools: ToolPermissionsSchema.default({}),
  defaultAgent: z
    .enum(["build", "plan", "search"])
    .default("build"),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().default(4096),
  streaming: z.boolean().default(true),
  cortex: CortexConfigSchema.optional(),
  daemon: DaemonConfigSchema.optional(),
  goal: GoalConfigSchema.optional(),
  sessionsDir: z.string().optional(),
  profile: z
    .object({
      hat: z.string().nullable().default(null),
      profile: z.string().nullable().default(null),
      style: z.string().nullable().default(null),
    })
    .optional(),
});

// ── Project Config ─────────────────────────────────────────────

export const ProjectConfigSchema = GlobalConfigSchema.partial().extend({
  projectName: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  ignorePaths: z.array(z.string()).optional(),
});

// ── Types ──────────────────────────────────────────────────────

export type ToolPermissions = z.infer<typeof ToolPermissionsSchema>;
export type OllamaNode = z.infer<typeof OllamaNodeSchema>;
export type OllamaProvider = z.infer<typeof OllamaProviderSchema>;
export type SubstratumProvider = z.infer<typeof SubstratumProviderSchema>;
export type ProvidersConfig = z.infer<typeof ProvidersSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type MergedConfig = GlobalConfig;
export type { CortexConfig } from "../cortex/schema.js";
export type { DaemonConfig } from "../daemon/schema.js";
export type { GoalConfig } from "../goal/schema.js";
