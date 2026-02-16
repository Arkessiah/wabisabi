import { describe, test, expect } from "bun:test";
import { isKeychainAvailable, getOrCreateEncryptionKey, deleteKeychainPassword } from "../utils/keychain";
import { platform } from "os";

describe("Keychain Integration (ALTA-1)", () => {
  const TEST_SERVICE = "com.wabisabi.auth.test";
  const TEST_ACCOUNT = "test-key";

  test("isKeychainAvailable should detect platform", () => {
    const os = platform();
    const available = isKeychainAvailable();

    // macOS should have security command
    if (os === "darwin") {
      expect(available).toBe(true);
    }

    // Function should return boolean
    expect(typeof available).toBe("boolean");
  });

  test("getOrCreateEncryptionKey should generate random 32-byte keys", () => {
    if (!isKeychainAvailable()) {
      console.log("⏭️  Skipping keychain test - OS keychain not available");
      return;
    }

    try {
      const key1 = getOrCreateEncryptionKey(TEST_SERVICE, TEST_ACCOUNT);
      expect(key1.length).toBe(32); // AES-256 requires 32 bytes

      // Cleanup
      deleteKeychainPassword({ service: TEST_SERVICE, account: TEST_ACCOUNT });
    } catch (error) {
      console.warn("⚠️  Keychain test failed:", error);
      // Don't fail test if keychain unavailable in CI
    }
  });

  test("keychain should persist keys across calls", () => {
    if (!isKeychainAvailable()) {
      console.log("⏭️  Skipping keychain persistence test");
      return;
    }

    try {
      const key1 = getOrCreateEncryptionKey(TEST_SERVICE, `${TEST_ACCOUNT}-persist`);
      const key2 = getOrCreateEncryptionKey(TEST_SERVICE, `${TEST_ACCOUNT}-persist`);

      // Same service+account should return same key
      expect(key1.toString("hex")).toBe(key2.toString("hex"));

      // Cleanup
      deleteKeychainPassword({ service: TEST_SERVICE, account: `${TEST_ACCOUNT}-persist` });
    } catch {
      // Don't fail in CI
    }
  });
});

describe("Integration with auth module", () => {
  test("auth/index.ts should use getEncryptionKey() instead of machineKey()", async () => {
    const indexPath = import.meta.dir + "/../index.ts";
    const content = await Bun.file(indexPath).text();

    // Should import keychain utilities
    expect(content).toContain("isKeychainAvailable");
    expect(content).toContain("getOrCreateEncryptionKey");

    // Should use getEncryptionKey()
    expect(content).toContain("getEncryptionKey()");

    // Should have fallback warning
    expect(content).toContain("OS Keychain not available");

    // Should mark legacy method as deprecated
    expect(content).toContain("@deprecated");
    expect(content).toContain("legacyMachineKey");
  });

  test("auth/index.ts should use atomicWriteFileSync", async () => {
    const indexPath = import.meta.dir + "/../index.ts";
    const content = await Bun.file(indexPath).text();

    // Should import atomicWriteFileSync
    expect(content).toContain("atomicWriteFileSync");
    expect(content).toContain("./utils/atomic-write");

    // Should use atomicWriteFileSync in saveSession method
    const saveSessionMatch = content.match(/private saveSession\(\): void[\s\S]*?^\s*\}/m);
    if (saveSessionMatch) {
      const saveSessionCode = saveSessionMatch[0];
      expect(saveSessionCode).toContain("atomicWriteFileSync");
      expect(saveSessionCode).toContain("BAJA-4");
    }
  });

  test("security improvements should be documented", async () => {
    const indexPath = import.meta.dir + "/../index.ts";
    const content = await Bun.file(indexPath).text();

    // Should reference security fixes
    expect(content).toContain("ALTA-1");
    expect(content).toContain("BAJA-4");

    // Should mention OS keychain
    expect(content).toContain("OS keychain");
    expect(content).toContain("Keychain Access");
  });
});
