// Test-only adapter that spawns tests/fixtures/echo-agent.sh — used by the
// server's own integration tests so they don't depend on real `pi` (which
// would need network for the aperture provider).

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { AgentAdapter } from "../../server/adapter.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ECHO = resolve(HERE, "echo-agent.sh");

const adapter: AgentAdapter = {
  name: "echo",
  spawn() {
    return spawn(ECHO, [], { stdio: ["pipe", "pipe", "inherit"] });
  },
};

export default adapter;
