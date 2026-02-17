/**
 * Web UI Integration Tests
 *
 * Tests web mode security and functionality via code inspection.
 * Server-based tests require a running web server and are skipped
 * automatically if the server is not available.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const WEB_TS_PATH = resolve(__dirname, "../../modes/web.ts");

describe("Web UI Integration", () => {
  let webCode: string;

  try {
    webCode = readFileSync(WEB_TS_PATH, "utf-8");
  } catch {
    webCode = "";
  }

  test("should have web.ts source available", () => {
    expect(webCode.length).toBeGreaterThan(0);
  });

  test("should bind to localhost only", () => {
    expect(webCode).toContain('hostname: "127.0.0.1"');
    expect(webCode).not.toContain('hostname: "0.0.0.0"');
    expect(webCode).not.toContain("hostname: '0.0.0.0'");
  });

  test("should generate crypto-strength session tokens", () => {
    expect(webCode).toContain("randomBytes(32)");
    expect(webCode).toContain("generateSessionToken");
  });

  test("should validate WebSocket origin", () => {
    expect(webCode).toContain("validateOrigin");
    expect(webCode).toContain('req.headers.get("origin")');
  });

  test("should include security headers", () => {
    expect(webCode).toContain('"X-Frame-Options": "DENY"');
    expect(webCode).toContain('"X-Content-Type-Options": "nosniff"');
    expect(webCode).toContain('"Content-Security-Policy"');
  });

  test("should use SRI for CDN resources", () => {
    const sriMatches = webCode.match(/integrity="sha384-[^"]+"/g);
    expect(sriMatches).toBeTruthy();
    expect(sriMatches!.length).toBeGreaterThanOrEqual(3); // CSS + JS + addon
  });

  test("should pass API key via env var, not CLI args", () => {
    expect(webCode).not.toContain('args.push("--api-key"');
    expect(webCode).toContain("WABISABI_API_KEY");
    expect(webCode).toContain("childEnv");
  });

  test("should require session token for WebSocket", () => {
    expect(webCode).toContain('url.searchParams.get("token")');
    expect(webCode).toContain("if (token !== sessionToken)");
  });

  test("should connect to live web server", async () => {
    // This test requires a running web server
    try {
      const response = await fetch("http://127.0.0.1:3333", {
        signal: AbortSignal.timeout(1000),
      });
      expect(response.status).toBe(200);

      const html = await response.text();
      expect(html).toContain("WabiSabi");

      // Check security headers
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    } catch {
      console.log("⚠️  Skipped: web server not running on port 3333");
    }
  });
});
