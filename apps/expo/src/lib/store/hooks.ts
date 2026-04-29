import { useSyncExternalStore } from 'react';

import { store, type State } from './store';
import type { AgentSnapshot, SessionCrash, StreamingState, ToolExecState } from './types';
import type { AgentMessage, ExtensionUiRequestEvent } from '../protocol';
import type { ConnectionState } from '../ws/client';

function useSlice<T>(select: (s: State) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}

export function useConnection(): ConnectionState {
  return useSlice((s) => s.conn);
}

export function useAgent(): AgentSnapshot {
  return useSlice((s) => s.agent);
}

export function useIsStreaming(): boolean {
  return useSlice((s) => s.agent.isStreaming);
}

export function useMessages(): AgentMessage[] {
  return useSlice((s) => s.messages);
}

export function useStreamingAssistant(): StreamingState | null {
  return useSlice((s) => s.streaming);
}

export function useToolExecs(): Map<string, ToolExecState> {
  return useSlice((s) => s.toolExecs);
}

export function usePermissionRequests(): ExtensionUiRequestEvent[] {
  return useSlice((s) => s.permissionRequests);
}

export function useCurrentSessionId(): string | null {
  return useSlice((s) => s.currentSessionId);
}

export function useSessionCrashed(): SessionCrash | null {
  return useSlice((s) => s.sessionCrashed);
}
