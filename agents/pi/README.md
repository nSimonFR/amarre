# pi adapter

Adapter for [`@mariozechner/pi-coding-agent`](https://github.com/badlogic/pi-mono). Spawns:

```
pi --mode rpc -e <agents/pi/permission-gate.ts>
```

`pi --mode rpc` is pi's documented headless mode that exposes the agent over JSONL on stdin/stdout. The permission-gate extension converts every `tool_call` into a `confirm` dialog routed through pi's Extension UI Protocol — surfacing as an `extension_ui_request` on the wire that the connected client must answer with an `extension_ui_response`.

## Files

- `adapter.ts` — `AgentAdapter` factory; spawns pi with the gate loaded.
- `permission-gate.ts` — pi extension; `pi.on("tool_call", ...)` → `ctx.ui.confirm(...)`. Block path returns `{ block: true, reason: "denied by remote user" }` to the LLM.
- `permission-gate.test.ts` — unit test against a mock `ExtensionAPI`.

## Env vars

- `PI_BIN` — path to the `pi` binary. Defaults to `pi` (PATH-resolved).
- `AMARRE_PI_GATE` — path to the permission-gate extension. Defaults to `./permission-gate.ts` next to `adapter.ts`.

## Wire format consumed

The bridge is a literal pass-through, so the client speaks pi's documented RPC schema verbatim. See `docs/rpc.md` inside the `@mariozechner/pi-coding-agent` npm package, and the consolidated specification at [`docs/PROTOCOL.md`](../../docs/PROTOCOL.md) in this repo.
