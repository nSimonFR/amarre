import { Link } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmAvatar } from '../src/design/atoms/AmAvatar';
import { AmWordmark } from '../src/design/atoms/AmWordmark';
import { Icon, type IconName } from '../src/design/atoms/Icon';
import { useTheme } from '../src/design/theme/useTheme';
import { fonts } from '../src/design/tokens/typography';
import { radii } from '../src/design/tokens/radii';

type Route = {
  href: '/atoms' | '/sessions' | '/chat' | '/connect' | '/permission' | '/pr' | '/streaming' | '/empty' | '/error';
  label: string;
  hint: string;
  icon: IconName;
};

const ROUTES: Route[] = [
  { href: '/sessions', label: 'Sessions', hint: 'list of active and recent sessions', icon: 'menu' },
  { href: '/chat', label: 'Chat', hint: 'active session, prose + tool rows', icon: 'edit' },
  { href: '/connect', label: 'Connect', hint: 'wizard step 1 of 3', icon: 'cloud' },
  { href: '/permission', label: 'Permission', hint: 'inline gate card', icon: 'shield' },
  { href: '/pr', label: 'PR / Result', hint: 'completion summary', icon: 'git' },
  { href: '/streaming', label: 'Streaming', hint: '14s hi-fi animation loop', icon: 'sparkle' },
  { href: '/empty', label: 'Empty state', hint: 'jeter l\u2019amarre', icon: 'plus' },
  { href: '/error', label: 'Error state', hint: 'disconnected', icon: 'x' },
  { href: '/atoms', label: 'Atoms gallery', hint: 'tokens + atoms reference', icon: 'sparkle' },
];

export default function Hub() {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <AmAvatar size={40} halo />
        <View style={{ flex: 1 }}>
          <AmWordmark size={28} color={t.ink} />
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3, marginTop: 4 }}>
            design preview · {t.scheme}
          </Text>
        </View>
      </View>

      <View style={styles.list}>
        {ROUTES.map((r) => (
          <Link key={r.href} href={r.href} asChild>
            <Pressable
              style={({ pressed }) => [
                styles.item,
                {
                  backgroundColor: t.bgElev,
                  borderColor: t.line,
                  borderRadius: radii.md,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: t.accentSoft, borderRadius: radii.sm },
                ]}>
                <Icon name={r.icon} size={18} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink }}>
                  {r.label}
                </Text>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink3, marginTop: 2 }}>
                  {r.hint}
                </Text>
              </View>
              <Icon name="chevron" size={16} color={t.ink3} />
            </Pressable>
          </Link>
        ))}
      </View>

      <Text style={[styles.foot, { color: t.ink3 }]}>amarre · feat/expo-design</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 60, gap: 8, paddingBottom: 64 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 20,
  },
  list: { gap: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    marginTop: 32,
    opacity: 0.6,
  },
});
