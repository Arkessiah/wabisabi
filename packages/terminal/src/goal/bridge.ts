/**
 * Session Goal — bridge to the real world
 *
 * Supplies the `readFacts`, `audit` and `dispatch` dependencies of the runtime
 * using the actual session store, cortex and agent.
 *
 * Kept separate from `runtime.ts` on purpose: the loop's rules stay testable
 * without any of this, and this file is where the heavy imports live so the
 * daemon only pays for them when the loop actually starts.
 */

import { join } from "path";
import { SessionStorage } from "../session/storage.js";
import { CortexClient } from "../cortex/client.js";
import { CortexConfigSchema } from "../cortex/schema.js";
import { configManager } from "../config/index.js";
import { readFactsFromSession } from "./facts.js";
import { audit as runAudit } from "./auditor.js";
import { harvestSkill } from "./harvest.js";
import type { TranscriptFacts } from "./tick.js";
import type { SessionGoal } from "./schema.js";

export interface BridgeOptions {
  log?: (message: string) => void;
  /** Injectable for tests; defaults to the real session directory. */
  storage?: SessionStorage;
  /** Injectable for tests; defaults to a client built from user config. */
  cortex?: CortexClient;
  /** Overrides how a continuation turn is executed. */
  runTurn?: (goal: SessionGoal, prompt: string) => Promise<void>;
  /** Where harvested skill proposals land. Defaults to the project's own. */
  skillsDir?: string;
  /** Told when a proposal was written, so the user finds out. */
  onSkillProposed?: (name: string, path: string) => void;
}

/** Built inline: the objective is untrusted user data, so it is XML-escaped. */
export function buildContinuationPrompt(goal: SessionGoal): string {
  const budget =
    goal.tokenBudget !== undefined
      ? `\nPresupuesto: ${goal.tokensUsed}/${goal.tokenBudget} tokens.`
      : "";

  return [
    "Continua trabajando hacia el objetivo. No lo reinterpretes ni lo reduzcas.",
    "",
    "<objetivo>",
    goal.objective.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
    "</objetivo>",
    budget,
    "",
    "Trabaja desde evidencia: comprueba antes de afirmar.",
    "Termina el turno con un parte factual de que esta hecho, que has verificado y que queda.",
    "Ese parte es la unica evidencia que ve el auditor de progreso.",
  ].join("\n");
}

/**
 * Facts, audit and dispatch wired to the real session store and model.
 *
 * `dispatch` has no default implementation on purpose: executing an agent turn
 * headless is a separate capability, and a bridge that silently did nothing
 * would let the loop count continuations that never happened. Until a `runTurn`
 * is supplied, dispatch throws and the tick is recorded as failed — visible in
 * the log, rather than a goal that quietly burns its turn budget.
 */
export function createAgentBridge(options: BridgeOptions = {}) {
  const storage = options.storage ?? new SessionStorage();
  const log = options.log ?? (() => {});

  const cortex =
    options.cortex ??
    (() => {
      const merged = configManager.getMerged();
      return new CortexClient(CortexConfigSchema.parse(merged.cortex ?? {}));
    })();

  return {
    readFacts: async (goal: SessionGoal): Promise<TranscriptFacts> => {
      const session = await storage.load(goal.sessionId);
      if (!session) {
        // A goal whose session vanished must not be treated as "nothing to do
        // yet" forever, but it is also not ours to settle: report no assistant
        // turn and let the user clear it.
        log(`objetivo de ${goal.sessionId}: la sesion no existe`);
        return {
          hasAssistantTurn: false,
          quiescent: true,
          lastIsCompactionSummary: false,
          lastTurnErrored: false,
          lastTurnAborted: false,
        };
      }
      return readFactsFromSession(session);
    },

    audit: async (goal: SessionGoal, facts: TranscriptFacts) => {
      const session = await storage.load(goal.sessionId);
      const last = session?.messages
        ?.filter((m) => m.role === "assistant")
        .slice(-1)[0];

      if (!last) return { ok: false as const, reason: "sin turno que auditar" };
      void facts;
      return runAudit(cortex, goal.objective, last.content);
    },

    /**
     * A completed goal is a path someone walked to the end, so it is offered as
     * a skill. Best-effort and non-blocking by design: harvesting is a bonus and
     * must never affect the goal that just succeeded.
     */
    onSettled: (goal: SessionGoal, reason: string): void => {
      void reason;
      if (goal.status !== "complete") return;
      void (async () => {
        try {
          const session = await storage.load(goal.sessionId);
          if (!session) return;

          const result = await harvestSkill(
            {
              skillsDir: options.skillsDir ?? join(session.projectRoot, ".agents", "skills"),
              distill: async (prompt) => {
                const res = await cortex.generateJSON<unknown>(prompt, { maxTokens: 1024 });
                return res.ok ? res.value : null;
              },
              log,
            },
            { goal, session },
          );

          if (result.harvested && result.name && result.path) {
            options.onSkillProposed?.(result.name, result.path);
          }
        } catch (error) {
          log(`cosecha de skill fallida (no afecta al objetivo): ${String(error)}`);
        }
      })();
    },

    dispatch: async (goal: SessionGoal): Promise<void> => {
      const prompt = buildContinuationPrompt(goal);
      if (!options.runTurn) {
        throw new Error(
          "no hay ejecutor de turnos configurado: el daemon no puede continuar el objetivo",
        );
      }
      await options.runTurn(goal, prompt);
    },
  };
}
