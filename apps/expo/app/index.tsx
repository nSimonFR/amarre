import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AmMark } from '../src/design/atoms/AmMark';
import { AmWordmark } from '../src/design/atoms/AmWordmark';
import { Icon, type IconName } from '../src/design/atoms/Icon';
import { StatusDot } from '../src/design/atoms/StatusDot';
import { fonts, sizes } from '../src/design/tokens/typography';
import { radii } from '../src/design/tokens/radii';
import { useTheme } from '../src/design/theme/useTheme';

const ICON_NAMES: IconName[] = [
  'plus', 'search', 'menu', 'back', 'more', 'arrow-up', 'mic', 'send',
  'attach', 'check', 'x', 'chevron', 'down', 'cloud', 'branch', 'edit',
  'terminal', 'web', 'file', 'folder', 'shield', 'qr', 'settings',
  'sparkle', 'git', 'arrow-right',
];

export default function DemoIndex() {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={styles.scroll}>
      <View style={styles.head}>
        <AmMark size={28} color={t.accent} />
        <AmWordmark size={28} color={t.ink} />
      </View>

      <Text style={[styles.label, { color: t.ink3, fontFamily: fonts.monoSemiBold }]}>
        STATUS DOTS
      </Text>
      <View style={styles.row}>
        <Cell label="run" t={t}><StatusDot state="run" /></Cell>
        <Cell label="ok" t={t}><StatusDot state="ok" /></Cell>
        <Cell label="warn" t={t}><StatusDot state="warn" /></Cell>
        <Cell label="err" t={t}><StatusDot state="err" /></Cell>
        <Cell label="idle" t={t}><StatusDot state="idle" /></Cell>
      </View>

      <Text style={[styles.label, { color: t.ink3, fontFamily: fonts.monoSemiBold }]}>
        ICONS
      </Text>
      <View style={styles.iconGrid}>
        {ICON_NAMES.map((n) => (
          <View
            key={n}
            style={[
              styles.iconCell,
              { backgroundColor: t.bgElev, borderColor: t.line, borderRadius: radii.sm },
            ]}>
            <Icon name={n} size={20} color={t.ink} />
            <Text style={{ fontFamily: fonts.mono, fontSize: 9, color: t.ink3, marginTop: 4 }}>
              {n}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.label, { color: t.ink3, fontFamily: fonts.monoSemiBold }]}>
        TYPOGRAPHY
      </Text>
      <View style={[styles.typeBlock, { backgroundColor: t.bgElev, borderColor: t.line }]}>
        <Text style={{ fontFamily: fonts.serifItalic, fontSize: 32, color: t.ink }}>
          amarre
        </Text>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: sizes.title, color: t.ink, marginTop: 8 }}>
          Sessions · Inter SemiBold
        </Text>
        <Text style={{ fontFamily: fonts.sans, fontSize: sizes.body, color: t.ink2, marginTop: 4 }}>
          Body copy · Inter Regular · {t.scheme} mode
        </Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: sizes.sm, color: t.ink3, marginTop: 4 }}>
          rpi5:nic-os · feat/expo-design
        </Text>
      </View>

      <Text style={[styles.foot, { color: t.ink3 }]}>commit 1 of 4 · foundation</Text>
    </ScrollView>
  );
}

function Cell({
  label,
  t,
  children,
}: {
  label: string;
  t: ReturnType<typeof useTheme>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.cell}>
      {children}
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: t.ink3, marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 24, gap: 16, paddingBottom: 64 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.2,
    marginTop: 16,
  },
  row: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  cell: { alignItems: 'center', justifyContent: 'center', minWidth: 36 },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconCell: {
    width: 64,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeBlock: {
    padding: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  foot: {
    textAlign: 'center',
    fontSize: 10,
    marginTop: 24,
    opacity: 0.6,
  },
});
