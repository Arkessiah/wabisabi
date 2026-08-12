/**
 * Daemon tests — lock, control surface and log rotation.
 *
 * No process is spawned and no port is bound except in the one test that
 * explicitly checks the loopback bind.
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, statSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  claimLock,
  clearLock,
  generateToken,
  isProcessAlive,
  readLock,
  writeLock,
} from "../lock.js";
import { DaemonLogger } from "../logger.js";
import { createHandler, tokensEqual, LOOPBACK, startServer } from "../server.js";
import { DaemonConfigSchema } from "../schema.js";
import { status } from "../index.js";

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = join(tmpdir(), `wabisabi-daemon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  lockPath = join(dir, "daemon.lock");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("daemon config — opt-in", () => {
  test("por defecto esta DESACTIVADO", () => {
    expect(DaemonConfigSchema.parse({}).enabled).toBe(false);
  });

  test("el puerto por defecto es 0 (lo elige el SO)", () => {
    expect(DaemonConfigSchema.parse({}).port).toBe(0);
  });
});

describe("lock — un PID muerto es lock rancio, no un daemon vivo", () => {
  test("sin fichero: ni lock ni rancio", () => {
    expect(readLock(lockPath)).toEqual({ lock: null, state: "missing", stale: false });
  });

  test("PID vivo: se devuelve el lock", () => {
    writeLock(
      { pid: process.pid, port: 1234, token: "t", startedAt: Date.now(), version: "1.0.0" },
      lockPath,
    );
    const { lock, stale } = readLock(lockPath);
    expect(stale).toBe(false);
    expect(lock?.pid).toBe(process.pid);
  });

  test("PID muerto: rancio, y NO se reporta como corriendo", () => {
    // PID 2^22 - 1: por encima del maximo de cualquier SO habitual.
    writeLock(
      { pid: 4194303, port: 1234, token: "t", startedAt: Date.now(), version: "1.0.0" },
      lockPath,
    );
    const { lock, stale } = readLock(lockPath);
    expect(lock).toBeNull();
    expect(stale).toBe(true);
  });

  test("lock corrupto: rancio, no explota", () => {
    writeFileSync(lockPath, "{ esto no es json", "utf-8");
    const { lock, stale } = readLock(lockPath);
    expect(lock).toBeNull();
    expect(stale).toBe(true);
  });

  test("lock sin token: rancio (no sirve para hablar con el daemon)", () => {
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port: 1 }), "utf-8");
    expect(readLock(lockPath).stale).toBe(true);
  });

  test("isProcessAlive rechaza PIDs invalidos", () => {
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(1.5)).toBe(false);
    expect(isProcessAlive(process.pid)).toBe(true);
  });
});

describe("lock — \"no se puede saber\" no es \"muerto\"", () => {
  test("el estado distingue missing / alive / dead / unreadable", () => {
    expect(readLock(lockPath).state).toBe("missing");

    writeLock({ pid: process.pid, port: 1, token: "t", startedAt: 1, version: "1.0.0" }, lockPath);
    expect(readLock(lockPath).state).toBe("alive");

    writeLock({ pid: 4194303, port: 1, token: "t", startedAt: 1, version: "1.0.0" }, lockPath);
    expect(readLock(lockPath).state).toBe("dead");

    writeFileSync(lockPath, "no soy json", "utf-8");
    expect(readLock(lockPath).state).toBe("unreadable");
  });

  test("un lock ilegible NO se declara muerto", () => {
    writeFileSync(lockPath, "{ truncado", "utf-8");
    // Ilegible es "no se puede saber": no afirma que el proceso este muerto.
    expect(readLock(lockPath).state).not.toBe("dead");
  });

  test("status REPORTA pero no borra: leer no muta", () => {
    writeLock({ pid: 4194303, port: 1, token: "t", startedAt: 1, version: "1.0.0" }, lockPath);

    const st = status(lockPath);
    expect(st.running).toBe(false);
    expect(st.staleLock).toBe(true);
    expect(st.lockState).toBe("dead");
    // El fichero sigue ahi: solo quien va a publicar lo reemplaza.
    expect(existsSync(lockPath)).toBe(true);
  });

  test("status sobre un lock ilegible tampoco lo borra", () => {
    writeFileSync(lockPath, "basura", "utf-8");
    status(lockPath);
    expect(existsSync(lockPath)).toBe(true);
  });
});

describe("lock — escritura atomica", () => {
  test("no deja ficheros temporales detras", () => {
    writeLock({ pid: process.pid, port: 1, token: "t", startedAt: 1, version: "1.0.0" }, lockPath);
    const leftovers = readdirSync(dir).filter((f) => f.includes(".tmp."));
    expect(leftovers).toEqual([]);
  });

  test("sobrescribir un lock existente no lo deja a medias", () => {
    writeLock({ pid: 1, port: 1, token: "viejo", startedAt: 1, version: "1.0.0" }, lockPath);
    writeLock({ pid: process.pid, port: 2, token: "nuevo", startedAt: 2, version: "1.0.0" }, lockPath);

    // Un lock a medio escribir se leeria como "unreadable"; debe ser legible y nuevo.
    const res = readLock(lockPath);
    expect(res.state).toBe("alive");
    expect(res.lock?.token).toBe("nuevo");
  });
});

describe("lock — claim", () => {
  test("un lock rancio no impide arrancar: se limpia y se reclama", () => {
    writeLock(
      { pid: 4194303, port: 1, token: "viejo", startedAt: 1, version: "0.0.1" },
      lockPath,
    );
    const res = claimLock(
      { pid: process.pid, port: 9999, token: "nuevo", version: "1.0.0" },
      lockPath,
    );

    expect(res.claimed).toBe(true);
    expect(readLock(lockPath).lock?.token).toBe("nuevo");
  });

  test("un daemon VIVO impide una segunda instancia", () => {
    claimLock({ pid: process.pid, port: 1, token: "primero", version: "1.0.0" }, lockPath);
    const res = claimLock({ pid: process.pid, port: 2, token: "segundo", version: "1.0.0" }, lockPath);

    expect(res.claimed).toBe(false);
    if (!res.claimed) expect(res.heldBy.token).toBe("primero");
    expect(readLock(lockPath).lock?.token).toBe("primero");
  });

  test("clearLock sobre un fichero inexistente no falla", () => {
    expect(() => clearLock(join(dir, "no-existe.lock"))).not.toThrow();
  });

  test("el lock se escribe solo para el dueño (0600)", () => {
    if (process.platform === "win32") return; // Windows no tiene modos POSIX
    writeLock({ pid: process.pid, port: 1, token: "t", startedAt: 1, version: "1.0.0" }, lockPath);
    expect(statSync(lockPath).mode & 0o777).toBe(0o600);
  });

  test("el token generado es largo y distinto en cada llamada", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
});

describe("servidor IPC — el bind a loopback es invariante", () => {
  test("LOOPBACK es 127.0.0.1, nunca 0.0.0.0", () => {
    expect(LOOPBACK).toBe("127.0.0.1");
  });

  test("el servidor real escucha en loopback", () => {
    const logger = new DaemonLogger(join(dir, "d.log"));
    const handle = startServer({
      token: "tok",
      version: "1.0.0",
      startedAt: Date.now(),
      logger,
      port: 0,
    });

    try {
      expect(handle.hostname).toBe("127.0.0.1");
      expect(handle.port).toBeGreaterThan(0);
    } finally {
      handle.stop();
    }
  });
});

describe("servidor IPC — autenticacion", () => {
  const deps = () => ({
    token: "token-secreto",
    version: "1.0.0",
    startedAt: Date.now() - 60_000,
    logger: new DaemonLogger(join(dir, "d.log")),
  });

  test("sin token -> 401", async () => {
    const res = createHandler(deps())(new Request("http://127.0.0.1/ping"));
    expect(res.status).toBe(401);
  });

  test("token incorrecto -> 401", async () => {
    const res = createHandler(deps())(
      new Request("http://127.0.0.1/ping", { headers: { "x-wabisabi-token": "otro" } }),
    );
    expect(res.status).toBe(401);
  });

  test("el 401 no filtra pistas sobre el token valido", async () => {
    const res = createHandler(deps())(new Request("http://127.0.0.1/ping"));
    const body = await res.text();
    expect(body).not.toContain("token-secreto");
    expect(body).toBe(JSON.stringify({ error: "unauthorized" }));
  });

  test("token correcto por cabecera propia -> ping ok", async () => {
    const res = createHandler(deps())(
      new Request("http://127.0.0.1/ping", { headers: { "x-wabisabi-token": "token-secreto" } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, pong: true });
  });

  test("token correcto por Authorization: Bearer -> ok", async () => {
    const res = createHandler(deps())(
      new Request("http://127.0.0.1/ping", {
        headers: { authorization: "Bearer token-secreto" },
      }),
    );
    expect(res.status).toBe(200);
  });

  test("/status devuelve pid, version y uptime, nunca el token", async () => {
    const res = createHandler(deps())(
      new Request("http://127.0.0.1/status", { headers: { "x-wabisabi-token": "token-secreto" } }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.pid).toBe(process.pid);
    expect(body.version).toBe("1.0.0");
    expect(body.uptimeMs as number).toBeGreaterThanOrEqual(60_000);
    expect(JSON.stringify(body)).not.toContain("token-secreto");
  });

  test("ruta desconocida -> 404 (ya autenticado)", async () => {
    const res = createHandler(deps())(
      new Request("http://127.0.0.1/loquesea", {
        headers: { "x-wabisabi-token": "token-secreto" },
      }),
    );
    expect(res.status).toBe(404);
  });

  test("/shutdown solo por POST", async () => {
    const headers = { "x-wabisabi-token": "token-secreto" };
    const get = createHandler(deps())(new Request("http://127.0.0.1/shutdown", { headers }));
    expect(get.status).toBe(405);

    let called = false;
    const post = createHandler({ ...deps(), onShutdown: () => { called = true; } })(
      new Request("http://127.0.0.1/shutdown", { method: "POST", headers }),
    );
    expect(post.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(called).toBe(true);
  });
});

describe("tokensEqual", () => {
  test("iguales -> true; distintos o de otra longitud -> false", () => {
    expect(tokensEqual("abc", "abc")).toBe(true);
    expect(tokensEqual("abc", "abd")).toBe(false);
    expect(tokensEqual("abc", "abcd")).toBe(false);
    expect(tokensEqual("", "")).toBe(true);
  });
});

describe("logger — rotacion", () => {
  test("escribe lineas con nivel y timestamp", () => {
    const logPath = join(dir, "daemon.log");
    new DaemonLogger(logPath).info("arrancado");

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("[info] arrancado");
    expect(content).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("rota al superar el tamano y conserva el historico", () => {
    const logPath = join(dir, "daemon.log");
    const logger = new DaemonLogger(logPath, 200, 2);

    for (let i = 0; i < 20; i++) logger.info(`linea de relleno numero ${i}`);

    expect(existsSync(logPath)).toBe(true);
    expect(existsSync(`${logPath}.1`)).toBe(true);
    expect(statSync(logPath).size).toBeLessThanOrEqual(200);
  });

  test("no conserva mas de `keep` ficheros rotados", () => {
    const logPath = join(dir, "daemon.log");
    const logger = new DaemonLogger(logPath, 120, 2);

    for (let i = 0; i < 60; i++) logger.info(`relleno ${i}`);

    expect(existsSync(`${logPath}.2`)).toBe(true);
    expect(existsSync(`${logPath}.3`)).toBe(false);
  });

  test("un directorio de log inaccesible no tumba al daemon", () => {
    const logger = new DaemonLogger(join("/proc/no-escribible", "daemon.log"));
    expect(() => logger.error("algo")).not.toThrow();
  });
});
