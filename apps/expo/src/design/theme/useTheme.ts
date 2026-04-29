import { useContext } from 'react';
import { useColorScheme } from 'react-native';

import {
  brand,
  darkSurface,
  lightSurface,
} from '../tokens/colors';
import { darkShadows, lightShadows } from '../tokens/shadows';
import { ThemeOverrideContext } from './ThemeProvider';
import type { ResolvedTheme, Scheme } from './types';

export function useTheme(): ResolvedTheme {
  const override = useContext(ThemeOverrideContext);
  const system = useColorScheme();
  const scheme: Scheme = override !== 'auto' ? override : system === 'dark' ? 'dark' : 'light';

  if (scheme === 'dark') {
    return { ...brand, ...darkSurface, scheme, shadows: darkShadows };
  }
  return { ...brand, ...lightSurface, scheme, shadows: lightShadows };
}
