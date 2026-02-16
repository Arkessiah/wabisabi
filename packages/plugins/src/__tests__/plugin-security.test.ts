import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PluginManager } from "../index";
import { writeFileSync, mkdirSync, existsSync, unlinkSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { computeChecksum } from "../security";

const TEST_PLUGIN_BASE = join(homedir(), ".wabisabi", "plugins");
let testCounter = 0;

function getTestPluginDir(): string {
  testCounter++;
  return join(TEST_PLUGIN_BASE, `test-plugin-${testCounter}-${Date.now()}`);
}

describe("Plugin Security", () => {
  let TEST_PLUGIN_DIR: string;

  beforeEach(() => {
    // Create unique test plugin directory
    TEST_PLUGIN_DIR = getTestPluginDir();
    mkdirSync(TEST_PLUGIN_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_PLUGIN_DIR)) {
      rmSync(TEST_PLUGIN_DIR, { recursive: true, force: true });
    }
  });

  test("should reject plugin from disallowed directory", async () => {
    const manager = new PluginManager();
    const maliciousPath = "/tmp/malicious-plugin/index.ts";

    await expect(manager.loadPlugin(maliciousPath)).rejects.toThrow(
      /Plugin path validation failed/
    );
  });

  test("should reject plugin with remote URL", async () => {
    const manager = new PluginManager();
    const remoteUrl = "https://evil.com/plugin.ts";

    await expect(manager.loadPlugin(remoteUrl)).rejects.toThrow(
      /Remote plugin URLs are not allowed/
    );
  });

  test("should reject plugin without manifest.json", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");

    // Create plugin file but no manifest
    writeFileSync(
      pluginPath,
      `
      export default {
        name: "test",
        version: "1.0.0",
        description: "Test plugin"
      };
    `
    );

    await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
      /Plugin manifest not found/
    );
  });

  test("should reject plugin with invalid manifest schema", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Create invalid manifest (missing required fields)
    writeFileSync(manifestPath, JSON.stringify({ invalid: "schema" }));

    writeFileSync(
      pluginPath,
      `
      export default {
        name: "test",
        version: "1.0.0",
        description: "Test"
      };
    `
    );

    await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
      /Invalid plugin manifest/
    );
  });

  test("should reject plugin with incorrect checksum", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "test-plugin",
  version: "1.0.0",
  description: "Test plugin"
};
`;

    writeFileSync(pluginPath, pluginCode);

    // Create manifest with WRONG checksum
    const manifest = {
      name: "test-plugin",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: "0000000000000000000000000000000000000000000000000000000000000000",
      },
      permissions: {
        network: false,
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
      /Checksum verification failed/
    );
  });

  test("should reject plugin with name mismatch", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "different-name",
  version: "1.0.0",
  description: "Test plugin"
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "test-plugin", // Different from plugin export!
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

    await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
      /Plugin name mismatch/
    );
  });

  test("should accept valid plugin with correct manifest and checksum", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "test-plugin",
  version: "1.0.0",
  description: "Test plugin",
  onLoad: async (ctx) => {
    ctx.logger.info("Test plugin loaded");
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "test-plugin",
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

    // Should NOT throw
    await expect(manager.loadPlugin(pluginPath)).resolves.toBeUndefined();

    // Verify plugin is registered
    expect(manager.listPlugins()).toContain("test-plugin");
    expect(manager.getPlugin("test-plugin")).toBeDefined();
    expect(manager.getPlugin("test-plugin")?.version).toBe("1.0.0");
  });

  test("should prevent loading same plugin twice", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    const pluginCode = `
export default {
  name: "test-plugin",
  version: "1.0.0",
  description: "Test plugin"
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "test-plugin",
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

    await manager.loadPlugin(pluginPath);

    // Second load should overwrite (current behavior) or could throw
    await manager.loadPlugin(pluginPath);

    expect(manager.listPlugins()).toEqual(["test-plugin"]);
  });
});
