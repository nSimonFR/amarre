// Ports tokens-v2.css:6-70 — exact values, do not invent new ones.

export const brand = {
  accent: '#7c5cff',
  accentStrong: '#6845ff',
  accentSoft: 'rgba(124, 92, 255, 0.12)',
  accentFg: '#ffffff',
  ok: '#00b977',
  warn: '#f0a93a',
  err: '#ef5d5d',
  run: '#7c5cff',
} as const;

export type Surface = {
  bg: string;
  bgElev: string;
  bgSunk: string;
  ink: string;
  ink2: string;
  ink3: string;
  line: string;
  lineStrong: string;
  codeBg: string;
};

export const lightSurface: Surface = {
  bg: '#f6f5f1',
  bgElev: '#ffffff',
  bgSunk: '#ecebe6',
  ink: '#1a1a1f',
  ink2: '#4a4a52',
  ink3: '#8a8a93',
  line: 'rgba(20, 20, 25, 0.08)',
  lineStrong: 'rgba(20, 20, 25, 0.14)',
  codeBg: 'rgba(20, 20, 25, 0.04)',
};

export const darkSurface: Surface = {
  bg: '#0c0c0e',
  bgElev: '#17171a',
  bgSunk: '#08080a',
  ink: '#f4f3ee',
  ink2: '#b3b2ac',
  ink3: '#6f6e6a',
  line: 'rgba(255, 255, 255, 0.07)',
  lineStrong: 'rgba(255, 255, 255, 0.13)',
  codeBg: 'rgba(255, 255, 255, 0.05)',
};
