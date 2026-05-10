// Pure (state, event) → state reducer for amarre wire events.
// Events arrive in the order documented in pi RPC docs; we mutate in patches via Object.assign,
// returning a fresh top-level State for useSyncExternalStore.
//
// INVARIANT: Wire events do not carry `session_id` — they're routed by which WebSocket
// received them. The store assumes `currentSessionId` is set BEFORE `client.connect(url)`
// is called, so events for the new session land in the new slice. Violating this invariant
// routes events to the previous slice. Enforced by `AmarreProvider.connectToSession`.

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
import {
  isAmarreRemoteInboundEvent,
  isAmarreSessionEvent,
  type AmarreRemoteInboundEvent,
  type AmarreSessionEvent,
} from '../protocol/envelope';
import { emptySlice, type SessionSlice, type State, type StreamingState } from './types';

export function initialState(): State {
  return {
    conn: { status: 'idle', retryCount: 0 },
    retry: null,
    currentSessionId: null,
    sessions: {},
  };
}

function freshStreaming(): StreamingState {
  return { text: '', thinking: '', toolCallBuffers: new Map(), toolCalls: [] };
}

// Apply `mut` to the slice for `id`, lazily creating an empty slice if needed.
// If `id` is null, drop the event silently — defensive: events should never arrive
// without a current session, but we don't want to crash if they do.
function withSlice(state: State, id: string | null, mut: (s: SessionSlice) => SessionSlice): State {
  if (!id) return state;
  const cur = state.sessions[id] ?? emptySlice();
  return { ...state, sessions: { ...state.sessions, [id]: mut(cur) } };
}

function isInteractiveUiMethod(method: string): boolean {
  return method === 'confirm' || method === 'select' || method === 'input' || method === 'editor';
}

export function reduce(state: State, event: PiEvent | UnknownEvent): State {
  if (isAmarreSessionEvent(event)) {
    return reduceAmarreSessionEvent(state, event);
  }
  if (isAmarreRemoteInboundEvent(event)) {
    return reduceAmarreRemoteInbound(state, event);
  }
  switch (event.type) {
    case 'response':
      return reduceResponse(state, event as ResponseEvent);

    case 'agent_start':
      return withSlice(state, state.currentSessionId, (prev) => ({
        ...prev,
        agent: { ...prev.agent, isStreaming: true },
        streaming: freshStreaming(),
      }));

    case 'agent_end':
      return withSlice(state, state.currentSessionId, (prev) => ({
        ...prev,
        agent: { ...prev.agent, isStreaming: false },
      }));

    case 'turn_start':
      // Make sure streaming buffer exists for this turn.
      return withSlice(state, state.currentSessionId, (prev) =>
        prev.streaming ? prev : { ...prev, streaming: freshStreaming() },
      );

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
    return withSlice(state, state.currentSessionId, (prev) => ({
      ...prev,
      agent: {
        isStreaming: !!data.isStreaming,
        model: data.model,
        sessionId: data.sessionId,
        sessionName: data.sessionName,
      },
    }));
  }
  if (event.command === 'get_messages' && event.data) {
    const data = event.data as GetMessagesData;
    const messages = data.messages || [];
    return withSlice(state, state.currentSessionId, (prev) => {
      // Rehydrate toolExecs from any prior toolResult messages so historical tool
      // outputs render after reconnect.
      const toolExecs = new Map(prev.toolExecs);
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
      return { ...prev, messages, toolExecs };
    });
  }
  return state;
}

function reduceMessageUpdate(
  state: State,
  event: { type: 'message_update'; assistantMessageEvent: { type: string; delta?: string; toolCall?: { id: string; name: string; arguments: unknown }; contentIndex?: number } },
): State {
  const ev = event.assistantMessageEvent;
  return withSlice(state, state.currentSessionId, (prev) => {
    const streaming = prev.streaming ?? freshStreaming();

    switch (ev.type) {
      case 'text_delta': {
        if (!ev.delta) return prev;
        return { ...prev, streaming: { ...streaming, text: streaming.text + ev.delta } };
      }
      case 'thinking_delta': {
        if (!ev.delta) return prev;
        return { ...prev, streaming: { ...streaming, thinking: streaming.thinking + ev.delta } };
      }
      case 'toolcall_start': {
        const idx = ev.contentIndex ?? streaming.toolCallBuffers.size;
        const buffers = new Map(streaming.toolCallBuffers);
        buffers.set(idx, { name: '', argsBuf: '' });
        return { ...prev, streaming: { ...streaming, toolCallBuffers: buffers } };
      }
      case 'toolcall_delta': {
        if (!ev.delta) return prev;
        const idx = ev.contentIndex ?? 0;
        const buffers = new Map(streaming.toolCallBuffers);
        const cur = buffers.get(idx) ?? { name: '', argsBuf: '' };
        buffers.set(idx, { ...cur, argsBuf: cur.argsBuf + ev.delta });
        return { ...prev, streaming: { ...streaming, toolCallBuffers: buffers } };
      }
      case 'toolcall_end': {
        if (!ev.toolCall) return prev;
        const idx = ev.contentIndex ?? 0;
        const buffers = new Map(streaming.toolCallBuffers);
        buffers.delete(idx);
        return {
          ...prev,
          streaming: {
            ...streaming,
            toolCallBuffers: buffers,
            toolCalls: [...streaming.toolCalls, ev.toolCall],
          },
        };
      }
      default:
        return prev;
    }
  });
}

function reduceToolStart(
  state: State,
  event: { toolCallId: string; toolName: string; args: unknown },
): State {
  return withSlice(state, state.currentSessionId, (prev) => {
    const next = new Map(prev.toolExecs);
    next.set(event.toolCallId, {
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: event.args,
      status: 'running',
    });
    return { ...prev, toolExecs: next };
  });
}

function reduceToolUpdate(
  state: State,
  event: { toolCallId: string; partialResult: { content: { type: 'text'; text: string }[]; details?: unknown } },
): State {
  return withSlice(state, state.currentSessionId, (prev) => {
    const cur = prev.toolExecs.get(event.toolCallId);
    if (!cur) return prev;
    const next = new Map(prev.toolExecs);
    next.set(event.toolCallId, { ...cur, partial: event.partialResult });
    return { ...prev, toolExecs: next };
  });
}

function reduceToolEnd(
  state: State,
  event: { toolCallId: string; result: { content: { type: 'text'; text: string }[]; details?: unknown }; isError?: boolean },
): State {
  return withSlice(state, state.currentSessionId, (prev) => {
    const cur = prev.toolExecs.get(event.toolCallId);
    const next = new Map(prev.toolExecs);
    next.set(event.toolCallId, {
      toolCallId: event.toolCallId,
      toolName: cur?.toolName ?? '',
      args: cur?.args,
      status: event.isError ? 'error' : 'done',
      result: event.result,
      isError: event.isError,
      partial: cur?.partial,
    });
    return { ...prev, toolExecs: next };
  });
}

function reduceExtensionUiRequest(state: State, event: ExtensionUiRequestEvent): State {
  // Fire-and-forget methods don't go in the queue.
  if (!isInteractiveUiMethod(event.method)) return state;
  return withSlice(state, state.currentSessionId, (prev) => ({
    ...prev,
    permissionRequests: [...prev.permissionRequests, event],
  }));
}

function reduceTurnEnd(
  state: State,
  event: { message?: AssistantMessage; toolResults?: ToolResultMessage[] },
): State {
  return withSlice(state, state.currentSessionId, (prev) => {
    const appended: AgentMessage[] = [];

    if (event.message) {
      appended.push(event.message);
    } else if (prev.streaming) {
      // Construct an assistant message from the streamed content.
      const blocks: AssistantContentBlock[] = [];
      if (prev.streaming.text) blocks.push({ type: 'text', text: prev.streaming.text });
      if (prev.streaming.thinking) blocks.push({ type: 'thinking', thinking: prev.streaming.thinking });
      for (const tc of prev.streaming.toolCalls) {
        blocks.push({ type: 'toolCall', id: tc.id, name: tc.name, arguments: tc.arguments });
      }
      if (blocks.length) appended.push({ role: 'assistant', content: blocks });
    }

    if (event.toolResults && event.toolResults.length) {
      for (const tr of event.toolResults) appended.push(tr);
    }

    return {
      ...prev,
      messages: appended.length ? [...prev.messages, ...appended] : prev.messages,
      streaming: null,
    };
  });
}

// Public helper used by AmarreClient when the user calls connect / disconnect, before any pi event arrives.
export function pushUserMessage(state: State, text: string): State {
  const msg: AgentMessage = { role: 'user', content: [{ type: 'text', text }] };
  return withSlice(state, state.currentSessionId, (prev) => ({
    ...prev,
    messages: [...prev.messages, msg],
  }));
}

// Drop a permission request from the queue (called optimistically on Allow/Deny).
export function dismissPermission(state: State, id: string): State {
  return withSlice(state, state.currentSessionId, (prev) => ({
    ...prev,
    permissionRequests: prev.permissionRequests.filter((r) => r.id !== id),
  }));
}

// Connection-state events are pushed by AmarreClient directly into the store.
export function setConn(state: State, conn: State['conn']): State {
  return { ...state, conn };
}

// Switching the active session is a pure cursor flip — per-session slices keep
// their own state. The first event for an unknown session id will lazily
// create an empty slice via withSlice.
export function setCurrentSession(state: State, sessionId: string | null): State {
  if (state.currentSessionId === sessionId) return state;
  return { ...state, currentSessionId: sessionId };
}

// Drop a session's slice entirely. If the dropped session is the cursor target,
// the cursor goes to null so the UI falls back to the empty slice.
export function removeSession(state: State, id: string): State {
  if (!(id in state.sessions)) return state;
  const { [id]: _gone, ...rest } = state.sessions;
  const cur = state.currentSessionId === id ? null : state.currentSessionId;
  return { ...state, sessions: rest, currentSessionId: cur };
}

export function clearSessionCrashed(state: State): State {
  return withSlice(state, state.currentSessionId, (prev) =>
    prev.sessionCrashed ? { ...prev, sessionCrashed: null } : prev,
  );
}

function reduceAmarreSessionEvent(state: State, event: AmarreSessionEvent): State {
  if (event.event !== 'crashed') return state;
  return withSlice(state, state.currentSessionId, (prev) => ({
    ...prev,
    sessionCrashed: {
      sessionId: state.currentSessionId ?? '',
      exitCode: event.exitCode ?? null,
      signal: event.signal ?? null,
    },
    agent: { ...prev.agent, isStreaming: false },
  }));
}

// PROTOCOL §14 — prompt typed on claude.ai/code arriving via the bridge.
// Render it as if the local user had sent it, so the transcript shows both
// surfaces of the dual-control session.
function reduceAmarreRemoteInbound(state: State, event: AmarreRemoteInboundEvent): State {
  if (!event.content) return state;
  return pushUserMessage(state, event.content);
}
