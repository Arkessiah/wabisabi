/**
 * WabiSabi API Client
 *
 * HTTP client for Substratum and OpenAI-compatible backends.
 * Supports: auth headers, retries with exponential backoff,
 * request timeouts, simple chat, tool-calling, and SSE streaming.
 */

import type { ToolSpec } from "../tools/index.js";

// ── Types ──────────────────────────────────────────────────────

export interface CLIOptions {
  substratum: string;
  ollama: string;
  model: string;
  apiKey?: string;
  privacy?: string;
  allowFileRead?: boolean;
  allowFileWrite?: boolean;
  allowSystemCommands?: boolean;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: TokenUsage;
}

export interface StreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: {
      name?: string;
      arguments?: string;
    };
  }>;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface StreamResult {
  content: string;
  tool_calls: ToolCall[];
  finish_reason: string;
  usage?: TokenUsage;
}

// ── Retry & Timeout ───────────────────────────────────────────

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120_000;

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Provider Types ────────────────────────────────────────────

export type ProviderType = "substratum" | "ollama" | "custom";

export interface ProviderStatus {
  type: ProviderType;
  url: string;
  available: boolean;
  models?: string[];
}

function formatNetworkError(error: unknown, providerUrl: string): string {
  if (error instanceof TypeError) {
    return `Cannot connect to ${providerUrl}. Check that the server is running and accessible.`;
  }
  if (error instanceof Error && error.message === "Request timed out") {
    return `Request to ${providerUrl} timed out after ${REQUEST_TIMEOUT_MS / 1000}s.`;
  }
  return error instanceof Error ? error.message : String(error);
}

// ── Client ─────────────────────────────────────────────────────

export class ApiClient {
  private substratumUrl: string;
  private ollamaUrl: string;
  private apiKey: string | undefined;
  private activeProvider: ProviderType = "substratum";
  private providerChecked = false;
  private providerAvailable = false;
  model: string;

  constructor(options: CLIOptions) {
    this.substratumUrl = options?.substratum || "http://localhost:3001";
    this.ollamaUrl = options?.ollama || "http://localhost:11434";
    this.model = options?.model || "llama3.2";
    this.apiKey =
      options?.apiKey ||
      process.env.WABISABI_API_KEY ||
      process.env.OPENAI_API_KEY;
  }

  /**
   * Get the active provider URL for chat completions.
   * Auto-detects available providers on first call.
   */
  private async getProviderUrl(): Promise<string> {
    if (!this.providerChecked) {
      await this.detectProvider();
    }

    if (this.activeProvider === "ollama") {
      return `${this.ollamaUrl}/v1/chat/completions`;
    }
    return `${this.substratumUrl}/v1/chat/completions`;
  }

  /**
   * Detect which provider is available.
   * Priority: Substratum > Ollama
   * Ollama exposes an OpenAI-compatible API at /v1/ since v0.1.24
   */
  async detectProvider(): Promise<ProviderType> {
    this.providerChecked = true;

    // Try Substratum first
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.substratumUrl}/v1/models`, {
        signal: controller.signal,
        headers: this.getHeaders(),
      });
      clearTimeout(timeout);
      if (res.ok) {
        this.activeProvider = "substratum";
        this.providerAvailable = true;
        return "substratum";
      }
    } catch {}

    // Try Ollama
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        this.activeProvider = "ollama";
        this.providerAvailable = true;
        return "ollama";
      }
    } catch {}

    // No provider available - will fail on actual requests with clear error
    this.activeProvider = "substratum";
    this.providerAvailable = false;
    return "substratum";
  }

  /**
   * Get status of all configured providers.
   */
  async getProviderStatus(): Promise<ProviderStatus[]> {
    const results: ProviderStatus[] = [];

    // Check Substratum
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.substratumUrl}/v1/models`, {
        signal: controller.signal,
        headers: this.getHeaders(),
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        results.push({
          type: "substratum",
          url: this.substratumUrl,
          available: true,
          models: data.data?.map((m: any) => m.id) || [],
        });
      } else {
        results.push({ type: "substratum", url: this.substratumUrl, available: false });
      }
    } catch {
      results.push({ type: "substratum", url: this.substratumUrl, available: false });
    }

    // Check Ollama
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${this.ollamaUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        results.push({
          type: "ollama",
          url: this.ollamaUrl,
          available: true,
          models: data.models?.map((m: any) => m.name) || [],
        });
      } else {
        results.push({ type: "ollama", url: this.ollamaUrl, available: false });
      }
    } catch {
      results.push({ type: "ollama", url: this.ollamaUrl, available: false });
    }

    return results;
  }

  /** Get the active provider type */
  getActiveProvider(): ProviderType {
    return this.activeProvider;
  }

  /** Check if any provider was detected as available */
  isProviderAvailable(): boolean {
    return this.providerAvailable;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /**
   * Fetch with retry + exponential backoff + timeout.
   */
  private async fetchRetry(
    url: string,
    init: RequestInit,
    retries = MAX_RETRIES,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
          return response;
        }

        lastError = new Error(
          `HTTP ${response.status}: ${response.statusText}`,
        );

        // Respect Retry-After header
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter && attempt < retries) {
          await sleep(
            Math.min(parseInt(retryAfter, 10) * 1000 || BASE_DELAY_MS, 30_000),
          );
          continue;
        }
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;

        // Don't retry user aborts
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          throw new Error("Request timed out");
        }

        // Only retry network errors (TypeError = fetch failure)
        if (!(error instanceof TypeError)) throw error;
      }

      if (attempt < retries) {
        await sleep(
          BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500,
        );
      }
    }

    throw lastError;
  }

  async chat(prompt: string): Promise<string> {
    const url = await this.getProviderUrl();
    const response = await this.fetchRetry(
      url,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data: ChatResponse = await response.json();
    return data.choices[0]?.message?.content || "No response";
  }

  async chatWithTools(
    messages: ChatMessage[],
    tools: ToolSpec[],
  ): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    try {
      const url = await this.getProviderUrl();
      const response = await this.fetchRetry(
        url,
        {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(body),
        },
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `HTTP ${response.status}: ${text || response.statusText}`,
        );
      }

      return (await response.json()) as ChatResponse;
    } catch (error) {
      const providerUrl = this.activeProvider === "ollama"
        ? this.ollamaUrl
        : this.substratumUrl;
      const errorMsg = !this.providerAvailable
        ? `No AI providers available. Start Substratum (${this.substratumUrl}) or Ollama (${this.ollamaUrl}).`
        : formatNetworkError(error, providerUrl);

      return {
        id: "error",
        object: "chat.completion",
        created: Date.now(),
        model: this.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: `Error: ${errorMsg}`,
            },
            finish_reason: "error",
          },
        ],
      };
    }
  }

  async *chatWithToolsStream(
    messages: ChatMessage[],
    tools: ToolSpec[],
  ): AsyncGenerator<StreamDelta, StreamResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
    };

    if (tools.length > 0) {
      body.tools = tools;
    }

    const url = await this.getProviderUrl();
    const response = await this.fetchRetry(
      url,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      },
      1, // Only 1 retry for streaming
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status}: ${text || response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    const toolCallAccumulator = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason = "stop";
    let usage: TokenUsage | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          let chunk: any;
          try {
            chunk = JSON.parse(data);
          } catch {
            continue;
          }

          const delta = chunk.choices?.[0]?.delta as
            | StreamDelta
            | undefined;
          const reason = chunk.choices?.[0]?.finish_reason;
          if (reason) finishReason = reason;

          if (chunk.usage) {
            usage = chunk.usage as TokenUsage;
          }

          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
          }

          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallAccumulator.get(tc.index);
              if (!existing) {
                toolCallAccumulator.set(tc.index, {
                  id: tc.id || "",
                  name: tc.function?.name || "",
                  arguments: tc.function?.arguments || "",
                });
              } else {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments)
                  existing.arguments += tc.function.arguments;
              }
            }
          }

          yield delta;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls: ToolCall[] = [];
    for (const [, tc] of [...toolCallAccumulator.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      toolCalls.push({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      });
    }

    return {
      content: fullContent,
      tool_calls: toolCalls,
      finish_reason: finishReason,
      usage,
    };
  }

  async chatOllama(prompt: string): Promise<string> {
    const response = await this.fetchRetry(
      `${this.ollamaUrl}/api/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.response || "No response";
  }

  async listModels(): Promise<string[]> {
    const providers = await this.getProviderStatus();
    const models: string[] = [];

    for (const provider of providers) {
      if (provider.available && provider.models) {
        models.push(...provider.models);
      }
    }

    return models.length > 0 ? [...new Set(models)] : [this.model];
  }
}
