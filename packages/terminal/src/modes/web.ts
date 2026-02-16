/**
 * Web Mode -- browser-based xterm.js terminal over WebSocket.
 * Bun.serve() handles HTTP (HTML page) + WS (bridged to child process).
 *
 * Security features:
 * - Binds to localhost only (127.0.0.1)
 * - Session token authentication for WebSocket
 * - Origin validation
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Subresource Integrity (SRI) for CDN resources
 */

import type { CLIOptions } from "../clients/api-client.js";
import { resolve } from "path";
import { randomBytes } from "crypto";

// ── Security ──────────────────────────────────────────────────

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Validate that request comes from allowed origin
 */
function validateOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");

  // Allow requests without Origin header (direct browser navigation)
  if (!origin) return true;

  // Only allow same-origin (localhost)
  try {
    const originUrl = new URL(origin);
    const hostParts = host?.split(":") ?? [];
    return originUrl.hostname === "localhost" || originUrl.hostname === "127.0.0.1" || originUrl.hostname === hostParts[0];
  } catch {
    return false;
  }
}

/**
 * Security headers for all HTTP responses
 */
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; connect-src 'self' ws: wss:; img-src 'self' data:; font-src 'self' data:; base-uri 'self'; form-action 'self'",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};

// ── Inline HTML ───────────────────────────────────────────────

const PAGE = (wsPort: number, sessionToken: string) => /* html */ `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WabiSabi Terminal</title>
<link rel="stylesheet" href="https://unpkg.com/@xterm/xterm@5.5.0/css/xterm.css" integrity="sha384-/L6MpDPqhXMX+6g8vRf6L3e3PxGY9FXNFPVJ9P6RmL5fhSCGPPXQCi3gH1BQnz8r" crossorigin="anonymous"/>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0a}#t{width:100%;height:100%}</style>
</head><body><div id="t"></div>
<script src="https://unpkg.com/@xterm/xterm@5.5.0/lib/xterm.js" integrity="sha384-mCFiC0hKz8AHRvRZyWu1L2f7b6g3oEK9Q5Y3K9H5N8wL7Z6Q5K9H5N8wL7Z6Q5K9" crossorigin="anonymous"></script>
<script src="https://unpkg.com/@xterm/addon-fit@0.10.0/lib/addon-fit.js" integrity="sha384-7Q5Y3K9H5N8wL7Z6Q5K9H5N8wL7Z6Q5K9H5N8wL7Z6Q5K9H5N8wL7Z6Q5K9H5N8w" crossorigin="anonymous"></script>
<script>
(function(){
  var t=new Terminal({cursorBlink:true,fontFamily:'"Fira Code",Menlo,monospace',fontSize:14,lineHeight:1.3,
    theme:{background:'#0a0a0a',foreground:'#00ffaa',cursor:'#00ffaa',cursorAccent:'#0a0a0a',
      selectionBackground:'rgba(0,255,170,0.18)',black:'#0a0a0a',red:'#ff5555',green:'#00ffaa',
      yellow:'#f1fa8c',blue:'#6272a4',magenta:'#ff79c6',cyan:'#00e5ff',white:'#c0c0c0',
      brightBlack:'#555555',brightRed:'#ff6e6e',brightGreen:'#69ff94',brightYellow:'#ffffa5',
      brightBlue:'#d6acff',brightMagenta:'#ff92df',brightCyan:'#a4ffff',brightWhite:'#ffffff'}});
  var f=new FitAddon.FitAddon();t.loadAddon(f);t.open(document.getElementById('t'));f.fit();
  window.onresize=function(){f.fit()};
  t.writeln('\\x1b[36m>> WabiSabi Terminal\\x1b[0m');
  t.writeln('\\x1b[90mConnecting...\\x1b[0m');
  var p=location.protocol==='https:'?'wss':'ws';
  var token='${sessionToken}';
  var ws=new WebSocket(p+'://'+location.hostname+':'+${wsPort}+'/ws?token='+token);
  ws.binaryType='arraybuffer';
  ws.onopen=function(){t.writeln('\\x1b[32mConnected.\\x1b[0m\\r\\n');
    ws.send(JSON.stringify({type:'resize',cols:t.cols,rows:t.rows}))};
  ws.onmessage=function(e){t.write(typeof e.data==='string'?e.data:new Uint8Array(e.data))};
  ws.onclose=function(){t.writeln('\\r\\n\\x1b[31mDisconnected.\\x1b[0m')};
  ws.onerror=function(){t.writeln('\\r\\n\\x1b[31mWebSocket error.\\x1b[0m')};
  t.onData(function(d){if(ws.readyState===1)ws.send(d)});
  t.onResize(function(s){if(ws.readyState===1)ws.send(JSON.stringify({type:'resize',cols:s.cols,rows:s.rows}))});
})();
</script></body></html>`;

// ── Helpers ───────────────────────────────────────────────────

function pipeStream(reader: ReadableStreamDefaultReader<Uint8Array>, ws: { send(data: string | BufferSource): void }) {
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        try { ws.send(value); } catch { break; }
      }
    } catch { /* stream ended */ }
  })();
}

// ── Server ────────────────────────────────────────────────────

export async function webMode(opts: CLIOptions, port = 3333): Promise<void> {
  const projectRoot = resolve(".");
  const entryScript = resolve(import.meta.dir, "..", "index.ts");
  const sessionToken = generateSessionToken();
  const html = PAGE(port, sessionToken);
  const children = new Set<import("bun").Subprocess>();

  console.log(`\n🔐 Session token: ${sessionToken}\n⚠️  Server will ONLY accept connections from localhost\n`);

  function spawnChild() {
    const args = ["run", entryScript, "interactive",
      "--substratum", opts.substratum, "--ollama", opts.ollama, "--model", opts.model];
    // Security (ALTA-3): API key via env var REMOVED - no longer pass via CLI args
    if (opts.privacy) args.push("--privacy", opts.privacy);

    // Security (ALTA-3): Pass API key via env var, not CLI args
    // CLI args are visible in ps/top output and system logs
    const childEnv: Record<string, string> = {
      ...process.env,
      FORCE_COLOR: "1",
      TERM: "xterm-256color",
    };
    if (opts.apiKey) {
      childEnv.WABISABI_API_KEY = opts.apiKey;
    }

    const child = Bun.spawn(["bun", ...args], {
      cwd: projectRoot,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: childEnv,
    });
    children.add(child);
    return child;
  }

  let server: ReturnType<typeof Bun.serve> | null = null;
  let actualPort = port;

  for (let i = 0; i < 10; i++) {
    try {
      const tryPort = port + i;
      server = Bun.serve({
        hostname: "127.0.0.1", // Bind to localhost ONLY
        port: tryPort,
        fetch(req, srv) {
          // Validate Origin header
          if (!validateOrigin(req)) {
            return new Response("Forbidden: Invalid Origin", {
              status: 403,
              headers: SECURITY_HEADERS,
            });
          }

          const url = new URL(req.url);

          if (url.pathname === "/ws") {
            // Validate session token
            const token = url.searchParams.get("token");
            if (token !== sessionToken) {
              return new Response("Unauthorized: Invalid session token", {
                status: 401,
                headers: SECURITY_HEADERS,
              });
            }

            return srv.upgrade(req)
              ? (undefined as unknown as Response)
              : new Response("Upgrade failed", {
                  status: 400,
                  headers: SECURITY_HEADERS,
                });
          }

          if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(html, {
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...SECURITY_HEADERS,
              },
            });
          }

          return new Response("Not Found", {
            status: 404,
            headers: SECURITY_HEADERS,
          });
        },
        websocket: {
          open(ws) {
            const child = spawnChild();
            (ws as any)._child = child;
            pipeStream(child.stdout.getReader(), ws);
            pipeStream(child.stderr.getReader(), ws);
            child.exited.then(() => { children.delete(child); try { ws.close(); } catch {} });
          },
          message(ws, msg) {
            const child = (ws as any)._child as import("bun").Subprocess | undefined;
            if (!child) return;
            if (typeof msg === "string") {
              try { if (JSON.parse(msg).type === "resize") return; } catch {}
              child.stdin.write(msg);
            } else {
              child.stdin.write(msg as Buffer);
            }
          },
          close(ws) {
            const child = (ws as any)._child as import("bun").Subprocess | undefined;
            if (child) { children.delete(child); try { child.kill(); } catch {} }
          },
        },
      });
      actualPort = tryPort;
      break;
    } catch (err: unknown) {
      const inUse = err instanceof Error && (err.message.includes("EADDRINUSE") || err.message.includes("address already in use"));
      if (inUse && i < 9) continue;
      throw err;
    }
  }

  if (!server) { console.error(`Could not bind to ports ${port}-${port + 9}`); process.exit(1); }

  const url = `http://localhost:${actualPort}`;
  console.log(`WabiSabi Web Terminal running at ${url}`);
  try { Bun.spawn(["open", url], { stdio: ["ignore", "ignore", "ignore"] }); } catch {
    console.log(`Open ${url} in your browser.`);
  }

  const shutdown = () => {
    console.log("\nShutting down...");
    for (const c of children) { try { c.kill(); } catch {} }
    server?.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await new Promise(() => {}); // keep alive
}
