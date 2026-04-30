// SDK-driven broker for the claude-code adapter. Sits between amarre's WS
// proxy and Anthropic's `@anthropic-ai/claude-agent-sdk` `query()` function:
//
//   amarre server ──stdin──▶ broker ──▶ query() ──▶ claude binary
//                  ◀─stdout─ broker ◀──            (SDKMessage stream)
//
// Wire format on the broker's stdio is pi RPC (`prompt`, `follow_up`, `steer`,
// `abort`, `set_model`, `set_permission_mode`, `extension_ui_response`,
// `get_state`, `get_messages`); identical to what `agents/pi/` and the
// pre-existing claude-code translator already speak. The translator at
// ./translator.ts is reused for SDKMessage→pi-RPC mapping (the SDK and stream-
// json share the same `system`/`assistant`/`user`/`result` envelope shapes).
//
// What the SDK gives us beyond the raw stream-json adapter:
//   * `canUseTool` — synchronous permission decisions per tool call. We
//     translate these into pi-compatible `extension_ui_request{method:"confirm"}`
//     on stdout; the matching `extension_ui_response` from the WS client
//     resolves the SDK callback. No `--dangerously-skip-permissions` needed.
//   * `ExitPlanMode` interception — captured plan markdown is emitted as
//     `extension_ui_request{method:"notify",event:"plan_capture"}` (broadcast
//     only) and the SDK callback is auto-denied so Claude waits.
//   * Mid-session controls — `query.interrupt()`, `query.setModel()`,
//     `query.setPermissionMode()` exposed as inbound pi commands.

import {
  query as defaultQuery,
  type CanUseTool,
  type Options as ClaudeQueryOptions,
  type PermissionMode,
  type PermissionResult,
  type Query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { createState, translateInbound, translateOutbound } from "./translator.ts";

type CreateQuery = (params: {
  prompt: AsyncIterable<SDKUserMessage>;
  options: ClaudeQueryOptions;
}) => Query;

export interface BrokerOptions {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr?: NodeJS.WritableStream;
  /** Test injection hatch — defaults to the real SDK `query()`. */
  readonly createQuery?: CreateQuery;
  /** Override `pathToClaudeCodeExecutable`. Default: `CLAUDE_BIN` env or `"claude"`. */
  readonly claudeBin?: string;
  /** Optional model override (`AMARRE_CLAUDE_MODEL`). */
  readonly model?: string;
  /** Optional permission mode (`AMARRE_CLAUDE_PERMISSION_MODE`). */
  readonly permissionMode?: PermissionMode;
  /** Working directory passed to the SDK. */
  readonly cwd?: string;
  /** Extra directories Claude may access. */
  readonly additionalDirectories?: ReadonlyArray<string>;
}

export interface BrokerHandle {
  /** Stop the broker; calls `query.interrupt()` and drains the prompt queue. */
  close: () => Promise<void>;
}

const PERMISSION_REQUEST_PREVIEW_LIMIT = 400;

function preview(value: unknown): string {
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > PERMISSION_REQUEST_PREVIEW_LIMIT
    ? s.slice(0, PERMISSION_REQUEST_PREVIEW_LIMIT) + "…"
    : s;
}

function newId(): string {
  return crypto.randomUUID();
}

// Minimal async-iterable queue. `push` enqueues; `close` ends the iteration.
class PromptQueue implements AsyncIterable<SDKUserMessage> {
  private buf: SDKUserMessage[] = [];
  private waiters: Array<(v: IteratorResult<SDKUserMessage>) => void> = [];
  private closed = false;

  push(msg: SDKUserMessage): void {
    if (this.closed) return;
    const w = this.waiters.shift();
    if (w) w({ value: msg, done: false });
    else this.buf.push(msg);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length) this.waiters.shift()!({ value: undefined, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.buf.length) {
          return Promise.resolve({ value: this.buf.shift()!, done: false });
        }
        if (this.closed) return Promise.resolve({ value: undefined, done: true } as IteratorResult<SDKUserMessage>);
        return new Promise<IteratorResult<SDKUserMessage>>((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export function runBroker(opts: BrokerOptions): BrokerHandle {
  const stdin = opts.stdin;
  const stdout = opts.stdout;
  const stderr = opts.stderr ?? process.stderr;
  const create: CreateQuery = opts.createQuery ?? ((p) => defaultQuery(p));
  const state = createState();
  const promptQueue = new PromptQueue();
  const pendingPermissions = new Map<string, (r: PermissionResult) => void>();

  function writeOut(line: string): void {
    stdout.write(line + "\n");
  }

  function writeErr(s: string): void {
    try {
      stderr.write(`[broker] ${s}\n`);
    } catch {}
  }

  const canUseTool: CanUseTool = (toolName, input, callback) => {
    // Special-case ExitPlanMode: capture the plan markdown and broadcast it
    // as `notify` (no response expected); deny the tool so Claude waits.
    if (toolName === "ExitPlanMode") {
      const plan =
        typeof (input as { plan?: unknown }).plan === "string"
          ? (input as { plan: string }).plan
          : preview(input);
      writeOut(
        JSON.stringify({
          type: "extension_ui_request",
          method: "notify",
          event: "plan_capture",
          message: plan,
        }),
      );
      return Promise.resolve({
        behavior: "deny",
        message: "Plan captured; awaiting user feedback.",
      } satisfies PermissionResult);
    }

    const id = newId();
    const title = callback.title ?? `Run ${toolName}?`;
    writeOut(
      JSON.stringify({
        type: "extension_ui_request",
        id,
        method: "confirm",
        title,
        message: preview(input),
      }),
    );

    return new Promise<PermissionResult>((resolve) => {
      pendingPermissions.set(id, resolve);
      const onAbort = () => {
        if (pendingPermissions.delete(id)) {
          resolve({ behavior: "deny", message: "aborted", interrupt: true });
        }
      };
      callback.signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  const queryOptions: ClaudeQueryOptions = {
    pathToClaudeCodeExecutable: opts.claudeBin ?? process.env.CLAUDE_BIN ?? "claude",
    canUseTool,
    includePartialMessages: false,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.permissionMode ? { permissionMode: opts.permissionMode } : {}),
    ...(opts.additionalDirectories && opts.additionalDirectories.length > 0
      ? { additionalDirectories: [...opts.additionalDirectories] }
      : {}),
  };

  const sdkQuery = create({ prompt: promptQueue, options: queryOptions });

  // Pump SDK messages → translator → stdout.
  void (async () => {
    try {
      for await (const msg of sdkQuery) {
        const json = JSON.stringify(msg);
        const r = translateOutbound(json, state);
        for (const line of r.outbound) writeOut(line);
        // r.stdin from translateOutbound is `control_response` acks meant for
        // a real claude child; the SDK has no such channel — drop them.
      }
    } catch (err) {
      writeErr(`SDK iteration error: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();

  // Inbound: line-buffer stdin and dispatch to the SDK or the translator.
  let inBuf = "";
  stdin.on("data", (chunk: Buffer | string) => {
    inBuf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = inBuf.indexOf("\n")) !== -1) {
      const line = inBuf.slice(0, nl).replace(/\r$/, "").trim();
      inBuf = inBuf.slice(nl + 1);
      if (line) handleInbound(line);
    }
  });

  function ack(cmdType: string, id: unknown): void {
    if (typeof id === "string") {
      writeOut(JSON.stringify({ type: "response", command: cmdType, success: true, id }));
    }
  }

  function nack(cmdType: string, id: unknown, error: string): void {
    if (typeof id === "string") {
      writeOut(JSON.stringify({ type: "response", command: cmdType, success: false, id, error }));
    }
  }

  function handleInbound(line: string): void {
    let cmd: { type?: unknown; id?: unknown; [k: string]: unknown };
    try {
      cmd = JSON.parse(line);
    } catch {
      return;
    }
    if (!cmd || typeof cmd.type !== "string") return;

    // SDK-aware commands handled by the broker BEFORE the translator.
    switch (cmd.type) {
      case "extension_ui_response": {
        const id = typeof cmd.id === "string" ? cmd.id : undefined;
        const resolve = id ? pendingPermissions.get(id) : undefined;
        if (id && resolve) {
          pendingPermissions.delete(id);
          const confirmed = cmd.confirmed === true;
          resolve(
            confirmed
              ? { behavior: "allow" }
              : { behavior: "deny", message: "User declined.", interrupt: true },
          );
          ack(cmd.type, cmd.id);
          return;
        }
        // Unknown id (or notify-style with no id) — ack and drop.
        ack(cmd.type, cmd.id);
        return;
      }
      case "abort": {
        // Drop queued follow-ups; tell the SDK to stop.
        state.followUpQueue = [];
        state.steerQueue = [];
        sdkQuery.interrupt().catch((err: unknown) => {
          writeErr(`interrupt failed: ${err instanceof Error ? err.message : String(err)}`);
        });
        ack(cmd.type, cmd.id);
        return;
      }
      case "set_model": {
        const model = typeof cmd.model === "string" ? cmd.model : undefined;
        sdkQuery
          .setModel(model)
          .then(() => ack(cmd.type as string, cmd.id))
          .catch((err: unknown) => {
            nack(cmd.type as string, cmd.id, err instanceof Error ? err.message : String(err));
          });
        return;
      }
      case "set_permission_mode": {
        const mode = cmd.mode as PermissionMode | undefined;
        if (!mode) {
          nack(cmd.type, cmd.id, "missing 'mode' field");
          return;
        }
        sdkQuery
          .setPermissionMode(mode)
          .then(() => ack(cmd.type as string, cmd.id))
          .catch((err: unknown) => {
            nack(cmd.type as string, cmd.id, err instanceof Error ? err.message : String(err));
          });
        return;
      }
    }

    // Everything else (prompt / follow_up / steer / get_state / get_messages /
    // unknown) goes through the existing translator. Its `stdin` output is
    // stream-json `{type:"user",...}` envelopes; we parse them back and push
    // them onto the SDK prompt queue. Translator's `outbound` lines are
    // already pi-shaped responses — write them as-is.
    const r = translateInbound(line, state);
    for (const out of r.outbound) writeOut(out);
    for (const stdinLine of r.stdin) {
      let parsed: { type?: unknown; message?: unknown };
      try {
        parsed = JSON.parse(stdinLine);
      } catch {
        continue;
      }
      if (!parsed || parsed.type !== "user" || !parsed.message) continue;
      // The SDK expects `parent_tool_use_id` on every SDKUserMessage; null is
      // fine for top-level user prompts.
      promptQueue.push({
        type: "user",
        message: parsed.message,
        parent_tool_use_id: null,
      } as SDKUserMessage);
    }
  }

  return {
    close: async () => {
      try {
        await sdkQuery.interrupt();
      } catch {
        // ignore — query may already be done
      }
      // Resolve any pending permission requests as denied so the SDK can flush.
      for (const [id, resolve] of pendingPermissions) {
        resolve({ behavior: "deny", message: "broker shutting down", interrupt: true });
        pendingPermissions.delete(id);
      }
      promptQueue.close();
    },
  };
}

// Standalone entrypoint: spawned by `agents/claude-code/adapter.ts`.
if (import.meta.main) {
  const additional = (process.env.AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  const handle = runBroker({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    claudeBin: process.env.CLAUDE_BIN,
    model: process.env.AMARRE_CLAUDE_MODEL,
    permissionMode: process.env.AMARRE_CLAUDE_PERMISSION_MODE as PermissionMode | undefined,
    cwd: process.env.AMARRE_CLAUDE_CWD ?? process.cwd(),
    ...(additional.length > 0 ? { additionalDirectories: additional } : {}),
  });
  const shutdown = (sig: NodeJS.Signals) => {
    process.stderr.write(`[broker] received ${sig}, shutting down\n`);
    void handle.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.stdin.on("end", () => void handle.close().finally(() => process.exit(0)));
}
