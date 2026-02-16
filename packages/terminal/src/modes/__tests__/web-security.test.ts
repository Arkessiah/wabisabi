/**
 * Web Server Security Tests (ALTA-3)
 *
 * Verifies security hardening requirements:
 * - Localhost-only binding (127.0.0.1, no 0.0.0.0)
 * - Random session token (32 bytes crypto-strength)
 * - Origin header validation on WebSocket
 * - Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
 * - SRI hashes for CDN resources (xterm.js)
 * - API key via env var (NOT CLI args)
 */

import { describe, test, expect } from "bun:test";

describe("Web Server Security (ALTA-3)", () => {
  test("should enforce localhost-only binding (not 0.0.0.0)", () => {
    // Security: Binding to 0.0.0.0 exposes server to network
    // Verify code uses "127.0.0.1" explicitly

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Check that server binds to 127.0.0.1
    expect(code).toContain('hostname: "127.0.0.1"');

    // Ensure 0.0.0.0 is NOT used
    expect(code).not.toContain('hostname: "0.0.0.0"');
    expect(code).not.toContain("hostname: '0.0.0.0'");
  });

  test("should generate random session token (32 bytes)", () => {
    // Security: Token must be crypto-strength random

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Verify uses randomBytes(32) for token generation
    expect(code).toContain("randomBytes(32)");
    expect(code).toContain("function generateSessionToken()");
  });

  test("should validate Origin header in WebSocket upgrade", () => {
    // Security: Prevent CSRF via malicious sites connecting to localhost

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Check Origin validation logic exists
    expect(code).toContain("const origin = req.headers.get(\"origin\")");
    expect(code).toContain("if (!validateOrigin(req))");
    expect(code).toContain("function validateOrigin");
  });

  test("should include security headers (CSP, X-Frame-Options, etc)", () => {
    // Security (OWASP A05:2021): Prevent XSS, clickjacking, MIME sniffing

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Verify security headers are set
    expect(code).toContain('"X-Frame-Options": "DENY"');
    expect(code).toContain('"X-Content-Type-Options": "nosniff"');
    expect(code).toContain('"Content-Security-Policy"');
    expect(code).toContain("default-src 'self'");
  });

  test("should include SRI hashes for CDN resources (xterm.js)", () => {
    // Security (OWASP A08:2021): Prevent supply chain attacks

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Check SRI integrity hashes exist for all CDN links
    expect(code).toContain('integrity="sha384-');
    expect(code).toContain('crossorigin="anonymous"');

    // Verify xterm.js CSS, JS, and addon have SRI
    const sriMatches = code.match(/integrity="sha384-[^"]+"/g);
    expect(sriMatches).toBeTruthy();
    expect(sriMatches!.length).toBeGreaterThanOrEqual(3); // CSS + JS + addon
  });

  test("should pass API key via env var (NOT CLI args)", () => {
    // Security (ALTA-3): CLI args visible in ps/top and system logs

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Verify API key is NOT passed via args.push("--api-key")
    expect(code).not.toContain('args.push("--api-key"');

    // Verify API key IS passed via env variable
    expect(code).toContain("WABISABI_API_KEY");
    expect(code).toContain("childEnv");
  });

  test("should require session token for WebSocket connections", () => {
    // Security: Prevent unauthorized connections

    const webCode = require.resolve("../web.ts");
    const code = require("fs").readFileSync(webCode, "utf-8");

    // Check token validation logic
    expect(code).toContain('const token = url.searchParams.get("token")');
    expect(code).toContain("if (token !== sessionToken)");
  });

  test("should generate unique session tokens on each startup", () => {
    // Security: Tokens must not be predictable or reused

    const { generateSessionToken } = require("../web.ts");

    if (!generateSessionToken) {
      // If not exported, verify via code inspection
      const webCode = require.resolve("../web.ts");
      const code = require("fs").readFileSync(webCode, "utf-8");

      // Ensure token is generated fresh on each call, not hardcoded
      expect(code).not.toContain('sessionToken = "');
      expect(code).toContain("randomBytes(32).toString(\"hex\")");
      return;
    }

    // If exported, test functionally
    const token1 = generateSessionToken();
    const token2 = generateSessionToken();

    expect(token1).not.toBe(token2);
    expect(token1.length).toBe(64);
    expect(token2.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(token1)).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(token2)).toBe(true);
  });
});
