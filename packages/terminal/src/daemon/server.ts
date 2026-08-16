/**
 * Daemon IPC server
 *
 * Minimal control surface for the background process.
 *
 * ## Security invariants (do not relax without an exposure review)
 *
 * 1. **Binds 127.0.0.1, always.** `LOOPBACK` is a constant, not a setting.
 *    There is no `--lan`, no `0.0.0.0`, no config key that changes it. In Docker
 *    and on shared machines, "just a local port" published on all interfaces is
 *    the single most repeated way an internal panel ends up on the internet.
 * 2. **Every request needs the per-instance token** from the lock file, compared
 *    in constant time. Loopback alone is not authentication: any local process,
 *    and any browser page via DNS rebinding, can reach 127.0.0.1.
 * 3. **The token is never logged**, never echoed in a response, never printed.
 */

import { timingSafeEqual } from "crypto";
import type { DaemonLogger } from "./logger.js";

/** Not configurable on purpose. See invariant 1. */
export const LOOPBACK = "127.0.0.1";

export interface DaemonServerDeps {
  token: string;
  version: string;
  startedAt: number;
  logger: DaemonLogger;
  /** 0 lets the OS choose a free port. */
  port?: number;
  onShutdown?: () => void;
}

export interface DaemonServerHandle {
  port: number;
  hostname: string;
  stop: () => void;
}

/** Constant-time compare that does not leak length through early return. */
export function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing does not distinguish "wrong length".
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Build the request handler. Exported separately so tests can exercise routing
 * and auth without binding a port.
 */
export function createHandler(deps: DaemonServerDeps): (req: Request) => Response {
  return (req: Request): Response => {
    const url = new URL(req.url);

    const provided =
      req.headers.get("x-wabisabi-token") ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";

    if (!provided || !tokensEqual(provided, deps.token)) {
      // Deliberately terse: no hint about what a valid token looks like.
      return json({ error: "unauthorized" }, 401);
    }

    switch (url.pathname) {
      case "/ping":
        return json({ ok: true, pong: true });

      case "/status":
        return json({
          ok: true,
          pid: process.pid,
          version: deps.version,
          startedAt: deps.startedAt,
          uptimeMs: Date.now() - deps.startedAt,
        });

      case "/shutdown": {
        if (req.method !== "POST") return json({ error: "method-not-allowed" }, 405);
        deps.logger.info("shutdown solicitado por IPC");
        // Answer before tearing down so the caller does not see a dropped socket.
        queueMicrotask(() => deps.onShutdown?.());
        return json({ ok: true, stopping: true });
      }

      default:
        return json({ error: "not-found" }, 404);
    }
  };
}

/** Start the IPC server bound to loopback. */
export function startServer(deps: DaemonServerDeps): DaemonServerHandle {
  const handler = createHandler(deps);

  const server = Bun.serve({
    hostname: LOOPBACK,
    port: deps.port ?? 0,
    fetch: handler,
  });

  // `Bun.serve().port` is optional in the type because a unix-socket server has
  // none. We always bind TCP, so an absent port means something is very wrong —
  // and publishing `undefined` into the lock would advertise a daemon nobody can
  // reach. Fail here rather than one layer later.
  const port = server.port;
  if (typeof port !== "number") {
    server.stop(true);
    throw new Error("el servidor de control no expuso un puerto TCP");
  }

  deps.logger.info(`IPC escuchando en ${LOOPBACK}:${port}`);

  return {
    port,
    hostname: LOOPBACK,
    stop: () => server.stop(true),
  };
}
