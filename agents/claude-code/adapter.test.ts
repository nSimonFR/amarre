import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import adapter from "./adapter";

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE_CLAUDE = resolve(HERE, "tests/fixtures/fake-claude.sh");

const ENV_KEYS = [
  "CLAUDE_BIN",
  "AMARRE_CLAUDE_MODEL",
  "AMARRE_CLAUDE_EXTRA_ARGS",
  "AMARRE_CLAUDE_RAW",
] as const;

type LineReader = {
  take(count: number, timeoutMs?: number): Promise<string[]>;
};

function attachReader(stdout: NodeJS.ReadableStream): LineReader {
  const queue: string[] = [];
  const waiters: Array<{
    need: number;
    resolveP: (lines: string[]) => void;
    rejectP: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  let buf = "";
  const tryServe = (): void => {
    while (waiters.length > 0 && queue.length >= waiters[0].need) {
      const w = waiters.shift()!;
      clearTimeout(w.timer);
      w.resolveP(queue.splice(0, w.need));
    }
  };
  stdout.on("data", (chunk: Buffer | string) => {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line) queue.push(line);
    }
    tryServe();
  });
  return {
    take(count: number, timeoutMs = 3000): Promise<string[]> {
      return new Promise<string[]>((resolveP, rejectP) => {
        if (queue.length >= count) {
          resolveP(queue.splice(0, count));
          return;
        }
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.timer === timer);
          if (i >= 0) waiters.splice(i, 1);
          rejectP(
            new Error(
              `timed out waiting for ${count} lines, got ${queue.length}: ${JSON.stringify(queue)}`,
            ),
          );
        }, timeoutMs);
        waiters.push({ need: count, resolveP, rejectP, timer });
      });
    },
  };
}

describe("claude-code adapter (raw mode = AMARRE_CLAUDE_RAW=1)", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = {};
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    process.env.CLAUDE_BIN = "/usr/bin/env";
    process.env.AMARRE_CLAUDE_RAW = "1";
    delete process.env.AMARRE_CLAUDE_MODEL;
    delete process.env.AMARRE_CLAUDE_EXTRA_ARGS;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  test("name is claude-code", () => {
    expect(adapter.name).toBe("claude-code");
  });

  test("spawns with stream-json + skip-permissions", () => {
    const child = adapter.spawn();
    try {
      expect(child.spawnfile).toBe("/usr/bin/env");
      expect(child.spawnargs.slice(1)).toEqual([
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
      ]);
      expect(child.stdin).toBeTruthy();
      expect(child.stdout).toBeTruthy();
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("appends --model when AMARRE_CLAUDE_MODEL is set", () => {
    process.env.AMARRE_CLAUDE_MODEL = "haiku";
    const child = adapter.spawn();
    try {
      const args = child.spawnargs;
      const idx = args.indexOf("--model");
      expect(idx).toBeGreaterThan(0);
      expect(args[idx + 1]).toBe("haiku");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("appends AMARRE_CLAUDE_EXTRA_ARGS verbatim, space-split", () => {
    process.env.AMARRE_CLAUDE_EXTRA_ARGS = "--add-dir /tmp --foo bar";
    const child = adapter.spawn();
    try {
      expect(child.spawnargs.slice(-4)).toEqual(["--add-dir", "/tmp", "--foo", "bar"]);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("falls back to bare `claude` when CLAUDE_BIN unset", () => {
    delete process.env.CLAUDE_BIN;
    const bin = process.env.CLAUDE_BIN ?? "claude";
    expect(bin).toBe("claude");
  });
});

describe("claude-code adapter (default = wrapped, pi schema)", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = {};
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    process.env.CLAUDE_BIN = FAKE_CLAUDE;
    delete process.env.AMARRE_CLAUDE_RAW;
    delete process.env.AMARRE_CLAUDE_MODEL;
    delete process.env.AMARRE_CLAUDE_EXTRA_ARGS;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (snap[k] === undefined) delete process.env[k];
      else process.env[k] = snap[k];
    }
  });

  test("forwards spawnfile/spawnargs/pid through the wrapper", () => {
    const child = adapter.spawn();
    try {
      expect(child.spawnfile).toBe(FAKE_CLAUDE);
      expect(child.spawnargs).toContain("--input-format");
      expect(child.spawnargs).toContain("stream-json");
      expect(typeof child.pid).toBe("number");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("PING turn → response, agent_start, turn_start, message_update(text=PONG), turn_end, agent_end", async () => {
    const child = adapter.spawn();
    try {
      const r = attachReader(child.stdout);
      child.stdin.write('{"id":"q1","type":"prompt","message":"PING"}\n');
      const lines = await r.take(6);
      const events = lines.map((l) => JSON.parse(l)) as Array<{
        type: string;
        command?: string;
        success?: boolean;
        assistantMessageEvent?: { type: string; delta?: string };
        message?: { content: Array<{ type: string; text?: string }> };
      }>;
      expect(events[0]).toEqual(
        expect.objectContaining({ type: "response", command: "prompt", success: true }),
      );
      expect(events[1].type).toBe("agent_start");
      expect(events[2].type).toBe("turn_start");
      expect(events[3].type).toBe("message_update");
      expect(events[3].assistantMessageEvent?.type).toBe("text_delta");
      expect(events[3].assistantMessageEvent?.delta).toBe("PONG");
      expect(events[4].type).toBe("turn_end");
      expect(events[4].message?.content[0]).toEqual({ type: "text", text: "PONG" });
      expect(events[5].type).toBe("agent_end");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("TOOL turn yields tool_execution_start + tool_execution_end matched by toolCallId", async () => {
    const child = adapter.spawn();
    try {
      const r = attachReader(child.stdout);
      child.stdin.write('{"id":"q2","type":"prompt","message":"TOOL"}\n');
      const lines = await r.take(10);
      const events = lines.map((l) => JSON.parse(l)) as Array<{
        type: string;
        toolCallId?: string;
        toolName?: string;
        isError?: boolean;
      }>;
      const start = events.find((e) => e.type === "tool_execution_start");
      const end = events.find((e) => e.type === "tool_execution_end");
      expect(start?.toolCallId).toBe("tu_1");
      expect(start?.toolName).toBe("Bash");
      expect(end?.toolCallId).toBe("tu_1");
      expect(end?.toolName).toBe("Bash");
      expect(end?.isError).toBe(false);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("WAIT + abort: client receives a turn_end after sending interrupt", async () => {
    const child = adapter.spawn();
    try {
      const r = attachReader(child.stdout);
      child.stdin.write('{"id":"q3","type":"prompt","message":"WAIT"}\n');
      const early = (await r.take(3)).map((l) => JSON.parse(l) as { type: string });
      expect(early[0].type).toBe("response");
      expect(early[1].type).toBe("agent_start");
      expect(early[2].type).toBe("turn_start");
      child.stdin.write('{"id":"q4","type":"abort"}\n');
      const post = (await r.take(3)).map(
        (l) => JSON.parse(l) as { type: string; command?: string },
      );
      const types = post.map((e) => (e.type === "response" ? `response:${e.command}` : e.type));
      expect(types).toContain("response:abort");
      expect(types).toContain("turn_end");
      expect(types).toContain("agent_end");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("get_state synthesizes a response without a roundtrip to claude", async () => {
    const child = adapter.spawn();
    try {
      const r = attachReader(child.stdout);
      child.stdin.write('{"id":"qs","type":"get_state"}\n');
      const [first] = await r.take(1);
      const ev = JSON.parse(first) as {
        type: string;
        command: string;
        success: boolean;
        data: { isStreaming: boolean };
      };
      expect(ev.type).toBe("response");
      expect(ev.command).toBe("get_state");
      expect(ev.success).toBe(true);
      expect(ev.data.isStreaming).toBe(false);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("unsupported command yields success:false response", async () => {
    const child = adapter.spawn();
    try {
      const r = attachReader(child.stdout);
      child.stdin.write('{"id":"qm","type":"set_model","model":"sonnet"}\n');
      const [first] = await r.take(1);
      const ev = JSON.parse(first) as { success: boolean; error: string };
      expect(ev.success).toBe(false);
      expect(ev.error).toContain("set_model");
    } finally {
      child.kill("SIGKILL");
    }
  });
});
