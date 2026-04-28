# Amarre Protocol

Wire-format specification for clients (front) and servers (back) speaking the **amarre protocol** — a thin tailnet-only WebSocket transport for driving a CLI coding agent (`pi`, `claude-code`, …) from a remote device.

This document is normative. If a behaviour is not described here, it is not part of the protocol.

---

## 1. Status & versioning

- **Version**: `1.0.0` (this document). The version refers to the *transport* envelope and the *agent-agnostic* surface only. The inner agent payload is governed by the agent's own RPC schema (see §6).
- **Maturity**: MVP. Single-session, multi-client. No authentication beyond network-layer (tailnet) ACL. No backwards-compatibility guarantees within `1.x.x` while we collect real-client feedback; expect at most additive changes until `2.0.0`.
- **Stability boundaries**:
  - Changes that REMOVE or RENAME a top-level field, or a top-level message `type`, are breaking → bump major.
  - Changes that ADD optional top-level fields, or a new `type` value, are non-breaking → bump minor.
  - Bug fixes only → bump patch.

A future `hello` handshake (§9) will allow servers and clients to agree on a version at connect time. Until then, both sides assume `1.0.0`.

---

## 2. Layered model

```
┌─────────────────────────────────────────────────┐
│  Layer 4 — Agent payload (pi RPC, …)            │  agent-specific
├─────────────────────────────────────────────────┤
│  Layer 3 — Amarre envelope (this spec)          │  agent-agnostic
├─────────────────────────────────────────────────┤
│  Layer 2 — JSONL framing                        │  one JSON object per line
├─────────────────────────────────────────────────┤
│  Layer 1 — WebSocket (RFC 6455 over TLS)        │  text frames
└─────────────────────────────────────────────────┘
```

Layer 4 is the agent's own protocol — for `pi`, that is the schema documented at `docs/rpc.md` inside the `@mariozechner/pi-coding-agent` npm package. The amarre server is a transparent proxy at Layer 3: it does not parse, validate, or rewrite Layer 4 payloads. Clients therefore must implement the agent's RPC schema directly (see §6).

---

## 3. Transport (Layer 1 + 2)

### 3.1 URL

```
wss://<host>:<port>/
```

- Scheme: `wss` (TLS) over a tailnet, or `ws` for loopback testing.
- Path: `/` — no per-session path component. The server is single-session by default (§4); a future multi-session extension will reuse `/sessions/<id>`.
- Default port: configurable; deployed on `4344` over Tailscale Serve, `8341` on loopback.

### 3.2 Frames

- Use **text frames** only. Binary frames are reserved for a future media channel and MUST be ignored by current servers and clients.
- Each text frame contains exactly **one** JSONL record — a single JSON value followed by an implicit newline. Servers and clients SHOULD send one record per frame; if a frame contains multiple records separated by `\n`, the receiver MUST split on `\n` and handle each independently.
- Lines are UTF-8. Empty lines are skipped silently.
- Maximum frame size is implementation-defined; 1 MiB is a reasonable floor for clients to support to accommodate streamed assistant text and image inputs.

### 3.3 Connect / disconnect

- A WebSocket connection is **stateless from the server's perspective**: the agent runs continuously and is shared by all connected clients. Disconnecting and reconnecting does not reset, restart, fork, or compact the agent.
- A client MAY disconnect at any time. The server MUST NOT abort, cancel, or queue-drop the agent when a client disconnects.
- A client MUST be prepared for the server to close the connection at any time (e.g. systemd restart, network blip). Clients SHOULD reconnect with exponential backoff (initial 1 s, cap 30 s) and resume at Layer 4 by issuing `get_state` / `get_messages` (§6.1).

### 3.4 Keepalives

- The server MUST honour standard WebSocket pings; it MAY also originate pings on its own schedule (default ≥ 30 s interval).
- Clients SHOULD respond to server pings within 10 s. Failing to do so MAY cause the server to drop the connection.
- Application-level keepalives are not part of the protocol.

---

## 4. Session model

### 4.1 Single-session, multi-client (v1)

- Exactly one underlying agent process exists per server instance, started at server boot.
- Any number of clients MAY connect concurrently. The server fans out every Layer 4 event from the agent to every connected client (broadcast).
- Commands from clients are written to the agent's stdin in arrival order across all clients. The server does not serialize commands per-client; it serializes globally.
- The "session" identity (in the agent's sense — its conversation history, current model, etc.) is owned by the agent and is shared across all clients. Use Layer 4 commands like `new_session`, `switch_session`, `fork`, `clone` to manipulate it (§6.1).

### 4.2 Multi-client semantics

When >1 client is connected:

- **Broadcast events**: every event from the agent's stdout reaches every client. This includes `extension_ui_request` permission cards. Clients SHOULD render the permission card to the user; the **first client to send a matching `extension_ui_response`** wins. Subsequent responses for the same `id` MUST be ignored by the server (forwarded to the agent verbatim, where pi will discard the duplicate).
- **Command race**: if two clients send conflicting commands at the same moment (e.g. both send `prompt`), the server forwards both to the agent in arrival order. The agent's behaviour governs the outcome (pi rejects mid-stream `prompt` without `streamingBehavior`; see §6.1).
- **No per-client state**: the server does not track which client originated which command. `id` correlation (§5.2) is the client's responsibility.

### 4.3 Future: multi-session

A future revision will add:
- `POST /sessions` — create a new session (potentially with worktree spawn).
- `GET /sessions` — list active sessions.
- `wss://…/sessions/<id>` — connect to a specific session.
- A `session_id` field on every Layer 3 envelope.

These are not present in v1.

---

## 5. Layer 3 — Amarre envelope

### 5.1 Pass-through model (v1)

In v1, the amarre envelope is **the empty envelope**: every record on the wire is a Layer 4 payload, unwrapped. The server does not add, strip, or rewrite any field.

This means a client implementing pi's RPC schema can talk to amarre directly with no extra adapter layer. The protocol exists *as* pi's RPC schema, framed over WebSocket.

### 5.2 Correlation

Every command-style record sent client-to-server SHOULD include an `id` field (free-form string, ≤ 128 chars, opaque to the server). The agent will echo this `id` on the corresponding `response` record, allowing the client to correlate command and response.

Events (server-to-client records that are not direct command responses) do NOT carry an `id`.

### 5.3 Reserved namespaces

- Top-level field names beginning with an underscore (`_`) are reserved for future amarre-envelope use (e.g. a future `_v` version field, `_session` session id). Clients MUST NOT use them at Layer 4. Servers MUST forward them verbatim if present today (v1 does not strip).
- Top-level `type` values beginning with `amarre.` are reserved for future Layer 3 messages. None exist in v1.

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

### 6.4 Streaming deltas

Inside `message_update`, the `assistantMessageEvent.type` is one of: `start`, `text_start`, `text_delta`, `text_end`, `thinking_start`, `thinking_delta`, `thinking_end`, `toolcall_start`, `toolcall_delta`, `toolcall_end`, `done`, `error`. Clients render `text_delta` for visible streaming and use `done`/`error` to know when the assistant finished.

---

## 7. Permission flow

Permission interception is the most subtle part of the protocol — most other behaviour is straightforward proxying. Walkthrough:

1. Client sends `prompt` that elicits a tool call from the LLM.
2. Server sees `tool_execution_start` from the agent (broadcast to all clients).
3. The pi adapter's `permission-gate.ts` extension intercepts, calls `ctx.ui.confirm(...)`. In RPC mode this becomes:
   ```json
   {"type":"extension_ui_request","id":"<uuid>","method":"confirm",
    "title":"Run bash?","message":"{\"command\":\"ls /tmp\"}"}
   ```
   Server broadcasts this to all clients.
4. Each client SHOULD render an approval card to the user. The first client whose user approves sends:
   ```json
   {"type":"extension_ui_response","id":"<same uuid>","confirmed":true}
   ```
   Server forwards this to the agent's stdin.
5. Agent receives the response, the gate's handler resumes, returns `undefined` (allow) or `{block: true, reason: …}` (deny).
6. Client sees `tool_execution_update` / `tool_execution_end` reflecting the outcome.

### 7.1 Multi-client races

If two clients answer with different decisions, only the first one to reach the server wins (TCP-arrival order). Clients SHOULD treat their own response as advisory: if a `tool_execution_end` arrives with a different outcome than their answer would imply, the *other* client won.

### 7.2 Timeouts

`extension_ui_request` records MAY include a `timeout` field (milliseconds). When the timeout elapses, the agent auto-resolves the request (default: cancelled). Clients MAY display the countdown but MUST NOT mutate the timeout themselves; only the agent owns it.

### 7.3 Block path

`{"confirmed":false}` (or any `cancelled:true`) causes the gate to return `{block: true, reason: "denied by remote user"}`. The agent then reports the block to the LLM as a tool result with `isError: true` — the LLM sees it and chooses what to do next.

---

## 8. Errors

### 8.1 Layer 1/2

- Malformed JSON → server logs and ignores. No reply.
- Empty / blank line → ignored.
- Frame too large → server MAY drop the connection.

### 8.2 Layer 4

- Command-shaped record where the agent rejects it (e.g. unknown `type`, missing required field) → the agent emits a `response` with `success: false` and `error: "<message>"`, correlated by `id`.
- Agent crash → server exits with code 1; systemd restarts. Clients see the WebSocket close. Reconnect; the agent will be a fresh process with no in-memory state (session JSONL on disk persists if pi was given `--session-dir`).

### 8.3 Layer 3

No Layer 3 errors are defined in v1. Any malformed Layer 3 envelope (none exist) is handled as Layer 1/2 noise.

---

## 9. Future extensions (informational)

The following are NOT part of v1 but are listed so v1 implementations can stay forward-compatible by:
- not using reserved namespaces (§5.3),
- being tolerant of unknown top-level fields,
- being tolerant of unknown `type` values (log + ignore, do not abort).

Planned:

- **`amarre.hello`** — server sends on connect with `version`, `agent.name`, `capabilities[]`. Client SHOULD use it to negotiate.
- **Multi-session** — `_session` field added to every envelope, plus `wss://…/sessions/<id>` URLs.
- **Authentication beyond tailnet** — bearer-token cookie set after a one-time passcode at `/login`.
- **Push notifications** — server hits a webhook (e.g. Telegram / iOS push) when an `extension_ui_request` is unanswered for ≥ N seconds.
- **Binary media channel** — large attachments (screenshots, audio) over binary frames.
- **Capability advertisement** — adapters declare what they support (e.g. `fork`, `worktree`, `bash`); clients gate UI accordingly.

---

## 10. Reference implementations

- **Server**: [`server/server.ts`](../server/server.ts) (Bun, single file).
- **pi adapter**: [`agents/pi/adapter.ts`](../agents/pi/adapter.ts) + [`agents/pi/permission-gate.ts`](../agents/pi/permission-gate.ts).
- **Test fake**: [`tests/fixtures/echo-agent.sh`](../tests/fixtures/echo-agent.sh) + [`tests/fixtures/echo-adapter.ts`](../tests/fixtures/echo-adapter.ts).

---

## 11. Worked example

```
client                                    server                               agent (pi)
  │                                          │                                    │
  ├── connect wss://…/ ──────────────────────▶                                    │
  │                                          │ (already running)                  │
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
                                             │ (agent keeps running for next client)
```

---

## 12. Conformance checklist (clients)

A client claiming `1.0.0` conformance MUST:

- [x] Open a WebSocket to `wss://<host>:<port>/` and tolerate text frames.
- [x] Split each frame on `\n`, parse each chunk as JSON, ignore blanks.
- [x] Be tolerant of unknown `type` values and unknown top-level fields.
- [x] Send `id`-correlated commands and match by `id` on `response` events.
- [x] Render `extension_ui_request` (at least `confirm`) and reply with `extension_ui_response` referencing the same `id`.
- [x] On disconnect, reconnect with exponential backoff and resume via `get_state` / `get_messages`.
- [x] NOT use top-level field names starting with `_`.
- [x] NOT use top-level `type` values starting with `amarre.`.

A client claiming conformance for a specific agent (e.g. `pi`) MUST additionally implement that agent's Layer 4 schema as documented by the agent itself.
