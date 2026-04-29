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
  live?: boolean;
};

const ROUTES: Route[] = [
  { href: '/connect', label: 'Connect', hint: 'enter amarre URL', icon: 'cloud', live: true },
  { href: '/chat', label: 'Chat', hint: 'live session', icon: 'edit', live: true },
  { href: '/sessions', label: 'Sessions', hint: 'list of active and recent sessions', icon: 'menu' },
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
                  { backgroundColor: r.live ? t.accentSoft : t.bgSunk, borderRadius: radii.sm },
                ]}>
                <Icon name={r.icon} size={18} color={r.live ? t.accent : t.ink3} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.titleRow}>
                  <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink }}>
                    {r.label}
                  </Text>
                  {r.live ? (
                    <View style={[styles.liveTag, { backgroundColor: t.accent }]}>
                      <Text style={{ fontFamily: fonts.monoSemiBold, fontSize: 9, color: '#fff', letterSpacing: 0.6 }}>
                        LIVE
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.demoTag, { borderColor: t.line }]}>
                      <Text style={{ fontFamily: fonts.monoSemiBold, fontSize: 9, color: t.ink3, letterSpacing: 0.6 }}>
                        DEMO
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink3, marginTop: 2 }}>
                  {r.hint}
                </Text>
              </View>
              <Icon name="chevron" size={16} color={t.ink3} />
            </Pressable>
          </Link>
        ))}
      </View>

      <Text style={[styles.foot, { color: t.ink3 }]}>amarre · feat/expo-wire</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  demoTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  foot: {
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_400Regular',
    fontSize: 10,
    marginTop: 32,
    opacity: 0.6,
  },
});
