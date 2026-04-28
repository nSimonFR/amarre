import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmAvatar } from '../design/atoms/AmAvatar';
import { Icon } from '../design/atoms/Icon';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';

// screens-rest.jsx:373-403 — onboarding empty state.
export function EmptyState() {
  const t = useTheme();
  return (
    <AmPhone>
      <View style={styles.toolbar}>
        <View style={{ width: 36 }} />
        <Pressable hitSlop={8}>
          <Icon name="settings" size={18} color={t.ink2} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <AmAvatar size={84} halo />
        <Text style={[styles.headline, { color: t.ink }]}>
          jeter{' '}
          <Text style={{ fontFamily: fonts.serifItalic, color: t.accent }}>l&apos;amarre</Text>
        </Text>
        <Text style={[styles.copy, { color: t.ink2 }]}>
          start a coding session. amarre runs on your machine — you steer from here.
        </Text>

        <Pressable
          style={[
            styles.cta,
            { backgroundColor: t.accent, borderRadius: radii.md, marginTop: 28 },
          ]}>
          <Icon name="plus" size={16} color="#fff" />
          <Text style={{ fontFamily: fonts.sansSemiBold, color: '#fff', fontSize: 15 }}>
            new session
          </Text>
        </Pressable>
        <Pressable hitSlop={8} style={{ marginTop: 6 }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: t.ink3 }}>
            or connect a host
          </Text>
        </Pressable>
      </View>
    </AmPhone>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  headline: {
    fontFamily: fonts.sansBold,
    fontSize: 32,
    letterSpacing: -0.8,
    marginTop: 28,
    textAlign: 'center',
  },
  copy: {
    fontFamily: fonts.sans,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
    maxWidth: 280,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 14,
  },
});
