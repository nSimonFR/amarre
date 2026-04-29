// Agent adapter for Anthropic's `claude` CLI (Claude Code). Spawns
// `claude -p --input-format stream-json --output-format stream-json --verbose
//  --dangerously-skip-permissions` so the generic server can wire its stdio to
// a WebSocket. The process stays alive across multiple `user` messages on
// stdin and preserves session context across turns.

import { spawn } from "node:child_process";
import type { AgentAdapter, SpawnOpts } from "../../server/adapter.ts";

const adapter: AgentAdapter = {
  name: "claude-code",
  spawn(opts: SpawnOpts = {}) {
    const bin = process.env.CLAUDE_BIN ?? "claude";
    const model = process.env.AMARRE_CLAUDE_MODEL;
    const extra = (process.env.AMARRE_CLAUDE_EXTRA_ARGS ?? "")
      .split(/\s+/)
      .filter(Boolean);
    const args = [
      "-p",
      "--input-format", "stream-json",
      "--output-format", "stream-json",
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
  },
};

export default adapter;
