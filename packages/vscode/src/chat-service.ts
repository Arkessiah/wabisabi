/**
 * Chat Service - Orchestration Layer
 *
 * Wires together LLMClient, ProviderManager, ToolExecutor, and
 * conversation history. Equivalent of BaseAgent's streamResponse()
 * + tool-calling loop, adapted for VS Code.
 */

import { LLMClient, type ChatMessage, type StreamResult, type ToolCall, type ToolSpec } from "./llm-client";
import { ProviderManager } from "./provider-manager";
import { ToolExecutor } from "./tool-executor";
import type { WabiSabiConfig } from "./config";

// ── Types ────────────────────────────────────────────────────────

type AgentType = "build" | "plan" | "search";

export interface ChatServiceCallbacks {
  onToken: (chunk: string) => void;
  onStatus: (text: string) => void;
  onToolCall: (name: string, status: "running" | "done") => void;
  onError: (error: string) => void;
}

const MAX_TOOL_ITERATIONS = 15;

// ── System Prompts ───────────────────────────────────────────────

function getSystemPrompt(agent: AgentType, workspaceRoot: string): string {
  const base = `You are running inside VS Code as WabiSabi AI assistant. The workspace root is: ${workspaceRoot}\n\n`;

  if (agent === "build") {
    return base + `You are an expert software engineer. You help developers build, modify, and debug software projects.

## Tools

You have access to these tools:
- **read**: Read file contents with line numbers
- **write**: Create or overwrite files
- **edit**: Search-and-replace in files (exact match)
- **bash**: Run shell commands (build, test, install, git, etc.)
- **grep**: Search file contents with regex patterns
- **glob**: Find files by name pattern (e.g. "**/*.ts")
- **list**: Show directory tree structure

## Workflow

1. **Understand first**: Use list, glob, grep, and read to understand the project before making changes
2. **Plan before coding**: Think through the approach for non-trivial tasks
3. **Make targeted changes**: Use edit for small modifications, write for new files
4. **Verify your work**: Use bash to run tests or build to confirm nothing is broken

## Code Quality

- Write clean, idiomatic code matching the project's existing style
- Keep changes focused - only modify what's needed
- Preserve existing formatting and conventions

## Communication

- Be concise. Show code and results, not lengthy explanations
- When you encounter an error, diagnose and fix it rather than just reporting it`;
  }

  if (agent === "plan") {
    return base + `You are a software architect. You analyze codebases and design implementation plans.

## Tools (read-only)

- **read**: Read file contents
- **grep**: Search file contents
- **glob**: Find files by pattern
- **list**: Show directory tree

## Workflow

1. Explore the codebase thoroughly before making recommendations
2. Identify existing patterns and conventions
3. Design implementation plans with specific file paths and code changes
4. Consider trade-offs and potential issues

## Communication

- Structure your analysis with clear sections
- Reference specific files and line numbers
- Provide actionable implementation steps`;
  }

  // search
  return base + `You are a codebase search and analysis expert. You find and analyze code efficiently.

## Tools (read-only)

- **read**: Read file contents
- **grep**: Search file contents with regex
- **glob**: Find files by pattern
- **list**: Show directory tree

## Workflow

1. Use grep and glob to find relevant code quickly
2. Read files to understand context
3. Provide concise summaries of findings

## Communication

- Show relevant code snippets with file paths and line numbers
- Be direct and concise`;
}

// ── ChatService ──────────────────────────────────────────────────

export class ChatService {
  private client: LLMClient | null = null;
  private providerManager: ProviderManager;
  private toolExecutor: ToolExecutor;
  private conversationHistory: ChatMessage[] = [];
  private abortController: AbortController | null = null;
  private agent: AgentType;
  private callbacks: ChatServiceCallbacks;
  private config: WabiSabiConfig;
  private workspaceRoot: string;

  constructor(
    config: WabiSabiConfig,
    workspaceRoot: string,
    callbacks: ChatServiceCallbacks,
  ) {
    this.config = config;
    this.workspaceRoot = workspaceRoot;
    this.callbacks = callbacks;
    this.agent = (config.agent as AgentType) || "build";
    this.providerManager = new ProviderManager(config);
    this.toolExecutor = new ToolExecutor(workspaceRoot);
  }

  /**
   * Send a user message, stream the response with tool calling.
   */
  async sendMessage(text: string): Promise<string> {
    let client: LLMClient;
    try {
      client = await this.ensureClient();
    } catch (err: any) {
      const msg = this.formatConnectionError(err);
      this.callbacks.onError(msg);
      throw new Error(msg);
    }

    // Build system message if this is the first message
    if (this.conversationHistory.length === 0) {
      this.conversationHistory.push({
        role: "system",
        content: getSystemPrompt(this.agent, this.workspaceRoot),
      });
    }

    // Add user message
    this.conversationHistory.push({ role: "user", content: text });

    // Get tool specs for current agent
    const toolSpecs = this.toolExecutor.getToolSpecs(this.agent);

    // Stream response
    this.abortController = new AbortController();
    let result: StreamResult;
    try {
      result = await this.streamFromLLM(client, toolSpecs);
    } catch (err: any) {
      const msg = this.formatStreamError(err);
      this.callbacks.onError(msg);
      // Remove the user message so conversation stays consistent
      this.conversationHistory.pop();
      throw new Error(msg);
    }

    // Tool-calling loop
    let iterations = 0;
    while (result.tool_calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      // Add assistant message with tool calls
      this.conversationHistory.push({
        role: "assistant",
        content: result.content || null,
        tool_calls: result.tool_calls,
      });

      // Execute each tool
      for (const call of result.tool_calls) {
        this.callbacks.onToolCall(call.function.name, "running");
        this.callbacks.onStatus(`Running ${call.function.name}...`);

        let toolResult: { title: string; output: string };
        try {
          toolResult = await this.toolExecutor.execute(
            call.function.name,
            call.function.arguments,
          );
        } catch (toolErr: any) {
          toolResult = { title: call.function.name, output: `Tool error: ${toolErr.message}` };
        }

        // Truncate large outputs
        let output = toolResult.output;
        if (output.length > 30000) {
          output = output.substring(0, 30000) + "\n... (truncated)";
        }

        this.conversationHistory.push({
          role: "tool",
          content: output,
          tool_call_id: call.id,
        });

        this.callbacks.onToolCall(call.function.name, "done");
      }

      // Re-call LLM with tool results
      this.callbacks.onStatus("Analyzing results...");
      try {
        result = await this.streamFromLLM(client, toolSpecs);
      } catch (err: any) {
        // Mid-loop stream failure: report error but keep tool results in history
        const msg = this.formatStreamError(err);
        this.callbacks.onError(msg);
        return `(Streaming interrupted after ${iterations} tool iterations: ${msg})`;
      }
    }

    if (iterations >= MAX_TOOL_ITERATIONS && result.tool_calls.length > 0) {
      this.callbacks.onStatus("Tool iteration limit reached");
    }

    // Add final assistant response to history
    if (result.content) {
      this.conversationHistory.push({
        role: "assistant",
        content: result.content,
      });
    }

    return result.content;
  }

  /**
   * Stream response from LLM, yielding tokens via callback.
   */
  private async streamFromLLM(
    client: LLMClient,
    toolSpecs: ToolSpec[],
  ): Promise<StreamResult> {
    const generator = client.streamChat(
      this.conversationHistory,
      toolSpecs,
      this.abortController?.signal,
    );

    let result: StreamResult | undefined;

    while (true) {
      const { done, value } = await generator.next();

      if (done) {
        result = value as StreamResult;
        break;
      }

      // Yield content tokens to the UI
      const delta = value;
      if (delta.content) {
        this.callbacks.onToken(delta.content);
      }
    }

    if (!result) {
      return { content: "", tool_calls: [], finish_reason: "error" };
    }

    return result;
  }

  /**
   * Ensure LLM client is connected and healthy.
   */
  private async ensureClient(): Promise<LLMClient> {
    if (this.client) {
      // Verify existing client is still reachable
      const healthy = await this.client.checkHealth(3000);
      if (healthy) return this.client;

      // Provider went offline, try to re-resolve
      this.callbacks.onStatus("Provider disconnected, reconnecting...");
      this.client = null;
    }

    this.callbacks.onStatus("Connecting to provider...");
    const provider = await this.providerManager.resolve();
    this.callbacks.onStatus(`Connected to ${provider.type} (${provider.baseUrl})`);

    this.client = new LLMClient({
      baseUrl: provider.baseUrl,
      model: this.config.model,
      apiKey: provider.apiKey,
      bearerToken: provider.bearerToken,
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
    });

    // Verify connection
    const healthy = await this.client.checkHealth(5000);
    if (!healthy) {
      this.client = null;
      throw new Error(`Cannot reach ${provider.type} at ${provider.baseUrl}`);
    }

    return this.client;
  }

  /** Format connection errors into user-friendly messages. */
  private formatConnectionError(err: any): string {
    const msg = err.message || String(err);
    if (msg.includes("Cannot reach")) {
      return `Provider offline: ${msg}. Check that Ollama is running or Substratum credentials are valid.`;
    }
    if (msg.includes("No provider available")) {
      return "No LLM provider found. Start Ollama (`ollama serve`) or configure Substratum in settings.";
    }
    return `Connection failed: ${msg}`;
  }

  /** Format streaming errors into user-friendly messages. */
  private formatStreamError(err: any): string {
    const msg = err.message || String(err);
    if (msg.includes("aborted") || msg.includes("AbortError")) {
      return "Request cancelled.";
    }
    if (msg.includes("HTTP 401") || msg.includes("HTTP 403")) {
      return "Authentication failed. Check your API key or bearer token.";
    }
    if (msg.includes("HTTP 429")) {
      return "Rate limited. Wait a moment and try again.";
    }
    if (msg.includes("HTTP 5")) {
      return `Server error: ${msg}. The provider may be overloaded.`;
    }
    if (msg.includes("timeout") || msg.includes("Timeout")) {
      return "Request timed out. The model may be loading or overloaded.";
    }
    if (msg.includes("Connection failed") || msg.includes("ECONNREFUSED")) {
      this.client = null; // Force reconnect
      return "Connection lost. Provider may have gone offline.";
    }
    return `Stream error: ${msg}`;
  }

  /** Cancel current request. */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Clear conversation history. */
  clearHistory(): void {
    this.conversationHistory = [];
    this.client = null; // Force re-resolve provider on next message
  }

  /** Switch agent type. */
  setAgent(agent: AgentType): void {
    this.agent = agent;
    this.conversationHistory = []; // Reset conversation for new agent
  }
}
