import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { PluginManifestSchema } from "./schemas";
import { validatePluginPath, verifyChecksum } from "./security";

export interface Plugin {
  name: string;
  version: string;
  description: string;
  author?: string;
  commands?: PluginCommand[];
  tools?: PluginTool[];
  onLoad?: (context: PluginContext) => Promise<void>;
  onUnload?: (context: PluginContext) => Promise<void>;
}

export interface PluginCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

export interface PluginTool {
  name: string;
  description: string;
  inputSchema: object;
  handler: (input: any) => Promise<any>;
}

export interface PluginContext {
  wabisabiVersion: string;
  config: Record<string, any>;
  registerCommand: (command: PluginCommand) => void;
  registerTool: (tool: PluginTool) => void;
  getState: <T>(key: string, defaultValue: T) => T;
  setState: <T>(key: string, value: T) => void;
  logger: Logger;
}

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string, err?: Error) => void;
  warn: (msg: string) => void;
}

export class PluginManager {
  private plugins: Map<string, Plugin> = new Map();
  private context: PluginContext;

  constructor() {
    this.context = {
      wabisabiVersion: "1.0.0",
      config: {},
      registerCommand: (cmd) => console.log(`[Plugin] Command: ${cmd.name}`),
      registerTool: (tool) => console.log(`[Plugin] Tool: ${tool.name}`),
      getState: (key, defaultValue) => defaultValue,
      setState: (key, value) => {},
      logger: {
        info: (msg) => console.log(`[Info] ${msg}`),
        error: (msg, err) => console.error(`[Error] ${msg}`, err),
        warn: (msg) => console.warn(`[Warn] ${msg}`),
      },
    };
  }

  async loadPlugin(pluginPath: string): Promise<void> {
    try {
      // Step 1: Validate plugin path against allowlist
      const pathValidation = validatePluginPath(pluginPath);
      if (!pathValidation.valid) {
        throw new Error(`Plugin path validation failed: ${pathValidation.error}`);
      }
      const normalizedPath = pathValidation.normalized!;

      // Step 2: Read and validate manifest.json
      const pluginDir = normalizedPath.endsWith(".ts") || normalizedPath.endsWith(".js")
        ? dirname(normalizedPath)
        : normalizedPath;

      const manifestPath = join(pluginDir, "manifest.json");
      if (!existsSync(manifestPath)) {
        throw new Error(`Plugin manifest not found at ${manifestPath}`);
      }

      const manifestRaw = readFileSync(manifestPath, "utf-8");
      const manifestJson = JSON.parse(manifestRaw);
      const manifestResult = PluginManifestSchema.safeParse(manifestJson);

      if (!manifestResult.success) {
        throw new Error(`Invalid plugin manifest: ${manifestResult.error.message}`);
      }
      const manifest = manifestResult.data;

      // Step 3: Determine entry file
      const entryFile = manifest.entry ?? "index.js";
      const entryPath = join(pluginDir, entryFile);

      if (!existsSync(entryPath)) {
        throw new Error(`Plugin entry file not found: ${entryPath}`);
      }

      // Step 4: Verify checksum
      if (!verifyChecksum(entryPath, manifest.checksum.hash)) {
        throw new Error(
          `Checksum verification failed for ${entryPath}. ` +
          `Expected ${manifest.checksum.hash} but file content doesn't match. ` +
          `This could indicate tampering or corruption.`
        );
      }

      // Step 5: Import plugin (only after all validations pass)
      const pluginModule = await import(entryPath);
      const plugin = pluginModule.default || pluginModule.plugin;

      if (!plugin) {
        throw new Error(`No plugin export found in ${entryPath}`);
      }

      // Verify plugin metadata matches manifest
      if (plugin.name !== manifest.name) {
        throw new Error(
          `Plugin name mismatch: manifest declares "${manifest.name}" but plugin exports "${plugin.name}"`
        );
      }
      if (plugin.version !== manifest.version) {
        throw new Error(
          `Plugin version mismatch: manifest declares "${manifest.version}" but plugin exports "${plugin.version}"`
        );
      }

      // Step 6: Register plugin
      this.plugins.set(plugin.name, plugin);
      console.log(`[Plugin] Loaded: ${plugin.name} v${plugin.version} (verified)`);

      // Step 7: Call onLoad hook
      if (plugin.onLoad) {
        await plugin.onLoad(this.context);
      }
    } catch (error) {
      console.error(`[Plugin] Failed to load ${pluginPath}:`, error);
      throw error; // Re-throw to prevent silent failures
    }
  }

  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      console.warn(`[Plugin] Not found: ${name}`);
      return;
    }

    if (plugin.onUnload) {
      await plugin.onUnload(this.context);
    }

    this.plugins.delete(name);
    console.log(`[Plugin] Unloaded: ${name}`);
  }

  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): string[] {
    return Array.from(this.plugins.keys());
  }
}

// Example plugin template
export function createExamplePlugin(): Plugin {
  return {
    name: "example-plugin",
    version: "1.0.0",
    description: "Example plugin for WabiSabi",
    author: "WabiSabi Team",
    commands: [
      {
        name: "example-hello",
        description: "Say hello",
        handler: async (args) => {
          console.log("Hello from example plugin!");
        },
      },
    ],
    tools: [],
    onLoad: async (ctx) => {
      ctx.logger.info("Example plugin loaded");
    },
    onUnload: async (ctx) => {
      ctx.logger.info("Example plugin unloaded");
    },
  };
}
