import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FileAdapter, MemoryAdapter } from "../adapters";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("Collection Name Security (BAJA-2)", () => {
  const testDbPath = join(tmpdir(), "wabisabi-test-db");

  beforeEach(() => {
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
    mkdirSync(testDbPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDbPath)) {
      rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe("FileAdapter", () => {
    test("should allow valid collection names (alphanumeric)", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      const record = { id: "1", data: "test" };

      // Should work fine with valid names
      await expect(adapter.insert("users", record)).resolves.toBeDefined();
      await expect(adapter.insert("sessions2023", record)).resolves.toBeDefined();
      await expect(adapter.insert("auth_tokens", record)).resolves.toBeDefined();
      await expect(adapter.insert("api-keys", record)).resolves.toBeDefined();
      await expect(adapter.insert("db_v2", record)).resolves.toBeDefined();
    });

    test("should reject collection names with path traversal (../)", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      const record = { id: "1", data: "test" };

      await expect(adapter.insert("../etc/passwd", record)).rejects.toThrow(
        /Invalid collection name/
      );
    });

    test("should reject collection names with absolute paths", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      const record = { id: "1", data: "test" };

      await expect(adapter.insert("/etc/passwd", record)).rejects.toThrow(
        /Invalid collection name/
      );
    });

    test("should reject collection names with special characters", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      const record = { id: "1", data: "test" };

      await expect(adapter.insert("users@domain", record)).rejects.toThrow(
        /Invalid collection name/
      );
      await expect(adapter.insert("auth:tokens", record)).rejects.toThrow(
        /Invalid collection name/
      );
      await expect(adapter.insert("data.json", record)).rejects.toThrow(
        /Invalid collection name/
      );
    });

    test("should reject collection names with spaces", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      const record = { id: "1", data: "test" };

      await expect(adapter.insert("user sessions", record)).rejects.toThrow(
        /Invalid collection name/
      );
    });

    test("should validate on query()", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      await expect(adapter.query("../etc/passwd")).rejects.toThrow(
        /Invalid collection name/
      );
    });

    test("should validate on update()", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      await expect(
        adapter.update("../etc/passwd", "1", { data: "test" })
      ).rejects.toThrow(/Invalid collection name/);
    });

    test("should validate on delete()", async () => {
      const adapter = new FileAdapter(testDbPath);
      await adapter.connect();

      await expect(adapter.delete("../etc/passwd", "1")).rejects.toThrow(
        /Invalid collection name/
      );
    });
  });

  describe("MemoryAdapter", () => {
    test("should enforce same validation rules", async () => {
      const adapter = new MemoryAdapter();
      await adapter.connect();

      const record = { id: "1", data: "test" };

      // Valid names should work
      await expect(adapter.insert("valid_name", record)).resolves.toBeDefined();

      // Invalid names should be rejected
      await expect(adapter.insert("../passwd", record)).rejects.toThrow(
        /Invalid collection name/
      );
      await expect(adapter.insert("/etc/shadow", record)).rejects.toThrow(
        /Invalid collection name/
      );
      await expect(adapter.query("user:admin")).rejects.toThrow(
        /Invalid collection name/
      );
    });
  });

  describe("validateCollectionName function", () => {
    test("should be present in adapters.ts", async () => {
      const adaptersPath = import.meta.dir + "/../adapters.ts";
      const content = await Bun.file(adaptersPath).text();

      expect(content).toContain("validateCollectionName");
      expect(content).toContain("/^[a-zA-Z0-9_-]+$/");
    });

    test("should be called in FileAdapter.getFilePath()", async () => {
      const adaptersPath = import.meta.dir + "/../adapters.ts";
      const content = await Bun.file(adaptersPath).text();

      // Check that getFilePath calls validation
      expect(content).toContain("private getFilePath");
      expect(content).toContain("validateCollectionName(collection)");
    });
  });
});
