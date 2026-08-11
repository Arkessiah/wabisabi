/**
 * Cortex ML Client
 *
 * Lightweight HTTP client for Ollama's /api/generate endpoint.
 * Used by CortexEngine for local inference. No streaming, no auth, hard timeout,
 * zero retries.
 *
 * ## Why the result is discriminated
 *
 * This client used to return `null` for every failure mode: timeout, Ollama down,
 * HTTP 500, oversized prompt and "the model produced nothing" were indistinguishable.
 * That violates the project invariant "a failed fetch must never masquerade as an
 * empty success" (AGENTS.md): a caller that degrades to a heuristic on `null` cannot
 * tell a broken backend from a model that legitimately had nothing to say, and any
 * future caller that must ACT on the answer (a progress auditor, for instance) would
 * drive itself blind.
 *
 * Callers that genuinely do not care can collapse the result with `textOrNull()`.
 */

import type { CortexConfig } from "./schema.js";

export interface GenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

/** Why a call did not produce usable text. */
export type CortexFailure =
  /** Endpoint unreachable, DNS failure, connection refused. */
  | "unavailable"
  /** The hard timeout fired before the model answered. */
  | "timeout"
  /** Reached the server, but it answered with a non-2xx status. */
  | "http-error"
  /** The caller aborted through `signal`. */
  | "aborted"
  /** Answered, but the body could not be read or was empty. */
  | "empty-output"
  /** Answered, but the payload did not match what the caller required. */
  | "invalid-output"
  /** The prompt does not fit the model's budget and the policy was `error`. */
  | "input-too-large";

export type CortexResult<T> =
  | { ok: true; value: T; truncatedInput: boolean }
  | { ok: false; failure: CortexFailure; detail?: string };

/** What to do when the prompt exceeds the input budget. */
export type OverflowPolicy = "truncate" | "error";

export interface GenerateOptions {
  temperature?: number;
  maxTokens?: number;
  /** Abort from the caller; combined with the client's own hard timeout. */
  signal?: AbortSignal;
  /** Default `truncate`: correct for callers that degrade gracefully. */
  onOverflow?: OverflowPolicy;
  /** Ask Ollama for JSON natively instead of hoping the model complies. */
  json?: boolean;
}

/**
 * Conservative input budget for a sub-1B model, in characters (~4 chars/token).
 * Cortex prompts are small by design; this guards against a caller pasting a
 * whole file into a 0.5B model, where the result is silent nonsense.
 */
const DEFAULT_INPUT_BUDGET_CHARS = 8_000;

/** Collapse a result to the old `string | null` shape, for callers that do not care why. */
export function textOrNull(result: CortexResult<string>): string | null {
  return result.ok ? result.value : null;
}

export class CortexClient {
  private endpoint: string;
  private model: string;
  private timeout: number;
  private inputBudgetChars: number;

  constructor(
    config: CortexConfig,
    clusterEndpoint?: string,
    inputBudgetChars: number = DEFAULT_INPUT_BUDGET_CHARS,
  ) {
    this.endpoint = config.endpoint || clusterEndpoint || "http://localhost:11434";
    this.model = config.model;
    this.timeout = config.timeout;
    this.inputBudgetChars = inputBudgetChars;
  }

  /** Update endpoint (e.g., when cluster node changes) */
  setEndpoint(url: string): void {
    this.endpoint = url;
  }

  /** Update model */
  setModel(model: string): void {
    this.model = model;
  }

  /** Current input budget in characters. */
  get budgetChars(): number {
    return this.inputBudgetChars;
  }

  /**
   * Send a prompt to the local model.
   * Never throws: every failure mode comes back as a typed `failure`.
   */
  async generate(prompt: string, options?: GenerateOptions): Promise<CortexResult<string>> {
    const policy = options?.onOverflow ?? "truncate";
    let body = prompt;
    let truncatedInput = false;

    if (prompt.length > this.inputBudgetChars) {
      if (policy === "error") {
        return {
          ok: false,
          failure: "input-too-large",
          detail: `prompt de ${prompt.length} chars sobre un presupuesto de ${this.inputBudgetChars}`,
        };
      }
      body = prompt.slice(0, this.inputBudgetChars);
      truncatedInput = true;
    }

    if (options?.signal?.aborted) {
      return { ok: false, failure: "aborted" };
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeout);

    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: body,
          stream: false,
          ...(options?.json ? { format: "json" } : {}),
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 256,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        return { ok: false, failure: "http-error", detail: `HTTP ${res.status}` };
      }

      let data: GenerateResponse;
      try {
        data = (await res.json()) as GenerateResponse;
      } catch {
        return { ok: false, failure: "empty-output", detail: "respuesta no es JSON" };
      }

      const text = data.response?.trim();
      if (!text) {
        return { ok: false, failure: "empty-output" };
      }

      return { ok: true, value: text, truncatedInput };
    } catch (error) {
      if (timedOut) return { ok: false, failure: "timeout" };
      if (options?.signal?.aborted) return { ok: false, failure: "aborted" };
      return {
        ok: false,
        failure: "unavailable",
        detail: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  }

  /**
   * Generate and parse JSON. Asks Ollama for `format: "json"` so compliance does not
   * depend on the model following instructions, and still tolerates a model that
   * wraps the object in prose.
   *
   * `validate` lets the caller reject a well-formed object with the wrong shape;
   * that comes back as `invalid-output`, distinct from a transport failure.
   */
  async generateJSON<T>(
    prompt: string,
    options?: GenerateOptions & { validate?: (value: unknown) => value is T },
  ): Promise<CortexResult<T>> {
    const raw = await this.generate(prompt, {
      ...options,
      temperature: options?.temperature ?? 0.0,
      json: options?.json ?? true,
    });

    if (!raw.ok) return raw;

    const parsed = extractJSON(raw.value);
    if (parsed === undefined) {
      return { ok: false, failure: "invalid-output", detail: "no se pudo parsear JSON" };
    }

    if (options?.validate && !options.validate(parsed)) {
      return { ok: false, failure: "invalid-output", detail: "el JSON no tiene la forma esperada" };
    }

    return { ok: true, value: parsed as T, truncatedInput: raw.truncatedInput };
  }

  /**
   * Whether the configured model is present on the endpoint.
   * A transport failure answers `false` here on purpose: the caller only needs
   * "can I use it right now", and `generate` reports the real reason if used anyway.
   */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.endpoint}/api/tags`, { signal: controller.signal });
      if (!res.ok) return false;

      const data = (await res.json()) as { models?: Array<{ name: string }> };
      const models = data.models?.map((m) => m.name) || [];
      return models.some((m) => m.startsWith(this.model));
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Direct parse first, then the first balanced `{...}` block inside prose. */
function extractJSON(raw: string): unknown | undefined {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}
