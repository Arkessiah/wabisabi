/**
 * Planificador de loops
 *
 * Dispara los loops habilitados creando **una sesión con objetivo**, y ahí acaba
 * su trabajo: el resto lo hace el bucle de objetivo que ya existe. Eso importa —
 * una tarea programada hereda así la política read-only, el aislamiento en
 * worktree, el auditor independiente y los topes de turnos y presupuesto.
 * Un segundo camino de ejecución sería un segundo sitio donde olvidarse de todo eso.
 *
 * El estado de ejecución **nunca se escribe al markdown**: el fichero es la
 * definición, versionable y con el mismo contenido en todas tus máquinas.
 */

import { randomBytes } from "crypto";
import { nextRunFor } from "./cron.js";
import { discoverLoops, enabledLoops, type Loop } from "./loops.js";
import type { GoalStore } from "../goal/store.js";
import type { SessionInfo } from "../session/types.js";

/** Estado de ejecución, en memoria del daemon. */
export interface LoopState {
  /** Identidad = ruta del fichero: renombrar no duplica la tarea. */
  path: string;
  lastRunAt?: number;
  nextRunAt?: number;
  lastError?: string;
  runs: number;
}

export interface SchedulerDeps {
  projectRoot: string | null;
  store: GoalStore;
  /** Crea la sesión que ejecutará la tarea. */
  createSession: (loop: Loop) => Promise<SessionInfo>;
  /** Fija el objetivo sobre esa sesión. */
  createGoal: (session: SessionInfo, loop: Loop) => { ok: boolean; error?: string };
  now?: () => Date;
  log?: (message: string) => void;
}

export interface DueResult {
  loop: Loop;
  state: LoopState;
}

/**
 * Qué toca ejecutar ahora.
 *
 * Un loop cuya hora ya pasó mientras el daemon estaba parado **se ejecuta una
 * vez**, no una por cada disparo perdido: despertar el portátil tras el fin de
 * semana no puede lanzar cuarenta tareas de golpe.
 */
export function dueLoops(
  loops: Loop[],
  states: Map<string, LoopState>,
  now: Date,
): DueResult[] {
  const due: DueResult[] = [];

  for (const loop of loops) {
    const state = states.get(loop.path) ?? { path: loop.path, runs: 0 };

    // Primera vez que lo vemos: se programa, no se dispara. Añadir un loop no
    // debe ejecutarlo en ese instante.
    if (state.nextRunAt === undefined) {
      const next = nextRunFor(loop.schedule, now);
      state.nextRunAt = next?.getTime();
      states.set(loop.path, state);
      continue;
    }

    if (state.nextRunAt <= now.getTime()) {
      due.push({ loop, state });
    }
  }

  return due;
}

/** Reprograma tras ejecutar (o intentar). */
export function reschedule(state: LoopState, loop: Loop, now: Date): void {
  const next = nextRunFor(loop.schedule, now);
  state.nextRunAt = next?.getTime();
  state.lastRunAt = now.getTime();
}

export interface RunOutcome {
  name: string;
  ok: boolean;
  reason?: string;
  sessionId?: string;
}

export function createScheduler(deps: SchedulerDeps) {
  const states = new Map<string, LoopState>();
  const now = () => (deps.now ?? (() => new Date()))();
  const log = deps.log ?? (() => {});
  let announcedProblems = new Set<string>();

  async function runOnce(): Promise<RunOutcome[]> {
    const discovered = discoverLoops(deps.projectRoot);

    // Los problemas se avisan una vez por fichero, no en cada ciclo: un loop roto
    // no puede convertir el log del daemon en ruido cada minuto.
    for (const p of discovered.problems) {
      if (!announcedProblems.has(p.path)) {
        announcedProblems.add(p.path);
        log(`loop ignorado (${p.path}): ${p.reason}`);
      }
    }
    announcedProblems = new Set(
      [...announcedProblems].filter((path) => discovered.problems.some((p) => p.path === path)),
    );

    const enabled = enabledLoops(discovered);

    // Un loop que desaparece o se deshabilita deja de estar programado.
    const vivos = new Set(enabled.map((l) => l.path));
    for (const path of [...states.keys()]) if (!vivos.has(path)) states.delete(path);

    const results: RunOutcome[] = [];

    for (const { loop, state } of dueLoops(enabled, states, now())) {
      try {
        const session = await deps.createSession(loop);
        const goal = deps.createGoal(session, loop);

        if (!goal.ok) {
          state.lastError = goal.error;
          results.push({ name: loop.name, ok: false, reason: goal.error });
          log(`loop "${loop.name}": no se pudo fijar el objetivo — ${goal.error}`);
        } else {
          state.runs++;
          delete state.lastError;
          results.push({ name: loop.name, ok: true, sessionId: session.id });
          log(`loop "${loop.name}" lanzado en la sesion ${session.id}`);
        }
      } catch (error) {
        // Un loop que revienta no puede tumbar al resto ni al daemon.
        state.lastError = error instanceof Error ? error.message : String(error);
        results.push({ name: loop.name, ok: false, reason: state.lastError });
        log(`loop "${loop.name}" fallo: ${state.lastError}`);
      } finally {
        reschedule(state, loop, now());
        states.set(loop.path, state);
      }
    }

    return results;
  }

  return {
    runOnce,
    /** Estado actual en memoria. Aun no hay comando de usuario que lo muestre. */
    status: (): LoopState[] => [...states.values()],
    /** Id de sesión para una ejecución de loop. */
    newSessionId: (loop: Loop): string =>
      `loop-${loop.name}-${randomBytes(4).toString("hex")}`,
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
