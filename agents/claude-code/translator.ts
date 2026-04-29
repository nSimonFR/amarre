// Bidirectional translator between pi RPC (WS Layer 4 spoken by the expo
// client) and Claude Code stream-json (`claude -p --input-format stream-json
// --output-format stream-json`). The adapter glues these to the real claude
// child's stdin/stdout; this module is pure data-in/data-out so it's
// trivially unit-testable.
//
// Asymmetries documented in agents/claude-code/README.md §"Translation
// limits" (steer ≈ follow_up after result, no mid-turn streaming, synthetic
// get_state, unsupported commands return an error response).

import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  ToolResultMessage,
} from "./pi-types.ts";

// ---------- state ----------

export interface TranslatorState {
  // outbound bookkeeping
  agentStartEmitted: boolean;
  claudeSessionId?: string;
  contentIndex: number;
  currentTurnBlocks: AssistantContentBlock[];
  currentTurnToolResults: ToolResultMessage[];
  toolNameByUseId: Map<string, string>;
  history: AgentMessage[];
  // inbound bookkeeping
  inFlight: boolean;
  followUpQueue: ClaudeUserRecord[];
  steerQueue: ClaudeUserRecord[];
  controlReqSeq: number;
}

export function createState(): TranslatorState {
  return {
    agentStartEmitted: false,
    contentIndex: 0,
    currentTurnBlocks: [],
    currentTurnToolResults: [],
    toolNameByUseId: new Map(),
    history: [],
    inFlight: false,
    followUpQueue: [],
    steerQueue: [],
    controlReqSeq: 0,
  };
}

// ---------- shapes (Claude Code stream-json) ----------

interface ClaudeContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface ClaudeUserRecord {
  type: "user";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string } | { type: "image"; source: unknown }>;
  };
}

interface ClaudeAssistantRecord {
  type: "assistant";
  message?: { role?: "assistant"; model?: string; content?: ClaudeContentBlock[] };
}

interface ClaudeUserToolResultRecord {
  type: "user";
  message?: { role?: "user"; content?: ClaudeContentBlock[] };
}

interface ClaudeSystemInitRecord {
  type: "system";
  subtype: "init";
  session_id?: string;
}

interface ClaudeResultRecord {
  type: "result";
  subtype?: "success" | "error";
  is_error?: boolean;
  result?: string;
  session_id?: string;
}

interface ClaudeControlRequestRecord {
  type: "control_request";
  request_id?: string;
  request?: {
    subtype?: string;
    tool_name?: string;
    input?: unknown;
    [k: string]: unknown;
  };
}

// ---------- public translator API ----------

export interface TranslateResult {
  /** lines to write to the real claude's stdin */
  stdin: string[];
  /** lines to push out to the WS client(s) */
  outbound: string[];
}

const EMPTY: TranslateResult = Object.freeze({ stdin: [], outbound: [] }) as TranslateResult;

export function translateInbound(rawLine: string, s: TranslatorState): TranslateResult {
  const line = rawLine.trim();
  if (!line) return EMPTY;
  let cmd: { type?: unknown; id?: unknown; [k: string]: unknown };
  try {
    cmd = JSON.parse(line);
  } catch {
    // Don't crash on bad input; return an error response if id is parseable
    return EMPTY;
  }
  if (!cmd || typeof cmd.type !== "string") return EMPTY;
  const id = typeof cmd.id === "string" ? cmd.id : undefined;
  const t = cmd.type;

  switch (t) {
    case "prompt":
    case "follow_up": {
      const userRecord = piToClaudeUserRecord(cmd);
      const out: string[] = [];
      if (id !== undefined) {
        out.push(JSON.stringify({ type: "response", command: t, success: true, id }));
      }
      if (s.inFlight) {
        s.followUpQueue.push(userRecord);
        return { stdin: [], outbound: out };
      }
      s.inFlight = true;
      return { stdin: [JSON.stringify(userRecord)], outbound: out };
    }
    case "steer": {
      // Claude Code has no mid-turn steering. Closest we can do is enqueue
      // the message to fire as a follow-up after the in-flight turn ends.
      const userRecord = piToClaudeUserRecord(cmd);
      const out: string[] = [];
      if (id !== undefined) {
        out.push(JSON.stringify({ type: "response", command: t, success: true, id }));
      }
      if (s.inFlight) {
        s.steerQueue.push(userRecord);
        return { stdin: [], outbound: out };
      }
      s.inFlight = true;
      return { stdin: [JSON.stringify(userRecord)], outbound: out };
    }
    case "abort": {
      s.followUpQueue = [];
      s.steerQueue = [];
      const reqId = nextControlId(s);
      const interrupt = JSON.stringify({
        type: "control_request",
        request_id: reqId,
        request: { subtype: "interrupt" },
      });
      const out: string[] = [];
      if (id !== undefined) {
        out.push(JSON.stringify({ type: "response", command: "abort", success: true, id }));
      }
      return { stdin: [interrupt], outbound: out };
    }
    case "get_state": {
      const data = {
        isStreaming: s.inFlight,
        sessionId: s.claudeSessionId,
        messageCount: s.history.length,
        pendingMessageCount: s.followUpQueue.length + s.steerQueue.length,
      };
      return {
        stdin: [],
        outbound: [
          JSON.stringify({ type: "response", command: "get_state", success: true, id, data }),
        ],
      };
    }
    case "get_messages": {
      return {
        stdin: [],
        outbound: [
          JSON.stringify({
            type: "response",
            command: "get_messages",
            success: true,
            id,
            data: { messages: s.history },
          }),
        ],
      };
    }
    case "extension_ui_response": {
      // Permission gating is deferred to v2 of this adapter — claude is
      // launched with --dangerously-skip-permissions, so no extension_ui_request
      // ever fires from us. Acknowledge to the client and drop.
      return id !== undefined
        ? {
            stdin: [],
            outbound: [
              JSON.stringify({ type: "response", command: t, success: true, id }),
            ],
          }
        : EMPTY;
    }
    default:
      // new_session, switch_session, fork, clone, set_model, cycle_model,
      // set_thinking_level, compact, bash, set_auto_compaction, … none of
      // these have a meaningful Claude Code mapping in v1. Surface a clear
      // error to the client so the UI can disable affordances.
      return {
        stdin: [],
        outbound: [
          JSON.stringify({
            type: "response",
            command: t,
            success: false,
            id,
            error: `claude-code adapter v1 does not support '${t}'`,
          }),
        ],
      };
  }
}

export function translateOutbound(rawLine: string, s: TranslatorState): TranslateResult {
  const line = rawLine.trim();
  if (!line) return EMPTY;
  let rec: { type?: unknown; [k: string]: unknown };
  try {
    rec = JSON.parse(line);
  } catch {
    return EMPTY;
  }
  if (!rec || typeof rec.type !== "string") return EMPTY;
  switch (rec.type) {
    case "system":
      return handleSystem(rec as ClaudeSystemInitRecord, s);
    case "rate_limit_event":
      return EMPTY;
    case "assistant":
      return handleAssistant(rec as ClaudeAssistantRecord, s);
    case "user":
      return handleUserToolResult(rec as ClaudeUserToolResultRecord, s);
    case "result":
      return handleResult(rec as ClaudeResultRecord, s);
    case "control_request":
      return handleControlRequest(rec as ClaudeControlRequestRecord, s);
    case "control_response":
      // ack of our interrupt etc. — nothing for the client
      return EMPTY;
    default:
      // Tolerant to unknown record types; pi clients ignore unknown event types.
      return EMPTY;
  }
}

// ---------- inbound helpers ----------

function piToClaudeUserRecord(cmd: { message?: unknown; images?: unknown }): ClaudeUserRecord {
  const text = typeof cmd.message === "string" ? cmd.message : "";
  const blocks: ClaudeUserRecord["message"]["content"] = [{ type: "text", text }];
  if (Array.isArray(cmd.images)) {
    for (const img of cmd.images) {
      if (
        img &&
        typeof img === "object" &&
        typeof (img as { data?: unknown }).data === "string" &&
        typeof (img as { mimeType?: unknown }).mimeType === "string"
      ) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: (img as { mimeType: string }).mimeType,
            data: (img as { data: string }).data,
          },
        });
      }
    }
  }
  return { type: "user", message: { role: "user", content: blocks } };
}

function nextControlId(s: TranslatorState): string {
  s.controlReqSeq += 1;
  return `amarre_${s.controlReqSeq}`;
}

// ---------- outbound helpers ----------

function handleSystem(rec: ClaudeSystemInitRecord, s: TranslatorState): TranslateResult {
  if (rec.subtype !== "init") return EMPTY;
  if (typeof rec.session_id === "string") s.claudeSessionId = rec.session_id;
  const out: string[] = [];
  if (!s.agentStartEmitted) {
    s.agentStartEmitted = true;
    out.push(JSON.stringify({ type: "agent_start" }));
  }
  out.push(JSON.stringify({ type: "turn_start" }));
  s.contentIndex = 0;
  s.currentTurnBlocks = [];
  s.currentTurnToolResults = [];
  return { stdin: [], outbound: out };
}

function handleAssistant(rec: ClaudeAssistantRecord, s: TranslatorState): TranslateResult {
  const blocks = rec.message?.content ?? [];
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      out.push(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", contentIndex: s.contentIndex, delta: block.text },
        }),
      );
      s.currentTurnBlocks.push({ type: "text", text: block.text });
      s.contentIndex += 1;
    } else if (block.type === "thinking" && typeof block.thinking === "string") {
      out.push(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "thinking_delta",
            contentIndex: s.contentIndex,
            delta: block.thinking,
          },
        }),
      );
      s.contentIndex += 1;
    } else if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
      const toolCall = { id: block.id, name: block.name, arguments: block.input };
      out.push(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_start",
            contentIndex: s.contentIndex,
          },
        }),
      );
      out.push(
        JSON.stringify({
          type: "message_update",
          assistantMessageEvent: {
            type: "toolcall_end",
            contentIndex: s.contentIndex,
            toolCall,
          },
        }),
      );
      out.push(
        JSON.stringify({
          type: "tool_execution_start",
          toolCallId: block.id,
          toolName: block.name,
          args: block.input,
        }),
      );
      s.toolNameByUseId.set(block.id, block.name);
      s.currentTurnBlocks.push({ type: "toolCall", id: block.id, name: block.name, arguments: block.input });
      s.contentIndex += 1;
    }
  }
  return { stdin: [], outbound: out };
}

function handleUserToolResult(
  rec: ClaudeUserToolResultRecord,
  s: TranslatorState,
): TranslateResult {
  const blocks = rec.message?.content ?? [];
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") continue;
    const toolCallId = block.tool_use_id;
    const toolName = s.toolNameByUseId.get(toolCallId) ?? "unknown";
    const content = normalizeToolResultContent(block.content);
    const isError = !!block.is_error;
    out.push(
      JSON.stringify({
        type: "tool_execution_end",
        toolCallId,
        toolName,
        result: { content },
        isError,
      }),
    );
    s.currentTurnToolResults.push({
      role: "toolResult",
      toolCallId,
      toolName,
      content,
      isError,
    });
  }
  return { stdin: [], outbound: out };
}

function normalizeToolResultContent(raw: unknown): Array<{ type: "text"; text: string }> {
  if (typeof raw === "string") return [{ type: "text", text: raw }];
  if (Array.isArray(raw)) {
    const out: Array<{ type: "text"; text: string }> = [];
    for (const item of raw) {
      if (item && typeof item === "object") {
        const t = (item as { type?: unknown }).type;
        const txt = (item as { text?: unknown }).text;
        if (t === "text" && typeof txt === "string") out.push({ type: "text", text: txt });
      }
    }
    return out.length > 0 ? out : [{ type: "text", text: JSON.stringify(raw) }];
  }
  return [{ type: "text", text: raw === undefined ? "" : JSON.stringify(raw) }];
}

function handleResult(_rec: ClaudeResultRecord, s: TranslatorState): TranslateResult {
  const out: string[] = [];
  const message: AssistantMessage | undefined =
    s.currentTurnBlocks.length > 0
      ? { role: "assistant", content: s.currentTurnBlocks.slice() }
      : undefined;
  const toolResults = s.currentTurnToolResults.slice();
  out.push(JSON.stringify({ type: "turn_end", message, toolResults }));
  out.push(JSON.stringify({ type: "agent_end" }));

  if (message) s.history.push(message);
  for (const tr of toolResults) s.history.push(tr);
  s.currentTurnBlocks = [];
  s.currentTurnToolResults = [];
  s.contentIndex = 0;
  s.inFlight = false;

  // Drain queued follow-ups / steers, follow_up first (more recent intent).
  const stdin: string[] = [];
  const next = s.followUpQueue.shift() ?? s.steerQueue.shift();
  if (next) {
    s.inFlight = true;
    stdin.push(JSON.stringify(next));
  }
  return { stdin, outbound: out };
}

function handleControlRequest(
  rec: ClaudeControlRequestRecord,
  _s: TranslatorState,
): TranslateResult {
  // Claude only initiates control_request when it wants permission for a tool
  // call (subtype:"can_use_tool"). We launched it with
  // --dangerously-skip-permissions, so this should not fire — but be defensive.
  if (rec.request?.subtype === "can_use_tool" && typeof rec.request_id === "string") {
    return {
      stdin: [
        JSON.stringify({
          type: "control_response",
          response: {
            request_id: rec.request_id,
            subtype: "success",
            response: {
              behavior: "allow",
              updated_input: rec.request.input,
            },
          },
        }),
      ],
      outbound: [],
    };
  }
  return EMPTY;
}
