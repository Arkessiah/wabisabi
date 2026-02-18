/**
 * Plugin Manager
 *
 * Manages plugins for WabiSabi. Supports filesystem-based plugin loading
 * from ~/.wabisabi/plugins/ directory with enable/disable persistence.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  type: "tool" | "agent" | "theme" | "integration";
  compatibility: string[];
  skills?: PluginSkill[];
}

export interface PluginSkill {
  name: string;
  description: string;
  schema?: object;
}

export interface PluginInfo {
  manifest: PluginManifest;
  path: string;
  enabled: boolean;
  loaded: boolean;
  installedAt: Date;
}

export type PluginSource =
  | { type: "github"; repo: string }
  | { type: "npm"; package: string }
  | { type: "local"; path: string }
  | { type: "url"; url: string };

interface PluginState {
  [pluginName: string]: {
    enabled: boolean;
    installedAt: string;
  };
}

export class PluginManager {
  private plugins: Map<string, PluginInfo> = new Map();
  private pluginsDir: string;
  private stateFile: string;
  private configDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), ".wabisabi");
    this.pluginsDir = path.join(this.configDir, "plugins");
    this.stateFile = path.join(this.configDir, "plugins.json");
    this.ensureDirectories();
  }

  /**
   * Ensure ~/.wabisabi and ~/.wabisabi/plugins directories exist
   */
  private ensureDirectories(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (!fs.existsSync(this.pluginsDir)) {
        fs.mkdirSync(this.pluginsDir, { recursive: true });
      }
    } catch (error) {
      console.error("Failed to create plugin directories:", error);
    }
  }

  /**
   * Load plugin state from plugins.json
   */
  private loadState(): PluginState {
    try {
      if (!fs.existsSync(this.stateFile)) {
        return {};
      }
      const content = fs.readFileSync(this.stateFile, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error("Failed to load plugin state:", error);
      return {};
    }
  }

  /**
   * Save plugin state to plugins.json
   */
  private saveState(): void {
    try {
      const state: PluginState = {};
      for (const [name, info] of this.plugins.entries()) {
        state[name] = {
          enabled: info.enabled,
          installedAt: info.installedAt.toISOString(),
        };
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2), "utf-8");
    } catch (error) {
      console.error("Failed to save plugin state:", error);
    }
  }

  /**
   * Validate plugin manifest
   */
  private validateManifest(manifest: any): manifest is PluginManifest {
    if (!manifest || typeof manifest !== "object") {
      return false;
    }

    const required = ["name", "version", "description", "author", "license", "type"];
    for (const field of required) {
      if (!manifest[field] || typeof manifest[field] !== "string") {
        return false;
      }
    }

    const validTypes = ["tool", "agent", "theme", "integration"];
    if (!validTypes.includes(manifest.type)) {
      return false;
    }

    if (!Array.isArray(manifest.compatibility)) {
      return false;
    }

    if (manifest.skills !== undefined) {
      if (!Array.isArray(manifest.skills)) {
        return false;
      }
      for (const skill of manifest.skills) {
        if (!skill.name || !skill.description) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Load a single plugin from a directory
   */
  private loadPlugin(pluginDir: string, state: PluginState): PluginInfo | null {
    try {
      const manifestPath = path.join(pluginDir, "manifest.json");

      // Check if manifest exists
      if (!fs.existsSync(manifestPath)) {
        console.error(`Plugin manifest not found: ${manifestPath}`);
        return null;
      }

      // Read and parse manifest
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);

      // Validate manifest
      if (!this.validateManifest(manifest)) {
        console.error(`Invalid manifest in ${pluginDir}`);
        return null;
      }

      // Check if entry point exists (index.ts or index.js)
      const hasIndexTs = fs.existsSync(path.join(pluginDir, "index.ts"));
      const hasIndexJs = fs.existsSync(path.join(pluginDir, "index.js"));

      if (!hasIndexTs && !hasIndexJs) {
        console.error(`Plugin entry point not found in ${pluginDir}`);
        return null;
      }

      // Get state from saved state or default
      const savedState = state[manifest.name];
      const installedAt = savedState?.installedAt
        ? new Date(savedState.installedAt)
        : new Date();
      const enabled = savedState?.enabled ?? true;

      const pluginInfo: PluginInfo = {
        manifest,
        path: pluginDir,
        enabled,
        loaded: true,
        installedAt,
      };

      return pluginInfo;
    } catch (error) {
      console.error(`Failed to load plugin from ${pluginDir}:`, error);
      return null;
    }
  }

  /**
   * Load all plugins from ~/.wabisabi/plugins/
   */
  async loadAll(): Promise<void> {
    try {
      this.ensureDirectories();
      const state = this.loadState();

      // Read all directories in plugins folder
      const entries = fs.readdirSync(this.pluginsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const pluginDir = path.join(this.pluginsDir, entry.name);
        const pluginInfo = this.loadPlugin(pluginDir, state);

        if (pluginInfo) {
          this.plugins.set(pluginInfo.manifest.name, pluginInfo);
        }
      }

      // Save state to sync any new plugins
      this.saveState();
    } catch (error) {
      console.error("Failed to load plugins:", error);
    }
  }

  /**
   * Install a plugin from a source
   */
  async install(source: PluginSource): Promise<PluginInfo> {
    if (source.type === "local") {
      return this.installFromLocal(source.path);
    }

    throw new Error(
      `Plugin installation from ${source.type} is not yet implemented. ` +
        `This feature is planned for a future release.`,
    );
  }

  /**
   * Install a plugin from a local path
   */
  private async installFromLocal(sourcePath: string): Promise<PluginInfo> {
    try {
      // Resolve absolute path
      const resolvedPath = path.resolve(sourcePath);

      // Check if source exists
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Source path does not exist: ${resolvedPath}`);
      }

      const stat = fs.statSync(resolvedPath);
      if (!stat.isDirectory()) {
        throw new Error(`Source path is not a directory: ${resolvedPath}`);
      }

      // Check for manifest
      const manifestPath = path.join(resolvedPath, "manifest.json");
      if (!fs.existsSync(manifestPath)) {
        throw new Error(`No manifest.json found in ${resolvedPath}`);
      }

      // Read and validate manifest
      const manifestContent = fs.readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(manifestContent);

      if (!this.validateManifest(manifest)) {
        throw new Error("Invalid manifest.json");
      }

      // Check if plugin already exists
      if (this.plugins.has(manifest.name)) {
        throw new Error(`Plugin ${manifest.name} is already installed`);
      }

      // Create destination directory
      const destPath = path.join(this.pluginsDir, manifest.name);
      if (fs.existsSync(destPath)) {
        throw new Error(`Plugin directory already exists: ${destPath}`);
      }

      // Copy plugin directory
      this.copyDirectory(resolvedPath, destPath);

      // Load the plugin
      const state = this.loadState();
      const pluginInfo = this.loadPlugin(destPath, state);

      if (!pluginInfo) {
        // Cleanup on failure
        this.removeDirectory(destPath);
        throw new Error("Failed to load installed plugin");
      }

      this.plugins.set(pluginInfo.manifest.name, pluginInfo);
      this.saveState();

      return pluginInfo;
    } catch (error) {
      throw new Error(
        `Failed to install plugin from local path: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Recursively copy directory
   */
  private copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Recursively remove directory
   */
  private removeDirectory(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.removeDirectory(fullPath);
      } else {
        fs.unlinkSync(fullPath);
      }
    }

    fs.rmdirSync(dirPath);
  }

  /**
   * List installed plugins
   */
  list(): PluginInfo[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get plugin details by name
   */
  show(name: string): PluginInfo | undefined {
    return this.plugins.get(name);
  }

  /**
   * Enable a plugin
   */
  enable(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    plugin.enabled = true;
    this.saveState();
  }

  /**
   * Disable a plugin
   */
  disable(name: string): void {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }
    plugin.enabled = false;
    this.saveState();
  }

  /**
   * Remove a plugin
   */
  async remove(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    try {
      // Remove from filesystem
      this.removeDirectory(plugin.path);

      // Remove from memory
      this.plugins.delete(name);

      // Update state
      this.saveState();
    } catch (error) {
      throw new Error(
        `Failed to remove plugin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search plugins (not yet implemented)
   */
  async search(_query: string): Promise<PluginInfo[]> {
    return [];
  }

  /**
   * Get plugins directory path
   */
  getPluginsDir(): string {
    return this.pluginsDir;
  }

  /**
   * Get enabled plugins only
   */
  getEnabled(): PluginInfo[] {
    return Array.from(this.plugins.values()).filter((p) => p.enabled);
  }

  /**
   * Get plugins by type
   */
  getByType(type: PluginManifest["type"]): PluginInfo[] {
    return Array.from(this.plugins.values()).filter((p) => p.manifest.type === type);
  }

  /**
   * Reload all plugins from filesystem
   */
  async reload(): Promise<void> {
    this.plugins.clear();
    await this.loadAll();
  }
}

// Singleton instance
export const pluginManager = new PluginManager();
