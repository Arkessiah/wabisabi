/**
 * Cortex ML Engine
 *
 * Local ML pre-processor that reduces main LLM token consumption.
 * Uses a small Ollama model (qwen2.5:0.5b) for:
 *   - Classifying message complexity (simple/moderate/complex)
 *   - Summarizing long tool results
 *   - Compacting conversation history
 *   - Directly answering simple queries
 *
 * Falls back to heuristics when Ollama is unavailable.
 */

import { CortexClient } from "./client.js";
import {
  CortexConfigSchema,
  DEFAULT_STATS,
  type CortexConfig,
  type CortexStats,
  type ClassifyResult,
  type Complexity,
  type Category,
} from "./schema.js";
import {
  classifyPrompt,
  summarizePrompt,
  compactPrompt,
  answerPrompt,
} from "./prompts.js";
import type { ChatMessage } from "../clients/api-client.js";

// ── Heuristic Fallbacks ────────────────────────────────────

const SIMPLE_PATTERNS = [
  /^(hola|hi|hey|hello|buenos?\s*d[ií]as|buenas?\s*(tardes|noches))/i,
  /^(s[ií]|no|ok|vale|gracias|thanks|bye|adi[oó]s)/i,
  /^(qu[eé]\s*(hora|d[ií]a|fecha)\s*(es|son))/i,
  /^\d+\s*[+\-*/]\s*\d+/,
  /^(cu[aá]nto\s+es|what\s+is)\s+\d/i,
];

const CODE_PATTERNS = [
  /\b(function|class|const|let|var|import|export|async|await)\b/,
  /\b(def |if __name__|print\(|return )\b/,
  /[{}\[\]();]\s*$/m,
  /\b(error|bug|fix|debug|refactor|implement|write code)\b/i,
];

const CREATIVE_PATTERNS = [
  /\b(escribe|write|genera|generate|crea|create|dise[ñn]a|design)\b.*\b(historia|story|poem|poema|art[ií]culo|article)\b/i,
];

function heuristicClassify(message: string): ClassifyResult {
  const lower = message.toLowerCase().trim();

  // Simple patterns
  for (const pat of SIMPLE_PATTERNS) {
    if (pat.test(lower)) {
      return { complexity: "simple", category: "factual", canAnswerLocally: true, confidence: 0.7 };
    }
  }

  // Code patterns
  for (const pat of CODE_PATTERNS) {
    if (pat.test(message)) {
      return { complexity: "complex", category: "code", canAnswerLocally: false, confidence: 0.6 };
    }
  }

  // Creative patterns
  for (const pat of CREATIVE_PATTERNS) {
    if (pat.test(message)) {
      return { complexity: "complex", category: "creative", canAnswerLocally: false, confidence: 0.6 };
    }
  }

  // Short messages tend to be simpler
  if (lower.length < 20) {
    return { complexity: "simple", category: "factual", canAnswerLocally: false, confidence: 0.4 };
  }

  // Default: moderate
  return { complexity: "moderate", category: "factual", canAnswerLocally: false, confidence: 0.3 };
}

function heuristicSummarize(toolName: string, output: string, maxChars: number): string {
  // Take first and last portions
  if (output.length <= maxChars) return output;

  const half = Math.floor(maxChars / 2) - 10;
  const start = output.slice(0, half);
  const end = output.slice(-half);
  return `${start}\n...[${output.length - maxChars} chars omitted]...\n${end}`;
}

function heuristicCompact(messages: ChatMessage[], keepLast: number): ChatMessage[] {
  if (messages.length <= keepLast + 1) return messages;

  const system = messages[0];
  const old = messages.slice(1, -keepLast);
  const recent = messages.slice(-keepLast);

  const summaryParts: string[] = [];
  for (const msg of old) {
    const content = String(msg.content || "").slice(0, 100);
    if (!content) continue;
    if (msg.role === "user") summaryParts.push(`User asked: ${content}`);
    else if (msg.role === "assistant") summaryParts.push(`Assistant: ${content}`);
    else if (msg.role === "tool") summaryParts.push(`Tool: ${content}`);
  }

  const summaryMsg: ChatMessage = {
    role: "user",
    content: `[Cortex summary of ${old.length} earlier messages]\n${summaryParts.join("\n")}`,
  };

  return [system, summaryMsg, ...recent];
}

// ── CortexEngine ───────────────────────────────────────────

export class CortexEngine {
  private client: CortexClient;
  private config: CortexConfig;
  private stats: CortexStats = { ...DEFAULT_STATS };
  private _available: boolean | null = null; // null = not checked yet

  constructor(config?: Partial<CortexConfig>, clusterEndpoint?: string) {
    this.config = CortexConfigSchema.parse(config || {});
    this.client = new CortexClient(this.config, clusterEndpoint);
  }

  /** Update config (e.g., after config reload) */
  updateConfig(config: Partial<CortexConfig>, clusterEndpoint?: string): void {
    this.config = CortexConfigSchema.parse(config);
    this.client = new CortexClient(this.config, clusterEndpoint);
    this._available = null;
  }

  /** Check if Cortex model is available */
  async checkAvailability(): Promise<boolean> {
    if (!this.config.enabled) return false;
    this._available = await this.client.isAvailable();
    return this._available;
  }

  get isEnabled(): boolean {
    return this.config.enabled;
  }

  get isAvailable(): boolean {
    return this._available === true;
  }

  get thresholds(): CortexConfig["thresholds"] {
    return this.config.thresholds;
  }

  // ── Classification ─────────────────────────────────────────

  async classify(message: string): Promise<ClassifyResult> {
    this.stats.classified++;

    if (!this.config.enabled || this._available === false) {
      this.stats.fallbacks++;
      return heuristicClassify(message);
    }

    const prompt = classifyPrompt(message);
    const result = await this.client.generateJSON<ClassifyResult>(prompt);

    if (result && result.complexity && result.category) {
      // Validate fields
      const validComplexity: Complexity[] = ["simple", "moderate", "complex"];
      const validCategory: Category[] = ["factual", "calculation", "code", "creative", "system"];

      if (validComplexity.includes(result.complexity) && validCategory.includes(result.category)) {
        return {
          complexity: result.complexity,
          category: result.category,
          canAnswerLocally: result.canAnswerLocally ?? false,
          confidence: Math.min(1, Math.max(0, result.confidence ?? 0.5)),
        };
      }
    }

    // Model returned invalid data, fall back
    this.stats.fallbacks++;
    return heuristicClassify(message);
  }

  // ── Direct Answering ───────────────────────────────────────

  async answer(message: string, context?: string): Promise<string | null> {
    if (!this.config.enabled || this._available === false) {
      return null;
    }

    const prompt = answerPrompt(message, context);
    const response = await this.client.generate(prompt, { maxTokens: 128 });

    if (!response || response === "CANNOT_ANSWER" || response.includes("CANNOT_ANSWER")) {
      return null;
    }

    this.stats.answered++;
    // Rough estimate: each answered query saves ~200 tokens on the main LLM
    this.stats.tokensSaved += 200;
    return response;
  }

  // ── Summarization ──────────────────────────────────────────

  async summarize(toolName: string, output: string): Promise<string> {
    const maxChars = 200;

    if (!this.config.enabled || this._available === false) {
      this.stats.fallbacks++;
      return heuristicSummarize(toolName, output, maxChars);
    }

    const prompt = summarizePrompt(toolName, output, maxChars);
    const response = await this.client.generate(prompt, { maxTokens: 256 });

    if (response && response.length > 10) {
      this.stats.summarized++;
      // Estimate tokens saved: original chars/4 minus summary chars/4
      const saved = Math.max(0, Math.floor((output.length - response.length) / 4));
      this.stats.tokensSaved += saved;
      return response;
    }

    this.stats.fallbacks++;
    return heuristicSummarize(toolName, output, maxChars);
  }

  // ── Compaction ─────────────────────────────────────────────

  async compact(messages: ChatMessage[], keepLast: number = 6): Promise<ChatMessage[]> {
    if (messages.length <= keepLast + 1) return messages;

    if (!this.config.enabled || this._available === false) {
      this.stats.fallbacks++;
      return heuristicCompact(messages, keepLast);
    }

    const prompt = compactPrompt(messages, keepLast);
    if (!prompt) {
      return messages;
    }

    const response = await this.client.generate(prompt, { maxTokens: 512 });

    if (response && response.length > 30) {
      const system = messages[0];
      const recent = messages.slice(-keepLast);
      const oldCount = messages.length - keepLast - 1;

      const summaryMsg: ChatMessage = {
        role: "user",
        content: `[Cortex-compacted: ${oldCount} messages]\n\n${response}`,
      };

      this.stats.compacted++;
      // Rough token savings estimate
      const oldTokens = messages.slice(1, -keepLast).reduce(
        (sum, m) => sum + Math.floor(String(m.content || "").length / 4), 0
      );
      const newTokens = Math.floor(response.length / 4);
      this.stats.tokensSaved += Math.max(0, oldTokens - newTokens);

      return [system, summaryMsg, ...recent];
    }

    this.stats.fallbacks++;
    return heuristicCompact(messages, keepLast);
  }

  // ── Stats ──────────────────────────────────────────────────

  getStats(): CortexStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = { ...DEFAULT_STATS };
  }

  getStatsSummary(): string {
    const s = this.stats;
    const lines = [
      `Classified: ${s.classified}`,
      `Answered locally: ${s.answered}`,
      `Summarized: ${s.summarized}`,
      `Compacted: ${s.compacted}`,
      `Tokens saved: ~${s.tokensSaved.toLocaleString()}`,
      `Errors: ${s.errors}`,
      `Fallbacks: ${s.fallbacks}`,
      `Available: ${this._available ? "yes" : "no"}`,
      `Model: ${this.config.model}`,
    ];
    return lines.join("\n");
  }
}

// ── Singleton ──────────────────────────────────────────────

export const cortexEngine = new CortexEngine();
