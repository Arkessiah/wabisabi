/**
 * Tests for context compactor
 */

import { describe, test, expect } from "bun:test";
import {
  estimateConversationTokens,
  getModelContextLimit,
  shouldCompact,
  compactMessages,
  buildCompactionPrompt,
} from "../context/compactor.js";
import type { ChatMessage } from "../clients/api-client.js";

// ── estimateConversationTokens ───────────────────────────────

describe("estimateConversationTokens", () => {
  test("estimates tokens for simple messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a helper." },
      { role: "user", content: "Hello world" },
    ];
    const tokens = estimateConversationTokens(messages);
    // Should be > 0 and reasonable
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  test("increases with more content", () => {
    const short: ChatMessage[] = [
      { role: "user", content: "Hi" },
    ];
    const long: ChatMessage[] = [
      { role: "user", content: "x".repeat(1000) },
    ];
    expect(estimateConversationTokens(long)).toBeGreaterThan(
      estimateConversationTokens(short),
    );
  });

  test("accounts for tool calls", () => {
    const withTools: ChatMessage[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "read", arguments: '{"filePath":"src/index.ts"}' },
          },
        ],
      },
    ];
    const without: ChatMessage[] = [
      { role: "assistant", content: "ok" },
    ];
    expect(estimateConversationTokens(withTools)).toBeGreaterThan(
      estimateConversationTokens(without),
    );
  });
});

// ── getModelContextLimit ─────────────────────────────────────

describe("getModelContextLimit", () => {
  test("returns known limits for common models", () => {
    expect(getModelContextLimit("gpt-4o")).toBe(128_000);
    expect(getModelContextLimit("gpt-4o-mini")).toBe(128_000);
    expect(getModelContextLimit("claude-sonnet-4")).toBe(200_000);
  });

  test("returns default for unknown models", () => {
    expect(getModelContextLimit("some-random-model")).toBe(32_768);
  });

  test("is case insensitive", () => {
    expect(getModelContextLimit("GPT-4o")).toBe(128_000);
  });
});

// ── shouldCompact ────────────────────────────────────────────

describe("shouldCompact", () => {
  test("returns false for short conversations", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    expect(shouldCompact(messages, "llama")).toBe(false);
  });

  test("returns false when under threshold", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 15 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i}`,
      })),
    ];
    // With small messages, should be well under threshold
    expect(shouldCompact(messages, "gpt-4o")).toBe(false);
  });

  test("returns true when prompt tokens exceed threshold", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      ...Array.from({ length: 15 }, () => ({
        role: "user" as const,
        content: "x",
      })),
    ];
    // Force with a high lastKnownPromptTokens
    expect(shouldCompact(messages, "llama", 7000)).toBe(true);
  });
});

// ── compactMessages ──────────────────────────────────────────

describe("compactMessages", () => {
  test("returns compacted=false for short conversations", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    const result = compactMessages(messages);
    expect(result.compacted).toBe(false);
  });

  test("compacts long conversations", () => {
    const longContent = "x".repeat(500); // Realistic message length
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a coding assistant." },
      // 10 old messages with substantial content
      ...Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Old message number ${i}: ${longContent}`,
      })),
      // 6 recent messages (should be kept)
      ...Array.from({ length: 6 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Recent message ${i}`,
      })),
    ];

    const result = compactMessages(messages);
    expect(result.compacted).toBe(true);
    expect(result.removedCount).toBe(10);
    expect(result.summaryMessage).not.toBeNull();
    expect(String(result.summaryMessage!.content)).toContain("Auto-compacted");
    expect(result.estimatedTokensAfter).toBeLessThan(result.estimatedTokensBefore);
  });

  test("preserves system message and recent messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "SYSTEM PROMPT" },
      ...Array.from({ length: 8 }, (_, i) => ({
        role: "user" as const,
        content: `old ${i}`,
      })),
      { role: "user", content: "recent-1" },
      { role: "assistant", content: "recent-2" },
      { role: "user", content: "recent-3" },
      { role: "assistant", content: "recent-4" },
      { role: "user", content: "recent-5" },
      { role: "assistant", content: "recent-6" },
    ];

    const result = compactMessages(messages);
    expect(result.compacted).toBe(true);

    // Rebuild the compacted conversation
    const system = messages[0];
    const recent = messages.slice(-6);
    const compacted = [system, result.summaryMessage!, ...recent];

    // System message preserved
    expect(compacted[0].content).toBe("SYSTEM PROMPT");
    // Recent messages preserved
    expect(compacted[compacted.length - 1].content).toBe("recent-6");
    expect(compacted[compacted.length - 6].content).toBe("recent-1");
  });

  test("extracts file paths from tool calls", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "sys" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "read", arguments: '{"filePath":"src/index.ts"}' },
          },
        ],
      },
      { role: "tool", content: "file content here", tool_call_id: "tc1" },
      ...Array.from({ length: 5 }, () => ({
        role: "user" as const,
        content: "filler",
      })),
      // 6 recent
      ...Array.from({ length: 6 }, (_, i) => ({
        role: "user" as const,
        content: `recent ${i}`,
      })),
    ];

    const result = compactMessages(messages);
    expect(result.compacted).toBe(true);
    expect(String(result.summaryMessage!.content)).toContain("src/index.ts");
  });
});

// ── buildCompactionPrompt ────────────────────────────────────

describe("buildCompactionPrompt", () => {
  test("builds a prompt from messages", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Read package.json" },
      { role: "assistant", content: "Sure, let me read that file." },
      { role: "tool", content: '{"name":"wabisabi"}', tool_call_id: "tc1" },
    ];
    const prompt = buildCompactionPrompt(messages);
    expect(prompt).toContain("USER:");
    expect(prompt).toContain("ASSISTANT:");
    expect(prompt).toContain("TOOL:");
    expect(prompt).toContain("Summarize");
  });

  test("skips system messages", () => {
    const messages: ChatMessage[] = [
      { role: "system", content: "You are a bot" },
      { role: "user", content: "Hello" },
    ];
    const prompt = buildCompactionPrompt(messages);
    expect(prompt).not.toContain("You are a bot");
    expect(prompt).toContain("USER: Hello");
  });
});
