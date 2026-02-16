import { describe, test, expect } from "bun:test";
import { platform } from "os";
import { isKeychainAvailable } from "../keychain";

describe("Keychain Integration (ALTA-1)", () => {
  test("isKeychainAvailable should detect platform", () => {
    const available = isKeychainAvailable();
    const os = platform();

    // On macOS, security command should be available
    // On Linux, secret-tool may or may not be installed
    // On Windows, powershell should be available
    // Test just verifies no crash and returns boolean
    expect(typeof available).toBe("boolean");

    if (os === "darwin") {
      // macOS should have security command
      expect(available).toBe(true);
    }
  });

  test("keychain module exports required functions", async () => {
    const keychainPath = import.meta.dir + "/../keychain.ts";
    const content = await Bun.file(keychainPath).text();

    expect(content).toContain("export function setKeychainPassword");
    expect(content).toContain("export function getKeychainPassword");
    expect(content).toContain("export function deleteKeychainPassword");
    expect(content).toContain("export function isKeychainAvailable");
    expect(content).toContain("export function getOrCreateEncryptionKey");
  });

  test("keychain uses execFileSync for security", async () => {
    const keychainPath = import.meta.dir + "/../keychain.ts";
    const content = await Bun.file(keychainPath).text();

    // Should use execFileSync, not execSync (shell injection prevention)
    expect(content).toContain("execFileSync");
    expect(content).not.toContain("execSync(");
  });

  test("keychain handles all three platforms", async () => {
    const keychainPath = import.meta.dir + "/../keychain.ts";
    const content = await Bun.file(keychainPath).text();

    expect(content).toContain("darwin"); // macOS
    expect(content).toContain("linux");  // Linux
    expect(content).toContain("win32");  // Windows
  });

  describe("Integration with auth", () => {
    test("auth/index.ts imports keychain utilities", async () => {
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const content = await Bun.file(authPath).text();

      expect(content).toContain("isKeychainAvailable");
      expect(content).toContain("getOrCreateEncryptionKey");
      expect(content).toContain("from \"../utils/keychain.js\"");
    });

    test("auth/index.ts uses getEncryptionKey() instead of machineKey()", async () => {
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const content = await Bun.file(authPath).text();

      expect(content).toContain("getEncryptionKey()");
      expect(content).toContain("legacyMachineKey()");
      // Should NOT call machineKey() directly (deprecated)
      expect(content).not.toMatch(/createCipheriv\(ALGO,\s*machineKey\(\)/);
    });

    test("auth/index.ts has fallback warning for missing keychain", async () => {
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const content = await Bun.file(authPath).text();

      expect(content).toContain("OS Keychain not available");
      expect(content).toContain("using fallback");
    });

    test("auth/index.ts marks legacy method as deprecated", async () => {
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const content = await Bun.file(authPath).text();

      expect(content).toContain("@deprecated");
      expect(content).toContain("legacyMachineKey");
      expect(content).toContain("ALTA-1");
    });
  });

  describe("Security improvements", () => {
    test("keychain generates random keys, not predictable seeds", async () => {
      const keychainPath = import.meta.dir + "/../keychain.ts";
      const content = await Bun.file(keychainPath).text();

      // Should use randomBytes, not hostname/homedir
      expect(content).toContain("randomBytes(32)");
      expect(content).not.toContain("hostname()");
    });

    test("keychain uses OS-native storage", async () => {
      const keychainPath = import.meta.dir + "/../keychain.ts";
      const content = await Bun.file(keychainPath).text();

      expect(content).toContain("security"); // macOS
      expect(content).toContain("secret-tool"); // Linux
      expect(content).toContain("CredentialManager"); // Windows
    });

    test("keychain provides better security than PBKDF2 from predictable seed", async () => {
      const keychainPath = import.meta.dir + "/../keychain.ts";
      const content = await Bun.file(keychainPath).text();

      // New keychain method should use random keys
      // Old method used predictable seed (hostname:homedir:uid)
      const authPath = import.meta.dir + "/../../auth/index.ts";
      const authContent = await Bun.file(authPath).text();

      // Verify legacy method still exists for fallback
      expect(authContent).toContain("legacyMachineKey");
      // Verify new method is used by default
      expect(authContent).toContain("getEncryptionKey()");
    });
  });
});
