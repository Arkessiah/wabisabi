/**
 * Phase 2 & Phase 3 Module Tests
 *
 * Coverage for: auth tokens, auth schemas, rendering, routing, onboarding.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { decodeJwt, isExpired, needsRefresh } from "../auth/token.js";
import { AuthConfigSchema, AuthProviderSchema } from "../auth/schema.js";
import { renderMarkdown, hasMarkdown } from "../rendering/index.js";
import { ModelRouter } from "../routing/index.js";
import { isFirstRun, ensureConfigExample } from "../onboarding.js";

const TEST_DIR = join(tmpdir(), `wabisabi-p2-test-${Date.now()}`);

beforeAll(() => mkdirSync(TEST_DIR, { recursive: true }));
afterAll(() => rmSync(TEST_DIR, { recursive: true, force: true }));

// ── JWT helpers ──────────────────────────────────────────────

function createJwt(payload: Record<string, unknown>): string {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${h}.${p}.fakesig`;
}

// ── Auth Token ───────────────────────────────────────────────

describe("decodeJwt", () => {
  test("decodes valid JWT", () => {
    const jwt = createJwt({ sub: "u1", email: "a@b.com", exp: 9999999999 });
    const decoded = decodeJwt(jwt);
    expect(decoded?.sub).toBe("u1");
    expect(decoded?.email).toBe("a@b.com");
  });

  test("returns null for malformed (2 parts)", () => {
    expect(decodeJwt("only.two")).toBeNull();
  });

  test("returns null for non-JWT string", () => {
    expect(decodeJwt("not-a-jwt")).toBeNull();
  });

  test("returns null for invalid base64", () => {
    expect(decodeJwt("a.!!!.c")).toBeNull();
  });

  test("decodes custom claims", () => {
    const jwt = createJwt({ role: "admin", org: "acme" });
    const decoded = decodeJwt(jwt);
    expect(decoded?.role).toBe("admin");
    expect(decoded?.org).toBe("acme");
  });
});

describe("isExpired", () => {
  test("false for future exp", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isExpired(jwt)).toBe(false);
  });

  test("true for past exp", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
    expect(isExpired(jwt)).toBe(true);
  });

  test("false without exp claim", () => {
    const jwt = createJwt({ sub: "user" });
    expect(isExpired(jwt)).toBe(false);
  });

  test("true for token expiring now", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) });
    expect(isExpired(jwt)).toBe(true);
  });
});

describe("needsRefresh", () => {
  test("false for far-future token", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) + 7200 });
    expect(needsRefresh(jwt)).toBe(false);
  });

  test("true for token within default 300s buffer", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) + 200 });
    expect(needsRefresh(jwt)).toBe(true);
  });

  test("false without exp", () => {
    const jwt = createJwt({ sub: "x" });
    expect(needsRefresh(jwt)).toBe(false);
  });

  test("custom buffer works", () => {
    const exp = Math.floor(Date.now() / 1000) + 500;
    const jwt = createJwt({ exp });
    expect(needsRefresh(jwt, 600)).toBe(true);
    expect(needsRefresh(jwt, 400)).toBe(false);
  });

  test("true for expired token", () => {
    const jwt = createJwt({ exp: Math.floor(Date.now() / 1000) - 100 });
    expect(needsRefresh(jwt)).toBe(true);
  });
});

// ── Auth Schemas ─────────────────────────────────────────────

describe("AuthProviderSchema", () => {
  test("accepts valid providers", () => {
    expect(AuthProviderSchema.parse("substratum")).toBe("substratum");
    expect(AuthProviderSchema.parse("github")).toBe("github");
    expect(AuthProviderSchema.parse("apikey")).toBe("apikey");
  });

  test("rejects invalid providers", () => {
    expect(() => AuthProviderSchema.parse("invalid")).toThrow();
    expect(() => AuthProviderSchema.parse("")).toThrow();
  });
});

describe("AuthConfigSchema", () => {
  test("validates complete config", () => {
    const result = AuthConfigSchema.parse({
      provider: "substratum",
      accessToken: "tok-123",
      refreshToken: "ref-456",
      expiresAt: 1234567890,
      userId: "u1",
      email: "a@b.com",
    });
    expect(result.provider).toBe("substratum");
    expect(result.accessToken).toBe("tok-123");
  });

  test("validates minimal config", () => {
    const result = AuthConfigSchema.parse({ provider: "apikey", accessToken: "key" });
    expect(result.refreshToken).toBeUndefined();
  });

  test("rejects empty access token", () => {
    expect(() => AuthConfigSchema.parse({ provider: "github", accessToken: "" })).toThrow();
  });

  test("rejects invalid email", () => {
    expect(() => AuthConfigSchema.parse({
      provider: "substratum", accessToken: "tok", email: "bad",
    })).toThrow();
  });
});

// ── Rendering ────────────────────────────────────────────────

describe("renderMarkdown", () => {
  test("renders headers", () => {
    const out = renderMarkdown("# Title\n## Section\n### Sub");
    expect(out).toContain("Title");
    expect(out).toContain("Section");
    expect(out).toContain("Sub");
  });

  test("renders code blocks", () => {
    const out = renderMarkdown("```ts\nconst x = 1;\n```");
    expect(out).toContain("const");
    expect(out).toContain("┌─");
    expect(out).toContain("└─");
  });

  test("renders inline code", () => {
    const out = renderMarkdown("Use `func()` here.");
    expect(out).toContain("func()");
  });

  test("renders bullet lists", () => {
    const out = renderMarkdown("- One\n- Two\n- Three");
    expect(out).toContain("One");
    expect(out).toContain("Two");
  });

  test("renders ordered lists", () => {
    const out = renderMarkdown("1. First\n2. Second");
    expect(out).toContain("First");
    expect(out).toContain("Second");
  });

  test("renders bold and italic", () => {
    const out = renderMarkdown("**bold** and *italic*");
    expect(out).toContain("bold");
    expect(out).toContain("italic");
  });

  test("renders links", () => {
    const out = renderMarkdown("[Site](https://example.com)");
    expect(out).toContain("Site");
    expect(out).toContain("example.com");
  });

  test("handles plain text", () => {
    const out = renderMarkdown("Just text.");
    expect(out).toContain("Just text.");
  });
});

describe("hasMarkdown", () => {
  test("detects code blocks", () => {
    expect(hasMarkdown("```js\ncode\n```")).toBe(true);
  });

  test("detects headers", () => {
    expect(hasMarkdown("# Title")).toBe(true);
  });

  test("detects lists", () => {
    expect(hasMarkdown("- item")).toBe(true);
  });

  test("detects inline code", () => {
    expect(hasMarkdown("use `code` here")).toBe(true);
  });

  test("detects bold", () => {
    expect(hasMarkdown("**bold**")).toBe(true);
  });

  test("returns false for plain text", () => {
    expect(hasMarkdown("plain text")).toBe(false);
  });
});

// ── Routing ──────────────────────────────────────────────────

describe("ModelRouter", () => {
  test("registers models", () => {
    const router = new ModelRouter();
    router.registerModels(["llama3.2", "codellama"], "ollama");
    expect(router.getModels().length).toBe(2);
    expect(router.getModels().some((m) => m.id === "llama3.2")).toBe(true);
  });

  test("routes based on task", async () => {
    const router = new ModelRouter();
    router.registerModels(["llama3.2", "codellama", "deepseek-coder"], "ollama");
    const decision = await router.route("Write a sorting function", "llama3.2");
    expect(decision.model).toBeDefined();
    expect(decision.confidence).toBeGreaterThanOrEqual(0);
    expect(decision.confidence).toBeLessThanOrEqual(1);
  });

  test("prefers code models for code tasks", async () => {
    const router = new ModelRouter();
    router.registerModels(["mistral", "codellama", "deepseek-coder"], "ollama");
    const decision = await router.route("Implement binary search", "mistral");
    // codellama or deepseek-coder should win over mistral (which has no code specialty)
    expect(["codellama", "deepseek-coder"].includes(decision.model)).toBe(true);
  });

  test("returns alternatives", async () => {
    const router = new ModelRouter();
    router.registerModels(["llama3.2", "mistral", "codellama"], "ollama");
    const decision = await router.route("Explain closures", "llama3.2");
    expect(Array.isArray(decision.alternatives)).toBe(true);
  });

  test("handles empty registry", async () => {
    const router = new ModelRouter();
    const decision = await router.route("Hello", "default");
    expect(decision.model).toBe("default");
    expect(decision.reason).toContain("No models registered");
  });

  test("tracks routing stats", async () => {
    const router = new ModelRouter();
    router.registerModels(["llama3.2"], "ollama");
    await router.route("Test 1", "llama3.2");
    await router.route("Test 2", "llama3.2");
    const stats = router.getStats();
    expect(Object.keys(stats).length).toBeGreaterThan(0);
  });
});

// ── Onboarding ───────────────────────────────────────────────

describe("onboarding", () => {
  test("isFirstRun returns boolean", () => {
    expect(typeof isFirstRun()).toBe("boolean");
  });

  test("ensureConfigExample returns boolean", () => {
    expect(typeof ensureConfigExample()).toBe("boolean");
  });
});
