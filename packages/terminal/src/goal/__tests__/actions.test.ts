import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { GoalStore } from "../store.js";
import {
  baselineFrom,
  clearGoal,
  createGoal,
  describeGoal,
  pauseGoal,
  resumeGoalAction,
} from "../actions.js";
import { MAX_OBJECTIVE_CHARS } from "../schema.js";
import type { SessionInfo } from "../../session/types.js";

let dir: string;
let store: GoalStore;

function session(messages: SessionInfo["messages"] = []): SessionInfo {
  return {
    id: "s1",
    title: "t",
    projectRoot: "/tmp",
    model: "m",
    agent: "build",
    messages,
    created: 1,
    updated: 1,
  };
}

beforeEach(() => {
  dir = join(tmpdir(), `wabisabi-actions-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  store = new GoalStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("crear un objetivo", () => {
  test("queda activo y persistido", () => {
    const res = createGoal(store, { session: session(), objective: "deja los tests en verde" });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.goal.status).toBe("active");
    expect(store.get("s1")?.objective).toBe("deja los tests en verde");
  });

  test("un objetivo vacio se rechaza", () => {
    const res = createGoal(store, { session: session(), objective: "   " });
    expect(res.ok).toBe(false);
    expect(store.get("s1")).toBeNull();
  });

  test("un objetivo demasiado largo se RECHAZA en vez de recortarse", () => {
    // Recortarlo cambiaria en silencio lo que juzga el auditor.
    const res = createGoal(store, {
      session: session(),
      objective: "x".repeat(MAX_OBJECTIVE_CHARS + 1),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("supera");
  });

  test("un presupuesto no positivo se rechaza", () => {
    expect(createGoal(store, { session: session(), objective: "x", tokenBudget: 0 }).ok).toBe(false);
  });

  test("reemplazar un objetivo genera un id NUEVO", () => {
    const first = createGoal(store, { session: session(), objective: "primero" });
    const second = createGoal(store, { session: session(), objective: "segundo" });

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      // El id nuevo es lo que invalida escrituras de un tick que seguia con el viejo.
      expect(second.goal.id).not.toBe(first.goal.id);
      expect(second.note).toContain("anterior");
    }
  });
});

describe("baseline de tokens", () => {
  test("una sesion sin uso registrado empieza en cero", () => {
    expect(baselineFrom(session())).toBe(0);
  });

  test("toma el snapshot del ultimo turno con uso", () => {
    const s = session([
      { role: "assistant", content: "a", timestamp: 1, usage: { promptTokens: 10, completionTokens: 5 } },
      { role: "assistant", content: "b", timestamp: 2, usage: { promptTokens: 100, completionTokens: 20 } },
    ]);
    expect(baselineFrom(s)).toBe(120);
  });

  test("incluye la cache leida", () => {
    const s = session([
      {
        role: "assistant",
        content: "a",
        timestamp: 1,
        usage: { promptTokens: 100, completionTokens: 20, cacheReadTokens: 900 },
      },
    ]);
    expect(baselineFrom(s)).toBe(1020);
  });

  test("el objetivo nace con ese baseline: no factura la sesion previa", () => {
    const s = session([
      { role: "assistant", content: "a", timestamp: 1, usage: { promptTokens: 5000, completionTokens: 500 } },
    ]);
    const res = createGoal(store, { session: s, objective: "sigue" });

    if (res.ok) {
      expect(res.goal.tokensBaseline).toBe(5500);
      expect(res.goal.tokensUsed).toBe(0);
    }
  });
});

describe("pausar y reanudar", () => {
  test("pausar un objetivo activo funciona", () => {
    createGoal(store, { session: session(), objective: "x" });
    const res = pauseGoal(store, "s1");

    expect(res.ok).toBe(true);
    expect(store.get("s1")?.status).toBe("paused");
  });

  test("pausar dos veces avisa en vez de fingir", () => {
    createGoal(store, { session: session(), objective: "x" });
    pauseGoal(store, "s1");
    expect(pauseGoal(store, "s1").ok).toBe(false);
  });

  test("reanudar limpia las rachas para dar margen nuevo", () => {
    createGoal(store, { session: session(), objective: "x" });
    const goal = store.get("s1")!;
    store.save({ ...goal, status: "blocked", blockedStreak: 3, auditFailStreak: 1 });

    const res = resumeGoalAction(store, "s1");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.goal.status).toBe("active");
      expect(res.goal.blockedStreak).toBe(0);
    }
  });

  test("un objetivo CUMPLIDO no se reanuda", () => {
    createGoal(store, { session: session(), objective: "x" });
    const goal = store.get("s1")!;
    store.save({ ...goal, status: "complete" });

    const res = resumeGoalAction(store, "s1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("crea uno nuevo");
  });

  test("sin objetivo, las acciones avisan", () => {
    expect(pauseGoal(store, "fantasma").ok).toBe(false);
    expect(resumeGoalAction(store, "fantasma").ok).toBe(false);
    expect(clearGoal(store, "fantasma").ok).toBe(false);
  });
});

describe("borrar", () => {
  test("clear elimina el objetivo", () => {
    createGoal(store, { session: session(), objective: "x" });
    expect(clearGoal(store, "s1").ok).toBe(true);
    expect(store.get("s1")).toBeNull();
  });
});

describe("describeGoal", () => {
  test("resume estado, objetivo y turno", () => {
    createGoal(store, { session: session(), objective: "deja los tests en verde" });
    const out = describeGoal(store.get("s1")!);

    expect(out).toContain("[active]");
    expect(out).toContain("deja los tests en verde");
    expect(out).toContain("turno 0");
  });

  test("un objetivo multilinea se resume en una sola linea", () => {
    createGoal(store, { session: session(), objective: "primera linea\nsegunda linea" });
    expect(describeGoal(store.get("s1")!)).not.toContain("\n");
  });

  test("muestra el presupuesto cuando existe", () => {
    createGoal(store, { session: session(), objective: "x", tokenBudget: 5000 });
    expect(describeGoal(store.get("s1")!)).toContain("/5000 tokens");
  });
});
