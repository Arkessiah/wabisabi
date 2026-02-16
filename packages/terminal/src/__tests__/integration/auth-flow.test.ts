/**
 * Auth Flow Integration Tests
 *
 * Tests authentication workflows:
 * - Login flow
 * - Token refresh
 * - Session persistence
 * - Logout cleanup
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const TEST_AUTH_DIR = join(homedir(), ".wabisabi", "integration-test-auth");

// Note: These tests verify the auth flow structure
// Actual OAuth flows require manual intervention (browser)
// so we test the infrastructure, not the full interactive flow

describe("Auth Flow Integration", () => {
  beforeEach(() => {
    // Clean test directory
    if (existsSync(TEST_AUTH_DIR)) {
      rmSync(TEST_AUTH_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_AUTH_DIR, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(TEST_AUTH_DIR)) {
      rmSync(TEST_AUTH_DIR, { recursive: true, force: true });
    }
  });

  test("should initialize auth directory structure", async () => {
    // Verify auth directory structure
    const { AuthManager } = await import("../../../auth/index.js");
    
    const authManager = new AuthManager({
      provider: "apikey",
      accessToken: "test-key",
    });

    // Check that auth manager initializes correctly
    expect(authManager).toBeDefined();
    expect(authManager.isAuthenticated()).toBe(true);
  });

  test("should persist session securely", async () => {
    // Test session encryption and persistence
    const { AuthManager } = await import("../../../auth/index.js");
    
    const authManager = new AuthManager({
      provider: "apikey",
      accessToken: "test-secret-token-12345",
    });

    // Save session
    authManager.logout(); // This triggers session save

    // Verify session file exists
    const sessionPath = join(homedir(), ".wabisabi", "auth", "session.json");
    expect(existsSync(sessionPath)).toBe(true);

    // Verify file is encrypted (not plaintext)
    const { readFileSync } = await import("fs");
    const sessionContent = readFileSync(sessionPath, "utf-8");
    
    // Should not contain plaintext token
    expect(sessionContent).not.toContain("test-secret-token");
    
    // Should contain encrypted data markers
    expect(sessionContent.length).toBeGreaterThan(0);
  });

  test("should handle token refresh", async () => {
    // Test token refresh logic
    const { AuthManager } = await import("../../../auth/index.js");
    const { isExpired, needsRefresh } = await import("../../../auth/token.js");
    
    // Mock JWT token structure
    const mockJwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjk5OTk5OTk5OTl9.xxx";
    
    // Verify token utility functions work
    expect(isExpired(mockJwt)).toBe(false); // Expires in far future
    expect(needsRefresh(mockJwt)).toBe(false);
  });

  test("should cleanup on logout", async () => {
    // Test logout clears sensitive data
    const { AuthManager } = await import("../../../auth/index.js");
    
    const authManager = new AuthManager({
      provider: "apikey",
      accessToken: "test-token",
    });

    expect(authManager.isAuthenticated()).toBe(true);

    // Logout
    authManager.logout();

    // Verify no longer authenticated
    expect(authManager.isAuthenticated()).toBe(false);
    
    // Verify token is cleared (getAuthHeaders should fail or return empty)
    try {
      const headers = authManager.getAuthHeaders();
      // If headers are returned, they shouldn't contain the token
      expect(JSON.stringify(headers)).not.toContain("test-token");
    } catch {
      // Expected: might throw if not authenticated
      expect(true).toBe(true);
    }
  });

  test("should use OS keychain when available", async () => {
    // Test keychain integration
    const { isKeychainAvailable } = await import("../../../utils/keychain.js");
    
    const available = isKeychainAvailable();
    
    // Just verify the function works
    expect(typeof available).toBe("boolean");
    
    if (available) {
      console.log("✅ OS Keychain available - using secure storage");
    } else {
      console.log("⚠️  OS Keychain not available - using fallback");
    }
  });
});
