// Unit tests for the push-notification token store + Expo dispatcher.
// All HTTP is stubbed via an injected fetchImpl — no real Expo calls.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createPushService, isExpoPushToken } from "./push.ts";

let tmp = "";

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "amarre-push-"));
});

afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = "";
});

const VALID = "ExponentPushToken[abcdef0123456789ABCDEF]";
const VALID_2 = "ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]";

function okFetch(): { calls: Array<{ url: string; body: unknown }>; impl: typeof fetch } {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url.toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url: u, body });
    const data = Array.isArray(body) ? body.map(() => ({ status: "ok" as const, id: "x" })) : [];
    return new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

describe("isExpoPushToken", () => {
  test("accepts ExponentPushToken[…]", () => expect(isExpoPushToken(VALID)).toBe(true));
  test("accepts ExpoPushToken[…]", () =>
    expect(isExpoPushToken("ExpoPushToken[abc]")).toBe(true));
  test("rejects raw FCM token", () =>
    expect(isExpoPushToken("dGVzdC1mY20tdG9rZW4=")).toBe(false));
  test("rejects unterminated bracket", () =>
    expect(isExpoPushToken("ExponentPushToken[abc")).toBe(false));
  test("rejects empty string", () => expect(isExpoPushToken("")).toBe(false));
  test("rejects non-string", () => expect(isExpoPushToken(42)).toBe(false));
  test("rejects oversize", () =>
    expect(isExpoPushToken(`ExponentPushToken[${"x".repeat(300)}]`)).toBe(false));
});

describe("createPushService — disabled mode", () => {
  test("no storePath => disabled, all ops no-op", async () => {
    const svc = await createPushService({ storePath: null, log: () => {} });
    expect(svc.enabled).toBe(false);
    expect(svc.register(VALID, {})).toBeNull();
    expect(svc.list()).toEqual([]);
    expect(await svc.send("crashed", "x", {})).toBe(0);
  });
});

describe("createPushService — enabled mode", () => {
  test("register rejects malformed token", async () => {
    const svc = await createPushService({
      storePath: join(tmp, "tokens.json"),
      log: () => {},
    });
    expect(svc.register("garbage", {})).toBeNull();
    expect(svc.list().length).toBe(0);
  });

  test("register persists + dedupes idempotently", async () => {
    const path = join(tmp, "tokens.json");
    const svc = await createPushService({ storePath: path, log: () => {} });
    const first = svc.register(VALID, { platform: "ios", deviceName: "iPhone" });
    expect(first?.token).toBe(VALID);
    expect(first?.deviceName).toBe("iPhone");
    expect(first?.platform).toBe("ios");
    const second = svc.register(VALID, { platform: "android" });
    expect(second?.platform).toBe("ios"); // first-wins, idempotent
    expect(svc.list().length).toBe(1);
    // give async fs.write a tick
    await sleep(50);
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBe(1);
    expect(raw[0].token).toBe(VALID);
  });

  test("register truncates deviceName to 64 chars", async () => {
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      log: () => {},
    });
    const long = "x".repeat(100);
    const t = svc.register(VALID, { deviceName: long });
    expect(t?.deviceName?.length).toBe(64);
  });

  test("unregister removes + persists", async () => {
    const path = join(tmp, "tokens.json");
    const svc = await createPushService({ storePath: path, log: () => {} });
    svc.register(VALID, {});
    svc.register(VALID_2, {});
    expect(svc.list().length).toBe(2);
    expect(svc.unregister(VALID)).toBe(true);
    expect(svc.unregister(VALID)).toBe(false);
    expect(svc.list().length).toBe(1);
    await sleep(50);
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw.length).toBe(1);
    expect(raw[0].token).toBe(VALID_2);
  });

  test("file persistence survives reload", async () => {
    const path = join(tmp, "tokens.json");
    const a = await createPushService({ storePath: path, log: () => {} });
    a.register(VALID, { platform: "ios" });
    await sleep(50);
    const b = await createPushService({ storePath: path, log: () => {} });
    expect(b.list().map((t) => t.token)).toEqual([VALID]);
  });

  test("send dispatches with correct payload shape", async () => {
    const { calls, impl } = okFetch();
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      fetchImpl: impl,
      expoPushUrl: "https://fake.expo.test/send",
      log: () => {},
    });
    svc.register(VALID, { platform: "ios" });
    const sent = await svc.send("awaiting_input", "confirm: Run bash?", {
      sessionId: "abc",
      requestId: "req-1",
      method: "confirm",
    });
    expect(sent).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://fake.expo.test/send");
    const body = calls[0].body as Array<Record<string, unknown>>;
    expect(body.length).toBe(1);
    expect(body[0].to).toBe(VALID);
    expect(body[0].title).toBe("amarre · awaiting input");
    expect(body[0].body).toBe("confirm: Run bash?");
    expect(body[0].sound).toBe("default");
    const data = body[0].data as Record<string, unknown>;
    expect(data.amarre).toBe("1");
    expect(data.trigger).toBe("awaiting_input");
    expect(data.sessionId).toBe("abc");
    expect(data.requestId).toBe("req-1");
  });

  test("send body truncates to 100 chars", async () => {
    const { calls, impl } = okFetch();
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      fetchImpl: impl,
      log: () => {},
    });
    svc.register(VALID, {});
    const long = "x".repeat(500);
    await svc.send("crashed", long, { sessionId: "z" });
    const body = calls[0].body as Array<Record<string, unknown>>;
    expect((body[0].body as string).length).toBe(100);
  });

  test("send prunes DeviceNotRegistered tokens", async () => {
    const path = join(tmp, "t.json");
    const impl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              status: "error",
              message: "device gone",
              details: { error: "DeviceNotRegistered" },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const svc = await createPushService({ storePath: path, fetchImpl: impl, log: () => {} });
    svc.register(VALID, {});
    expect(svc.list().length).toBe(1);
    const sent = await svc.send("crashed", "x", { sessionId: "z" });
    expect(sent).toBe(0);
    expect(svc.list().length).toBe(0);
    await sleep(50);
    const raw = JSON.parse(await readFile(path, "utf8"));
    expect(raw.length).toBe(0);
  });

  test("send retains non-DeviceNotRegistered errors", async () => {
    const impl = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { status: "error", message: "too big", details: { error: "MessageTooBig" } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      fetchImpl: impl,
      log: () => {},
    });
    svc.register(VALID, {});
    await svc.send("crashed", "x", { sessionId: "z" });
    expect(svc.list().length).toBe(1); // retained
  });

  test("send chunks at 100 messages per request", async () => {
    const { calls, impl } = okFetch();
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      fetchImpl: impl,
      log: () => {},
    });
    // generate 250 unique tokens
    for (let i = 0; i < 250; i++) {
      const t = `ExponentPushToken[${i.toString().padStart(22, "x")}]`;
      svc.register(t, {});
    }
    await svc.send("crashed", "x", { sessionId: "z" });
    expect(calls.length).toBe(3); // 100 + 100 + 50
    expect((calls[0].body as unknown[]).length).toBe(100);
    expect((calls[2].body as unknown[]).length).toBe(50);
  });

  test("send no-ops when store is empty", async () => {
    const { calls, impl } = okFetch();
    const svc = await createPushService({
      storePath: join(tmp, "t.json"),
      fetchImpl: impl,
      log: () => {},
    });
    expect(await svc.send("crashed", "x", { sessionId: "z" })).toBe(0);
    expect(calls.length).toBe(0);
  });
});
