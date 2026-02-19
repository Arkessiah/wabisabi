/**
 * Tests for ConfigManager
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ConfigManager } from "../config/index.js";

const TEST_DIR = join(tmpdir(), `wabisabi-config-test-${Date.now()}`);
const GLOBAL_DIR = join(TEST_DIR, "global");
const PROJECT_DIR = join(TEST_DIR, "project");

beforeAll(() => {
  mkdirSync(join(GLOBAL_DIR, ".wabisabi"), { recursive: true });
  mkdirSync(join(PROJECT_DIR, ".wabisabi"), { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("ConfigManager", () => {
  test("returns defaults when no config file exists", () => {
    const mgr = new ConfigManager();
    const config = mgr.getGlobal();
    expect(config.model).toBe("llama3.2");
    expect(config.streaming).toBe(true);
    // Legacy fields are optional (migrated to providers)
    expect(config.substratum).toBeUndefined();
    // Providers resolved via getProviders()
    const providers = mgr.getProviders();
    expect(providers.ollama.nodes[0].url).toBe("http://localhost:11434");
    expect(providers.substratum.url).toBe("https://api.substratum.dev");
    expect(providers.substratum.enabled).toBe(false);
  });

  test("loads global config from JSONC file", () => {
    // Write a config with comments
    const configPath = join(GLOBAL_DIR, ".wabisabi", "config.jsonc");
    writeFileSync(
      configPath,
      `{
  // This is a comment
  "model": "gpt-4",
  "temperature": 0.5
}`,
    );

    const mgr = new ConfigManager();
    // Manually set the path (hack for testing)
    const origMethod = mgr.getGlobalConfigPath.bind(mgr);
    mgr.getGlobalConfigPath = () => configPath;

    const config = mgr.loadGlobal();
    expect(config.model).toBe("gpt-4");
    expect(config.temperature).toBe(0.5);
    // Defaults still apply for unset fields
    expect(config.streaming).toBe(true);

    mgr.getGlobalConfigPath = origMethod;
  });

  test("loads project config and merges with global", () => {
    const projectConfigPath = join(PROJECT_DIR, ".wabisabi", "config.jsonc");
    writeFileSync(
      projectConfigPath,
      `{ "model": "claude-3", "projectName": "TestProject" }`,
    );

    const mgr = new ConfigManager();
    mgr.loadProject(PROJECT_DIR);

    const merged = mgr.getMerged();
    // Project overrides global
    expect(merged.model).toBe("claude-3");
    // Global defaults still present
    expect(merged.streaming).toBe(true);

    const project = mgr.getProject();
    expect(project?.projectName).toBe("TestProject");
  });

  test("update changes value and auto-saves", () => {
    const configPath = join(TEST_DIR, "autosave", ".wabisabi", "config.jsonc");
    mkdirSync(join(TEST_DIR, "autosave", ".wabisabi"), { recursive: true });

    const mgr = new ConfigManager();
    mgr.getGlobalConfigPath = () => configPath;

    mgr.update("model", "new-model");

    // Should have auto-saved
    expect(existsSync(configPath)).toBe(true);
    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(saved.model).toBe("new-model");

    // In-memory value also updated
    expect(mgr.getGlobal().model).toBe("new-model");
  });

  // ── Migration tests ──────────────────────────────────────────

  test("migrates legacy flat config to providers format", () => {
    const configPath = join(TEST_DIR, "migrate", ".wabisabi", "config.jsonc");
    mkdirSync(join(TEST_DIR, "migrate", ".wabisabi"), { recursive: true });

    // Legacy format: flat URL strings
    writeFileSync(
      configPath,
      JSON.stringify({
        model: "llama3.2",
        substratum: "https://custom.substratum.io",
        ollama: "http://192.168.1.100:11434",
      }),
    );

    const mgr = new ConfigManager();
    mgr.getGlobalConfigPath = () => configPath;
    mgr.loadGlobal();

    const providers = mgr.getProviders();
    // Ollama migrated to cluster node
    expect(providers.ollama.mode).toBe("local");
    expect(providers.ollama.nodes).toHaveLength(1);
    expect(providers.ollama.nodes[0].url).toBe("http://192.168.1.100:11434");
    // Substratum migrated with custom URL → enabled
    expect(providers.substratum.url).toBe("https://custom.substratum.io");
    expect(providers.substratum.enabled).toBe(true);
  });

  test("preserves new providers format without migration", () => {
    const configPath = join(TEST_DIR, "new-format", ".wabisabi", "config.jsonc");
    mkdirSync(join(TEST_DIR, "new-format", ".wabisabi"), { recursive: true });

    writeFileSync(
      configPath,
      JSON.stringify({
        model: "llama3.2",
        providers: {
          substratum: { enabled: true, url: "https://api.substratum.dev", apiKey: "test-key" },
          ollama: {
            mode: "cluster",
            nodes: [
              { name: "mac-studio", url: "http://192.168.1.10:11434", gpu: "metal", priority: 8 },
              { name: "ubuntu-gpu", url: "http://192.168.1.20:11434", gpu: "nvidia", priority: 10 },
            ],
          },
        },
      }),
    );

    const mgr = new ConfigManager();
    mgr.getGlobalConfigPath = () => configPath;
    mgr.loadGlobal();

    const providers = mgr.getProviders();
    expect(providers.ollama.mode).toBe("cluster");
    expect(providers.ollama.nodes).toHaveLength(2);
    expect(providers.ollama.nodes[0].name).toBe("mac-studio");
    expect(providers.ollama.nodes[1].gpu).toBe("nvidia");
    expect(providers.substratum.enabled).toBe(true);
    expect(providers.substratum.apiKey).toBe("test-key");
  });

  test("getProviders returns defaults for empty config", () => {
    const mgr = new ConfigManager();
    const providers = mgr.getProviders();

    expect(providers.substratum.enabled).toBe(false);
    expect(providers.substratum.url).toBe("https://api.substratum.dev");
    expect(providers.ollama.mode).toBe("local");
    expect(providers.ollama.nodes[0].name).toBe("local");
  });

  test("update providers persists cluster config", () => {
    const configPath = join(TEST_DIR, "update-providers", ".wabisabi", "config.jsonc");
    mkdirSync(join(TEST_DIR, "update-providers", ".wabisabi"), { recursive: true });

    const mgr = new ConfigManager();
    mgr.getGlobalConfigPath = () => configPath;

    const newProviders = {
      substratum: { enabled: true, url: "https://api.substratum.dev" },
      ollama: {
        mode: "cluster" as const,
        nodes: [
          { name: "node-a", url: "http://a:11434", priority: 5 },
          { name: "node-b", url: "http://b:11434", priority: 7 },
        ],
      },
    };

    mgr.update("providers", newProviders);

    // Verify persisted
    const saved = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(saved.providers.ollama.nodes).toHaveLength(2);
    expect(saved.providers.substratum.enabled).toBe(true);
  });
});
