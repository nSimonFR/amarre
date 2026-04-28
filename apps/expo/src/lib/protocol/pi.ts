// pi-coding-agent RPC schema (Layer 4).
// Source of truth: docs/rpc.md inside the @mariozechner/pi-coding-agent npm package.
// We model only the subset the Expo app uses.

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type StreamingBehavior = 'steer' | 'followUp';

export type PiImage = { type: 'image'; data: string; mimeType: string };

// ---------- commands (client → server) ----------

export type PromptCmd = { type: 'prompt'; message: string; images?: PiImage[]; streamingBehavior?: StreamingBehavior };
export type SteerCmd = { type: 'steer'; message: string; images?: PiImage[] };
export type FollowUpCmd = { type: 'follow_up'; message: string; images?: PiImage[] };
export type AbortCmd = { type: 'abort' };
export type GetStateCmd = { type: 'get_state' };
export type GetMessagesCmd = { type: 'get_messages' };
export type NewSessionCmd = { type: 'new_session'; parentSession?: string };
export type SwitchSessionCmd = { type: 'switch_session'; sessionPath: string };
export type ExtensionUiResponseCmd = {
  type: 'extension_ui_response';
  id: string;
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
};

export type PiCommand =
  | PromptCmd
  | SteerCmd
  | FollowUpCmd
  | AbortCmd
  | GetStateCmd
  | GetMessagesCmd
  | NewSessionCmd
  | SwitchSessionCmd
  | ExtensionUiResponseCmd;

// Wire shape: command + auto-generated correlation id added by AmarreClient.
export type WireCommand = PiCommand & { id: string };

// ---------- streaming deltas (inside message_update.assistantMessageEvent) ----------

export type AssistantStreamEventType =
  | 'start'
  | 'text_start'
  | 'text_delta'
  | 'text_end'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'toolcall_start'
  | 'toolcall_delta'
  | 'toolcall_end'
  | 'done'
  | 'error';

export type AssistantStreamEvent = {
  type: AssistantStreamEventType;
  contentIndex?: number;
  delta?: string;
  content?: string;
  thinking?: string;
  toolCall?: { id: string; name: string; arguments: unknown };
  reason?: 'stop' | 'length' | 'toolUse' | 'aborted' | 'error';
  partial?: unknown;
};

// ---------- agent message shapes (subset; we keep extras as unknown) ----------

export type ToolCall = { id: string; name: string; arguments: unknown };

export type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; toolCall: ToolCall };

export type UserMessage = {
  role: 'user';
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
};

export type AssistantMessage = {
  role: 'assistant';
  content: AssistantContentBlock[];
  model?: string;
};

export type ToolResultMessage = {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
  isError?: boolean;
};

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage;

// ---------- events (server → client) ----------

export type ResponseEvent<TData = unknown> = {
  type: 'response';
  command: string;
  success: boolean;
  id?: string;
  error?: string;
  data?: TData;
};

export type GetStateData = {
  model?: string;
  thinkingLevel?: ThinkingLevel;
  isStreaming: boolean;
  isCompacting?: boolean;
  steeringMode?: 'all' | 'one-at-a-time';
  followUpMode?: 'all' | 'one-at-a-time';
  sessionFile?: string;
  sessionId?: string;
  sessionName?: string;
  autoCompactionEnabled?: boolean;
  messageCount?: number;
  pendingMessageCount?: number;
};

export type GetMessagesData = { messages: AgentMessage[] };

export type AgentStartEvent = { type: 'agent_start' };
export type AgentEndEvent = { type: 'agent_end'; messages?: AgentMessage[] };
export type TurnStartEvent = { type: 'turn_start' };
export type TurnEndEvent = {
  type: 'turn_end';
  message?: AssistantMessage;
  toolResults?: ToolResultMessage[];
};

export type MessageUpdateEvent = {
  type: 'message_update';
  message?: unknown;
  assistantMessageEvent: AssistantStreamEvent;
};

export type ToolPartialResult = {
  content: Array<{ type: 'text'; text: string }>;
  details?: unknown;
};

export type ToolExecutionStartEvent = {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: unknown;
};

export type ToolExecutionUpdateEvent = {
  type: 'tool_execution_update';
  toolCallId: string;
  toolName: string;
  args: unknown;
  partialResult: ToolPartialResult;
};

export type ToolExecutionEndEvent = {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result: ToolPartialResult;
  isError?: boolean;
};

export type ExtensionUiRequestMethod =
  | 'select'
  | 'confirm'
  | 'input'
  | 'editor'
  | 'notify'
  | 'setStatus'
  | 'setWidget'
  | 'setTitle'
  | 'set_editor_text';

export type ExtensionUiRequestEvent = {
  type: 'extension_ui_request';
  id: string;
  method: ExtensionUiRequestMethod;
  title?: string;
  message?: string;
  options?: string[];
  placeholder?: string;
  prefill?: string;
  timeout?: number;
  notifyType?: 'info' | 'warning' | 'error';
  statusKey?: string;
  statusText?: string;
  widgetKey?: string;
  widgetLines?: string[];
  widgetPlacement?: 'aboveEditor' | 'belowEditor';
};

export type QueueUpdateEvent = {
  type: 'queue_update';
  steering?: string[];
  followUp?: string[];
};

export type CompactionStartEvent = {
  type: 'compaction_start';
  reason: 'manual' | 'threshold' | 'overflow';
};

export type CompactionEndEvent = {
  type: 'compaction_end';
  reason: 'manual' | 'threshold' | 'overflow';
  result?: unknown;
  aborted?: boolean;
  willRetry?: boolean;
  errorMessage?: string;
};

export type AutoRetryStartEvent = {
  type: 'auto_retry_start';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage?: string;
};

export type AutoRetryEndEvent = {
  type: 'auto_retry_end';
  success: boolean;
  attempt: number;
  finalError?: string;
};

export type ExtensionErrorEvent = {
  type: 'extension_error';
  extensionPath?: string;
  event?: string;
  error: string;
};

export type PiEvent =
  | ResponseEvent
  | AgentStartEvent
  | AgentEndEvent
  | TurnStartEvent
  | TurnEndEvent
  | MessageUpdateEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | ExtensionUiRequestEvent
  | QueueUpdateEvent
  | CompactionStartEvent
  | CompactionEndEvent
  | AutoRetryStartEvent
  | AutoRetryEndEvent
  | ExtensionErrorEvent;

// Loose runtime shape for unknown / future event types — protocol §12 says clients
// MUST be tolerant of unknown `type` values.
export type UnknownEvent = { type: string; [k: string]: unknown };

export function isPiEvent(value: unknown): value is PiEvent | UnknownEvent {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
