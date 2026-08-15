/**
 * Daemon lifecycle
 *
 * The background process that lets work outlive the terminal session.
 * **Opt-in**: `daemon.enabled` is false by default and nothing starts it
 * implicitly — see `schema.ts`.
 *
 * Phase 1 gives the process, its single-instance guarantee, its log and a
 * control surface (`ping`/`status`/`shutdown`). It does not run any workload
 * yet; goal loops and scheduled tasks are its future tenants.
 */

import { spawn } from "child_process";
import { openSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
  claimLock,
  clearLock,
  defaultLockPath,
  generateToken,
  readLock,
} from "./lock.js";
import { DaemonLogger, defaultLogDir, defaultLogPath } from "./logger.js";
import { startServer, type DaemonServerHandle } from "./server.js";
import { DaemonConfigSchema, type DaemonConfig, type DaemonStatus } from "./schema.js";

export const DAEMON_VERSION = "1.0.0";

/** Env flag the parent sets so the spawned child knows to run the daemon body. */
export const DAEMON_CHILD_ENV = "WABISABI_DAEMON_CHILD";
/**
 * Lock path handed to the child. Without this the child would always write the
 * default lock while the parent polled a different one, and `start({lockPath})`
 * would silently never succeed.
 */
export const DAEMON_LOCK_ENV = "WABISABI_DAEMON_LOCK";

export function daemonHome(): string {
  return join(homedir(), ".wabisabi");
}

/**
 * Current state. **Reports; does not mutate.**
 *
 * An earlier version cleared a stale lock here so `status` would self-heal, but
 * that made every observer a mutator of a file it did not create — and an
 * unreadable lock (which proves nothing about liveness) would be deleted by a
 * plain `daemon status`. Only `start`, the actor that intends to publish, clears.
 */
export function status(lockPath: string = defaultLockPath()): DaemonStatus {
  const { lock, state } = readLock(lockPath);

  if (!lock) {
    return {
      running: false,
      lockState: state,
      staleLock: state === "dead" || state === "unreadable" || undefined,
    };
  }

  return {
    running: true,
    lockState: state,
    pid: lock.pid,
    port: lock.port,
    startedAt: lock.startedAt,
    version: lock.version,
    uptimeMs: Date.now() - lock.startedAt,
  };
}

/**
 * Run the daemon body **in this process**. Called by the spawned child, never
 * by the user's foreground CLI.
 */
export function runDaemon(
  config: DaemonConfig,
  lockPath: string = process.env[DAEMON_LOCK_ENV] || defaultLockPath(),
): void {
  const startedAt = Date.now();
  const logger = new DaemonLogger(defaultLogPath(), config.logMaxBytes, config.logKeep);
  const token = generateToken();

  // Bind first: the lock must publish the port the OS actually gave us, and a
  // lock written before a failed bind would advertise a daemon that is not there.
  let server: DaemonServerHandle;
  try {
    server = startServer({
      token,
      version: DAEMON_VERSION,
      startedAt,
      logger,
      port: config.port,
      onShutdown: () => shutdown("ipc"),
    });
  } catch (error) {
    logger.error(`no se pudo abrir el puerto de control: ${String(error)}`);
    process.exit(1);
  }

  const claim = claimLock(
    { pid: process.pid, port: server.port, token, version: DAEMON_VERSION, startedAt },
    lockPath,
  );

  if (!claim.claimed) {
    logger.warn(`ya hay un daemon vivo (pid ${claim.heldBy.pid}); este proceso se retira`);
    server.stop();
    process.exit(0);
  }

  logger.info(`daemon arrancado (pid ${process.pid}, puerto ${server.port})`);

  // The goal loop is the daemon's first tenant. Wiring is lazy and best-effort:
  // a daemon that cannot start the loop is still a working daemon, and saying so
  // in the log beats refusing to run.
  let goalLoop: { stop: () => void } | null = null;
  void (async () => {
    try {
      const [{ startGoalLoop }, { GoalStore }, { createAgentBridge }, { GoalConfigSchema }, { configManager }] =
        await Promise.all([
          import("../goal/runtime.js"),
          import("../goal/store.js"),
          import("../goal/bridge.js"),
          import("../goal/schema.js"),
          import("../config/index.js"),
        ]);
      configManager.loadGlobal();
      const goalCfg = GoalConfigSchema.parse(configManager.getMerged().goal ?? {});
      const store = new GoalStore();
      goalLoop = startGoalLoop({
        store,
        ...createAgentBridge({
          log: (m) => logger.info(m),
          // The user must find out a skill was written on their behalf.
          harvestModel: goalCfg.harvestModel,
          harvestSkills: goalCfg.harvestSkills,
          autonomousTools: goalCfg.autonomousTools,
          maxTurnIterations: goalCfg.maxTurnIterations,
          onSkillProposed: (name, path, modelLabel) =>
            logger.info(
              `PROPUESTA DE SKILL "${name}"${modelLabel ? ` (destilada por ${modelLabel})` : ""} — ` +
                `no se carga en ningun prompt hasta adoptarla. ` +
                `Revisala en ${path} y luego: wabisabi skills adopt ${name}`,
            ),
        }),
        log: (m) => logger.info(m),
      });
      logger.info("bucle de objetivos activo");
    } catch (error) {
      logger.error(`no se pudo arrancar el bucle de objetivos: ${String(error)}`);
    }
  })();

  let shuttingDown = false;
  function shutdown(reason: string): void {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`parando daemon (${reason})`);
    try {
      goalLoop?.stop();
      server.stop();
    } finally {
      // Only clear the lock if it is still OURS: another instance may have
      // taken over after a takeover race, and removing its lock would orphan it.
      const current = readLock(lockPath);
      if (current.lock?.pid === process.pid) clearLock(lockPath);
      process.exit(0);
    }
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    logger.error(`excepcion no capturada: ${String(error)}`);
    shutdown("uncaughtException");
  });
}

export interface StartResult {
  started: boolean;
  reason?: "disabled" | "already-running" | "spawn-failed";
  pid?: number;
  port?: number;
  detail?: string;
}

/**
 * Spawn a detached daemon and return once it has published its lock.
 * Refuses when the feature is disabled in config: the whole point of the flag
 * is that nothing runs in the background unless the user asked for it.
 */
export async function start(
  rawConfig: unknown,
  options: { lockPath?: string; entrypoint?: string; timeoutMs?: number } = {},
): Promise<StartResult> {
  const config = DaemonConfigSchema.parse(rawConfig ?? {});
  const lockPath = options.lockPath ?? defaultLockPath();

  if (!config.enabled) {
    return { started: false, reason: "disabled" };
  }

  const existing = status(lockPath);
  if (existing.running) {
    return { started: false, reason: "already-running", pid: existing.pid, port: existing.port };
  }

  // We are the actor that intends to publish, so we are the one allowed to
  // remove what is there. `claimLock` re-reads under the same rule, so this is
  // only about surfacing an unreadable lock to the user instead of eating it.
  if (existing.staleLock) clearLock(lockPath);

  mkdirSync(daemonHome(), { recursive: true });
  mkdirSync(defaultLogDir(), { recursive: true });

  // A detached child must not hold the parent's stdio, or closing the terminal
  // would deliver SIGHUP / break its pipes. Everything goes to the log file.
  const outFd = openSync(defaultLogPath(), "a");
  const entrypoint = options.entrypoint ?? process.argv[1];

  if (!entrypoint || !existsSync(entrypoint)) {
    return { started: false, reason: "spawn-failed", detail: "no se pudo resolver el entrypoint" };
  }

  const child = spawn(process.execPath, [entrypoint, "daemon", "run"], {
    detached: true,
    stdio: ["ignore", outFd, outFd],
    env: { ...process.env, [DAEMON_CHILD_ENV]: "1", [DAEMON_LOCK_ENV]: lockPath },
  });
  child.unref();

  // Wait for the child to publish its lock: reporting "started" before the
  // process is reachable would make `status` right after `start` look broken.
  const deadline = Date.now() + (options.timeoutMs ?? 5000);
  while (Date.now() < deadline) {
    const current = status(lockPath);
    if (current.running) {
      return { started: true, pid: current.pid, port: current.port };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    started: false,
    reason: "spawn-failed",
    detail: "el daemon no publico su lock a tiempo (mira ~/.wabisabi/logs/daemon.log)",
  };
}

export interface StopResult {
  stopped: boolean;
  reason?: "not-running" | "signal-failed";
  pid?: number;
  detail?: string;
}

/** Stop the running daemon with SIGTERM, waiting for the lock to clear. */
export async function stop(
  options: { lockPath?: string; timeoutMs?: number } = {},
): Promise<StopResult> {
  const lockPath = options.lockPath ?? defaultLockPath();
  const current = status(lockPath);

  if (!current.running || !current.pid) {
    return { stopped: false, reason: "not-running" };
  }

  try {
    process.kill(current.pid, "SIGTERM");
  } catch (error) {
    return {
      stopped: false,
      reason: "signal-failed",
      pid: current.pid,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const deadline = Date.now() + (options.timeoutMs ?? 5000);
  while (Date.now() < deadline) {
    if (!status(lockPath).running) return { stopped: true, pid: current.pid };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // The process ignored SIGTERM or died without cleaning up; status() already
  // treats a dead PID as stale, so this only reports the timeout.
  return {
    stopped: false,
    reason: "signal-failed",
    pid: current.pid,
    detail: "no termino dentro del plazo",
  };
}

/** Authenticated request against the running daemon. */
export async function request(
  path: string,
  init: RequestInit = {},
  lockPath: string = defaultLockPath(),
): Promise<Response | null> {
  const { lock } = readLock(lockPath);
  if (!lock) return null;

  try {
    return await fetch(`http://127.0.0.1:${lock.port}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), "x-wabisabi-token": lock.token },
    });
  } catch {
    return null;
  }
}

export { defaultLockPath, defaultLogPath, defaultLogDir };
export { DaemonConfigSchema, type DaemonConfig, type DaemonStatus } from "./schema.js";
