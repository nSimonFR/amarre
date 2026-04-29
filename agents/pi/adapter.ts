// Agent adapter for `pi-coding-agent`. Spawns `pi --mode rpc -e <gate>` and
// returns the child process so the generic server can wire its stdio to a
// WebSocket. Defaults are sensible; AMARRE_PI_GATE / PI_BIN override them.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter, SpawnOpts } from "../../server/adapter.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const PI_BIN = process.env.PI_BIN ?? "pi";
const PI_GATE = process.env.AMARRE_PI_GATE ?? resolve(HERE, "permission-gate.ts");

const adapter: AgentAdapter = {
  name: "pi",
  spawn(opts: SpawnOpts = {}) {
    const args = ["--mode", "rpc"];
    if (PI_GATE) args.push("-e", PI_GATE);
    return spawn(PI_BIN, args, {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: opts.cwd,
      env: { ...process.env, PI_TELEMETRY: "0", ...(opts.env ?? {}) },
    });
  },
};

export default adapter;
