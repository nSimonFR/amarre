import { StyleSheet, Text, View } from 'react-native';

import { fonts } from '../tokens/typography';
import { radii } from '../tokens/radii';
import { useTheme } from '../theme/useTheme';

// atoms.jsx:106-112 — Code/Plan toggle badge.
export function ModePill({ mode = 'code' }: { mode?: 'code' | 'plan' }) {
  const t = useTheme();
  const planBg = 'rgba(0, 185, 119, 0.12)';

  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: mode === 'plan' ? planBg : t.accentSoft,
          borderRadius: radii.pill,
        },
      ]}>
      <Text
        style={{
          fontFamily: fonts.monoSemiBold,
          fontSize: 11,
          letterSpacing: 0.2,
          color: mode === 'plan' ? t.ok : t.accent,
        }}>
        {mode === 'plan' ? '◇ PLAN' : '</> CODE'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: 'flex-start',
  },
});
