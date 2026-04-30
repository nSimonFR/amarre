// Generic WS ↔ stdin/stdout proxy with multi-session, multi-instance support.
// Manages N concurrent agent processes, each tied to one named "instance"
// (e.g. `claude_personal`, `claude_work`, `pi`). REST control plane
// (GET/POST /sessions, GET/DELETE /sessions/:id, POST /sessions/:id/restart,
// GET/POST /push/tokens, DELETE /push/tokens/<token>) alongside a per-session
// WebSocket data plane at /sessions/:id. See docs/PROTOCOL.md (v2.x). One
// agent crash isolates to its session and broadcasts amarre.session_event to
// that session's clients only.
//
// Instances are configured via AMARRE_INSTANCES_JSON. Backward-compat: if the
// var is unset, a single instance `default` is synthesized from the legacy
// AMARRE_AGENT / AMARRE_AGENT_PATH env vars. Existing callers that POST
// /sessions without `instanceId` always land on `default`.
//
// Push notifications (§13) are optional: the server fires a push on
// extension_ui_request grace timeouts and on session crashes, suppressing the
// awaiting_input push when a client of that session is actively sending
// Layer 4 messages.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter, AgentChild, SpawnOpts } from "./adapter.ts";
import { createPushService, type PushService } from "./push.ts";

const PORT = Number(process.env.AMARRE_PORT ?? 8341);
const HOST = process.env.AMARRE_HOST ?? "127.0.0.1";
const MAX_SESSIONS = Number(process.env.AMARRE_MAX_SESSIONS ?? 8);
const PUSH_TOKENS_PATH = process.env.AMARRE_PUSH_TOKENS_PATH ?? null;
const PUSH_GRACE_MS = Number(process.env.AMARRE_PUSH_GRACE_MS ?? 15_000);
const PUSH_EXPO_URL = process.env.AMARRE_PUSH_EXPO_URL;

const HERE = dirname(fileURLToPath(import.meta.url));

interface InstanceConfig {
  readonly id: string;
  readonly agent: string;
  readonly agentPath?: string;
  readonly env: Readonly<Record<string, string>>;
}

interface InstanceRecord {
  readonly config: InstanceConfig;
  readonly adapter: AgentAdapter;
}

function parseInstanceConfigs(): InstanceConfig[] {
  const raw = process.env.AMARRE_INSTANCES_JSON;
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error(`AMARRE_INSTANCES_JSON: invalid JSON (${(e as Error).message})`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("AMARRE_INSTANCES_JSON: must be a non-empty array");
    }
    return parsed.map((item, i): InstanceConfig => {
      if (!item || typeof item !== "object") {
        throw new Error(`AMARRE_INSTANCES_JSON[${i}]: not an object`);
      }
      const r = item as Record<string, unknown>;
      const id = typeof r.id === "string" && r.id.length > 0 ? r.id : null;
      const agent = typeof r.agent === "string" && r.agent.length > 0 ? r.agent : null;
      if (!id) throw new Error(`AMARRE_INSTANCES_JSON[${i}]: missing 'id'`);
      if (!agent) throw new Error(`AMARRE_INSTANCES_JSON[${i}]: missing 'agent'`);
      const env: Record<string, string> = {};
      if (r.env && typeof r.env === "object" && !Array.isArray(r.env)) {
        for (const [k, v] of Object.entries(r.env as Record<string, unknown>)) {
          if (typeof v === "string") env[k] = v;
        }
      }
      const agentPath = typeof r.agentPath === "string" ? r.agentPath : undefined;
      return agentPath ? { id, agent, agentPath, env } : { id, agent, env };
    });
  }
  // Legacy single-instance fallback.
  const agent = process.env.AMARRE_AGENT ?? "pi";
  const agentPath = process.env.AMARRE_AGENT_PATH;
  return [agentPath ? { id: "default", agent, agentPath, env: {} } : { id: "default", agent, env: {} }];
}

async function loadInstances(configs: InstanceConfig[]): Promise<Map<string, InstanceRecord>> {
  const out = new Map<string, InstanceRecord>();
  for (const cfg of configs) {
    if (out.has(cfg.id)) {
      throw new Error(`AMARRE_INSTANCES_JSON: duplicate instance id '${cfg.id}'`);
    }
    const url = cfg.agentPath ?? resolve(HERE, "..", "agents", cfg.agent, "adapter.ts");
    const mod = (await import(url)) as { default: AgentAdapter };
    if (!mod.default || typeof mod.default.spawn !== "function") {
      throw new Error(`instance '${cfg.id}': adapter at ${url} has no default export with spawn()`);
    }
    out.set(cfg.id, { config: cfg, adapter: mod.default });
  }
  return out;
}

const instanceConfigs = parseInstanceConfigs();
const instances = await loadInstances(instanceConfigs);
const DEFAULT_INSTANCE_ID = instances.has("default")
  ? "default"
  : instanceConfigs[0].id;

const push: PushService = await createPushService({
  storePath: PUSH_TOKENS_PATH,
  expoPushUrl: PUSH_EXPO_URL,
});

type SessionStatus = "running" | "crashed" | "stopped";

type ClientData = {
  sessionId: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

interface SessionHandle {
  id: string;
  name?: string;
  instanceId: string;
  status: SessionStatus;
  child: AgentChild;
  clients: Set<ClientData>;
  buf: string;
  spawnedAt: number;
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  opts: SpawnOpts;
  // Push state (PROTOCOL §13). pendingPush keys are extension_ui_request ids
  // for which a grace-window timer is running; clearing the timer means the
  // request was answered in time. lastInboundMs is the wall-clock of the most
  // recent client→server WS message — used to suppress awaiting_input pushes
  // when a human is clearly at the keyboard.
  pendingPush: Map<string, ReturnType<typeof setTimeout>>;
  lastInboundMs: number;
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
  const inst = instances.get(h.instanceId);
  return {
    id: h.id,
    name: h.name,
    instanceId: h.instanceId,
    status: h.status,
    agent: inst ? inst.adapter.name : "unknown",
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
      maybeInspectAgentLine(h, line);
    }
  });
  h.child.on("exit", (code, signal) => {
    h.exitCode = code;
    h.exitSignal = signal;
    cancelAllPendingPush(h);
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
    // Crash push fires unconditionally (no grace, no client-active suppression):
    // a crash is terminal and the user always wants to know.
    if (push.enabled) {
      const body = signal
        ? `session ${h.id} killed by ${signal}`
        : `session ${h.id} exited code ${code ?? "?"}`;
      void push.send("crashed", body, {
        sessionId: h.id,
        sessionName: h.name ?? null,
      });
    }
  });
  h.child.on("error", (err) => {
    console.error(`[amarre] session ${h.id} child error:`, err);
  });
}

function mergeEnv(
  instanceEnv: Readonly<Record<string, string>>,
  sessionEnv?: Record<string, string>,
): Record<string, string> {
  return { ...instanceEnv, ...(sessionEnv ?? {}) };
}

function maybeInspectAgentLine(h: SessionHandle, line: string): void {
  if (!push.enabled) return;
  // Cheap pre-filter — skip the JSON.parse for lines that can't be the event
  // we care about. extension_ui_request payloads are always JSON objects.
  if (line.length < 20 || line[0] !== "{") return;
  if (!line.includes(`"extension_ui_request"`)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "extension_ui_request") return;
  const requestId = typeof obj.id === "string" ? obj.id : null;
  if (!requestId || h.pendingPush.has(requestId)) return;
  const method = typeof obj.method === "string" ? obj.method : "confirm";
  const title = typeof obj.title === "string" ? obj.title : "";
  const summary = title || (typeof obj.message === "string" ? obj.message.slice(0, 80) : method);
  const timer = setTimeout(() => {
    h.pendingPush.delete(requestId);
    // Active client suppression — if anyone hammered the WS in the last grace
    // window, assume they're rendering the request locally and skip the push.
    if (Date.now() - h.lastInboundMs < PUSH_GRACE_MS) return;
    void push
      .send("awaiting_input", `${method}: ${summary}`, {
        sessionId: h.id,
        sessionName: h.name ?? null,
        requestId,
        method,
      })
      .then((tokens) => {
        if (tokens === 0) return;
        const evt = JSON.stringify({
          type: "amarre.push_sent",
          trigger: "awaiting_input",
          tokens,
          requestId,
        });
        for (const c of h.clients) c.send(evt);
      });
  }, PUSH_GRACE_MS);
  h.pendingPush.set(requestId, timer);
}

function cancelPendingPushIfMatch(h: SessionHandle, line: string): void {
  if (!push.enabled || h.pendingPush.size === 0) return;
  if (line.length < 20 || line[0] !== "{") return;
  if (!line.includes(`"extension_ui_response"`)) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const obj = parsed as Record<string, unknown>;
  if (obj.type !== "extension_ui_response") return;
  const requestId = typeof obj.id === "string" ? obj.id : null;
  if (!requestId) return;
  const timer = h.pendingPush.get(requestId);
  if (timer) {
    clearTimeout(timer);
    h.pendingPush.delete(requestId);
  }
}

function cancelAllPendingPush(h: SessionHandle): void {
  for (const timer of h.pendingPush.values()) clearTimeout(timer);
  h.pendingPush.clear();
}

function spawnSession(
  inst: InstanceRecord,
  opts: SpawnOpts,
  name: string | undefined,
): SessionHandle {
  const id = newId();
  const mergedOpts: SpawnOpts = {
    ...opts,
    env: mergeEnv(inst.config.env, opts.env),
  };
  const child = inst.adapter.spawn(mergedOpts);
  const h: SessionHandle = {
    id,
    name,
    instanceId: inst.config.id,
    status: "running",
    child,
    clients: new Set(),
    buf: "",
    spawnedAt: Date.now(),
    opts: mergedOpts,
    pendingPush: new Map(),
    lastInboundMs: 0,
  };
  attachChild(h);
  sessions.set(id, h);
  console.error(
    `[amarre] spawned session ${id} (instance=${inst.config.id} agent=${inst.adapter.name} pid=${child.pid} total=${sessions.size})`,
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

  if (path === "/instances" && method === "GET") {
    return jsonResponse(
      [...instances.values()].map((r) => ({
        id: r.config.id,
        agent: r.adapter.name,
      })),
    );
  }

  if (path === "/sessions" && method === "GET") {
    return jsonResponse([...sessions.values()].map(summarize));
  }

  if (path === "/sessions" && method === "POST") {
    if (sessions.size >= MAX_SESSIONS) {
      return jsonResponse({ error: "max_sessions_reached", limit: MAX_SESSIONS }, 429);
    }
    const body = await readJsonBody(req);
    const requestedInstanceId =
      typeof body.instanceId === "string" ? body.instanceId : DEFAULT_INSTANCE_ID;
    const inst = instances.get(requestedInstanceId);
    if (!inst) {
      return jsonResponse(
        { error: "unknown_instance", instanceId: requestedInstanceId },
        404,
      );
    }
    const opts: SpawnOpts = {};
    if (typeof body.cwd === "string") opts.cwd = body.cwd;
    if (body.env && typeof body.env === "object" && !Array.isArray(body.env)) {
      opts.env = body.env as Record<string, string>;
    }
    const name = typeof body.name === "string" ? body.name : undefined;
    const h = spawnSession(inst, opts, name);
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
      const inst = instances.get(h.instanceId);
      if (!inst) return jsonResponse({ error: "instance_gone", instanceId: h.instanceId }, 410);
      h.status = "running";
      h.exitCode = undefined;
      h.exitSignal = undefined;
      h.buf = "";
      h.child = inst.adapter.spawn(h.opts);
      h.spawnedAt = Date.now();
      attachChild(h);
      return jsonResponse(summarize(h));
    }

    if (!sub && method === "GET") {
      return jsonResponse(summarize(h));
    }

    if (!sub && method === "DELETE") {
      h.status = "stopped";
      cancelAllPendingPush(h);
      try {
        h.child.kill("SIGTERM");
      } catch {}
      for (const c of h.clients) c.close(1000, "session deleted");
      h.clients.clear();
      sessions.delete(id);
      return new Response(null, { status: 204 });
    }
  }

  // Push-notification REST surface (PROTOCOL §13.2). All routes return 503
  // when the service is disabled (no AMARRE_PUSH_TOKENS_PATH or store unwritable).
  if (path === "/push/tokens") {
    if (!push.enabled) return jsonResponse({ error: "push_disabled" }, 503);
    if (method === "GET") return jsonResponse(push.list());
    if (method === "POST") {
      const body = await readJsonBody(req);
      const token = typeof body.token === "string" ? body.token : "";
      const deviceName = typeof body.deviceName === "string" ? body.deviceName : undefined;
      const platform =
        body.platform === "ios" || body.platform === "android" || body.platform === "web"
          ? body.platform
          : undefined;
      const wasKnown = push.list().some((t) => t.token === token);
      const entry = push.register(token, { deviceName, platform });
      if (!entry) return jsonResponse({ error: "invalid_token" }, 400);
      return jsonResponse(entry, wasKnown ? 200 : 201);
    }
  }
  const tokenMatch = path.match(/^\/push\/tokens\/(.+)$/);
  if (tokenMatch && method === "DELETE") {
    if (!push.enabled) return jsonResponse({ error: "push_disabled" }, 503);
    push.unregister(decodeURIComponent(tokenMatch[1]));
    return new Response(null, { status: 204 });
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
      h.lastInboundMs = Date.now();
      cancelPendingPushIfMatch(h, text.trim());
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

const summary = [...instances.values()].map((r) => `${r.config.id}=${r.adapter.name}`).join(", ");
console.error(
  `[amarre] instances=[${summary}] listening on ${server.hostname}:${server.port} ` +
    `(max_sessions=${MAX_SESSIONS}, push=${push.enabled ? `on tokens=${push.list().length}` : "off"})`,
);
