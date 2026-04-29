import { describe, expect, test } from "bun:test";
import { createState, translateInbound, translateOutbound } from "./translator";

function parseAll(lines: string[]): unknown[] {
  return lines.map((l) => JSON.parse(l));
}

describe("translator: inbound (pi → claude stream-json)", () => {
  test("prompt while idle goes straight to stdin and acks the client", () => {
    const s = createState();
    const r = translateInbound('{"id":"1","type":"prompt","message":"hi"}', s);
    expect(r.stdin).toHaveLength(1);
    const stdin = JSON.parse(r.stdin[0]) as {
      type: string;
      message: { role: string; content: Array<{ type: string; text: string }> };
    };
    expect(stdin.type).toBe("user");
    expect(stdin.message.role).toBe("user");
    expect(stdin.message.content[0]).toEqual({ type: "text", text: "hi" });
    expect(s.inFlight).toBe(true);
    expect(parseAll(r.outbound)).toEqual([
      { type: "response", command: "prompt", success: true, id: "1" },
    ]);
  });

  test("prompt while a turn is in-flight queues — does not write to stdin", () => {
    const s = createState();
    s.inFlight = true;
    const r = translateInbound('{"id":"2","type":"prompt","message":"second"}', s);
    expect(r.stdin).toEqual([]);
    expect(s.followUpQueue).toHaveLength(1);
  });

  test("steer enqueues even when idle? No — fires immediately if idle", () => {
    const s = createState();
    const r = translateInbound('{"id":"3","type":"steer","message":"tweak"}', s);
    expect(r.stdin).toHaveLength(1);
    expect(s.inFlight).toBe(true);
  });

  test("steer queues when in-flight (emulated, not true mid-turn)", () => {
    const s = createState();
    s.inFlight = true;
    translateInbound('{"id":"4","type":"steer","message":"tweak"}', s);
    expect(s.steerQueue).toHaveLength(1);
    expect(s.followUpQueue).toHaveLength(0);
  });

  test("abort emits control_request{interrupt} and clears queues", () => {
    const s = createState();
    s.inFlight = true;
    s.followUpQueue.push({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "queued" }] },
    });
    s.steerQueue.push({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "queued2" }] },
    });
    const r = translateInbound('{"id":"5","type":"abort"}', s);
    expect(r.stdin).toHaveLength(1);
    const sent = JSON.parse(r.stdin[0]) as {
      type: string;
      request_id?: string;
      request?: { subtype?: string };
    };
    expect(sent.type).toBe("control_request");
    expect(sent.request?.subtype).toBe("interrupt");
    expect(typeof sent.request_id).toBe("string");
    expect(s.followUpQueue).toEqual([]);
    expect(s.steerQueue).toEqual([]);
  });

  test("get_state synthesizes a response with isStreaming + sessionId", () => {
    const s = createState();
    s.inFlight = true;
    s.claudeSessionId = "abc-123";
    const r = translateInbound('{"id":"6","type":"get_state"}', s);
    expect(r.stdin).toEqual([]);
    expect(r.outbound).toHaveLength(1);
    const ev = JSON.parse(r.outbound[0]) as {
      type: string;
      command: string;
      success: boolean;
      data: { isStreaming: boolean; sessionId: string };
    };
    expect(ev.type).toBe("response");
    expect(ev.command).toBe("get_state");
    expect(ev.success).toBe(true);
    expect(ev.data.isStreaming).toBe(true);
    expect(ev.data.sessionId).toBe("abc-123");
  });

  test("get_messages returns whatever turn history we've buffered", () => {
    const s = createState();
    s.history.push({ role: "assistant", content: [{ type: "text", text: "prev" }] });
    const r = translateInbound('{"id":"7","type":"get_messages"}', s);
    const ev = JSON.parse(r.outbound[0]) as { data: { messages: Array<{ role: string }> } };
    expect(ev.data.messages).toHaveLength(1);
    expect(ev.data.messages[0].role).toBe("assistant");
  });

  test("unsupported commands return success:false response", () => {
    const s = createState();
    const r = translateInbound('{"id":"8","type":"set_model","model":"sonnet"}', s);
    const ev = JSON.parse(r.outbound[0]) as { success: boolean; error: string };
    expect(ev.success).toBe(false);
    expect(ev.error).toContain("set_model");
  });

  test("malformed JSON is dropped silently", () => {
    const s = createState();
    const r = translateInbound("not json", s);
    expect(r.stdin).toEqual([]);
    expect(r.outbound).toEqual([]);
  });

  test("prompt with images embeds claude image source blocks", () => {
    const s = createState();
    const r = translateInbound(
      JSON.stringify({
        id: "9",
        type: "prompt",
        message: "see attached",
        images: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
      }),
      s,
    );
    const stdin = JSON.parse(r.stdin[0]) as {
      message: { content: Array<{ type: string; source?: { media_type: string; data: string } }> };
    };
    expect(stdin.message.content).toHaveLength(2);
    expect(stdin.message.content[1].type).toBe("image");
    expect(stdin.message.content[1].source?.media_type).toBe("image/png");
    expect(stdin.message.content[1].source?.data).toBe("AAAA");
  });
});

describe("translator: outbound (claude stream-json → pi)", () => {
  test("first system{init} emits agent_start + turn_start; subsequent emits turn_start only", () => {
    const s = createState();
    const r1 = translateOutbound('{"type":"system","subtype":"init","session_id":"s1"}', s);
    expect(parseAll(r1.outbound).map((e) => (e as { type: string }).type)).toEqual([
      "agent_start",
      "turn_start",
    ]);
    expect(s.claudeSessionId).toBe("s1");
    const r2 = translateOutbound('{"type":"system","subtype":"init","session_id":"s1"}', s);
    expect(parseAll(r2.outbound).map((e) => (e as { type: string }).type)).toEqual(["turn_start"]);
  });

  test("rate_limit_event is dropped", () => {
    const s = createState();
    const r = translateOutbound('{"type":"rate_limit_event","rate_limit_info":{}}', s);
    expect(r.outbound).toEqual([]);
  });

  test("assistant text block becomes a single text_delta", () => {
    const s = createState();
    s.agentStartEmitted = true;
    const r = translateOutbound(
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "Hello" }] },
      }),
      s,
    );
    expect(r.outbound).toHaveLength(1);
    const ev = JSON.parse(r.outbound[0]) as {
      type: string;
      assistantMessageEvent: { type: string; delta: string; contentIndex: number };
    };
    expect(ev.type).toBe("message_update");
    expect(ev.assistantMessageEvent.type).toBe("text_delta");
    expect(ev.assistantMessageEvent.delta).toBe("Hello");
    expect(ev.assistantMessageEvent.contentIndex).toBe(0);
    expect(s.currentTurnBlocks).toEqual([{ type: "text", text: "Hello" }]);
  });

  test("assistant tool_use block becomes toolcall_start/end + tool_execution_start", () => {
    const s = createState();
    s.agentStartEmitted = true;
    const r = translateOutbound(
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", id: "tu_1", name: "Bash", input: { command: "ls" } }],
        },
      }),
      s,
    );
    const types = parseAll(r.outbound).map((e) => {
      const ev = e as {
        type: string;
        assistantMessageEvent?: { type: string };
        toolName?: string;
      };
      return ev.assistantMessageEvent?.type ?? ev.type;
    });
    expect(types).toEqual(["toolcall_start", "toolcall_end", "tool_execution_start"]);
    expect(s.toolNameByUseId.get("tu_1")).toBe("Bash");
    expect(s.currentTurnBlocks).toEqual([
      { type: "toolCall", id: "tu_1", name: "Bash", arguments: { command: "ls" } },
    ]);
  });

  test("user record with tool_result becomes tool_execution_end", () => {
    const s = createState();
    s.toolNameByUseId.set("tu_1", "Bash");
    const r = translateOutbound(
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "tu_1", content: "ls output", is_error: false },
          ],
        },
      }),
      s,
    );
    const ev = JSON.parse(r.outbound[0]) as {
      type: string;
      toolCallId: string;
      toolName: string;
      result: { content: Array<{ text: string }> };
      isError: boolean;
    };
    expect(ev.type).toBe("tool_execution_end");
    expect(ev.toolCallId).toBe("tu_1");
    expect(ev.toolName).toBe("Bash");
    expect(ev.result.content[0].text).toBe("ls output");
    expect(ev.isError).toBe(false);
  });

  test("result emits turn_end with assembled assistant message + agent_end, clears state", () => {
    const s = createState();
    s.currentTurnBlocks = [{ type: "text", text: "Done" }];
    s.inFlight = true;
    const r = translateOutbound('{"type":"result","subtype":"success","result":"Done"}', s);
    const events = parseAll(r.outbound) as Array<{
      type: string;
      message?: { role: string; content: unknown };
    }>;
    expect(events.map((e) => e.type)).toEqual(["turn_end", "agent_end"]);
    expect(events[0].message?.role).toBe("assistant");
    expect(s.inFlight).toBe(false);
    expect(s.currentTurnBlocks).toEqual([]);
    expect(s.history).toHaveLength(1);
  });

  test("result drains followUpQueue into stdin and re-arms inFlight", () => {
    const s = createState();
    s.followUpQueue.push({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "next" }] },
    });
    s.inFlight = true;
    const r = translateOutbound('{"type":"result","subtype":"success"}', s);
    expect(r.stdin).toHaveLength(1);
    const flushed = JSON.parse(r.stdin[0]) as {
      message: { content: Array<{ text: string }> };
    };
    expect(flushed.message.content[0].text).toBe("next");
    expect(s.inFlight).toBe(true);
    expect(s.followUpQueue).toEqual([]);
  });

  test("result drains steerQueue when followUpQueue is empty", () => {
    const s = createState();
    s.steerQueue.push({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "steered" }] },
    });
    s.inFlight = true;
    const r = translateOutbound('{"type":"result","subtype":"success"}', s);
    expect(r.stdin).toHaveLength(1);
    expect(s.steerQueue).toEqual([]);
    expect(s.inFlight).toBe(true);
  });

  test("control_request{can_use_tool} auto-allows back on stdin (defensive)", () => {
    const s = createState();
    const r = translateOutbound(
      JSON.stringify({
        type: "control_request",
        request_id: "r1",
        request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "ls" } },
      }),
      s,
    );
    expect(r.outbound).toEqual([]);
    expect(r.stdin).toHaveLength(1);
    const resp = JSON.parse(r.stdin[0]) as {
      type: string;
      response: { request_id: string; response: { behavior: string } };
    };
    expect(resp.type).toBe("control_response");
    expect(resp.response.request_id).toBe("r1");
    expect(resp.response.response.behavior).toBe("allow");
  });

  test("unknown record types are dropped silently", () => {
    const s = createState();
    expect(translateOutbound('{"type":"who_knows"}', s).outbound).toEqual([]);
    expect(translateOutbound("not json", s).outbound).toEqual([]);
  });
});

describe("translator: end-to-end turn flow", () => {
  test("prompt → init → assistant text → result → turn_end ⇒ followUpQueue drained", () => {
    const s = createState();
    // 1. user sends prompt while idle
    let r = translateInbound('{"id":"1","type":"prompt","message":"hi"}', s);
    expect(r.stdin).toHaveLength(1);
    expect(s.inFlight).toBe(true);

    // 2. user sends a follow_up while in-flight — queued
    r = translateInbound('{"id":"2","type":"prompt","message":"and another"}', s);
    expect(r.stdin).toHaveLength(0);
    expect(s.followUpQueue).toHaveLength(1);

    // 3. claude emits init then assistant then result
    r = translateOutbound('{"type":"system","subtype":"init","session_id":"abc"}', s);
    expect(r.outbound.length).toBeGreaterThan(0);
    r = translateOutbound(
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      }),
      s,
    );
    r = translateOutbound('{"type":"result","subtype":"success","result":"hello"}', s);
    // turn_end + agent_end → 2 outbound; queued follow_up → 1 stdin
    expect(r.stdin).toHaveLength(1);
    expect(r.outbound.map((l) => (JSON.parse(l) as { type: string }).type)).toEqual([
      "turn_end",
      "agent_end",
    ]);
    expect(s.inFlight).toBe(true);
    expect(s.followUpQueue).toEqual([]);
  });
});
