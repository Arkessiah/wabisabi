/**
 * Goal decision logic — the rules that make an autonomous loop safe.
 *
 * Pure functions, so every rule is tested directly: no model, no agent, no clock.
 */

import { describe, expect, test } from "bun:test";
import { decide, accountTokens, turnCost, resume, type TranscriptFacts, type AuditOutcome } from "../tick.js";
import {
  AUDIT_FAIL_LIMIT,
  BLOCKED_STREAK_LIMIT,
  MAX_AUTO_TURNS,
  type SessionGoal,
} from "../schema.js";

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

const says = (verdict: "continue" | "complete" | "blocked", note = ""): (() => AuditOutcome) =>
  () => ({ ok: true, result: { verdict, note } });
const cannotAudit = (reason = "unavailable"): (() => AuditOutcome) => () => ({ ok: false, reason });
const neverCalled = (): AuditOutcome => {
  throw new Error("no se debia auditar en este caso");
};

describe("no es el momento de actuar", () => {
  test("un objetivo no activo espera", () => {
    for (const status of ["paused", "blocked", "complete", "budgetLimited"] as const) {
      expect(decide(goal({ status }), facts(), neverCalled).action).toBe("wait");
    }
  });

  test("sin respuesta del asistente todavia, espera", () => {
    expect(decide(goal(), facts({ hasAssistantTurn: false }), neverCalled).action).toBe("wait");
  });

  test("con un turno en curso, espera (no pisa al agente)", () => {
    expect(decide(goal(), facts({ quiescent: false }), neverCalled).action).toBe("wait");
  });
});

describe("abort del usuario = pausa, nunca bloqueo", () => {
  test("un abort pausa el objetivo sin auditar", () => {
    const d = decide(goal(), facts({ lastTurnAborted: true }), neverCalled);

    expect(d.action).toBe("settle");
    if (d.action === "settle") {
      expect(d.status).toBe("paused");
      expect(d.goal.statusReason).toBe("aborted");
    }
  });

  test("el abort manda sobre el error: parar es parar", () => {
    const d = decide(goal(), facts({ lastTurnAborted: true, lastTurnErrored: true }), neverCalled);
    if (d.action === "settle") expect(d.status).toBe("paused");
  });
});

describe("paradas duras, antes de gastar en auditar", () => {
  test("un turno con error bloquea", () => {
    const d = decide(goal(), facts({ lastTurnErrored: true }), neverCalled);
    if (d.action === "settle") expect(d.status).toBe("blocked");
  });

  test("presupuesto agotado -> budgetLimited", () => {
    const d = decide(goal({ tokenBudget: 100, tokensUsed: 100 }), facts(), neverCalled);
    if (d.action === "settle") expect(d.status).toBe("budgetLimited");
  });

  test("sin presupuesto no hay limite de tokens", () => {
    const d = decide(goal({ tokensUsed: 10_000_000 }), facts(), says("continue"));
    expect(d.action).toBe("continue");
  });

  test("tope de continuaciones automaticas -> blocked", () => {
    const d = decide(goal({ turnsUsed: MAX_AUTO_TURNS }), facts(), neverCalled);
    if (d.action === "settle") {
      expect(d.status).toBe("blocked");
      expect(d.reason).toContain(String(MAX_AUTO_TURNS));
    }
  });
});

describe("una compactacion nunca se juzga", () => {
  test("tras un resumen se continua sin auditar", () => {
    const d = decide(goal(), facts({ lastIsCompactionSummary: true }), neverCalled);

    expect(d.action).toBe("continue");
    if (d.action === "continue") {
      expect(d.reason).toBe("post-compaction");
      expect(d.goal.turnsUsed).toBe(1);
    }
  });

  test("pero las paradas duras siguen mandando sobre la compactacion", () => {
    const d = decide(
      goal({ turnsUsed: MAX_AUTO_TURNS }),
      facts({ lastIsCompactionSummary: true }),
      neverCalled,
    );
    expect(d.action).toBe("settle");
  });
});

describe("el auditor es la unica autoridad de terminacion", () => {
  test("complete cierra el objetivo", () => {
    const d = decide(goal(), facts(), says("complete", "tests en verde"));
    if (d.action === "settle") {
      expect(d.status).toBe("complete");
      expect(d.goal.note).toBe("tests en verde");
    }
  });

  test("continue sigue y cuenta el turno", () => {
    const d = decide(goal({ turnsUsed: 3 }), facts(), says("continue", "voy por la mitad"));
    if (d.action === "continue") {
      expect(d.goal.turnsUsed).toBe(4);
      expect(d.goal.note).toBe("voy por la mitad");
    }
  });

  test("un continue resetea la racha de bloqueos", () => {
    const d = decide(goal({ blockedStreak: 2 }), facts(), says("continue"));
    if (d.action === "continue") expect(d.goal.blockedStreak).toBe(0);
  });
});

describe("un tropiezo puntual no mata el objetivo", () => {
  test(`hacen falta ${BLOCKED_STREAK_LIMIT} bloqueos seguidos`, () => {
    let g = goal();

    for (let i = 1; i < BLOCKED_STREAK_LIMIT; i++) {
      const d = decide(g, facts(), says("blocked", "no encuentro el fichero"));
      expect(d.action).toBe("continue");
      if (d.action === "continue") {
        expect(d.goal.blockedStreak).toBe(i);
        g = d.goal;
      }
    }

    const final = decide(g, facts(), says("blocked", "sigue sin aparecer"));
    expect(final.action).toBe("settle");
    if (final.action === "settle") expect(final.status).toBe("blocked");
  });
});

describe("un auditor muerto no puede conducir el bucle a ciegas", () => {
  test("tolera exactamente UNA continuacion sin auditar", () => {
    const first = decide(goal(), facts(), cannotAudit("unavailable"));
    expect(first.action).toBe("continue");
    if (first.action !== "continue") return;
    expect(first.goal.auditFailStreak).toBe(1);

    const second = decide(first.goal, facts(), cannotAudit("timeout"));
    expect(second.action).toBe("settle");
    if (second.action === "settle") {
      expect(second.status).toBe("blocked");
      expect(second.reason).toContain("auditoria no disponible");
    }
  });

  test(`el limite de fallos es ${AUDIT_FAIL_LIMIT}`, () => {
    expect(AUDIT_FAIL_LIMIT).toBe(2);
  });

  test("al asentar se resetea la racha, para que Resume tenga margen nuevo", () => {
    const d = decide(goal({ auditFailStreak: 1 }), facts(), cannotAudit());
    if (d.action === "settle") expect(d.goal.auditFailStreak).toBe(0);
  });

  test("una auditoria buena resetea la racha de fallos", () => {
    const d = decide(goal({ auditFailStreak: 1 }), facts(), says("continue"));
    if (d.action === "continue") expect(d.goal.auditFailStreak).toBe(0);
  });

  test("un auditor caido NO puede saltarse el tope de turnos", () => {
    const d = decide(goal({ turnsUsed: MAX_AUTO_TURNS }), facts(), cannotAudit());
    expect(d.action).toBe("settle");
  });
});

describe("contabilidad de tokens por snapshot", () => {
  test("el coste de un turno incluye la cache leida", () => {
    expect(turnCost({ input: 100, output: 50, cacheRead: 900 })).toBe(1050);
    expect(turnCost({ input: 100, output: 50 })).toBe(150);
  });

  test("se mide relativo al baseline previo al objetivo", () => {
    const r = accountTokens(goal({ tokensBaseline: 1000 }), { input: 1200, output: 300 });
    expect(r.tokensUsed).toBe(500);
  });

  test("es monotonico: un contexto que encoge no retrocede el presupuesto", () => {
    const r = accountTokens(goal({ tokensUsed: 900, tokensBaseline: 0 }), { input: 100, output: 50 });
    expect(r.tokensUsed).toBe(900);
  });

  test("una compactacion cierra el segmento y reinicia el baseline a 0", () => {
    const r = accountTokens(
      goal({ tokensBaseline: 200, tokensCommitted: 1000, tokensUsed: 1500 }),
      { input: 2000, output: 100 },
      { compactionClosedSegment: true },
    );

    expect(r.tokensCommitted).toBe(1000 + (2100 - 200));
    expect(r.tokensBaseline).toBe(0);
    expect(r.tokensUsed).toBeGreaterThanOrEqual(r.tokensCommitted);
  });

  test("sin datos de uso, la contabilidad no se inventa nada", () => {
    const g = goal({ tokensUsed: 42, tokensCommitted: 10, tokensBaseline: 5 });
    expect(accountTokens(g, undefined)).toEqual({
      tokensUsed: 42,
      tokensCommitted: 10,
      tokensBaseline: 5,
    });
  });

  test("el gasto acumulado dispara el limite en el siguiente tick", () => {
    const acct = accountTokens(goal({ tokenBudget: 400 }), { input: 300, output: 200 });
    const d = decide(goal({ tokenBudget: 400, tokensUsed: acct.tokensUsed }), facts(), neverCalled);

    expect(d.action).toBe("settle");
    if (d.action === "settle") expect(d.status).toBe("budgetLimited");
  });
});

describe("resume", () => {
  test("reactiva y da margen nuevo en las rachas", () => {
    const g = resume(goal({ status: "blocked", blockedStreak: 3, auditFailStreak: 1 }), false);

    expect(g.status).toBe("active");
    expect(g.statusReason).toBe("resumed");
    expect(g.blockedStreak).toBe(0);
  });

  test("reanudar sobre un abort limpia tambien la racha de auditoria", () => {
    const g = resume(goal({ status: "paused", auditFailStreak: 1 }), true);
    expect(g.auditFailStreak).toBe(0);
  });

  test("un objetivo reanudado vuelve a decidir con normalidad", () => {
    const g = resume(goal({ status: "paused" }), false);
    expect(decide(g, facts(), says("continue")).action).toBe("continue");
  });
});
