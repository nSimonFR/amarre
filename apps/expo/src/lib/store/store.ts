// Singleton observable store. Subscribe + getSnapshot are the React-18 API
// expected by useSyncExternalStore.

import {
  clearSessionCrashed,
  dismissPermission,
  initialState,
  pushUserMessage,
  reduce,
  setConn,
  setCurrentSession,
} from './reducer';
import type { State } from './types';
import type { PiEvent, UnknownEvent } from '../protocol';
import type { ConnectionState } from '../ws/client';

type Listener = () => void;

class Store {
  private state: State = initialState();
  private listeners = new Set<Listener>();

  getState = (): State => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  dispatchEvent(event: PiEvent | UnknownEvent): void {
    this.set(reduce(this.state, event));
  }

  setConn(conn: ConnectionState): void {
    this.set(setConn(this.state, conn));
  }

  pushUserMessage(text: string): void {
    this.set(pushUserMessage(this.state, text));
  }

  dismissPermission(id: string): void {
    this.set(dismissPermission(this.state, id));
  }

  setCurrentSession(sessionId: string | null): void {
    this.set(setCurrentSession(this.state, sessionId));
  }

  clearSessionCrashed(): void {
    this.set(clearSessionCrashed(this.state));
  }

  reset(): void {
    this.set(initialState());
  }

  private set(next: State): void {
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }
}

export const store = new Store();
export type { State };
