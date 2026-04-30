// Integration tests for the push trigger surface — boots the real amarre
// server, redirects its Expo Push URL at a local fake HTTP listener, and
// exercises the awaiting_input + crashed paths end-to-end.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { openWs, postSession, startServer, stopServer } from "./server.test.ts";

const VALID = "ExponentPushToken[abcdef0123456789ABCDEF]";

type FakeExpo = {
  server: Server;
  url: string;
  calls: Array<Array<Record<string, unknown>>>;
  respond: (status: number, body: unknown) => void;
};

function startFakeExpo(): Promise<FakeExpo> {
  // null means "synthesize a success ticket per request item". Tests can
  // override via .respond() to inject errors / non-200 status codes.
  let override: { status: number; body: unknown } | null = null;
  const calls: Array<Array<Record<string, unknown>>> = [];
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let chunks = "";
      req.on("data", (c) => (chunks += c));
      req.on("end", () => {
        try {
          const body = JSON.parse(chunks);
          const items = Array.isArray(body) ? body : [body];
          calls.push(items);
          if (override) {
            res.writeHead(override.status, { "content-type": "application/json" });
            res.end(JSON.stringify(override.body));
          } else {
            const payload = { data: items.map(() => ({ status: "ok", id: "x" })) };
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(payload));
          }
        } catch {
          res.writeHead(400);
          res.end("bad");
        }
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/send`,
        calls,
        respond: (status, body) => {
          override = { status, body };
        },
      });
    });
  });
}

function stopFakeExpo(f: FakeExpo): Promise<void> {
  return new Promise((resolve) => f.server.close(() => resolve()));
}

describe("server (push integration)", () => {
  let tmp = "";
  let fake: FakeExpo | null = null;
  let s: Awaited<ReturnType<typeof startServer>> | null = null;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "amarre-push-int-"));
    fake = await startFakeExpo();
  });

  afterEach(async () => {
    if (s) await stopServer(s);
    s = null;
    if (fake) await stopFakeExpo(fake);
    fake = null;
    if (tmp) await rm(tmp, { recursive: true, force: true });
    tmp = "";
  });

  async function bootServer(graceMs: number) {
    return startServer({
      AMARRE_PUSH_TOKENS_PATH: join(tmp, "tokens.json"),
      AMARRE_PUSH_GRACE_MS: String(graceMs),
      AMARRE_PUSH_EXPO_URL: fake!.url,
    });
  }

  async function registerToken(srv: Awaited<ReturnType<typeof startServer>>) {
    const res = await fetch(`${srv.baseUrl}/push/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: VALID, platform: "ios" }),
    });
    expect(res.status).toBe(201);
  }

  test("POST /push/tokens 503 when push disabled", async () => {
    // Boot without AMARRE_PUSH_TOKENS_PATH — server runs with push off.
    s = await startServer();
    const res = await fetch(`${s.baseUrl}/push/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: VALID }),
    });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("push_disabled");
  });

  test("POST /push/tokens registers, GET lists, DELETE removes", async () => {
    s = await bootServer(15000);
    const post = await fetch(`${s.baseUrl}/push/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: VALID, deviceName: "iPhone", platform: "ios" }),
    });
    expect(post.status).toBe(201);
    const reg = (await post.json()) as { token: string; platform: string };
    expect(reg.token).toBe(VALID);
    expect(reg.platform).toBe("ios");

    const post2 = await fetch(`${s.baseUrl}/push/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: VALID }),
    });
    expect(post2.status).toBe(200); // already known

    const get = await fetch(`${s.baseUrl}/push/tokens`);
    expect(get.status).toBe(200);
    const list = (await get.json()) as Array<{ token: string }>;
    expect(list.length).toBe(1);

    const del = await fetch(`${s.baseUrl}/push/tokens/${encodeURIComponent(VALID)}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(204);

    const get2 = await fetch(`${s.baseUrl}/push/tokens`);
    expect(((await get2.json()) as unknown[]).length).toBe(0);
  });

  test("POST /push/tokens 400 on malformed token", async () => {
    s = await bootServer(15000);
    const res = await fetch(`${s.baseUrl}/push/tokens`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "garbage" }),
    });
    expect(res.status).toBe(400);
  });

  test("awaiting_input fires push after grace + emits amarre.push_sent", async () => {
    s = await bootServer(200);
    await registerToken(s);
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"ui_req","reqId":"req-A"}`);
    // First message: the extension_ui_request echoed by the agent.
    const first = JSON.parse(await ws.next(3000));
    expect(first.type).toBe("extension_ui_request");
    expect(first.id).toBe("req-A");
    // Wait for grace + a small fudge for fetch round-trip.
    await sleep(600);
    expect(fake!.calls.length).toBe(1);
    const msg = fake!.calls[0][0];
    expect(msg.to).toBe(VALID);
    expect((msg.data as Record<string, unknown>).trigger).toBe("awaiting_input");
    expect((msg.data as Record<string, unknown>).requestId).toBe("req-A");
    expect((msg.data as Record<string, unknown>).sessionId).toBe(a.id);
    // amarre.push_sent broadcast on the session WS — should already be queued
    // by now since push.send resolved during the sleep.
    const second = JSON.parse(await ws.next(3000));
    expect(second.type).toBe("amarre.push_sent");
    expect(second.trigger).toBe("awaiting_input");
    expect(second.tokens).toBe(1);
    expect(second.requestId).toBe("req-A");
    ws.ws.close();
  });

  test("awaiting_input does NOT fire when extension_ui_response arrives in time", async () => {
    s = await bootServer(300);
    await registerToken(s);
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"ui_req","reqId":"req-B"}`);
    await ws.next(3000); // consume the request echo
    // Answer well before grace expires.
    await sleep(50);
    ws.ws.send(`{"type":"extension_ui_response","id":"req-B","confirmed":true}`);
    await ws.next(3000); // agent echoes the response back
    await sleep(400); // beyond grace
    expect(fake!.calls.length).toBe(0);
    ws.ws.close();
  });

  test("awaiting_input is suppressed when client is actively typing", async () => {
    s = await bootServer(300);
    await registerToken(s);
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"ui_req","reqId":"req-C"}`);
    await ws.next(3000); // consume request
    // Simulate user typing other commands during the grace window.
    await sleep(100);
    ws.ws.send(`{"type":"get_state","id":"1"}`);
    await ws.next(3000);
    await sleep(250); // past original grace
    expect(fake!.calls.length).toBe(0);
    ws.ws.close();
  });

  test("crashed fires push", async () => {
    s = await bootServer(15000);
    await registerToken(s);
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"die"}`);
    await ws.closed;
    // Crash push is fire-and-forget at exit; give the fetch a moment.
    await sleep(150);
    expect(fake!.calls.length).toBe(1);
    const msg = fake!.calls[0][0];
    expect((msg.data as Record<string, unknown>).trigger).toBe("crashed");
    expect((msg.data as Record<string, unknown>).sessionId).toBe(a.id);
  });

  test("DELETE /sessions/<id> cancels pending push timers", async () => {
    s = await bootServer(300);
    await registerToken(s);
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"ui_req","reqId":"req-D"}`);
    await ws.next(3000);
    await sleep(50);
    const del = await fetch(`${s.baseUrl}/sessions/${a.id}`, { method: "DELETE" });
    expect(del.status).toBe(204);
    await sleep(400); // way past grace
    expect(fake!.calls.length).toBe(0);
  });
});
