# claude-code adapter

Adapter for Anthropic's [Claude Code](https://docs.claude.com/en/docs/claude-code) CLI. Spawns:

```
claude -p \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --dangerously-skip-permissions \
  [--model <m>] [<extra-args>...]
```

`-p` (`--print`) plus `--input-format stream-json` is Claude Code's documented streaming non-interactive mode: the process reads JSONL `user` records on stdin and emits JSONL events on stdout, staying alive across multiple turns. Session context (LLM history, model, tool use) persists for the lifetime of the process.

## Wire format on the WebSocket

By default the adapter wraps the child in a bidirectional **pi RPC ↔ Claude Code stream-json** translator (`./translator.ts`). WS clients targeting this adapter speak the same pi RPC schema they would speak to the `pi` adapter — `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `extension_ui_response` — and receive `agent_start` / `turn_start` / `message_update` / `tool_execution_*` / `turn_end` / `agent_end` events back.

To bypass the translator and pipe raw stream-json through unchanged (debugging or native Claude Code clients), set `AMARRE_CLAUDE_RAW=1`.

## Files

- `adapter.ts` — `AgentAdapter` factory. Spawns `claude` and (unless `AMARRE_CLAUDE_RAW=1`) wraps it.
- `translator.ts` — pure functions `translateInbound` / `translateOutbound` over `TranslatorState`. Has no Node.js stream dependencies; trivially unit-testable.
- `pi-types.ts` — minimal copy of the pi types the translator emits/consumes. Kept local so the adapter has no cross-package dependency on the expo app.
- `tests/fixtures/fake-claude.sh` — stand-in for the real `claude` binary that replays canned stream-json based on the first inbound `user.message.content[0].text`. Used by the wrapped-adapter tests.
- `translator.test.ts` — pure-function unit tests.
- `adapter.test.ts` — raw-mode arg shape + wrapped-mode end-to-end tests via `fake-claude.sh`.

## Translation table (pi → stream-json on stdin)

| pi command | claude stream-json equivalent | notes |
|---|---|---|
| `prompt` / `follow_up` | `{type:"user", message:{role:"user", content:[{type:"text", text}, …]}}` | Images map to `{type:"image", source:{type:"base64", media_type, data}}`. |
| `steer` | same as `follow_up` | Claude Code has no mid-turn steering — v1 emulates by enqueueing as a follow-up to flush *after* the in-flight `result`. Documented gap. |
| `abort` | `{type:"control_request", request_id:<seq>, request:{subtype:"interrupt"}}` | Drains queued follow-ups + steers. |
| `get_state` | synthesized response (no roundtrip) | Carries `isStreaming`, `sessionId`, `messageCount`, `pendingMessageCount`. |
| `get_messages` | synthesized response | Returns the in-process turn history the wrapper has buffered (resets on adapter respawn). |
| `extension_ui_response` | acknowledged, dropped | We don't issue `extension_ui_request`; permission gating is deferred to v2 (see below). |
| anything else (`new_session`, `set_model`, `compact`, `bash`, …) | `response{success:false, error:"…not supported by claude-code adapter v1"}` | The expo client should disable the affordance based on the error. |

## Translation table (stream-json → pi on stdout)

| claude record | pi events |
|---|---|
| `system{subtype:"init"}` | First arrival → `agent_start` + `turn_start`. Subsequent arrivals (Claude Code re-emits init per turn) → `turn_start` only. |
| `rate_limit_event` | Dropped (no pi equivalent). |
| `assistant{message:{content:[blocks]}}` | For each block: `text` → `message_update{assistantMessageEvent:{type:"text_delta", contentIndex, delta}}`; `thinking` → `thinking_delta`; `tool_use` → `toolcall_start` + `toolcall_end` + `tool_execution_start`. |
| `user{message:{content:[tool_result]}}` | `tool_execution_end{toolCallId, toolName, result, isError}`. Tool name is recovered via the `tool_use_id` map populated when the matching `assistant` block was emitted. |
| `result{…}` | `turn_end{message, toolResults}` then `agent_end`. Drains queued follow-ups/steers into stdin and re-arms `inFlight`. |
| `control_request{subtype:"can_use_tool", …}` | Auto-allowed via `control_response` back to claude (defensive — should not fire because of `--dangerously-skip-permissions`). |

## Translation limits (v1)

- **No mid-turn streaming.** Claude Code without `--include-partial-messages` emits whole content blocks per `assistant` record. Each text block becomes one `text_delta` carrying the entire text. The expo UI renders fine but won't show character-by-character streaming.
- **`steer` is not mid-turn steering.** Pi's `steer` interrupts the assistant mid-response; here we queue and replay after the `result` arrives.
- **Permission card flow (`extension_ui_request` / `extension_ui_response`) is not wired.** Claude is launched with `--dangerously-skip-permissions`, so every tool call executes without a prompt — the tailnet ACL is the only authorization boundary. To get parity with pi's permission gate we'd swap to `--permission-prompt-tool <mcp>` and ship a small MCP that emits `can_use_tool` requests. Deferred to v2.
- **Out-of-band history is shallow.** `get_state` and `get_messages` answer with whatever the wrapper has buffered for the *current* claude process. Reconnecting after a crash gives an empty history; the real session log lives inside Claude Code's own state.

## Env vars

- `CLAUDE_BIN` — path to the `claude` binary. Defaults to `claude` (PATH-resolved).
- `AMARRE_CLAUDE_MODEL` (optional) — passed through to `--model`. Useful for forcing `haiku` in dev.
- `AMARRE_CLAUDE_EXTRA_ARGS` (optional, space-separated) — escape hatch for additional flags, e.g. `--add-dir /home/me/work` or `--mcp-config foo.json`.
- `AMARRE_CLAUDE_RAW` (optional, `1` to enable) — bypass the translator and emit raw stream-json on the wire.

## Why not Anthropic's `--remote-control`?

Claude Code has a hidden `--remote-control` flag that activates a hosted Remote Control feature (claude.ai → Anthropic relay → user's phone). amarre is the explicit self-hosted alternative — that flag transports over Anthropic's network, not stdio, so amarre cannot proxy it. See the project README.
