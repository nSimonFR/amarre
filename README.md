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

For multiple side-by-side adapter instances (e.g. separate `CLAUDE_HOME` per profile), use `services.amarre.instances` instead and route via the `instanceId` body field on `POST /sessions` (see `docs/PROTOCOL.md` §4.1):

```nix
services.amarre.instances = {
  personal = { agent = "claude-code"; env = { CLAUDE_HOME = "/home/me/.claude_personal"; }; };
  work     = { agent = "claude-code"; env = { CLAUDE_HOME = "/home/me/.claude_work"; }; };
  pi       = { agent = "pi"; };
};
```

The systemd unit runs as the configured user so it inherits home-dir agent config (`~/.pi/agent/{settings.json,models.json,extensions/}`, `~/.claude/`). Pair with `tailscale serve` to expose the loopback port over the tailnet at HTTPS. Optional Expo push notifications are gated by `services.amarre.push.enable` (PROTOCOL §13).

## Adding an agent

See [agents/README.md](./agents/README.md). Each adapter is a small TypeScript module that knows how to spawn one specific CLI agent in stdio-streaming mode.

## Adding a client

See [apps/README.md](./apps/README.md). Speak the documented protocol — don't introduce alternative wire formats.

## Setup for AI coding agents

Notes for a Claude Code / Codex / Aider session landing in this repo cold. Read once before touching anything.

### Toolchain

- **Bun** runs everything — no `node`, no `tsc`. `package.json` declares `"type": "module"` and the only `scripts` are `start` (`bun run server/server.ts`) and `test` (`bun test`).
- TypeScript is consumed directly by Bun; no separate compile step. The Nix flake does run a `bun build` for `agents/claude-code/broker.ts` to ship a self-contained bundle (so the spawned `bun` at runtime needs no `node_modules` lookup against the read-only store) — that's the only build artifact.
- Runtime dep: `@anthropic-ai/claude-agent-sdk` (drives the Claude Code SDK broker). Dev deps: `@types/bun`, `@types/ws`, `ws`.

### Dev shell

`flake.nix` exists but provides only `packages.<system>.{server,amarreSrc}` + `nixosModules.amarre` + `checks.<system>.tests`. There is **no `devShells` output** — `nix develop` will drop you into a default shell with nothing extra. Install `bun` locally (or `nix shell nixpkgs#bun`) and work from the repo root.

### Common commands

```sh
bun install                       # populate node_modules from bun.lock
bun test                          # runs every *.test.ts (server + adapters + push)
bun run start                     # = bun run server/server.ts
PI_BIN=$(which pi) bun run start  # local dev with real pi
```

There is no lint / format script and no CI workflow under `.github/` beyond the Probot `settings.yml`. The Nix `checks.tests` derivation re-runs `bun test` in a sandbox; reproduce it locally with `nix flake check`.

### Test layout

- `server/*.test.ts` — REST control plane, multi-session, multi-instance, push.
- `agents/<name>/*.test.ts` and `agents/claude-code/tests/` — per-adapter unit tests.
- `tests/fixtures/` — `echo-agent` + `echo-adapter` used by server tests via `AMARRE_AGENT_PATH`.

When adding a new adapter, drop a colocated `adapter.test.ts` asserting that `spawn()` returns a child with open stdin/stdout pipes and round-trips at least one JSONL line.

### Adding a new agent backend

The extension point is `agents/<name>/adapter.ts`, exporting `default` as an `AgentAdapter` (`{ name, spawn(opts?) }`) from `server/adapter.ts`. The server resolves it via `AMARRE_AGENT=<name>` (or `AMARRE_AGENT_PATH=<absolute path>` for tests/fixtures). Spawned child must accept JSONL on stdin and emit JSONL on stdout — see [`agents/README.md`](./agents/README.md) for the full contract (steps 1–5).

### Tailscale dependency

amarre is **loopback-only by design** — `server.ts` reads `AMARRE_HOST` (default `127.0.0.1`) and `AMARRE_PORT` (default `8341`). Exposure is delegated to `tailscale serve` on the host (typically proxied to HTTPS on the tailnet). The server itself doesn't authenticate clients; it trusts the tailnet ACL. There are no Tailscale env vars / scopes / OAuth tokens read by the server — pure socket binding. The NixOS module sets `HOME=/home/${user}` so the spawned agents read the configured user's `~/.pi/`, `~/.claude/`, etc.

### GitHub workflow (hard rules)

- **Every `gh` and `git push` op MUST run under the `nSimonFR-ai` GitHub account.** Switch first: `gh auth switch -u nSimonFR-ai`. Never use the personal `nSimonFR` account from agent sessions.
- Create feature branches off `main` and open a PR — do not push directly to `main`. The repo enforces `enforce_admins: true` on `main` (see `.github/settings.yml`).
- Merge style is **rebase-merge only** (`allow_squash_merge: false`, `allow_merge_commit: false`).

### Commit message conventions

Conventional-commit-style with a scope, lowercase imperative. Scopes seen in `git log` include `expo`, `module`, `push`, `broker`, `claude-code`, `protocol`, `hub`, `permission`, `chat`, `composer`, `connect`, `lib`. Use `feat:` for new behaviour, `feat!:` for a breaking protocol bump, `fix:` for bug fixes, `chore:` for housekeeping. Examples from the history:

```
feat(module): expose services.amarre.push.{enable,tokensPath,graceMs}
feat(push): optional Expo push notifications (PROTOCOL 2.1.0)
fix(broker): force every tool through canUseTool + supply updatedInput
feat!: multi-session protocol (PROTOCOL v2.0.0)
```

Keep subjects under ~72 chars. No body required for small changes; reference PROTOCOL section + version on wire-format changes.

### Key env vars cheat-sheet

| Var                          | Default                       | Notes |
| ---------------------------- | ----------------------------- | ----- |
| `AMARRE_AGENT`               | `pi`                          | Adapter name → `agents/<name>/adapter.ts` |
| `AMARRE_AGENT_PATH`          | —                             | Absolute module path; overrides `AMARRE_AGENT` (tests) |
| `AMARRE_INSTANCES_JSON`      | —                             | Multi-instance config; non-empty array wins over legacy single-agent |
| `AMARRE_HOST`                | `127.0.0.1`                   | Bind addr; keep on loopback |
| `AMARRE_PORT`                | `8341`                        | TCP port |
| `AMARRE_MAX_SESSIONS`        | `8`                           | Cap; `POST /sessions` returns 429 past this |
| `PI_BIN`                     | `pi`                          | pi adapter |
| `AMARRE_PI_GATE`             | `agents/pi/permission-gate.ts`| pi adapter extension path |
| `CLAUDE_BIN`                 | `claude`                      | claude-code adapter |
| `AMARRE_CLAUDE_BROKER`       | `agents/claude-code/broker.ts`| SDK broker entrypoint (Nix swaps in bundled `.js`) |
| `AMARRE_CLAUDE_LEGACY=1`     | —                             | Use stream-json translator instead of SDK broker |
| `AMARRE_CLAUDE_RAW=1`        | —                             | Raw stream-json passthrough; debugging |
| `AMARRE_CLAUDE_MODEL`        | —                             | Forwarded to `claude --model` (raw/legacy modes) |
| `AMARRE_BUN_BIN`             | `bun`                         | Used to spawn the broker |
| `AMARRE_PUSH_TOKENS_PATH`    | —                             | Enables push when set; JSON token store |
| `AMARRE_PUSH_GRACE_MS`       | `15000`                       | Wait before firing awaiting-input push |
| `AMARRE_PUSH_EXPO_URL`       | Expo default                  | Override push endpoint |

## Status

v0.3 — multi-session, multi-client, tailnet-only (PROTOCOL.md v2.0.0). See `docs/PROTOCOL.md` §9 for planned extensions (state.json rehydrate, hello handshake, capability advertisement, auto-restart, push, binary media, multi-adapter-per-server).
