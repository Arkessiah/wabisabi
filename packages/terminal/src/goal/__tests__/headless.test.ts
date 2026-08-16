/**
 * Headless turn tests.
 *
 * The guarantee under test: an unattended turn cannot write or run shell
 * commands unless the user explicitly said so. No network, no real model.
 */

import { describe, expect, test } from "bun:test";
import {
  allowedToolIds,
  isCallAllowed,
  runHeadlessTurn,
  toChatMessages,
  MUTATING_TOOLS,
  READ_ONLY_GIT_SUBCOMMANDS,
  READ_ONLY_TOOLS,
} from "../headless.js";
import type { ChatMessage, ChatResponse } from "../../clients/api-client.js";
import type { ToolSpec } from "../../tools/index.js";
import type { SessionInfo } from "../../session/types.js";
import { toolRegistry } from "../../tools/index.js";
import { readTool } from "../../tools/read.js";
import { bashTool } from "../../tools/bash.js";
import { grepTool } from "../../tools/grep.js";
import { gitTool } from "../../tools/git.js";

// The registry is populated by the CLI entrypoint, which tests do not load.
toolRegistry.register(readTool);
toolRegistry.register(bashTool);
toolRegistry.register(grepTool);
toolRegistry.register(gitTool);

function session(messages: SessionInfo["messages"] = []): SessionInfo {
  return {
    id: "s1",
    title: "t",
    projectRoot: process.cwd(),
    model: "m",
    agent: "build",
    messages,
    created: 1,
    updated: 1,
  };
}

/** A model that replies with a scripted sequence of responses. */
function scriptedClient(responses: Array<Partial<ChatResponse["choices"][0]["message"]> & { usage?: ChatResponse["usage"] }>) {
  const seen: { messages: ChatMessage[]; specs: ToolSpec[] }[] = [];
  let i = 0;

  return {
    seen,
    chatWithTools: async (messages: ChatMessage[], specs: ToolSpec[]): Promise<ChatResponse> => {
      seen.push({ messages: structuredClone(messages), specs });
      const next = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        id: "r",
        object: "chat.completion",
        created: 1,
        model: "m",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: next?.content ?? "", tool_calls: next?.tool_calls },
            finish_reason: "stop",
          },
        ],
        ...(next?.usage ? { usage: next.usage } : {}),
      } as ChatResponse;
    },
  };
}

const bashCall = {
  id: "c1",
  type: "function" as const,
  function: { name: "bash", arguments: JSON.stringify({ command: "rm -rf /" }) },
};

describe("politica de herramientas sin supervision", () => {
  test("read-only retira write, edit y bash", () => {
    const all = ["read", "write", "edit", "bash", "grep"];
    expect(allowedToolIds("read-only", all)).toEqual(["read", "grep"]);
  });

  test("inherit las conserva todas", () => {
    const all = ["read", "write", "edit", "bash"];
    expect(allowedToolIds("inherit", all)).toEqual(all);
  });

  test("el conjunto read-only por defecto no contiene ninguna mutante", () => {
    for (const id of READ_ONLY_TOOLS) expect(MUTATING_TOOLS.has(id)).toBe(false);
  });

  test("por defecto es read-only: no hay que pedirlo", async () => {
    const client = scriptedClient([{ content: "listo" }]);
    await runHeadlessTurn(client, session(), "sys", "haz algo", { toolIds: ["read", "bash"] });

    const offered = client.seen[0]?.specs.map((s) => s.function.name) ?? [];
    expect(offered).not.toContain("bash");
    expect(offered).not.toContain("write");
  });
});

describe("una tool mutante no llega a ejecutarse en read-only", () => {
  test("se retiene y se le dice al modelo, sin ejecutarla", async () => {
    const client = scriptedClient([
      { content: null, tool_calls: [bashCall] },
      { content: "no pude, hace falta bash" },
    ]);

    const res = await runHeadlessTurn(client, session(), "sys", "borra todo");

    expect(res.withheld).toEqual(["bash"]);
    // No se contabiliza como tool ejecutada: nunca llego al registry.
    expect(res.toolCalls).toBe(0);
    expect(res.stoppedBy).toBe("done");

    const toolReply = client.seen[1]?.messages.find((m) => m.role === "tool");
    expect(toolReply?.content).toContain("no esta disponible");
    expect(toolReply?.content).toContain("No lo reintentes");
  });

  test("bajo read-only, bash ni siquiera se le ofrece al modelo", async () => {
    const client = scriptedClient([{ content: "ok" }]);
    await runHeadlessTurn(client, session(), "sys", "x", { toolIds: ["read", "bash"] });

    expect(client.seen[0]?.specs.map((s) => s.function.name)).toEqual(["read"]);
  });

  test("con inherit si se le ofrece (el usuario lo acepto explicitamente)", async () => {
    const client = scriptedClient([{ content: "ok" }]);
    await runHeadlessTurn(client, session(), "sys", "x", {
      policy: "inherit",
      toolIds: ["read", "bash"],
    });

    expect(client.seen[0]?.specs.map((s) => s.function.name)).toContain("bash");
  });
});

describe("git: la etiqueta read-only tiene que ser cierta", () => {
  test("los subcomandos que leen pasan", () => {
    for (const sub of ["status", "diff", "log", "show"]) {
      expect(isCallAllowed("read-only", "git", { subcommand: sub }).allowed).toBe(true);
    }
  });

  test("los que MODIFICAN el repositorio se retienen", () => {
    // Sin esto, un bucle desatendido podia commitear, pushear y resetear
    // bajo una politica llamada literalmente "read-only".
    for (const sub of ["commit", "push", "reset", "checkout", "merge", "cherry-pick", "add", "stash", "tag", "pull"]) {
      const v = isCallAllowed("read-only", "git", { subcommand: sub });
      expect(v.allowed).toBe(false);
      if (!v.allowed) expect(v.why).toContain(sub);
    }
  });

  test("es allowlist: un subcomando desconocido se retiene", () => {
    expect(isCallAllowed("read-only", "git", { subcommand: "inventado" }).allowed).toBe(false);
    expect(isCallAllowed("read-only", "git", {}).allowed).toBe(false);
  });

  test("ninguno de los permitidos escribe en el repo", () => {
    for (const sub of READ_ONLY_GIT_SUBCOMMANDS) {
      expect(["commit", "push", "reset", "checkout", "merge", "add", "stash", "pull", "tag", "cherry-pick"])
        .not.toContain(sub);
    }
  });

  test("con inherit, git completo (el usuario lo acepto)", () => {
    expect(isCallAllowed("inherit", "git", { subcommand: "push" }).allowed).toBe(true);
    expect(isCallAllowed("inherit", "bash", {}).allowed).toBe(true);
  });

  test("en el turno real, un git commit se retiene y no se ejecuta", async () => {
    const client = scriptedClient([
      {
        content: null,
        tool_calls: [
          { id: "c1", type: "function" as const,
            function: { name: "git", arguments: JSON.stringify({ subcommand: "push" }) } },
        ],
      },
      { content: "no pude pushear" },
    ]);

    const res = await runHeadlessTurn(client, session(), "sys", "sube los cambios", {
      toolIds: ["read", "git"],
    });

    expect(res.withheld).toEqual(["git"]);
    expect(res.toolCalls).toBe(0);
    const reply = client.seen[1]?.messages.find((m) => m.role === "tool");
    expect(reply?.content).toContain("push");
  });
});

describe("construccion del contexto", () => {
  test("el prompt del sistema va primero y el historial detras", () => {
    const msgs = toChatMessages(
      session([
        { role: "user", content: "hola", timestamp: 1 },
        { role: "assistant", content: "que tal", timestamp: 2 },
      ]),
      "SYS",
    );

    expect(msgs[0]).toEqual({ role: "system", content: "SYS" });
    expect(msgs.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  test("los mensajes de tool no se replayean: ya estan resumidos en el turno", () => {
    const msgs = toChatMessages(
      session([
        { role: "user", content: "x", timestamp: 1 },
        { role: "tool", content: "salida enorme", timestamp: 2 },
        { role: "assistant", content: "hecho", timestamp: 3 },
      ]),
      "SYS",
    );

    expect(msgs.some((m) => m.role === "tool")).toBe(false);
  });

  test("la continuacion se añade como mensaje de usuario al final", async () => {
    const client = scriptedClient([{ content: "ok" }]);
    await runHeadlessTurn(client, session(), "sys", "sigue con el objetivo");

    const last = client.seen[0]?.messages.slice(-1)[0];
    expect(last).toEqual({ role: "user", content: "sigue con el objetivo" });
  });
});

describe("el turno nunca tumba al daemon", () => {
  test("un proveedor que lanza vuelve como error, no como excepcion", async () => {
    const client = {
      chatWithTools: async () => {
        throw new Error("proveedor caido");
      },
    };

    const res = await runHeadlessTurn(client, session(), "sys", "x");

    expect(res.stoppedBy).toBe("error");
    expect(res.error).toContain("proveedor caido");
  });

  test("una respuesta sin mensaje se reporta como error", async () => {
    const client = {
      chatWithTools: async () =>
        ({ id: "r", object: "o", created: 1, model: "m", choices: [] }) as ChatResponse,
    };

    expect((await runHeadlessTurn(client, session(), "sys", "x")).stoppedBy).toBe("error");
  });

  test("un bucle de tools sin fin se corta por el limite de iteraciones", async () => {
    const client = scriptedClient([{ content: null, tool_calls: [bashCall] }]);
    const res = await runHeadlessTurn(client, session(), "sys", "x", {
      maxIterations: 3,
      toolIds: ["read"],
    });

    expect(res.stoppedBy).toBe("iteration-limit");
    expect(res.iterations).toBe(3);
  });

  test("un signal abortado corta antes de llamar al modelo", async () => {
    let llamado = false;
    const client = {
      chatWithTools: async () => {
        llamado = true;
        return {} as ChatResponse;
      },
    };
    const controller = new AbortController();
    controller.abort();

    const res = await runHeadlessTurn(client, session(), "sys", "x", {
      signal: controller.signal,
    });

    expect(llamado).toBe(false);
    expect(res.stoppedBy).toBe("aborted");
  });
});

describe("registro de herramientas vacio", () => {
  test("falla ruidosamente en vez de dejar al modelo hablando sin tools", async () => {
    const client = scriptedClient([{ content: "hablo pero no trabajo" }]);
    const res = await runHeadlessTurn(client, session(), "sys", "x", {
      toolIds: ["no-registrada-1", "no-registrada-2"],
    });

    expect(res.stoppedBy).toBe("error");
    expect(res.error).toContain("registro de herramientas");
  });

  test("no pedir ninguna tool es legitimo y no dispara el error", async () => {
    const client = scriptedClient([{ content: "solo texto" }]);
    const res = await runHeadlessTurn(client, session(), "sys", "x", { toolIds: [] });

    expect(res.stoppedBy).toBe("done");
  });
});

describe("uso de tokens", () => {
  test("se devuelve el usage del proveedor para que el objetivo lo contabilice", async () => {
    const client = scriptedClient([
      {
        content: "hecho",
        usage: { prompt_tokens: 500, completion_tokens: 120, total_tokens: 620 },
      },
    ]);

    expect((await runHeadlessTurn(client, session(), "sys", "x")).usage).toEqual({
      promptTokens: 500,
      completionTokens: 120,
    });
  });

  test("sin usage del proveedor queda ausente, no cero", async () => {
    const client = scriptedClient([{ content: "hecho" }]);
    expect((await runHeadlessTurn(client, session(), "sys", "x")).usage).toBeUndefined();
  });
});
