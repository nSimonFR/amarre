// Layer 3 — amarre envelope. v2.0.0: still a transparent proxy except for
// server-originated messages: amarre.session_event (crash notice) and the
// Remote Claude triplet (amarre.remote_inbound / _attached / _failed). See
// docs/PROTOCOL.md §5 and §14.

export type AmarreVersion = '2.0.0';
export const AMARRE_VERSION: AmarreVersion = '2.0.0';

export type AmarreSessionEvent = {
  type: 'amarre.session_event';
  event: 'crashed' | string;
  exitCode: number | null;
  signal: string | null;
};

export function isAmarreSessionEvent(value: unknown): value is AmarreSessionEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'amarre.session_event'
  );
}

// PROTOCOL §14 — user prompt typed on claude.ai/code, forwarded to the SDK
// by the broker. The amarre client renders it as a user-side message so the
// transcript stays in sync with the remote surface.
export type AmarreRemoteInboundEvent = {
  type: 'amarre.remote_inbound';
  ccrSessionId?: string | null;
  source: 'claude.ai' | string;
  content: string;
};

export function isAmarreRemoteInboundEvent(value: unknown): value is AmarreRemoteInboundEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'amarre.remote_inbound' &&
    typeof (value as { content?: unknown }).content === 'string'
  );
}
