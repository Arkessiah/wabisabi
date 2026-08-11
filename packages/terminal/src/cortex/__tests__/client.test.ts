/**
 * CortexClient tests
 *
 * The invariant under test is "a failed fetch must never masquerade as an empty
 * success" (AGENTS.md): every failure mode has to be distinguishable by the caller.
 *
 * `fetch` is stubbed globally; no network and no Ollama required.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { CortexClient, textOrNull, type CortexResult } from "../client.js";
import { CortexConfigSchema } from "../schema.js";

const config = CortexConfigSchema.parse({ model: "qwen2.5:0.5b", timeout: 200 });
const realFetch = globalThis.fetch;

/** Replace fetch with a stub for the duration of a test. */
function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response> | Response): void {
  // @ts-expect-error -- deliberate test double
  globalThis.fetch = (url: string | URL, init?: RequestInit) => {
    const result = impl(String(url), init);
    return result instanceof Promise ? result : Promise.resolve(result);
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

let client: CortexClient;

beforeEach(() => {
  client = new CortexClient(config);
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("CortexClient — fallo distinguible de vacio", () => {
  test("respuesta correcta devuelve ok con el texto", async () => {
    stubFetch(() => jsonResponse({ response: "  hola  ", done: true }));
    const res = await client.generate("ping");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toBe("hola");
      expect(res.truncatedInput).toBe(false);
    }
  });

  test("Ollama caido -> unavailable, NO vacio", async () => {
    stubFetch(() => Promise.reject(new Error("connect ECONNREFUSED")));
    const res = await client.generate("ping");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("unavailable");
  });

  test("HTTP 500 -> http-error con el status", async () => {
    stubFetch(() => jsonResponse({ error: "boom" }, 500));
    const res = await client.generate("ping");

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failure).toBe("http-error");
      expect(res.detail).toContain("500");
    }
  });

  test("el modelo responde vacio -> empty-output, distinto de un fallo de red", async () => {
    stubFetch(() => jsonResponse({ response: "   ", done: true }));
    const res = await client.generate("ping");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("empty-output");
  });

  test("timeout -> timeout", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const res = await client.generate("ping");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("timeout");
  });

  test("los cuatro fallos son distinguibles entre si", async () => {
    const failures: string[] = [];

    stubFetch(() => Promise.reject(new Error("down")));
    failures.push(fail(await client.generate("x")));
    stubFetch(() => jsonResponse({}, 503));
    failures.push(fail(await client.generate("x")));
    stubFetch(() => jsonResponse({ response: "" }));
    failures.push(fail(await client.generate("x")));
    failures.push(fail(await client.generate("y".repeat(20_000), { onOverflow: "error" })));

    expect(new Set(failures).size).toBe(4);
  });
});

describe("CortexClient — cancelacion", () => {
  test("un signal ya abortado no llega a hacer fetch", async () => {
    let called = false;
    stubFetch(() => {
      called = true;
      return jsonResponse({ response: "no deberia" });
    });

    const controller = new AbortController();
    controller.abort();
    const res = await client.generate("ping", { signal: controller.signal });

    expect(called).toBe(false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("aborted");
  });

  test("abortar durante la peticion devuelve aborted, no timeout", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const controller = new AbortController();
    const promise = client.generate("ping", { signal: controller.signal });
    controller.abort();

    const res = await promise;
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("aborted");
  });
});

describe("CortexClient — presupuesto de entrada", () => {
  test("por defecto recorta y lo senala", async () => {
    let sentLength = 0;
    stubFetch((_url, init) => {
      sentLength = JSON.parse(String(init?.body)).prompt.length;
      return jsonResponse({ response: "ok" });
    });

    const res = await client.generate("z".repeat(20_000));

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.truncatedInput).toBe(true);
    expect(sentLength).toBe(client.budgetChars);
  });

  test("con onOverflow error no llega a llamar al modelo", async () => {
    let called = false;
    stubFetch(() => {
      called = true;
      return jsonResponse({ response: "no deberia" });
    });

    const res = await client.generate("z".repeat(20_000), { onOverflow: "error" });

    expect(called).toBe(false);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("input-too-large");
  });

  test("un prompt dentro del presupuesto viaja intacto", async () => {
    let sent = "";
    stubFetch((_url, init) => {
      sent = JSON.parse(String(init?.body)).prompt;
      return jsonResponse({ response: "ok" });
    });

    await client.generate("prompt corto");
    expect(sent).toBe("prompt corto");
  });
});

describe("CortexClient — JSON", () => {
  test("pide format json a Ollama en vez de confiar en el modelo", async () => {
    let body: Record<string, unknown> = {};
    stubFetch((_url, init) => {
      body = JSON.parse(String(init?.body));
      return jsonResponse({ response: '{"complexity":"simple"}' });
    });

    await client.generateJSON("clasifica esto");
    expect(body.format).toBe("json");
  });

  test("extrae el objeto aunque venga envuelto en prosa", async () => {
    stubFetch(() => jsonResponse({ response: 'Claro:\n{"a":1}\nEso es todo.' }));
    const res = await client.generateJSON<{ a: number }>("x");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.a).toBe(1);
  });

  test("JSON no parseable -> invalid-output, no unavailable", async () => {
    stubFetch(() => jsonResponse({ response: "esto no es json" }));
    const res = await client.generateJSON("x");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("invalid-output");
  });

  test("JSON valido con forma incorrecta -> invalid-output via validate", async () => {
    stubFetch(() => jsonResponse({ response: '{"otra":"cosa"}' }));
    const res = await client.generateJSON<{ a: number }>("x", {
      validate: (v): v is { a: number } =>
        typeof v === "object" && v !== null && typeof (v as { a?: unknown }).a === "number",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("invalid-output");
  });

  test("un fallo de transporte se propaga tal cual, no como invalid-output", async () => {
    stubFetch(() => Promise.reject(new Error("down")));
    const res = await client.generateJSON("x");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failure).toBe("unavailable");
  });
});

describe("CortexClient — textOrNull", () => {
  test("colapsa el resultado para llamantes a los que no les importa el motivo", async () => {
    stubFetch(() => jsonResponse({ response: "hola" }));
    expect(textOrNull(await client.generate("x"))).toBe("hola");

    stubFetch(() => Promise.reject(new Error("down")));
    expect(textOrNull(await client.generate("x"))).toBeNull();
  });
});

describe("CortexClient — isAvailable", () => {
  test("true cuando el modelo esta en la lista", async () => {
    stubFetch(() => jsonResponse({ models: [{ name: "qwen2.5:0.5b" }] }));
    expect(await client.isAvailable()).toBe(true);
  });

  test("false cuando el modelo no esta, y cuando el endpoint no responde", async () => {
    stubFetch(() => jsonResponse({ models: [{ name: "llama3.2" }] }));
    expect(await client.isAvailable()).toBe(false);

    stubFetch(() => Promise.reject(new Error("down")));
    expect(await client.isAvailable()).toBe(false);
  });
});

/** Failure code of a result that must have failed. */
function fail(res: CortexResult<unknown>): string {
  if (res.ok) throw new Error("se esperaba un fallo y el resultado fue ok");
  return res.failure;
}
