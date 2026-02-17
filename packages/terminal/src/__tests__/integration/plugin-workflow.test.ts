/**
 * Plugin Workflow Integration Tests
 *
 * Tests plugin system end-to-end:
 * - Plugin installation from local path
 * - Plugin listing and details
 * - Plugin enable/disable
 * - Plugin removal
 * - Manifest validation
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { PluginManager } from "../../services/plugin-manager.js";

const TEST_PLUGIN_BASE = join(homedir(), ".wabisabi", "integration-test-plugins");
let testCounter = 0;

function getTestPluginDir(): string {
  testCounter++;
  return join(TEST_PLUGIN_BASE, `plugin-${testCounter}-${Date.now()}`);
}

function createValidManifest(name: string) {
  return {
    name,
    version: "1.0.0",
    description: "Integration test plugin",
    author: "test",
    license: "MIT",
    type: "tool",
    compatibility: [">=1.0.0"],
  };
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

  test("should install and list a valid plugin", async () => {
    const pluginName = `test-plugin-${Date.now()}`;
    const pluginCode = `export default { name: "${pluginName}" };`;

    writeFileSync(join(TEST_PLUGIN_DIR, "index.ts"), pluginCode);
    writeFileSync(
      join(TEST_PLUGIN_DIR, "manifest.json"),
      JSON.stringify(createValidManifest(pluginName), null, 2),
    );

    const result = await pluginManager.install({
      type: "local",
      path: TEST_PLUGIN_DIR,
    });

    expect(result).toBeDefined();
    expect(result.manifest.name).toBe(pluginName);
    expect(result.enabled).toBe(true);

    // Verify it appears in list
    const plugins = pluginManager.list();
    expect(plugins.some((p) => p.manifest.name === pluginName)).toBe(true);

    // Cleanup installed plugin
    await pluginManager.remove(pluginName);
  });

  test("should reject plugin with invalid manifest", async () => {
    writeFileSync(join(TEST_PLUGIN_DIR, "index.ts"), "export default {};");
    writeFileSync(
      join(TEST_PLUGIN_DIR, "manifest.json"),
      JSON.stringify({ name: "invalid" }), // Missing required fields
    );

    await expect(
      pluginManager.install({ type: "local", path: TEST_PLUGIN_DIR }),
    ).rejects.toThrow();
  });

  test("should reject plugin without manifest.json", async () => {
    writeFileSync(join(TEST_PLUGIN_DIR, "index.ts"), "export default {};");

    await expect(
      pluginManager.install({ type: "local", path: TEST_PLUGIN_DIR }),
    ).rejects.toThrow(/manifest/i);
  });

  test("should remove plugin cleanly", async () => {
    const pluginName = `remove-test-${Date.now()}`;

    writeFileSync(join(TEST_PLUGIN_DIR, "index.ts"), "export default {};");
    writeFileSync(
      join(TEST_PLUGIN_DIR, "manifest.json"),
      JSON.stringify(createValidManifest(pluginName), null, 2),
    );

    await pluginManager.install({ type: "local", path: TEST_PLUGIN_DIR });

    // Verify installed
    expect(pluginManager.show(pluginName)).toBeDefined();

    // Remove
    await pluginManager.remove(pluginName);

    // Verify removed
    expect(pluginManager.show(pluginName)).toBeUndefined();
  });

  test("should enable and disable plugins", async () => {
    const pluginName = `toggle-test-${Date.now()}`;

    writeFileSync(join(TEST_PLUGIN_DIR, "index.ts"), "export default {};");
    writeFileSync(
      join(TEST_PLUGIN_DIR, "manifest.json"),
      JSON.stringify(createValidManifest(pluginName), null, 2),
    );

    await pluginManager.install({ type: "local", path: TEST_PLUGIN_DIR });

    // Disable
    pluginManager.disable(pluginName);
    expect(pluginManager.show(pluginName)?.enabled).toBe(false);
    expect(pluginManager.getEnabled().some((p) => p.manifest.name === pluginName)).toBe(false);

    // Enable
    pluginManager.enable(pluginName);
    expect(pluginManager.show(pluginName)?.enabled).toBe(true);
    expect(pluginManager.getEnabled().some((p) => p.manifest.name === pluginName)).toBe(true);

    // Cleanup
    await pluginManager.remove(pluginName);
  });
});
