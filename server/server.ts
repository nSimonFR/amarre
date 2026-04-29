// Generic WS ↔ stdin/stdout proxy with multi-session support. Manages N
// concurrent agent processes, each addressable by session id. REST control
// plane (GET/POST /sessions, GET/DELETE /sessions/:id, POST /sessions/:id/restart)
// alongside a per-session WebSocket data plane at /sessions/:id. See
// docs/PROTOCOL.md (v2.0.0). One agent crash isolates to its session and
// broadcasts amarre.session_event to that session's clients only.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter, AgentChild, SpawnOpts } from "./adapter.ts";

const AGENT = process.env.AMARRE_AGENT ?? "pi";
const AGENT_PATH = process.env.AMARRE_AGENT_PATH;
const PORT = Number(process.env.AMARRE_PORT ?? 8341);
const HOST = process.env.AMARRE_HOST ?? "127.0.0.1";
const MAX_SESSIONS = Number(process.env.AMARRE_MAX_SESSIONS ?? 8);

const HERE = dirname(fileURLToPath(import.meta.url));
const adapterUrl = AGENT_PATH ?? resolve(HERE, "..", "agents", AGENT, "adapter.ts");
const mod = (await import(adapterUrl)) as { default: AgentAdapter };
const adapter = mod.default;

type SessionStatus = "running" | "crashed" | "stopped";

type ClientData = {
  sessionId: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

interface SessionHandle {
  id: string;
  name?: string;
  status: SessionStatus;
  child: AgentChild;
  clients: Set<ClientData>;
  buf: string;
  spawnedAt: number;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  opts: SpawnOpts;
}

const sessions = new Map<string, SessionHandle>();

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function summarize(h: SessionHandle) {
  return {
    id: h.id,
    name: h.name,
    status: h.status,
    agent: adapter.name,
    spawnedAt: h.spawnedAt,
    clients: h.clients.size,
    ...(h.exitCode !== undefined && h.exitCode !== null ? { exitCode: h.exitCode } : {}),
    ...(h.exitSignal ? { signal: h.exitSignal } : {}),
  };
}

function attachChild(h: SessionHandle): void {
  h.child.stdout.on("data", (chunk: Buffer) => {
    h.buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = h.buf.indexOf("\n")) !== -1) {
      const line = h.buf.slice(0, nl).replace(/\r$/, "");
      h.buf = h.buf.slice(nl + 1);
      if (line.length === 0) continue;
      for (const c of h.clients) c.send(line);
    }
  });
  h.child.on("exit", (code, signal) => {
    h.exitCode = code;
    h.exitSignal = signal;
    if (h.status === "stopped") return; // explicit DELETE — don't broadcast
    h.status = "crashed";
    const evt = JSON.stringify({
      type: "amarre.session_event",
      event: "crashed",
      exitCode: code,
      signal,
    });
    for (const c of h.clients) {
      c.send(evt);
      c.close(1011, "agent crashed");
    }
    h.clients.clear();
    console.error(`[amarre] session ${h.id} crashed code=${code} signal=${signal}`);
  });
  h.child.on("error", (err) => {
    console.error(`[amarre] session ${h.id} child error:`, err);
  });
}

function spawnSession(opts: SpawnOpts, name?: string): SessionHandle {
  const id = newId();
  const child = adapter.spawn(opts);
  const h: SessionHandle = {
    id,
    name,
    status: "running",
    child,
    clients: new Set(),
    buf: "",
    spawnedAt: Date.now(),
    opts,
  };
  attachChild(h);
  sessions.set(id, h);
  console.error(
    `[amarre] spawned session ${id} (agent=${adapter.name}, pid=${child.pid}, total=${sessions.size})`,
  );
  return h;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await req.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function handleHttp(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === "/sessions" && method === "GET") {
    return jsonResponse([...sessions.values()].map(summarize));
  }

  if (path === "/sessions" && method === "POST") {
    if (sessions.size >= MAX_SESSIONS) {
      return jsonResponse({ error: "max_sessions_reached", limit: MAX_SESSIONS }, 429);
    }
    const body = await readJsonBody(req);
    const opts: SpawnOpts = {};
    if (typeof body.cwd === "string") opts.cwd = body.cwd;
    if (body.env && typeof body.env === "object" && !Array.isArray(body.env)) {
      opts.env = body.env as Record<string, string>;
    }
    const name = typeof body.name === "string" ? body.name : undefined;
    const h = spawnSession(opts, name);
    return jsonResponse(summarize(h), 201);
  }

  const m = path.match(/^\/sessions\/([^/]+)(?:\/(restart))?$/);
  if (m) {
    const id = m[1];
    const sub = m[2];
    const h = sessions.get(id);
    if (!h) return jsonResponse({ error: "not_found" }, 404);

    if (sub === "restart" && method === "POST") {
      if (h.status === "running") return jsonResponse({ error: "already_running" }, 409);
      h.status = "running";
      h.exitCode = undefined;
      h.exitSignal = undefined;
      h.buf = "";
      h.child = adapter.spawn(h.opts);
      h.spawnedAt = Date.now();
      attachChild(h);
      return jsonResponse(summarize(h));
    }

    if (!sub && method === "GET") {
      return jsonResponse(summarize(h));
    }

    if (!sub && method === "DELETE") {
      h.status = "stopped";
      try {
        h.child.kill("SIGTERM");
      } catch {}
      for (const c of h.clients) c.close(1000, "session deleted");
      h.clients.clear();
      sessions.delete(id);
      return new Response(null, { status: 204 });
    }
  }

  if (path === "/") {
    return new Response("Use /sessions/<id>; see docs/PROTOCOL.md\n", {
      status: 426,
      headers: { Connection: "Upgrade", Upgrade: "websocket" },
    });
  }

  return new Response("Not found\n", { status: 404 });
}

const server = Bun.serve<ClientData>({
  hostname: HOST,
  port: PORT,
  fetch(req, srv) {
    const url = new URL(req.url);
    const wsMatch = url.pathname.match(/^\/sessions\/([^/]+)$/);
    if (wsMatch && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const id = wsMatch[1];
      const h = sessions.get(id);
      if (!h) return new Response("Session not found\n", { status: 404 });
      if (h.status !== "running") {
        return new Response(`Session ${h.status}; restart it first\n`, { status: 409 });
      }
      const upgraded = srv.upgrade(req, {
        data: { sessionId: id, send: () => {}, close: () => {} } satisfies ClientData,
      });
      if (upgraded) return undefined;
      return new Response("Upgrade failed\n", { status: 500 });
    }
    return handleHttp(req);
  },
  websocket: {
    open(ws) {
      const h = sessions.get(ws.data.sessionId);
      if (!h) {
        ws.close(1011, "session vanished");
        return;
      }
      ws.data.send = (data: string) => ws.send(data);
      ws.data.close = (code?: number, reason?: string) => ws.close(code, reason);
      h.clients.add(ws.data);
    },
    close(ws) {
      const h = sessions.get(ws.data.sessionId);
      if (h) h.clients.delete(ws.data);
    },
    message(ws, raw) {
      const h = sessions.get(ws.data.sessionId);
      if (!h || h.status !== "running") return;
      const text = typeof raw === "string" ? raw : Buffer.from(raw as ArrayBuffer).toString("utf8");
      h.child.stdin.write(text.replace(/\r?\n?$/, "") + "\n");
    },
  },
});

const shutdown = (sig: NodeJS.Signals) => {
  console.error(`[amarre] received ${sig}, shutting down`);
  try {
    server.stop();
  } catch {}
  for (const h of sessions.values()) {
    h.status = "stopped";
    try {
      h.child.kill("SIGTERM");
    } catch {}
  }
  setTimeout(() => process.exit(0), 1500).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.error(
  `[amarre] agent=${adapter.name} listening on ${server.hostname}:${server.port} (max_sessions=${MAX_SESSIONS})`,
);
