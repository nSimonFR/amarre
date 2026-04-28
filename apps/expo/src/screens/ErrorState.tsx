import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../design/atoms/Icon';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';

// screens-rest.jsx:405-449 — disconnected state with last error block.
export function ErrorState() {
  const t = useTheme();
  return (
    <AmPhone>
      <View style={styles.toolbar}>
        <Pressable hitSlop={8}>
          <Icon name="back" size={20} color={t.ink2} />
        </Pressable>
        <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.err }}>
          ● disconnected
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.errIcon, { backgroundColor: 'rgba(239, 93, 93, 0.12)' }]}>
          <Text style={{ fontSize: 38, color: t.err, lineHeight: 38 }}>!</Text>
        </View>
        <Text style={[styles.headline, { color: t.ink }]}>can&apos;t reach rpi5</Text>
        <Text style={[styles.copy, { color: t.ink2 }]}>
          websocket closed (1006). amarre may be offline or your tailnet is asleep.
        </Text>

        <View
          style={[
            styles.errBlock,
            { backgroundColor: t.bgElev, borderColor: t.line, borderRadius: radii.md },
          ]}>
          <Text style={[styles.label, { color: t.ink3 }]}>LAST ERROR</Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.ink, marginTop: 4 }}>
            ws://rpi5:8443
          </Text>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.err, marginTop: 2 }}>
            ECONNREFUSED · 14:21:08 · 3 retries
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[
              styles.btn,
              { backgroundColor: t.bgElev, borderColor: t.lineStrong, borderRadius: radii.sm },
            ]}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: t.ink }}>
              view logs
            </Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnPrimary, { backgroundColor: t.accent, borderRadius: radii.sm }]}>
            <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: '#fff' }}>
              retry
            </Text>
          </Pressable>
        </View>
      </View>
    </AmPhone>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  errIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontFamily: fonts.sansBold,
    fontSize: 26,
    letterSpacing: -0.6,
    marginTop: 22,
    textAlign: 'center',
  },
  copy: {
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errBlock: {
    alignSelf: 'stretch',
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 22,
  },
  label: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9,
    letterSpacing: 1.2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
    alignSelf: 'stretch',
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  btnPrimary: {
    borderColor: 'transparent',
    shadowColor: '#7c5cff',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 18,
    elevation: 6,
  },
});
