import { createContext, useContext, useMemo, useRef, type ReactNode } from 'react';

import { loadSettings, wsUrl } from './persistence/settings';
import type { PiCommand } from './protocol';
import { store } from './store';
import { AmarreClient } from './ws/client';

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

async function connectToSession(client: AmarreClient, sessionId: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings) throw new Error('no server settings — visit /connect first');
  store.setCurrentSession(sessionId);
  const target = wsUrl(settings, sessionId);
  return new Promise<void>((resolve, reject) => {
    const stop = store.subscribe(() => {
      const conn = store.getState().conn;
      if (conn.url !== target) return;
      if (conn.status === 'open') {
        stop();
        resolve();
      } else if (conn.status === 'closed') {
        stop();
        reject(new Error(conn.lastError ?? 'connection closed before opening'));
      }
    });
    client.connect(target);
  });
}
