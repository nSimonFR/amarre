import { describe, expect, test } from "bun:test";
import factory from "./permission-gate";

type Handler = (event: any, ctx: any) => Promise<unknown>;

function loadGate(): Handler {
  let captured: Handler | null = null;
  const fakePi = {
    on(event: string, handler: Handler) {
      if (event === "tool_call") captured = handler;
    },
  };
  factory(fakePi as any);
  if (!captured) throw new Error("permission-gate did not register a tool_call handler");
  return captured;
}

describe("permission-gate", () => {
  test("passes through when the user confirms", async () => {
    const handler = loadGate();
    const calls: { title: string; message: string }[] = [];
    const ctx = {
      ui: {
        async confirm(title: string, message: string) {
          calls.push({ title, message });
          return true;
        },
      },
    };
    const result = await handler({ toolName: "bash", input: { command: "ls" } }, ctx);
    expect(result).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].title).toContain("bash");
    expect(calls[0].message).toContain("ls");
  });

  test("blocks when the user denies", async () => {
    const handler = loadGate();
    const ctx = { ui: { async confirm() { return false; } } };
    const result = (await handler({ toolName: "edit", input: { path: "x" } }, ctx)) as { block: boolean; reason: string };
    expect(result.block).toBe(true);
    expect(result.reason).toMatch(/denied/i);
  });

  test("truncates long inputs into the confirm message", async () => {
    const handler = loadGate();
    const big = "a".repeat(2000);
    let receivedMessage = "";
    const ctx = {
      ui: {
        async confirm(_title: string, message: string) {
          receivedMessage = message;
          return true;
        },
      },
    };
    await handler({ toolName: "bash", input: { command: big } }, ctx);
    expect(receivedMessage.length).toBeLessThanOrEqual(400);
  });
});
