import { Easing } from 'react-native-reanimated';

// tokens-v2.css:24-28

export const motion = {
  fast: 160,
  med: 280,
  ease: Easing.bezier(0.32, 0.72, 0, 1),
  spring: Easing.bezier(0.34, 1.56, 0.64, 1),
} as const;

// Streaming timeline phase boundaries (ms within the 14000 ms loop).
// Mirrors screen-streaming.jsx:209-307.
export const streaming = {
  loopMs: 14000,
  statusEnter: 400,
  para1Start: 1000,
  para1End: 2800,
  toolReadStart: 3000,
  toolReadOk: 3300,
  toolGrepStart: 4400,
  toolGrepOk: 4700,
  para2Start: 5600,
  para2End: 7000,
  codeStart: 7000,
  codeEnd: 10500,
  codeLineCount: 8,
  doneStart: 10500,
  caretIdle: 12000,
} as const;
