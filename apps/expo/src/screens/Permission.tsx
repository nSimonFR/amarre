import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { Composer } from './_parts/Composer';
import { ToolRow } from './_parts/Inline';
import { StatusStrip } from './_parts/StatusStrip';
import { SubHeaderBack } from './_parts/SubHeaderBack';

// screens-rest.jsx:4-123 — inline gate card with accent rail.
export function Permission() {
  const t = useTheme();
  return (
    <AmPhone>
      <SubHeaderBack title="Permission gate UX" subtitle="rpi5:nic-os · feat/perm" />
      <StatusStrip state="warn" text="amarre is waiting on you" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
        <Text style={[styles.prose, { color: t.ink }]}>
          To register amarre on this host I need to append two lines to your shell config.
        </Text>

        <ToolRow icon="file" label="Read" path="~/.zshrc" state="ok" meta="247 lines" />

        <View
          style={[
            styles.card,
            {
              backgroundColor: t.bgElev,
              borderColor: t.lineStrong,
              borderRadius: radii.md,
              ...t.shadows.lift,
            },
          ]}>
          <View style={[styles.rail, { backgroundColor: t.accent }]} />

          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.kicker, { color: t.ink3 }]}>PERMISSION · EDIT</Text>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink, marginTop: 2 }}>
                Append to{' '}
                <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14 }}>
                  ~/.zshrc
                </Text>
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                backgroundColor: t.bgSunk,
                borderRadius: radii.pill,
              }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>30s</Text>
            </View>
          </View>

          <View style={styles.diffWrap}>
            <View
              style={{
                backgroundColor: t.bgSunk,
                borderColor: t.line,
                borderWidth: StyleSheet.hairlineWidth,
                borderRadius: radii.xs,
                overflow: 'hidden',
              }}>
              <DiffLine line="export AMARRE_HOME=~/.amarre" />
              <DiffLine line="export PATH=$AMARRE_HOME/bin:$PATH" />
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, { backgroundColor: t.bgSunk, borderRadius: radii.sm }]}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: t.ink2 }}>
                Deny
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                {
                  flex: 1.4,
                  backgroundColor: t.accent,
                  borderRadius: radii.sm,
                  shadowColor: '#7c5cff',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.28,
                  shadowRadius: 12,
                  elevation: 4,
                },
              ]}>
              <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#fff' }}>
                Allow
              </Text>
            </Pressable>
          </View>

          <Pressable style={[styles.toggle, { borderTopColor: t.line }]}>
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                borderColor: t.lineStrong,
                borderWidth: 1,
              }}
            />
            <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink2 }}>
              Always allow on{' '}
              <Text style={{ fontFamily: fonts.mono, fontSize: 11.5, color: t.ink }}>rpi5</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <Composer mode="code" working />
    </AmPhone>
  );
}

function DiffLine({ line }: { line: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        paddingVertical: 4,
        paddingHorizontal: 12,
        backgroundColor: 'rgba(0, 185, 119, 0.08)',
      }}>
      <Text style={{ fontFamily: fonts.monoSemiBold, fontSize: 11, color: t.ok, width: 8 }}>+</Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink }}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
    gap: 16,
  },
  prose: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    position: 'relative',
  },
  rail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  kicker: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  diffWrap: { paddingHorizontal: 16, paddingBottom: 12 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
