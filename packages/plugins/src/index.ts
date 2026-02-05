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
      const pluginModule = await import(pluginPath);
      const plugin = pluginModule.default || pluginModule.plugin;

      if (!plugin) {
        throw new Error(`No plugin export found in ${pluginPath}`);
      }

      this.plugins.set(plugin.name, plugin);
      console.log(`[Plugin] Loaded: ${plugin.name} v${plugin.version}`);

      if (plugin.onLoad) {
        await plugin.onLoad(this.context);
      }
    } catch (error) {
      console.error(`[Plugin] Failed to load ${pluginPath}:`, error);
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
