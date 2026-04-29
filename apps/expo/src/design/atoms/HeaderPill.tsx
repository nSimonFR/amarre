import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GlassPill } from './GlassPill';

// atoms.jsx:115-124 — 36×36 round glass button.
export function HeaderPill({
  children,
  onPress,
  size = 36,
}: {
  children: ReactNode;
  onPress?: () => void;
  size?: number;
}) {
  return (
    <GlassPill style={{ width: size, height: size }} radius={size / 2}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
        <View style={styles.inner}>{children}</View>
      </Pressable>
    </GlassPill>
  );
}

const styles = StyleSheet.create({
  btn: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
