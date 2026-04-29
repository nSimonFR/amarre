import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { loadSettings, settingsToUrl } from './persistence/settings';
import type { PiCommand } from './protocol';
import { store } from './store';
import { AmarreClient } from './ws/client';

type Ctx = {
  client: AmarreClient;
  send: (cmd: PiCommand) => string;
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
    return { client, send: (cmd) => client.send(cmd) };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = await loadSettings();
      if (cancelled) return;
      if (settings) {
        clientRef.current!.connect(settingsToUrl(settings));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <AmarreContext.Provider value={value}>{children}</AmarreContext.Provider>;
}

export function useAmarre(): Ctx {
  const ctx = useContext(AmarreContext);
  if (!ctx) throw new Error('useAmarre must be used inside <AmarreProvider>');
  return ctx;
}
