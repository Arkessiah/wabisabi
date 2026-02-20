/**
 * Cortex Prompt Templates
 *
 * Optimized prompts for small models (qwen2.5:0.5b).
 * Keep prompts short and structured - small models work best
 * with clear, constrained output formats.
 */

import type { ChatMessage } from "../clients/api-client.js";

/**
 * Classify user message complexity and category.
 * Output: JSON with complexity, category, canAnswerLocally, confidence
 */
export function classifyPrompt(message: string): string {
  return `Classify this user message. Respond ONLY with JSON, no other text.

Message: "${message.slice(0, 300)}"

JSON format:
{"complexity":"simple|moderate|complex","category":"factual|calculation|code|creative|system","canAnswerLocally":true|false,"confidence":0.0-1.0}

Rules:
- "simple" = greeting, yes/no, basic fact, arithmetic
- "moderate" = multi-step reasoning, short code, explanation
- "complex" = architecture, debugging, large code, creative writing
- canAnswerLocally = true ONLY for greetings, basic math, simple facts, time/date
- confidence = how sure you are (0.0-1.0)

JSON:`;
}

/**
 * Summarize a tool result to reduce context size.
 */
export function summarizePrompt(toolName: string, output: string, maxChars: number = 200): string {
  // Truncate very long outputs to avoid overwhelming the small model
  const truncated = output.length > 2000 ? output.slice(0, 2000) + "\n...[truncated]" : output;

  return `Summarize this tool output in ${maxChars} characters or less. Keep key facts, file paths, errors.

Tool: ${toolName}
Output:
${truncated}

Summary:`;
}

/**
 * Compact conversation messages into a summary.
 */
export function compactPrompt(messages: ChatMessage[], keepLast: number = 6): string {
  const toCompact = messages.slice(1, -keepLast); // Skip system, keep recent
  if (toCompact.length === 0) return "";

  const parts: string[] = [];
  for (const msg of toCompact) {
    const content = String(msg.content || "").slice(0, 150);
    if (!content) continue;
    if (msg.role === "user") parts.push(`U: ${content}`);
    else if (msg.role === "assistant") parts.push(`A: ${content}`);
    else if (msg.role === "tool") parts.push(`T: ${content}`);
  }

  return `Summarize this conversation history into a concise context paragraph (max 500 chars). Preserve: decisions made, files modified, errors encountered, key facts.

Conversation:
${parts.join("\n")}

Summary:`;
}

/**
 * Direct answer for simple queries the local model can handle.
 */
export function answerPrompt(message: string, context?: string): string {
  const ctxPart = context ? `\nContext: ${context.slice(0, 300)}` : "";

  return `Answer this simple question briefly and accurately. If you cannot answer confidently, respond with exactly "CANNOT_ANSWER".
${ctxPart}
Question: ${message.slice(0, 300)}

Answer:`;
}
