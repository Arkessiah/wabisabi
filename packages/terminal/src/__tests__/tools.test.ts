/**
 * Tests for individual tools: read, write, edit, glob, list, git
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { configManager } from "../config/index.js";

// Import tools directly
import { readTool } from "../tools/read.js";
import { writeTool } from "../tools/write.js";
import { editTool } from "../tools/edit.js";
import { globTool } from "../tools/glob.js";
import { listTool } from "../tools/list.js";
import { gitTool } from "../tools/git.js";

const TEST_DIR = join(tmpdir(), `wabisabi-test-${Date.now()}`);
const ctx = { projectRoot: TEST_DIR };

beforeAll(() => {
  // Enable all tool permissions for tests
  configManager.update("tools", {
    allowFileRead: true,
    allowFileWrite: true,
    allowBash: true,
    allowGrep: true,
    allowGlob: true,
    allowList: true,
  });

  mkdirSync(join(TEST_DIR, "src"), { recursive: true });
  writeFileSync(
    join(TEST_DIR, "hello.txt"),
    "line one\nline two\nline three\n",
  );
  writeFileSync(
    join(TEST_DIR, "src", "index.ts"),
    'export const x = 1;\nexport const y = 2;\n',
  );

  // Initialize git repo for git tool tests
  execSync("git init", { cwd: TEST_DIR, stdio: "ignore" });
  execSync("git config user.email 'test@test.com'", { cwd: TEST_DIR, stdio: "ignore" });
  execSync("git config user.name 'Test'", { cwd: TEST_DIR, stdio: "ignore" });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// ── Read Tool ─────────────────────────────────────────────────

describe("read tool", () => {
  test("reads file with line numbers", async () => {
    const result = await readTool.execute(
      { filePath: join(TEST_DIR, "hello.txt") },
      ctx,
    );
    expect(result.output).toContain("line one");
    expect(result.output).toContain("00001|");
    expect(result.metadata.error).toBeUndefined();
  });

  test("returns error for missing file", async () => {
    const result = await readTool.execute(
      { filePath: join(TEST_DIR, "nope.txt") },
      ctx,
    );
    expect(result.output).toContain("not found");
  });

  test("supports offset and limit", async () => {
    const result = await readTool.execute(
      { filePath: join(TEST_DIR, "hello.txt"), offset: 2, limit: 1 },
      ctx,
    );
    expect(result.output).toContain("line two");
    expect(result.output).not.toContain("line one");
  });
});

// ── Write Tool ────────────────────────────────────────────────

describe("write tool", () => {
  test("creates a new file", async () => {
    const path = join(TEST_DIR, "new-file.txt");
    const result = await writeTool.execute(
      { filePath: path, content: "hello world" },
      ctx,
    );
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe("hello world");
    expect(result.title).toContain("Created");
  });

  test("creates parent directories", async () => {
    const path = join(TEST_DIR, "deep", "nested", "file.txt");
    await writeTool.execute(
      { filePath: path, content: "deep" },
      ctx,
    );
    expect(existsSync(path)).toBe(true);
  });

  test("overwrites existing file with diff", async () => {
    const path = join(TEST_DIR, "hello.txt");
    const result = await writeTool.execute(
      { filePath: path, content: "updated content\n" },
      ctx,
    );
    expect(result.title).toContain("Updated");
    expect(readFileSync(path, "utf-8")).toBe("updated content\n");
  });
});

// ── Edit Tool ─────────────────────────────────────────────────

describe("edit tool", () => {
  test("replaces text in a file", async () => {
    const path = join(TEST_DIR, "edit-test.txt");
    writeFileSync(path, "foo bar baz\n");

    const result = await editTool.execute(
      { filePath: path, oldString: "bar", newString: "qux" },
      ctx,
    );
    expect(readFileSync(path, "utf-8")).toBe("foo qux baz\n");
    expect(result.title).toContain("Edited");
  });

  test("fails when oldString not found", async () => {
    const path = join(TEST_DIR, "edit-test.txt");
    const result = await editTool.execute(
      { filePath: path, oldString: "nonexistent", newString: "x" },
      ctx,
    );
    expect(result.title).toContain("failed");
  });

  test("replaces all occurrences with replaceAll", async () => {
    const path = join(TEST_DIR, "replace-all.txt");
    writeFileSync(path, "a b a c a\n");

    const result = await editTool.execute(
      { filePath: path, oldString: "a", newString: "X", replaceAll: true },
      ctx,
    );
    expect(readFileSync(path, "utf-8")).toBe("X b X c X\n");
    expect(result.metadata.matchCount).toBe(3);
  });
});

// ── Glob Tool ─────────────────────────────────────────────────

describe("glob tool", () => {
  test("finds files by pattern", async () => {
    const result = await globTool.execute(
      { pattern: "**/*.ts" },
      ctx,
    );
    expect(result.output).toContain("index.ts");
  });

  test("returns empty for no matches", async () => {
    const result = await globTool.execute(
      { pattern: "**/*.xyz" },
      ctx,
    );
    expect(result.output).toContain("No files");
  });
});

// ── List Tool ─────────────────────────────────────────────────

describe("list tool", () => {
  test("lists directory tree", async () => {
    const result = await listTool.execute({}, ctx);
    expect(result.output).toContain("src");
  });
});

// ── Git Tool ──────────────────────────────────────────────────

describe("git tool", () => {
  test("commit requires message", async () => {
    const result = await gitTool.execute(
      { subcommand: "commit" },
      ctx,
    );
    expect(result.output).toContain("message");
    expect(result.metadata.error).toBe(true);
  });

  test("add requires files", async () => {
    const result = await gitTool.execute(
      { subcommand: "add" },
      ctx,
    );
    expect(result.output).toContain("files");
    expect(result.metadata.error).toBe(true);
  });

  test("checkout requires target", async () => {
    const result = await gitTool.execute(
      { subcommand: "checkout" },
      ctx,
    );
    expect(result.output).toContain("branch");
    expect(result.metadata.error).toBe(true);
  });

  test("merge requires branch", async () => {
    const result = await gitTool.execute(
      { subcommand: "merge" },
      ctx,
    );
    expect(result.output).toContain("branch");
    expect(result.metadata.error).toBe(true);
  });

  test("cherry-pick requires commit", async () => {
    const result = await gitTool.execute(
      { subcommand: "cherry-pick" },
      ctx,
    );
    expect(result.output).toContain("commit");
    expect(result.metadata.error).toBe(true);
  });

  test("status runs in git repo", async () => {
    const result = await gitTool.execute(
      { subcommand: "status" },
      ctx,
    );
    expect(result.metadata.error).toBeFalsy();
  });

  test("validates .git exists", async () => {
    const noGitDir = join(tmpdir(), `no-git-${Date.now()}`);
    mkdirSync(noGitDir, { recursive: true });
    const result = await gitTool.execute(
      { subcommand: "status" },
      { projectRoot: noGitDir },
    );
    expect(result.output).toContain("No .git directory");
    expect(result.metadata.error).toBe(true);
    rmSync(noGitDir, { recursive: true, force: true });
  });
});
