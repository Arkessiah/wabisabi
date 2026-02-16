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
    expect(config.substratum).toBe("http://localhost:3001");
    expect(config.streaming).toBe(true);
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
});
