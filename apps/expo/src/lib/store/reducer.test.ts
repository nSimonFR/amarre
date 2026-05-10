// Pure reducer tests for the per-session slice refactor — verifies switch
// preserves slices, lazy creation, removeSession semantics, top-level retry,
// and idempotent setCurrentSession.

import { describe, expect, test } from 'bun:test';
import type { AssistantMessage, AutoRetryEndEvent, AutoRetryStartEvent } from '../protocol';
import {
  clearSessionCrashed,
  dismissPermission,
  initialState,
  pushUserMessage,
  reduce,
  removeSession,
  setConn,
  setCurrentSession,
} from './reducer';

// Avoid `any`: tag unused vars to keep the linter happy when destructured but not referenced.
void clearSessionCrashed;
void dismissPermission;
void setConn;

const helloAssistant: AssistantMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'hello from A' }],
};

describe('reducer — per-session slice', () => {
  test('switch A→B→A preserves A messages', () => {
    let s = initialState();
    s = setCurrentSession(s, 'A');
    s = reduce(s, { type: 'agent_start' });
    s = reduce(s, { type: 'turn_end', message: helloAssistant });

    expect(s.sessions['A']).toBeDefined();
    expect(s.sessions['A']!.messages).toHaveLength(1);
    expect(s.sessions['A']!.messages[0]).toEqual(helloAssistant);

    const aMessagesRef = s.sessions['A']!.messages;

    s = setCurrentSession(s, 'B');
    expect(s.currentSessionId).toBe('B');
    expect(s.sessions['A']).toBeDefined();
    // A's messages array is untouched by the switch.
    expect(s.sessions['A']!.messages).toBe(aMessagesRef);
    // B is lazily created — it doesn't exist until an event arrives for it.
    expect(s.sessions['B']).toBeUndefined();

    s = setCurrentSession(s, 'A');
    expect(s.currentSessionId).toBe('A');
    expect(s.sessions['A']!.messages).toHaveLength(1);
    expect(s.sessions['A']!.messages[0]).toEqual(helloAssistant);
  });

  test('lazy slice creation on first event for an unknown id', () => {
    let s = initialState();
    s = setCurrentSession(s, 'NEW');
    expect(s.sessions).toEqual({});

    s = reduce(s, { type: 'agent_start' });

    const slice = s.sessions['NEW'];
    expect(slice).toBeDefined();
    expect(slice!.agent.isStreaming).toBe(true);
    expect(slice!.streaming).not.toBeNull();
    expect(slice!.streaming).toEqual({
      text: '',
      thinking: '',
      toolCallBuffers: new Map(),
      toolCalls: [],
    });
    // emptySlice() shape with the agent + streaming mutations applied.
    expect(slice!.messages).toEqual([]);
    expect(slice!.toolExecs).toBeInstanceOf(Map);
    expect(slice!.toolExecs.size).toBe(0);
    expect(slice!.permissionRequests).toEqual([]);
    expect(slice!.sessionCrashed).toBeNull();
  });

  describe('removeSession', () => {
    test('clears cursor when removing the current session', () => {
      let s = initialState();
      s = setCurrentSession(s, 'A');
      s = reduce(s, { type: 'agent_start' });
      expect(s.sessions['A']).toBeDefined();
      expect(s.currentSessionId).toBe('A');

      s = removeSession(s, 'A');
      expect(s.sessions['A']).toBeUndefined();
      expect(s.currentSessionId).toBeNull();
    });

    test('keeps cursor when removing a non-current session', () => {
      let s = initialState();
      // Materialise A.
      s = setCurrentSession(s, 'A');
      s = reduce(s, { type: 'agent_start' });
      // Materialise B and leave it as the current cursor.
      s = setCurrentSession(s, 'B');
      s = reduce(s, { type: 'agent_start' });
      expect(s.sessions['A']).toBeDefined();
      expect(s.sessions['B']).toBeDefined();
      expect(s.currentSessionId).toBe('B');

      s = removeSession(s, 'A');
      expect(s.sessions['A']).toBeUndefined();
      expect(s.sessions['B']).toBeDefined();
      expect(s.currentSessionId).toBe('B');
    });

    test('no-op for unknown id returns same reference', () => {
      const s = initialState();
      const next = removeSession(s, 'XYZ');
      expect(next).toBe(s);
    });
  });

  describe('auto_retry top-level', () => {
    test('survives session switch and clears on auto_retry_end', () => {
      let s = initialState();
      s = setCurrentSession(s, 'A');

      const startEv: AutoRetryStartEvent = {
        type: 'auto_retry_start',
        attempt: 1,
        maxAttempts: 3,
        delayMs: 1000,
      };
      s = reduce(s, startEv);
      expect(s.retry).not.toBeNull();
      expect(s.retry!.attempt).toBe(1);
      expect(s.retry!.maxAttempts).toBe(3);
      expect(s.retry!.delayMs).toBe(1000);

      // The banner must survive switching sessions — this used to be a bug
      // when retry lived inside the per-session slice.
      s = setCurrentSession(s, 'B');
      expect(s.currentSessionId).toBe('B');
      expect(s.retry).not.toBeNull();
      expect(s.retry!.attempt).toBe(1);

      const endEv: AutoRetryEndEvent = {
        type: 'auto_retry_end',
        success: true,
        attempt: 1,
      };
      s = reduce(s, endEv);
      expect(s.retry).toBeNull();
    });
  });

  test('setCurrentSession returns the same reference when id unchanged', () => {
    let s = initialState();
    s = setCurrentSession(s, 'A');
    const same = setCurrentSession(s, 'A');
    expect(same).toBe(s);
  });

  test('pushUserMessage writes to active slice and survives switch', () => {
    let s = initialState();
    s = setCurrentSession(s, 'A');
    s = pushUserMessage(s, 'hi');
    expect(s.sessions['A']!.messages).toHaveLength(1);
    expect(s.sessions['A']!.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    });

    s = setCurrentSession(s, 'B');
    s = setCurrentSession(s, 'A');
    expect(s.sessions['A']!.messages).toHaveLength(1);
    expect(s.sessions['A']!.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'hi' }],
    });
  });

  test('amarre.remote_inbound appends a user message to the current slice', () => {
    let s = initialState();
    s = setCurrentSession(s, 'A');
    s = reduce(s, {
      type: 'amarre.remote_inbound',
      ccrSessionId: 'cse_test',
      source: 'claude.ai',
      content: 'hi from the web',
    } as unknown as Parameters<typeof reduce>[1]);

    expect(s.sessions['A']!.messages).toHaveLength(1);
    expect(s.sessions['A']!.messages[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'hi from the web' }],
    });
  });

  test('amarre.remote_inbound with empty content is a no-op', () => {
    let s = initialState();
    s = setCurrentSession(s, 'A');
    const before = s;
    s = reduce(s, {
      type: 'amarre.remote_inbound',
      source: 'claude.ai',
      content: '',
    } as unknown as Parameters<typeof reduce>[1]);
    expect(s).toBe(before);
  });
});
