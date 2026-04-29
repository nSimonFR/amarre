import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

import { httpBaseUrl, loadSettings, wsUrl } from './persistence/settings';
import type { PiCommand } from './protocol';
import { getSession } from './rest/sessions';
import { store } from './store';
import { AmarreClient, type AgentKind } from './ws/client';

type Ctx = {
  client: AmarreClient;
  send: (cmd: PiCommand) => string;
  connectToSession: (sessionId: string) => Promise<void>;
  disconnect: () => void;
};

const AmarreContext = createContext<Ctx | null>(null);

export function AmarreProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<AmarreClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new AmarreClient({
      onEvent: (event) => store.dispatchEvent(event as Parameters<typeof store.dispatchEvent>[0]),
      onConnectionChange: (conn) => store.setConn(conn),
    });
  }

  const value = useMemo<Ctx>(() => {
    const client = clientRef.current!;
    return {
      client,
      send: (cmd) => client.send(cmd),
      disconnect: () => {
        client.disconnect();
        store.setCurrentSession(null);
      },
      connectToSession: (sessionId) => connectToSession(client, sessionId),
    };
  }, []);

  return <AmarreContext.Provider value={value}>{children}</AmarreContext.Provider>;
}

export function useAmarre(): Ctx {
  const ctx = useContext(AmarreContext);
  if (!ctx) throw new Error('useAmarre must be used inside <AmarreProvider>');
  return ctx;
}

function isAgentKind(value: string): value is AgentKind {
  return value === 'pi' || value === 'claude-code';
}

async function connectToSession(client: AmarreClient, sessionId: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings) throw new Error('no server settings — visit /connect first');
  const target = wsUrl(settings, sessionId);

  // Idempotent: socket already open against the same URL means cursor & wire
  // are pointing at this session. Skip everything (the cursor flip too — it's
  // already correct, and reissuing it is a no-op anyway).
  const conn = store.getState().conn;
  if (conn.status === 'open' && conn.url === target) {
    return;
  }

  // Resolve adapter kind via REST before opening the socket — the bootstrap
  // sequence in client.connect differs by adapter (pi sends get_state/get_messages,
  // claude-code waits for server-emitted system/init).
  let agent: AgentKind;
  try {
    const info = await getSession(httpBaseUrl(settings), sessionId);
    if (!isAgentKind(info.agent)) {
      throw new Error(`unsupported agent kind: ${info.agent}`);
    }
    agent = info.agent;
  } catch (err) {
    // Surface as a clean closed conn so callers awaiting open/close resolve.
    const lastError = err instanceof Error ? err.message : String(err);
    store.setConn({ status: 'closed', url: target, retryCount: 0, lastError });
    throw err instanceof Error ? err : new Error(lastError);
  }

  // Order matters (per reducer.ts INVARIANT):
  //   (a) flip cursor BEFORE connect so events route to the new slice
  //   (b) explicit disconnect drops handlers + pendingSend cleanly. client.connect()
  //       already calls detachAndCloseCurrent() and clears pendingSend on URL change,
  //       but the explicit call makes the protocol intent unambiguous and is cheap.
  //   (c) open the new socket with the adapter kind so bootstrap dispatches correctly
  store.setCurrentSession(sessionId);
  client.disconnect();
  return new Promise<void>((resolve, reject) => {
    const stop = store.subscribe(() => {
      const c = store.getState().conn;
      if (c.url !== target) return;
      if (c.status === 'open') {
        stop();
        resolve();
      } else if (c.status === 'closed') {
        stop();
        reject(new Error(c.lastError ?? 'connection closed before opening'));
      }
    });
    client.connect(target, agent);
  });
}
