import { createContext, type ReactNode } from 'react';

import type { SchemeOverride } from './types';

export const ThemeOverrideContext = createContext<SchemeOverride>('auto');

export function ThemeProvider({
  override = 'auto',
  children,
}: {
  override?: SchemeOverride;
  children: ReactNode;
}) {
  return (
    <ThemeOverrideContext.Provider value={override}>{children}</ThemeOverrideContext.Provider>
  );
}
