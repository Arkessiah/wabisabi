/**
 * Context Compactor
 *
 * Automatic context window management. Estimates token usage and
 * compacts conversation history when approaching the model's limit.
 * Similar to how Claude Code and OpenCode handle long sessions.
 */

import type { ChatMessage } from "../clients/api-client.js";
import { scoreMessageImportance } from "../ram/index.js";

// ── Model context limits (tokens) ────────────────────────────

const MODEL_LIMITS: Record<string, number> = {
  // Large context models
  "gpt-4o": 128_000,
  "gpt-4-turbo": 128_000,
  "gpt-4.1": 1_000_000,
  "claude-3": 200_000,
  "claude-sonnet": 200_000,
  "claude-opus": 200_000,
  "claude-haiku": 200_000,
  "gemini": 1_000_000,
  "deepseek": 128_000,
  // Medium context
  "gpt-4": 8_192,
  "gpt-3.5": 16_385,
  // Smaller / local models
  "llama": 8_192,
  "mistral": 32_768,
  "mixtral": 32_768,
  "qwen": 32_768,
  "phi": 16_384,
  "codellama": 16_384,
  "kimi": 128_000,
  "glm": 128_000,
};

const DEFAULT_LIMIT = 32_768;
const COMPACT_THRESHOLD = 0.75; // Compact when reaching 75% of limit
const KEEP_RECENT = 6; // Keep last 6 messages (3 turns) after compaction
const CHARS_PER_TOKEN = 4; // Rough estimate

// ── Token estimation ─────────────────────────────────────────

/**
 * Estimate token count for a single message.
 * Uses chars/4 heuristic - not perfect but good enough for triggering compaction.
 */
function estimateMessageTokens(msg: ChatMessage): number {
  let chars = 0;

  // Content
  if (msg.content) {
    chars += String(msg.content).length;
  }

  // Tool calls (function name + arguments)
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      chars += tc.function.name.length;
      chars += tc.function.arguments.length;
    }
  }

  // Role overhead (~4 tokens per message for formatting)
  return Math.ceil(chars / CHARS_PER_TOKEN) + 4;
}

/**
 * Estimate total tokens for the full conversation.
 */
export function estimateConversationTokens(messages: ChatMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageTokens(msg);
  }
  return total;
}

// ── Context limit resolution ─────────────────────────────────

/**
 * Get the context limit for a model name.
 * Matches against known prefixes/patterns.
 */
export function getModelContextLimit(model: string): number {
  const lower = model.toLowerCase();

  // Try exact match first
  if (MODEL_LIMITS[lower]) return MODEL_LIMITS[lower];

  // Try prefix match
  for (const [prefix, limit] of Object.entries(MODEL_LIMITS)) {
    if (lower.startsWith(prefix) || lower.includes(prefix)) {
      return limit;
    }
  }

  return DEFAULT_LIMIT;
}

// ── Compaction ────────────────────────────────────────────────

export interface CompactionResult {
  compacted: boolean;
  removedCount: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  summaryMessage: ChatMessage | null;
}

/**
 * Check if the conversation should be compacted.
 * @param customThreshold - Override the default 0.75 threshold (from device profile)
 * @param effectiveLimit - Override the model limit (min of model + device)
 */
export function shouldCompact(
  messages: ChatMessage[],
  model: string,
  lastKnownPromptTokens?: number,
  customThreshold?: number,
  effectiveLimit?: number,
): boolean {
  const limit = effectiveLimit || getModelContextLimit(model);
  const threshold = limit * (customThreshold || COMPACT_THRESHOLD);

  // Use actual token count if available, otherwise estimate
  const tokenCount = lastKnownPromptTokens || estimateConversationTokens(messages);

  // Only compact if there are enough messages to make it worthwhile
  // (system + at least KEEP_RECENT + some to compact)
  if (messages.length <= KEEP_RECENT + 3) return false;

  return tokenCount >= threshold;
}

/**
 * Build a compact summary of older messages.
 * Returns the compacted conversation with a summary message replacing old history.
 *
 * Strategy:
 * 1. Keep system message (index 0) always
 * 2. Summarize messages from index 1 to -(KEEP_RECENT)
 * 3. Keep last KEEP_RECENT messages intact
 *
 * The summary preserves:
 * - Key decisions and instructions from the user
 * - Files read/written/edited
 * - Important errors or findings
 * - Current task state
 */
export function compactMessages(
  messages: ChatMessage[],
): CompactionResult {
  if (messages.length <= KEEP_RECENT + 1) {
    return {
      compacted: false,
      removedCount: 0,
      estimatedTokensBefore: estimateConversationTokens(messages),
      estimatedTokensAfter: estimateConversationTokens(messages),
      summaryMessage: null,
    };
  }

  const system = messages[0]; // Always system
  const oldMessages = messages.slice(1, -KEEP_RECENT);
  const recent = messages.slice(-KEEP_RECENT);
  const tokensBefore = estimateConversationTokens(messages);

  // Score messages by importance
  const scoredMessages = oldMessages.map((msg) => ({
    msg,
    importance: scoreMessageImportance(msg),
  }));

  // Build a structured summary from old messages
  const summaryParts: string[] = [];
  const filesModified = new Set<string>();
  const toolsUsed = new Set<string>();
  let userRequests = 0;
  let toolCalls = 0;

  for (const { msg, importance } of scoredMessages) {
    // High-importance messages get more detail in summary
    const detailLevel = importance >= 0.7 ? 400 : importance >= 0.4 ? 200 : 80;

    if (msg.role === "user" && msg.content) {
      userRequests++;
      const text = String(msg.content).slice(0, detailLevel);
      summaryParts.push(`[User] ${text}`);
    } else if (msg.role === "assistant" && msg.content) {
      const text = String(msg.content).slice(0, detailLevel);
      summaryParts.push(`[Assistant] ${text}`);
    } else if (msg.role === "tool" && msg.content) {
      toolCalls++;
      const text = String(msg.content);
      // Extract file paths from tool results
      const pathMatch = text.match(/(?:Read|Wrote|Edited|Created|Updated)\s+(\S+)/);
      if (pathMatch) filesModified.add(pathMatch[1]);
    }

    // Track tool names from assistant tool_calls
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolsUsed.add(tc.function.name);
        // Extract file paths from tool arguments
        try {
          const args = JSON.parse(tc.function.arguments);
          if (args.filePath) filesModified.add(args.filePath);
          if (args.path) filesModified.add(args.path);
        } catch {}
      }
    }
  }

  // Build the summary
  const summaryLines: string[] = [
    `[Auto-compacted context: ${oldMessages.length} messages summarized]`,
    `[${userRequests} user requests, ${toolCalls} tool executions]`,
  ];

  if (toolsUsed.size > 0) {
    summaryLines.push(`[Tools used: ${[...toolsUsed].join(", ")}]`);
  }
  if (filesModified.size > 0) {
    const filesList = [...filesModified].slice(0, 20).join(", ");
    summaryLines.push(`[Files touched: ${filesList}]`);
  }

  summaryLines.push("", "--- Conversation Summary ---", "");

  // Add summarized content (cap total to avoid creating a huge summary)
  const MAX_SUMMARY_CHARS = 4000;
  let totalChars = 0;
  for (const part of summaryParts) {
    if (totalChars + part.length > MAX_SUMMARY_CHARS) {
      summaryLines.push("... (earlier messages truncated)");
      break;
    }
    summaryLines.push(part);
    totalChars += part.length;
  }

  const summaryMessage: ChatMessage = {
    role: "user",
    content: summaryLines.join("\n"),
  };

  const newMessages = [system, summaryMessage, ...recent];
  const tokensAfter = estimateConversationTokens(newMessages);

  return {
    compacted: true,
    removedCount: oldMessages.length,
    estimatedTokensBefore: tokensBefore,
    estimatedTokensAfter: tokensAfter,
    summaryMessage,
  };
}

/**
 * Build a compaction prompt for LLM-assisted summarization.
 * This creates a prompt that can be sent to the LLM to generate
 * a better summary than the heuristic-based one.
 */
export function buildCompactionPrompt(oldMessages: ChatMessage[]): string {
  const parts: string[] = [];

  for (const msg of oldMessages) {
    if (msg.role === "system") continue;
    const content = String(msg.content || "").slice(0, 500);
    if (!content.trim()) continue;

    if (msg.role === "user") {
      parts.push(`USER: ${content}`);
    } else if (msg.role === "assistant") {
      parts.push(`ASSISTANT: ${content}`);
    } else if (msg.role === "tool") {
      parts.push(`TOOL: ${content.slice(0, 200)}`);
    }
  }

  return (
    "Summarize this conversation concisely, preserving:\n" +
    "1. What the user asked for (tasks, requirements)\n" +
    "2. Key decisions made\n" +
    "3. Files that were created, modified, or read\n" +
    "4. Current state of the task (what's done, what's pending)\n" +
    "5. Any errors encountered and how they were resolved\n\n" +
    "Keep it under 500 words. Use bullet points.\n\n" +
    "--- CONVERSATION ---\n" +
    parts.join("\n")
  );
}
