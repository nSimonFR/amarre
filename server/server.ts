// Generic WS ↔ stdin/stdout proxy. Loads an agent adapter at startup based
// on AMARRE_AGENT (default "pi") and pipes JSONL bidirectionally between
// every connected WebSocket client and the spawned agent. Agent crash →
// process.exit(1) so systemd restarts the unit.
//
// Multi-client semantics: events from the agent fan out to every client;
// commands from any client are written verbatim to the agent's stdin in
// arrival order. See docs/PROTOCOL.md for the wire-format spec.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter } from "./adapter.ts";

const AGENT = process.env.AMARRE_AGENT ?? "pi";
const AGENT_PATH = process.env.AMARRE_AGENT_PATH;
const PORT = Number(process.env.AMARRE_PORT ?? 8341);
const HOST = process.env.AMARRE_HOST ?? "127.0.0.1";

const HERE = dirname(fileURLToPath(import.meta.url));
const adapterUrl = AGENT_PATH ?? resolve(HERE, "..", "agents", AGENT, "adapter.ts");

const mod = (await import(adapterUrl)) as { default: AgentAdapter };
const adapter = mod.default;
const child = adapter.spawn();

child.on("exit", (code, signal) => {
  console.error(`[amarre] agent ${adapter.name} exited code=${code} signal=${signal}`);
  process.exit(1);
});
child.on("error", (err) => {
  console.error(`[amarre] agent ${adapter.name} spawn error:`, err);
  process.exit(1);
});

type Client = { send: (data: string) => void };
const clients = new Set<Client>();

let buf = "";
child.stdout.on("data", (chunk: Buffer) => {
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
      child.stdin.write(text.replace(/\r?\n?$/, "") + "\n");
    },
  },
});

const shutdown = (sig: NodeJS.Signals) => {
  console.error(`[amarre] received ${sig}, shutting down`);
  try { server.stop(); } catch {}
  child.kill("SIGTERM");
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.error(`[amarre] agent=${adapter.name} listening on ${server.hostname}:${server.port} (pid=${child.pid})`);
