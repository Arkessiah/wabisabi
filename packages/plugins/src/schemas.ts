import { z } from "zod";

/**
 * Plugin Manifest Schema
 * Must be validated BEFORE loading the plugin code
 */
export const PluginManifestSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1).max(500),
  author: z.string().min(1).max(100).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().optional(),

  // Security
  checksum: z.object({
    algorithm: z.literal("sha256"),
    hash: z.string().length(64), // SHA-256 hex
  }),

  permissions: z.object({
    network: z.boolean().default(false),
    filesystem: z.enum(["none", "read", "write"]).default("none"),
    process: z.boolean().default(false),
  }).default({
    network: false,
    filesystem: "none",
    process: false,
  }),

  // Plugin files
  entry: z.string().default("index.js"),
  dependencies: z.record(z.string()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/**
 * Plugin Tool Input Schema
 * Enforces validation of tool inputs
 */
export const PluginToolInputSchema = z.object({
  name: z.string(),
  description: z.string(),
  inputSchema: z.object({}).passthrough(), // JSON Schema object
  handler: z.function(), // Will be validated at runtime
});

export type PluginToolInput = z.infer<typeof PluginToolInputSchema>;
