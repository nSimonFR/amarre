// WS ↔ stdin/stdout proxy for `pi --mode rpc`. Single-session, multi-client.
// Each line of pi.stdout fans out to every WS client; each WS message is
// written to pi.stdin verbatim. Pi exit → process.exit(1) so systemd restarts.

import { spawn } from "node:child_process";

const PI_BIN = process.env.PI_BIN ?? "pi";
const PI_GATE = process.env.PI_MOBILE_GATE;
const PORT = Number(process.env.PI_MOBILE_PORT ?? 8341);
const HOST = process.env.PI_MOBILE_HOST ?? "127.0.0.1";

const piArgs = ["--mode", "rpc"];
if (PI_GATE) piArgs.push("-e", PI_GATE);

const pi = spawn(PI_BIN, piArgs, {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, PI_TELEMETRY: "0" },
});

pi.on("exit", (code, signal) => {
  console.error(`[pi-mobile] pi exited code=${code} signal=${signal}`);
  process.exit(1);
});

pi.on("error", (err) => {
  console.error(`[pi-mobile] pi spawn error:`, err);
  process.exit(1);
});

type Client = { send: (data: string) => void };
const clients = new Set<Client>();

let buf = "";
pi.stdout.on("data", (chunk: Buffer) => {
  buf += chunk.toString("utf8");
  let nl: number;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).replace(/\r$/, "");
    buf = buf.slice(nl + 1);
    if (line.length === 0) continue;
    for (const c of clients) c.send(line);
  }
});

const server = Bun.serve<Client>({
  hostname: HOST,
  port: PORT,
  fetch(req, srv) {
    const upgraded = srv.upgrade(req, { data: { send: () => {} } as Client });
    if (upgraded) return undefined;
    return new Response("WebSocket only\n", {
      status: 426,
      headers: { Connection: "Upgrade", Upgrade: "websocket" },
    });
  },
  websocket: {
    open(ws) {
      ws.data.send = (data: string) => ws.send(data);
      clients.add(ws.data);
    },
    close(ws) {
      clients.delete(ws.data);
    },
    message(_ws, raw) {
      const text = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8");
      pi.stdin.write(text.replace(/\r?\n?$/, "") + "\n");
    },
  },
});

const shutdown = (sig: NodeJS.Signals) => {
  console.error(`[pi-mobile] received ${sig}, shutting down`);
  try { server.stop(); } catch {}
  pi.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.error(`[pi-mobile] listening on ${server.hostname}:${server.port} (pi pid=${pi.pid})`);
