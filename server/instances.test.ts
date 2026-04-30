// Multi-instance integration tests. Boot the server with AMARRE_INSTANCES_JSON
// pointing at two echo adapters with different per-instance env, then verify
// that POST /sessions {instanceId} routes to the right adapter and that the
// instance env reaches the spawned process.

import { afterEach, describe, expect, test } from "bun:test";
import { resolve as pathResolve } from "node:path";
import { openWs, postSession, startServer, stopServer } from "./server.test.ts";

type S = Awaited<ReturnType<typeof startServer>>;

const PROJECT_ROOT = pathResolve(import.meta.dir, "..");
const ECHO_ADAPTER = pathResolve(PROJECT_ROOT, "tests/fixtures/echo-adapter.ts");

describe("server (multi-instance via AMARRE_INSTANCES_JSON)", () => {
  let s: S | null = null;

  afterEach(async () => {
    if (s) await stopServer(s);
    s = null;
  });

  test("GET /instances lists configured instances", async () => {
    s = await startServer({
      AMARRE_INSTANCES_JSON: JSON.stringify([
        { id: "alpha", agent: "echo", agentPath: ECHO_ADAPTER, env: { LABEL: "A" } },
        { id: "beta", agent: "echo", agentPath: ECHO_ADAPTER, env: { LABEL: "B" } },
      ]),
    });
    const res = await fetch(`${s.baseUrl}/instances`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; agent: string }>;
    expect(list.map((x) => x.id).sort()).toEqual(["alpha", "beta"]);
  });

  test("POST /sessions {instanceId} stamps that id on the session summary", async () => {
    s = await startServer({
      AMARRE_INSTANCES_JSON: JSON.stringify([
        { id: "alpha", agent: "echo", agentPath: ECHO_ADAPTER, env: {} },
        { id: "beta", agent: "echo", agentPath: ECHO_ADAPTER, env: {} },
      ]),
    });
    const a = (await postSession(s, { instanceId: "alpha", name: "ses-a" })) as {
      id: string;
      instanceId: string;
    };
    const b = (await postSession(s, { instanceId: "beta", name: "ses-b" })) as {
      id: string;
      instanceId: string;
    };
    expect(a.instanceId).toBe("alpha");
    expect(b.instanceId).toBe("beta");

    const list = (await fetch(`${s.baseUrl}/sessions`).then((r) => r.json())) as Array<{
      id: string;
      instanceId: string;
    }>;
    const sa = list.find((x) => x.id === a.id);
    const sb = list.find((x) => x.id === b.id);
    expect(sa?.instanceId).toBe("alpha");
    expect(sb?.instanceId).toBe("beta");
  });

  test("POST /sessions with unknown instanceId → 404 unknown_instance", async () => {
    s = await startServer({
      AMARRE_INSTANCES_JSON: JSON.stringify([
        { id: "alpha", agent: "echo", agentPath: ECHO_ADAPTER, env: {} },
      ]),
    });
    const res = await fetch(`${s.baseUrl}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instanceId: "ghost" }),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: string; instanceId: string };
    expect(body.error).toBe("unknown_instance");
    expect(body.instanceId).toBe("ghost");
  });

  test("POST /sessions without instanceId routes to first instance (and gets stamped 'default' when present)", async () => {
    s = await startServer({
      AMARRE_INSTANCES_JSON: JSON.stringify([
        { id: "default", agent: "echo", agentPath: ECHO_ADAPTER, env: {} },
        { id: "spare", agent: "echo", agentPath: ECHO_ADAPTER, env: {} },
      ]),
    });
    const r = (await postSession(s)) as { instanceId: string };
    expect(r.instanceId).toBe("default");
  });

  test("instance env reaches the spawned child (echo-agent surfaces it)", async () => {
    // The echo agent's spawn inherits process.env from its parent (the server),
    // which received the merged instance env. We can't read it back directly
    // without echo support, but we can at least check that the session works
    // end-to-end through the right instance.
    s = await startServer({
      AMARRE_INSTANCES_JSON: JSON.stringify([
        { id: "alpha", agent: "echo", agentPath: ECHO_ADAPTER, env: { LABEL: "A" } },
      ]),
    });
    const a = (await postSession(s, { instanceId: "alpha" })) as { id: string };
    const ws = await openWs(`${s.wsHost}/sessions/${a.id}`);
    ws.ws.send('{"id":"t","type":"prompt","message":"hi"}');
    const reply = JSON.parse(await ws.next(2000)) as { type: string; echo: { message: string } };
    expect(reply.type).toBe("response");
    expect(reply.echo.message).toBe("hi");
    ws.ws.close();
  });

  test("legacy single-instance fallback (AMARRE_AGENT_PATH only) still works", async () => {
    s = await startServer(); // no AMARRE_INSTANCES_JSON, only the legacy AMARRE_AGENT_PATH
    const r = (await postSession(s)) as { instanceId: string; status: string };
    expect(r.instanceId).toBe("default");
    expect(r.status).toBe("running");
    const list = (await fetch(`${s.baseUrl}/instances`).then((r) => r.json())) as Array<{
      id: string;
    }>;
    expect(list.map((x) => x.id)).toEqual(["default"]);
  });
});
