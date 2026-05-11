# amarre — Specification

> Status: **descriptive**. This document specifies amarre as it is currently implemented in this repository (commit at time of writing). It is the agent-facing companion to `docs/PROTOCOL.md`, which is the normative wire-format spec.
>
> When this file disagrees with the code, the code wins and this file is the bug. When this file disagrees with `docs/PROTOCOL.md`, PROTOCOL.md wins for transport details.

---

## 1. Purpose

`amarre` (French for *mooring line*) is a self-hosted, tailnet-only WebSocket harness that turns a stdio-streaming CLI coding agent — currently `pi-coding-agent` or Anthropic's `claude` CLI — into a multi-session, multi-client service addressable from a phone, laptop, or any other Tailnet-joined device. It is the explicit self-hosted alternative to Anthropic's hosted "Claude Code Remote Control": same general shape (control a coding agent from your phone), but the transport is **a WebSocket on your tailnet**, not a third-party relay. There is no Anthropic-side service in the loop.

The repo ships three things:

1. A generic **server** (`server/`, ~500 LOC Bun) that owns the lifecycle of N agent child processes and proxies their stdin/stdout over WebSockets.
2. Two pluggable **agent adapters** (`agents/pi/`, `agents/claude-code/`) that know how to spawn one specific CLI agent in a JSONL-streaming mode.
3. An **Expo cross-platform client** (`apps/expo/`, iOS + Android + web) that speaks the protocol and surfaces approval cards, streaming assistant output, tool calls, and crash banners.

The wire format is intentionally a **near-transparent proxy of pi's RPC schema** — the server adds exactly one new message type (`amarre.session_event`) plus an optional second (`amarre.push_sent`); everything else is pi's Layer 4 verbatim. The claude-code adapter ships an SDK-driven *broker* that translates Anthropic's SDK output into the same pi-RPC schema so a single client can drive both agents without dialect switching.

---

## 2. Architecture overview

```
┌───────────────────────┐   wss/https over tailnet      ┌────────────────────────────────┐
│ Expo client           │ ─────────────────────────────▶│ amarre server (Bun, single bin) │
│ (apps/expo/)          │                                │ - REST control plane            │
│                       │ ◀──────────────────────────── │ - WS data plane                 │
│ - AmarreClient (WS)   │                                │ - N agent processes             │
│ - REST helpers        │                                │ - optional Expo Push dispatcher │
└───────────────────────┘                                └────────────────────────────────┘
        ▲                                                          │
        │  OS-level push (optional)                                │  spawn() + stdin/stdout JSONL
        │   via Expo Push Service                                  ▼
┌───────────────────────┐                          ┌──────────────────────────────────┐
│ exp.host (Expo Push)  │ ◀── HTTPS POST ───────── │ adapter: agents/<name>/adapter.ts │
└───────────────────────┘                          │   pi / claude-code (SDK broker)    │
                                                   └──────────────────────────────────┘
                                                              │  exec
                                                              ▼
                                                   ┌──────────────────────────────────┐
                                                   │ CLI agent process (pi | claude)   │
                                                   │  - stdin: pi-RPC JSONL            │
                                                   │  - stdout: pi-RPC JSONL events    │
                                                   └──────────────────────────────────┘
```

**Trust boundary**: the Tailscale ACL. There is no in-band authentication. The server binds loopback (`127.0.0.1`) by design; remote access goes through `tailscale serve` which terminates TLS on the tailnet interface and proxies to loopback.

**State boundary**: sessions are ephemeral RAM-only in the server. The agent's own conversation history is on disk under the agent's own paths (`~/.pi/agent/`, `~/.claude/`) and survives server restarts; the *session map* (which session ids are alive) does not.

**Concurrency**: each amarre server hosts up to `maxSessions` (default 8) concurrent agent processes, optionally partitioned into named *instances* (e.g. `personal`, `work`, `pi`). Each session may have any number of connected clients; events fan out per-session.

---

## 3. Repository layout

```
amarre/
├── server/
│   ├── server.ts                      # entrypoint: REST + WS + lifecycle
│   ├── adapter.ts                     # AgentAdapter + SpawnOpts contract
│   ├── push.ts                        # Expo Push token store + dispatcher
│   ├── server.test.ts                 # single-session round-trip / fanout
│   ├── multi.test.ts                  # multi-session / crash isolation / restart
│   ├── instances.test.ts              # multi-instance routing
│   ├── push.test.ts                   # push store + dispatcher unit tests
│   └── push.integration.test.ts       # push end-to-end against fake Expo
├── agents/
│   ├── README.md                      # contract for adapter authors
│   ├── pi/
│   │   ├── adapter.ts                 # spawns `pi --mode rpc -e <gate>`
│   │   ├── permission-gate.ts         # pi extension; tool_call → confirm
│   │   ├── permission-gate.test.ts
│   │   └── README.md
│   └── claude-code/
│       ├── adapter.ts                 # picks broker / legacy / raw mode
│       ├── broker.ts                  # SDK-driven; canUseTool ↔ ext_ui_request
│       ├── broker.test.ts
│       ├── translator.ts              # SDKMessage / stream-json ↔ pi RPC
│       ├── translator.test.ts
│       ├── pi-types.ts                # local copy of pi event types
│       ├── adapter.test.ts
│       ├── tests/fixtures/fake-claude.sh
│       └── README.md
├── apps/
│   ├── README.md
│   ├── expo/                          # Expo SDK 54 + React Native 0.81 client
│   │   ├── app/                       # expo-router file-based routes
│   │   ├── src/
│   │   │   ├── design/                # design system (tokens / atoms / phone)
│   │   │   ├── lib/
│   │   │   │   ├── AmarreProvider.tsx
│   │   │   │   ├── ws/client.ts       # AmarreClient
│   │   │   │   ├── ws/jsonl.ts
│   │   │   │   ├── rest/sessions.ts   # REST helpers
│   │   │   │   ├── persistence/settings.ts
│   │   │   │   ├── protocol/          # envelope + pi types
│   │   │   │   ├── push/register.ts   # pure
│   │   │   │   ├── push/register.expo.ts  # Expo-backed deps
│   │   │   │   └── store/             # singleton observable per-session store
│   │   │   └── screens/               # Connect / Sessions / Chat / …
│   │   ├── app.json                   # Expo config + EAS projectId
│   │   ├── package.json
│   │   └── PLAN.md
│   └── ios/                           # placeholder; no source
├── tests/
│   └── fixtures/
│       ├── echo-agent.sh              # stand-in CLI agent
│       └── echo-adapter.ts            # adapter that spawns echo-agent.sh
├── docs/
│   └── PROTOCOL.md                    # normative wire spec (v2.2.0)
├── flake.nix                          # packages.<system>.server + nixosModules.amarre
├── module.nix                         # services.amarre NixOS module
├── package.json                       # root: name "amarre", bun
├── bun.lock
└── README.md
```

---

## 4. Server (back end)

### 4.1 Process model

Single-file Bun program at `server/server.ts`. One OS process per amarre server. Spawns one OS child per session via `node:child_process.spawn()` returned by the adapter; stdio is `[pipe, pipe, inherit]`.

Boot sequence:

1. Parse `AMARRE_INSTANCES_JSON` (or fall back to `AMARRE_AGENT` / `AMARRE_AGENT_PATH` for the synthetic `default` instance).
2. Dynamic-`import()` each instance's adapter at `agents/<name>/adapter.ts` (or `agentPath` override).
3. Initialise the push service if `AMARRE_PUSH_TOKENS_PATH` is set and writable; otherwise the push subsystem is silently disabled.
4. `Bun.serve({hostname: AMARRE_HOST, port: AMARRE_PORT, …})` — defaults `127.0.0.1:8341`.
5. Install `SIGTERM` / `SIGINT` shutdown that `kill("SIGTERM")` all live children and exits after 1.5 s.

Session ids are 12-character strings (UUID v4, hex-only, no dashes).

### 4.2 REST control plane

All paths return JSON unless otherwise noted. Bodies are `application/json`. No auth header.

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
```ts
{
  id: string;
  name?: string;
  instanceId: string;
  status: "running" | "crashed" | "stopped";
  agent: string;              // adapter.name; "unknown" if the instance vanished
  spawnedAt: number;          // Date.now() at most-recent spawn
  clients: number;            // count of currently-attached WSs
  exitCode?: number;          // present iff agent has exited
  signal?: NodeJS.Signals;    // present iff agent exited via signal
}
```

`PushToken` shape:
```ts
{
  token: string;              // "ExponentPushToken[…]" or "ExpoPushToken[…]"
  deviceName?: string;        // truncated to 64 chars
  platform?: "ios" | "android" | "web";
  registeredAt: number;
}
```

### 4.3 WebSocket data plane

Endpoint: `wss://<host>:<port>/sessions/<id>` (text frames only).

Upgrade rules:
- `GET /sessions/<id>` with `Upgrade: websocket` and `<id>` in the session map and `status === "running"` → upgraded.
- Unknown id → `404`.
- Existing id but `status !== "running"` → `409` body `Session <status>; restart it first`.
- Any other path → falls through to REST.

Per-session behaviour:
- Every newline-terminated JSON record on the child's stdout is broadcast to every connected client of that session (no parsing, no rewrite).
- Every text frame received from a client is line-buffered and `\n`-appended to the child's stdin in arrival order.
- `lastInboundMs` is updated on every received frame (used to suppress `awaiting_input` push when a human is clearly typing).
- Server-initiated frames the server itself synthesises:
  - `{"type":"amarre.session_event","event":"crashed","exitCode":N,"signal":S}` — emitted **once** to every client of a session whose child exited (when `status` was not already `"stopped"`), immediately before closing each WS with code `1011`.
  - `{"type":"amarre.push_sent","trigger":"awaiting_input","tokens":N,"requestId":"<uuid>"}` — emitted after a successful awaiting-input push fan-out, so clients can suppress duplicate UI.

### 4.4 Session lifecycle

State machine:

```
              POST /sessions
                   │
                   ▼
spawn ──▶ running ──── DELETE /sessions/<id> ──▶ stopped (deleted from map)
            │
            ▼  child exit (not via DELETE)
          crashed ──── POST /sessions/<id>/restart ──▶ running
```

Implementation details (`server.ts`):
- `spawnSession()` creates the child via `adapter.spawn(SpawnOpts)`, where `SpawnOpts.env` is the merge of `instance.env` and request `env` (request wins). `cwd` is passed straight through; **amarre never creates the cwd directory** — caller's responsibility.
- `attachChild()` wires the child's stdout to a line buffer that broadcasts complete lines to all session clients and inspects them for push triggers.
- On `child.exit`: if `status === "stopped"` (i.e. delete-initiated) the event is silent. Otherwise `status` flips to `"crashed"`, an `amarre.session_event` is broadcast, each WS is closed with code `1011`, and (if push is enabled) a `crashed` push is dispatched unconditionally.
- The server process itself never exits on a session crash.
- `restart` rebuilds the child using the original `SpawnOpts` (already merged at spawn time); existing WSs are not re-attached — clients must reconnect.

### 4.5 Multi-instance configuration

`AMARRE_INSTANCES_JSON` is a JSON array of `{id, agent, agentPath?, env}` objects. The legacy single-instance fallback (`AMARRE_AGENT` + optional `AMARRE_AGENT_PATH`) synthesises one instance with id `"default"`.

Default-instance resolution for `POST /sessions` with no `instanceId`:
1. If an instance literally named `"default"` exists, use it.
2. Otherwise, use the first configured instance.

Per-instance `env` is merged **before** per-session `env` (session wins on conflict).

### 4.6 Push-notification subsystem (`server/push.ts`)

Optional capability (`PROTOCOL.md §13`). Three things:

1. **Token store** — a single JSON file (`AMARRE_PUSH_TOKENS_PATH`, written atomically via `tmp.<pid>` + `rename`). One array of `PushToken` records. Loaded once at boot into an in-memory `Map<token, PushToken>`. If the path is unset, load fails, or `mkdir` of its parent fails, the entire push service flips to `enabled: false` and every `/push/*` route returns `503`.

2. **Trigger detection** — `maybeInspectAgentLine()` scans every outbound child stdout line for `extension_ui_request` records and starts a `setTimeout(graceMs)` keyed by `requestId`. `cancelPendingPushIfMatch()` cancels the timer when a matching `extension_ui_response` lands. If the timer fires:
   - If a client of that session has sent any frame within the last `graceMs`, the push is suppressed (the user is at the keyboard).
   - Otherwise, `push.send("awaiting_input", …)` is called and on success a `amarre.push_sent` envelope is broadcast.
   On session crash, all pending push timers are cancelled and a `push.send("crashed", …)` fires unconditionally (no grace, no suppression).

3. **Dispatcher** — `push.send()` builds Expo push messages (one per known token, chunked at 100 per HTTPS request to `https://exp.host/--/api/v2/push/send`, configurable via `AMARRE_PUSH_EXPO_URL` for tests). Each message:
   ```json
   {
     "to": "<ExponentPushToken[…]>",
     "title": "amarre · awaiting input"   // or "amarre · session crashed"
     "body": "<first 100 chars of the summary>",
     "sound": "default",
     "data": {
       "amarre": "1",
       "trigger": "awaiting_input" | "crashed",
       "sessionId": "<id>",
       "sessionName": "<name | null>",
       // awaiting_input only:
       "requestId": "<uuid>",
       "method": "confirm" | "select" | "input" | "editor"
     }
   }
   ```
   Tickets with `details.error === "DeviceNotRegistered"` cause the offending token to be removed from the store and the store persisted. Other Expo error codes (`MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials`) are logged; tokens retained. Fetch failures are logged; nothing is removed.

`isExpoPushToken()` validation: starts with `ExponentPushToken[` or `ExpoPushToken[`, ends with `]`, length ≤ 200.

---

## 5. Agent adapters

### 5.1 `AgentAdapter` contract (`server/adapter.ts`)

```ts
type AgentChild = ChildProcessByStdio<Writable, Readable, null>;

interface SpawnOpts {
  cwd?: string;
  env?: Record<string, string>;
}

interface AgentAdapter {
  name: string;
  spawn(opts?: SpawnOpts): AgentChild;
}
```

The spawned child must:
- accept JSONL on stdin (one record per `\n`),
- emit JSONL on stdout,
- stay alive until killed or asked to exit.

stderr inherits (the server doesn't care). The adapter is resolved by `import("agents/<name>/adapter.ts")` at server boot.

### 5.2 `agents/pi/`

Adapter spawns:

```
pi --mode rpc -e <agents/pi/permission-gate.ts>
```

Env vars consumed by the adapter:
- `PI_BIN` — path to the `pi` binary (default: `pi`).
- `AMARRE_PI_GATE` — path to the gate (default: `./permission-gate.ts`).

Per-spawn env adds `PI_TELEMETRY=0`.

The gate (`permission-gate.ts`) is a tiny pi extension:

```ts
pi.on("tool_call", async (event, ctx) => {
  const ok = await ctx.ui.confirm(`Run ${event.toolName}?`, summary);
  if (!ok) return { block: true, reason: "denied by remote user" };
});
```

In pi's `--mode rpc`, `ctx.ui.confirm()` becomes an `extension_ui_request{method:"confirm"}` on the wire. The matching `extension_ui_response` from a client resolves the gate.

Wire format on the WS for a pi session is pi's RPC schema verbatim — see `docs/PROTOCOL.md §6` for the inventory.

### 5.3 `agents/claude-code/`

Three modes selected by env var:

| Mode             | Trigger                       | Wire format         | Permission gate                                                  |
|------------------|-------------------------------|---------------------|------------------------------------------------------------------|
| SDK broker (default) | _none_                    | pi-RPC              | `canUseTool` → `extension_ui_request{method:"confirm"}`          |
| Legacy translator    | `AMARRE_CLAUDE_LEGACY=1`  | pi-RPC              | none (`--dangerously-skip-permissions`)                          |
| Raw passthrough      | `AMARRE_CLAUDE_RAW=1`     | Claude stream-json  | none (`--dangerously-skip-permissions`)                          |

#### 5.3.1 Default (SDK broker)

`spawnBroker()` runs `bun run <BROKER_PATH>` where `BROKER_PATH` is `AMARRE_CLAUDE_BROKER` (set by the Nix flake to a pre-bundled `agents/claude-code/dist/broker.js`) or `agents/claude-code/broker.ts` in dev. The broker:

- Imports `@anthropic-ai/claude-agent-sdk` (`query`, `Options`, `CanUseTool`, …).
- Drives `query({ prompt: <PromptQueue>, options: { canUseTool, pathToClaudeCodeExecutable, includePartialMessages: true, settingSources: [], settings.permissions.{allow:[], deny:[], ask: <list>}, permissionMode, cwd, model, additionalDirectories } })`.
- Translates SDK output via `translator.translateOutbound()` (the same translator used by the legacy mode) and writes pi-RPC events to stdout.
- For every inbound pi command (from the amarre server), handles four broker-aware commands locally:
  - `extension_ui_response` → resolves the pending `canUseTool` callback as `{behavior:"allow", updatedInput:<input>}` if `confirmed:true`, else `{behavior:"deny", message:"User declined.", interrupt:true}`.
  - `abort` → drops follow-up + steer queues and calls `query.interrupt()`.
  - `set_model` → `query.setModel(model)`; acks via `response`.
  - `set_permission_mode` → `query.setPermissionMode(mode)`; acks via `response`.
  - Anything else (`prompt`, `follow_up`, `steer`, `get_state`, `get_messages`) goes through the translator. Translator-produced stream-json `{type:"user",…}` envelopes are parsed back and pushed onto the SDK prompt queue as `SDKUserMessage`.

Special tool handling:
- `ExitPlanMode` → captures `input.plan` markdown, emits `extension_ui_request{method:"notify",event:"plan_capture",message:<plan>}` (no response expected), and replies to the SDK callback with `{behavior:"deny", message:"Plan captured; awaiting user feedback."}` so Claude waits for follow-up.
- All other tools → `extension_ui_request{method:"confirm",title,message:<preview>}` and the callback resolves on the matching `extension_ui_response`.

Key SDK-option choices (in `broker.ts`):
- `includePartialMessages: true` — emits fine-grained `content_block_delta` events so the translator can produce streaming `message_update.text_delta` frames.
- `settingSources: []` (default) — keeps the user's `~/.claude/settings.json` `permissions.allow` from auto-allowing tools. Override via `AMARRE_CLAUDE_SETTING_SOURCES` (`user,project,local`).
- `settings.permissions.ask: [...DEFAULT_ASK_RULES]` — enumerates every built-in Claude Code tool (`Bash(*)`, `Edit(*)`, `Write(*)`, `Read(*)`, `Glob(*)`, `Grep(*)`, `WebFetch(*)`, `WebSearch(*)`, `NotebookEdit(*)`, `Task(*)`, `TodoWrite(*)`, `AskUserQuestion(*)`, `ExitPlanMode(*)`, `EnterPlanMode(*)`, `Skill(*)`). The SDK's permission grammar does NOT support wildcards in the ToolName segment, so we must enumerate. Extra tools (plugin / MCP) can be added via `AMARRE_CLAUDE_ASK_EXTRA` (comma-separated); the whole list can be replaced via `AMARRE_CLAUDE_ASK`.

Env vars consumed:
- `CLAUDE_BIN` (default: `claude`) — path to the `claude` binary; the Nix flake injects `${pkgs.claude-code}/bin/claude`.
- `AMARRE_BUN_BIN` (default: `bun`) — the bun used to run the broker.
- `AMARRE_CLAUDE_BROKER` — pre-bundled broker path (set by the Nix flake).
- `AMARRE_CLAUDE_MODEL` — optional SDK `model`.
- `AMARRE_CLAUDE_PERMISSION_MODE` — initial SDK `permissionMode` (`"default" | "acceptEdits" | "bypassPermissions" | "plan"`).
- `AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES` (`:`-separated) — extra dirs.
- `AMARRE_CLAUDE_SETTING_SOURCES` (`,`-separated) — opt back into file-based settings.
- `AMARRE_CLAUDE_ASK` / `AMARRE_CLAUDE_ASK_EXTRA` — permission ASK rules.

#### 5.3.2 Legacy translator (`AMARRE_CLAUDE_LEGACY=1`)

Spawns `claude -p --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions [--model …]` directly and wires its stdio through `translator.ts` to the same pi-RPC wire shape. No permission gate. Kept for the case where the SDK is unavailable.

#### 5.3.3 Raw passthrough (`AMARRE_CLAUDE_RAW=1`)

Spawns the same `claude -p` invocation but exposes Claude's native stream-json directly on the WS — for debugging or clients that target Claude Code natively.

---

## 6. Mobile/cross-platform client (`apps/expo/`)

Expo SDK 54, React Native 0.81, React 19, New Architecture, expo-router (file-based routes, typed routes). Single codebase, three targets (iOS, Android, web).

### 6.1 Screens / routes

| Route                | File                                       | Purpose                                                            |
|----------------------|--------------------------------------------|--------------------------------------------------------------------|
| `/` (redirect)       | `app/index.tsx`                            | Always redirects to `/connect`.                                    |
| `/connect`           | `app/connect.tsx` → `screens/Connect.tsx`  | Host / port / scheme (`wss` or `ws`) form. Sanity-checks via `GET /sessions` before persisting; on success kicks off push-token registration. |
| `/sessions`          | `app/sessions/index.tsx` → `screens/Sessions.tsx` | List of sessions (`GET /sessions`). Spawn (`+`), pick (long-press to delete, tap to connect — crashed sessions auto-restart on tap). |
| `/sessions/<id>`     | `app/sessions/[id].tsx`                    | Stub detail screen used as the push-notification deep-link target. |
| `/chat`              | `app/chat.tsx` → `screens/Chat.tsx`        | The chat surface: connection status strip, scrollable messages + streaming buffer, tool cards (status orb, args summary, partial result, error state), composer (send / steer / abort), crash banner with restart. |
| `/permission`        | `app/permission.tsx`                       | Stand-alone permission preview (the actual modal is `PermissionSheet` mounted globally in `_layout.tsx`). |
| `/streaming`, `/empty`, `/error`, `/pr`, `/atoms` | various                          | Design-system / mock screens; not part of the production flow. |

`_layout.tsx` mounts `ThemeProvider`, `AmarreProvider`, the stack navigator, and the global `PermissionSheet` modal. It also configures `Notifications.setNotificationHandler` (show banner + list + sound, no badge) and on launch / on every notification-response routes to `/sessions/<sessionId>` when `data.amarre === "1"`.

### 6.2 Networking layer (`src/lib/`)

- `persistence/settings.ts` — `AsyncStorage` key `amarre.settings.v1` storing `{host, port, scheme: "wss" | "ws"}`. Helpers: `httpBaseUrl(s)`, `wsUrl(s, sessionId)`.
- `rest/sessions.ts` — fetch wrappers around `GET /sessions`, `POST /sessions`, `GET /sessions/<id>`, `DELETE /sessions/<id>`, `POST /sessions/<id>/restart`. Throws `RestError(status, body, message)` on non-2xx.
- `ws/client.ts` — `AmarreClient`: one WebSocket per connected session. Single-flight reconnect with exponential backoff (1 s → 30 s cap). Handles:
  - `connect(url, agent)` — opens or replaces the socket; resets pending queue if URL differs.
  - `send(cmd)` — preserves caller-supplied `id` (required for `extension_ui_response`), else auto-generates `c<seq>-<rand>`. If socket not OPEN, queues up to 16 frames; flushes FIFO on `onopen`.
  - On open: if `agent === "pi"`, auto-sends `get_state` + `get_messages` (Claude Code's broker autoinit pushes a `system/init` event from the server side, so we don't need to ask).
  - On `amarre.session_event`: marks `terminated`, dispatches the event, then on the upcoming close does NOT reconnect (the user must restart explicitly).
  - On normal close: schedules a reconnect.
- `ws/jsonl.ts` — splits a text frame on `\n` and parses each chunk as JSON; ignores blanks and invalid lines.
- `protocol/envelope.ts` — `isAmarreSessionEvent()` type guard for the one Layer 3 envelope.
- `protocol/pi.ts` — the pi RPC types modelled for the client. Subset: commands `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `new_session`, `switch_session`, `extension_ui_response`. Events: `response`, `agent_start`/`end`, `turn_start`/`end`, `message_update`, `tool_execution_*`, `extension_ui_request`, `queue_update`, `compaction_*`, `auto_retry_*`, `extension_error`. Plus `AssistantStreamEvent` for the streaming delta inside `message_update.assistantMessageEvent`.

### 6.3 Store (`src/lib/store/`)

A singleton observable consumed via `useSyncExternalStore`. `State` shape:

```ts
{
  conn: ConnectionState;           // singleton WS connection state
  retry: RetryBanner | null;       // auto-retry banner (must survive session switch)
  currentSessionId: string | null; // cursor flag — which slice the UI reads
  sessions: Record<sessionId, SessionSlice>;
}

SessionSlice = {
  agent: { isStreaming, model?, sessionId?, sessionName? };
  messages: AgentMessage[];        // committed history
  streaming: { text, thinking, toolCallBuffers, toolCalls } | null;
  toolExecs: Map<toolCallId, ToolExecState>;
  permissionRequests: ExtensionUiRequestEvent[];   // interactive methods only
  sessionCrashed: { sessionId, exitCode, signal } | null;
}
```

Reducer (`reducer.ts`) handles every pi event type, mutating the slice for `currentSessionId`. Notable rules:
- `tool_execution_update` mutates `partial`; `tool_execution_end` writes `result` and toggles `status` to `done` / `error`.
- `turn_end` commits the streaming buffer into a single assistant `AgentMessage` and appends any `toolResults`.
- `extension_ui_request` only queues if `method` is interactive (`confirm` / `select` / `input` / `editor`) — `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text` are fire-and-forget.
- `amarre.session_event` (`event: "crashed"`) sets `sessionCrashed` and clears `isStreaming`.
- Response to `get_messages` rehydrates `toolExecs` from any historical `toolResult` messages so tool cards re-render on reconnect.

**Invariant** documented in `reducer.ts`: wire events do not carry session id; the UI must `setCurrentSession(<new>)` **before** `client.connect(<new-url>)` or events from the new session land in the old slice. `AmarreProvider.connectToSession()` enforces this.

### 6.4 Push registration (`src/lib/push/register.ts` + `register.expo.ts`)

`register.ts` is the pure registration logic; all side-effecting deps (expo-notifications, expo-device, expo-constants, AsyncStorage, `Platform`, `fetch`) are injected via `PushDeps` so the module is testable under `bun test` without a React Native runtime. `register.expo.ts` is the production binding.

Decision tree (`registerForPushAsync`):

```
isWeb()                                  → skipped (web)
!isDevice()                              → skipped (simulator/emulator)
projectId from app.json.expo.extra.eas.projectId
   (treat any value starting with "TODO" as missing)
!expoGo && !projectId                    → skipped (no-project-id)
   (Expo Go runs against Expo's anonymous project — no projectId required)
android                                  → ensureChannel("default", DEFAULT importance)
getPermission()                          → if not granted, requestPermission()
   not granted                           → skipped (permission-denied)
getExpoPushToken({projectId | null})
   throws                                → error
POST <base>/push/tokens                  → best-effort with one retry; failures logged
AsyncStorage.set("amarre.push.lastToken.v1", {token, base})  // best-effort cache
```

Project id is currently pinned in `app.json` to `78540bb0-bcff-4616-b69c-42342c2247de` (commit `4146a38`, "link real EAS projectId so Expo Go push works"). The branch `0ef9376` allowed Expo Go to register **without** a `projectId` (anonymous Expo project), keyed off `Constants.executionEnvironment === "storeClient"`.

### 6.5 Notification handling

`_layout.tsx`:
1. `Notifications.setNotificationHandler` returns `{shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false}` so every push surfaces while the app is foregrounded.
2. On mount, asks for the last notification response and subscribes via `addNotificationResponseReceivedListener`. Any response whose `data.amarre === "1"` and which has `data.sessionId` is routed to `/sessions/<sessionId>`.

### 6.6 Permission UI

`PermissionSheet.tsx` (mounted in `_layout.tsx`) is a modal sheet rendering the **head** of `permissionRequests`. Mapping decision → wire frame:
- `method: "confirm"` → `{type:"extension_ui_response", id, confirmed: true|false}`
- `method: "select"` + non-empty `options` → first option for Allow, last for Deny.
- `method: "input"` / `"editor"` → `{cancelled: true}` regardless.

On submit, the request is optimistically removed from the queue (`store.dismissPermission(id)`).

---

## 7. Wire-format invariants (Layer 3 amarre envelope)

This section enumerates the only messages the amarre server itself ever synthesises (everything else passes through verbatim from the underlying agent). See `docs/PROTOCOL.md` for normative semantics.

| Direction | Shape                                                                                                              | Trigger                                                            |
|-----------|--------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|
| S → C     | `{"type":"amarre.session_event","event":"crashed","exitCode":N\|null,"signal":"SIGTERM"\|null}`                    | Child of a session exited while `status === "running"`.            |
| S → C     | `{"type":"amarre.push_sent","trigger":"awaiting_input","tokens":N,"requestId":"<uuid>"}`                           | Awaiting-input push successfully dispatched to ≥ 1 token.          |

Reserved namespaces:
- Field names beginning with `_` are reserved for future amarre-envelope use.
- Top-level `type` values beginning with `amarre.` are reserved.

---

## 8. Configuration surface

### 8.1 Server env vars

| Var                         | Default                                | Used by             | Meaning                                                                                                  |
|-----------------------------|----------------------------------------|---------------------|----------------------------------------------------------------------------------------------------------|
| `AMARRE_PORT`               | `8341`                                 | server              | Loopback TCP port.                                                                                       |
| `AMARRE_HOST`               | `127.0.0.1`                            | server              | Bind address. **Keep on loopback.** External access through `tailscale serve`.                           |
| `AMARRE_MAX_SESSIONS`       | `8`                                    | server              | Cap across all instances. `POST /sessions` returns 429 once reached.                                     |
| `AMARRE_AGENT`              | `pi`                                   | server              | Legacy single-instance shortcut. Ignored when `AMARRE_INSTANCES_JSON` is set.                            |
| `AMARRE_AGENT_PATH`         | _unset_                                | server              | Override adapter module path for the legacy synthetic instance (test hook).                              |
| `AMARRE_INSTANCES_JSON`     | _unset_                                | server              | JSON array of `{id, agent, agentPath?, env}`. When set, the legacy fallback is ignored.                  |
| `AMARRE_PUSH_TOKENS_PATH`   | _unset_ (push off)                     | server              | Path to the JSON push-token store. Setting it (and the dir being writable) enables the push subsystem.  |
| `AMARRE_PUSH_GRACE_MS`      | `15000`                                | server              | Grace window before an `awaiting_input` push fires.                                                      |
| `AMARRE_PUSH_EXPO_URL`      | `https://exp.host/--/api/v2/push/send` | server              | Expo Push endpoint override (tests use a fake).                                                          |
| `PI_BIN`                    | `pi`                                   | pi adapter          | Path to `pi`.                                                                                            |
| `AMARRE_PI_GATE`            | `agents/pi/permission-gate.ts`         | pi adapter          | Override gate path.                                                                                      |
| `CLAUDE_BIN`                | `claude`                               | claude adapter      | Path to `claude`.                                                                                        |
| `AMARRE_BUN_BIN`            | `bun`                                  | claude adapter      | Bun used to launch the broker.                                                                           |
| `AMARRE_CLAUDE_BROKER`      | `agents/claude-code/broker.ts`         | claude adapter      | Pre-bundled broker path (Nix sets it).                                                                   |
| `AMARRE_CLAUDE_MODEL`       | _unset_                                | claude adapter      | `--model` (legacy/raw) / SDK `model` (broker).                                                           |
| `AMARRE_CLAUDE_LEGACY`      | _unset_                                | claude adapter      | `1` → legacy translator mode.                                                                            |
| `AMARRE_CLAUDE_RAW`         | _unset_                                | claude adapter      | `1` → raw passthrough.                                                                                   |
| `AMARRE_CLAUDE_PERMISSION_MODE` | _unset_                            | claude broker       | SDK `permissionMode`.                                                                                    |
| `AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES` | _unset_                     | claude broker       | `:`-separated additional dirs for the SDK.                                                               |
| `AMARRE_CLAUDE_SETTING_SOURCES`        | _unset_                     | claude broker       | `,`-separated SDK setting sources (`user`/`project`/`local`).                                            |
| `AMARRE_CLAUDE_ASK`         | _unset_                                | claude broker       | Replace the default ASK rules list.                                                                      |
| `AMARRE_CLAUDE_ASK_EXTRA`   | _unset_                                | claude broker       | Append to the default ASK rules.                                                                         |
| `AMARRE_CLAUDE_EXTRA_ARGS`  | _unset_                                | claude adapter      | Extra pass-through CLI args (legacy/raw).                                                                |
| `AMARRE_CLAUDE_CWD`         | _set by adapter from SpawnOpts.cwd_    | claude broker       | Working dir passed to the SDK.                                                                           |

### 8.2 NixOS module (`module.nix`)

`services.amarre = { … }` options:
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
- `package` (package, default = the flake's `packages.<system>.server`).

The unit translates the options into the env vars in §8.1 and `ExecStart=${cfg.package}/bin/amarre-server`. With `push.enable`, `StateDirectory=amarre` provisions `/var/lib/amarre/` owned by `cfg.user`.

### 8.3 Expo client

`app.json`:
- `expo.slug = "amarre"`, `expo.name = "amarre"`, `expo.scheme = "amarre"`.
- `expo.ios.bundleIdentifier = "com.amarre.app"`, `expo.android.package = "com.amarre.app"`.
- `plugins`: `expo-router`, `expo-splash-screen` (theming), `expo-notifications` (color `#7c5cff`, default channel).
- `extra.eas.projectId = "78540bb0-bcff-4616-b69c-42342c2247de"` — pinned, real EAS project.
- `experiments`: `typedRoutes`, `reactCompiler`.
- `owner = "nsimon"`.

AsyncStorage keys:
- `amarre.settings.v1` — `{host, port, scheme}`.
- `amarre.push.lastToken.v1` — `{token, base}` cache of the last successful registration.

### 8.4 On-disk layout

Server-side, with `push.enable = true`:
- `/var/lib/amarre/push-tokens.json` — array of `PushToken`. Atomic-rewritten via `tmp.<pid>` + `rename`.

Agent state (owned by the spawned CLI, not amarre):
- `~/.pi/agent/` — pi's session JSONL and config.
- `~/.claude/` — Claude Code's profile.

---

## 9. Push notifications — end-to-end flow

```
1. App on first boot (or first /connect submit) calls registerForPushAsync():
   - getExpoPushTokenAsync({projectId})   (or no arg in Expo Go)
   - POST <base>/push/tokens {token, deviceName, platform}
     → server adds to its JSON store

2. User connects to a session, walks away.

3. Agent emits {type:"extension_ui_request", id:<uuid>, method:"confirm", title:"Run bash?", message:"…"}
   → server broadcasts to WS clients
   → server starts a setTimeout(AMARRE_PUSH_GRACE_MS, fire) keyed by id

4. (a) Client answers within graceMs                → server clears the timer, push suppressed
   (b) No answer + no inbound WS frame in graceMs   → timer fires:
         server POSTs to https://exp.host/--/api/v2/push/send
         response tickets pruned for DeviceNotRegistered
         on success → server broadcasts {type:"amarre.push_sent", trigger:"awaiting_input", tokens:N, requestId}
                      so connected clients can suppress duplicate UI

5. On tap, the OS launches the app with notification.data; _layout.tsx routes to /sessions/<id>.
```

Crash path: identical to step 4(b) but unconditional (no grace, no suppression).

---

## 10. Failure modes

| Failure                                            | Surface                                                                                                              |
|----------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
| Agent child exits unexpectedly                     | `amarre.session_event` to that session's clients + WS close `1011` + optional `crashed` push. Server stays up.       |
| Server crash (Bun OOM, etc.)                       | systemd `Restart=on-failure` after `RestartSec=5s`. All sessions gone — clients reconnect, `GET /sessions` is truth. |
| Adapter module fails to import at boot             | Server fails to start; systemd backs off.                                                                            |
| `AMARRE_INSTANCES_JSON` malformed                  | Server fails to start with `AMARRE_INSTANCES_JSON: …` error.                                                         |
| `POST /sessions` past `maxSessions`                | `429 {error:"max_sessions_reached", limit:N}`. Client formats it as "max sessions reached (limit N)".                |
| `POST /sessions` with unknown `instanceId`         | `404 {error:"unknown_instance", instanceId:"…"}`.                                                                    |
| Restarting a running session                       | `409 {error:"already_running"}`.                                                                                     |
| Restart with the instance gone                     | `410 {error:"instance_gone", instanceId:"…"}`.                                                                       |
| WS connect to unknown id                           | `404 Session not found`.                                                                                             |
| WS connect to non-running id                       | `409 Session <status>; restart it first`.                                                                            |
| Push store unwritable / missing path              | Push subsystem flips to `enabled: false`; `/push/*` routes return `503 push_disabled`. Rest of server unaffected.    |
| Expo Push token comes back `DeviceNotRegistered`   | Token pruned from the store; future fires skip it.                                                                   |
| Expo `MessageRateExceeded` / other ticket errors   | Logged; token retained; nothing else happens.                                                                        |
| Malformed JSON on WS                               | Logged, dropped. No reply.                                                                                           |
| Frame too large                                    | Server MAY drop the connection (implementation-defined).                                                             |
| Client tries `wss://host:port/` (no session path)  | `426 Upgrade Required` with hint pointing at PROTOCOL.md.                                                            |
| Sumeria / Linky-style upstream failure             | Out of scope (amarre is agent-agnostic; the agent itself surfaces tool errors via `tool_execution_end{isError:true}`).|

---

## 11. Invariants (must not violate)

1. **Loopback-only bind.** The server binds `127.0.0.1` (or the IPv6 equivalent) by default. The NixOS module options keep `host = "127.0.0.1"` as the only sane value. Remote access is through `tailscale serve`. **Do not expose any port publicly. The trust boundary is the Tailscale ACL.** Adding `0.0.0.0` binding, an internet-routable port, or any non-tailnet ingress is forbidden without first introducing in-band auth (currently a "future extension" in PROTOCOL §9).

2. **Server is an agent-agnostic transparent proxy at Layer 3.** Adapters parse / rewrite Layer 4; the server never does. The only server-synthesised frames on the WS are `amarre.session_event` and `amarre.push_sent`. Any new server-originated message MUST be added under the `amarre.*` `type` prefix and documented in PROTOCOL.md.

3. **Reserved namespaces.** Top-level field names starting with `_` and top-level `type` values starting with `amarre.` are reserved. Adapters MUST NOT emit them; clients MUST tolerate (log + ignore) unknown values.

4. **Per-session isolation.** Events from session A reach only session A's clients. Permission requests from session A are only seen by session A's clients. A crash in session A does not affect the server or any other session.

5. **Session-id discovery is via REST.** Clients MUST NOT cache session ids across server restarts; `GET /sessions` is authoritative.

6. **`extension_ui_response.id` MUST echo the originating `extension_ui_request.id`.** Both the server (no rewriting) and the client (`AmarreClient.send()` preserves caller-supplied ids) depend on this.

7. **`AMARRE_INSTANCES_JSON` instance ids are unique within a server.** Duplicate id → boot-time error.

8. **The user owns the agent's home dir.** The systemd unit runs as `cfg.user` so the spawned `pi` / `claude` inherits `~/.pi/`, `~/.claude/`, MCP config, login state, etc. Running as a system user without a home would silently fork-clone profiles.

9. **Push payloads MUST NOT contain sensitive content.** `body` is bounded to 100 chars; `data` includes only id / metadata. No file paths, no command output, no secrets.

10. **`cwd` for a session is the caller's responsibility.** Amarre does NOT create the directory, run `git worktree add`, or otherwise prepare the filesystem. Pass an existing absolute path.

---

## 12. Non-goals

- **A relay**. Amarre does not call out to any third party at the protocol level. The optional push subsystem is the one exception, and it ships only opaque ids — no agent content.
- **Multi-tenant gating.** All registered push tokens get every push. A future extension can add per-user filtering once an auth story exists.
- **Cross-session shared state.** Sessions are isolated by construction; there is no shared queue, broadcast group, or supervisor channel (the future `/supervisor` fan-in is listed in PROTOCOL §9 but not implemented).
- **A new wire format per adapter.** Both shipped adapters (`pi`, `claude-code` default mode) speak pi RPC on the wire. The raw passthrough mode of `claude-code` is an exception kept for debugging; production clients should target pi RPC.
- **State.json rehydrate.** Sessions don't survive server restarts. Recovering `cwd`/`env`/`name` and re-spawning on boot is a planned extension, not a current feature.
- **Authentication.** No bearer tokens, no `/login`, no cookies. The tailnet ACL is the only access-control layer.
- **A native iOS or Android app.** `apps/ios/` is an empty placeholder; the Expo client is the supported native target.
- **A CLI client.** Not shipped; bringing your own with `websocat` works (see README §"Run locally") but is not a maintained surface.

---

## 13. Testing

`bun test` runs everything from the repo root:

- `server/server.test.ts` — single-session round-trip, fanout, split-line buffering.
- `server/multi.test.ts` — list / spawn / delete / crash isolation / restart / max-sessions.
- `server/instances.test.ts` — multi-instance routing via `AMARRE_INSTANCES_JSON`.
- `server/push.test.ts` — push store + dispatcher unit tests.
- `server/push.integration.test.ts` — push end-to-end against a fake Expo endpoint.
- `agents/pi/permission-gate.test.ts` — gate against a mock `ExtensionAPI`.
- `agents/claude-code/translator.test.ts` — pure translator unit tests.
- `agents/claude-code/broker.test.ts` — broker against a fake `createQuery`.
- `agents/claude-code/adapter.test.ts` — spawn-shape + legacy-mode end-to-end via `tests/fixtures/fake-claude.sh`.
- `apps/expo/src/lib/store/reducer.test.ts`, `apps/expo/src/lib/ws/client.test.ts`, `apps/expo/src/lib/push/register.test.ts` — Expo client unit tests (run from `apps/expo/`).

The Nix flake exposes `checks.<system>.tests` that runs `bun test` in a sandbox.

---

## 14. Versioning

- **Wire protocol**: `docs/PROTOCOL.md §1` — current version `2.2.0`. Non-breaking additions bump the minor; renames / removals bump the major. Future `amarre.hello` handshake will let clients negotiate.
- **Server package**: `package.json` reports `0.3.0`. SemVer is best-effort; the wire protocol is the contract that matters.
- **Expo client**: `apps/expo/package.json` reports `0.0.1`. Status in `apps/expo/README.md` is "v0 — hello-world only" but the working set is well beyond that (full chat surface, permission sheet, push, multi-session list); update is pending.
