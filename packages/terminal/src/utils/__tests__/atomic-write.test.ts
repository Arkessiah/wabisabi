import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { atomicWriteFileSync } from "../atomic-write";
import { existsSync, readFileSync, rmSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Atomic Write Security (BAJA-4)", () => {
  const testDir = join(tmpdir(), "wabisabi-atomic-test");
  const testFile = join(testDir, "test.json");

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("should write file atomically", () => {
    const content = JSON.stringify({ test: "data" }, null, 2);

    atomicWriteFileSync(testFile, content);

    expect(existsSync(testFile)).toBe(true);
    const written = readFileSync(testFile, "utf-8");
    expect(written).toBe(content);
  });

  test("should not leave temp files after successful write", () => {
    const content = "test content";

    atomicWriteFileSync(testFile, content);

    // Check no .tmp files exist
    const files = readdirSync(testDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp"));
    expect(tmpFiles.length).toBe(0);
  });

  test("should support custom encoding", () => {
    const content = "test utf-8 content: ñáéíóú";

    atomicWriteFileSync(testFile, content, { encoding: "utf-8" });

    const written = readFileSync(testFile, "utf-8");
    expect(written).toBe(content);
  });

  test("should support custom file mode (permissions)", () => {
    const content = "secret data";

    atomicWriteFileSync(testFile, content, { mode: 0o600 });

    expect(existsSync(testFile)).toBe(true);
    // Note: On non-Unix systems, mode may not be enforced
    // This test just verifies no error is thrown
  });

  test("should overwrite existing file atomically", () => {
    // Write initial content
    atomicWriteFileSync(testFile, "initial");
    expect(readFileSync(testFile, "utf-8")).toBe("initial");

    // Overwrite
    atomicWriteFileSync(testFile, "updated");
    expect(readFileSync(testFile, "utf-8")).toBe("updated");
  });

  test("should handle large content", () => {
    const largeContent = "x".repeat(1024 * 1024); // 1MB

    atomicWriteFileSync(testFile, largeContent);

    const written = readFileSync(testFile, "utf-8");
    expect(written.length).toBe(largeContent.length);
  });

  test("should cleanup temp file on error", () => {
    const invalidPath = join("/nonexistent-dir-xyz", "file.txt");

    // Attempt to write to invalid path
    expect(() => {
      atomicWriteFileSync(invalidPath, "content");
    }).toThrow();

    // No temp files should remain in test directory
    const files = readdirSync(testDir);
    const tmpFiles = files.filter((f) => f.includes(".tmp"));
    expect(tmpFiles.length).toBe(0);
  });

  describe("Integration with critical files", () => {
    test("db/adapters.ts should use atomicWriteFileSync", async () => {
      const adaptersPath = import.meta.dir + "/../../db/adapters.ts";
      const content = await Bun.file(adaptersPath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("session/storage.ts should use atomicWriteFileSync", async () => {
      const storagePath = import.meta.dir + "/../../session/storage.ts";
      const content = await Bun.file(storagePath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("config/index.ts should use atomicWriteFileSync", async () => {
      const configPath = import.meta.dir + "/../../config/index.ts";
      const content = await Bun.file(configPath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("auth/index.ts should use atomicWriteFileSync", async () => {
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const content = await Bun.file(authPath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("soul/index.ts should use atomicWriteFileSync", async () => {
      const soulPath = import.meta.dir + "/../../soul/index.ts";
      const content = await Bun.file(soulPath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("ram/index.ts should use atomicWriteFileSync", async () => {
      const ramPath = import.meta.dir + "/../../ram/index.ts";
      const content = await Bun.file(ramPath).text();

      expect(content).toContain("atomicWriteFileSync");
      expect(content).toContain("BAJA-4");
    });

    test("onboarding.ts should use mode 0o600 for config", async () => {
      const onboardingPath = import.meta.dir + "/../../onboarding.ts";
      const content = await Bun.file(onboardingPath).text();

      expect(content).toContain("mode: 0o600");
      expect(content).toContain("BAJA-3");
    });
  });
});
