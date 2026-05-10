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
  type SDKControlRequest,
  type SDKMessage,
  type SDKUserMessage,
  type SettingSource,
} from "@anthropic-ai/claude-agent-sdk";

import {
  createRemoteController,
  type RemoteControllerHandle,
  type RemoteControllerOptions,
} from "./remote.ts";
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
  /**
   * Setting sources the SDK loads at startup. Defaults to `[]` (SDK isolation
   * mode) so that local file-based `permissions.allow` rules do NOT
   * pre-approve tool calls — every call goes through `canUseTool` and out to
   * the WS as `extension_ui_request{method:"confirm"}`. Override via the env
   * var `AMARRE_CLAUDE_SETTING_SOURCES` (comma-separated: `user,project,local`)
   * if you trust the local config on this host.
   */
  readonly settingSources?: ReadonlyArray<SettingSource>;
  /**
   * Permission rules that force tools through `canUseTool` (rather than the
   * CLI's built-in "is this dangerous?" auto-allow heuristic). Defaults to
   * `DEFAULT_ASK_RULES` covering the standard Claude Code built-in tools.
   * Extend via `AMARRE_CLAUDE_ASK_EXTRA` (comma-separated) for plugin/MCP
   * tools, or override entirely via `AMARRE_CLAUDE_ASK` (comma-separated).
   */
  readonly askRules?: ReadonlyArray<string>;
  /**
   * Optional Remote Claude config (PROTOCOL §14). When omitted, the broker
   * runs local-only — identical to today's behaviour. Callbacks are filled
   * in by the broker.
   */
  readonly remote?: Omit<RemoteControllerOptions, "callbacks">;
}

export interface BrokerHandle {
  /** Stop the broker; calls `query.interrupt()` and drains the prompt queue. */
  close: () => Promise<void>;
}

const PERMISSION_REQUEST_PREVIEW_LIMIT = 400;

// Built-in Claude Code tools that should be gated through canUseTool. Each
// rule has the form `<ToolName>(<arg-glob>)` per the SDK's permission
// grammar; the ToolName segment does NOT accept wildcards, so we enumerate.
const DEFAULT_ASK_RULES: ReadonlyArray<string> = [
  "Bash(*)",
  "Edit(*)",
  "Write(*)",
  "Read(*)",
  "Glob(*)",
  "Grep(*)",
  "WebFetch(*)",
  "WebSearch(*)",
  "NotebookEdit(*)",
  "Task(*)",
  "TodoWrite(*)",
  "AskUserQuestion(*)",
  "ExitPlanMode(*)",
  "EnterPlanMode(*)",
  "Skill(*)",
];

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
  // Each pending entry stores the resolver plus the original tool input, so
  // an `allow` decision can echo the input back via `updatedInput` (the
  // SDK's PermissionResult Zod schema requires it on the wire even though
  // the .d.ts marks it optional).
  // `source` records which UI resolved the prompt — set when the first
  // responder wins so the second responder's reply (if any) is dropped.
  // Stays null until either side answers.
  const pendingPermissions = new Map<
    string,
    {
      resolve: (r: PermissionResult) => void;
      input: Record<string, unknown>;
      toolName: string;
      toolUseId: string;
      source: "amarre" | "claude.ai" | null;
    }
  >();
  let remote: RemoteControllerHandle | null = null;

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
    remote?.reportState("requires_action");
    if (remote) {
      const req: SDKControlRequest = {
        type: "control_request",
        request_id: id,
        request: {
          subtype: "can_use_tool",
          tool_name: toolName,
          input,
          tool_use_id: callback.toolUseID,
        },
      };
      remote.sendControlRequest(req);
    }

    return new Promise<PermissionResult>((resolve) => {
      pendingPermissions.set(id, {
        resolve,
        input,
        toolName,
        toolUseId: callback.toolUseID,
        source: null,
      });
      const onAbort = () => {
        const pending = pendingPermissions.get(id);
        if (pendingPermissions.delete(id)) {
          // Only send a cancel back to claude.ai when the abort happened
          // before either side answered — if claude.ai already won, the
          // response is in flight and a cancel would be a no-op anyway.
          if (pending && pending.source === null) {
            try {
              remote?.sendControlCancelRequest(id);
            } catch {}
          }
          resolve({ behavior: "deny", message: "aborted", interrupt: true });
        }
      };
      callback.signal.addEventListener("abort", onAbort, { once: true });
    });
  };

  const settingSources: ReadonlyArray<SettingSource> = opts.settingSources ?? [];
  const askRules: ReadonlyArray<string> = opts.askRules ?? DEFAULT_ASK_RULES;
  const queryOptions: ClaudeQueryOptions = {
    pathToClaudeCodeExecutable: opts.claudeBin ?? process.env.CLAUDE_BIN ?? "claude",
    canUseTool,
    // Stream incremental text/thinking deltas. With this off, each block of
    // assistant text arrives as one big `text_delta` at block-stop time,
    // which feels like "no streaming" in the UI. With it on, the SDK emits
    // `stream_event` records carrying `content_block_delta` events that
    // `translator.ts:handleStreamEvent` forwards as fine-grained
    // `message_update.text_delta` / `thinking_delta` frames.
    includePartialMessages: true,
    // Force every tool call through canUseTool. Two layers must align:
    //   * `settingSources: []` keeps file-based settings (e.g. the user's
    //     `~/.claude/settings.json` `permissions.allow: ["Bash(*)"]`) out of
    //     the way — otherwise file allows pre-approve and canUseTool is
    //     skipped entirely.
    //   * `settings.permissions.ask: ["*"]` tells the CLI subprocess that
    //     every tool requires a permission prompt; the prompt is then routed
    //     to our canUseTool callback. Without this, the CLI uses its own
    //     "is this dangerous?" heuristic and silently auto-allows things
    //     like `Bash(echo …)`.
    settingSources: [...settingSources],
    settings: {
      // Force every built-in tool through `canUseTool`. The SDK's permission
      // grammar is `<ToolName>(<arg-glob>)` — wildcards are NOT supported in
      // the ToolName segment, so we have to enumerate. Keep this list in
      // sync with the Claude Code CLI's tool registry; missing tools will
      // silently auto-allow. Extra tools (e.g. plugin / MCP tools) can be
      // added via `AMARRE_CLAUDE_ASK_EXTRA` (comma-separated).
      permissions: { allow: [], deny: [], ask: [...askRules] },
    },
    permissionMode: opts.permissionMode ?? "default",
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    ...(opts.model ? { model: opts.model } : {}),
    ...(opts.additionalDirectories && opts.additionalDirectories.length > 0
      ? { additionalDirectories: [...opts.additionalDirectories] }
      : {}),
  };

  const sdkQuery = create({ prompt: promptQueue, options: queryOptions });

  // Spin up the optional Remote Claude controller. Returns null on disabled,
  // missing token, or transient failure — broker continues local-only.
  if (opts.remote) {
    const ro = opts.remote;
    void createRemoteController({
      ...ro,
      callbacks: {
        onInboundUserMessage: (msg) => {
          promptQueue.push(msg);
          // Surface the prompt to amarre clients so the UI shows it arriving.
          let summary = "";
          try {
            const content = (msg as SDKUserMessage).message?.content;
            if (typeof content === "string") summary = content;
            else if (Array.isArray(content)) {
              for (const b of content) {
                if (b && typeof b === "object" && (b as { type?: string }).type === "text") {
                  summary += (b as { text?: string }).text ?? "";
                }
              }
            }
          } catch {}
          writeOut(
            JSON.stringify({
              type: "amarre.remote_inbound",
              ccrSessionId: remote?.ccrSessionId,
              source: "claude.ai",
              content: preview(summary),
            }),
          );
        },
        onPermissionResponse: (res) => {
          const inner = (res as { response?: { request_id?: string; response?: Record<string, unknown> } })
            .response;
          const id = inner?.request_id;
          if (!id) return;
          const pending = pendingPermissions.get(id);
          if (!pending) return;
          if (pending.source !== null) return; // amarre already answered
          pending.source = "claude.ai";
          pendingPermissions.delete(id);
          const inner2 = inner.response as { behavior?: string; updatedInput?: Record<string, unknown> } | undefined;
          const behavior = inner2?.behavior;
          const decision = behavior === "allow" ? "allow" : "deny";
          pending.resolve(
            decision === "allow"
              ? { behavior: "allow", updatedInput: inner2?.updatedInput ?? pending.input }
              : { behavior: "deny", message: "User declined (claude.ai).", interrupt: true },
          );
          // Tell amarre clients to dismiss any open permission UI for this id.
          writeOut(
            JSON.stringify({
              type: "extension_ui_request",
              method: "notify",
              event: "permission_resolved",
              id,
            }),
          );
          writeOut(
            JSON.stringify({
              type: "amarre.remote_permission_decided",
              id,
              source: "claude.ai",
              decision,
            }),
          );
        },
        onInterrupt: () => {
          state.followUpQueue = [];
          state.steerQueue = [];
          sdkQuery.interrupt().catch((err: unknown) => {
            writeErr(
              `remote interrupt failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
        onSetModel: (model) => {
          sdkQuery.setModel(model).catch((err: unknown) => {
            writeErr(
              `remote setModel failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
        onSetPermissionMode: (mode) => {
          sdkQuery.setPermissionMode(mode).catch((err: unknown) => {
            writeErr(
              `remote setPermissionMode failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
          return { ok: true };
        },
        onClose: (code) => {
          writeOut(
            JSON.stringify({
              type: "amarre.remote_failed",
              ccrSessionId: remote?.ccrSessionId,
              code: code ?? null,
            }),
          );
          remote = null;
        },
      },
    })
      .then((handle) => {
        remote = handle;
        if (handle) {
          writeOut(
            JSON.stringify({
              type: "amarre.remote_attached",
              ccrSessionId: handle.ccrSessionId,
              mode: ro.mode,
              title: ro.title,
            }),
          );
        }
      })
      .catch((err: unknown) => {
        writeErr(
          `remote controller setup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
  }

  // Pump SDK messages → translator → stdout (and mirror to claude.ai).
  void (async () => {
    try {
      for await (const msg of sdkQuery) {
        const json = JSON.stringify(msg);
        const r = translateOutbound(json, state);
        for (const line of r.outbound) writeOut(line);
        // r.stdin from translateOutbound is `control_response` acks meant for
        // a real claude child; the SDK has no such channel — drop them.
        try {
          remote?.write(msg as SDKMessage);
        } catch {}
        const t = (msg as { type?: string }).type;
        if (t === "result") {
          try {
            remote?.sendResult();
            remote?.reportState("idle");
          } catch {}
        } else if (t === "user" || t === "assistant") {
          try {
            remote?.reportState("running");
          } catch {}
        }
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
        const pending = id ? pendingPermissions.get(id) : undefined;
        if (id && pending) {
          // Amarre is the first responder if `source` is still null. If it
          // was already set to "claude.ai", the SDK callback has been
          // resolved already — silently drop the late amarre answer.
          if (pending.source !== null) {
            ack(cmd.type, cmd.id);
            return;
          }
          pending.source = "amarre";
          pendingPermissions.delete(id);
          const confirmed = cmd.confirmed === true;
          pending.resolve(
            confirmed
              ? { behavior: "allow", updatedInput: pending.input }
              : { behavior: "deny", message: "User declined.", interrupt: true },
          );
          // Tell claude.ai its prompt is gone (no double-prompt).
          if (remote) {
            try {
              remote.sendControlCancelRequest(id);
            } catch {}
            writeOut(
              JSON.stringify({
                type: "amarre.remote_permission_decided",
                id,
                source: "amarre",
                decision: confirmed ? "allow" : "deny",
              }),
            );
          }
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
      const userMsg: SDKUserMessage = {
        type: "user",
        message: parsed.message as SDKUserMessage["message"],
        parent_tool_use_id: null,
      };
      promptQueue.push(userMsg);
      // Mirror to claude.ai/code. The SDK does not echo prompt-iterable items
      // back on its output stream, so without this the remote UI would only
      // see assistant replies and never the user's own messages. The bridge
      // filters echoes on inbound, so no loop.
      try {
        remote?.write(userMsg as SDKMessage);
      } catch {}
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
      for (const [id, pending] of pendingPermissions) {
        pending.resolve({ behavior: "deny", message: "broker shutting down", interrupt: true });
        pendingPermissions.delete(id);
      }
      promptQueue.close();
      // Drop the bridge transport. We deliberately do NOT delete the CCR
      // session — the user prunes it later via claude.ai/code.
      try {
        await remote?.close();
      } catch {}
      remote = null;
    },
  };
}

// Standalone entrypoint: spawned by `agents/claude-code/adapter.ts`.
if (import.meta.main) {
  const additional = (process.env.AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES ?? "")
    .split(":")
    .map((s) => s.trim())
    .filter(Boolean);
  const settingSources = (process.env.AMARRE_CLAUDE_SETTING_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as SettingSource[];
  // ASK rules: env var `AMARRE_CLAUDE_ASK` overrides the default list,
  // `AMARRE_CLAUDE_ASK_EXTRA` appends to it.
  const askOverride = (process.env.AMARRE_CLAUDE_ASK ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const askExtra = (process.env.AMARRE_CLAUDE_ASK_EXTRA ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const askRules =
    askOverride.length > 0 ? askOverride : [...DEFAULT_ASK_RULES, ...askExtra];

  // Remote Claude (PROTOCOL §14). Disabled when AMARRE_REMOTE_CLAUDE_MODE is
  // unset or "off". Default mode for downstream callers that pass an empty
  // string is also "off" so the wiring is opt-in.
  const remoteMode = (process.env.AMARRE_REMOTE_CLAUDE_MODE ?? "off").trim();
  const remoteEnabled = remoteMode === "dual";
  const sessionShortId = (() => {
    try {
      return crypto.randomUUID().slice(0, 8);
    } catch {
      return Date.now().toString(36);
    }
  })();
  const titlePrefix = (process.env.AMARRE_REMOTE_CLAUDE_TITLE_PREFIX ?? "amarre").trim() || "amarre";
  const remoteOpts = remoteEnabled
    ? ({
        mode: "dual" as const,
        tokenPath: process.env.AMARRE_REMOTE_CLAUDE_TOKEN_PATH ?? "/run/claude-oauth/token",
        baseUrl: process.env.AMARRE_REMOTE_CLAUDE_BASE_URL ?? "https://api.anthropic.com",
        title: `${titlePrefix}:${sessionShortId}`,
        tags: (process.env.AMARRE_REMOTE_CLAUDE_TAGS ?? "amarre")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        cwd: process.env.AMARRE_CLAUDE_CWD ?? process.cwd(),
        ...(process.env.AMARRE_CLAUDE_MODEL ? { model: process.env.AMARRE_CLAUDE_MODEL } : {}),
        ...(process.env.AMARRE_REMOTE_CLAUDE_TRUSTED_DEVICE_TOKEN_PATH
          ? { trustedDeviceTokenPath: process.env.AMARRE_REMOTE_CLAUDE_TRUSTED_DEVICE_TOKEN_PATH }
          : {}),
      } satisfies Omit<RemoteControllerOptions, "callbacks">)
    : undefined;

  const handle = runBroker({
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
    claudeBin: process.env.CLAUDE_BIN,
    model: process.env.AMARRE_CLAUDE_MODEL,
    permissionMode: process.env.AMARRE_CLAUDE_PERMISSION_MODE as PermissionMode | undefined,
    cwd: process.env.AMARRE_CLAUDE_CWD ?? process.cwd(),
    ...(additional.length > 0 ? { additionalDirectories: additional } : {}),
    ...(settingSources.length > 0 ? { settingSources } : {}),
    askRules,
    ...(remoteOpts ? { remote: remoteOpts } : {}),
  });
  const shutdown = (sig: NodeJS.Signals) => {
    process.stderr.write(`[broker] received ${sig}, shutting down\n`);
    void handle.close().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.stdin.on("end", () => void handle.close().finally(() => process.exit(0)));
}
