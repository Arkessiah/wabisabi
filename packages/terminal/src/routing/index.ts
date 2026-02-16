/**
 * TheOracle - Intelligent Model Router
 *
 * Routes requests to the best available model based on task complexity,
 * model capabilities, and user preferences. Integrates with Substratum
 * backend when available, falls back to local heuristics.
 */

import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────

export const ModelCapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["ollama", "substratum", "openai", "anthropic", "custom"]),
  contextWindow: z.number().default(8192),
  supportsFunctions: z.boolean().default(false),
  supportsStreaming: z.boolean().default(true),
  supportsVision: z.boolean().default(false),
  costTier: z.enum(["free", "low", "medium", "high"]).default("free"),
  speedTier: z.enum(["fast", "medium", "slow"]).default("medium"),
  qualityTier: z.enum(["basic", "good", "excellent"]).default("good"),
  specialties: z.array(z.string()).default([]),
});

export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export type TaskType =
  | "code-generation"
  | "code-review"
  | "debugging"
  | "explanation"
  | "planning"
  | "search"
  | "refactoring"
  | "testing"
  | "documentation"
  | "general";

export interface RoutingDecision {
  model: string;
  reason: string;
  confidence: number;
  alternatives: string[];
}

// ── Known Model Profiles ─────────────────────────────────────

const KNOWN_MODELS: Record<string, Partial<ModelCapability>> = {
  "llama3.2": {
    contextWindow: 8192, supportsFunctions: true,
    costTier: "free", speedTier: "fast", qualityTier: "good",
    specialties: ["general", "code-generation"],
  },
  "codellama": {
    contextWindow: 16384, supportsFunctions: false,
    costTier: "free", speedTier: "fast", qualityTier: "good",
    specialties: ["code-generation", "debugging", "refactoring"],
  },
  "mistral": {
    contextWindow: 32768, supportsFunctions: true,
    costTier: "free", speedTier: "fast", qualityTier: "good",
    specialties: ["general", "explanation"],
  },
  "mixtral": {
    contextWindow: 32768, supportsFunctions: true,
    costTier: "free", speedTier: "medium", qualityTier: "excellent",
    specialties: ["code-generation", "planning", "code-review"],
  },
  "deepseek-coder": {
    contextWindow: 16384, supportsFunctions: true,
    costTier: "free", speedTier: "medium", qualityTier: "excellent",
    specialties: ["code-generation", "debugging", "testing"],
  },
  "qwen2.5-coder": {
    contextWindow: 32768, supportsFunctions: true,
    costTier: "free", speedTier: "medium", qualityTier: "excellent",
    specialties: ["code-generation", "refactoring", "debugging"],
  },
  "gpt-4o": {
    contextWindow: 128000, supportsFunctions: true, supportsVision: true,
    costTier: "high", speedTier: "medium", qualityTier: "excellent",
    specialties: ["code-generation", "planning", "code-review", "explanation"],
  },
  "gpt-4o-mini": {
    contextWindow: 128000, supportsFunctions: true, supportsVision: true,
    costTier: "low", speedTier: "fast", qualityTier: "good",
    specialties: ["general", "explanation"],
  },
  "claude-3.5-sonnet": {
    contextWindow: 200000, supportsFunctions: true,
    costTier: "medium", speedTier: "medium", qualityTier: "excellent",
    specialties: ["code-generation", "planning", "code-review", "debugging"],
  },
};

// ── Task Classifier ──────────────────────────────────────────

function classifyTask(prompt: string): TaskType {
  const lower = prompt.toLowerCase();

  if (/\b(fix|bug|error|crash|issue|broken|fail)\b/.test(lower)) return "debugging";
  if (/\b(write|create|implement|build|add|generate)\b/.test(lower)) return "code-generation";
  if (/\b(review|check|audit|analyze|inspect)\b/.test(lower)) return "code-review";
  if (/\b(explain|what|how|why|describe|understand)\b/.test(lower)) return "explanation";
  if (/\b(plan|design|architect|strategy|roadmap)\b/.test(lower)) return "planning";
  if (/\b(find|search|locate|where|grep)\b/.test(lower)) return "search";
  if (/\b(refactor|clean|improve|optimize|simplify)\b/.test(lower)) return "refactoring";
  if (/\b(test|spec|coverage|assert|expect)\b/.test(lower)) return "testing";
  if (/\b(doc|readme|comment|document|jsdoc)\b/.test(lower)) return "documentation";

  return "general";
}

// ── Router ───────────────────────────────────────────────────

export class ModelRouter {
  private models: Map<string, ModelCapability> = new Map();
  private substratumUrl: string | null = null;
  private routingHistory: Array<{ task: TaskType; model: string; timestamp: number }> = [];

  /**
   * Register available models (from provider detection).
   */
  registerModels(modelIds: string[], provider: "ollama" | "substratum" | "custom"): void {
    for (const id of modelIds) {
      const known = KNOWN_MODELS[id] || KNOWN_MODELS[id.split(":")[0]] || {};
      this.models.set(id, ModelCapabilitySchema.parse({
        id,
        name: id,
        provider,
        ...known,
      }));
    }
  }

  /**
   * Set Substratum URL for remote routing queries.
   */
  setSubstratum(url: string): void {
    this.substratumUrl = url;
  }

  /**
   * Route a prompt to the best available model.
   */
  async route(
    prompt: string,
    currentModel: string,
    preferences?: { preferSpeed?: boolean; preferQuality?: boolean; preferFree?: boolean },
  ): Promise<RoutingDecision> {
    const taskType = classifyTask(prompt);

    // Try Substratum routing first (if available)
    if (this.substratumUrl) {
      try {
        const remote = await this.routeViaSubstratum(prompt, taskType);
        if (remote) return remote;
      } catch {
        // Fall through to local routing
      }
    }

    return this.routeLocal(taskType, currentModel, preferences);
  }

  /**
   * Local heuristic routing.
   */
  private routeLocal(
    taskType: TaskType,
    currentModel: string,
    preferences?: { preferSpeed?: boolean; preferQuality?: boolean; preferFree?: boolean },
  ): RoutingDecision {
    if (this.models.size === 0) {
      return {
        model: currentModel,
        reason: "No models registered, using current",
        confidence: 0.5,
        alternatives: [],
      };
    }

    // Score each model for this task
    const scored = [...this.models.values()].map((model) => {
      let score = 0;

      // Specialty match
      if (model.specialties.includes(taskType)) score += 30;
      if (model.specialties.includes("general")) score += 5;

      // Quality preference
      if (preferences?.preferQuality) {
        score += model.qualityTier === "excellent" ? 20 : model.qualityTier === "good" ? 10 : 0;
      }

      // Speed preference
      if (preferences?.preferSpeed) {
        score += model.speedTier === "fast" ? 20 : model.speedTier === "medium" ? 10 : 0;
      }

      // Cost preference
      if (preferences?.preferFree) {
        score += model.costTier === "free" ? 20 : model.costTier === "low" ? 10 : 0;
      }

      // Function calling bonus for code tasks
      if (model.supportsFunctions && ["code-generation", "debugging", "refactoring"].includes(taskType)) {
        score += 15;
      }

      // Context window bonus for complex tasks
      if (model.contextWindow >= 32768 && ["planning", "code-review"].includes(taskType)) {
        score += 10;
      }

      // Prefer current model (stability bonus)
      if (model.id === currentModel) score += 5;

      return { model, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    const alternatives = scored.slice(1, 4).map((s) => s.model.id);

    // Track routing decision
    this.routingHistory.push({ task: taskType, model: best.model.id, timestamp: Date.now() });
    if (this.routingHistory.length > 100) this.routingHistory.shift();

    return {
      model: best.model.id,
      reason: `Best for ${taskType} (score: ${best.score})`,
      confidence: Math.min(best.score / 60, 1),
      alternatives,
    };
  }

  /**
   * Route via Substratum backend (TheOracle endpoint).
   */
  private async routeViaSubstratum(
    prompt: string,
    taskType: TaskType,
  ): Promise<RoutingDecision | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${this.substratumUrl}/v1/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, taskType }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;

      const data = await res.json() as any;
      return {
        model: data.model || data.recommended_model,
        reason: data.reason || "Routed by Substratum",
        confidence: data.confidence || 0.8,
        alternatives: data.alternatives || [],
      };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }

  /**
   * Get registered models.
   */
  getModels(): ModelCapability[] {
    return [...this.models.values()];
  }

  /**
   * Get routing statistics.
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const entry of this.routingHistory) {
      stats[entry.model] = (stats[entry.model] || 0) + 1;
    }
    return stats;
  }
}

// Singleton
export const modelRouter = new ModelRouter();
