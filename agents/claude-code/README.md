# claude-code adapter

Adapter for Anthropic's [Claude Code](https://docs.claude.com/en/docs/claude-code). Three modes, picked by env var:

| Mode | Trigger | Wire format on the WS | Permission gate |
|---|---|---|---|
| **SDK broker** (default) | none | pi RPC | `canUseTool` → `extension_ui_request{method:"confirm"}` per tool call |
| Legacy translator | `AMARRE_CLAUDE_LEGACY=1` | pi RPC | none (`--dangerously-skip-permissions`) |
| Raw passthrough | `AMARRE_CLAUDE_RAW=1` | Claude Code stream-json | none (`--dangerously-skip-permissions`) |

The two legacy modes spawn `claude -p --input-format stream-json --output-format stream-json --verbose --dangerously-skip-permissions [--model …]` directly. The default mode spawns `bun run agents/claude-code/broker.ts`; the broker imports `@anthropic-ai/claude-agent-sdk` and drives [`query()`](https://docs.claude.com/en/docs/claude-code/sdk) under the hood — same `claude` binary, but the SDK exposes `canUseTool`, `interrupt()`, `setModel()`, `setPermissionMode()` as first-class JS callbacks.

## Wire format on the WebSocket (default + legacy mode)

WS clients targeting `claude-code` speak the same pi RPC schema they would speak to the `pi` adapter — `prompt`, `steer`, `follow_up`, `abort`, `get_state`, `get_messages`, `extension_ui_response`, plus (broker only) `set_model` and `set_permission_mode` — and receive `agent_start` / `turn_start` / `message_update` / `tool_execution_*` / `turn_end` / `agent_end` events back, plus `extension_ui_request` permission cards.

## What the SDK broker adds vs. legacy translator

- **Permission gating.** Every tool call goes through `canUseTool`. The broker emits `extension_ui_request{method:"confirm"}` and blocks the SDK callback until the WS client returns `extension_ui_response`. No `--dangerously-skip-permissions`; the user is the authorization boundary. Identical envelope shape to pi's `permission-gate.ts`.
- **Plan-mode capture.** When Claude calls `ExitPlanMode`, the broker captures `input.plan` and broadcasts `extension_ui_request{method:"notify",event:"plan_capture",message:<markdown>}` — no client response required. The SDK callback is auto-denied so Claude waits for follow-up rather than exiting plan mode.
- **Mid-session controls.** `set_model` and `set_permission_mode` pi commands map to the SDK's `query.setModel(...)` / `query.setPermissionMode(...)`. The legacy translator returns `success:false` for these.

The pi-RPC translation table for the assistant/tool/result events is unchanged from the legacy mode — the broker reuses `translator.ts` to map SDK messages (which share the same JSON envelope shape as stream-json records) to pi events.

## Files

- `adapter.ts` — `AgentAdapter` factory. Picks broker / legacy / raw based on env. Default is broker.
- `broker.ts` — Bun script. Imports `@anthropic-ai/claude-agent-sdk`, runs `query()`, translates SDK output via `translator.ts`, wires `canUseTool` to the WS via `extension_ui_request{method:"confirm"}`. Exports `runBroker({stdin, stdout, createQuery})` for unit tests.
- `translator.ts` — pure functions over `TranslatorState`. Reused by both the legacy adapter and the SDK broker.
- `pi-types.ts` — minimal copy of the pi event types the translator emits.
- `broker.test.ts` — bun:test of the broker using a fake `createQuery`. Covers the SDK-driven flows.
- `translator.test.ts` — pure-function unit tests for the translator.
- `adapter.test.ts` — spawn-shape tests for raw / legacy / broker mode + end-to-end legacy-mode tests via `fake-claude.sh`.
- `tests/fixtures/fake-claude.sh` — stand-in for the real `claude` binary; replays canned stream-json. Used by legacy-mode tests.

## Permission flow (broker mode)

```
                                                 ┌── canUseTool("Bash", {command:"ls"}) ──┐
SDK ──▶ broker.ts                                ▼                                        │
                writes to stdout:                                                         │
                {"type":"extension_ui_request","id":"<uuid>","method":"confirm",          │
                 "title":"Run Bash?","message":"{\"command\":\"ls\"}"}                    │
amarre server ─▶ broadcasts to all WS clients of the session                              │
                                                                                          │
WS client ──▶ {"type":"extension_ui_response","id":"<same uuid>","confirmed":true}        │
amarre server ──▶ broker stdin                                                            │
                                                 resolves canUseTool ─▶ {behavior:"allow"}┘
```

`ExitPlanMode` and `AskUserQuestion` follow the same pattern with `method:"notify"` (no response) and `method:"confirm"` respectively. See `broker.ts` for the exact mapping.

## Env vars

- `CLAUDE_BIN` — path to the `claude` binary. Defaults to `claude`. The Nix flake injects `${pkgs.claude-code}/bin/claude`.
- `AMARRE_BUN_BIN` — path to the `bun` binary used to run the broker. Defaults to `bun`.
- `AMARRE_CLAUDE_MODEL` (optional) — `--model` for legacy/raw mode; SDK option `model` for broker mode.
- `AMARRE_CLAUDE_PERMISSION_MODE` (optional, broker mode) — initial SDK `permissionMode`. Values: `"default"` / `"acceptEdits"` / `"bypassPermissions"` / `"plan"`.
- `AMARRE_CLAUDE_ADDITIONAL_DIRECTORIES` (optional, broker mode, `:`-separated) — paths added to the SDK's `additionalDirectories`.
- `AMARRE_CLAUDE_EXTRA_ARGS` (optional, legacy/raw mode only, space-separated) — pass-through CLI flags.
- `AMARRE_CLAUDE_LEGACY=1` — opt back into the stream-json + translator adapter (no SDK).
- `AMARRE_CLAUDE_RAW=1` — bypass everything; emit raw stream-json on the wire.

## Why not Anthropic's `--remote-control`?

Claude Code has a hidden `--remote-control` flag that activates a hosted Remote Control feature (claude.ai → Anthropic relay → user's phone). amarre is the explicit self-hosted alternative — that flag transports over Anthropic's network, not stdio, so amarre cannot proxy it. See the project README.
