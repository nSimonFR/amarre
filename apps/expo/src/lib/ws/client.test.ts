// Regression: extension_ui_response MUST echo the original
// extension_ui_request.id verbatim. Auto-generating an id silently breaks
// permission correlation in pi RPC mode — the agent's ctx.ui.confirm()
// promise never resolves, the tool_call handler hangs, the session looks
// stuck. See feat/multi-session-fix.

import { describe, expect, test } from 'bun:test';
import { AmarreClient } from './client';

const noop = { onEvent: () => {}, onConnectionChange: () => {} };

describe('AmarreClient.send id handling', () => {
  test('preserves caller-supplied id (extension_ui_response correlation)', () => {
    const client = new AmarreClient(noop);
    const returned = client.send({
      type: 'extension_ui_response',
      id: 'pi-uuid-xyz',
      confirmed: true,
    });
    expect(returned).toBe('pi-uuid-xyz');
  });

  test('auto-generates id when caller does not supply one', () => {
    const client = new AmarreClient(noop);
    const returned = client.send({ type: 'get_state' });
    expect(returned).toMatch(/^c\d+-/);
  });

  test('auto-generates when caller passes empty id', () => {
    const client = new AmarreClient(noop);
    const returned = client.send({
      type: 'extension_ui_response',
      id: '',
      confirmed: true,
    });
    expect(returned).toMatch(/^c\d+-/);
  });
});
