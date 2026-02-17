/**
 * Auth Flow Integration Tests
 *
 * Tests authentication infrastructure:
 * - AuthManager initialization
 * - Token utilities (decode, expiry check)
 * - Login/logout flow
 * - OS Keychain availability detection
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const TEST_AUTH_DIR = join(homedir(), ".wabisabi", "integration-test-auth");

describe("Auth Flow Integration", () => {
  const originalEnv = process.env.WABISABI_API_KEY;

  beforeEach(() => {
    if (existsSync(TEST_AUTH_DIR)) {
      rmSync(TEST_AUTH_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_AUTH_DIR, { recursive: true });
  });

  afterEach(() => {
    // Restore env
    if (originalEnv !== undefined) {
      process.env.WABISABI_API_KEY = originalEnv;
    } else {
      delete process.env.WABISABI_API_KEY;
    }
    if (existsSync(TEST_AUTH_DIR)) {
      rmSync(TEST_AUTH_DIR, { recursive: true, force: true });
    }
  });

  test("should initialize auth manager", async () => {
    const { AuthManager } = await import("../../auth/index.js");

    const authManager = new AuthManager();
    expect(authManager).toBeDefined();
    expect(typeof authManager.isAuthenticated()).toBe("boolean");
  });

  test("should authenticate via API key env var", async () => {
    process.env.WABISABI_API_KEY = "test-api-key-12345";
    const { AuthManager } = await import("../../auth/index.js");

    const authManager = new AuthManager();
    expect(authManager.isAuthenticated()).toBe(true);

    const headers = await authManager.getAuthHeaders();
    expect(headers).toBeDefined();
    expect(headers["X-API-Key"]).toBe("test-api-key-12345");
  });

  test("should detect token expiration correctly", async () => {
    const { isExpired, needsRefresh } = await import("../../auth/token.js");

    // JWT with exp far in the future (year 2286)
    const futureToken =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiZXhwIjo5OTk5OTk5OTk5fQ.xxx";

    expect(isExpired(futureToken)).toBe(false);
    expect(needsRefresh(futureToken)).toBe(false);
  });

  test("should clear auth state on logout", async () => {
    process.env.WABISABI_API_KEY = "test-token-for-logout";
    const { AuthManager } = await import("../../auth/index.js");

    const authManager = new AuthManager();
    expect(authManager.isAuthenticated()).toBe(true);

    authManager.logout();

    // After logout, config is null. But env fallback still works.
    // Clear env to truly test unauthenticated state
    delete process.env.WABISABI_API_KEY;
    expect(authManager.isAuthenticated()).toBe(false);
  });

  test("should detect OS keychain availability", async () => {
    const { isKeychainAvailable } = await import("../../utils/keychain.js");

    const available = isKeychainAvailable();
    expect(typeof available).toBe("boolean");
  });
});
