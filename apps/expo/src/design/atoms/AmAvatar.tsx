import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useBreathe } from '../animations/useBreathe';
import { AmMark } from './AmMark';

// atoms.jsx:28-52 — π glyph in violet gradient square + optional
// breathing halo (radial gradient at 30%/30%, am-breathe 2.4s).
// Skia/RN has no radial-gradient at-position, so we approximate
// with an offset, scaled, blurred-feeling solid layer.
export function AmAvatar({
  size = 32,
  halo = false,
}: {
  size?: number;
  halo?: boolean;
}) {
  const breathe = useBreathe(halo);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {halo ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: -8,
              top: -8,
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              backgroundColor: 'rgba(124, 92, 255, 0.55)',
              transform: [{ translateX: -size * 0.18 }, { translateY: -size * 0.18 }],
            },
            breathe,
          ]}
        />
      ) : null}
      <LinearGradient
        colors={["#8a6dff", "#5b3fee"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.tile,
          {
            width: size,
            height: size,
            borderRadius: size * 0.32,
          },
        ]}>
        <AmMark size={size * 0.7} color="#fff" />
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: size * 0.32,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: 'rgba(255, 255, 255, 0.18)',
            },
          ]}
        />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5b3fee',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
});
