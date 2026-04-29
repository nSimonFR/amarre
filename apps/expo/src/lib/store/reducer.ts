// Pure (state, event) → state reducer for amarre wire events.
// Events arrive in the order documented in pi RPC docs; we mutate in patches via Object.assign,
// returning a fresh top-level State for useSyncExternalStore.

import type {
  AgentMessage,
  AssistantContentBlock,
  AssistantMessage,
  ExtensionUiRequestEvent,
  GetMessagesData,
  GetStateData,
  PiEvent,
  ResponseEvent,
  ToolResultMessage,
  UnknownEvent,
} from '../protocol';
import { isAmarreSessionEvent, type AmarreSessionEvent } from '../protocol/envelope';
import type { State, StreamingState } from './types';

export function initialState(): State {
  return {
    conn: { status: 'idle', retryCount: 0 },
    agent: { isStreaming: false },
    messages: [],
    streaming: null,
    toolExecs: new Map(),
    permissionRequests: [],
    retry: null,
    currentSessionId: null,
    sessionCrashed: null,
  };
}

function freshStreaming(): StreamingState {
  return { text: '', thinking: '', toolCallBuffers: new Map(), toolCalls: [] };
}

function isInteractiveUiMethod(method: string): boolean {
  return method === 'confirm' || method === 'select' || method === 'input' || method === 'editor';
}

export function reduce(state: State, event: PiEvent | UnknownEvent): State {
  if (isAmarreSessionEvent(event)) {
    return reduceAmarreSessionEvent(state, event);
  }
  switch (event.type) {
    case 'response':
      return reduceResponse(state, event as ResponseEvent);

    case 'agent_start':
      return { ...state, agent: { ...state.agent, isStreaming: true }, streaming: freshStreaming() };

    case 'agent_end':
      return { ...state, agent: { ...state.agent, isStreaming: false } };

    case 'turn_start':
      // Make sure streaming buffer exists for this turn.
      return state.streaming ? state : { ...state, streaming: freshStreaming() };

    case 'turn_end':
      return reduceTurnEnd(state, event as { type: 'turn_end'; message?: AssistantMessage; toolResults?: ToolResultMessage[] });

    case 'message_update':
      return reduceMessageUpdate(state, event as { type: 'message_update'; assistantMessageEvent: { type: string; delta?: string; toolCall?: { id: string; name: string; arguments: unknown }; contentIndex?: number } });

    case 'tool_execution_start':
      return reduceToolStart(state, event as { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown });

    case 'tool_execution_update':
      return reduceToolUpdate(state, event as { type: 'tool_execution_update'; toolCallId: string; partialResult: { content: { type: 'text'; text: string }[]; details?: unknown } });

    case 'tool_execution_end':
      return reduceToolEnd(state, event as { type: 'tool_execution_end'; toolCallId: string; result: { content: { type: 'text'; text: string }[]; details?: unknown }; isError?: boolean });

    case 'extension_ui_request':
      return reduceExtensionUiRequest(state, event as ExtensionUiRequestEvent);

    case 'auto_retry_start':
      return {
        ...state,
        retry: {
          attempt: (event as { attempt: number }).attempt,
          maxAttempts: (event as { maxAttempts: number }).maxAttempts,
          delayMs: (event as { delayMs: number }).delayMs,
          errorMessage: (event as { errorMessage?: string }).errorMessage,
        },
      };

    case 'auto_retry_end':
      return { ...state, retry: null };

    default:
      // Tolerant of unknown types per PROTOCOL.md §12.
      return state;
  }
}

function reduceResponse(state: State, event: ResponseEvent): State {
  if (!event.success) return state;
  if (event.command === 'get_state' && event.data) {
    const data = event.data as GetStateData;
    return {
      ...state,
      agent: {
        isStreaming: !!data.isStreaming,
        model: data.model,
        sessionId: data.sessionId,
        sessionName: data.sessionName,
      },
    };
  }
  if (event.command === 'get_messages' && event.data) {
    const data = event.data as GetMessagesData;
    const messages = data.messages || [];
    // Rehydrate toolExecs from any prior toolResult messages so historical tool
    // outputs render after reconnect.
    const toolExecs = new Map(state.toolExecs);
    for (const m of messages) {
      if (m.role === 'toolResult') {
        toolExecs.set(m.toolCallId, {
          toolCallId: m.toolCallId,
          toolName: m.toolName,
          args: undefined,
          status: m.isError ? 'error' : 'done',
          result: { content: m.content, details: m.details },
          isError: m.isError,
        });
      }
    }
    return { ...state, messages, toolExecs };
  }
  return state;
}

function reduceMessageUpdate(
  state: State,
  event: { type: 'message_update'; assistantMessageEvent: { type: string; delta?: string; toolCall?: { id: string; name: string; arguments: unknown }; contentIndex?: number } },
): State {
  const ev = event.assistantMessageEvent;
  const streaming = state.streaming ?? freshStreaming();

  switch (ev.type) {
    case 'text_delta': {
      if (!ev.delta) return state;
      return { ...state, streaming: { ...streaming, text: streaming.text + ev.delta } };
    }
    case 'thinking_delta': {
      if (!ev.delta) return state;
      return { ...state, streaming: { ...streaming, thinking: streaming.thinking + ev.delta } };
    }
    case 'toolcall_start': {
      const idx = ev.contentIndex ?? streaming.toolCallBuffers.size;
      const buffers = new Map(streaming.toolCallBuffers);
      buffers.set(idx, { name: '', argsBuf: '' });
      return { ...state, streaming: { ...streaming, toolCallBuffers: buffers } };
    }
    case 'toolcall_delta': {
      if (!ev.delta) return state;
      const idx = ev.contentIndex ?? 0;
      const buffers = new Map(streaming.toolCallBuffers);
      const cur = buffers.get(idx) ?? { name: '', argsBuf: '' };
      buffers.set(idx, { ...cur, argsBuf: cur.argsBuf + ev.delta });
      return { ...state, streaming: { ...streaming, toolCallBuffers: buffers } };
    }
    case 'toolcall_end': {
      if (!ev.toolCall) return state;
      const idx = ev.contentIndex ?? 0;
      const buffers = new Map(streaming.toolCallBuffers);
      buffers.delete(idx);
      return {
        ...state,
        streaming: {
          ...streaming,
          toolCallBuffers: buffers,
          toolCalls: [...streaming.toolCalls, ev.toolCall],
        },
      };
    }
    default:
      return state;
  }
}

function reduceToolStart(
  state: State,
  event: { toolCallId: string; toolName: string; args: unknown },
): State {
  const next = new Map(state.toolExecs);
  next.set(event.toolCallId, {
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    args: event.args,
    status: 'running',
  });
  return { ...state, toolExecs: next };
}

function reduceToolUpdate(
  state: State,
  event: { toolCallId: string; partialResult: { content: { type: 'text'; text: string }[]; details?: unknown } },
): State {
  const cur = state.toolExecs.get(event.toolCallId);
  if (!cur) return state;
  const next = new Map(state.toolExecs);
  next.set(event.toolCallId, { ...cur, partial: event.partialResult });
  return { ...state, toolExecs: next };
}

function reduceToolEnd(
  state: State,
  event: { toolCallId: string; result: { content: { type: 'text'; text: string }[]; details?: unknown }; isError?: boolean },
): State {
  const cur = state.toolExecs.get(event.toolCallId);
  const next = new Map(state.toolExecs);
  next.set(event.toolCallId, {
    toolCallId: event.toolCallId,
    toolName: cur?.toolName ?? '',
    args: cur?.args,
    status: event.isError ? 'error' : 'done',
    result: event.result,
    isError: event.isError,
    partial: cur?.partial,
  });
  return { ...state, toolExecs: next };
}

function reduceExtensionUiRequest(state: State, event: ExtensionUiRequestEvent): State {
  // Fire-and-forget methods don't go in the queue.
  if (!isInteractiveUiMethod(event.method)) return state;
  return { ...state, permissionRequests: [...state.permissionRequests, event] };
}

function reduceTurnEnd(
  state: State,
  event: { message?: AssistantMessage; toolResults?: ToolResultMessage[] },
): State {
  const appended: AgentMessage[] = [];

  if (event.message) {
    appended.push(event.message);
  } else if (state.streaming) {
    // Construct an assistant message from the streamed content.
    const blocks: AssistantContentBlock[] = [];
    if (state.streaming.text) blocks.push({ type: 'text', text: state.streaming.text });
    if (state.streaming.thinking) blocks.push({ type: 'thinking', thinking: state.streaming.thinking });
    for (const tc of state.streaming.toolCalls) {
      blocks.push({ type: 'toolCall', id: tc.id, name: tc.name, arguments: tc.arguments });
    }
    if (blocks.length) appended.push({ role: 'assistant', content: blocks });
  }

  if (event.toolResults && event.toolResults.length) {
    for (const tr of event.toolResults) appended.push(tr);
  }

  return {
    ...state,
    messages: appended.length ? [...state.messages, ...appended] : state.messages,
    streaming: null,
  };
}

// Public helper used by AmarreClient when the user calls connect / disconnect, before any pi event arrives.
export function pushUserMessage(state: State, text: string): State {
  const msg: AgentMessage = { role: 'user', content: [{ type: 'text', text }] };
  return { ...state, messages: [...state.messages, msg] };
}

// Drop a permission request from the queue (called optimistically on Allow/Deny).
export function dismissPermission(state: State, id: string): State {
  return { ...state, permissionRequests: state.permissionRequests.filter((r) => r.id !== id) };
}

// Connection-state events are pushed by AmarreClient directly into the store.
export function setConn(state: State, conn: State['conn']): State {
  return { ...state, conn };
}

// Switching the active session resets every chat-level slice; conn is
// owned by the WS client lifecycle and stays untouched.
export function setCurrentSession(state: State, sessionId: string | null): State {
  if (state.currentSessionId === sessionId) return state;
  return {
    ...state,
    currentSessionId: sessionId,
    messages: [],
    streaming: null,
    toolExecs: new Map(),
    permissionRequests: [],
    retry: null,
    agent: { isStreaming: false },
    sessionCrashed: null,
  };
}

export function clearSessionCrashed(state: State): State {
  if (!state.sessionCrashed) return state;
  return { ...state, sessionCrashed: null };
}

function reduceAmarreSessionEvent(state: State, event: AmarreSessionEvent): State {
  if (event.event !== 'crashed') return state;
  return {
    ...state,
    sessionCrashed: {
      sessionId: state.currentSessionId ?? '',
      exitCode: event.exitCode ?? null,
      signal: event.signal ?? null,
    },
    agent: { ...state.agent, isStreaming: false },
  };
}
