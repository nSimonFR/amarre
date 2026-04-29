// Test-only adapter that spawns tests/fixtures/echo-agent.sh — used by the
// server's own integration tests so they don't depend on real `pi` (which
// would need network for the aperture provider).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter, SpawnOpts } from "../../server/adapter.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ECHO = resolve(HERE, "echo-agent.sh");

const adapter: AgentAdapter = {
  name: "echo",
  spawn(opts: SpawnOpts = {}) {
    return spawn(ECHO, [], {
      stdio: ["pipe", "pipe", "inherit"],
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
    });
  },
};

export default adapter;
