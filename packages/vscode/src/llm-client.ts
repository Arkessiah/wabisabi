/**
 * LLM Client - OpenAI-compatible HTTP streaming client
 *
 * Port of terminal's ApiClient.chatWithToolsStream() for Node.js.
 * Works with both Ollama and Substratum (both expose /v1/chat/completions).
 */

// ── Types ────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface StreamDelta {
  content?: string;
  tool_calls?: Array<{
    index: number;
    id?: string;
    type?: "function";
    function?: { name?: string; arguments?: string };
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

export interface LLMClientOptions {
  baseUrl: string;
  model: string;
  apiKey?: string;
  bearerToken?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

// ── LLMClient ────────────────────────────────────────────────────

export class LLMClient {
  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  private bearerToken?: string;
  private temperature: number;
  private maxTokens: number;
  private timeoutMs: number;

  constructor(opts: LLMClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.bearerToken = opts.bearerToken;
    this.temperature = opts.temperature ?? 0.7;
    this.maxTokens = opts.maxTokens ?? 4096;
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (this.bearerToken) {
      headers["Authorization"] = `Bearer ${this.bearerToken}`;
    } else if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  /**
   * Health check - GET /v1/models with timeout.
   */
  async checkHealth(timeoutMs = 3000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        signal: controller.signal,
        headers: this.getHeaders(),
      });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Core streaming method - async generator.
   * Port of terminal's chatWithToolsStream (api-client.ts:503-630).
   */
  async *streamChat(
    messages: ChatMessage[],
    tools?: ToolSpec[],
    signal?: AbortSignal,
  ): AsyncGenerator<StreamDelta, StreamResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const url = `${this.baseUrl}/v1/chat/completions`;

    // Timeout via AbortController
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), this.timeoutMs);

    // Combine external signal with timeout
    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutController.signal])
      : timeoutController.signal;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: combinedSignal,
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error("Request aborted");
      }
      throw new Error(`Connection failed: ${err.message}`);
    }

    if (!response.ok) {
      clearTimeout(timer);
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    const reader = (response.body as ReadableStream<Uint8Array>)?.getReader();
    if (!reader) {
      clearTimeout(timer);
      throw new Error("No response body");
    }

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

          const delta = chunk.choices?.[0]?.delta as StreamDelta | undefined;
          const reason = chunk.choices?.[0]?.finish_reason;
          if (reason) finishReason = reason;

          if (chunk.usage) {
            usage = chunk.usage as TokenUsage;
          }

          if (!delta) continue;

          // Accumulate content
          if (delta.content) {
            fullContent += delta.content;
          }

          // Accumulate tool calls (streamed in fragments)
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
                if (tc.function?.arguments) existing.arguments += tc.function.arguments;
              }
            }
          }

          yield delta;
        }
      }
    } finally {
      reader.releaseLock();
      clearTimeout(timer);
    }

    // Build final tool calls array
    const toolCalls: ToolCall[] = [];
    for (const [, tc] of [...toolCallAccumulator.entries()].sort((a, b) => a[0] - b[0])) {
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

  /**
   * Non-streaming fallback.
   */
  async chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<StreamResult> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || "",
      tool_calls: choice?.message?.tool_calls || [],
      finish_reason: choice?.finish_reason || "stop",
      usage: data.usage,
    };
  }
}
