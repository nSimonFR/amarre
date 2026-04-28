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

`-p` (`--print`) plus `--input-format stream-json` is Claude Code's documented streaming non-interactive mode: the process reads JSONL `user` messages on stdin and emits JSONL events on stdout, staying alive across multiple turns. Session context (LLM history, model, tool use) persists for the lifetime of the process — verified empirically by observing the same `session_id` and a populated `cache_read_input_tokens` field on a second turn.

## Files

- `adapter.ts` — `AgentAdapter` factory. Spawns `claude` with the flags above.
- `adapter.test.ts` — bun:test unit tests against the spawn shape (uses `/usr/bin/env` as a stand-in binary; does not hit Anthropic's API).

## Env vars

- `CLAUDE_BIN` — path to the `claude` binary. Defaults to `claude` (PATH-resolved). The Nix flake sets it to `${pkgs.claude-code}/bin/claude`.
- `AMARRE_CLAUDE_MODEL` (optional) — passed through to `--model`. Useful for forcing `haiku` in dev.
- `AMARRE_CLAUDE_EXTRA_ARGS` (optional, space-separated) — escape hatch for additional flags, e.g. `--add-dir /home/me/work` or `--mcp-config foo.json`.

## Wire format consumed

Layer 4 over the WebSocket is **Claude Code's stream-json schema**, not pi's RPC schema. Clients targeting `claude-code` cannot reuse a pi-only client without rework.

### Client → server (one record per `\n`)

A single record type is meaningful: a `user` message, exactly as Claude Code expects on stdin.

```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}
```

Multi-turn conversations are achieved by sending more `user` records on the same WebSocket; the underlying `claude` process is long-lived and preserves context. Anthropic's full input schema (multi-content, image inputs, etc.) is documented at <https://docs.claude.com/en/docs/claude-code/sdk>.

### Server → client (events)

Each `user` message produces a stream of records on the wire, in roughly this order:

| `type` | Meaning |
|--------|---------|
| `system` (subtype `init`) | Session bootstrap. Re-emitted **once per turn** — clients should tolerate it appearing repeatedly within one connection. The stable identifier is `.session_id`. |
| `rate_limit_event` | Anthropic-side rate-limit snapshot. Informational. |
| `assistant` | Streaming assistant message. Multiple per turn (one per content block: `thinking`, `text`, `tool_use`, …). The `.message.content` field contains the block(s). |
| `user` | Tool-result records when the agent runs tools internally. |
| `result` (subtype `success` or `error`) | Turn finished. `.result` is the final assistant text; `.session_id`, `.usage`, `.total_cost_usd`, `.permission_denials` are also useful. |

Use `result` as the per-turn boundary marker; correlate turns by `.session_id`.

### Permission model — v1 limitation

This adapter spawns `claude` with `--dangerously-skip-permissions`. The agent will execute every tool call without prompting, trusting the tailnet ACL as the sole authorization boundary. This matches the user's existing local alias (`claude --dangerously-skip-permissions --remote-control`) but means there is **no remote approval card** like pi's `permission-gate.ts` provides.

Future work for parity with pi's permission flow: ship a small bundled MCP server alongside the adapter, pass `--permission-prompt-tool <name>` instead of `--dangerously-skip-permissions`, and have the MCP tool emit a `confirm`-shaped record on the wire and block on the client's response. That work is deferred until v2 of this adapter.

## Why not Anthropic's `--remote-control`?

Claude Code has a hidden `--remote-control` flag that activates a hosted Remote Control feature (claude.ai → Anthropic relay → user's phone). amarre is the explicit self-hosted alternative — that flag transports over Anthropic's network, not stdio, so amarre cannot proxy it. See the project README.
