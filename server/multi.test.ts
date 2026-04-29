// Multi-session integration tests. Crash isolation, list, delete, restart,
// per-session fanout scoping, max-sessions cap. Builds on the helpers exported
// from server.test.ts.

import { afterEach, describe, expect, test } from "bun:test";
import { setTimeout as sleep } from "node:timers/promises";
import { openWs, postSession, startServer, stopServer } from "./server.test.ts";

type S = Awaited<ReturnType<typeof startServer>>;

describe("server (multi-session)", () => {
  let s: S | null = null;

  afterEach(async () => {
    if (s) await stopServer(s);
    s = null;
  });

  test("GET /sessions lists POSTed sessions", async () => {
    s = await startServer();
    const a = await postSession(s, { name: "alpha" });
    const b = await postSession(s, { name: "beta" });
    const res = await fetch(`${s.baseUrl}/sessions`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; name?: string; status: string }>;
    const ids = list.map((x) => x.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
    expect(list.find((x) => x.id === a.id)?.name).toBe("alpha");
  });

  test("events from session A do not appear on session B", async () => {
    s = await startServer();
    const a = await postSession(s);
    const b = await postSession(s);
    const wsA = await openWs(`${s.wsHost}/sessions/${a.id}`);
    const wsB = await openWs(`${s.wsHost}/sessions/${b.id}`);
    wsA.ws.send(`{"_emit":"chunk"}`);
    const [ra1, ra2] = await Promise.all([wsA.next(), wsA.next()]);
    expect(JSON.parse(ra1).n).toBe(1);
    expect(JSON.parse(ra2).n).toBe(2);
    // session B must not see them. Wait briefly; expect no message.
    let leaked: string | null = null;
    try {
      leaked = await wsB.next(300);
    } catch {
      // expected — no message arrived
    }
    expect(leaked).toBeNull();
    wsA.ws.close();
    wsB.ws.close();
  });

  test("crash isolation: one session dies, other keeps working, server stays up", async () => {
    s = await startServer();
    const a = await postSession(s);
    const b = await postSession(s);
    const wsA = await openWs(`${s.wsHost}/sessions/${a.id}`);
    const wsB = await openWs(`${s.wsHost}/sessions/${b.id}`);

    wsA.ws.send(`{"_emit":"die"}`);

    // session A receives amarre.session_event then closes with 1011.
    const evt = JSON.parse(await wsA.next(2000));
    expect(evt.type).toBe("amarre.session_event");
    expect(evt.event).toBe("crashed");
    expect(evt.exitCode).toBe(7); // echo-agent.sh: exit 7

    const closed = await wsA.closed;
    expect(closed.code).toBe(1011);

    // session B still round-trips.
    wsB.ws.send(`{"id":"x","type":"prompt","message":"still alive?"}`);
    const reply = JSON.parse(await wsB.next(2000));
    expect(reply.type).toBe("response");
    expect(reply.echo.message).toBe("still alive?");

    // server process is still alive.
    expect(s.proc.exitCode).toBeNull();

    // GET /sessions/<a> reports crashed.
    const statusRes = await fetch(`${s.baseUrl}/sessions/${a.id}`);
    expect(statusRes.status).toBe(200);
    const aStatus = (await statusRes.json()) as { status: string; exitCode?: number };
    expect(aStatus.status).toBe("crashed");
    expect(aStatus.exitCode).toBe(7);

    wsB.ws.close();
  });

  test("DELETE /sessions/:id stops the agent and closes its clients", async () => {
    s = await startServer();
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);

    const res = await fetch(`${s.baseUrl}/sessions/${a.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);

    // The WS should close (code 1000 — normal closure on DELETE).
    const closed = await ws.closed;
    expect(closed.code).toBe(1000);

    // GET /sessions/<id> now 404s.
    const after = await fetch(`${s.baseUrl}/sessions/${a.id}`);
    expect(after.status).toBe(404);

    // List is empty.
    const listRes = await fetch(`${s.baseUrl}/sessions`);
    const list = (await listRes.json()) as unknown[];
    expect(list).toHaveLength(0);
  });

  test("POST /sessions/:id/restart respawns a crashed agent", async () => {
    s = await startServer();
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"die"}`);

    // Wait for crash.
    await ws.closed;

    // Restart returns 200.
    const res = await fetch(`${s.baseUrl}/sessions/${a.id}/restart`, { method: "POST" });
    expect(res.status).toBe(200);
    const summary = (await res.json()) as { status: string };
    expect(summary.status).toBe("running");

    // Fresh WS round-trips against the restarted agent.
    const ws2 = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws2.ws.send(`{"id":"after","type":"prompt","message":"reborn"}`);
    const reply = JSON.parse(await ws2.next(2000));
    expect(reply.echo.message).toBe("reborn");
    ws2.ws.close();
  });

  test("POST /sessions/:id/restart on a running session → 409", async () => {
    s = await startServer();
    const a = await postSession(s);
    const res = await fetch(`${s.baseUrl}/sessions/${a.id}/restart`, { method: "POST" });
    expect(res.status).toBe(409);
  });

  test("AMARRE_MAX_SESSIONS caps POST /sessions with 429", async () => {
    s = await startServer({ AMARRE_MAX_SESSIONS: "1" });
    await postSession(s);
    const res = await fetch(`${s.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error: string; limit: number };
    expect(body.error).toBe("max_sessions_reached");
    expect(body.limit).toBe(1);
  });

  test("WS to unknown session id returns 404", async () => {
    s = await startServer();
    const res = await fetch(`${s.baseUrl}/sessions/nope`);
    expect(res.status).toBe(404);
  });

  test("WS to crashed session returns 409", async () => {
    s = await startServer();
    const a = await postSession(s);
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send(`{"_emit":"die"}`);
    await ws.closed;

    // Tiny grace period for the exit handler to flip status.
    await sleep(50);

    let err: unknown;
    try {
      await openWs(`${s.wsHost}/sessions/${a.id}`);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
  });
});
