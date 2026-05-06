# Amarre Protocol

Wire-format specification for clients (front) and servers (back) speaking the **amarre protocol** — a thin tailnet-only WebSocket transport for driving one or more CLI coding agents (`pi`, `claude-code`, …) from a remote device.

This document is normative. If a behaviour is not described here, it is not part of the protocol.

---

## 1. Status & versioning

- **Version**: `2.3.0` (this document). The version refers to the *transport* envelope and the *agent-agnostic* surface only. The inner agent payload is governed by the agent's own RPC schema (see §6).
- **Breaking changes vs `1.x`**: connecting clients now address a specific session via `/sessions/<id>`; the legacy `wss://host:port/` path is gone (returns `426`). A REST control plane manages session lifecycle. See §4.
- **Additions vs `2.0.0`** (non-breaking): one server can host multiple named *instances* (different adapter + env per instance) — `POST /sessions` accepts an optional `instanceId`, `GET /instances` lists them, the per-session summary now carries `instanceId`. The `extension_ui_request{method:"notify"}` envelope MAY carry `event:"plan_capture"` (Claude plan-mode markdown). See §4.1 + §6.3.
- **Additions vs `2.1.0`** (non-breaking): optional push-notification capability — three new REST routes (`/push/tokens`), one new Layer 3 event (`amarre.push_sent`), see §13. Clients and servers without push remain conformant with 2.1.0.
- **Additions vs `2.2.0`** (non-breaking): optional Remote Claude capability — the `claude-code` adapter MAY mirror and accept control from `claude.ai/code`. Four new Layer 3 events (`amarre.remote_attached`, `amarre.remote_inbound`, `amarre.remote_permission_decided`, `amarre.remote_failed`), one new optional field on `extension_ui_request{method:"notify"}` (`event:"permission_resolved"`). See §14. Clients and servers without Remote Claude remain conformant with 2.2.0.
- **Maturity**: multi-session, multi-client, multi-instance. No authentication beyond network-layer (tailnet) ACL. No backwards-compatibility guarantees within `2.x.x` while we collect real-client feedback; expect at most additive changes until `3.0.0`.
- **Stability boundaries**:
  - Changes that REMOVE or RENAME a top-level field, a top-level message `type`, or a REST route, are breaking → bump major.
  - Changes that ADD optional top-level fields, a new `type` value, or a new REST route, are non-breaking → bump minor.
  - Bug fixes only → bump patch.

A future `hello` handshake (§9) will allow servers and clients to advertise capabilities at connect time. Until then, both sides assume `2.0.0`.

---

## 2. Layered model

```
┌─────────────────────────────────────────────────┐
│  Layer 4 — Agent payload (pi RPC, …)            │  agent-specific
├─────────────────────────────────────────────────┤
│  Layer 3 — Amarre envelope (this spec)          │  agent-agnostic
├─────────────────────────────────────────────────┤
│  Layer 2 — JSONL framing (WS) / JSON (REST)     │  one JSON object per line
├─────────────────────────────────────────────────┤
│  Layer 1 — WebSocket + HTTP (TLS over tailnet)  │  text frames + REST
└─────────────────────────────────────────────────┘
```

Layer 4 is the agent's own protocol — for `pi`, that is the schema documented at `docs/rpc.md` inside the `@mariozechner/pi-coding-agent` npm package. The amarre server is a transparent proxy at Layer 3: it does not parse, validate, or rewrite Layer 4 payloads. Clients therefore must implement the agent's RPC schema directly (see §6).

---

## 3. Transport (Layer 1 + 2)

### 3.1 Endpoints

```
HTTP control plane:
  GET    /instances                      — list configured instances (id + agent)
  GET    /sessions                       — list sessions
  POST   /sessions                       — spawn a new session
  GET    /sessions/<id>                  — session status
  DELETE /sessions/<id>                  — stop a session
  POST   /sessions/<id>/restart          — restart a crashed/stopped session

  GET    /push/tokens                    — list registered push tokens   (§13)
  POST   /push/tokens                    — register an Expo push token    (§13)
  DELETE /push/tokens/<token>            — unregister a push token        (§13)

WebSocket data plane:
  wss://<host>:<port>/sessions/<id>      — connect to a specific session
```

- Scheme: `wss` / `https` (TLS) over a tailnet, or `ws` / `http` for loopback testing.
- Default port: configurable; deployed on `4344` over Tailscale Serve, `8341` on loopback.
- `wss://<host>:<port>/` (no session) returns **`HTTP 426 Upgrade Required`** with body `Use /sessions/<id>; see docs/PROTOCOL.md`. Connecting to an unknown session id returns `HTTP 404`. Connecting to a session that exists but is not `running` returns `HTTP 409` (use `POST /sessions/<id>/restart` first).
- Session ids are server-issued opaque strings (current implementation: 12 chars from `crypto.randomUUID()`). Clients MUST treat them as opaque.

### 3.2 WebSocket frames

- Use **text frames** only. Binary frames are reserved for a future media channel and MUST be ignored by current servers and clients.
- Each text frame contains exactly **one** JSONL record — a single JSON value followed by an implicit newline. Servers and clients SHOULD send one record per frame; if a frame contains multiple records separated by `\n`, the receiver MUST split on `\n` and handle each independently.
- Lines are UTF-8. Empty lines are skipped silently.
- Maximum frame size is implementation-defined; 1 MiB is a reasonable floor for clients to support to accommodate streamed assistant text and image inputs.

### 3.3 Connect / disconnect

- A WebSocket connection is **stateless from the server's perspective**: the agent runs continuously and is shared by every client connected to the same session. Disconnecting and reconnecting to the same session id does not reset, restart, fork, or compact the agent.
- A client MAY disconnect at any time. The server MUST NOT abort, cancel, or queue-drop the agent when its last client disconnects.
- A client MUST be prepared for the server to close the connection at any time (e.g. systemd restart, network blip, agent crash). Clients SHOULD reconnect with exponential backoff (initial 1 s, cap 30 s) and resume at Layer 4 by issuing `get_state` / `get_messages` (§6.1). On a clean reconnect to the same session id the conversation is intact; on a server restart, sessions are gone (see §4.4) and the client should discover the new state with `GET /sessions`.

### 3.4 Keepalives

- The server MUST honour standard WebSocket pings; it MAY also originate pings on its own schedule (default ≥ 30 s interval).
- Clients SHOULD respond to server pings within 10 s. Failing to do so MAY cause the server to drop the connection.
- Application-level keepalives are not part of the protocol.

---

## 4. Session model

### 4.1 Multi-session, multi-client, multi-instance

- A server hosts one or more *instances* (added in v2.1) — each instance is a configured `(adapter, env)` pair with a stable `instanceId`. Examples: `claude_personal`, `claude_work`, `pi`. Servers configured the legacy way (single `AMARRE_AGENT`, no `AMARRE_INSTANCES_JSON`) expose a synthetic instance with id `default`.
- Per session, the server hosts up to `AMARRE_MAX_SESSIONS` (default 8) concurrent agent processes total across all instances, each addressed by a distinct session id.
- A session is bound to exactly one instance at spawn time. `POST /sessions {instanceId}` selects which instance handles the session. The instance is stamped on every session summary (`GET /sessions`).
- Any number of clients MAY connect concurrently to the same session. Within a session, the server fans out every Layer 4 event from the agent to every connected client of that session (broadcast). Events from session A do **not** reach clients of session B (regardless of whether they share an instance).
- Commands from clients of a session are written to that session's agent stdin in arrival order. The server does not serialize commands per-client; it serializes per-session.
- The "session" identity (in the agent's sense — its conversation history, current model, etc.) is owned by the agent process and is shared across clients of that session. Use Layer 4 commands like `new_session`, `switch_session`, `fork`, `clone` to manipulate it (§6.1) — these affect only the addressed session.

#### Instances

```
GET /instances → [{"id":"claude_personal","agent":"claude-code"},
                  {"id":"claude_work","agent":"claude-code"},
                  {"id":"pi","agent":"pi"}]
```

- `id` is server-issued (configured via `AMARRE_INSTANCES_JSON` or `services.amarre.instances`). MUST be unique within a server.
- `agent` is the adapter name (matches `agents/<name>/adapter.ts`).
- `POST /sessions` body MAY include `"instanceId"`. Default: the instance named `"default"` if present, otherwise the first configured instance.
- `POST /sessions` returns `HTTP 404 {"error":"unknown_instance","instanceId":"..."}` if the requested id is not configured.
- Per-instance env (e.g. `CLAUDE_HOME`, `AMARRE_CLAUDE_MODEL`) is merged into the spawn env *before* the per-session `env` field — session env wins on conflict.

### 4.2 Lifecycle

```
spawn → running → crashed → running (after restart)
                ↓
              stopped (deleted)
```

- `POST /sessions` spawns a new agent child and returns the assigned id. Optional body: `{instanceId?, name?, cwd?, env?}`. `instanceId` selects the instance (§4.1; default `"default"`). `cwd` and `env` are passed to the adapter's `SpawnOpts`. Worktree creation is the caller's responsibility — amarre does not run `git worktree add`.
- `DELETE /sessions/<id>` sends `SIGTERM` to the child, closes its WebSocket clients with code `1000`, and removes the session from the map.
- A child exit while status is `running` flips status to `crashed`. The server emits one `amarre.session_event` to the session's clients (§5.4) and closes their WSs with code `1011`. The server process **does not exit** on a per-session crash.
- `POST /sessions/<id>/restart` re-spawns a crashed/stopped session in place using the original `SpawnOpts`. Returns `409` if the session is already running. Clients MUST reconnect on their own — the WSs from before the crash are not migrated.
- `POST /sessions` returns `HTTP 429` with `{error:"max_sessions_reached", limit:N}` once the cap is reached. `DELETE` an old session before retrying.

### 4.3 Multi-client semantics within a session

When >1 client is connected to the same session:

- **Broadcast events**: every event from the agent's stdout reaches every client of that session. This includes `extension_ui_request` permission cards. Clients SHOULD render the permission card to the user; the **first client to send a matching `extension_ui_response`** wins. Subsequent responses for the same `id` MUST be ignored by the server (forwarded to the agent verbatim, where pi will discard the duplicate).
- **Command race**: if two clients of the same session send conflicting commands at the same moment, the server forwards both to the agent in arrival order. The agent's behaviour governs the outcome (pi rejects mid-stream `prompt` without `streamingBehavior`; see §6.1).
- **No per-client state**: the server does not track which client originated which command. `id` correlation (§5.2) is the client's responsibility.

### 4.4 Persistence

- Sessions are **ephemeral**: they live in the server's memory only. A server restart (systemd, redeploy, reboot) wipes the session map. Clients MUST treat `GET /sessions` as the authority on what is alive.
- The agent's own conversation state is unaffected when it persists to disk — pi writes JSONL under `~/.pi/agent/`, so a fresh session on the same `cwd` can `switch_session` back to a prior conversation. State.json rehydrate of the session map is a planned future extension (§9).

---

## 5. Layer 3 — Amarre envelope

### 5.1 Pass-through model

Every WS record is a Layer 4 payload, unwrapped — except for the one server-originated `amarre.session_event` (§5.4). The server does not add, strip, or rewrite Layer 4 fields.

This means a client implementing pi's RPC schema can talk to amarre directly with no extra adapter layer. Aside from the initial REST `POST /sessions` and the one `amarre.*` event, the WS data plane *is* pi's RPC schema, framed over WebSocket.

### 5.2 Correlation

Every command-style record sent client-to-server SHOULD include an `id` field (free-form string, ≤ 128 chars, opaque to the server). The agent will echo this `id` on the corresponding `response` record, allowing the client to correlate command and response.

Events (server-to-client records that are not direct command responses) do NOT carry an `id`.

### 5.3 Reserved namespaces

- Top-level field names beginning with an underscore (`_`) are reserved for future amarre-envelope use. Clients MUST NOT use them at Layer 4. Servers MUST forward them verbatim if present today.
- Top-level `type` values beginning with `amarre.` are reserved for future Layer 3 messages. The only such message defined in v2 is `amarre.session_event` (§5.4). Clients MUST tolerate (log + ignore) unknown `amarre.*` values — they will be added in future minor versions.

### 5.4 `amarre.session_event`

A server-originated Layer 3 message. Sent on the WS of a session whose agent has just exited unexpectedly:

```json
{"type":"amarre.session_event","event":"crashed","exitCode":1,"signal":null}
```

- `event`: `"crashed"` is the only value defined today. Future minor versions may add `"restarted"`, `"compacting"`, etc.
- `exitCode`: integer or `null` (if the child was killed by a signal).
- `signal`: signal name (e.g. `"SIGTERM"`) or `null`.

The server emits this to a session's clients **once**, immediately before closing each of their WSs with code `1011`. Clients MUST surface the crash as distinct from a transport-level disconnect.

### 5.5 `amarre.push_sent`

Optional. Emitted on the WS of a session when the server has just dispatched a push notification on its behalf (see §13). Clients connected to the session MAY use this to suppress local toast/notification UI that would otherwise duplicate the OS-level push.

```json
{"type":"amarre.push_sent","trigger":"awaiting_input","tokens":2,"requestId":"<uuid>"}
```

- `trigger`: `"awaiting_input" | "crashed"`. Future minor versions MAY add values; clients MUST tolerate unknown ones.
- `tokens`: integer count of recipient tokens the server attempted to push to.
- `requestId`: only present when `trigger === "awaiting_input"`; matches the `id` of the originating `extension_ui_request`.

A server without push enabled never emits this. A client that does not understand it MUST log + ignore (per §5.3).

---

## 6. Layer 4 — agent payload (pi RPC schema)

This section describes the schema for agent = `pi`. Other agents define their own Layer 4 schema in their adapter's README; the server is agnostic to which is in use.

### 6.1 Reference

The canonical reference is `docs/rpc.md` shipped inside the `@mariozechner/pi-coding-agent` npm package. On a NixOS rpi5 deployment:

```
find /nix/store -name rpc.md -path '*pi-coding-agent*'
```

The summary below is non-normative — for any disagreement with pi's docs, pi wins.

### 6.2 Client → server (commands)

| `type`                  | Purpose                                                 |
|-------------------------|---------------------------------------------------------|
| `prompt`                | Send a user prompt; triggers a turn.                    |
| `steer`                 | Inject a steering message during streaming.             |
| `follow_up`             | Queue a follow-up to be delivered when the agent idles. |
| `abort`                 | Cancel the current agent operation.                     |
| `new_session`           | Start a fresh session.                                  |
| `switch_session`        | Load an existing session by JSONL path.                 |
| `fork`                  | Fork from a specific entry into a new session.          |
| `clone`                 | Duplicate the current branch into a new session.        |
| `set_model`             | Switch model (`provider` + `modelId`).                  |
| `cycle_model`           | Cycle to the next configured model.                     |
| `set_thinking_level`    | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` |
| `compact`               | Manual compaction with optional `customInstructions`.   |
| `bash`                  | Execute a shell command outside the LLM tool loop.      |
| `abort_bash`            | Cancel a running `bash`.                                |
| `get_state`             | Snapshot of model, session, streaming state, …          |
| `get_messages`          | Full message history for the active session.            |
| `get_session_stats`     | Token/cost/context-window usage.                        |
| `get_commands`          | Available extension/prompt/skill commands.              |
| `get_fork_messages`     | User messages eligible for `fork`.                      |
| `get_last_assistant_text` | Text content of the last assistant message.            |
| `set_session_name`      | Set a display name for the active session.              |
| `set_steering_mode`     | `"all" \| "one-at-a-time"`.                             |
| `set_follow_up_mode`    | `"all" \| "one-at-a-time"`.                             |
| `set_auto_compaction`   | `enabled: boolean`.                                     |
| `set_auto_retry`        | `enabled: boolean`.                                     |
| `abort_retry`           | Cancel an in-progress automatic retry.                  |
| `extension_ui_response` | Answer a `confirm`/`select`/`input`/`editor` request.   |

### 6.3 Server → client (events)

| `type`                  | Trigger                                                 |
|-------------------------|---------------------------------------------------------|
| `response`              | Ack for a `id`-correlated command. `success: boolean`.  |
| `agent_start`           | Agent began processing a prompt.                        |
| `agent_end`             | Agent finished. `messages: …`.                          |
| `turn_start`            | New turn (one assistant response + tools).              |
| `turn_end`              | Turn complete. `message`, `toolResults`.                |
| `message_start`         | A user/assistant/toolResult message began.              |
| `message_update`        | Streaming token deltas. `assistantMessageEvent.{type, delta, …}`. |
| `message_end`           | Message complete.                                       |
| `tool_execution_start`  | Tool started. `toolCallId, toolName, args`.             |
| `tool_execution_update` | Tool streaming progress. `partialResult`.               |
| `tool_execution_end`    | Tool finished. `result, isError`.                       |
| `queue_update`          | Steering / follow-up queue changed.                     |
| `compaction_start`      | Compaction began. `reason: "manual" \| "threshold" \| "overflow"`. |
| `compaction_end`        | Compaction done.                                        |
| `auto_retry_start`      | Transient error; retrying. `attempt, maxAttempts, delayMs`. |
| `auto_retry_end`        | Retry succeeded or failed terminally.                   |
| `extension_error`       | An extension threw.                                     |
| `extension_ui_request`  | Extension asks the user (`select`/`confirm`/`input`/`editor`/`notify`/`setStatus`/`setWidget`/`setTitle`/`set_editor_text`). |

For `method:"notify"` records, an optional `event` discriminant (added v2.1) signals a structured broadcast that does NOT expect an `extension_ui_response`. The agent resolves the underlying request internally — clients render the message but MUST NOT reply. Defined values:

| `event`        | Emitted by    | Meaning                                                                                |
|----------------|---------------|----------------------------------------------------------------------------------------|
| `plan_capture` | `claude-code` | Claude entered plan mode and emitted a plan markdown. `message` carries the markdown. |

Clients MUST tolerate unknown `event` values on `notify` records (log + render the `message` field as-is).

### 6.4 Streaming deltas

Inside `message_update`, the `assistantMessageEvent.type` is one of: `start`, `text_start`, `text_delta`, `text_end`, `thinking_start`, `thinking_delta`, `thinking_end`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done`, `error`. Clients render `text_delta` for visible streaming and use `done`/`error` to know when the assistant finished.

---

## 7. Permission flow

Permission interception is the most subtle part of the protocol — most other behaviour is straightforward proxying. Walkthrough (within one session):

1. Client sends `prompt` that elicits a tool call from the LLM.
2. Server sees `tool_execution_start` from that session's agent (broadcast to the session's clients).
3. The pi adapter's `permission-gate.ts` extension intercepts, calls `ctx.ui.confirm(...)`. In RPC mode this becomes:
   ```json
   {"type":"extension_ui_request","id":"<uuid>","method":"confirm",
    "title":"Run bash?","message":"{\"command\":\"ls /tmp\"}"}
   ```
   Server broadcasts this to the session's clients only.
4. Each client SHOULD render an approval card to the user. The first client whose user approves sends:
   ```json
   {"type":"extension_ui_response","id":"<same uuid>","confirmed":true}
   ```
   Server forwards this to the addressed session's agent stdin.
5. Agent receives the response, the gate's handler resumes, returns `undefined` (allow) or `{block: true, reason: …}` (deny).
6. Client sees `tool_execution_update` / `tool_execution_end` reflecting the outcome.

### 7.1 Cross-client races (within a session)

If two clients of the same session answer with different decisions, only the first one to reach the server wins (TCP-arrival order). Clients SHOULD treat their own response as advisory: if a `tool_execution_end` arrives with a different outcome than their answer would imply, the *other* client won.

Cross-**session** races are not possible by construction — a permission request from session A is only sent to session A's clients.

### 7.2 Timeouts

`extension_ui_request` records MAY include a `timeout` field (milliseconds). When the timeout elapses, the agent auto-resolves the request (default: cancelled). Clients MAY display the countdown but MUST NOT mutate the timeout themselves; only the agent owns it.

### 7.3 Block path

`{"confirmed":false}` (or any `cancelled:true`) causes the gate to return `{block: true, reason: "denied by remote user"}`. The agent then reports the block to the LLM as a tool result with `isError: true` — the LLM sees it and chooses what to do next.

---

## 8. Errors

### 8.1 Layer 1/2

- Malformed JSON on a WS → server logs and ignores. No reply.
- Empty / blank line on a WS → ignored.
- Frame too large → server MAY drop the connection.
- Malformed JSON in a REST body → server treats as empty body (defaults applied).

### 8.2 Layer 4

- Command-shaped record where the agent rejects it (e.g. unknown `type`, missing required field) → the agent emits a `response` with `success: false` and `error: "<message>"`, correlated by `id`.
- Agent crash → see §4.2 / §5.4. Per-session, isolated. The server stays up; other sessions are unaffected.
- Whole-server crash (Bun-level, OOM, etc.) → process exits non-zero, systemd restarts. Clients see the WebSocket close with no `amarre.session_event`. Reconnect via `GET /sessions` to discover the (empty) session map.

### 8.3 Layer 3

The only Layer 3 message in v2 is `amarre.session_event`. Any malformed Layer 3 envelope (none defined) is handled as Layer 1/2 noise.

---

## 9. Future extensions (informational)

The following are NOT part of v2.0 but are listed so v2 implementations can stay forward-compatible by:
- not using reserved namespaces (§5.3),
- being tolerant of unknown top-level fields,
- being tolerant of unknown `type` values (log + ignore, do not abort),
- being tolerant of unknown `amarre.session_event.event` values.

Planned:

- **`amarre.hello`** — server sends on connect with `version`, `agent.name`, `sessionId`, `capabilities[]`. Client SHOULD use it to negotiate.
- **State.json rehydrate** — sessions surviving a server restart, recovering `cwd`/`env`/`name` and re-spawning their agents on boot.
- **Auto-restart-on-crash** — opt-in policy with bounded retries and a circuit breaker.
- **Authentication beyond tailnet** — bearer-token cookie set after a one-time passcode at `/login`.
- **Binary media channel** — large attachments (screenshots, audio) over binary frames.
- **Capability advertisement** — adapters declare what they support (e.g. `fork`, `worktree`, `bash`); clients gate UI accordingly.
- **Multi-adapter-per-server** — one amarre instance hosting `pi` and `claude-code` sessions side by side; needs the hello message to advertise per-session adapter identity.
- **Supervisor fan-in** — a `/supervisor` WS that receives every session's events for monitoring.

---

## 10. Reference implementations

- **Server**: [`server/server.ts`](../server/server.ts) (Bun, single file).
- **pi adapter**: [`agents/pi/adapter.ts`](../agents/pi/adapter.ts) + [`agents/pi/permission-gate.ts`](../agents/pi/permission-gate.ts).
- **Test fake**: [`tests/fixtures/echo-agent.sh`](../tests/fixtures/echo-agent.sh) + [`tests/fixtures/echo-adapter.ts`](../tests/fixtures/echo-adapter.ts).
- **Tests**: [`server/server.test.ts`](../server/server.test.ts) (single-session round-trip / fanout / split-line) + [`server/multi.test.ts`](../server/multi.test.ts) (list / spawn / delete / crash isolation / restart / max-sessions).

---

## 11. Worked example

```
client                                    server                               agent (pi, session=abc)
  │                                          │                                    │
  ├── POST /sessions  ────────────────────────▶                                    │
  │                                          │ spawn() ──────────────────────────▶│ (pid 1234)
  ◀── 201 {"id":"abc","status":"running"} ───┤                                    │
  │                                          │                                    │
  ├── connect wss://…/sessions/abc ───────────▶                                    │
  │                                          │                                    │
  ├── {"id":"1","type":"get_state"} ─────────▶ → stdin ─────────────────────────▶│
  │                                          │ ◀── stdout ──────────────────── ──┤
  ◀── {"id":"1","type":"response", …data} ───┤                                    │
  │                                          │                                    │
  ├── {"id":"2","type":"prompt","message": ──▶ → stdin ─────────────────────────▶│
  │      "list /tmp using bash"}             │                                    │
  │                                          │ ◀── stdout (agent_start) ─────────┤
  ◀── {"type":"agent_start"} ────────────────┤                                    │
  ◀── {"type":"message_update","assistant…} ─┤  (token deltas streaming)          │
  ◀── {"type":"tool_execution_start", …} ────┤                                    │
  ◀── {"type":"extension_ui_request",        │                                    │
        "id":"<uuid>","method":"confirm",    │                                    │
        "title":"Run bash?","message":"…"} ──┤                                    │
  │                                          │                                    │
  ├── {"type":"extension_ui_response",  ─────▶ → stdin ─────────────────────────▶│
        "id":"<uuid>","confirmed":true}      │                                    │
  │                                          │                                    │
  ◀── {"type":"tool_execution_end", …} ──────┤                                    │
  ◀── {"type":"message_update", …}    ───────┤                                    │
  ◀── {"type":"agent_end", "messages":…} ────┤                                    │
  │                                          │                                    │
  ├── close ─────────────────────────────────▶                                    │
                                             │ (agent keeps running for next client of session abc)
```

Crash path:

```
  ├── {"_emit":"die"} (or pi panics) ────────▶ → stdin ─────────────────────────▶│
                                             │                                    ✗ (exit 7)
                                             │ ◀── child.exit ───────────────────┤
  ◀── {"type":"amarre.session_event",        │
        "event":"crashed","exitCode":7} ────┤
  ◀── close 1011 ────────────────────────────┤
                                             │  (other sessions continue running; server stays up)
  ├── POST /sessions/abc/restart ────────────▶
                                             │ spawn() ──────────────────────────▶│ (pid 1789)
  ◀── 200 {"id":"abc","status":"running"} ───┤
```

---

## 12. Conformance checklist (clients)

A client claiming `2.0.0` conformance MUST:

- [x] `POST /sessions` to create a session before connecting (or use a session id surfaced by `GET /sessions`).
- [x] Open a WebSocket to `wss://<host>:<port>/sessions/<id>` and tolerate text frames.
- [x] Split each frame on `\n`, parse each chunk as JSON, ignore blanks.
- [x] Be tolerant of unknown `type` values (including unknown `amarre.*`) and unknown top-level fields.
- [x] Recognize `amarre.session_event` and surface a `crashed` event distinctly from a transport disconnect.
- [x] Send `id`-correlated commands and match by `id` on `response` events.
- [x] Render `extension_ui_request` (at least `confirm`) and reply with `extension_ui_response` referencing the same `id`.
- [x] On disconnect, reconnect with exponential backoff and resume via `get_state` / `get_messages`.
- [x] On a `crashed` event, treat the session as needing a `POST /sessions/<id>/restart` (or `DELETE` + `POST /sessions`) before reconnecting.
- [x] NOT connect to `wss://<host>:<port>/` without a session path (server returns `426`).
- [x] NOT use top-level field names starting with `_`.
- [x] NOT use top-level `type` values starting with `amarre.`.

A client claiming conformance for a specific agent (e.g. `pi`) MUST additionally implement that agent's Layer 4 schema as documented by the agent itself.

The push-notification capability (§13) is OPTIONAL. A 2.1.0-conformant client that does not implement push MUST still tolerate the new `amarre.push_sent` event by logging and ignoring it (already covered by the §5.3 forward-compatibility rule).

---

## 13. Push notifications (optional capability, 2.2.0+)

Push gives the user an OS-level notification on a registered device when a session demands attention while no human-facing client is actively connected. The capability is **optional**: servers MAY refuse to enable it (e.g. configuration disabled, no writable token store), in which case the routes below return `503` and no push is ever sent. Clients MAY skip token registration entirely; the rest of the protocol is unaffected.

### 13.1 Transport

Push is delivered through the **Expo Push Service** (`https://exp.host/--/api/v2/push/send`), which fronts APNs (iOS) and FCM v1 (Android). The amarre server is the sender. Tokens MUST be Expo push tokens (`ExponentPushToken[…]` or `ExpoPushToken[…]`); raw FCM/APNs tokens are not accepted in 2.1.

A server's project id (Expo `projectId`) is configured out-of-band and pinned. Tokens issued under one project id are NOT deliverable through another. Clients MUST register only tokens they obtained against the server's expected project id.

### 13.2 Token registration

```
POST /push/tokens
Content-Type: application/json

{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "deviceName": "iPhone 15 Pro",                   // optional, ≤ 64 chars
  "platform": "ios"                                  // optional: "ios"|"android"|"web"
}
```

- `201 Created` body `{token, deviceName, platform, registeredAt}` on first registration.
- `200 OK` same body if the token was already known (idempotent).
- `400 invalid_token` if the string fails Expo-token validation.
- `503 push_disabled` if the server has push disabled or its token store is unwritable.

```
DELETE /push/tokens/<token>
```

- `204 No Content` whether or not the token existed (idempotent).
- `503 push_disabled` if disabled.

```
GET /push/tokens
```

- `200 OK` body `[{token, deviceName, platform, registeredAt}, …]`. Intended for debugging / admin clients; servers MAY require additional auth in future versions.
- `503 push_disabled` if disabled.

The server MUST persist the token list across restarts (file or DB) so that a deploy/reboot does not silently break notifications.

### 13.3 Triggers

Servers MUST support these triggers; both fire to **all** registered tokens (single-tenant tailnet model — multi-user gating is a future extension).

| Trigger | Condition | Debounce |
|---|---|---|
| `awaiting_input` | An `extension_ui_request` has been emitted on a session and no `extension_ui_response` matching the same `id` has arrived from any client of that session within `AMARRE_PUSH_GRACE_MS` (default 15 000 ms). | One push per `extension_ui_request.id`. Resolving (any answer) cancels the pending timer. |
| `crashed` | The session's child has exited and the server is about to broadcast `amarre.session_event` with `event:"crashed"`. | One push per crash event. A subsequent `POST /sessions/<id>/restart` resets state. |

A server SHOULD additionally suppress `awaiting_input` pushes when a client of the session has sent a Layer 4 message within the grace window — the user is clearly at the keyboard and rendering the request locally.

### 13.4 Payload contract

The Expo push payload sent by the server SHALL include:

```json
{
  "to": "ExponentPushToken[…]",
  "title": "amarre · awaiting input",
  "body": "<short summary, ≤ 100 chars>",
  "sound": "default",
  "data": {
    "amarre": "1",
    "trigger": "awaiting_input",
    "sessionId": "<id>",
    "sessionName": "<name or null>",
    "requestId": "<uuid, only for awaiting_input>",
    "method": "<confirm|select|input|editor, only for awaiting_input>"
  }
}
```

Crashed payload omits `requestId`/`method` and uses `trigger: "crashed"`. Clients receiving a tap MUST route on `data.trigger` + `data.sessionId`. The `data.amarre = "1"` discriminator is a fixed string; clients MAY use it to detect amarre-issued pushes vs. unrelated app pushes.

### 13.5 Token housekeeping

When the Expo Push Service returns a `DeviceNotRegistered` ticket or receipt for a token, the server MUST remove that token from its store. Other Expo error codes (`MessageTooBig`, `MessageRateExceeded`, `MismatchSenderId`, `InvalidCredentials`) are logged and the token retained.

### 13.6 Privacy

Push payloads traverse Apple/Google infrastructure outside the tailnet. Servers SHOULD NOT include sensitive command output, file paths, or secrets in `body` or `data`. The default `body` is the tool name and ≤ 100 chars of its argument summary; servers MAY truncate further or redact via configuration.

---

## 14. Remote Claude (claude.ai/code dual-control, optional capability, 2.3.0+)

Remote Claude is an **adapter-specific** capability of the `claude-code` adapter. When enabled, every spawned session ALSO registers a session against Anthropic's CCR backend (`POST /v1/code/sessions`) so it appears at `claude.ai/code` and the Anthropic mobile app. The amarre WebSocket and `claude.ai/code` are two co-equal control surfaces feeding the same SDK `Query` instance — single source of truth for session state.

The capability is **optional** and **opt-in per server**. Servers MAY ship without it; servers MAY ship with it disabled. The amarre WS protocol is unaffected when it is off — local-only behaviour is identical to 2.2.0.

### 14.1 Architecture

```
┌──────────────────┐                                         ┌──────────────────┐
│  amarre client   │ ─── WS / REST ───┐                      │  claude.ai/code  │
│  (Expo, …)       │                  │                      │  + mobile app    │
└──────────────────┘                  ▼                      └──────────────────┘
                              ┌──────────────┐                        ▲
                              │ amarre server│                        │
                              └─────┬────────┘                        │
                                    │ stdio                           │ SSE + HTTP
                                    ▼                                 │
                              ┌──────────────┐  bridge transport      │
                              │   broker     │ ◀──────────────────────┘
                              │  (this PR)   │  (CCR worker JWT, 4h)
                              └─────┬────────┘
                                    │ SDK Query
                                    ▼
                              ┌──────────────┐
                              │  query()     │
                              │  + claude    │
                              └──────────────┘
```

The broker creates the CCR session via `POST /v1/code/sessions`, mints a worker JWT via `POST /v1/code/sessions/{id}/bridge`, and attaches the SDK's `attachBridgeSession` (no `outboundOnly`). Inbound user prompts, permission answers, interrupts, and `set_model` / `set_permission_mode` from `claude.ai/code` are wired to the same SDK Query the amarre WS drives.

### 14.2 Permission arbitration (first-responder wins)

A `canUseTool` callback emits a permission prompt to BOTH surfaces, sharing the same `request_id`:

- amarre WS: `extension_ui_request{method:"confirm",id:<id>,...}` (Layer 3, broadcast to all amarre clients of this session — unchanged from 2.2.0).
- `claude.ai/code`: `control_request{request_id:<id>,request:{subtype:"can_use_tool",tool_name,input,tool_use_id}}` (CCR transport, sent via the bridge handle).

Whichever surface answers first wins. The losing surface MUST be told to dismiss its prompt:

- If amarre wins (an `extension_ui_response` matching `<id>` arrived from any amarre client): the broker calls `bridge.sendControlCancelRequest(<id>)`; `claude.ai/code` dismisses the prompt.
- If `claude.ai/code` wins (a `control_response` matching `<id>` arrived from the bridge): the broker emits `extension_ui_request{method:"notify",event:"permission_resolved",id:<id>}` to amarre clients; clients MUST dismiss any locally rendered permission UI for `<id>`.

Late answers from the second responder are dropped silently — the SDK callback has already been resolved.

### 14.3 New Layer 3 events

All four are server-originated; clients MAY render them, MUST tolerate (log + ignore) them if they don't recognise them.

```json
{"type":"amarre.remote_attached","ccrSessionId":"cse_…","mode":"dual","title":"<host>:<short-id>"}
```

Emitted once per session right after the bridge handle is ready. Clients MAY surface "this session is also visible on claude.ai" UI.

```json
{"type":"amarre.remote_inbound","ccrSessionId":"cse_…","source":"claude.ai","content":"<≤400 char preview>"}
```

Emitted when a user typed a prompt on `claude.ai/code` and the broker enqueued it for the SDK. Clients SHOULD render it as a user-side message in the transcript so amarre users see the conversation continue.

```json
{"type":"amarre.remote_permission_decided","id":"<request_id>","source":"amarre"|"claude.ai","decision":"allow"|"deny"}
```

Emitted exactly once per resolved permission prompt that involved both surfaces. Clients use it to dismiss the local prompt UI when the OTHER surface won; clients SHOULD also use it for telemetry.

```json
{"type":"amarre.remote_failed","ccrSessionId":"cse_…","code":401|4090|4091|null}
```

Emitted when the bridge transport closes terminally (JWT expiry, epoch superseded, init failure). The amarre WS keeps working — local-only operation continues. Codes match the SDK bridge's `onClose` codes; `null` means SSE reconnect budget exhausted.

### 14.4 New `extension_ui_request{method:"notify"}` event

```json
{"type":"extension_ui_request","method":"notify","event":"permission_resolved","id":"<request_id>"}
```

Sent when `claude.ai/code` answered a permission prompt before any amarre client did. Clients with an open confirm UI for `<id>` MUST dismiss it. Servers MAY emit `permission_resolved` even when no remote-resolution actually occurred (idempotent dismissal).

### 14.5 Session summary (REST)

When Remote Claude is enabled and a session has successfully attached, the summary returned by `GET /sessions/<id>` MAY carry an additional optional field:

```json
{
  "id": "…",
  "instanceId": "…",
  "status": "running",
  "remote": { "ccrSessionId": "cse_…", "mode": "dual" }
}
```

Absent (or null) means Remote Claude is off for this session. Field is purely informational.

### 14.6 Lifecycle

- **Persist on close**: when the amarre session ends (DELETE, crash, or graceful close), the broker drops the bridge transport but does NOT delete the CCR session. The user prunes via `claude.ai/code` (or via a separate `DELETE /v1/code/sessions/<id>` against Anthropic). Rationale: amarre crashes between create-and-delete should not strand orphan sessions, and users may want to keep transcript history on `claude.ai`.
- **No auto-reconnect**: when the bridge JWT expires (4h) or the worker epoch is superseded, the broker emits `amarre.remote_failed` and stops forwarding. amarre WS continues. A future minor MAY add automatic JWT refresh.
- **Failure modes**:
  - Token file unreadable → broker logs once, no `amarre.remote_attached` is emitted, session is local-only.
  - `createCodeSession` returns `null` → same.
  - `fetchRemoteCredentials` returns `CredentialsFailure` (`untrusted_device` / `session_stale_relogin`) → broker logs the reason + remediation hint, no `amarre.remote_attached`, session is local-only.
  - `attachBridgeSession` throws → same as transient.

### 14.7 Privacy

SDK messages forwarded to the bridge include the FULL transcript content: system prompt, tool inputs (file paths, command lines), tool outputs. This is the same content `claude.ai/code` would have if the session had been started natively — Remote Claude does not introduce a new privacy lens. Operators with stricter requirements SHOULD leave the capability disabled.
