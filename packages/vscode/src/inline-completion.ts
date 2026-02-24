/**
 * Inline Completion Provider
 *
 * Provides Copilot-style inline suggestions using the configured
 * LLM provider (Ollama or Substratum). Triggers after a brief pause
 * in typing and suggests completions based on surrounding code context.
 */

import * as vscode from "vscode";
import { LLMClient, type ChatMessage } from "./llm-client";
import { ProviderManager } from "./provider-manager";
import type { WabiSabiConfig } from "./config";

const DEBOUNCE_MS = 500;
const MAX_CONTEXT_LINES = 50;
const MAX_SUFFIX_LINES = 10;

export class InlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  private client: LLMClient | null = null;
  private providerManager: ProviderManager;
  private abortController: AbortController | null = null;
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor(private readonly config: WabiSabiConfig) {
    this.providerManager = new ProviderManager(config);
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionList | undefined> {
    // Only trigger on automatic invocations or explicit invoke
    if (context.triggerKind === vscode.InlineCompletionTriggerKind.Automatic) {
      // Debounce: wait for user to stop typing
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      await new Promise<void>((resolve) => {
        this.debounceTimer = setTimeout(resolve, DEBOUNCE_MS);
      });
    }

    if (token.isCancellationRequested) return undefined;

    // Abort previous request
    this.abortController?.abort();
    this.abortController = new AbortController();

    // Listen for cancellation
    token.onCancellationRequested(() => this.abortController?.abort());

    try {
      const client = await this.ensureClient();
      const { prefix, suffix, language } = this.getContext(document, position);

      if (!prefix.trim()) return undefined;

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: `You are an inline code completion engine. Given the code context, predict the NEXT few lines the developer would write. Rules:
- Output ONLY the completion code, no explanations, no markdown, no backticks
- Match the exact indentation style of the surrounding code
- Keep completions short (1-5 lines max)
- If unsure, output nothing
- Language: ${language}`,
        },
        {
          role: "user",
          content: `<prefix>\n${prefix}\n</prefix>\n<suffix>\n${suffix}\n</suffix>\n\nComplete the code at the cursor position:`,
        },
      ];

      const result = await client.chat(messages);

      if (token.isCancellationRequested) return undefined;

      const completion = result.content.trim();
      if (!completion) return undefined;

      // Clean up: remove markdown fences if the model adds them
      const cleaned = completion
        .replace(/^```\w*\n?/, "")
        .replace(/\n?```$/, "")
        .trimEnd();

      if (!cleaned) return undefined;

      const item = new vscode.InlineCompletionItem(
        cleaned,
        new vscode.Range(position, position),
      );

      return new vscode.InlineCompletionList([item]);
    } catch {
      return undefined;
    }
  }

  private getContext(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): { prefix: string; suffix: string; language: string } {
    const startLine = Math.max(0, position.line - MAX_CONTEXT_LINES);
    const endLine = Math.min(document.lineCount - 1, position.line + MAX_SUFFIX_LINES);

    const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
    const suffixRange = new vscode.Range(position.line, position.character, endLine, document.lineAt(endLine).text.length);

    return {
      prefix: document.getText(prefixRange),
      suffix: document.getText(suffixRange),
      language: document.languageId,
    };
  }

  private async ensureClient(): Promise<LLMClient> {
    if (this.client) return this.client;

    const provider = await this.providerManager.resolve();
    this.client = new LLMClient({
      baseUrl: provider.baseUrl,
      model: this.config.model,
      apiKey: provider.apiKey,
      bearerToken: provider.bearerToken,
      temperature: 0.2, // Low temperature for completions
      maxTokens: 128,   // Short completions
      timeoutMs: 5000,   // Fast timeout
    });

    return this.client;
  }

  /** Reset client (e.g., when config changes). */
  resetClient(): void {
    this.client = null;
  }
}
