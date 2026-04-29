// Minimal pi RPC types — only the shapes the claude-code translator emits or
// consumes. Deliberately copied from apps/expo/src/lib/protocol/pi.ts (which is
// in a different package) so the adapter stays type-checked without a
// cross-package import. Keep this file in sync with the canonical version when
// adding new commands or events.

export type PiImage = { type: "image"; data: string; mimeType: string };

// ---------- inbound: pi commands the translator parses off the WS ----------

export type PiCommand = {
  type: string;
  id?: string;
  message?: string;
  images?: PiImage[];
  // Captured opaquely; specific fields by command type are read defensively.
  [k: string]: unknown;
};

// ---------- outbound: pi events the translator synthesizes ----------

export type AssistantStreamEvent = {
  type:
    | "start"
    | "text_start"
    | "text_delta"
    | "text_end"
    | "thinking_start"
    | "thinking_delta"
    | "thinking_end"
    | "toolcall_start"
    | "toolcall_delta"
    | "toolcall_end"
    | "done"
    | "error";
  contentIndex?: number;
  delta?: string;
  content?: string;
  thinking?: string;
  toolCall?: { id: string; name: string; arguments: unknown };
};

export type AssistantContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "toolCall"; id: string; name: string; arguments: unknown };

export type AssistantMessage = {
  role: "assistant";
  content: AssistantContentBlock[];
  model?: string;
};

export type ToolResultMessage = {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type AgentMessage = AssistantMessage | ToolResultMessage;

export type PiEvent =
  | { type: "response"; command: string; success: boolean; id?: string; error?: string; data?: unknown }
  | { type: "agent_start" }
  | { type: "agent_end"; messages?: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message?: AssistantMessage; toolResults?: ToolResultMessage[] }
  | { type: "message_update"; assistantMessageEvent: AssistantStreamEvent }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | {
      type: "tool_execution_end";
      toolCallId: string;
      toolName: string;
      result: { content: Array<{ type: "text"; text: string }> };
      isError?: boolean;
    };
