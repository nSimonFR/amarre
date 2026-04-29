import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../tokens/typography';
import { useTheme } from '../theme/useTheme';

// phone.jsx:61-74 — back button + centered title (mono subtitle).
export function AmSubHeader({
  title,
  subtitle,
  leading,
  trailing,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.root}>
      <View style={styles.side}>{leading}</View>
      <View style={styles.center}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink, textAlign: 'center' }}>
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              color: t.ink3,
              marginTop: 2,
              textAlign: 'center',
            }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>{trailing}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  side: { minWidth: 36 },
});
