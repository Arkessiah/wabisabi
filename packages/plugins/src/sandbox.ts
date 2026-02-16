/**
 * Plugin Sandbox Context
 *
 * Provides a restricted API surface to plugins running in Bun Workers.
 * Security (CRITICA-2): Enforces permission boundaries declared in manifest.
 */

import type { PluginManifest } from "./schemas";
import type { PluginCommand, PluginTool, PluginContext, Logger } from "./index";

export interface SandboxConfig {
  manifest: PluginManifest;
  wabisabiVersion: string;
  pluginState: Map<string, any>;
}

/**
 * Creates a sandboxed context for plugin execution.
 * This context is passed to plugins and restricts access based on permissions.
 */
export function createSandboxContext(config: SandboxConfig): PluginContext {
  const { manifest, wabisabiVersion, pluginState } = config;
  const permissions = manifest.permissions;

  const registeredCommands: PluginCommand[] = [];
  const registeredTools: PluginTool[] = [];

  // Restricted logger (cannot access process.stdout directly)
  const logger: Logger = {
    info: (msg: string) => {
      self.postMessage({ type: "log", level: "info", message: msg });
    },
    error: (msg: string, err?: Error) => {
      self.postMessage({
        type: "log",
        level: "error",
        message: msg,
        error: err ? { message: err.message, stack: err.stack } : undefined,
      });
    },
    warn: (msg: string) => {
      self.postMessage({ type: "log", level: "warn", message: msg });
    },
  };

  // Context with enforced restrictions
  const context: PluginContext = {
    wabisabiVersion,
    config: {}, // Empty config - plugins shouldn't access global config

    registerCommand: (command: PluginCommand) => {
      // Validate command structure
      if (!command.name || typeof command.name !== "string") {
        throw new Error("Invalid command: name must be a non-empty string");
      }
      if (!command.handler || typeof command.handler !== "function") {
        throw new Error("Invalid command: handler must be a function");
      }

      registeredCommands.push(command);
      self.postMessage({
        type: "register_command",
        command: {
          name: command.name,
          description: command.description,
        },
      });
    },

    registerTool: (tool: PluginTool) => {
      // Validate tool structure
      if (!tool.name || typeof tool.name !== "string") {
        throw new Error("Invalid tool: name must be a non-empty string");
      }
      if (!tool.handler || typeof tool.handler !== "function") {
        throw new Error("Invalid tool: handler must be a function");
      }
      if (!tool.inputSchema || typeof tool.inputSchema !== "object") {
        throw new Error("Invalid tool: inputSchema must be an object");
      }

      registeredTools.push(tool);
      self.postMessage({
        type: "register_tool",
        tool: {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
      });
    },

    getState: <T>(key: string, defaultValue: T): T => {
      return pluginState.has(key) ? pluginState.get(key) : defaultValue;
    },

    setState: <T>(key: string, value: T): void => {
      pluginState.set(key, value);
      self.postMessage({
        type: "state_update",
        key,
        value,
      });
    },

    logger,
  };

  // Security: Override global functions based on permissions
  if (!permissions.network) {
    // Block network access
    (global as any).fetch = () => {
      throw new Error(
        `Network access denied for plugin "${manifest.name}". ` +
          `Set "permissions.network": true in manifest.json to enable.`
      );
    };
    (global as any).WebSocket = class {
      constructor() {
        throw new Error(`WebSocket access denied for plugin "${manifest.name}".`);
      }
    };
  }

  if (permissions.filesystem === "none") {
    // Block filesystem access
    const blockFsError = () => {
      throw new Error(
        `Filesystem access denied for plugin "${manifest.name}". ` +
          `Set "permissions.filesystem": "read" or "write" in manifest.json.`
      );
    };

    (global as any).Bun.file = blockFsError;
    (global as any).Bun.write = blockFsError;
  } else if (permissions.filesystem === "read") {
    // Allow read, block write
    const originalWrite = (global as any).Bun?.write;
    (global as any).Bun.write = () => {
      throw new Error(
        `Filesystem write denied for plugin "${manifest.name}". ` +
          `Set "permissions.filesystem": "write" in manifest.json.`
      );
    };
  }

  if (!permissions.process) {
    // Block process spawning
    (global as any).Bun.spawn = () => {
      throw new Error(
        `Process spawning denied for plugin "${manifest.name}". ` +
          `Set "permissions.process": true in manifest.json.`
      );
    };
    (global as any).Bun.spawnSync = () => {
      throw new Error(`Process spawning denied for plugin "${manifest.name}".`);
    };
  }

  return context;
}

/**
 * Validates that a plugin doesn't attempt to escape the sandbox.
 * Checks for dangerous patterns in plugin code before execution.
 */
export function validatePluginCode(code: string, pluginName: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check for eval/Function constructor (code execution)
  if (/\beval\s*\(/.test(code)) {
    violations.push("Uses eval() - dynamic code execution not allowed");
  }
  if (/new\s+Function\s*\(/.test(code)) {
    violations.push("Uses Function constructor - dynamic code execution not allowed");
  }

  // Check for process manipulation
  if (/process\.(exit|kill|abort)/.test(code)) {
    violations.push("Attempts to manipulate process lifecycle");
  }

  // Check for child_process (if not explicitly allowed)
  if (/require\s*\(\s*['"]child_process['"]/.test(code)) {
    violations.push("Attempts to use child_process - requires permissions.process=true");
  }

  // Check for direct filesystem access (bypassing Bun.file)
  if (/require\s*\(\s*['"]fs['"]/.test(code)) {
    violations.push("Direct fs module access - use Bun.file API instead");
  }

  // Check for __dirname/__filename manipulation
  if (/__dirname|__filename/.test(code) && /\.\.[\/\\]/.test(code)) {
    violations.push("Suspicious path traversal pattern detected");
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}
