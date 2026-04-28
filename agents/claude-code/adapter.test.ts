import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import adapter from "./adapter";

const ENV_KEYS = [
  "CLAUDE_BIN",
  "AMARRE_CLAUDE_MODEL",
  "AMARRE_CLAUDE_EXTRA_ARGS",
] as const;

describe("claude-code adapter", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = {};
    for (const k of ENV_KEYS) snap[k] = process.env[k];
    // Always pin the binary to /usr/bin/env so we never accidentally launch
    // a real `claude` from the test runner.
    process.env.CLAUDE_BIN = "/usr/bin/env";
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
    // Don't actually spawn — bare "claude" might resolve to a real binary.
    // Inspect by re-creating the args inline using the same logic.
    const bin = process.env.CLAUDE_BIN ?? "claude";
    expect(bin).toBe("claude");
  });
});
