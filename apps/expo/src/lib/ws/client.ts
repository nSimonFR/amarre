// AmarreClient — single WebSocket connection to an amarre server.
// Reconnect with exponential backoff (1s → cap 30s) per docs/PROTOCOL.md §3.3.
// Auto-bootstraps state on (re)connect via get_state + get_messages.

import { isPiEvent, type PiCommand, type WireCommand } from '../protocol';
import { parseJsonl } from './jsonl';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type ConnectionState = {
  status: ConnectionStatus;
  url?: string;
  retryCount: number;
  lastError?: string;
};

export type ClientListeners = {
  onEvent: (event: unknown) => void;
  onConnectionChange: (state: ConnectionState) => void;
};

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_CAP_MS = 30_000;

export class AmarreClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = { status: 'idle', retryCount: 0 };
  private userClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cmdSeq = 0;

  constructor(private readonly listeners: ClientListeners) {}

  connect(url: string): void {
    this.userClosed = false;
    this.clearReconnectTimer();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setState({ status: 'connecting', url, retryCount: this.state.retryCount, lastError: undefined });
    this.openSocket(url);
  }

  disconnect(): void {
    this.userClosed = true;
    this.clearReconnectTimer();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.setState({ status: 'closed', url: this.state.url, retryCount: 0 });
  }

  send(cmd: PiCommand): string {
    const id = this.nextId();
    const wire: WireCommand = { ...cmd, id };
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(wire) + '\n');
    }
    return id;
  }

  getState(): ConnectionState {
    return this.state;
  }

  // ---------- internals ----------

  private nextId(): string {
    this.cmdSeq = (this.cmdSeq + 1) >>> 0;
    return `c${this.cmdSeq}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private setState(next: Partial<ConnectionState> & { status: ConnectionStatus }): void {
    this.state = { ...this.state, ...next };
    this.listeners.onConnectionChange(this.state);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private openSocket(url: string): void {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      this.handleClose(url, errorMessage(err));
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.setState({ status: 'open', url, retryCount: 0, lastError: undefined });
      // Bootstrap per protocol §3.3 — refresh state + replay messages.
      this.send({ type: 'get_state' });
      this.send({ type: 'get_messages' });
    };

    ws.onmessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (typeof data !== 'string') return; // binary frames reserved (§3.2)
      for (const record of parseJsonl(data)) {
        if (isPiEvent(record)) this.listeners.onEvent(record);
      }
    };

    ws.onerror = (ev) => {
      // Most RN/web WebSocket implementations don't expose a useful error here;
      // record the message if any and let onclose drive the reconnect.
      const message = (ev as { message?: string }).message;
      if (message) this.state = { ...this.state, lastError: message };
    };

    ws.onclose = (ev) => {
      this.ws = null;
      const reason = (ev as { reason?: string }).reason || `closed (code ${(ev as { code?: number }).code ?? '?'})`;
      this.handleClose(url, reason);
    };
  }

  private handleClose(url: string, error: string | undefined): void {
    if (this.userClosed) {
      this.setState({ status: 'closed', url, retryCount: 0, lastError: error });
      return;
    }
    const next = this.state.retryCount + 1;
    const delay = Math.min(BACKOFF_INITIAL_MS * 2 ** (next - 1), BACKOFF_CAP_MS);
    this.setState({ status: 'reconnecting', url, retryCount: next, lastError: error });
    this.reconnectTimer = setTimeout(() => {
      if (this.userClosed) return;
      this.openSocket(url);
    }, delay);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
