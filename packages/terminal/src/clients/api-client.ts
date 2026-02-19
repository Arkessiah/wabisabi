/**
 * WabiSabi API Client
 *
 * HTTP client for Substratum and OpenAI-compatible backends.
 * Supports: auth headers, retries with exponential backoff,
 * request timeouts, simple chat, tool-calling, and SSE streaming.
 */

import type { ToolSpec } from "../tools/index.js";
import type { ProvidersConfig } from "../config/schema.js";
import { OllamaCluster, type ClusterNodeStatus } from "./ollama-cluster.js";
import { authManager } from "../auth/index.js";

// ── Types ──────────────────────────────────────────────────────

export interface CLIOptions {
  // Legacy (backward-compat)
  substratum?: string;
  ollama?: string;
  model: string;
  apiKey?: string;
  privacy?: string;
  allowFileRead?: boolean;
  allowFileWrite?: boolean;
  allowSystemCommands?: boolean;
  // New provider system
  providers?: ProvidersConfig;
  provider?: "substratum" | "ollama";
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
  private substratumEnabled: boolean;
  private ollamaCluster: OllamaCluster;
  private apiKey: string | undefined;
  private activeProvider: ProviderType = "substratum";
  private activeNodeName: string | null = null;
  private providerChecked = false;
  private providerAvailable = false;
  private forcedProvider: ProviderType | null = null;
  model: string;

  constructor(options: CLIOptions) {
    this.model = options?.model || "llama3.2";
    this.apiKey =
      options?.apiKey ||
      process.env.WABISABI_API_KEY ||
      process.env.OPENAI_API_KEY;

    if (options?.providers) {
      // New provider config format
      const { substratum, ollama } = options.providers;
      this.substratumUrl = substratum.url;
      this.substratumEnabled = substratum.enabled;
      if (substratum.apiKey) this.apiKey = this.apiKey || substratum.apiKey;
      this.ollamaCluster = new OllamaCluster(ollama.nodes);
    } else {
      // Legacy: single URLs
      this.substratumUrl = options?.substratum || "https://api.substratum.dev";
      this.substratumEnabled = Boolean(options?.substratum);
      const ollamaUrl = options?.ollama || "http://localhost:11434";
      this.ollamaCluster = new OllamaCluster([
        { name: "local", url: ollamaUrl, priority: 5 },
      ]);
    }

    if (options?.provider) {
      this.forcedProvider = options.provider;
    }
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
      const node = this.ollamaCluster.getActiveNode();
      if (node) {
        this.activeNodeName = node.name;
        return `${node.url}/v1/chat/completions`;
      }
      // Fallback to substratum if cluster has no healthy nodes
      if (this.substratumEnabled) {
        return `${this.substratumUrl}/v1/chat/completions`;
      }
    }
    return `${this.substratumUrl}/v1/chat/completions`;
  }

  /**
   * Detect which provider is available.
   * Priority: forced > Substratum (if enabled) > Ollama cluster
   */
  async detectProvider(): Promise<ProviderType> {
    this.providerChecked = true;

    // If forced, only check that one
    if (this.forcedProvider === "ollama") {
      await this.ollamaCluster.checkAllNodes();
      if (this.ollamaCluster.hasHealthyNodes()) {
        this.activeProvider = "ollama";
        this.providerAvailable = true;
        this.ollamaCluster.startHealthChecks();
        return "ollama";
      }
    }

    if (this.forcedProvider === "substratum") {
      const ok = await this.checkSubstratum();
      if (ok) return "substratum";
      this.providerAvailable = false;
      return "substratum";
    }

    // Auto-detect: Substratum first (if enabled), then Ollama cluster
    if (this.substratumEnabled) {
      const ok = await this.checkSubstratum();
      if (ok) {
        // Also start Ollama health checks in background for failover
        this.ollamaCluster.checkAllNodes().then(() => {
          this.ollamaCluster.startHealthChecks();
        }).catch(() => {});
        return "substratum";
      }
    }

    // Try Ollama cluster
    await this.ollamaCluster.checkAllNodes();
    if (this.ollamaCluster.hasHealthyNodes()) {
      this.activeProvider = "ollama";
      this.providerAvailable = true;
      this.ollamaCluster.startHealthChecks();
      return "ollama";
    }

    // No provider available
    this.providerAvailable = false;
    return "substratum";
  }

  private async checkSubstratum(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const headers = await this.getHeaders();
      const res = await fetch(`${this.substratumUrl}/v1/models`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      if (res.ok) {
        this.activeProvider = "substratum";
        this.providerAvailable = true;
        return true;
      }
    } catch {}
    return false;
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
      const headers = await this.getHeaders();
      const res = await fetch(`${this.substratumUrl}/v1/models`, {
        signal: controller.signal,
        headers,
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

    // Check Ollama cluster nodes
    await this.ollamaCluster.checkAllNodes();
    for (const nodeStatus of this.ollamaCluster.getStatus()) {
      results.push({
        type: "ollama",
        url: nodeStatus.url,
        available: nodeStatus.healthy,
        models: nodeStatus.models,
      });
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

  /** Get cluster node status for diagnostics */
  getClusterStatus(): ClusterNodeStatus[] {
    return this.ollamaCluster.getStatus();
  }

  /** Cleanup timers and resources */
  destroy(): void {
    this.ollamaCluster.destroy();
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // 1. Try authManager (JWT with auto-refresh / API key)
    const authHeaders = await authManager.getAuthHeaders();
    if (Object.keys(authHeaders).length > 0) {
      Object.assign(headers, authHeaders);
    } else if (this.apiKey) {
      // 2. Fallback to constructor apiKey
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // 3. Add session ID if available (Substratum terminal endpoints)
    const sessionId = authManager.getSessionId();
    if (sessionId) {
      headers["X-Session-ID"] = sessionId;
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
    const headers = await this.getHeaders();
    const response = await this.fetchRetry(
      url,
      {
        method: "POST",
        headers,
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
      const headers = await this.getHeaders();
      const response = await this.fetchRetry(
        url,
        {
          method: "POST",
          headers,
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
      // Report failure to cluster for circuit breaker
      if (this.activeProvider === "ollama" && this.activeNodeName) {
        this.ollamaCluster.reportFailure(this.activeNodeName);
      }

      const providerUrl = this.activeProvider === "ollama"
        ? (this.activeNodeName ? this.ollamaCluster.getStatus().find(n => n.name === this.activeNodeName)?.url : this.substratumUrl) || this.substratumUrl
        : this.substratumUrl;
      const errorMsg = !this.providerAvailable
        ? `No AI providers available. Configure Substratum or Ollama via 'wabisabi config --wizard'.`
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
    const headers = await this.getHeaders();
    const response = await this.fetchRetry(
      url,
      {
        method: "POST",
        headers,
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
    if (!this.providerChecked) await this.detectProvider();
    const node = this.ollamaCluster.getActiveNode();
    const baseUrl = node?.url || "http://localhost:11434";

    const response = await this.fetchRetry(
      `${baseUrl}/api/generate`,
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
      if (node) this.ollamaCluster.reportFailure(node.name);
      throw new Error(`Ollama HTTP ${response.status}`);
    }

    if (node) this.ollamaCluster.reportSuccess(node.name);
    const data = await response.json();
    return data.response || "No response";
  }

  async getBillingInfo(): Promise<{ tokensUsed: number; tokensRemaining: number; dailyLimit: number } | null> {
    try {
      const headers = await this.getHeaders();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.substratumUrl}/v1/billing`, {
        signal: controller.signal,
        headers,
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      return {
        tokensUsed: data.tokensUsed ?? 0,
        tokensRemaining: data.tokensRemaining ?? 0,
        dailyLimit: data.dailyLimit ?? 0,
      };
    } catch {
      return null;
    }
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
