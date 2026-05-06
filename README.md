# amarre

> French *amarre* — a mooring line. The bit of rope between a boat and the dock.

Tailnet-only WebSocket harness for driving one or more CLI coding agents (`pi`, `claude-code`, …) from a remote device. Self-hosted analogue of Anthropic's Claude Code Remote Control, no third-party relay. Multi-session: one server hosts up to N agent processes, each addressable by id.

Two agent adapters ship in-tree:
- [`agents/pi/`](./agents/pi/) — `pi-coding-agent` with a remote permission-approval extension.
- [`agents/claude-code/`](./agents/claude-code/) — Anthropic's `claude` CLI in stream-json mode (skip-permissions in v1).

## Layout

```
amarre/
├── server/                # generic WS ↔ stdio proxy (~80 LOC, Bun)
├── agents/                # agent adapter plugins
│   ├── pi/                #   adapter for pi-coding-agent (+ permission-gate ext)
│   └── claude-code/       #   adapter for Anthropic's claude CLI (stream-json)
├── apps/                  # native / web client apps
│   ├── expo/              #   Expo cross-platform client (active)
│   └── ios/               #   parked SwiftUI placeholder
├── tests/fixtures/        # echo-agent + echo-adapter for server tests
├── docs/PROTOCOL.md       # full wire-format specification
├── flake.nix              # packages.<system>.server + nixosModules.amarre + checks
└── module.nix
```

The server is **agent-agnostic**: it loads an adapter at startup based on `AMARRE_AGENT` (default `pi`) and proxies JSONL bidirectionally between WebSocket clients and per-session agent processes. Sessions are spawned/listed/killed via a small REST control plane on the same port. Agents are plugins under `agents/`. Apps consuming the protocol are separate projects under `apps/`.

## Protocol

See [**docs/PROTOCOL.md**](./docs/PROTOCOL.md) (v2.0.0) for the full front/back specification — REST control plane, WebSocket data plane, framing, multi-client semantics, permission flow, error handling, conformance checklist, and a worked example.

Layer-summary: HTTP/WebSocket → JSONL → amarre envelope (transparent proxy + one `amarre.session_event`) → agent's own RPC schema (e.g. pi's `docs/rpc.md`).

## Run locally

With real `pi`:
```sh
bun install
bun test                          # server + multi-session + adapter tests
PI_BIN=$(which pi) bun run server/server.ts
```

With real `claude-code`:
```sh
AMARRE_AGENT=claude-code CLAUDE_BIN=$(which claude) \
  bun run server/server.ts
```

Then from another shell — spawn a session, connect to it:

```sh
ID=$(curl -s -X POST http://127.0.0.1:8341/sessions -d '{}' | jq -r .id)
websocat ws://127.0.0.1:8341/sessions/$ID
{"id":"1","type":"get_state"}
```

Other useful endpoints:

```sh
curl -s http://127.0.0.1:8341/sessions               # list
curl -s http://127.0.0.1:8341/sessions/$ID           # status
curl -s -X POST http://127.0.0.1:8341/sessions/$ID/restart
curl -s -X DELETE http://127.0.0.1:8341/sessions/$ID
```

## Deploy via NixOS

Consumed as a flake input (`github:nSimonFR/amarre`). Module:

```nix
services.amarre = {
  enable      = true;
  agent       = "pi";       # default; matches agents/pi/
  port        = 8341;
  user        = "nsimon";
  maxSessions = 8;          # default; cap on concurrent agent processes
};
```

The systemd unit runs as the configured user so it inherits home-dir agent config (`~/.pi/agent/{settings.json,models.json,extensions/}`). Pair with `tailscale serve` to expose the loopback port over the tailnet at HTTPS.

### Optional: Remote Claude (claude.ai/code dual-control)

When the `claude-code` adapter is enabled, amarre can mirror its sessions to `claude.ai/code` and the Anthropic mobile app — both surfaces drive the same SDK Query (PROTOCOL §14). amarre stays the primary control plane.

```nix
services.amarre.remoteClaude = {
  enable    = true;
  tokenPath = "/run/claude-oauth/token";   # default
};
```

The token must be readable by `services.amarre.user`; the `claude-remote-control.service` (separately deployed) keeps it fresh.

## Adding an agent

See [agents/README.md](./agents/README.md). Each adapter is a small TypeScript module that knows how to spawn one specific CLI agent in stdio-streaming mode.

## Adding a client

See [apps/README.md](./apps/README.md). Speak the documented protocol — don't introduce alternative wire formats.

## Status

v0.3 — multi-session, multi-client, tailnet-only (PROTOCOL.md v2.0.0). See `docs/PROTOCOL.md` §9 for planned extensions (state.json rehydrate, hello handshake, capability advertisement, auto-restart, push, binary media, multi-adapter-per-server).
