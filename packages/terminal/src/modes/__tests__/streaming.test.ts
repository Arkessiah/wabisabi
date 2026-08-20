/**
 * El bug que este fichero existe para que no vuelva:
 *
 * el valor de RETORNO de un generador (donde viajan las tool_calls) se entrega en
 * la llamada a next() que marca `done`. Un `for await ... of` lo DESCARTA, y
 * llamar a next() despues sobre un generador ya agotado devuelve undefined.
 *
 * Consecuencia real: `wabisabi stream` rompia el bucle en la primera vuelta y
 * NUNCA ejecutaba una herramienta. El type-check lo señalaba como
 * "'result.tool_calls' is possibly undefined" y nadie lo miraba.
 */

import { describe, expect, test } from "bun:test";

interface Resultado {
  content: string;
  tool_calls: Array<{ id: string; function?: { name?: string; arguments?: string } }>;
}

async function* generadorConRetorno(): AsyncGenerator<{ content: string }, Resultado> {
  yield { content: "hola " };
  yield { content: "mundo" };
  return {
    content: "hola mundo",
    tool_calls: [{ id: "c1", function: { name: "read", arguments: "{}" } }],
  };
}

describe("consumo del generador de streaming", () => {
  test("`for await` PIERDE el valor de retorno (la causa del bug)", async () => {
    const gen = generadorConRetorno();
    for await (const d of gen) void d;

    // Ya agotado: este next() no devuelve el return, devuelve undefined.
    const final = await gen.next();
    expect(final.done).toBe(true);
    expect(final.value).toBeUndefined();
  });

  test("consumir a mano SI recoge el retorno con sus tool_calls", async () => {
    const gen = generadorConRetorno();
    let texto = "";
    let result: Resultado | undefined;

    while (true) {
      const { done, value } = await gen.next();
      if (done) {
        result = value as Resultado | undefined;
        break;
      }
      texto += (value as { content: string }).content;
    }

    expect(texto).toBe("hola mundo");
    expect(result?.tool_calls).toHaveLength(1);
    expect(result?.tool_calls[0]?.function?.name).toBe("read");
  });

  test("una tool call incompleta no puede tumbar el bucle", () => {
    const calls: Resultado["tool_calls"] = [
      { id: "c1" },                                          // sin function
      { id: "c2", function: {} },                            // sin name
      { id: "c3", function: { name: "read", arguments: "" } },
    ];

    const ejecutables = calls.filter((c) => Boolean(c.function?.name));
    expect(ejecutables.map((c) => c.id)).toEqual(["c3"]);

    // Y unos argumentos rotos caen a {} en vez de lanzar.
    const parse = (raw?: string) => {
      try { return JSON.parse(raw || "{}"); } catch { return {}; }
    };
    expect(parse("")).toEqual({});
    expect(parse("{roto")).toEqual({});
  });
});
