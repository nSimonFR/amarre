// AgentAdapter contract. An adapter is a small module under `agents/<name>/`
// that knows how to spawn one specific CLI agent (pi, claude-code, codex, …)
// in a stdio-streaming mode. The server is otherwise agnostic to which agent
// is running — it just proxies JSONL lines between WebSocket clients and the
// child process's stdin/stdout.

import type { ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";

export type AgentChild = ChildProcessByStdio<Writable, Readable, null>;

export interface AgentAdapter {
  /** Display name; surfaced in logs and (eventually) the hello message. */
  name: string;
  /** Spawn the underlying agent. stdin pipe + stdout pipe required; stderr
   *  inherits or pipes — server doesn't care. */
  spawn(): AgentChild;
}
