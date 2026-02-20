/**
 * Cortex ML Client
 *
 * Lightweight HTTP client for Ollama's /api/generate endpoint.
 * Used exclusively by CortexEngine for local inference.
 * No streaming, no auth, hard timeout, zero retries.
 */

import type { CortexConfig } from "./schema.js";

export interface GenerateResponse {
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

export class CortexClient {
  private endpoint: string;
  private model: string;
  private timeout: number;

  constructor(config: CortexConfig, clusterEndpoint?: string) {
    this.endpoint = config.endpoint || clusterEndpoint || "http://localhost:11434";
    this.model = config.model;
    this.timeout = config.timeout;
  }

  /** Update endpoint (e.g., when cluster node changes) */
  setEndpoint(url: string): void {
    this.endpoint = url;
  }

  /** Update model */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Send a prompt to the local model and get a response.
   * Returns null on any error (timeout, network, parse).
   */
  async generate(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.endpoint}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.1,
            num_predict: options?.maxTokens ?? 256,
          },
        }),
        signal: controller.signal,
      });

      if (!res.ok) return null;

      const data = (await res.json()) as GenerateResponse;
      return data.response?.trim() || null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Generate and parse JSON response.
   * Attempts to extract JSON from the response even if surrounded by text.
   */
  async generateJSON<T>(prompt: string): Promise<T | null> {
    const raw = await this.generate(prompt, { temperature: 0.0 });
    if (!raw) return null;

    try {
      // Try direct parse first
      return JSON.parse(raw) as T;
    } catch {
      // Try to extract JSON from response
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]) as T;
        } catch {
          return null;
        }
      }
      return null;
    }
  }

  /** Check if the model is available */
  async isAvailable(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.endpoint}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

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
