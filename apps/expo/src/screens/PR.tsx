import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../design/atoms/Icon';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { Composer } from './_parts/Composer';
import { CodeText } from './_parts/Inline';
import { StatusStrip } from './_parts/StatusStrip';
import { SubHeaderBack } from './_parts/SubHeaderBack';

// screens-rest.jsx:199-370 — completion summary + open-PR action.
const FILES: [string, number, number][] = [
  ['src/extensions/perm.ts', 12, 3],
  ['src/ui/sheet.ts', 38, 0],
  ['tests/perm.test.ts', 24, 0],
  ['README.md', 2, 0],
];

export function PR() {
  const t = useTheme();
  return (
    <AmPhone>
      <SubHeaderBack title="Permission gate UX" subtitle="rpi5:nic-os · feat/perm" />
      <StatusStrip state="ok" text="ready to ship" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <Text style={[styles.prose, { color: t.ink }]}>
          All set — bottom-sheet gate is wired up, tests pass. I&apos;ve pushed
          <CodeText>feat/perm</CodeText>
          to
          <CodeText>origin</CodeText>
          . Want me to open the PR?
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: t.bgElev,
              borderColor: t.lineStrong,
              borderRadius: radii.md,
              ...t.shadows.base,
            },
          ]}>
          <View style={styles.head}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="git" size={12} color={t.ink3} />
              <Text style={[styles.kicker, { color: t.ink3 }]}>NICHOLAS/REPO</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: t.accentSoft,
                  borderRadius: 6,
                }}>
                <Text style={{ fontFamily: fonts.monoSemiBold, fontSize: 12, color: t.accent }}>
                  feat/perm
                </Text>
              </View>
              <Icon name="arrow-right" size={12} color={t.ink3} />
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  backgroundColor: t.bgSunk,
                  borderRadius: 6,
                }}>
                <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.ink2 }}>main</Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.summary,
              {
                backgroundColor: t.bgSunk,
                borderTopColor: t.line,
                borderBottomColor: t.line,
              },
            ]}>
            <View style={styles.summaryHeader}>
              <Text style={[styles.kicker, { color: t.ink3 }]}>4 FILES · 2 COMMITS</Text>
              <Text style={[styles.kicker, { color: t.ink3 }]}>
                <Text style={{ color: t.ok }}>+76</Text>
                {'  ·  '}
                <Text style={{ color: t.err }}>−3</Text>
              </Text>
            </View>
            {FILES.map(([f, add, del]) => (
              <View key={f} style={styles.fileRow}>
                <Icon name="file" size={12} color={t.ink3} />
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: fonts.mono, fontSize: 12, color: t.ink2 }}>
                  {f}
                </Text>
                <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: t.ok }}>+{add}</Text>
                {del > 0 ? (
                  <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: t.err }}>
                    −{del}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.titleBlock}>
            <Text style={[styles.kicker, { color: t.ink3 }]}>TITLE</Text>
            <Text
              style={{
                fontFamily: fonts.sansMedium,
                fontSize: 14,
                color: t.ink,
                lineHeight: 20,
                marginTop: 6,
              }}>
              feat(perm): bottom-sheet permission gate with always-allow
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, { backgroundColor: t.bgSunk, borderRadius: radii.sm }]}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: t.ink2 }}>
                edit
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                {
                  flex: 1.6,
                  backgroundColor: t.accent,
                  borderRadius: radii.sm,
                  flexDirection: 'row',
                  gap: 8,
                  shadowColor: '#7c5cff',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.28,
                  shadowRadius: 12,
                  elevation: 4,
                },
              ]}>
              <Icon name="git" size={14} color="#fff" />
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#fff' }}>
                open pull request
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <Composer mode="code" />
    </AmPhone>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 16 },
  prose: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  head: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  kicker: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  summary: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  titleBlock: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
