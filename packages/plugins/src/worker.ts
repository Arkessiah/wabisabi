/**
 * Plugin Worker - Executes plugins in isolated Bun Worker
 *
 * Security (CRITICA-2): Runs plugin code in separate process with restricted permissions.
 * Communication with main thread via postMessage only.
 */

import { createSandboxContext, validatePluginCode } from "./sandbox";
import type { PluginManifest } from "./schemas";
import type { Plugin } from "./index";

// Worker receives initialization message
self.onmessage = async (event: MessageEvent) => {
  const { type, pluginPath, manifest } = event.data;

  if (type !== "load_plugin") {
    self.postMessage({ type: "error", error: "Unknown message type" });
    return;
  }

  try {
    // Step 1: Load plugin code
    const pluginModule = await import(pluginPath);
    const plugin: Plugin = pluginModule.default || pluginModule.plugin;

    if (!plugin) {
      throw new Error("No plugin export found");
    }

    // Step 2: Validate plugin code (static analysis)
    const pluginCode = await Bun.file(pluginPath).text();
    const codeValidation = validatePluginCode(pluginCode, manifest.name);

    if (!codeValidation.safe) {
      throw new Error(
        `Plugin code validation failed:\n${codeValidation.violations.join("\n")}`
      );
    }

    // Step 3: Create sandboxed context
    const pluginState = new Map<string, any>();
    const context = createSandboxContext({
      manifest: manifest as PluginManifest,
      wabisabiVersion: "1.0.0",
      pluginState,
    });

    // Step 4: Call plugin onLoad hook (if exists)
    if (plugin.onLoad) {
      await plugin.onLoad(context);
    }

    // Step 5: Notify main thread of successful load
    self.postMessage({
      type: "loaded",
      plugin: {
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
      },
    });

    // Step 6: Listen for plugin commands from main thread
    self.onmessage = async (cmdEvent: MessageEvent) => {
      const { type: cmdType, commandName, args, toolName, input } = cmdEvent.data;

      if (cmdType === "execute_command") {
        try {
          const command = plugin.commands?.find((c) => c.name === commandName);
          if (!command) {
            throw new Error(`Command not found: ${commandName}`);
          }
          await command.handler(args || []);
          self.postMessage({ type: "command_result", success: true });
        } catch (error: any) {
          self.postMessage({
            type: "command_result",
            success: false,
            error: error.message,
          });
        }
      } else if (cmdType === "execute_tool") {
        try {
          const tool = plugin.tools?.find((t) => t.name === toolName);
          if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
          }
          const result = await tool.handler(input);
          self.postMessage({ type: "tool_result", success: true, result });
        } catch (error: any) {
          self.postMessage({
            type: "tool_result",
            success: false,
            error: error.message,
          });
        }
      } else if (cmdType === "unload") {
        if (plugin.onUnload) {
          await plugin.onUnload(context);
        }
        self.postMessage({ type: "unloaded" });
        self.close();
      }
    };
  } catch (error: any) {
    self.postMessage({
      type: "error",
      error: error.message,
      stack: error.stack,
    });
  }
};

// Handle uncaught errors in plugin code
self.onerror = (event) => {
  self.postMessage({
    type: "error",
    error: `Uncaught error in plugin: ${event.message}`,
  });
  return true; // Prevent default error handling
};

self.onunhandledrejection = (event) => {
  self.postMessage({
    type: "error",
    error: `Unhandled promise rejection in plugin: ${event.reason}`,
  });
};
