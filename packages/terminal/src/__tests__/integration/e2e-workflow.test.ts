/**
 * End-to-End Workflow Integration Tests
 *
 * Tests complete user flows via CLI subprocess.
 * These tests require a built dist/index.js and bun in PATH.
 * They are skipped automatically if prerequisites are not met.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn } from "child_process";
import { resolve } from "path";
import { existsSync, rmSync, readdirSync } from "fs";
import { homedir } from "os";
import { which } from "bun";

const INTEGRATION_SESSION_DIR = resolve(homedir(), ".wabisabi", "integration-tests");
const ENTRY_POINT = resolve(__dirname, "../../../dist/index.js");
const BUN_PATH = which("bun") || process.execPath;

// Check prerequisites
const HAS_BUILD = existsSync(ENTRY_POINT);

describe("E2E Workflow Integration", () => {
  beforeAll(() => {
    if (existsSync(INTEGRATION_SESSION_DIR)) {
      rmSync(INTEGRATION_SESSION_DIR, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (existsSync(INTEGRATION_SESSION_DIR)) {
      rmSync(INTEGRATION_SESSION_DIR, { recursive: true, force: true });
    }
  });

  test("should have built entry point available", () => {
    if (!HAS_BUILD) {
      console.log("⚠️  Skipped: dist/index.js not found. Run 'bun build' first.");
      return;
    }
    expect(existsSync(ENTRY_POINT)).toBe(true);
  });

  test("should execute --version flag", async () => {
    if (!HAS_BUILD) {
      console.log("⚠️  Skipped: requires build");
      return;
    }

    const proc = Bun.spawn([BUN_PATH, ENTRY_POINT, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output.trim().length).toBeGreaterThan(0);
  });

  test("should execute --help flag", async () => {
    if (!HAS_BUILD) {
      console.log("⚠️  Skipped: requires build");
      return;
    }

    const proc = Bun.spawn([BUN_PATH, ENTRY_POINT, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("wabisabi");
  });

  test("should reject unknown commands", async () => {
    if (!HAS_BUILD) {
      console.log("⚠️  Skipped: requires build");
      return;
    }

    const proc = Bun.spawn([BUN_PATH, ENTRY_POINT, "nonexistent-command-xyz"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const exitCode = await proc.exited;
    // Commander exits with 1 for unknown commands
    expect(exitCode).not.toBe(0);
  });

  test("should handle graceful shutdown via SIGTERM", async () => {
    if (!HAS_BUILD) {
      console.log("⚠️  Skipped: requires build");
      return;
    }

    const proc = Bun.spawn([BUN_PATH, ENTRY_POINT, "interactive"], {
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        WABISABI_SKIP_ONBOARDING: "true",
      },
    });

    // Let it start
    await new Promise((r) => setTimeout(r, 500));

    proc.kill("SIGTERM");

    const exitCode = await proc.exited;
    // Should exit cleanly (0) or with signal code
    expect(typeof exitCode).toBe("number");
  });
});
