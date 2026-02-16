/**
 * Web Mode -- browser-based xterm.js terminal over WebSocket.
 * Bun.serve() handles HTTP (HTML page) + WS (bridged to child process).
 */

import type { CLIOptions } from "../clients/api-client.js";
import { resolve } from "path";

// ── Inline HTML ───────────────────────────────────────────────

const PAGE = (wsPort: number) => /* html */ `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>WabiSabi Terminal</title>
<link rel="stylesheet" href="https://unpkg.com/@xterm/xterm@5.5.0/css/xterm.css"/>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0a0a}#t{width:100%;height:100%}</style>
</head><body><div id="t"></div>
<script src="https://unpkg.com/@xterm/xterm@5.5.0/lib/xterm.js"></script>
<script src="https://unpkg.com/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
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
  var ws=new WebSocket(p+'://'+location.hostname+':'+${wsPort}+'/ws');
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
  const html = PAGE(port);
  const children = new Set<import("bun").Subprocess>();

  function spawnChild() {
    const args = ["run", entryScript, "interactive",
      "--substratum", opts.substratum, "--ollama", opts.ollama, "--model", opts.model];
    if (opts.apiKey) args.push("--api-key", opts.apiKey);
    if (opts.privacy) args.push("--privacy", opts.privacy);

    const child = Bun.spawn(["bun", ...args], {
      cwd: projectRoot, stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, FORCE_COLOR: "1", TERM: "xterm-256color" },
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
        port: tryPort,
        fetch(req, srv) {
          const url = new URL(req.url);
          if (url.pathname === "/ws") {
            return srv.upgrade(req)
              ? (undefined as unknown as Response)
              : new Response("Upgrade failed", { status: 400 });
          }
          if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
          }
          return new Response("Not Found", { status: 404 });
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
