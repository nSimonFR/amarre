// Agent adapter for Anthropic's `claude` CLI. Spawns
// `claude -p --input-format stream-json --output-format stream-json --verbose
//  --dangerously-skip-permissions` and wraps it in a bidirectional translator
// (./translator.ts) so the WS data plane speaks pi RPC instead of Claude
// Code's stream-json. Set AMARRE_CLAUDE_RAW=1 to bypass translation and pass
// stream-json through untouched (kept for debugging and clients that target
// Claude Code natively).

import { spawn, type ChildProcessByStdio } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough, type Readable, type Writable } from "node:stream";

import type { AgentAdapter, AgentChild, SpawnOpts } from "../../server/adapter.ts";
import { createState, translateInbound, translateOutbound, type TranslateResult } from "./translator.ts";

type RawChild = ChildProcessByStdio<Writable, Readable, null>;

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

// Wraps the real claude child so that:
//   * writes to fake.stdin  → pi-cmd lines parsed by translateInbound; emitted
//                             stream-json lines are written to real.stdin and
//                             synthesized pi-event lines are pushed to
//                             fake.stdout.
//   * data on real.stdout   → stream-json lines parsed by translateOutbound;
//                             pi-event lines pushed to fake.stdout, drained
//                             follow-up lines forwarded to real.stdin.
// kill, exit, error, close, pid, spawnfile, spawnargs are forwarded so the
// rest of the server doesn't notice the indirection.
function wrap(real: RawChild): AgentChild {
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
    const real = spawnRaw(opts);
    if (process.env.AMARRE_CLAUDE_RAW === "1") return real;
    return wrap(real);
  },
};

export default adapter;
