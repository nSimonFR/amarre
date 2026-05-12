# amarre — Specification

> Status: **descriptive**. This document specifies amarre as a product / protocol contract — what it does on the wire and to the user — independent of the language, runtime, UI framework, or internal architecture of any specific implementation. It is the agent-facing companion to `docs/PROTOCOL.md`, which is the normative wire-format spec.
>
> When this file disagrees with the code, the code wins and this file is the bug. When this file disagrees with `docs/PROTOCOL.md`, PROTOCOL.md wins for transport details. For the *current* implementation's file layout, runtime, and packages, see [§ Implementation pointers (current)](#implementation-pointers-current) at the end. Every claim in the main body must remain true after a hypothetical port to a different server language or mobile platform.

---

## 1. Purpose

`amarre` (French for *mooring line*) is a self-hosted, tailnet-only harness that lets a mobile client drive a stdio-based CLI coding agent — Claude Code, `pi`, and any future adapter that satisfies the contract in § 4 — through a remote-controlled chat UI with per-tool permission prompts and offline push notifications. It is the explicit self-hosted alternative to hosted "remote-control your coding agent" relays: same general shape (drive a coding agent from your phone), but the transport is **a WebSocket on your tailnet**, terminated only by your own server.

The product ships three roles:

1. A generic **server** that owns the lifecycle of N agent child processes, exposes a small REST control plane, and proxies each session's stdio over a WebSocket data plane.
2. Pluggable **agent adapters** — one per supported CLI agent — that satisfy the contract in § 4.
3. A **mobile / cross-platform client** that speaks the protocol, surfaces approval cards, streams assistant output, and registers for offline push.

The wire format is a **near-transparent proxy of the pi RPC schema** (Layer 4): the server adds exactly one new message type (`amarre.session_event`) plus an optional second (`amarre.push_sent`); everything else is the adapter's Layer-4 traffic verbatim. An adapter for an agent whose native dialect is not pi RPC is responsible for translating to pi RPC so a single client speaks one wire format across agents.

---

## 2. Hard invariants

These are load-bearing and must not be violated by any implementation.

1. **No public port.** The server binds loopback (`127.0.0.1` or the IPv6 equivalent) by default and that is the only sane value. Remote access is exclusively through a tailnet termination point (e.g. `tailscale serve`) that proxies to loopback. **The trust boundary is the Tailscale ACL.** Adding `0.0.0.0` binding, an internet-routable port, or any non-tailnet ingress is forbidden without first introducing in-band authentication.

2. **Server is an agent-agnostic transparent proxy at Layer 3.** Adapters parse / rewrite Layer 4; the server never does. The only server-synthesised frames on the WS are `amarre.session_event` and `amarre.push_sent`. Any new server-originated message MUST be added under the `amarre.*` `type` prefix and documented in PROTOCOL.md.

3. **Reserved namespaces.** Top-level field names starting with `_` and top-level `type` values starting with `amarre.` are reserved. Adapters MUST NOT emit them; clients MUST tolerate (log + ignore) unknown values.

4. **Per-session isolation.** Events from session A reach only session A's clients. Permission requests from session A are only seen by session A's clients. A crash in session A does not affect the server or any other session.

5. **Session-id discovery is via REST.** Clients MUST NOT cache session ids across server restarts; `GET /sessions` is authoritative.

6. **`extension_ui_response.id` MUST echo the originating `extension_ui_request.id`.** Both the server (no rewriting) and the client (caller-supplied ids preserved) depend on this.

7. **Unique instance ids.** Within a server, instance ids in the multi-instance configuration MUST be unique. Duplicates → boot-time error.

8. **The user owns the agent's home dir.** The server runs as a real user so the spawned agent inherits the user's home (`~/.pi/`, `~/.claude/`, MCP config, login state, etc.).

9. **Push payloads MUST NOT contain sensitive content.** `body` is bounded to 100 chars; `data` includes only ids / metadata. No file paths, no command output, no secrets.

10. **`cwd` for a session is the caller's responsibility.** Amarre does NOT create the directory, run `git worktree add`, or otherwise prepare the filesystem. Pass an existing absolute path.

---

## 3. REST control plane

All paths return JSON unless otherwise noted. Bodies are `application/json`. No auth header (the tailnet ACL is the only access-control layer).

| Method | Path                          | Body                                          | Success                                                            | Errors                                                                                                       |
|--------|-------------------------------|-----------------------------------------------|--------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| GET    | `/instances`                  | —                                             | `200` `[{id, agent}, …]`                                           | —                                                                                                            |
| GET    | `/sessions`                   | —                                             | `200` `[SessionSummary, …]`                                        | —                                                                                                            |
| POST   | `/sessions`                   | `{instanceId?, name?, cwd?, env?}`            | `201` `SessionSummary`                                             | `404 unknown_instance`, `429 max_sessions_reached {limit}`                                                   |
| GET    | `/sessions/<id>`              | —                                             | `200` `SessionSummary`                                             | `404 not_found`                                                                                              |
| DELETE | `/sessions/<id>`              | —                                             | `204` (no body)                                                    | `404 not_found`                                                                                              |
| POST   | `/sessions/<id>/restart`      | —                                             | `200` `SessionSummary`                                             | `404 not_found`, `409 already_running`, `410 instance_gone`                                                  |
| GET    | `/push/tokens`                | —                                             | `200` `[PushToken, …]`                                             | `503 push_disabled`                                                                                          |
| POST   | `/push/tokens`                | `{token, deviceName?, platform?}`             | `201` `PushToken` (first time) / `200` `PushToken` (already known) | `400 invalid_token`, `503 push_disabled`                                                                     |
| DELETE | `/push/tokens/<urlencoded>`   | —                                             | `204`                                                              | `503 push_disabled`                                                                                          |
| GET    | `/`                           | —                                             | —                                                                  | `426` body `Use /sessions/<id>; see docs/PROTOCOL.md` (transport rejection: clients must address a session) |

`SessionSummary` shape:
```json
{
  "id": "string",
  "name": "string|null",
  "instanceId": "string",
  "status": "running | crashed | stopped",
  "agent": "string",
  "spawnedAt": 1700000000000,
  "clients": 0,
  "exitCode": 0,
  "signal": "SIGTERM|null"
}
```
- `agent` is the adapter's reported name, or `"unknown"` if the originating instance has vanished from the current config.
- `spawnedAt` is the wall-clock millisecond timestamp of the most-recent spawn.
- `clients` is the count of currently-attached WSs.
- `exitCode` / `signal` are present iff the agent has exited.

`PushToken` shape:
```json
{
  "token": "string",
  "deviceName": "string|null (truncated to 64 chars)",
  "platform": "ios | android | web | null",
  "registeredAt": 1700000000000
}
```

Session ids are 12-character strings (UUID v4, hex-only, no dashes).

---

## 4. WebSocket data plane

Endpoint: `wss://<host>:<port>/sessions/<id>` (text frames only).

### 4.1 Upgrade rules

- `GET /sessions/<id>` with `Upgrade: websocket` and `<id>` in the session map and `status === "running"` → upgraded.
- Unknown id → `404`.
- Existing id but `status !== "running"` → `409` body `Session <status>; restart it first`.
- Any other path → falls through to REST.

### 4.2 Per-session forwarding

- Every newline-terminated JSON record on the child's stdout is broadcast to every connected client of that session (no parsing, no rewrite by the server).
- Every text frame received from a client is line-buffered and `\n`-appended to the child's stdin in arrival order.
- The server tracks the last inbound frame timestamp per session (used by the push grace-window rule in § 5.3).
- Any number of clients may attach to the same session; events fan out per-session.

### 4.3 Server-synthesised envelopes

These are the only frames the amarre server itself ever synthesises. Wire formats are **verbatim**; any new server-originated message MUST be added under the `amarre.*` `type` prefix.

| Direction | Shape                                                                                                              | Trigger                                                            |
|-----------|--------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| S → C     | `{"type":"amarre.session_event","event":"crashed","exitCode":N\|null,"signal":"SIGTERM"\|null}`                    | Child of a session exited while `status === "running"`. Emitted **once** per session, immediately before closing each WS with code `1011`. |
| S → C     | `{"type":"amarre.push_sent","trigger":"awaiting_input","tokens":N,"requestId":"<uuid>"}`                           | Awaiting-input push successfully dispatched to ≥ 1 token. Lets connected clients suppress duplicate UI. |

### 4.4 Session lifecycle

```
              POST /sessions
                   │
                   ▼
spawn ──▶ running ──── DELETE /sessions/<id> ──▶ stopped (deleted from map)
            │
            ▼  child exit (not via DELETE)
          crashed ──── POST /sessions/<id>/restart ──▶ running
```

Behavioural rules:
- Spawn merges instance-level `env` and request `env` (request wins) into the child's environment. `cwd` is passed straight through; amarre never creates the cwd directory.
- On child exit: if `status === "stopped"` (delete-initiated) the event is silent. Otherwise `status` flips to `"crashed"`, an `amarre.session_event` is broadcast, each WS is closed with code `1011`, and (if push is enabled) a `crashed` push is dispatched unconditionally (no grace, no suppression).
- The server process itself never exits on a session crash.
- `restart` rebuilds the child using the original spawn options; existing WSs are not re-attached — clients must reconnect.

---

## 5. Adapter contract

An adapter wraps an external CLI coding agent and translates between the agent's stdio protocol and amarre's WS envelopes. It is the only place agent-specific knowledge lives; the server treats every adapter identically.

### 5.1 Stdio shape

An adapter declares a `name` and exposes a spawn entry point that, given optional `{cwd, env}`, returns a child process whose stdio satisfies:

- accepts JSONL on stdin (one record per `\n`),
- emits JSONL on stdout (one record per `\n`),
- inherits the server's stderr (the server does not parse it),
- stays alive until killed or asked to exit.

### 5.2 Wire-format obligation

An adapter MUST emit envelopes that match the common wire format (pi RPC at Layer 4, as catalogued in `docs/PROTOCOL.md §6`) so a single client can drive any adapter without dialect switching. Adapters whose underlying agent already speaks pi RPC may pass it through; others MUST translate.

### 5.3 Permission-gating wire contract

For every tool the underlying agent attempts to call (except the plan-mode special case below), the adapter emits to the client:

```json
{"type":"extension_ui_request","id":"<uuid>","method":"confirm","title":"<tool name or prompt>","message":"<input preview>"}
```

The adapter holds the agent's permission decision open until a matching frame lands inbound:

```json
{"type":"extension_ui_response","id":"<uuid>","confirmed":true|false}
```

- `confirmed: true` → the adapter tells the agent the call may proceed with the original input.
- `confirmed: false` → the adapter tells the agent to deny the call (user-decline message) and interrupts.
- The response's `id` MUST echo the originating request's `id`; mismatched ids are dropped.
- If the per-session abort path fires while a permission is pending, the adapter resolves it as deny + interrupt with reason `"aborted"`. There is no fixed wall-clock timeout — the request stays pending until a response, an abort, or the agent itself goes away (default-deny on session crash).

### 5.4 Plan-mode capture wire contract

When the agent attempts to exit plan mode (i.e. calls its plan-exit tool), the adapter:

1. Captures the plan markdown from the tool input.
2. Emits a fire-and-forget envelope (no response expected, no `id`):
   ```json
   {"type":"extension_ui_request","method":"notify","event":"plan_capture","message":"<plan markdown>"}
   ```
3. Replies to the agent's permission decision with deny + message `"Plan captured; awaiting user feedback."`, so the agent waits for explicit follow-up from the user instead of executing the plan.

The user is not forced to accept or reject — the plan is surfaced to the client and the agent simply does not proceed.

### 5.5 Steering and lifecycle commands

The adapter MUST forward / honour the following inbound commands (pi-RPC verbatim where applicable):

- `prompt`, `follow_up`, `steer`, `get_state`, `get_messages` — routed into the agent's input stream.
- `abort` — drops queued follow-ups and interrupts the agent.
- `set_model`, `set_permission_mode` — apply to the agent if supported; ack via `response`.

### 5.6 Permission enumeration

Some agents require their built-in tools to be enumerated in an ASK list (no wildcards in the tool-name segment). The adapter is responsible for enumerating that list and exposing two env hooks: an "append" hook (extra tools, e.g. plugin / MCP) and a "replace" hook (full override). The default list itself is implementation churn; see appendix.

---

## 6. Push notifications

Push is an **optional** capability. If `AMARRE_PUSH_TOKENS_PATH` is unset, load fails, or the parent directory cannot be created, the entire push subsystem flips to disabled and every `/push/*` route returns `503 push_disabled`. The rest of the server is unaffected.

### 6.1 Token store

Tokens are persisted as an array of `PushToken` records (shape in § 3) in a single JSON file at `AMARRE_PUSH_TOKENS_PATH`, written atomically via temp file + rename. Loaded once at boot into an in-memory map.

Token validation accepts strings starting with `ExponentPushToken[` or `ExpoPushToken[`, ending with `]`, length ≤ 200.

### 6.2 Trigger contract

Every outbound child stdout line is scanned for `extension_ui_request` records. Each one starts a grace-window timer (default `AMARRE_PUSH_GRACE_MS = 15000` ms) keyed by `requestId`.

- A matching `extension_ui_response` on the inbound side cancels the timer (the user answered in-app).
- The timer firing triggers the **grace-window suppression rule**: if any client of that session has sent any frame within the last `graceMs`, the push is suppressed (the user is at the keyboard). Otherwise an `awaiting_input` push is dispatched.
- On successful dispatch to ≥ 1 token, the server broadcasts `{type:"amarre.push_sent","trigger":"awaiting_input","tokens":N,"requestId":"<id>"}` so connected clients can suppress duplicate UI.
- On session crash, all pending push timers are cancelled and a `crashed` push fires unconditionally.

### 6.3 Push payload

The server POSTs to the configured push provider (`AMARRE_PUSH_EXPO_URL`, defaults to `https://exp.host/--/api/v2/push/send`), chunked at 100 messages per HTTPS request. Each message has the verbatim shape:

```json
{
  "to": "<push token>",
  "title": "amarre · awaiting input",
  "body": "<first 100 chars of the summary>",
  "sound": "default",
  "data": {
    "amarre": "1",
    "trigger": "awaiting_input | crashed",
    "sessionId": "<id>",
    "sessionName": "<name | null>",
    "requestId": "<uuid>",
    "method": "confirm | select | input | editor"
  }
}
```

`requestId` + `method` are present only for `awaiting_input`. Title is `"amarre · session crashed"` for the crash variant.

### 6.4 Provider error handling

Provider responses are inspected for invalid-token errors (the Expo-shaped `details.error === "DeviceNotRegistered"`): offending tokens are removed from the store and the store persisted. Other provider error codes (`MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials`, …) are logged; tokens retained. Network failures are logged; nothing is removed.

---

## 7. Mobile client contract

The client is described by its observable behaviour, not its implementation.

- **Registers for push.** On first connect, derives the server's base URL from the connection settings, obtains a platform push token, and `POST /push/tokens` with `{token, deviceName, platform}` (best-effort with one retry). Short-circuits on web, simulator/emulator, denied permissions, or missing push project configuration.
- **Opens a WebSocket per session** at `<scheme>://<host>:<port>/sessions/<id>`. Single-flight reconnect with exponential backoff (1 s → 30 s cap). Caller-supplied frame `id`s are preserved (required so `extension_ui_response.id` echoes `extension_ui_request.id`). Frames sent before the socket is OPEN are queued and flushed FIFO on open.
- **Displays the chat stream** — streaming assistant output, tool-call cards (status / args summary / partial result / error state), a composer (send / steer / abort), and a crash banner with a restart button.
- **Prompts the user for tool-call confirmations.** On every `extension_ui_request{method:"confirm", …}`, surface a modal; on the user's decision, send `{type:"extension_ui_response", id, confirmed: true|false}` echoing the request's `id`.
- **Returns confirm/deny over the WS.** Mapping for non-confirm interactive methods is part of the wire contract:
  - `method: "select"` with non-empty `options` → first option for Allow, last for Deny (transported as that option's value).
  - `method: "input"` / `"editor"` → `{cancelled: true}` (free-text agent prompts are not yet a client surface).
  - `method: "notify"`, `"setStatus"`, `"setWidget"`, `"setTitle"`, `"set_editor_text"` → fire-and-forget, no response.
- **Honours `amarre.*` envelopes.** On `amarre.session_event`, mark the session terminated and do not auto-reconnect on the subsequent close. On `amarre.push_sent`, suppress duplicate awaiting-input UI for that request.
- **Routes push taps.** When a tapped notification has `data.amarre === "1"` and `data.sessionId`, navigate to the session-detail screen for that id (must work both for cold-launch and while-running paths).

The client may cache `{host, port, scheme}` and `{lastToken, base}` locally so a server move triggers a re-register.

---

## 8. Boundaries

- **Outbound — push provider.** The server POSTs to the configured push provider URL (Expo by default). The only data sent is the payload in § 6.3 (ids + metadata, no sensitive content). Disabling push removes this dependency entirely.
- **Inbound trust — Tailscale ACL.** The single trust boundary. No in-band auth.
- **Underlying CLI agents** (Claude Code, `pi`, …) — owned by the user, spawned as the user, with state under the user's home dir (`~/.pi/agent/`, `~/.claude/`). Survives server restarts; the in-RAM session map does not.
- **Inbound deps — mobile client.** Speaks REST + WS per § 3 / § 4 / § 7. May be any platform that can hold a tailnet IP and a WebSocket.

---

## 9. Configuration / deployment contract

### 9.1 Server env vars

| Var                         | Default                                | Meaning                                                                                                  |
|-----------------------------|----------------------------------------|----------------------------------------------------------------------------------------------------------|
| `AMARRE_PORT`               | `8341`                                 | Loopback TCP port.                                                                                       |
| `AMARRE_HOST`               | `127.0.0.1`                            | Bind address. **Keep on loopback.** External access through a tailnet termination point.                 |
| `AMARRE_MAX_SESSIONS`       | `8`                                    | Cap across all instances. `POST /sessions` returns 429 once reached.                                     |
| `AMARRE_AGENT`              | `pi`                                   | Legacy single-instance shortcut. Ignored when `AMARRE_INSTANCES_JSON` is set.                            |
| `AMARRE_AGENT_PATH`         | _unset_                                | Override adapter module path for the legacy synthetic instance (test hook).                              |
| `AMARRE_INSTANCES_JSON`     | _unset_                                | JSON array of `{id, agent, agentPath?, env}`. When set, the legacy fallback is ignored.                  |
| `AMARRE_PUSH_TOKENS_PATH`   | _unset_ (push off)                     | Path to the JSON push-token store. Setting it (and the dir being writable) enables the push subsystem.   |
| `AMARRE_PUSH_GRACE_MS`      | `15000`                                | Grace window before an `awaiting_input` push fires.                                                      |
| `AMARRE_PUSH_EXPO_URL`      | `https://exp.host/--/api/v2/push/send` | Push provider endpoint override (tests use a fake).                                                      |

Adapter-specific env (`PI_BIN`, `CLAUDE_BIN`, `AMARRE_PI_GATE`, `AMARRE_CLAUDE_*`, etc.) is part of each adapter's contract; the appendix documents the current set for the shipped adapters.

### 9.2 Multi-instance contract

`AMARRE_INSTANCES_JSON` is a JSON array of `{id, agent, agentPath?, env}` objects. One server can host multiple agent instances (e.g. `personal`, `work`, `pi`); each instance is isolated (its own adapter, its own env). The legacy single-instance fallback (`AMARRE_AGENT` + optional `AMARRE_AGENT_PATH`) synthesises one instance with id `"default"`.

Default-instance resolution for `POST /sessions` with no `instanceId`:
1. If an instance literally named `"default"` exists, use it.
2. Otherwise, use the first configured instance.

Per-instance `env` is merged **before** per-session `env` (session wins on conflict). Duplicate ids are a boot-time error.

### 9.3 Process model

One OS process per amarre server. Spawns one OS child per session via the configured adapter, with stdio pipes for stdin/stdout and the parent's stderr inherited.

Boot sequence:
1. Parse `AMARRE_INSTANCES_JSON` (or fall back to `AMARRE_AGENT` / `AMARRE_AGENT_PATH` for the synthetic `default` instance).
2. Load each instance's adapter module.
3. Initialise the push service if `AMARRE_PUSH_TOKENS_PATH` is set and writable; otherwise silently disable push.
4. Bind on `AMARRE_HOST:AMARRE_PORT`.
5. Install `SIGTERM` / `SIGINT` shutdown that signals all live children with `SIGTERM` and exits after 1.5 s.

### 9.4 NixOS module options (deployment surface)

The repo ships a NixOS module (`services.amarre = { … }`):
- `enable` (bool).
- `agent` (str, default `"pi"`) — legacy single-instance shortcut.
- `instances` (attrset of `{agent, env}`) — multi-instance. When non-empty, ignores `agent`.
- `port` (port, default `8341`).
- `host` (str, default `"127.0.0.1"`).
- `user` (str, required) — the systemd unit's `User`; `HOME` is set to `/home/<user>`.
- `maxSessions` (positive int, default `8`).
- `push.enable` (bool).
- `push.tokensPath` (str, default `/var/lib/amarre/push-tokens.json`).
- `push.graceMs` (positive int, default `15000`).
- `package` (package, default = the flake's server package).

With `push.enable`, `StateDirectory=amarre` provisions `/var/lib/amarre/` owned by `cfg.user`.

---

## 10. Failure modes

| Failure                                            | Surface                                                                                                              |
|----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Agent child exits unexpectedly                     | `amarre.session_event` to that session's clients + WS close `1011` + optional `crashed` push. Server stays up.       |
| Server crash (runtime OOM, etc.)                   | Process supervisor restarts after a backoff. All sessions gone — clients reconnect, `GET /sessions` is truth.        |
| Adapter module fails to load at boot               | Server fails to start; supervisor backs off.                                                                         |
| `AMARRE_INSTANCES_JSON` malformed                  | Server fails to start with `AMARRE_INSTANCES_JSON: …` error.                                                         |
| `POST /sessions` past `maxSessions`                | `429 {error:"max_sessions_reached", limit:N}`.                                                                       |
| `POST /sessions` with unknown `instanceId`         | `404 {error:"unknown_instance", instanceId:"…"}`.                                                                    |
| Restarting a running session                       | `409 {error:"already_running"}`.                                                                                     |
| Restart with the instance gone                     | `410 {error:"instance_gone", instanceId:"…"}`.                                                                       |
| WS connect to unknown id                           | `404 Session not found`.                                                                                             |
| WS connect to non-running id                       | `409 Session <status>; restart it first`.                                                                            |
| Push store unwritable / missing path               | Push subsystem flips to `enabled: false`; `/push/*` routes return `503 push_disabled`. Rest of server unaffected.    |
| Push token comes back as invalid                   | Token pruned from the store; future fires skip it.                                                                   |
| Push provider rate-limit / other ticket errors     | Logged; token retained.                                                                                              |
| Malformed JSON on WS                               | Logged, dropped. No reply.                                                                                           |
| Frame too large                                    | Server MAY drop the connection (implementation-defined).                                                             |
| Client tries `wss://host:port/` (no session path)  | `426 Upgrade Required` with hint pointing at PROTOCOL.md.                                                            |
| Upstream tool failure                              | Out of scope (amarre is agent-agnostic; the agent itself surfaces tool errors via its own envelopes).                |

---

## 11. Non-goals

- **A relay.** Amarre does not call out to any third party at the protocol level. The optional push subsystem is the one exception, and it ships only opaque ids — no agent content.
- **Multi-tenant gating.** All registered push tokens get every push. A future extension can add per-user filtering once an auth story exists.
- **Cross-session shared state.** Sessions are isolated by construction; no shared queue, broadcast group, or supervisor channel.
- **Session rehydration across server restarts.** Sessions don't survive server restarts. Recovering `cwd`/`env`/`name` and re-spawning on boot is a planned extension, not a current feature.
- **Authentication.** No bearer tokens, no `/login`, no cookies. The tailnet ACL is the only access-control layer.
- **A CLI client.** Not shipped; bringing your own with `websocat` works but is not a maintained surface.

---

## 12. Versioning

- **Wire protocol**: `docs/PROTOCOL.md §1`. Non-breaking additions bump the minor; renames / removals bump the major.
- **Server package**: best-effort SemVer; the wire protocol is the contract that matters.
- **Client package**: tracks the server independently.

---

## 13. Glossary

- **Adapter** — a module that wraps an external CLI coding agent, translating between the agent's stdio dialect and amarre's WS envelopes, and gating tool permissions via § 5.3.
- **Instance** — a named, env-isolated agent configuration (e.g. `personal`, `work`). One server hosts many instances.
- **Session** — one live child process spawned from one instance. Has an id, a `cwd`, an env, a status, and a set of attached WS clients.
- **Envelope** — a top-level JSON record on the WS. Either adapter-emitted (Layer 4) or an `amarre.*`-prefixed server-synthesised one.
- **Grace window** — the delay between an `extension_ui_request` going out and an awaiting-input push firing, suppressed by either a matching response or any inbound WS frame within the window.

---

<a id="implementation-pointers-current"></a>
## Implementation pointers (current)

This appendix describes the *current* implementation. Everything above is the language- and architecture-agnostic contract; everything here is subject to change without a protocol bump.

**Server.** Single-file TypeScript program running on Bun. Entrypoint at `server/server.ts`; adapter contract type at `server/adapter.ts`; push subsystem at `server/push.ts`. Sessions are spawned via `node:child_process.spawn()` with stdio `[pipe, pipe, inherit]`.

**Adapters.** Under `agents/<name>/`.
- `agents/pi/` — pi adapter + a permission-gate pi extension that translates pi's `tool_call` event into a `ctx.ui.confirm()` call (which becomes `extension_ui_request{method:"confirm"}` on the wire).
- `agents/claude-code/` — adapter, SDK broker, legacy/raw translator, and a local copy of pi event types. The broker imports `@anthropic-ai/claude-agent-sdk` and drives its `query({prompt, options})` interface; `canUseTool` is the permission callback, `query.interrupt() / setModel() / setPermissionMode()` are the steering hooks. Currently the claude-code adapter supports three internal modes selectable by env var — SDK broker (default), legacy translator (`AMARRE_CLAUDE_LEGACY=1`, no permission gate), raw passthrough (`AMARRE_CLAUDE_RAW=1`, native Claude stream-json on the WS). Only the SDK broker satisfies § 5.3 / § 5.4; the other two exist for debugging and as a fallback when the SDK is unavailable.

**Default ASK rules (claude-code broker).** Enumerates every built-in Claude Code tool: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `NotebookEdit`, `Task`, `TodoWrite`, `AskUserQuestion`, `ExitPlanMode`, `EnterPlanMode`, `Skill` (each with `(*)` argument wildcard). The list grows when Claude Code ships a new built-in tool. Append via `AMARRE_CLAUDE_ASK_EXTRA`, replace via `AMARRE_CLAUDE_ASK`.

**Adapter env (current).** pi: `PI_BIN` (default `pi`), `AMARRE_PI_GATE` (default bundled); adapter adds `PI_TELEMETRY=0`. claude-code: `CLAUDE_BIN`, `AMARRE_BUN_BIN`, `AMARRE_CLAUDE_BROKER`, `AMARRE_CLAUDE_MODEL`, `AMARRE_CLAUDE_LEGACY`, `AMARRE_CLAUDE_RAW`, `AMARRE_CLAUDE_PERMISSION_MODE`, `AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES`, `AMARRE_CLAUDE_SETTING_SOURCES`, `AMARRE_CLAUDE_ASK`, `AMARRE_CLAUDE_ASK_EXTRA`, `AMARRE_CLAUDE_EXTRA_ARGS`, `AMARRE_CLAUDE_CWD`.

**Mobile client.** Expo / React Native cross-platform app under `apps/expo/` (iOS, Android, web from one codebase). expo-router for file-based routing. High-level provider at `apps/expo/src/lib/AmarreProvider.tsx`; WS client at `apps/expo/src/lib/ws/client.ts` (`AmarreClient`); REST helpers at `apps/expo/src/lib/rest/sessions.ts`; per-session store under `apps/expo/src/lib/store/` (consumed via `useSyncExternalStore`); push registration split between `apps/expo/src/lib/push/register.ts` (pure, injectable) and `apps/expo/src/lib/push/register.expo.ts` (production bindings). Globally-mounted permission modal: `PermissionSheet`. AsyncStorage keys: `amarre.settings.v1` ({host, port, scheme}), `amarre.push.lastToken.v1` ({token, base}).

**EAS project id (production builds).** `app.json` is pinned to `78540bb0-bcff-4616-b69c-42342c2247de`. Sandbox builds (Expo Go's "store client" execution environment) register against the platform's anonymous project — no projectId required.

**Repo layout** (root): `server/` (TS server), `agents/` (adapters), `apps/expo/` (Expo client), `apps/ios/` (placeholder), `tests/fixtures/` (`echo-agent.sh`, `echo-adapter.ts`), `docs/PROTOCOL.md` (normative wire spec), `flake.nix` + `module.nix` (Nix packaging + NixOS module), `package.json` + `bun.lock` (Bun-based monorepo).

**Testing.** Test suite covers: server single-session round-trip, fanout, split-line buffering, list/spawn/delete, crash isolation, restart, max-sessions, multi-instance routing, push store + dispatcher (unit + e2e against a fake provider). Adapters: pi permission-gate against a mock extension API; claude-code translator unit tests; broker against a fake SDK query; adapter spawn-shape + legacy-mode e2e against a fake CLI. Client: per-session store reducer, WS client reconnect/queueing/id preservation, push registration decision tree. The Nix flake exposes a `checks` derivation that runs the full suite in a sandbox.
