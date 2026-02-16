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
  private workers: Map<string, Worker> = new Map();
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

      // Step 5: Load plugin in sandboxed Worker (CRITICA-2)
      // Security: Executes plugin code in isolated process with restricted permissions
      const workerPath = new URL("./worker.ts", import.meta.url).pathname;
      const worker = new Worker(workerPath);

      // Wait for plugin to load in worker
      const loadResult = await new Promise<{ plugin: Plugin; error?: string }>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Plugin load timeout after 10 seconds"));
        }, 10000);

        worker.onmessage = (event: MessageEvent) => {
          clearTimeout(timeout);
          const { type, plugin, error, message, level } = event.data;

          if (type === "loaded") {
            resolve({ plugin });
          } else if (type === "error") {
            reject(new Error(error));
          } else if (type === "log") {
            // Forward logs from worker
            if (level === "info") console.log(`[Plugin] ${message}`);
            else if (level === "error") console.error(`[Plugin] ${message}`);
            else if (level === "warn") console.warn(`[Plugin] ${message}`);
          }
        };

        worker.onerror = (error) => {
          clearTimeout(timeout);
          reject(error);
        };

        // Send load command to worker
        worker.postMessage({
          type: "load_plugin",
          pluginPath: entryPath,
          manifest,
        });
      });

      // Verify plugin metadata matches manifest
      if (loadResult.plugin.name !== manifest.name) {
        worker.terminate();
        throw new Error(
          `Plugin name mismatch: manifest declares "${manifest.name}" but plugin exports "${loadResult.plugin.name}"`
        );
      }
      if (loadResult.plugin.version !== manifest.version) {
        worker.terminate();
        throw new Error(
          `Plugin version mismatch: manifest declares "${manifest.version}" but plugin exports "${loadResult.plugin.version}"`
        );
      }

      // Step 6: Register plugin and worker
      this.plugins.set(loadResult.plugin.name, loadResult.plugin);
      this.workers.set(loadResult.plugin.name, worker);
      console.log(
        `[Plugin] Loaded: ${loadResult.plugin.name} v${loadResult.plugin.version} (sandboxed)`
      );
    } catch (error) {
      console.error(`[Plugin] Failed to load ${pluginPath}:`, error);
      throw error; // Re-throw to prevent silent failures
    }
  }

  async unloadPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    const worker = this.workers.get(name);

    if (!plugin) {
      console.warn(`[Plugin] Not found: ${name}`);
      return;
    }

    // Signal worker to run onUnload hook
    if (worker) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 5000); // Max 5s for cleanup

        worker.onmessage = (event: MessageEvent) => {
          if (event.data.type === "unloaded") {
            clearTimeout(timeout);
            resolve();
          }
        };

        worker.postMessage({ type: "unload" });
      });

      // Terminate worker
      worker.terminate();
      this.workers.delete(name);
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
