/**
 * Goal runtime — persistence, ordering and isolation.
 *
 * No model, no agent, no daemon: every dependency is injected.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GoalStore } from "../store.js";
import { tickAll, tickGoal, startGoalLoop, type GoalRuntimeDeps } from "../runtime.js";
import type { TranscriptFacts, AuditOutcome } from "../tick.js";
import type { SessionGoal } from "../schema.js";

let dir: string;
let store: GoalStore;

function goal(overrides: Partial<SessionGoal> = {}): SessionGoal {
  return {
    id: "g1",
    sessionId: "s1",
    objective: "deja los tests en verde",
    status: "active",
    tokensUsed: 0,
    tokensBaseline: 0,
    tokensCommitted: 0,
    turnsUsed: 0,
    blockedStreak: 0,
    auditFailStreak: 0,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function facts(overrides: Partial<TranscriptFacts> = {}): TranscriptFacts {
  return {
    hasAssistantTurn: true,
    quiescent: true,
    lastIsCompactionSummary: false,
    lastTurnErrored: false,
    lastTurnAborted: false,
    ...overrides,
  };
}

function deps(overrides: Partial<GoalRuntimeDeps> = {}): GoalRuntimeDeps & { dispatched: string[] } {
  const dispatched: string[] = [];
  return {
    store,
    readFacts: async () => facts(),
    audit: async (): Promise<AuditOutcome> => ({ ok: true, result: { verdict: "continue", note: "" } }),
    dispatch: async (g) => {
      dispatched.push(g.sessionId);
    },
    dispatched,
    ...overrides,
  };
}

beforeEach(() => {
  dir = join(tmpdir(), `wabisabi-goals-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  store = new GoalStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("GoalStore", () => {
  test("guarda y recupera un objetivo", () => {
    store.save(goal());
    expect(store.get("s1")?.objective).toBe("deja los tests en verde");
  });

  test("una sesion sin objetivo devuelve null", () => {
    expect(store.get("no-existe")).toBeNull();
  });

  test("un fichero corrupto devuelve null en vez de explotar", () => {
    writeFileSync(join(dir, "s1.json"), "{ roto", "utf-8");
    expect(store.get("s1")).toBeNull();
  });

  test("un payload que no cumple el esquema se descarta", () => {
    writeFileSync(join(dir, "s1.json"), JSON.stringify({ id: "g1", status: "inventado" }), "utf-8");
    expect(store.get("s1")).toBeNull();
  });

  test("rechaza ids que intentan salirse del directorio", () => {
    expect(store.save(goal({ sessionId: "../fuera" }))).toBe(false);
    expect(store.get("../fuera")).toBeNull();
    expect(existsSync(join(dir, "..", "fuera.json"))).toBe(false);
  });

  test("listActive filtra por estado", () => {
    store.save(goal({ sessionId: "a", status: "active" }));
    store.save(goal({ sessionId: "b", status: "complete" }));
    store.save(goal({ sessionId: "c", status: "paused" }));

    expect(store.listActive().map((g) => g.sessionId)).toEqual(["a"]);
  });

  test("un fichero ilegible no impide listar los demas", () => {
    store.save(goal({ sessionId: "buena" }));
    writeFileSync(join(dir, "rota.json"), "basura", "utf-8");
    expect(store.list().map((g) => g.sessionId)).toEqual(["buena"]);
  });

  test("saveIfCurrent rechaza escribir sobre un objetivo distinto", () => {
    store.save(goal({ id: "nuevo" }));
    expect(store.saveIfCurrent(goal({ id: "viejo", turnsUsed: 9 }))).toBe(false);
    expect(store.get("s1")?.id).toBe("nuevo");
  });

  test("clear borra el objetivo", () => {
    store.save(goal());
    store.clear("s1");
    expect(store.get("s1")).toBeNull();
  });
});

describe("tickGoal — orden de persistencia", () => {
  test("persiste ANTES de despachar la continuacion", async () => {
    store.save(goal());
    const order: string[] = [];

    const d = deps({
      dispatch: async () => {
        // Al despachar, el turno ya tiene que estar contado en disco.
        order.push(`dispatch:turnsUsed=${store.get("s1")?.turnsUsed}`);
      },
    });

    await tickGoal(d, goal());
    expect(order).toEqual(["dispatch:turnsUsed=1"]);
  });

  test("si la meta cambio durante el tick, no se despacha nada", async () => {
    store.save(goal({ id: "meta-nueva" }));
    const d = deps();

    const out = await tickGoal(d, goal({ id: "meta-vieja" }));

    expect(out.persisted).toBe(false);
    expect(d.dispatched).toEqual([]);
    expect(store.get("s1")?.id).toBe("meta-nueva");
  });

  test("al esperar no se persiste ni se despacha", async () => {
    store.save(goal());
    const d = deps({ readFacts: async () => facts({ quiescent: false }) });

    const out = await tickGoal(d, goal());

    expect(out.action).toBe("wait");
    expect(d.dispatched).toEqual([]);
    expect(store.get("s1")?.turnsUsed).toBe(0);
  });
});

describe("tickGoal — el auditor solo se llama cuando hace falta", () => {
  test("no se audita si una parada dura ya decide", async () => {
    store.save(goal({ turnsUsed: 20 }));
    let audited = false;

    const d = deps({
      audit: async () => {
        audited = true;
        return { ok: true, result: { verdict: "continue", note: "" } };
      },
    });

    await tickGoal(d, goal({ turnsUsed: 20 }));
    expect(audited).toBe(false);
  });

  test("no se audita tras una compactacion", async () => {
    store.save(goal());
    let audited = false;

    const d = deps({
      readFacts: async () => facts({ lastIsCompactionSummary: true }),
      audit: async () => {
        audited = true;
        return { ok: true, result: { verdict: "continue", note: "" } };
      },
    });

    const out = await tickGoal(d, goal());

    expect(audited).toBe(false);
    expect(out.action).toBe("continue");
  });

  test("se audita en el caso normal y el veredicto manda", async () => {
    store.save(goal());
    const d = deps({
      audit: async () => ({ ok: true, result: { verdict: "complete", note: "listo" } }),
    });

    const out = await tickGoal(d, goal());

    expect(out.action).toBe("settle");
    expect(d.dispatched).toEqual([]);
    expect(store.get("s1")?.status).toBe("complete");
  });
});

describe("tickGoal — contabilidad", () => {
  test("el uso del ultimo turno entra antes de comprobar el presupuesto", async () => {
    const g = goal({ tokenBudget: 500 });
    store.save(g);

    const d = deps({
      readFacts: async () => facts({ latestUsage: { input: 400, output: 200 } }),
    });

    const out = await tickGoal(d, g);

    expect(out.action).toBe("settle");
    expect(store.get("s1")?.status).toBe("budgetLimited");
    expect(d.dispatched).toEqual([]);
  });
});

describe("tickAll — una sesion rota no arrastra a las demas", () => {
  test("un objetivo que lanza se salta y el resto sigue", async () => {
    store.save(goal({ sessionId: "rota" }));
    store.save(goal({ sessionId: "buena" }));

    const d = deps({
      readFacts: async (g) => {
        if (g.sessionId === "rota") throw new Error("boom");
        return facts();
      },
    });

    const results = await tickAll(d);

    expect(results).toHaveLength(2);
    expect(d.dispatched).toEqual(["buena"]);
    expect(results.find((r) => r.sessionId === "rota")?.reason).toBe("tick fallido");
  });

  test("sin objetivos activos no hace nada", async () => {
    store.save(goal({ status: "complete" }));
    const d = deps();

    expect(await tickAll(d)).toEqual([]);
    expect(d.dispatched).toEqual([]);
  });
});

describe("startGoalLoop", () => {
  test("runOnce ejecuta un ciclo y stop lo detiene", async () => {
    store.save(goal());
    const d = deps();
    const loop = startGoalLoop(d, 60_000);

    try {
      const results = await loop.runOnce();
      expect(results).toHaveLength(1);
      expect(d.dispatched).toEqual(["s1"]);
    } finally {
      loop.stop();
    }
  });

  test("los ciclos no se solapan: un tick lento no apila continuaciones", async () => {
    store.save(goal());
    let enCurso = 0;
    let solapes = 0;

    const d = deps({
      readFacts: async () => {
        enCurso++;
        if (enCurso > 1) solapes++;
        await new Promise((r) => setTimeout(r, 30));
        enCurso--;
        return facts();
      },
    });

    const loop = startGoalLoop(d, 60_000);
    try {
      const [a, b] = await Promise.all([loop.runOnce(), loop.runOnce()]);
      expect(solapes).toBe(0);
      // El segundo ciclo se descarta en vez de correr en paralelo.
      expect([a.length, b.length].sort()).toEqual([0, 1]);
    } finally {
      loop.stop();
    }
  });
});
