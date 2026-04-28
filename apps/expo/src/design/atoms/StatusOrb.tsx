import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { useSpin } from '../animations/useSpin';
import { fonts } from '../tokens/typography';
import { useTheme } from '../theme/useTheme';

export type OrbState = 'idle' | 'running' | 'waiting' | 'done' | 'ok' | 'err';

// atoms.jsx:57-95 — circle outline, optional dashed running ring
// that spins, and a glyph in the centre indicating the state.
export function StatusOrb({ state = 'idle', size = 32 }: { state?: OrbState; size?: number }) {
  const t = useTheme();
  const stroke = 1.5;
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const ring = state === 'running' ? c * 0.7 : c;
  const spin = useSpin(state === 'running');

  const color =
    state === 'running' ? t.run :
    state === 'done' || state === 'ok' ? t.ok :
    state === 'waiting' ? t.warn :
    state === 'err' ? t.err :
    t.ink3;

  const strokeColor = state === 'idle' ? t.lineStrong : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[StyleSheet.absoluteFillObject, spin]}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={strokeColor}
            strokeWidth={stroke}
            strokeDasharray={state === 'running' ? `${ring} ${c - ring}` : undefined}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>

      {state === 'done' || state === 'ok' ? (
        <Svg width={12} height={12} viewBox="0 0 12 12">
          <Path
            d="M2.5 6L5 8.5L9.5 3.5"
            fill="none"
            stroke={t.ok}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : state === 'err' ? (
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 12, color: t.err, lineHeight: 12 }}>
          !
        </Text>
      ) : state === 'waiting' ? (
        <View
          style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: t.warn }}
        />
      ) : null}
    </View>
  );
}
