// Unit tests for the Remote Claude façade. The four `/bridge` exports are
// injected via `opts.deps`; no network is touched.

import { describe, expect, test } from "bun:test";

import type {
  PermissionMode,
  SDKControlRequest,
  SDKControlResponse,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AttachBridgeSessionOptions,
  BridgeSessionHandle,
  CredentialsFailure,
  RemoteCredentials,
  SessionState,
} from "@anthropic-ai/claude-agent-sdk/bridge";

import {
  createRemoteController,
  type RemoteControllerCallbacks,
  type RemoteControllerDeps,
  type RemoteControllerOptions,
} from "./remote";

// --- helpers ---

interface FakeBridgeHandle extends BridgeSessionHandle {
  writeCalls: SDKMessage[];
  controlRequestCalls: SDKControlRequest[];
  cancelCalls: string[];
  reportStateCalls: SessionState[];
  metadataCalls: Array<Record<string, unknown>>;
  resultCalls: number;
  closeCalls: number;
  fireInbound: (msg: SDKMessage) => void;
  firePermissionResponse: (res: SDKControlResponse) => void;
  fireInterrupt: () => void;
  fireSetModel: (model: string | undefined) => void;
  fireSetPermissionMode: (mode: PermissionMode) => { ok: true } | { ok: false; error: string };
  fireClose: (code?: number) => void;
}

function makeFakeBridgeHandle(opts: AttachBridgeSessionOptions): FakeBridgeHandle {
  const writeCalls: SDKMessage[] = [];
  const controlRequestCalls: SDKControlRequest[] = [];
  const cancelCalls: string[] = [];
  const reportStateCalls: SessionState[] = [];
  const metadataCalls: Array<Record<string, unknown>> = [];
  let resultCalls = 0;
  let closeCalls = 0;
  return {
    sessionId: opts.sessionId,
    getSequenceNum: () => 0,
    isConnected: () => true,
    write: (msg) => {
      writeCalls.push(msg);
    },
    sendResult: () => {
      resultCalls += 1;
    },
    sendControlRequest: (req) => {
      controlRequestCalls.push(req);
    },
    sendControlResponse: () => {},
    sendControlCancelRequest: (id) => {
      cancelCalls.push(id);
    },
    reconnectTransport: () => Promise.resolve(),
    reportState: (s) => {
      reportStateCalls.push(s);
    },
    reportMetadata: (m) => {
      metadataCalls.push(m);
    },
    reportDelivery: () => {},
    flush: () => Promise.resolve(),
    close: () => {
      closeCalls += 1;
    },
    // exposed for tests
    writeCalls,
    controlRequestCalls,
    cancelCalls,
    reportStateCalls,
    metadataCalls,
    get resultCalls() {
      return resultCalls;
    },
    get closeCalls() {
      return closeCalls;
    },
    fireInbound: (msg) => {
      void opts.onInboundMessage?.(msg);
    },
    firePermissionResponse: (res) => {
      opts.onPermissionResponse?.(res);
    },
    fireInterrupt: () => {
      opts.onInterrupt?.();
    },
    fireSetModel: (model) => {
      opts.onSetModel?.(model);
    },
    fireSetPermissionMode: (mode) => {
      const cb = opts.onSetPermissionMode;
      if (!cb) return { ok: true } as const;
      return cb(mode);
    },
    fireClose: (code) => {
      opts.onClose?.(code);
    },
  } as unknown as FakeBridgeHandle;
}

interface DepStubs {
  deps: RemoteControllerDeps;
  logs: string[];
  createCalls: number;
  fetchCalls: number;
  attachCalls: number;
  lastBridge: FakeBridgeHandle | null;
}

function makeDeps(overrides: Partial<RemoteControllerDeps> = {}): DepStubs {
  const logs: string[] = [];
  const stub: DepStubs = {
    logs,
    createCalls: 0,
    fetchCalls: 0,
    attachCalls: 0,
    lastBridge: null,
    deps: {} as RemoteControllerDeps,
  };
  const goodCreds: RemoteCredentials = {
    worker_jwt: "jwt",
    api_base_url: "https://api.example/test",
    expires_in: 3600,
    worker_epoch: 1,
  };
  stub.deps = {
    createCodeSession: async () => {
      stub.createCalls += 1;
      return "cse_test";
    },
    fetchRemoteCredentials: async () => {
      stub.fetchCalls += 1;
      return goodCreds;
    },
    isCredentialsFailure: (r): r is CredentialsFailure =>
      !!r && (r as CredentialsFailure).terminal === true,
    attachBridgeSession: async (o) => {
      stub.attachCalls += 1;
      const h = makeFakeBridgeHandle(o);
      stub.lastBridge = h;
      return h;
    },
    readTextFile: async () => "tok",
    log: (s) => logs.push(s),
    ...overrides,
  };
  return stub;
}

function emptyCallbacks(): RemoteControllerCallbacks {
  return {
    onInboundUserMessage: () => {},
    onPermissionResponse: () => {},
    onInterrupt: () => {},
    onSetModel: () => {},
    onSetPermissionMode: () => ({ ok: true }) as const,
    onClose: () => {},
  };
}

function baseOpts(over: Partial<RemoteControllerOptions> = {}): RemoteControllerOptions {
  return {
    mode: "dual",
    tokenPath: "/tmp/fake",
    baseUrl: "https://api.example",
    title: "amarre-test",
    tags: ["amarre"],
    callbacks: emptyCallbacks(),
    ...over,
  };
}

// --- tests ---

describe("createRemoteController", () => {
  test("mode=off → null, no deps invoked", async () => {
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ mode: "off", deps: stub.deps }));
    expect(handle).toBeNull();
    expect(stub.createCalls).toBe(0);
    expect(stub.fetchCalls).toBe(0);
    expect(stub.attachCalls).toBe(0);
  });

  test("token file missing → null, single warn line, no throw", async () => {
    const stub = makeDeps({ readTextFile: async () => null });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    expect(stub.createCalls).toBe(0);
    expect(stub.logs.some((l) => l.startsWith("disabled: token unreadable"))).toBe(true);
  });

  test("token empty → null, single warn line", async () => {
    const stub = makeDeps({ readTextFile: async () => "   " });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    expect(stub.logs.some((l) => l.startsWith("disabled: token file empty"))).toBe(true);
  });

  test("createCodeSession returns null → null, transient log", async () => {
    const stub = makeDeps({ createCodeSession: async () => null });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    expect(stub.logs.some((l) => l.includes("transient"))).toBe(true);
  });

  test("CredentialsFailure (untrusted_device) → null, terminal log w/ remediation hint", async () => {
    const failure: CredentialsFailure = { terminal: true, reason: "untrusted_device" };
    const stub = makeDeps({ fetchRemoteCredentials: async () => failure });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    const line = stub.logs.find((l) => l.includes("terminal auth failure"));
    expect(line).toBeDefined();
    expect(line).toContain("untrusted_device");
    expect(line).toContain("trusted device");
  });

  test("CredentialsFailure (session_stale_relogin) → null, re-auth hint", async () => {
    const failure: CredentialsFailure = { terminal: true, reason: "session_stale_relogin" };
    const stub = makeDeps({ fetchRemoteCredentials: async () => failure });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    const line = stub.logs.find((l) => l.includes("session_stale_relogin"));
    expect(line).toContain("re-authenticate");
  });

  test("attachBridgeSession throws → null, single error log", async () => {
    const stub = makeDeps({
      attachBridgeSession: () => Promise.reject(new Error("boom")),
    });
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).toBeNull();
    expect(stub.logs.some((l) => l.includes("attachBridgeSession threw"))).toBe(true);
  });

  test("happy path: returns handle; write/sendResult/cancel/state/meta proxy through", async () => {
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).not.toBeNull();
    expect(handle!.ccrSessionId).toBe("cse_test");

    const msg = { type: "assistant", message: { role: "assistant", content: [] } } as unknown as SDKMessage;
    handle!.write(msg);
    handle!.sendResult();
    handle!.sendControlRequest({
      type: "control_request",
      request_id: "rq-1",
      request: { subtype: "can_use_tool", tool_name: "Bash", input: {}, tool_use_id: "tu-1" },
    } as SDKControlRequest);
    handle!.sendControlCancelRequest("rq-1");
    handle!.reportState("running");
    handle!.reportMetadata({ branch: "main" });

    const fake = stub.lastBridge!;
    expect(fake.writeCalls).toEqual([msg]);
    expect(fake.resultCalls).toBe(1);
    expect(fake.controlRequestCalls).toHaveLength(1);
    expect(fake.controlRequestCalls[0].request_id).toBe("rq-1");
    expect(fake.cancelCalls).toEqual(["rq-1"]);
    expect(fake.reportStateCalls).toEqual(["running"]);
    expect(fake.metadataCalls).toEqual([{ branch: "main" }]);

    await handle!.close();
    expect(fake.closeCalls).toBe(1);
  });

  test("inbound user message routed to onInboundUserMessage; non-user inbound ignored", async () => {
    const inbound: SDKUserMessage[] = [];
    const cb = emptyCallbacks();
    cb.onInboundUserMessage = (m) => inbound.push(m);
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ callbacks: cb, deps: stub.deps }));
    expect(handle).not.toBeNull();

    const userMsg: SDKUserMessage = {
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "hi from claude.ai" }] },
      parent_tool_use_id: null,
    } as SDKUserMessage;
    stub.lastBridge!.fireInbound(userMsg);
    expect(inbound).toEqual([userMsg]);

    // Non-user inbound (e.g. assistant echo) does NOT reach the callback —
    // the broker only cares about user-typed prompts originating remotely.
    stub.lastBridge!.fireInbound({
      type: "assistant",
      message: { role: "assistant", content: [] },
    } as unknown as SDKMessage);
    expect(inbound).toHaveLength(1);
  });

  test("permission response routed verbatim to onPermissionResponse", async () => {
    const responses: SDKControlResponse[] = [];
    const cb = emptyCallbacks();
    cb.onPermissionResponse = (r) => responses.push(r);
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ callbacks: cb, deps: stub.deps }));
    expect(handle).not.toBeNull();

    const r: SDKControlResponse = {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: "rq-1",
        response: { behavior: "allow", updatedInput: {} },
      },
    } as SDKControlResponse;
    stub.lastBridge!.firePermissionResponse(r);
    expect(responses).toEqual([r]);
  });

  test("interrupt / setModel / setPermissionMode round-trip via callbacks", async () => {
    let interrupts = 0;
    const models: Array<string | undefined> = [];
    const modes: PermissionMode[] = [];
    const cb = emptyCallbacks();
    cb.onInterrupt = () => {
      interrupts += 1;
    };
    cb.onSetModel = (m) => models.push(m);
    cb.onSetPermissionMode = (m) => {
      modes.push(m);
      return m === "bypassPermissions"
        ? { ok: false, error: "not allowed" }
        : { ok: true };
    };
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ callbacks: cb, deps: stub.deps }));
    expect(handle).not.toBeNull();

    stub.lastBridge!.fireInterrupt();
    stub.lastBridge!.fireSetModel("claude-opus-4-7");
    expect(stub.lastBridge!.fireSetPermissionMode("plan")).toEqual({ ok: true });
    expect(stub.lastBridge!.fireSetPermissionMode("bypassPermissions")).toEqual({
      ok: false,
      error: "not allowed",
    });

    expect(interrupts).toBe(1);
    expect(models).toEqual(["claude-opus-4-7"]);
    expect(modes).toEqual(["plan", "bypassPermissions"]);
  });

  test("onClose forwarded to broker so it can broadcast amarre.remote_failed", async () => {
    const closes: Array<number | undefined> = [];
    const cb = emptyCallbacks();
    cb.onClose = (c) => closes.push(c);
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ callbacks: cb, deps: stub.deps }));
    expect(handle).not.toBeNull();

    stub.lastBridge!.fireClose(401);
    expect(closes).toEqual([401]);
  });

  test("trustedDeviceTokenPath read + passed to fetchRemoteCredentials when present", async () => {
    const seen: Array<string | undefined> = [];
    const stub = makeDeps({
      readTextFile: async (p) => (p.endsWith("device") ? "trusted-x" : "tok"),
      fetchRemoteCredentials: async (_id, _url, _t, _ms, td) => {
        seen.push(td);
        return { worker_jwt: "j", api_base_url: "https://x", expires_in: 100, worker_epoch: 1 };
      },
    });
    const handle = await createRemoteController(
      baseOpts({ trustedDeviceTokenPath: "/tmp/device", deps: stub.deps }),
    );
    expect(handle).not.toBeNull();
    expect(seen).toEqual(["trusted-x"]);
  });

  test("attached log line carries cse_ session id", async () => {
    const stub = makeDeps();
    const handle = await createRemoteController(baseOpts({ deps: stub.deps }));
    expect(handle).not.toBeNull();
    expect(stub.logs.some((l) => l === "attached ccrSessionId=cse_test")).toBe(true);
  });
});
