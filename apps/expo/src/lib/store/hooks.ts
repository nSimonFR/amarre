import { useSyncExternalStore } from 'react';

import { store, type State } from './store';
import { emptySlice, type AgentSnapshot, type RetryBanner, type SessionCrash, type SessionSlice, type StreamingState, type ToolExecState } from './types';
import type { AgentMessage, ExtensionUiRequestEvent } from '../protocol';
import type { ConnectionState } from '../ws/client';

// Stable shared empty slice for sessions that haven't received any events yet
// (or when currentSessionId is null). MUST be a singleton and MUST NOT be
// re-created per render — every hook below selects from this object, so a new
// reference here would re-render every consumer on every dispatch.
const EMPTY_SLICE: SessionSlice = emptySlice();

function activeSlice(s: State): SessionSlice {
  const id = s.currentSessionId;
  return (id && s.sessions[id]) || EMPTY_SLICE;
}

function useSlice<T>(select: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export function useConnection(): ConnectionState {
  return useSlice((s) => s.conn);
}

export function useAgent(): AgentSnapshot {
  return useSlice((s) => activeSlice(s).agent);
}

export function useIsStreaming(): boolean {
  return useSlice((s) => activeSlice(s).agent.isStreaming);
}

export function useMessages(): AgentMessage[] {
  return useSlice((s) => activeSlice(s).messages);
}

export function useStreamingAssistant(): StreamingState | null {
  return useSlice((s) => activeSlice(s).streaming);
}

export function useToolExecs(): Map<string, ToolExecState> {
  return useSlice((s) => activeSlice(s).toolExecs);
}

export function usePermissionRequests(): ExtensionUiRequestEvent[] {
  return useSlice((s) => activeSlice(s).permissionRequests);
}

export function useCurrentSessionId(): string | null {
  return useSlice((s) => s.currentSessionId);
}

export function useSessionCrashed(): SessionCrash | null {
  return useSlice((s) => activeSlice(s).sessionCrashed);
}

export function useRetry(): RetryBanner | null {
  return useSlice((s) => s.retry);
}
