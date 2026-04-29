import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/useTheme';
import { radii } from '../tokens/radii';

// tokens-v2.css:90-95 — blur(28) + saturate(180) + 0.5px line.
// expo-blur intensity ~90 approximates 28px CSS blur reasonably well
// on iOS; Android falls back to a tinted background; web degrades to
// CSS backdrop-filter (Firefox doesn't support that — semi-transparent
// background is the visible fallback).
export function GlassPill({
  children,
  style,
  radius = radii.lg,
  intensity = 70,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
}) {
  const t = useTheme();

  return (
    <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>
      <BlurView
        intensity={intensity}
        tint={t.scheme}
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor:
              t.scheme === 'dark' ? 'rgba(23, 23, 26, 0.4)' : 'rgba(255, 255, 255, 0.55)',
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: t.lineStrong,
          },
        ]}
      />
      {/* Inner shine — emulates the inset highlight from ios-frame.jsx:70 */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          t.scheme === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.4)',
          'rgba(255, 255, 255, 0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.4 }}
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }]}
      />
      {children}
    </View>
  );
}
