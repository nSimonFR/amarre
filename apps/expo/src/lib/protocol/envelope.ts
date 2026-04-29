// Layer 3 — amarre envelope. v2.0.0: still a transparent proxy except for one
// server-originated message: amarre.session_event. See docs/PROTOCOL.md §5.

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
