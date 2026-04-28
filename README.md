# amarre

> French *amarre* — a mooring line. The bit of rope between a boat and the dock.

Tailnet-only WebSocket harness for driving a CLI coding agent (`pi`, `claude-code`, …) from a remote device. Self-hosted analogue of Anthropic's Claude Code Remote Control, no third-party relay.

Two agent adapters ship in-tree:
- [`agents/pi/`](./agents/pi/) — `pi-coding-agent` with a remote permission-approval extension.
- [`agents/claude-code/`](./agents/claude-code/) — Anthropic's `claude` CLI in stream-json mode (skip-permissions in v1).

## Layout

```
amarre/
├── server/                # generic WS ↔ stdio proxy (~80 LOC, Bun)
├── agents/                # agent adapter plugins
│   └── pi/                #   adapter for pi-coding-agent (+ permission-gate ext)
├── apps/                  # future native / web client apps
│   └── ios/               #   placeholder
├── tests/fixtures/        # echo-agent + echo-adapter for server tests
├── docs/PROTOCOL.md       # full wire-format specification
├── flake.nix              # packages.<system>.server + nixosModules.amarre + checks
└── module.nix
```

The server is **agent-agnostic**: it loads an adapter at startup based on `AMARRE_AGENT` (default `pi`) and proxies JSONL bidirectionally between WebSocket clients and the spawned agent. Agents are plugins under `agents/`. Apps consuming the protocol are separate projects under `apps/`.

## Protocol

See [**docs/PROTOCOL.md**](./docs/PROTOCOL.md) for the full front/back specification — connection, framing, multi-client semantics, permission flow, error handling, conformance checklist, and a worked example.

Layer-summary: WebSocket → JSONL → empty amarre envelope (v1 is a transparent proxy) → agent's own RPC schema (e.g. pi's `docs/rpc.md`).

## Run locally

With real `pi`:
```sh
bun install
bun test                          # server + adapter tests
PI_BIN=$(which pi) bun run server/server.ts
```
Then from another shell:
```sh
websocat ws://127.0.0.1:8341/
{"id":"1","type":"get_state"}
```

With real `claude-code`:
```sh
AMARRE_AGENT=claude-code CLAUDE_BIN=$(which claude) \
  bun run server/server.ts
```
Then:
```sh
websocat ws://127.0.0.1:8341/
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"hi"}]}}
```

## Deploy via NixOS

Consumed as a flake input (`github:nSimonFR/amarre`). Module:

```nix
services.amarre = {
  enable = true;
  agent  = "pi";          # default; matches agents/pi/
  port   = 8341;
  user   = "nsimon";
};
```

The systemd unit runs as the configured user so it inherits home-dir agent config (`~/.pi/agent/{settings.json,models.json,extensions/}`). Pair with `tailscale serve` to expose the loopback port over the tailnet at HTTPS.

## Adding an agent

See [agents/README.md](./agents/README.md). Each adapter is a small TypeScript module that knows how to spawn one specific CLI agent in stdio-streaming mode.

## Adding a client

See [apps/README.md](./apps/README.md). Speak the documented protocol — don't introduce alternative wire formats.

## Status

v0.2 — single-session, multi-client, tailnet-only. See `docs/PROTOCOL.md` §9 for planned extensions (multi-session, hello handshake, capability advertisement, push, binary media).
