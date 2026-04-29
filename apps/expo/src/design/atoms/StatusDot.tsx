import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePulse } from '../animations/usePulse';
import { useTheme } from '../theme/useTheme';

export type DotState = 'run' | 'ok' | 'warn' | 'err' | 'idle';

// tokens-v2.css:97-107 — 8px round dot with state coloring; the
// running variant has an expanding halo (am-pulse). Sized to fit
// inline next to text; 8px matches the design.
export function StatusDot({ state = 'idle', size = 8 }: { state?: DotState; size?: number }) {
  const t = useTheme();
  const halo = usePulse(state === 'run');

  const color =
    state === 'run' ? t.run :
    state === 'ok' ? t.ok :
    state === 'warn' ? t.warn :
    state === 'err' ? t.err :
    t.ink3;

  return (
    <View style={[styles.root, { width: size, height: size }]}>
      {state === 'run' ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            { borderRadius: size / 2, backgroundColor: t.run },
            halo,
          ]}
        />
      ) : null}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: state === 'idle' ? 0.4 : 1,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
