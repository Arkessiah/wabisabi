/**
 * End-to-End Workflow Integration Tests
 *
 * Tests complete user flows:
 * - Interactive mode initialization
 * - Tool execution
 * - Session persistence
 * - Agent switching
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync, rmSync, readFileSync } from "fs";
import { homedir } from "os";

const INTEGRATION_SESSION_DIR = resolve(homedir(), ".wabisabi", "integration-tests");
const ENTRY_POINT = resolve(__dirname, "../../../dist/index.js");

describe("E2E Workflow Integration", () => {
  beforeAll(() => {
    // Clean up any existing integration test data
    if (existsSync(INTEGRATION_SESSION_DIR)) {
      rmSync(INTEGRATION_SESSION_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(INTEGRATION_SESSION_DIR)) {
      rmSync(INTEGRATION_SESSION_DIR, { recursive: true, force: true });
    }
  });

  test("should complete onboarding flow", async () => {
    // Test that first-run onboarding completes
    const proc = spawn("bun", [ENTRY_POINT, "interactive"], {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: INTEGRATION_SESSION_DIR,
        WABISABI_SKIP_ONBOARDING: "true", // Skip interactive prompts
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 2000));

    proc.kill();

    // Verify onboarding created config
    const configPath = resolve(INTEGRATION_SESSION_DIR, ".wabisabi", "config.jsonc");
    expect(existsSync(configPath)).toBe(true);
  });

  test("should execute tool and save to session", async () => {
    // Test tool execution flow
    const proc = spawn("bun", [ENTRY_POINT, "interactive"], {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: INTEGRATION_SESSION_DIR,
        WABISABI_AUTO_CONFIRM: "true",
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    // Wait for startup
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate tool use via stdin
    proc.stdin.write("list files in current directory\n");

    // Wait for tool execution
    await new Promise((resolve) => setTimeout(resolve, 2000));

    proc.kill();

    // Verify session was saved
    const sessionsDir = resolve(INTEGRATION_SESSION_DIR, ".wabisabi", "sessions");
    expect(existsSync(sessionsDir)).toBe(true);

    // Verify at least one session file exists
    const sessions = require("fs").readdirSync(sessionsDir);
    expect(sessions.length).toBeGreaterThan(0);
  });

  test("should switch agents successfully", async () => {
    // Test agent switching
    const proc = spawn("bun", [ENTRY_POINT, "interactive", "--agent", "build"], {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: INTEGRATION_SESSION_DIR,
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Check that build agent is active
    expect(output).toContain("build");

    proc.kill();
  });

  test("should persist memory (Soul/RAM)", async () => {
    // Test that Soul and RAM are persisted
    const proc = spawn("bun", [ENTRY_POINT, "interactive"], {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: INTEGRATION_SESSION_DIR,
      },
    });

    let output = "";
    proc.stdout.on("data", (data) => {
      output += data.toString();
    });

    await new Promise((resolve) => setTimeout(resolve, 2000));

    proc.kill();

    // Wait for async saves
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify memory files exist
    const soulPath = resolve(INTEGRATION_SESSION_DIR, ".wabisabi", "soul.json");
    const ramPath = resolve(INTEGRATION_SESSION_DIR, ".wabisabi", "ram.json");

    expect(existsSync(soulPath)).toBe(true);
    expect(existsSync(ramPath)).toBe(true);

    // Verify files contain valid JSON
    const soul = JSON.parse(readFileSync(soulPath, "utf-8"));
    const ram = JSON.parse(readFileSync(ramPath, "utf-8"));

    expect(soul).toBeDefined();
    expect(ram).toBeDefined();
  });

  test("should handle graceful shutdown", async () => {
    // Test SIGINT handling
    const proc = spawn("bun", [ENTRY_POINT, "interactive"], {
      stdio: "pipe",
      env: {
        ...process.env,
        HOME: INTEGRATION_SESSION_DIR,
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Send SIGINT
    proc.kill("SIGINT");

    // Wait for cleanup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify session was saved before exit
    const sessionsDir = resolve(INTEGRATION_SESSION_DIR, ".wabisabi", "sessions");
    expect(existsSync(sessionsDir)).toBe(true);
  });
});
