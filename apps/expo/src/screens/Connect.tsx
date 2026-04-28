import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AmAvatar } from '../design/atoms/AmAvatar';
import { Icon } from '../design/atoms/Icon';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';

// screens-rest.jsx:126-193 — wizard step 1 of 3.
export function Connect() {
  const t = useTheme();
  return (
    <AmPhone>
      <View style={styles.toolbar}>
        <Pressable hitSlop={8}>
          <Icon name="back" size={20} color={t.ink2} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: i === 0 ? 22 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === 0 ? t.accent : t.lineStrong,
              }}
            />
          ))}
        </View>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <AmAvatar size={56} halo />
        <Text style={[styles.headline, { color: t.ink }]}>
          where does{' '}
          <Text style={{ fontFamily: fonts.serifItalic, color: t.accent }}>amarre</Text>{' '}
          live?
        </Text>
        <Text style={[styles.copy, { color: t.ink2 }]}>
          point this app at the machine running amarre. you can scan a QR or type the host directly.
        </Text>

        <View style={styles.fields}>
          <Field label="HOST" value="rpi5.tail-abcd.ts.net" mono />
          <Field label="PORT" value="8443" mono small />
          <View style={[styles.row, { marginTop: 4 }]}>
            <Tab label="tailnet" active />
            <Tab label="LAN" />
            <Tab label="tunnel" />
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.cta,
            {
              backgroundColor: t.accent,
              borderRadius: radii.lg,
              shadowColor: '#7c5cff',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.35,
              shadowRadius: 22,
              elevation: 8,
            },
          ]}>
          <Text style={{ fontFamily: fonts.sansSemiBold, color: '#fff', fontSize: 15 }}>
            continue
          </Text>
        </Pressable>
        <Pressable style={[styles.qrBtn]}>
          <Icon name="qr" size={16} color={t.ink2} />
          <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: t.ink2 }}>
            or scan QR from{' '}
            <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.ink2 }}>
              amarre setup
            </Text>
          </Text>
        </Pressable>
      </View>
    </AmPhone>
  );
}

function Field({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.bgElev,
        borderColor: t.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radii.md,
        padding: 14,
      }}>
      <Text
        style={{
          fontFamily: fonts.monoSemiBold,
          fontSize: 9,
          letterSpacing: 1.2,
          color: t.ink3,
        }}>
        {label}
      </Text>
      <Text
        style={{
          fontFamily: mono ? fonts.mono : fonts.sansMedium,
          fontSize: small ? 16 : 17,
          color: t.ink,
          marginTop: 2,
        }}>
        {value}
      </Text>
    </View>
  );
}

function Tab({ label, active = false }: { label: string; active?: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: active ? t.ink : t.bgSunk,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
      }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: active ? t.bg : t.ink2 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  body: { paddingHorizontal: 24, paddingTop: 20 },
  headline: {
    fontFamily: fonts.sansBold,
    fontSize: 32,
    letterSpacing: -0.8,
    marginTop: 24,
  },
  copy: {
    fontFamily: fonts.sans,
    fontSize: 15,
    marginTop: 8,
    lineHeight: 21,
  },
  fields: { marginTop: 28, gap: 10 },
  row: { flexDirection: 'row', gap: 6 },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  cta: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
});
