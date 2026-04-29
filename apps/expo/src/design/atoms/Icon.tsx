import { type ReactNode } from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// atoms.jsx:127-159 — 24-variant monoline icon set, 1.6px stroke.

export type IconName =
  | 'plus'
  | 'search'
  | 'menu'
  | 'back'
  | 'more'
  | 'arrow-up'
  | 'mic'
  | 'send'
  | 'attach'
  | 'check'
  | 'x'
  | 'chevron'
  | 'down'
  | 'cloud'
  | 'branch'
  | 'edit'
  | 'terminal'
  | 'web'
  | 'file'
  | 'folder'
  | 'shield'
  | 'qr'
  | 'settings'
  | 'sparkle'
  | 'git'
  | 'arrow-right';

const STROKE = 1.6;

function paths(name: IconName, color: string): ReactNode {
  const s = { stroke: color, strokeWidth: STROKE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (name) {
    case 'plus':
      return <Path {...s} d="M12 5v14M5 12h14" />;
    case 'search':
      return (
        <>
          <Circle {...s} cx="11" cy="11" r="7" />
          <Path {...s} d="m20 20-3.5-3.5" />
        </>
      );
    case 'menu':
      return <Path {...s} d="M4 7h16M4 12h16M4 17h10" />;
    case 'back':
      return <Path {...s} d="m15 6-6 6 6 6" />;
    case 'more':
      return (
        <>
          <Circle {...s} cx="5" cy="12" r="1" />
          <Circle {...s} cx="12" cy="12" r="1" />
          <Circle {...s} cx="19" cy="12" r="1" />
        </>
      );
    case 'arrow-up':
      return <Path {...s} d="M12 19V5M5 12l7-7 7 7" />;
    case 'mic':
      return (
        <>
          <Rect {...s} x="9" y="3" width="6" height="12" rx="3" />
          <Path {...s} d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </>
      );
    case 'send':
      return <Path {...s} d="m5 12 14-7-7 14-2-5-5-2Z" />;
    case 'attach':
      return <Path {...s} d="m21 11-9 9a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8" />;
    case 'check':
      return <Path {...s} d="M5 13l4 4L19 7" />;
    case 'x':
      return <Path {...s} d="M6 6l12 12M18 6 6 18" />;
    case 'chevron':
      return <Path {...s} d="m9 6 6 6-6 6" />;
    case 'down':
      return <Path {...s} d="m6 9 6 6 6-6" />;
    case 'cloud':
      return <Path {...s} d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5-1A4 4 0 0 0 7 18Z" />;
    case 'branch':
      return (
        <>
          <Circle {...s} cx="6" cy="6" r="2" />
          <Circle {...s} cx="6" cy="18" r="2" />
          <Circle {...s} cx="18" cy="8" r="2" />
          <Path {...s} d="M6 8v8M6 14a8 8 0 0 0 8-8h2" />
        </>
      );
    case 'edit':
      return (
        <>
          <Path {...s} d="M4 20h4l11-11-4-4L4 16v4Z" />
          <Path {...s} d="m13 5 4 4" />
        </>
      );
    case 'terminal':
      return <Path {...s} d="m4 7 4 5-4 5M11 17h9" />;
    case 'web':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="9" />
          <Path {...s} d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </>
      );
    case 'file':
      return (
        <>
          <Path {...s} d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <Path {...s} d="M14 3v5h5" />
        </>
      );
    case 'folder':
      return <Path {...s} d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />;
    case 'shield':
      return <Path {...s} d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z" />;
    case 'qr':
      return (
        <>
          <Rect {...s} x="3" y="3" width="7" height="7" rx="1" />
          <Rect {...s} x="14" y="3" width="7" height="7" rx="1" />
          <Rect {...s} x="3" y="14" width="7" height="7" rx="1" />
          <Path {...s} d="M14 14h3v3M21 14v0M14 21h0M17 17v4M21 17v4" />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle {...s} cx="12" cy="12" r="3" />
          <Path
            {...s}
            d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
          />
        </>
      );
    case 'sparkle':
      return (
        <Path
          {...s}
          d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"
        />
      );
    case 'git':
      return (
        <>
          <Circle {...s} cx="6" cy="6" r="2" />
          <Circle {...s} cx="6" cy="18" r="2" />
          <Circle {...s} cx="18" cy="12" r="2" />
          <Path {...s} d="M6 8v8M8 18a6 6 0 0 1 6-6 6 6 0 0 0 4-6" />
        </>
      );
    case 'arrow-right':
      return <Path {...s} d="M5 12h14M13 6l6 6-6 6" />;
  }
}

export function Icon({
  name,
  size = 18,
  color = '#000',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths(name, color)}
    </Svg>
  );
}
