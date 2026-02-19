/**
 * WabiSabi Configuration Manager
 *
 * Handles global (~/.wabisabi/config.jsonc) and project-level (.wabisabi/config.jsonc) config.
 */

import { readFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { atomicWriteFileSync } from "../utils/atomic-write.js";
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  ProvidersSchema,
  type GlobalConfig,
  type ProjectConfig,
  type MergedConfig,
  type ProvidersConfig,
} from "./schema.js";

function stripJsonComments(text: string): string {
  // Remove comments while preserving strings (which may contain // or /*)
  let result = "";
  let i = 0;
  while (i < text.length) {
    // Handle strings (skip their contents)
    if (text[i] === '"') {
      result += '"';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') {
          result += text[i++]; // escape char
        }
        if (i < text.length) result += text[i++];
      }
      if (i < text.length) result += text[i++]; // closing "
      continue;
    }
    // Line comment
    if (text[i] === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    // Block comment
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    result += text[i++];
  }
  return result;
}

function readJsonc(filePath: string): unknown {
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(stripJsonComments(raw));
  } catch {
    return null;
  }
}

export class ConfigManager {
  private globalConfig: GlobalConfig;
  private projectConfig: ProjectConfig | null = null;
  private projectDir: string | null = null;

  constructor() {
    this.globalConfig = GlobalConfigSchema.parse({});
  }

  /**
   * Migrate legacy config (flat substratum/ollama strings) to providers object.
   * Called before Zod parse. If already migrated, returns as-is.
   */
  private migrateIfNeeded(raw: Record<string, unknown>): Record<string, unknown> {
    if (raw.providers) return raw;

    const substratumUrl = (raw.substratum as string) || "https://api.substratum.dev";
    const ollamaUrl = (raw.ollama as string) || "http://localhost:11434";
    const isLegacySubstratum = substratumUrl !== "https://api.substratum.dev";

    const migrated = { ...raw };
    migrated.providers = {
      substratum: {
        enabled: isLegacySubstratum || Boolean(raw.apiKey),
        url: substratumUrl,
        apiKey: raw.apiKey,
      },
      ollama: {
        mode: "local",
        nodes: [{ name: "local", url: ollamaUrl, priority: 5 }],
      },
    };
    return migrated;
  }

  /**
   * Get resolved providers config (always available, migrated from legacy if needed).
   */
  getProviders(): ProvidersConfig {
    if (this.globalConfig.providers) {
      return this.globalConfig.providers;
    }
    // Build from legacy fields
    const migrated = this.migrateIfNeeded(this.globalConfig as Record<string, unknown>);
    return ProvidersSchema.parse(migrated.providers);
  }

  getGlobalConfigPath(): string {
    return join(homedir(), ".wabisabi", "config.jsonc");
  }

  getProjectConfigPath(dir: string): string {
    return join(dir, ".wabisabi", "config.jsonc");
  }

  loadGlobal(): GlobalConfig {
    try {
      const path = this.getGlobalConfigPath();
      const data = readJsonc(path);
      if (data && typeof data === "object") {
        const migrated = this.migrateIfNeeded(data as Record<string, unknown>);
        this.globalConfig = GlobalConfigSchema.parse(migrated);
      }
    } catch {
      // Invalid config file - use defaults
    }
    return this.globalConfig;
  }

  loadProject(dir: string): ProjectConfig | null {
    this.projectDir = dir;
    try {
      const path = this.getProjectConfigPath(dir);
      const data = readJsonc(path);
      if (data) {
        this.projectConfig = ProjectConfigSchema.parse(data);
        return this.projectConfig;
      }
    } catch {
      // Invalid project config - ignore
    }
    this.projectConfig = null;
    return null;
  }

  getMerged(): MergedConfig {
    if (!this.projectConfig) return { ...this.globalConfig };
    const merged = { ...this.globalConfig };
    for (const [key, value] of Object.entries(this.projectConfig)) {
      if (value !== undefined) {
        (merged as any)[key] = value;
      }
    }
    return merged;
  }

  save(scope: "global" | "project"): void {
    try {
      if (scope === "global") {
        const path = this.getGlobalConfigPath();
        mkdirSync(dirname(path), { recursive: true });
        // Security (BAJA-4): Atomic write prevents corruption from crashes mid-write
        atomicWriteFileSync(path, JSON.stringify(this.globalConfig, null, 2));
      } else if (scope === "project" && this.projectDir) {
        const path = this.getProjectConfigPath(this.projectDir);
        mkdirSync(dirname(path), { recursive: true });
        // Security (BAJA-4): Atomic write prevents corruption from crashes mid-write
        atomicWriteFileSync(
          path,
          JSON.stringify(this.projectConfig || {}, null, 2),
        );
      }
    } catch {
      // Config save failed - non-critical
    }
  }

  /**
   * Update a config value and auto-save.
   */
  update(key: string, value: unknown, scope: "global" | "project" = "global"): void {
    if (scope === "global") {
      (this.globalConfig as any)[key] = value;
      this.save("global");
    } else if (this.projectConfig) {
      (this.projectConfig as any)[key] = value;
      this.save("project");
    }
  }

  getGlobal(): GlobalConfig {
    return { ...this.globalConfig };
  }

  getProject(): ProjectConfig | null {
    return this.projectConfig ? { ...this.projectConfig } : null;
  }
}

export const configManager = new ConfigManager();
