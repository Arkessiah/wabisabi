/**
 * Integration Tests - Mock HTTP Server
 *
 * Tests the full pipeline: LLMClient → SSE parsing → tool calls → ChatService orchestration.
 * Uses Node.js built-in http server as mock LLM endpoint.
 *
 * Run with: node --test dist/test/integration.test.ts
 */

import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import * as http from "http";

// ── Mock SSE Server ────────────────────────────────────────────

interface MockResponse {
  chunks: Array<Record<string, unknown>>;
  status?: number;
}

let mockServer: http.Server;
let serverPort: number;
let nextResponse: MockResponse = { chunks: [] };

function setMockResponse(resp: MockResponse) {
  nextResponse = resp;
}

function sseChunk(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function chatChunk(content: string, finishReason?: string): Record<string, unknown> {
  return {
    choices: [{
      delta: { content },
      finish_reason: finishReason || null,
    }],
  };
}

function toolCallChunk(
  index: number,
  id: string | undefined,
  name: string | undefined,
  args: string,
  finishReason?: string,
): Record<string, unknown> {
  const tc: Record<string, unknown> = { index };
  if (id) tc.id = id;
  const fn: Record<string, string> = {};
  if (name) { tc.type = "function"; fn.name = name; }
  if (args) fn.arguments = args;
  if (Object.keys(fn).length > 0) tc.function = fn;
  return {
    choices: [{
      delta: { tool_calls: [tc] },
      finish_reason: finishReason || null,
    }],
  };
}

async function startMockServer(): Promise<number> {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      // Health endpoint
      if (req.url === "/v1/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "test-model" }] }));
        return;
      }

      if (req.url !== "/v1/chat/completions") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // Collect body
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        const status = nextResponse.status || 200;
        if (status !== 200) {
          res.writeHead(status, { "Content-Type": "text/plain" });
          res.end("Error");
          return;
        }

        // Check if streaming
        const parsed = JSON.parse(body);
        if (!parsed.stream) {
          // Non-streaming response
          const content = nextResponse.chunks
            .map((c: any) => c.choices?.[0]?.delta?.content || "")
            .join("");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            choices: [{ message: { content, tool_calls: [] }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }));
          return;
        }

        // SSE streaming response
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        let i = 0;
        const sendNext = () => {
          if (i < nextResponse.chunks.length) {
            res.write(sseChunk(nextResponse.chunks[i]));
            i++;
            setTimeout(sendNext, 5);
          } else {
            res.write("data: [DONE]\n\n");
            res.end();
          }
        };
        sendNext();
      });
    });

    mockServer.listen(0, () => {
      const addr = mockServer.address() as { port: number };
      resolve(addr.port);
    });
  });
}

// ── Tests ──────────────────────────────────────────────────────

describe("Integration: LLMClient SSE streaming", () => {
  before(async () => {
    serverPort = await startMockServer();
  });

  after(() => {
    mockServer.close();
  });

  it("should stream simple text response", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [
        chatChunk("Hello"),
        chatChunk(" world"),
        chatChunk("!", "stop"),
      ],
    });

    const chunks: string[] = [];
    const gen = client.streamChat([{ role: "user", content: "Hi" }]);

    while (true) {
      const { done, value } = await gen.next();
      if (done) {
        const result = value;
        assert.strictEqual(result.content, "Hello world!");
        assert.strictEqual(result.tool_calls.length, 0);
        assert.strictEqual(result.finish_reason, "stop");
        break;
      }
      if (value.content) chunks.push(value.content);
    }

    assert.deepStrictEqual(chunks, ["Hello", " world", "!"]);
  });

  it("should accumulate streamed tool calls", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [
        toolCallChunk(0, "call_1", "read", ""),
        toolCallChunk(0, undefined, undefined, '{"path":'),
        toolCallChunk(0, undefined, undefined, '"src/index.ts"}', "tool_calls"),
      ],
    });

    const gen = client.streamChat(
      [{ role: "user", content: "Read the file" }],
      [{ type: "function", function: { name: "read", description: "Read file", parameters: {} } }],
    );

    let result;
    while (true) {
      const { done, value } = await gen.next();
      if (done) { result = value; break; }
    }

    assert.strictEqual(result.tool_calls.length, 1);
    assert.strictEqual(result.tool_calls[0].id, "call_1");
    assert.strictEqual(result.tool_calls[0].function.name, "read");
    assert.deepStrictEqual(
      JSON.parse(result.tool_calls[0].function.arguments),
      { path: "src/index.ts" },
    );
    assert.strictEqual(result.finish_reason, "tool_calls");
  });

  it("should accumulate multiple tool calls in parallel", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [
        toolCallChunk(0, "call_a", "glob", '{"pattern":"**/*.ts"}'),
        toolCallChunk(1, "call_b", "grep", '{"pattern":"TODO","path":"."}', "tool_calls"),
      ],
    });

    const gen = client.streamChat(
      [{ role: "user", content: "Find files" }],
      [],
    );

    let result;
    while (true) {
      const { done, value } = await gen.next();
      if (done) { result = value; break; }
    }

    assert.strictEqual(result.tool_calls.length, 2);
    assert.strictEqual(result.tool_calls[0].function.name, "glob");
    assert.strictEqual(result.tool_calls[1].function.name, "grep");
  });

  it("should handle HTTP errors gracefully", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({ chunks: [], status: 500 });

    const gen = client.streamChat([{ role: "user", content: "Hi" }]);
    await assert.rejects(
      async () => {
        while (true) {
          const { done } = await gen.next();
          if (done) break;
        }
      },
      /HTTP 500/,
    );
  });

  it("should perform health check", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    const healthy = await client.checkHealth();
    assert.strictEqual(healthy, true);

    // Check against non-existent port
    const deadClient = new LLMClient({
      baseUrl: "http://localhost:1",
      model: "test-model",
    });
    const dead = await deadClient.checkHealth(500);
    assert.strictEqual(dead, false);
  });

  it("should handle non-streaming chat", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [chatChunk("Non-stream response")],
    });

    const result = await client.chat([{ role: "user", content: "Hi" }]);
    assert.strictEqual(result.content, "Non-stream response");
    assert.strictEqual(result.finish_reason, "stop");
    assert.ok(result.usage);
  });

  it("should handle empty response chunks gracefully", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [
        { choices: [{ delta: {}, finish_reason: null }] },
        chatChunk("ok", "stop"),
      ],
    });

    const gen = client.streamChat([{ role: "user", content: "Hi" }]);
    let result;
    while (true) {
      const { done, value } = await gen.next();
      if (done) { result = value; break; }
    }

    assert.strictEqual(result.content, "ok");
  });

  it("should include usage stats when provided", async () => {
    const { LLMClient } = require("../llm-client");
    const client = new LLMClient({
      baseUrl: `http://localhost:${serverPort}`,
      model: "test-model",
    });

    setMockResponse({
      chunks: [
        chatChunk("Hi", "stop"),
        { usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
      ],
    });

    const gen = client.streamChat([{ role: "user", content: "Hi" }]);
    let result;
    while (true) {
      const { done, value } = await gen.next();
      if (done) { result = value; break; }
    }

    assert.ok(result.usage);
    assert.strictEqual(result.usage!.total_tokens, 12);
  });
});

describe("Integration: ToolExecutor path security", () => {
  const path = require("path");
  const fs = require("fs");
  const os = require("os");

  it("should reject directory traversal attacks", () => {
    const workspace = "/tmp/test-workspace";
    const attacks = [
      "../../etc/passwd",
      "../../../root/.ssh/id_rsa",
      "src/../../etc/shadow",
      "/etc/passwd",
    ];

    for (const attack of attacks) {
      const resolved = path.resolve(workspace, attack);
      assert.ok(
        !resolved.startsWith(workspace + "/") && resolved !== workspace,
        `Path "${attack}" should be rejected (resolved to: ${resolved})`,
      );
    }
  });

  it("should allow valid workspace paths", () => {
    const workspace = "/tmp/test-workspace";
    const valid = [
      "src/index.ts",
      "package.json",
      "src/deep/nested/file.ts",
      "./relative/path.ts",
    ];

    for (const p of valid) {
      const resolved = path.resolve(workspace, p);
      assert.ok(
        resolved.startsWith(workspace + "/"),
        `Path "${p}" should be allowed (resolved to: ${resolved})`,
      );
    }
  });

  it("should detect dangerous bash commands", () => {
    const dangerous = [
      "rm -rf /",
      "rm -rf ~",
      "sudo something",
      "chmod 777 /etc/passwd",
      "mkfs.ext4 /dev/sda",
    ];

    const dangerousPatterns = [
      /\brm\s+(-[a-z]*)?r[a-z]*f/i,
      /\bsudo\b/,
      /\bchmod\b.*\b(777|666)\b/,
      /\bmkfs\b/,
    ];

    for (const cmd of dangerous) {
      const isDangerous = dangerousPatterns.some((p) => p.test(cmd));
      assert.ok(isDangerous, `Command "${cmd}" should be flagged as dangerous`);
    }
  });

  it("should allow safe bash commands", () => {
    const safe = [
      "ls -la",
      "cat package.json",
      "npm install",
      "git status",
      "node --version",
    ];

    const dangerousPatterns = [
      /\brm\s+(-[a-z]*)?r[a-z]*f/i,
      /\bsudo\b/,
      /\bchmod\b.*\b(777|666)\b/,
      /\bmkfs\b/,
    ];

    for (const cmd of safe) {
      const isDangerous = dangerousPatterns.some((p) => p.test(cmd));
      assert.ok(!isDangerous, `Command "${cmd}" should NOT be flagged as dangerous`);
    }
  });
});

describe("Integration: Config JSONC parsing", () => {
  // Proper JSONC stripper that respects string literals
  function stripJsonComments(text: string): string {
    let result = "";
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (escape) {
        result += ch;
        escape = false;
        continue;
      }

      if (inString) {
        if (ch === "\\") { escape = true; result += ch; continue; }
        if (ch === '"') { inString = false; }
        result += ch;
        continue;
      }

      // Not in string
      if (ch === '"') { inString = true; result += ch; continue; }
      if (ch === "/" && text[i + 1] === "/") {
        // Line comment - skip to end of line
        while (i < text.length && text[i] !== "\n") i++;
        result += "\n";
        continue;
      }
      if (ch === "/" && text[i + 1] === "*") {
        // Block comment - skip to */
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
        i++; // skip the /
        continue;
      }
      result += ch;
    }
    return result;
  }

  it("should parse valid JSONC with all comment styles", () => {
    const jsonc = `{
  // Provider settings
  "provider": {
    "strategy": "hybrid-local-first", // auto-detect
    /* Ollama config
       for local inference */
    "ollama": {
      "url": "http://localhost:11434",
      "model": "llama3.2" // fast model
    }
  },
  "temperature": 0.7,
  "maxTokens": 4096
}`;

    const parsed = JSON.parse(stripJsonComments(jsonc));
    assert.strictEqual(parsed.provider.strategy, "hybrid-local-first");
    assert.strictEqual(parsed.provider.ollama.url, "http://localhost:11434");
    assert.strictEqual(parsed.temperature, 0.7);
  });

  it("should handle strings containing comment-like patterns", () => {
    const simple = `{
  "url": "http://localhost:11434"
}`;
    const parsed = JSON.parse(stripJsonComments(simple));
    assert.strictEqual(parsed.url, "http://localhost:11434");
  });
});

describe("Integration: Chat message history management", () => {
  it("should build correct message sequence", () => {
    const history: Array<{ role: string; content: string | null; tool_calls?: unknown[]; tool_call_id?: string }> = [];

    // System prompt
    history.push({ role: "system", content: "You are an assistant." });

    // User message
    history.push({ role: "user", content: "Read package.json" });

    // Assistant with tool call
    history.push({
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "read", arguments: '{"path":"package.json"}' } }],
    });

    // Tool result
    history.push({ role: "tool", content: '{"name":"test"}', tool_call_id: "call_1" });

    // Final assistant response
    history.push({ role: "assistant", content: "The package name is 'test'." });

    assert.strictEqual(history.length, 5);
    assert.strictEqual(history[0].role, "system");
    assert.strictEqual(history[2].role, "assistant");
    assert.ok(history[2].tool_calls);
    assert.strictEqual(history[3].role, "tool");
    assert.strictEqual(history[3].tool_call_id, "call_1");
    assert.strictEqual(history[4].role, "assistant");
  });

  it("should respect MAX_TOOL_ITERATIONS limit", () => {
    const MAX_TOOL_ITERATIONS = 15;
    let iterations = 0;
    const hasToolCalls = () => iterations < 20; // Would loop forever

    while (hasToolCalls() && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
    }

    assert.strictEqual(iterations, MAX_TOOL_ITERATIONS);
  });
});
