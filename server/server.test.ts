// Integration tests for the per-session WS proxy. Uses the test-only echo
// adapter (tests/fixtures/echo-adapter.ts + echo-agent.sh) so we don't depend
// on real `pi`. Crash-isolation, list, delete, restart and per-session
// permission-flow tests live in server/multi.test.ts.

import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createConnection } from "node:net";
import { createServer } from "node:net";
import { WebSocket } from "ws";

const PROJECT_ROOT = pathResolve(import.meta.dir, "..");
const SERVER_TS = pathResolve(PROJECT_ROOT, "server/server.ts");
const ECHO_ADAPTER = pathResolve(PROJECT_ROOT, "tests/fixtures/echo-adapter.ts");

type StartedServer = {
  proc: ChildProcess;
  port: number;
  baseUrl: string; // http://127.0.0.1:<port>
  wsHost: string; // ws://127.0.0.1:<port>
};

function findFreePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForPort(port: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const sock = createConnection({ host: "127.0.0.1", port }, () => {
        sock.end();
        resolve(true);
      });
      sock.on("error", () => resolve(false));
    });
    if (ok) return;
    await sleep(50);
  }
  throw new Error(`port ${port} did not open within ${timeoutMs}ms`);
}

export async function startServer(extraEnv: Record<string, string> = {}): Promise<StartedServer> {
  const port = await findFreePort();
  const proc = spawn(process.execPath, ["run", SERVER_TS], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      AMARRE_AGENT_PATH: ECHO_ADAPTER,
      AMARRE_PORT: String(port),
      AMARRE_HOST: "127.0.0.1",
      ...extraEnv,
    },
  });
  proc.stdout?.on("data", (d) => process.stderr.write(`[server.stdout] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[server.stderr] ${d}`));
  await waitForPort(port);
  return {
    proc,
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    wsHost: `ws://127.0.0.1:${port}`,
  };
}

export async function stopServer(s: StartedServer): Promise<number | null> {
  if (s.proc.exitCode !== null) return s.proc.exitCode;
  return await new Promise<number | null>((resolve) => {
    s.proc.once("exit", (code) => resolve(code));
    s.proc.kill("SIGTERM");
    setTimeout(() => {
      if (s.proc.exitCode === null) s.proc.kill("SIGKILL");
    }, 2000).unref();
  });
}

export type Reader = {
  ws: WebSocket;
  next(timeoutMs?: number): Promise<string>;
  closed: Promise<{ code: number; reason: string }>;
};

export async function openWs(url: string): Promise<Reader> {
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const w = new WebSocket(url);
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const queue: string[] = [];
  const waiters: Array<(value: string) => void> = [];
  ws.on("message", (data) => {
    const text = typeof data === "string" ? data : (data as Buffer).toString("utf8");
    const w = waiters.shift();
    if (w) w(text);
    else queue.push(text);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.once("close", (code, reason) => resolve({ code, reason: reason.toString() }));
  });
  return {
    ws,
    closed,
    next(timeoutMs = 2000) {
      return new Promise<string>((resolve, reject) => {
        const queued = queue.shift();
        if (queued !== undefined) {
          resolve(queued);
          return;
        }
        const timer = setTimeout(() => {
          const i = waiters.indexOf(resolve);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error(`no ws message within ${timeoutMs}ms`));
        }, timeoutMs);
        waiters.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
  };
}

export async function postSession(
  s: StartedServer,
  body: Record<string, unknown> = {},
): Promise<{ id: string; status: string }> {
  const res = await fetch(`${s.baseUrl}/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`POST /sessions → ${res.status}: ${await res.text()}`);
  return (await res.json()) as { id: string; status: string };
}

describe("server (single session)", () => {
  let s: StartedServer | null = null;

  afterEach(async () => {
    if (s) await stopServer(s);
    s = null;
  });

  test("round-trips a single command", async () => {
    s = await startServer();
    const { id } = await postSession(s);
    const r = await openWs(`${s.wsHost}/sessions/${id}`);
    r.ws.send(`{"id":"1","type":"prompt","message":"hi"}`);
    const parsed = JSON.parse(await r.next());
    expect(parsed.type).toBe("response");
    expect(parsed.success).toBe(true);
    expect(parsed.echo.id).toBe("1");
    expect(parsed.echo.message).toBe("hi");
    r.ws.close();
  });

  test("fans out events to multiple clients on the same session", async () => {
    s = await startServer();
    const { id } = await postSession(s);
    const a = await openWs(`${s.wsHost}/sessions/${id}`);
    const b = await openWs(`${s.wsHost}/sessions/${id}`);
    a.ws.send(`{"_emit":"chunk"}`);
    const [ra1, ra2, rb1, rb2] = await Promise.all([a.next(), a.next(), b.next(), b.next()]);
    expect(JSON.parse(ra1).n).toBe(1);
    expect(JSON.parse(ra2).n).toBe(2);
    expect(JSON.parse(rb1).n).toBe(1);
    expect(JSON.parse(rb2).n).toBe(2);
    a.ws.close();
    b.ws.close();
  });

  test("splits multi-line stdout chunks into separate ws messages", async () => {
    s = await startServer();
    const { id } = await postSession(s);
    const r = await openWs(`${s.wsHost}/sessions/${id}`);
    r.ws.send(`{"_emit":"chunk"}`);
    const m1 = JSON.parse(await r.next());
    const m2 = JSON.parse(await r.next());
    expect(m1.n).toBe(1);
    expect(m2.n).toBe(2);
    r.ws.close();
  });

  test("buffers a partial stdout line until the newline arrives", async () => {
    s = await startServer();
    const { id } = await postSession(s);
    const r = await openWs(`${s.wsHost}/sessions/${id}`);
    r.ws.send(`{"_emit":"split"}`);
    const parsed = JSON.parse(await r.next(3000));
    expect(parsed.type).toBe("split");
    expect(parsed.part).toBe("one");
    r.ws.close();
  });

  test("rejects WS at / with 426", async () => {
    s = await startServer();
    const res = await fetch(`${s.baseUrl}/`);
    expect(res.status).toBe(426);
  });

  test("rejects WS for an unknown session id with 404", async () => {
    s = await startServer();
    let err: unknown;
    try {
      await openWs(`${s.wsHost}/sessions/does-not-exist`);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });
});
