import type {
  AgentMessage,
  AssistantMessage,
  ExtensionUiRequestEvent,
  ToolPartialResult,
} from '../protocol';
import type { ConnectionState } from '../ws/client';

export type ToolExecState = {
  toolCallId: string;
  toolName: string;
  args: unknown;
  status: 'running' | 'done' | 'error';
  partial?: ToolPartialResult;
  result?: ToolPartialResult;
  isError?: boolean;
};

export type StreamingState = {
  text: string;
  thinking: string;
  // Buffer raw toolcall arg deltas keyed by contentIndex; finalised toolCalls promoted to assistant on toolcall_end.
  toolCallBuffers: Map<number, { name: string; argsBuf: string }>;
  toolCalls: Array<{ id: string; name: string; arguments: unknown }>;
};

export type AgentSnapshot = {
  isStreaming: boolean;
  model?: string;
  sessionId?: string;
  sessionName?: string;
};

export type RetryBanner = {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage?: string;
};

export type SessionCrash = {
  sessionId: string;
  exitCode: number | null;
  signal: string | null;
};

export type State = {
  conn: ConnectionState;
  agent: AgentSnapshot;
  messages: AgentMessage[];
  streaming: StreamingState | null;
  toolExecs: Map<string, ToolExecState>;
  permissionRequests: ExtensionUiRequestEvent[];
  retry: RetryBanner | null;
  currentSessionId: string | null;
  sessionCrashed: SessionCrash | null;
};

export type StreamingFinalAssistant = AssistantMessage;
