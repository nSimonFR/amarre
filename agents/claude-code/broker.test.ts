import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";

import type {
  CanUseTool,
  Options as ClaudeQueryOptions,
  PermissionMode,
  PermissionResult,
  Query,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AttachBridgeSessionOptions,
  BridgeSessionHandle,
  CredentialsFailure,
  RemoteCredentials,
} from "@anthropic-ai/claude-agent-sdk/bridge";
import { runBroker } from "./broker";
import type { RemoteControllerDeps } from "./remote";

// --- test helpers ---

function attachLineReader(s: NodeJS.ReadableStream): {
  next: (timeoutMs?: number) => Promise<unknown>;
} {
  const queue: unknown[] = [];
  const waiters: Array<{ resolve: (v: unknown) => void; timer: ReturnType<typeof setTimeout> }> = [];
  let buf = "";
  s.on("data", (chunk: Buffer | string) => {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const parsed = JSON.parse(line);
      const w = waiters.shift();
      if (w) {
        clearTimeout(w.timer);
        w.resolve(parsed);
      } else {
        queue.push(parsed);
      }
    }
  });
  return {
    next(timeoutMs = 1000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const next = queue.shift();
        if (next !== undefined) {
          resolve(next);
          return;
        }
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.timer === timer);
          if (i >= 0) waiters.splice(i, 1);
          reject(new Error("timeout waiting for stdout line"));
        }, timeoutMs);
        waiters.push({ resolve, timer });
      });
    },
  };
}

interface FakeQueryHandle {
  emit: (msg: SDKMessage) => void;
  end: () => void;
  capturedOptions: ClaudeQueryOptions | null;
  capturedPrompts: SDKUserMessage[];
  invokeCanUseTool: (toolName: string, input: Record<string, unknown>, opts?: { signal?: AbortSignal; toolUseID?: string }) => Promise<PermissionResult>;
  interruptCalls: number;
  setModelCalls: Array<string | undefined>;
  setPermissionModeCalls: PermissionMode[];
}

function makeFakeCreateQuery(): {
  create: (params: { prompt: AsyncIterable<SDKUserMessage>; options: ClaudeQueryOptions }) => Query;
  handle: FakeQueryHandle;
} {
  const handle: FakeQueryHandle = {
    emit: () => {
      throw new Error("emit before query started");
    },
    end: () => {
      throw new Error("end before query started");
    },
    capturedOptions: null,
    capturedPrompts: [],
    invokeCanUseTool: () => {
      throw new Error("canUseTool not yet captured");
    },
    interruptCalls: 0,
    setModelCalls: [],
    setPermissionModeCalls: [],
  };

  const create = (params: { prompt: AsyncIterable<SDKUserMessage>; options: ClaudeQueryOptions }): Query => {
    handle.capturedOptions = params.options;
    if (params.options.canUseTool) {
      const cb: CanUseTool = params.options.canUseTool;
      handle.invokeCanUseTool = (toolName, input, opts) =>
        cb(toolName, input, {
          signal: opts?.signal ?? new AbortController().signal,
          toolUseID: opts?.toolUseID ?? "tu_test",
        });
    }
    // Drain prompts in the background so the broker's queue empties.
    void (async () => {
      for await (const p of params.prompt) {
        handle.capturedPrompts.push(p);
      }
    })();

    const buf: SDKMessage[] = [];
    const waiters: Array<(v: IteratorResult<SDKMessage>) => void> = [];
    let ended = false;

    const iterable: AsyncIterable<SDKMessage> = {
      [Symbol.asyncIterator]: () => ({
        next: () => {
          if (buf.length) return Promise.resolve({ value: buf.shift()!, done: false });
          if (ended) return Promise.resolve({ value: undefined, done: true } as IteratorResult<SDKMessage>);
          return new Promise<IteratorResult<SDKMessage>>((resolve) => waiters.push(resolve));
        },
      }),
    };

    handle.emit = (msg: SDKMessage) => {
      const w = waiters.shift();
      if (w) w({ value: msg, done: false });
      else buf.push(msg);
    };
    handle.end = () => {
      ended = true;
      while (waiters.length) waiters.shift()!({ value: undefined, done: true });
    };

    const q = Object.assign(iterable, {
      interrupt: () => {
        handle.interruptCalls += 1;
        return Promise.resolve();
      },
      setPermissionMode: (mode: PermissionMode) => {
        handle.setPermissionModeCalls.push(mode);
        return Promise.resolve();
      },
      setModel: (model?: string) => {
        handle.setModelCalls.push(model);
        return Promise.resolve();
      },
      setMaxThinkingTokens: () => Promise.resolve(),
      mcpServerStatus: () => Promise.resolve([]),
      supportedCommands: () => Promise.resolve([]),
      supportedModels: () => Promise.resolve([]),
      changeCwd: () => Promise.resolve(),
      setSettings: () => Promise.resolve(),
    });
    return q as unknown as Query;
  };

  return { create, handle };
}

// --- tests ---

describe("broker: SDK driver", () => {
  test("prompt → SDKUserMessage pushed onto SDK prompt queue + ack on stdout", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });

    stdin.write('{"id":"1","type":"prompt","message":"hi"}\n');
    const ack = await reader.next();
    expect(ack).toEqual({ type: "response", command: "prompt", success: true, id: "1" });

    // Wait one microtask for the prompt to flow into the fake SDK.
    await new Promise((r) => setTimeout(r, 10));
    expect(handle.capturedPrompts).toHaveLength(1);
    expect(handle.capturedPrompts[0].message).toEqual({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });

    await broker.close();
  });

  test("system init + assistant text → agent_start + turn_start + message_update", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });

    handle.emit({ type: "system", subtype: "init", session_id: "sess-1" } as SDKMessage);
    expect(await reader.next()).toEqual({ type: "agent_start" });
    expect(await reader.next()).toEqual({ type: "turn_start" });

    handle.emit({
      type: "assistant",
      message: { role: "assistant", model: "claude-opus", content: [{ type: "text", text: "hello" }] },
    } as SDKMessage);
    const m = (await reader.next()) as { type: string; assistantMessageEvent: { type: string; delta: string } };
    expect(m.type).toBe("message_update");
    expect(m.assistantMessageEvent.type).toBe("text_delta");
    expect(m.assistantMessageEvent.delta).toBe("hello");

    await broker.close();
  });

  test("canUseTool emits extension_ui_request{method:confirm} and resolves on response", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });

    // Wait for query options capture.
    await new Promise((r) => setTimeout(r, 10));
    const decision = handle.invokeCanUseTool("Bash", { command: "ls -la" });

    const req = (await reader.next()) as { type: string; method: string; id: string; title: string; message: string };
    expect(req.type).toBe("extension_ui_request");
    expect(req.method).toBe("confirm");
    expect(req.title).toBe("Run Bash?");
    expect(req.message).toContain("ls -la");
    expect(typeof req.id).toBe("string");

    stdin.write(JSON.stringify({ type: "extension_ui_response", id: req.id, confirmed: true }) + "\n");
    const result = await decision;
    expect(result.behavior).toBe("allow");

    await broker.close();
  });

  test("canUseTool: deny on confirmed:false", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });
    await new Promise((r) => setTimeout(r, 10));

    const decision = handle.invokeCanUseTool("Bash", { command: "rm -rf /" });
    const req = (await reader.next()) as { id: string };

    stdin.write(JSON.stringify({ type: "extension_ui_response", id: req.id, confirmed: false }) + "\n");
    const result = await decision;
    expect(result.behavior).toBe("deny");

    await broker.close();
  });

  test("ExitPlanMode → notify event + auto-deny (no client response needed)", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });
    await new Promise((r) => setTimeout(r, 10));

    const decision = handle.invokeCanUseTool("ExitPlanMode", { plan: "# Plan\n1. Do X" });

    const req = (await reader.next()) as {
      type: string;
      method: string;
      event: string;
      message: string;
    };
    expect(req.type).toBe("extension_ui_request");
    expect(req.method).toBe("notify");
    expect(req.event).toBe("plan_capture");
    expect(req.message).toBe("# Plan\n1. Do X");

    const result = await decision;
    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toMatch(/awaiting/i);
    }

    await broker.close();
  });

  test("abort → calls query.interrupt() and acks", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });

    stdin.write('{"id":"a1","type":"abort"}\n');
    const ack = await reader.next();
    expect(ack).toEqual({ type: "response", command: "abort", success: true, id: "a1" });
    await new Promise((r) => setTimeout(r, 10));
    expect(handle.interruptCalls).toBe(1);

    await broker.close();
  });

  test("set_model + set_permission_mode dispatch to SDK control methods", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });

    stdin.write('{"id":"m1","type":"set_model","model":"claude-opus-4-7"}\n');
    expect(await reader.next()).toEqual({
      type: "response",
      command: "set_model",
      success: true,
      id: "m1",
    });
    expect(handle.setModelCalls).toEqual(["claude-opus-4-7"]);

    stdin.write('{"id":"p1","type":"set_permission_mode","mode":"plan"}\n');
    expect(await reader.next()).toEqual({
      type: "response",
      command: "set_permission_mode",
      success: true,
      id: "p1",
    });
    expect(handle.setPermissionModeCalls).toEqual(["plan" as PermissionMode]);

    await broker.close();
  });

  test("close() denies all pending permission requests so SDK can drain", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create, handle } = makeFakeCreateQuery();
    const broker = runBroker({ stdin, stdout, createQuery: create });
    await new Promise((r) => setTimeout(r, 10));

    const decision = handle.invokeCanUseTool("Bash", { command: "echo hi" });
    await reader.next(); // drain the extension_ui_request

    await broker.close();
    const result = await decision;
    expect(result.behavior).toBe("deny");
    expect(handle.interruptCalls).toBe(1);
  });

  test("prompt from amarre WS is mirrored to bridge.write so claude.ai/code sees user messages", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const reader = attachLineReader(stdout);
    const { create } = makeFakeCreateQuery();

    // Capture every msg the bridge would forward to claude.ai/code.
    const bridgeWrites: SDKMessage[] = [];
    const goodCreds: RemoteCredentials = {
      worker_jwt: "jwt",
      api_base_url: "https://api.example/test",
      expires_in: 3600,
      worker_epoch: 1,
    };
    const fakeDeps: RemoteControllerDeps = {
      createCodeSession: async () => "cse_test",
      fetchRemoteCredentials: async () => goodCreds,
      isCredentialsFailure: (r): r is CredentialsFailure =>
        !!r && (r as CredentialsFailure).terminal === true,
      attachBridgeSession: async (_o: AttachBridgeSessionOptions) =>
        ({
          sessionId: "cse_test",
          getSequenceNum: () => 0,
          isConnected: () => true,
          write: (msg) => bridgeWrites.push(msg),
          sendResult: () => {},
          sendControlRequest: () => {},
          sendControlResponse: () => {},
          sendControlCancelRequest: () => {},
          reconnectTransport: () => Promise.resolve(),
          reportState: () => {},
          reportMetadata: () => {},
          reportDelivery: () => {},
          flush: () => Promise.resolve(),
          close: () => {},
        }) as unknown as BridgeSessionHandle,
      readTextFile: async () => "tok",
      log: () => {},
    };

    const broker = runBroker({
      stdin,
      stdout,
      createQuery: create,
      remote: {
        mode: "dual",
        tokenPath: "/tmp/fake",
        baseUrl: "https://api.example",
        title: "amarre-test",
        deps: fakeDeps,
      },
    });

    // Wait for the remote controller to attach.
    while (true) {
      const ev = (await reader.next()) as { type?: string };
      if (ev.type === "amarre.remote_attached") break;
    }

    stdin.write('{"id":"1","type":"prompt","message":"hello from amarre"}\n');
    const ack = (await reader.next()) as { type: string; success: boolean };
    expect(ack.type).toBe("response");
    expect(ack.success).toBe(true);

    // Microtask + a few ticks for the synchronous bridgeWrites.push to land.
    await new Promise((r) => setTimeout(r, 20));

    const userMsg = bridgeWrites.find((m) => (m as { type?: string }).type === "user");
    expect(userMsg).toBeDefined();
    const message = (userMsg as { message: { role: string; content: unknown } }).message;
    expect(message.role).toBe("user");
    expect(message.content).toEqual([{ type: "text", text: "hello from amarre" }]);

    await broker.close();
  });
});
