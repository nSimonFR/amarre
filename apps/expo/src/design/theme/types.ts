import type { brand, Surface } from '../tokens/colors';
import type { Shadows } from '../tokens/shadows';

export type Scheme = 'light' | 'dark';

export type ResolvedTheme = typeof brand &
  Surface & {
    scheme: Scheme;
    shadows: Shadows;
  };

export type SchemeOverride = Scheme | 'auto';
