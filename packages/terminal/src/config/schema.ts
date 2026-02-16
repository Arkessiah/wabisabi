/**
 * WabiSabi Configuration Schemas
 *
 * Zod schemas for global and project-level configuration.
 */

import { z } from "zod";

export const ToolPermissionsSchema = z.object({
  allowFileRead: z.boolean().default(true),
  allowFileWrite: z.boolean().default(false),
  allowBash: z.boolean().default(false),
  allowGrep: z.boolean().default(true),
  allowGlob: z.boolean().default(true),
  allowList: z.boolean().default(true),
});

export const GlobalConfigSchema = z.object({
  model: z.string().default("llama3.2"),
  substratum: z.string().default("http://localhost:3001"),
  ollama: z.string().default("http://localhost:11434"),
  apiKey: z.string().optional(),
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
  sessionsDir: z.string().optional(),
  profile: z
    .object({
      hat: z.string().nullable().default(null),
      profile: z.string().nullable().default(null),
      style: z.string().nullable().default(null),
    })
    .optional(),
});

export const ProjectConfigSchema = GlobalConfigSchema.partial().extend({
  projectName: z.string().optional(),
  techStack: z.array(z.string()).optional(),
  ignorePaths: z.array(z.string()).optional(),
});

export type ToolPermissions = z.infer<typeof ToolPermissionsSchema>;
export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type MergedConfig = GlobalConfig;
