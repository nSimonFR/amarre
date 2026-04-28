import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../theme/useTheme';

// phone.jsx:4-33 (adapted) — the design canvas wraps screens in a
// scaled iOS device frame; the real app just provides safe-area
// insets + theme background and lets each screen fill the device.
export function AmPhone({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: t.bg }]} edges={['top', 'bottom']}>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
