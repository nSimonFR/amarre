import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../tokens/typography';
import { useTheme } from '../theme/useTheme';

// phone.jsx:36-58 — large title row + leading/trailing slots + subtitle.
// Vertical padding matches the JSX (8px below the toolbar row, 14px above
// the title); top inset comes from AmPhone's SafeAreaView.
export function AmHeader({
  title,
  subtitle,
  leading,
  trailing,
}: {
  title?: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: t.bg }]}>
      <View style={styles.toolbar}>
        <View style={styles.slot}>{leading}</View>
        <View style={styles.slot}>{trailing}</View>
      </View>
      {title ? (
        <Text
          style={{
            fontFamily: fonts.sansBold,
            fontSize: 32,
            letterSpacing: -0.8,
            color: t.ink,
            marginTop: 14,
          }}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text
          style={{ fontFamily: fonts.sans, fontSize: 14, color: t.ink3, marginTop: 4 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
