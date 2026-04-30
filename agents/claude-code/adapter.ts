// Agent adapter for Anthropic's Claude Code. Three modes:
//
//   1. Default (SDK broker) — spawns `bun run broker.ts`. The broker imports
//      `@anthropic-ai/claude-agent-sdk`, drives `query()`, translates SDK
//      messages into pi RPC frames, and routes `canUseTool` callbacks through
//      the wire as `extension_ui_request{method:"confirm"}`. No
//      `--dangerously-skip-permissions`; tool calls are gated by the user.
//
//   2. AMARRE_CLAUDE_LEGACY=1 (stream-json + translator) — spawns `claude -p`
//      directly and wraps it in the bidirectional translator at
//      ./translator.ts. Same WS contract; no SDK; no permission gate.
//
//   3. AMARRE_CLAUDE_RAW=1 (raw passthrough) — spawns `claude -p` and exposes
//      its stream-json directly on the WS. For debugging or clients that
//      target Claude Code natively. Pass-through; no translation.
//
// Modes 2 + 3 are kept for backward compatibility (mode 2 is what the merged
// translator-based adapter shipped with) — the SDK broker is the new default.

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PassThrough, type Readable, type Writable } from "node:stream";

import type { AgentAdapter, AgentChild, SpawnOpts } from "../../server/adapter.ts";
import { createState, translateInbound, translateOutbound, type TranslateResult } from "./translator.ts";

type RawChild = ChildProcessByStdio<Writable, Readable, null>;

const HERE = dirname(fileURLToPath(import.meta.url));
// Use the pre-bundled broker (includes @anthropic-ai/claude-agent-sdk inline)
// when it's available; otherwise fall back to the .ts source. The Nix flake
// produces the bundle at build time and exports the path via
// AMARRE_CLAUDE_BROKER. Dev/test runs against the .ts directly.
const BROKER_PATH = process.env.AMARRE_CLAUDE_BROKER ?? resolve(HERE, "broker.ts");

function spawnRaw(opts: SpawnOpts): RawChild {
  const bin = process.env.CLAUDE_BIN ?? "claude";
  const model = process.env.AMARRE_CLAUDE_MODEL;
  const extra = (process.env.AMARRE_CLAUDE_EXTRA_ARGS ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const args = [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--verbose",
    "--dangerously-skip-permissions",
  ];
  if (model) args.push("--model", model);
  if (extra.length) args.push(...extra);
  return spawn(bin, args, {
    stdio: ["pipe", "pipe", "inherit"],
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
}

function spawnBroker(opts: SpawnOpts): RawChild {
  // The broker is a Bun script; the spawned `bun` runs it. Pass the SpawnOpts
  // cwd to the broker so the SDK's `cwd` option matches the session.
  const bunBin = process.env.AMARRE_BUN_BIN ?? "bun";
  const env = { ...process.env, ...(opts.env ?? {}) };
  if (opts.cwd) env.AMARRE_CLAUDE_CWD = opts.cwd;
  return spawn(bunBin, ["run", BROKER_PATH], {
    stdio: ["pipe", "pipe", "inherit"],
    cwd: opts.cwd,
    env,
  });
}

// Wraps the legacy stream-json child so writes to fake.stdin are translated to
// stream-json and pushed to real.stdin, and data on real.stdout is translated
// to pi-RPC and pushed to fake.stdout. See translator.ts for the mapping.
function wrapLegacy(real: RawChild): AgentChild {
  const state = createState();
  const fakeStdin = new PassThrough();
  const fakeStdout = new PassThrough();

  const apply = (r: TranslateResult): void => {
    for (const line of r.stdin) {
      if (real.stdin.writable) real.stdin.write(line + "\n");
    }
    for (const line of r.outbound) {
      fakeStdout.write(line + "\n");
    }
  };

  let inBuf = "";
  fakeStdin.on("data", (chunk: Buffer | string) => {
    inBuf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = inBuf.indexOf("\n")) !== -1) {
      const line = inBuf.slice(0, nl).replace(/\r$/, "");
      inBuf = inBuf.slice(nl + 1);
      if (!line) continue;
      apply(translateInbound(line, state));
    }
  });
  fakeStdin.on("end", () => {
    try {
      real.stdin.end();
    } catch {}
  });

  let outBuf = "";
  real.stdout.on("data", (chunk: Buffer) => {
    outBuf += chunk.toString("utf8");
    let nl: number;
    while ((nl = outBuf.indexOf("\n")) !== -1) {
      const line = outBuf.slice(0, nl).replace(/\r$/, "");
      outBuf = outBuf.slice(nl + 1);
      if (!line) continue;
      apply(translateOutbound(line, state));
    }
  });

  const fake = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: null;
    pid?: number;
    spawnfile: string;
    spawnargs: string[];
    kill: (sig?: number | NodeJS.Signals) => boolean;
  };
  fake.stdin = fakeStdin;
  fake.stdout = fakeStdout;
  fake.stderr = null;
  fake.pid = real.pid;
  fake.spawnfile = real.spawnfile;
  fake.spawnargs = real.spawnargs;
  fake.kill = (sig?: number | NodeJS.Signals) => real.kill(sig);

  real.on("exit", (code, signal) => {
    fakeStdout.end();
    fake.emit("exit", code, signal);
  });
  real.on("error", (err) => {
    fake.emit("error", err);
  });
  real.on("close", (code, signal) => {
    fake.emit("close", code, signal);
  });

  return fake as unknown as AgentChild;
}

const adapter: AgentAdapter = {
  name: "claude-code",
  spawn(opts: SpawnOpts = {}) {
    if (process.env.AMARRE_CLAUDE_RAW === "1") return spawnRaw(opts);
    if (process.env.AMARRE_CLAUDE_LEGACY === "1") return wrapLegacy(spawnRaw(opts));
    // Default: SDK broker. Speaks pi RPC on stdio, identical wire to the
    // legacy translator but with `canUseTool` permission gating.
    return spawnBroker(opts);
  },
};

export default adapter;
