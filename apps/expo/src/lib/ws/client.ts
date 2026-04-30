// AmarreClient — single WebSocket connection to an amarre server.
// Reconnect with exponential backoff (1s → cap 30s) per docs/PROTOCOL.md §3.3.
// Auto-bootstraps state on (re)connect via get_state + get_messages — but only
// when the server adapter is `pi` (those are pi-RPC commands, not understood by
// other adapters such as claude-code).

import { isPiEvent, type PiCommand, type WireCommand } from '../protocol';
import { isAmarreSessionEvent } from '../protocol/envelope';
import { parseJsonl } from './jsonl';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export type AgentKind = 'pi' | 'claude-code';

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
const PENDING_SEND_CAP = 16;

export class AmarreClient {
  private ws: WebSocket | null = null;
  private state: ConnectionState = { status: 'idle', retryCount: 0 };
  private userClosed = false;
  // Set when an `amarre.session_event` arrives — the upcoming `onclose` is the
  // tail end of a session crash, not a transient disconnect, so we suppress
  // backoff retry until the caller explicitly reconnects.
  private terminated = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private cmdSeq = 0;
  private agent: AgentKind = 'pi';
  // Frames queued while the socket is mid-(re)connect. Flushed FIFO on `onopen`.
  // Cleared on `disconnect()` or on a `connect()` to a different URL — a frame
  // intended for session A must NOT leak onto session B's socket.
  private pendingSend: WireCommand[] = [];

  constructor(private readonly listeners: ClientListeners) {}

  connect(url: string, agent: AgentKind): void {
    this.userClosed = false;
    this.terminated = false;
    this.clearReconnectTimer();
    // Different URL => different session: drop any frames queued for the old one.
    if (this.state.url !== url) {
      this.pendingSend = [];
    }
    this.agent = agent;
    this.detachAndCloseCurrent();
    this.setState({ status: 'connecting', url, retryCount: 0, lastError: undefined });
    this.openSocket(url);
  }

  disconnect(): void {
    this.userClosed = true;
    this.clearReconnectTimer();
    this.pendingSend = [];
    this.detachAndCloseCurrent();
    this.setState({ status: 'closed', url: this.state.url, retryCount: 0 });
  }

  send(cmd: PiCommand): string {
    // Preserve a caller-supplied `id` when present — `extension_ui_response`
    // MUST echo the original `extension_ui_request.id` for the server to
    // correlate the answer with the pending permission. Auto-generate only
    // when the caller didn't set one.
    const provided = (cmd as { id?: unknown }).id;
    const id = typeof provided === 'string' && provided.length > 0 ? provided : this.nextId();
    const wire: WireCommand = { ...cmd, id };
    if (this.ws && this.ws.readyState === 1 /* OPEN */) {
      this.ws.send(JSON.stringify(wire) + '\n');
    } else {
      // Socket not yet OPEN (initial connect or reconnect window). Queue and
      // flush on `onopen`. Cap is small — drop oldest if exceeded.
      if (this.pendingSend.length >= PENDING_SEND_CAP) {
        this.pendingSend.shift();
      }
      this.pendingSend.push(wire);
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

  // Detach handlers from the current socket *before* closing it, then null out
  // `this.ws`. Without this, the soon-to-fire async `onclose` of the dying
  // socket would (a) overwrite `this.ws` (which by then points at the freshly
  // opened replacement) and (b) reschedule a reconnect to the *old* URL.
  private detachAndCloseCurrent(): void {
    if (!this.ws) return;
    const dying = this.ws;
    dying.onopen = null;
    dying.onclose = null;
    dying.onmessage = null;
    dying.onerror = null;
    try { dying.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  private flushPending(ws: WebSocket): void {
    if (this.pendingSend.length === 0) return;
    const queued = this.pendingSend;
    this.pendingSend = [];
    for (let i = 0; i < queued.length; i++) {
      // Defence in depth: if a reconnect happened between iterations, bail
      // and re-queue the unsent tail at the head of pendingSend.
      if (this.ws !== ws || ws.readyState !== 1) {
        this.pendingSend = queued.slice(i).concat(this.pendingSend);
        return;
      }
      ws.send(JSON.stringify(queued[i]) + '\n');
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

    // Each handler captures `ws` in its closure and early-returns if the live
    // `this.ws` no longer points at the same socket. Belt-and-braces with
    // `detachAndCloseCurrent()`: stale events from a dying socket cannot
    // mutate state on the live one.
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.setState({ status: 'open', url, retryCount: 0, lastError: undefined });
      // Bootstrap per protocol §3.3 — but get_state / get_messages are
      // pi-RPC (§6.2). The claude-code adapter does not understand them; its
      // server-emitted `system/init` event populates state on connect.
      if (this.agent === 'pi') {
        this.send({ type: 'get_state' });
        this.send({ type: 'get_messages' });
      }
      this.flushPending(ws);
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      const data = ev.data;
      if (typeof data !== 'string') return; // binary frames reserved (§3.2)
      for (const record of parseJsonl(data)) {
        if (isAmarreSessionEvent(record)) {
          this.terminated = true;
          this.listeners.onEvent(record);
          continue;
        }
        if (isPiEvent(record)) this.listeners.onEvent(record);
      }
    };

    ws.onerror = (ev) => {
      if (this.ws !== ws) return;
      // Most RN/web WebSocket implementations don't expose a useful error here;
      // record the message if any and let onclose drive the reconnect.
      const message = (ev as { message?: string }).message;
      if (message) this.state = { ...this.state, lastError: message };
    };

    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const reason = (ev as { reason?: string }).reason || `closed (code ${(ev as { code?: number }).code ?? '?'})`;
      this.handleClose(url, reason);
    };
  }

  private handleClose(url: string, error: string | undefined): void {
    if (this.userClosed || this.terminated) {
      this.setState({ status: 'closed', url, retryCount: 0, lastError: error });
      return;
    }
    const next = this.state.retryCount + 1;
    const delay = Math.min(BACKOFF_INITIAL_MS * 2 ** (next - 1), BACKOFF_CAP_MS);
    this.setState({ status: 'reconnecting', url, retryCount: next, lastError: error });
    this.reconnectTimer = setTimeout(() => {
      if (this.userClosed || this.terminated) return;
      this.openSocket(url);
    }, delay);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
