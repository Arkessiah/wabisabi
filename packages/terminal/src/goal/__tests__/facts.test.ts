import { describe, expect, test } from "bun:test";
import { readFactsFromSession, toTurnUsage, isCompactionSummary } from "../facts.js";
import type { SessionInfo, SessionMessage } from "../../session/types.js";

function msg(role: SessionMessage["role"], content: string, usage?: SessionMessage["usage"]): SessionMessage {
  return { role, content, timestamp: 1, ...(usage ? { usage } : {}) };
}

function session(messages: SessionMessage[]): SessionInfo {
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

describe("quiescencia: no pisar un turno en curso", () => {
  test("una respuesta del asistente al final = quieto", () => {
    const f = readFactsFromSession(session([msg("user", "haz X"), msg("assistant", "hecho")]));
    expect(f.quiescent).toBe(true);
    expect(f.hasAssistantTurn).toBe(true);
  });

  test("un mensaje de usuario colgando = NO quieto", () => {
    const f = readFactsFromSession(session([msg("assistant", "hecho"), msg("user", "y ahora Y")]));
    expect(f.quiescent).toBe(false);
  });

  test("un mensaje de tool al final = NO quieto (esta a mitad de tool-call)", () => {
    const f = readFactsFromSession(session([msg("user", "x"), msg("tool", "resultado")]));
    expect(f.quiescent).toBe(false);
  });

  test("los mensajes de sistema no cuentan: son contexto inyectado", () => {
    const f = readFactsFromSession(
      session([msg("user", "x"), msg("assistant", "ok"), msg("system", "## Skill activa")]),
    );
    expect(f.quiescent).toBe(true);
  });

  test("una sesion vacia no tiene turno que auditar", () => {
    const f = readFactsFromSession(session([]));
    expect(f.hasAssistantTurn).toBe(false);
    expect(f.quiescent).toBe(true);
  });

  test("solo con mensajes de usuario, no hay turno del asistente", () => {
    const f = readFactsFromSession(session([msg("user", "x")]));
    expect(f.hasAssistantTurn).toBe(false);
  });
});

describe("compactacion", () => {
  test("reconoce el resumen que escribe cortex", () => {
    expect(isCompactionSummary(msg("user", "[Cortex-compacted: 20 messages]\n\nresumen"))).toBe(true);
  });

  test("un mensaje normal no es un resumen", () => {
    expect(isCompactionSummary(msg("assistant", "he compactado el codigo"))).toBe(false);
  });

  test("se refleja en los hechos", () => {
    const f = readFactsFromSession(session([msg("assistant", "[Cortex-compacted: 5 messages]\n\nx")]));
    expect(f.lastIsCompactionSummary).toBe(true);
  });
});

describe("error y abort", () => {
  test("una respuesta que empieza por Error: marca el turno como fallido", () => {
    const f = readFactsFromSession(session([msg("assistant", "Error: no encuentro el fichero")]));
    expect(f.lastTurnErrored).toBe(true);
  });

  test("hablar de errores NO marca el turno como fallido", () => {
    const f = readFactsFromSession(session([msg("assistant", "he arreglado el Error: del test")]));
    expect(f.lastTurnErrored).toBe(false);
  });

  test("un turno en curso no se marca como fallido", () => {
    const f = readFactsFromSession(session([msg("assistant", "Error: x"), msg("user", "sigue")]));
    expect(f.lastTurnErrored).toBe(false);
  });

  test("detecta el abort del usuario", () => {
    const f = readFactsFromSession(session([msg("assistant", "iba por la mitad [aborted]")]));
    expect(f.lastTurnAborted).toBe(true);
  });
});

describe("uso de tokens", () => {
  test("se traduce el usage del proveedor", () => {
    expect(toTurnUsage(msg("assistant", "x", { promptTokens: 100, completionTokens: 20 }))).toEqual({
      input: 100,
      output: 20,
      cacheRead: undefined,
    });
  });

  test("sin usage, queda ausente: desconocido no es cero", () => {
    expect(toTurnUsage(msg("assistant", "x"))).toBeUndefined();
    expect(readFactsFromSession(session([msg("assistant", "x")])).latestUsage).toBeUndefined();
  });

  test("no se lee usage de un turno que aun no ha terminado", () => {
    const f = readFactsFromSession(
      session([msg("assistant", "x", { promptTokens: 9, completionTokens: 9 }), msg("user", "sigue")]),
    );
    expect(f.latestUsage).toBeUndefined();
  });

  test("una sesion vieja sin el campo usage carga sin romper", () => {
    const vieja = JSON.parse(
      JSON.stringify(session([msg("user", "x"), msg("assistant", "y")])),
    ) as SessionInfo;
    expect(() => readFactsFromSession(vieja)).not.toThrow();
    expect(readFactsFromSession(vieja).hasAssistantTurn).toBe(true);
  });
});
