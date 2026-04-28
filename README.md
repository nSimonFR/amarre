# pi-mobile

Remote-session harness for [`pi-coding-agent`](https://github.com/badlogic/pi-mono). Hosts a tailnet-only WebSocket endpoint that proxies onto a single `pi --mode rpc` process, with a permission-gate extension that surfaces every tool call as an `extension_ui_request` for the connected client to approve.

Inspired by Anthropic's Claude Code Remote Control (the iOS "Code" tab) — same idea, self-hosted, no third-party relay.

## Wire format

The bridge is a transparent JSONL passthrough. Clients speak pi's documented RPC schema verbatim. See `pi --mode rpc` docs at `docs/rpc.md` inside the `@mariozechner/pi-coding-agent` npm package.

**Send (client → server):**
- `{type:"prompt", message, images?, streamingBehavior?}`
- `{type:"steer"|"follow_up", message}`
- `{type:"abort"}`
- `{type:"get_state"|"get_messages"}`
- `{type:"extension_ui_response", id, confirmed|value|cancelled}` — answer permission cards

**Receive (server → client):**
- `{type:"response", id, command, success, data?}`
- `{type:"message_update", message, assistantMessageEvent}` (streaming token deltas)
- `{type:"tool_execution_start|update|end", toolCallId, toolName, args|result}`
- `{type:"agent_start|agent_end|turn_start|turn_end"}`
- `{type:"extension_ui_request", id, method:"confirm", title, message}` — permission gate

## Run locally

```sh
bun install
bun test
PI_BIN=$(which pi) bun run bridge/bridge.ts
```

Then from another shell:
```sh
websocat ws://127.0.0.1:8341/
{"id":"1","type":"prompt","message":"hello"}
```

## Deploy via NixOS

Consumed by `nic-os` as a flake input. The `nixosModules.pi-mobile` module exposes:

```nix
services.pi-mobile = {
  enable = true;
  port = 8341;
  user = "nsimon";
};
```

The systemd service runs as the configured user so it inherits `~/.pi/agent/` config (`settings.json`, `models.json`, user extensions). Tailscale Serve in `nic-os` exposes the port over HTTPS at the tailnet hostname.

## Status

v1, single-session, no auth beyond tailnet ACL. See `out of scope` in `nic-os` plan for follow-ups (multi-session, worktrees, cross-host, native client).
