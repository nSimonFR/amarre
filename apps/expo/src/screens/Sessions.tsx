import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmAvatar } from '../design/atoms/AmAvatar';
import { AmWordmark } from '../design/atoms/AmWordmark';
import { HeaderPill } from '../design/atoms/HeaderPill';
import { Icon } from '../design/atoms/Icon';
import { StatusDot } from '../design/atoms/StatusDot';
import { StatusOrb, type OrbState } from '../design/atoms/StatusOrb';
import { AmHeader } from '../design/phone/AmHeader';
import { AmPhone } from '../design/phone/AmPhone';
import { AmScroll } from '../design/phone/AmScroll';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';

// Mirror of screen-sessions.jsx:5-11.
type Item = {
  t: string;
  s: OrbState;
  host: string;
  branch: string;
  preview: string;
  time: string;
  badge?: string;
};

const TODAY: Item[] = [
  { t: 'Permission gate UX', s: 'running', host: 'rpi5:nic-os', branch: 'feat/perm', preview: 'Editing src/extensions/perm.ts…', time: 'now' },
  { t: 'Auth · tailnet token', s: 'waiting', host: 'mac-studio', branch: 'main', preview: 'Needs approval — Edit ~/.zshrc', time: '2m', badge: 'needs you' },
  { t: 'Refactor WS bridge', s: 'idle', host: 'rpi5:nic-os', branch: 'main', preview: 'Last: 14 files changed', time: '1h' },
  { t: 'ProtonMail integration', s: 'done', host: 'rpi5:nic-os', branch: 'feat/proton', preview: '✓ All tests pass · 23 / 0', time: '3h' },
];

const YESTERDAY: Item[] = [
  { t: 'MEM cache eviction', s: 'done', host: 'mac-studio', branch: 'cache-2', preview: 'Merged to main', time: 'yest' },
];

export function Sessions() {
  const t = useTheme();
  return (
    <AmPhone>
      <AmHeader
        title="Sessions"
        subtitle="2 live · 1 needs you"
        leading={
          <View style={styles.brand}>
            <AmAvatar size={32} />
            <AmWordmark size={22} />
          </View>
        }
        trailing={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <HeaderPill>
              <Icon name="search" size={18} color={t.ink2} />
            </HeaderPill>
            <Pressable
              style={[styles.add, { backgroundColor: t.accent }]}>
              <Icon name="plus" size={18} color="#fff" />
            </Pressable>
          </View>
        }
      />

      <View style={styles.filters}>
        <Chip label="All" count={5} active />
        <Chip label="Live" count={1} dot="run" />
        <Chip label="Waiting" count={1} dot="warn" />
        <Chip label="Done" />
      </View>

      <AmScroll>
        <SectionLabel>TODAY</SectionLabel>
        <View style={styles.cards}>
          {TODAY.map((it) => <SessionCard key={it.t} {...it} />)}
        </View>
        <SectionLabel>YESTERDAY</SectionLabel>
        <View style={styles.cards}>
          {YESTERDAY.map((it) => <SessionCard key={it.t} {...it} />)}
        </View>
        <View style={{ height: 80 }} />
      </AmScroll>
    </AmPhone>
  );
}

function Chip({ label, count, active = false, dot }: { label: string; count?: number; active?: boolean; dot?: 'run' | 'warn' }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: active ? t.ink : t.bgSunk,
          borderRadius: radii.pill,
        },
      ]}>
      {dot ? <StatusDot state={dot} size={6} /> : null}
      <Text
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 12,
          color: active ? t.bg : t.ink2,
        }}>
        {label}
        {count !== undefined ? <Text style={{ opacity: 0.6 }}> {count}</Text> : null}
      </Text>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        paddingHorizontal: 24,
        paddingTop: 14,
        paddingBottom: 8,
        fontFamily: fonts.monoSemiBold,
        fontSize: 10,
        letterSpacing: 1.2,
        color: t.ink3,
      }}>
      {children}
    </Text>
  );
}

function SessionCard({ t: title, s, host, branch, preview, time, badge }: Item) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: t.bgElev,
          borderColor: t.line,
          borderRadius: radii.md,
          ...t.shadows.base,
        },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <StatusOrb state={s} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink }}>
              {title}
            </Text>
            {badge ? (
              <View style={{ backgroundColor: 'rgba(240, 169, 58, 0.14)', paddingVertical: 2, paddingHorizontal: 7, borderRadius: radii.pill }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, color: t.warn }}>{badge}</Text>
              </View>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: t.ink3 }}>{time}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{host}</Text>
            <Text style={{ color: t.ink3, opacity: 0.4 }}>·</Text>
            <Icon name="branch" size={11} color={t.ink3} />
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{branch}</Text>
          </View>
        </View>
      </View>
      <Text
        numberOfLines={1}
        style={{ fontFamily: fonts.sans, fontSize: 13, color: t.ink2, marginTop: 6, paddingLeft: 44 }}>
        {preview}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  filters: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  cards: { paddingHorizontal: 16, gap: 8 },
  card: {
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
