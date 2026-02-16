/**
 * WabiSabi Configuration Manager
 *
 * Handles global (~/.wabisabi/config.jsonc) and project-level (.wabisabi/config.jsonc) config.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  type GlobalConfig,
  type ProjectConfig,
  type MergedConfig,
} from "./schema.js";

function stripJsonComments(text: string): string {
  return text
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
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
      if (data) {
        this.globalConfig = GlobalConfigSchema.parse(data);
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
        writeFileSync(path, JSON.stringify(this.globalConfig, null, 2));
      } else if (scope === "project" && this.projectDir) {
        const path = this.getProjectConfigPath(this.projectDir);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
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
