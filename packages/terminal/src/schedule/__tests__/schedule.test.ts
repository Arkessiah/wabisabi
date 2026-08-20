import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseCron, parseField, nextRun, nextRunFor } from "../cron.js";
import { discoverLoops, enabledLoops, parseLoop } from "../loops.js";
import { createScheduler, dueLoops, type LoopState } from "../runtime.js";
import type { SessionInfo } from "../../session/types.js";

describe("cron — parseo", () => {
  test("expande comodines, listas, rangos y pasos", () => {
    expect(parseField("*", 0, 3)).toEqual([0, 1, 2, 3]);
    expect(parseField("1,3", 0, 5)).toEqual([1, 3]);
    expect(parseField("1-4", 0, 9)).toEqual([1, 2, 3, 4]);
    expect(parseField("*/15", 0, 59)).toEqual([0, 15, 30, 45]);
    expect(parseField("0-10/5", 0, 59)).toEqual([0, 5, 10]);
  });

  test("rechaza lo que no entiende en vez de interpretarlo a medias", () => {
    // Una tarea que corre a una hora que nadie pidio es peor que una que no corre.
    expect(parseField("MON", 0, 6)).toBeNull();
    expect(parseField("99", 0, 59)).toBeNull();
    expect(parseField("5-1", 0, 59)).toBeNull();
    expect(parseField("*/0", 0, 59)).toBeNull();
    expect(parseCron("@daily")).toBeNull();
    expect(parseCron("0 9 * *")).toBeNull();
    expect(parseCron("0 9 * * * *")).toBeNull();
  });

  test("acepta expresiones habituales", () => {
    for (const e of ["0 9 * * *", "*/5 * * * *", "0 0 1 * *", "30 8 * * 1-5"]) {
      expect(parseCron(e)).not.toBeNull();
    }
  });
});

describe("cron — proxima ejecucion", () => {
  test("es ESTRICTAMENTE posterior: no se redispara en el mismo minuto", () => {
    const ahora = new Date("2026-08-20T09:00:00");
    const next = nextRunFor("0 9 * * *", ahora);
    expect(next?.toISOString().slice(0, 16)).toBe(
      new Date("2026-08-21T09:00:00").toISOString().slice(0, 16),
    );
  });

  test("cada 5 minutos avanza al siguiente múltiplo", () => {
    const next = nextRunFor("*/5 * * * *", new Date("2026-08-20T09:02:30"));
    expect(next?.getMinutes()).toBe(5);
  });

  test("respeta el dia de la semana", () => {
    // 2026-08-20 es jueves; el siguiente lunes es el 24.
    const next = nextRunFor("0 8 * * 1", new Date("2026-08-20T09:00:00"));
    expect(next?.getDay()).toBe(1);
    expect(next?.getDate()).toBe(24);
  });

  test("una expresion imposible devuelve null en vez de girar sin fin", () => {
    expect(nextRunFor("0 0 31 2 *", new Date("2026-08-20T00:00:00"))).toBeNull();
  });

  test("un cron invalido no produce fecha", () => {
    expect(nextRunFor("no soy cron")).toBeNull();
  });
});

describe("loops — parseo del fichero", () => {
  const bueno = `---
name: repaso-diario
schedule: "0 9 * * *"
enabled: true
---
Revisa los tests que fallan.`;

  test("lee nombre, cron y prompt", () => {
    const res = parseLoop("/x/a.md", bueno, "project");
    expect("loop" in res).toBe(true);
    if ("loop" in res) {
      expect(res.loop.name).toBe("repaso-diario");
      expect(res.loop.enabled).toBe(true);
      expect(res.loop.prompt).toBe("Revisa los tests que fallan.");
    }
  });

  test("enabled es FALSE por defecto: clonar un repo no pone tareas a correr", () => {
    const sinEnabled = `---\nname: x\nschedule: "0 9 * * *"\n---\nhaz algo`;
    const res = parseLoop("/x/a.md", sinEnabled, "project");
    if ("loop" in res) expect(res.loop.enabled).toBe(false);
  });

  test("cualquier cosa que no sea true cuenta como false", () => {
    for (const v of ["yes", "1", "si", "TRUE "]) {
      const res = parseLoop("/x/a.md", `---\nname: x\nschedule: "0 9 * * *"\nenabled: ${v}\n---\nz`, "project");
      if ("loop" in res) expect(res.loop.enabled).toBe(v.trim().toLowerCase() === "true");
    }
  });

  test("rechaza lo incompleto o invalido, diciendo por que", () => {
    const casos: Array<[string, string]> = [
      [`sin frontmatter`, "frontmatter"],
      [`---\nschedule: "0 9 * * *"\n---\nz`, "name"],
      [`---\nname: x\n---\nz`, "schedule"],
      [`---\nname: x\nschedule: "malo"\n---\nz`, "cron"],
      [`---\nname: x\nschedule: "0 9 * * *"\n---\n`, "cuerpo"],
      [`---\nname: MAYUS\nschedule: "0 9 * * *"\n---\nz`, "name"],
    ];
    for (const [raw, esperado] of casos) {
      const res = parseLoop("/x/a.md", raw, "project");
      expect("error" in res).toBe(true);
      if ("error" in res) expect(res.error).toContain(esperado);
    }
  });

  test("token_budget debe ser un entero positivo", () => {
    const malo = parseLoop("/x/a.md", `---\nname: x\nschedule: "0 9 * * *"\ntoken_budget: -5\n---\nz`, "project");
    expect("error" in malo).toBe(true);

    const bien = parseLoop("/x/a.md", `---\nname: x\nschedule: "0 9 * * *"\ntoken_budget: 5000\n---\nz`, "project");
    if ("loop" in bien) expect(bien.loop.tokenBudget).toBe(5000);
  });
});

describe("loops — descubrimiento", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "loops-"));
    mkdirSync(join(root, ".agents", "loops"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function escribe(nombre: string, contenido: string): void {
    writeFileSync(join(root, ".agents", "loops", nombre), contenido, "utf-8");
  }

  test("encuentra los del proyecto", () => {
    escribe("a.md", `---\nname: uno\nschedule: "0 9 * * *"\nenabled: true\n---\nhaz A`);
    const res = discoverLoops(root);
    expect(res.loops.map((l) => l.name)).toContain("uno");
  });

  test("un fichero roto NO impide cargar los demas", () => {
    // Un .md a medio editar o con un merge sucio no puede desactivar tus tareas.
    escribe("roto.md", "esto no tiene frontmatter");
    escribe("bueno.md", `---\nname: bueno\nschedule: "0 9 * * *"\nenabled: true\n---\nhaz algo`);

    const res = discoverLoops(root);
    expect(res.loops.map((l) => l.name)).toEqual(["bueno"]);
    expect(res.problems).toHaveLength(1);
    expect(res.problems[0]?.reason).toContain("frontmatter");
  });

  test("enabledLoops filtra los apagados", () => {
    escribe("on.md", `---\nname: encendido\nschedule: "0 9 * * *"\nenabled: true\n---\nz`);
    escribe("off.md", `---\nname: apagado\nschedule: "0 9 * * *"\n---\nz`);

    expect(enabledLoops(discoverLoops(root)).map((l) => l.name)).toEqual(["encendido"]);
  });

  test("sin directorio de loops no pasa nada", () => {
    const vacio = mkdtempSync(join(tmpdir(), "sin-loops-"));
    expect(discoverLoops(vacio).loops).toEqual([]);
    rmSync(vacio, { recursive: true, force: true });
  });
});

describe("planificador", () => {
  const loop = (over: Partial<{ name: string; schedule: string; path: string }> = {}) => ({
    name: over.name ?? "t",
    path: over.path ?? "/x/t.md",
    scope: "project" as const,
    schedule: over.schedule ?? "*/5 * * * *",
    enabled: true,
    prompt: "haz algo",
  });

  test("un loop recien visto se PROGRAMA, no se dispara", () => {
    // Anadir una tarea no puede ejecutarla en ese instante.
    const states = new Map<string, LoopState>();
    const due = dueLoops([loop()], states, new Date("2026-08-20T09:00:00"));

    expect(due).toEqual([]);
    expect(states.get("/x/t.md")?.nextRunAt).toBeGreaterThan(0);
  });

  test("cuando llega su hora, toca", () => {
    const states = new Map<string, LoopState>([
      ["/x/t.md", { path: "/x/t.md", runs: 0, nextRunAt: new Date("2026-08-20T09:00:00").getTime() }],
    ]);
    expect(dueLoops([loop()], states, new Date("2026-08-20T09:00:30"))).toHaveLength(1);
  });

  test("varios disparos perdidos vencen UNA vez, no una por disparo", () => {
    // Despertar el portatil tras el fin de semana no puede lanzar 40 tareas:
    // dueLoops mira si la hora paso, no cuantas veces habria tocado.
    const states = new Map<string, LoopState>([
      ["/x/t.md", { path: "/x/t.md", runs: 0, nextRunAt: new Date("2026-08-17T09:00:00").getTime() }],
    ]);

    expect(dueLoops([loop()], states, new Date("2026-08-20T09:00:00"))).toHaveLength(1);
  });

  test("reprogramar deja la siguiente en el futuro", () => {
    const states = new Map<string, LoopState>([
      ["/x/t.md", { path: "/x/t.md", runs: 0, nextRunAt: new Date("2026-08-20T09:00:00").getTime() }],
    ]);
    const ahora = new Date("2026-08-20T09:00:30");
    const [d] = dueLoops([loop()], states, ahora);

    if (d) {
      const { reschedule } = require("../runtime.js");
      reschedule(d.state, d.loop, ahora);
      expect(d.state.nextRunAt).toBeGreaterThan(ahora.getTime());
    }
  });
});

describe("planificador — ejecucion", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "sched-"));
    mkdirSync(join(root, ".agents", "loops"), { recursive: true });
    writeFileSync(
      join(root, ".agents", "loops", "t.md"),
      `---\nname: tarea\nschedule: "*/5 * * * *"\nenabled: true\n---\nhaz el trabajo`,
      "utf-8",
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function sched(over: Partial<Parameters<typeof createScheduler>[0]> = {}, ahora = new Date()) {
    return createScheduler({
      projectRoot: root,
      store: {} as never,
      createSession: async () => ({ id: "s1", projectRoot: root }) as SessionInfo,
      createGoal: () => ({ ok: true }),
      now: () => ahora,
      ...over,
    });
  }

  test("el primer ciclo solo programa", async () => {
    expect(await sched().runOnce()).toEqual([]);
  });

  test("cuando vence, lanza la tarea como OBJETIVO sobre una sesion nueva", async () => {
    // Reloj movil: el primer ciclo programa y, tras avanzar 10 minutos, vence.
    let ahora = new Date("2026-08-20T09:00:00");
    const objetivos: string[] = [];

    const s = createScheduler({
      projectRoot: root,
      store: {} as never,
      createSession: async () => ({ id: "s-nueva", projectRoot: root }) as SessionInfo,
      createGoal: (session, l) => {
        objetivos.push(`${l.name}@${session.id}`);
        return { ok: true };
      },
      now: () => ahora,
    });

    expect(await s.runOnce()).toEqual([]);
    ahora = new Date("2026-08-20T09:10:00");
    const res = await s.runOnce();

    expect(res).toHaveLength(1);
    expect(res[0]?.ok).toBe(true);
    expect(res[0]?.sessionId).toBe("s-nueva");
    // Y se fijo el objetivo de verdad: eso es lo que activa el resto del sistema.
    expect(objetivos).toEqual(["tarea@s-nueva"]);
    // Reprogramado hacia el futuro, no repetido.
    expect(s.status()[0]?.nextRunAt).toBeGreaterThan(ahora.getTime());
  });

  test("si fijar el objetivo falla, se reporta y NO cuenta como ejecutado", async () => {
    let ahora = new Date("2026-08-20T09:00:00");
    const s = createScheduler({
      projectRoot: root,
      store: {} as never,
      createSession: async () => ({ id: "s1", projectRoot: root }) as SessionInfo,
      createGoal: () => ({ ok: false, error: "objetivo vacio" }),
      now: () => ahora,
    });

    await s.runOnce();
    ahora = new Date("2026-08-20T09:10:00");
    const res = await s.runOnce();

    expect(res[0]?.ok).toBe(false);
    expect(res[0]?.reason).toContain("objetivo vacio");
    expect(s.status()[0]?.runs).toBe(0);
  });

  test("un loop que revienta no tumba al planificador", async () => {
    const s = sched({
      createSession: async () => { throw new Error("boom"); },
    }, new Date("2026-08-20T09:00:00"));

    await s.runOnce();
    expect(await s.runOnce()).toBeInstanceOf(Array);
  });

  test("los problemas se avisan UNA vez, no en cada ciclo", async () => {
    writeFileSync(join(root, ".agents", "loops", "roto.md"), "sin frontmatter", "utf-8");
    const avisos: string[] = [];
    const s = sched({ log: (m) => avisos.push(m) });

    await s.runOnce();
    await s.runOnce();
    await s.runOnce();

    expect(avisos.filter((a) => a.includes("roto.md"))).toHaveLength(1);
  });
});
