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
import type { SessionInfo } from "../session/types.js";

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
  onSkillProposed?: (name: string, path: string, modelLabel?: string) => void;
  /**
   * Which model distills a completed goal into a skill draft.
   *
   * - `session` (default): the model that did the work. If the user pays for
   *   good infrastructure — Substratum, their own API key — that is the model
   *   worth writing with, and they already chose it.
   * - `small`: the local helper. Nearly free, noticeably worse prose.
   *
   * A failed main-model call falls back to the small one rather than losing the
   * harvest; whichever ran is stamped into the draft.
   */
  harvestModel?: "session" | "small";
  /** Turn harvesting off entirely. Default on. */
  harvestSkills?: boolean;
  /** What an unattended turn may do. Default `read-only`. */
  autonomousTools?: "read-only" | "inherit";
  /** Tool-call iterations inside one unattended turn. */
  maxTurnIterations?: number;
}

/** Distiller plus the label that goes into the draft, so trust is legible. */
interface Distiller {
  /** Raw model answer; `harvest.ts` owns the parsing. */
  run: (prompt: string) => Promise<string | null>;
  label: string;
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

  const smallDistiller = (): Distiller => ({
    label: `cortex/${CortexConfigSchema.parse(configManager.getMerged().cortex ?? {}).model}`,
    run: async (prompt) => {
      const res = await cortex.generate(prompt, { maxTokens: 1024, json: false });
      return res.ok ? res.value : null;
    },
  });

  /** The session's own model, through the normal provider chain. */
  const sessionDistiller = async (session: SessionInfo): Promise<Distiller | null> => {
    try {
      const { ApiClient } = await import("../clients/api-client.js");
      const merged = configManager.getMerged();
      const client = new ApiClient({ ...merged, model: session.model });

      return {
        label: session.model,
        run: async (prompt) => client.chat(prompt),
      };
    } catch {
      return null;
    }
  };

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

      // Un objetivo que escribe deja evidencia dura; la prosa del turno no lo es.
      // Sin esto, el auditor decia "continue" turno tras turno sobre un worktree
      // en el que no se habia escrito ni un byte (medido: 12 veces seguidas).
      let changes: { files: string[]; diff: string } | undefined;
      if ((options.autonomousTools ?? "read-only") === "inherit" && session) {
        try {
          const { worktreeNames, worktreeChanges } = await import("./worktree.js");
          const { dir } = worktreeNames(goal.sessionId);
          const { existsSync } = await import("fs");
          if (existsSync(dir)) {
            const ch = await worktreeChanges(dir);
            changes = { files: ch.files, diff: ch.diff };
          }
        } catch {
          // Sin evidencia se audita como antes: peor, pero no peligroso.
        }
      }

      return runAudit(cortex, goal.objective, last.content, changes ? { changes } : {});
    },

    /**
     * A completed goal is a path someone walked to the end, so it is offered as
     * a skill. Best-effort and non-blocking by design: harvesting is a bonus and
     * must never affect the goal that just succeeded.
     */
    onSettled: (goal: SessionGoal, reason: string): void => {
      void reason;
      if (goal.status !== "complete") return;
      if (options.harvestSkills === false) return;
      void (async () => {
        try {
          const session = await storage.load(goal.sessionId);
          if (!session) return;

          const preferSmall = options.harvestModel === "small";
          const primary = preferSmall ? smallDistiller() : await sessionDistiller(session);
          const chosen = primary ?? smallDistiller();

          let usedLabel = chosen.label;
          const result = await harvestSkill(
            {
              skillsDir: options.skillsDir ?? join(session.projectRoot, ".agents", "skills"),
              distill: async (prompt) => {
                const out = await chosen.run(prompt);
                if (out !== null || preferSmall) return out;
                // Losing the harvest because the main model hiccupped would be a
                // waste; the small one is worse but it is not nothing, and the
                // draft says which one wrote it.
                log(`destilacion con ${chosen.label} fallida; reintento con el modelo pequeno`);
                const fallback = smallDistiller();
                usedLabel = fallback.label;
                return fallback.run(prompt);
              },
              get modelLabel() {
                return usedLabel;
              },
              // Always the small model, and never the distiller: the point is
              // that whoever wrote it does not get to approve it.
              judge: async (prompt) => {
                const res = await cortex.generate(prompt, { maxTokens: 200, json: false });
                return res.ok ? res.value : null;
              },
              log,
            },
            { goal, session },
          );

          if (result.harvested && result.name && result.path) {
            options.onSkillProposed?.(result.name, result.path, result.modelLabel);
          }
        } catch (error) {
          log(`cosecha de skill fallida (no afecta al objetivo): ${String(error)}`);
        }
      })();
    },

    dispatch: async (goal: SessionGoal): Promise<void> => {
      const prompt = buildContinuationPrompt(goal);

      if (options.runTurn) {
        await options.runTurn(goal, prompt);
        return;
      }

      const session = await storage.load(goal.sessionId);
      if (!session) throw new Error(`la sesion ${goal.sessionId} no existe`);

      const [{ runHeadlessTurn }, { ApiClient }] = await Promise.all([
        import("./headless.js"),
        import("../clients/api-client.js"),
      ]);

      const merged = configManager.getMerged();
      const client = new ApiClient({ ...merged, model: session.model });

      const policy = options.autonomousTools ?? "read-only";

      // A goal that can write gets an isolated worktree, always. Writing into the
      // user's working tree would mix an unattended agent's edits with their own
      // uncommitted work, with no clean way to tell them apart or undo one.
      let workRoot = session.projectRoot;
      if (policy === "inherit") {
        const { ensureWorktree } = await import("./worktree.js");
        const wt = await ensureWorktree(session.projectRoot, goal.sessionId);
        if (!wt.ok) {
          // Refusing is the point: without isolation there is no review and no
          // undo, so the goal stops instead of writing somewhere unsafe.
          throw new Error(`no se puede aislar el trabajo del objetivo: ${wt.error}`);
        }
        workRoot = wt.path;
        if (wt.created) log(`worktree creado para ${goal.sessionId}: ${wt.path} (rama ${wt.branch})`);
      }

      // The interactive agent gets the whole project context; a headless turn
      // used to get one sentence, and it showed: the model chatted for turns
      // before touching a tool because nothing told it it had any.
      const { projectContext } = await import("../context/index.js");
      let projectPrompt = "";
      try {
        await projectContext.initialize(session.projectRoot);
        projectPrompt = projectContext.getSystemPrompt();
      } catch {
        // A goal must still advance without project context.
      }

      const systemPrompt = [
        "Eres un agente de codigo trabajando de forma AUTONOMA hacia un objetivo.",
        ...(workRoot !== session.projectRoot
          ? [`Trabajas en una COPIA AISLADA del repositorio: ${workRoot}. Usa siempre esa ruta.`]
          : []),
        "Nadie puede responderte: no hagas preguntas, no pidas confirmacion.",
        "TIENES herramientas. Usalas para comprobar los hechos en vez de suponerlos:",
        "leer un fichero antes de describirlo no es opcional.",
        "Si te falta una herramienta para avanzar, dilo en el parte y sigue con lo demas.",
        projectPrompt,
      ]
        .filter(Boolean)
        .join("\n\n");

      const result = await runHeadlessTurn(
        client,
        session,
        systemPrompt,
        prompt,
        {
          policy,
          projectRoot: workRoot,
          maxIterations: options.maxTurnIterations,
          log,
        },
      );

      if (result.stoppedBy === "error") {
        throw new Error(result.error ?? "el turno headless fallo");
      }

      // Persisted so the next tick can read the turn, audit it and price it.
      // Without this the loop would re-read an unchanged transcript and never
      // see its own work.
      const content =
        result.content ||
        (result.withheld.length > 0
          ? `Error: sin permisos para ${[...new Set(result.withheld)].join(", ")} en ejecucion autonoma.`
          : "Error: el turno autonomo termino sin respuesta.");

      session.messages.push({ role: "user", content: prompt, timestamp: Date.now() });
      session.messages.push({
        role: "assistant",
        content,
        timestamp: Date.now(),
        ...(result.usage ? { usage: result.usage } : {}),
      });
      session.updated = Date.now();
      await storage.save(session);

      log(
        `turno autonomo de ${goal.sessionId}: ${result.toolCalls} tools, ` +
          `${result.iterations} iteraciones, fin=${result.stoppedBy}`,
      );
    },
  };
}
