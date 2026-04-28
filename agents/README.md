# Agents

Agent adapter plugins. Each adapter knows how to spawn one specific CLI coding agent (`pi`, `claude-code`, `codex`, `aider`, …) in a stdio-streaming mode so the generic [`server`](../server) can proxy it onto a WebSocket.

## Contract

An adapter is a TypeScript module under `agents/<name>/adapter.ts` that exports a `default` value implementing the `AgentAdapter` interface from [`server/adapter.ts`](../server/adapter.ts):

```ts
export interface AgentAdapter {
  name: string;
  spawn(): ChildProcessByStdio<Writable, Readable, null>;
}
```

The spawned process must:
- accept JSONL on stdin
- emit JSONL on stdout (one record per line)
- stay alive until killed or asked to exit

The adapter may bring along agent-specific extras in its directory (extensions, helpers, fixtures). Those are private to the adapter — the server doesn't load them.

## Selection at runtime

The server picks an adapter via:
- `AMARRE_AGENT=<name>` — resolves to `agents/<name>/adapter.ts` (default `pi`).
- `AMARRE_AGENT_PATH=<absolute path>` — overrides with an explicit module path. Used by tests with `tests/fixtures/echo-adapter.ts`.

## Subdirectories

- [`pi/`](./pi/) — adapter for [`@mariozechner/pi-coding-agent`](https://github.com/badlogic/pi-mono). Spawns `pi --mode rpc -e <permission-gate>`. Bundles a `permission-gate.ts` extension that surfaces every `tool_call` as an `extension_ui_request` the connected client must approve.

## Adding an agent

1. `mkdir agents/<name>`
2. Write `agents/<name>/adapter.ts` exporting `default` as an `AgentAdapter`.
3. Write a unit test next to it — assert that `spawn()` returns a child with an open stdin pipe + stdout pipe, and that lines you write to stdin produce expected lines on stdout.
4. Add a `README.md` describing what the agent is, env vars consumed, and any extras packaged alongside.
5. Update the server's flake input so its closure includes the underlying CLI binary (or expose a flake option for it).
