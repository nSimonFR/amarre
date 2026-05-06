// Optional façade over `@anthropic-ai/claude-agent-sdk/bridge` that mirrors and
// drives an amarre claude-code session via Anthropic's CCR backend (claude.ai/code).
//
//   amarre WS ─┐
//              ├─▶ broker ──▶ query() ──▶ claude binary
//   claude.ai ─┘             ▲
//                            │ (this module)
//
// The broker passes inbound prompts / permission answers / interrupts to its
// existing handlers; this module relays SDK output messages outward and wires
// the SDK's `Query` controls (`interrupt`, `setModel`, `setPermissionMode`)
// to the bridge's incoming events.
//
// Goals:
//   * Graceful degrade: never throw upward. Disabled / token-missing /
//     transient bridge failure all return `null`. Terminal auth failures
//     (`untrusted_device`, `session_stale_relogin`) are logged once and also
//     return `null`. The broker treats `null` as "local-only mode".
//   * Stateless w.r.t. amarre itself: this module knows nothing about amarre's
//     WS clients; the broker owns the routing and decides what to broadcast.
//   * Persist the CCR session: callers do NOT call DELETE on close. The user
//     prunes via claude.ai when finished.

import {
  attachBridgeSession as defaultAttachBridgeSession,
  createCodeSession as defaultCreateCodeSession,
  fetchRemoteCredentials as defaultFetchRemoteCredentials,
  isCredentialsFailure as defaultIsCredentialsFailure,
  type AttachBridgeSessionOptions,
  type BridgeSessionHandle,
  type CredentialsFailure,
  type RemoteCredentials,
  type SessionState,
} from "@anthropic-ai/claude-agent-sdk/bridge";
import type {
  PermissionMode,
  SDKControlRequest,
  SDKControlResponse,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

const HTTP_TIMEOUT_MS = 30_000;

export type RemoteControllerCallbacks = {
  onInboundUserMessage: (msg: SDKUserMessage) => void;
  onPermissionResponse: (res: SDKControlResponse) => void;
  onInterrupt: () => void;
  onSetModel: (model: string | undefined) => void;
  onSetPermissionMode: (mode: PermissionMode) => { ok: true } | { ok: false; error: string };
  onClose: (code?: number) => void;
};

export interface RemoteControllerOptions {
  /** "off" disables the layer entirely (returns null). "dual" attaches without `outboundOnly`. */
  readonly mode: "off" | "dual";
  /** OAuth bearer file. Read once at startup; refreshes happen out-of-band. */
  readonly tokenPath: string;
  /** API root, e.g. `https://api.anthropic.com`. */
  readonly baseUrl: string;
  /** Title shown on claude.ai/code (e.g. `<hostname>:<short-id>`). */
  readonly title: string;
  /** Tags list passed to `createCodeSession`. */
  readonly tags?: ReadonlyArray<string>;
  /** Working directory shown on claude.ai/code. */
  readonly cwd?: string;
  /** Model hint for the session (advisory; SDK still chooses). */
  readonly model?: string;
  /** Trusted-device token file, when bridge auth is in elevated mode. */
  readonly trustedDeviceTokenPath?: string;
  /** Callbacks the broker plugs in. */
  readonly callbacks: RemoteControllerCallbacks;
  /** DI overrides — used by the unit tests. */
  readonly deps?: Partial<RemoteControllerDeps>;
}

export interface RemoteControllerDeps {
  createCodeSession: typeof defaultCreateCodeSession;
  fetchRemoteCredentials: typeof defaultFetchRemoteCredentials;
  isCredentialsFailure: typeof defaultIsCredentialsFailure;
  attachBridgeSession: (opts: AttachBridgeSessionOptions) => Promise<BridgeSessionHandle>;
  /** Defaults to `Bun.file(p).text()`. Returning `null` simulates "missing". */
  readTextFile: (path: string) => Promise<string | null>;
  /** Where status / failure lines go. Defaults to stderr. */
  log: (line: string) => void;
}

export interface RemoteControllerHandle {
  readonly ccrSessionId: string;
  /** Forward an SDK message (assistant, tool result, etc.) to claude.ai. */
  write(msg: SDKMessage): void;
  /** Signal turn boundary so claude.ai stops the spinner. */
  sendResult(): void;
  /** Forward a `can_use_tool` permission request originating from the broker. */
  sendControlRequest(req: SDKControlRequest): void;
  /** Tell claude.ai to dismiss a pending permission prompt (amarre answered first). */
  sendControlCancelRequest(requestId: string): void;
  /** PUT /worker state (`running` / `requires_action` / `idle`). */
  reportState(state: SessionState): void;
  /** PUT /worker external_metadata (branch, dir). */
  reportMetadata(meta: Record<string, unknown>): void;
  /** Drop the bridge transport. Does NOT delete the CCR session by design. */
  close(): Promise<void>;
}

async function defaultReadTextFile(path: string): Promise<string | null> {
  try {
    const f = Bun.file(path);
    if (!(await f.exists())) return null;
    return await f.text();
  } catch {
    return null;
  }
}

function defaultLog(line: string): void {
  try {
    process.stderr.write(`[remote] ${line}\n`);
  } catch {}
}

/**
 * Try to attach a Remote Claude controller. Returns `null` on disabled /
 * token-missing / transient failure / terminal auth failure. Never throws.
 */
export async function createRemoteController(
  opts: RemoteControllerOptions,
): Promise<RemoteControllerHandle | null> {
  const log = opts.deps?.log ?? defaultLog;
  if (opts.mode === "off") return null;

  const deps: RemoteControllerDeps = {
    createCodeSession: opts.deps?.createCodeSession ?? defaultCreateCodeSession,
    fetchRemoteCredentials: opts.deps?.fetchRemoteCredentials ?? defaultFetchRemoteCredentials,
    isCredentialsFailure: opts.deps?.isCredentialsFailure ?? defaultIsCredentialsFailure,
    attachBridgeSession: opts.deps?.attachBridgeSession ?? defaultAttachBridgeSession,
    readTextFile: opts.deps?.readTextFile ?? defaultReadTextFile,
    log,
  };

  const tokenRaw = await deps.readTextFile(opts.tokenPath);
  if (tokenRaw == null) {
    log(`disabled: token unreadable at ${opts.tokenPath}`);
    return null;
  }
  const accessToken = tokenRaw.trim();
  if (!accessToken) {
    log(`disabled: token file empty at ${opts.tokenPath}`);
    return null;
  }

  let trustedDeviceToken: string | undefined;
  if (opts.trustedDeviceTokenPath) {
    const raw = await deps.readTextFile(opts.trustedDeviceTokenPath);
    if (raw != null && raw.trim()) trustedDeviceToken = raw.trim();
  }

  let ccrSessionId: string | null;
  try {
    ccrSessionId = await deps.createCodeSession(
      opts.baseUrl,
      accessToken,
      opts.title,
      HTTP_TIMEOUT_MS,
      opts.tags ? [...opts.tags] : undefined,
      undefined, // gitContext: not modelled here; broker may surface later
      opts.cwd,
      opts.model,
    );
  } catch (err) {
    log(`createCodeSession threw: ${errMsg(err)}`);
    return null;
  }
  if (!ccrSessionId) {
    log("createCodeSession returned null (transient)");
    return null;
  }

  let credsResult: RemoteCredentials | CredentialsFailure | null;
  try {
    credsResult = await deps.fetchRemoteCredentials(
      ccrSessionId,
      opts.baseUrl,
      accessToken,
      HTTP_TIMEOUT_MS,
      trustedDeviceToken,
    );
  } catch (err) {
    log(`fetchRemoteCredentials threw on ${ccrSessionId}: ${errMsg(err)}`);
    return null;
  }
  if (!credsResult) {
    log(`fetchRemoteCredentials returned null on ${ccrSessionId} (transient)`);
    return null;
  }
  if (deps.isCredentialsFailure(credsResult)) {
    const reason = (credsResult as CredentialsFailure).reason;
    const hint =
      reason === "untrusted_device"
        ? "enroll a trusted device token (see AMARRE_REMOTE_CLAUDE_TRUSTED_DEVICE_TOKEN_PATH)"
        : "re-authenticate with `claude` (OAuth session stale)";
    log(`terminal auth failure on ${ccrSessionId}: ${reason} — ${hint}`);
    return null;
  }
  const creds = credsResult as RemoteCredentials;

  const cb = opts.callbacks;
  let handle: BridgeSessionHandle;
  try {
    handle = await deps.attachBridgeSession({
      sessionId: ccrSessionId,
      ingressToken: creds.worker_jwt,
      apiBaseUrl: creds.api_base_url,
      epoch: creds.worker_epoch,
      onInboundMessage: (msg) => {
        if (msg.type === "user") cb.onInboundUserMessage(msg as SDKUserMessage);
      },
      onPermissionResponse: cb.onPermissionResponse,
      onInterrupt: cb.onInterrupt,
      onSetModel: cb.onSetModel,
      onSetPermissionMode: cb.onSetPermissionMode,
      onClose: cb.onClose,
    });
  } catch (err) {
    log(`attachBridgeSession threw on ${ccrSessionId}: ${errMsg(err)}`);
    return null;
  }

  log(`attached ccrSessionId=${ccrSessionId}`);
  return {
    ccrSessionId,
    write: (msg) => safeCall(() => handle.write(msg), log, "write"),
    sendResult: () => safeCall(() => handle.sendResult(), log, "sendResult"),
    sendControlRequest: (req) =>
      safeCall(() => handle.sendControlRequest(req), log, "sendControlRequest"),
    sendControlCancelRequest: (id) =>
      safeCall(() => handle.sendControlCancelRequest(id), log, "sendControlCancelRequest"),
    reportState: (s) => safeCall(() => handle.reportState(s), log, "reportState"),
    reportMetadata: (m) => safeCall(() => handle.reportMetadata(m), log, "reportMetadata"),
    close: async () => {
      try {
        await handle.flush();
      } catch {}
      try {
        handle.close();
      } catch {}
    },
  };
}

function safeCall(fn: () => void, log: (s: string) => void, label: string): void {
  try {
    fn();
  } catch (err) {
    log(`${label} threw: ${errMsg(err)}`);
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
