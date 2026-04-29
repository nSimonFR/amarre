import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { AmAvatar } from '../design/atoms/AmAvatar';
import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import {
  httpBaseUrl,
  loadSettings,
  saveSettings,
  type Scheme,
} from '../lib/persistence/settings';
import { listSessions } from '../lib/rest/sessions';

const DEFAULT_HOST = 'rpi5.gate-mintaka.ts.net';
const DEFAULT_PORT = '4344';
const DEFAULT_SCHEME: Scheme = 'wss';

export function Connect() {
  const t = useTheme();
  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(DEFAULT_PORT);
  const [scheme, setScheme] = useState<Scheme>(DEFAULT_SCHEME);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await loadSettings();
      if (cancelled || !s) return;
      setHost(s.host);
      setPort(s.port);
      setScheme(s.scheme);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onContinue = async () => {
    const trimmedHost = host.trim();
    const trimmedPort = port.trim();
    if (!trimmedHost || !trimmedPort) return;
    const settings = { host: trimmedHost, port: trimmedPort, scheme };
    setSubmitting(true);
    setError(null);
    try {
      // Sanity-check the control plane is reachable before persisting.
      await listSessions(httpBaseUrl(settings));
      await saveSettings(settings);
      router.replace('/sessions');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const showError = !submitting && !!error;

  return (
    <AmPhone>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={{ flex: 1 }}>
          <View style={styles.body}>
            <AmAvatar size={56} halo />
            <Text style={[styles.headline, { color: t.ink }]}>
              where does{' '}
              <Text style={{ fontFamily: fonts.serifItalic, color: t.accent }}>amarre</Text>{' '}
              live?
            </Text>
            <Text style={[styles.copy, { color: t.ink2 }]}>
              point this app at the machine running amarre. tailnet hostname or IP, and the
              WebSocket port your server is exposed on.
            </Text>

            <View style={styles.fields}>
              <Field label="HOST" value={host} onChange={setHost} autoCapitalize="none" autoCorrect={false} />
              <Field label="PORT" value={port} onChange={setPort} keyboardType="number-pad" small />
              <View style={[styles.row, { marginTop: 4 }]}>
                <Tab label="wss" active={scheme === 'wss'} onPress={() => setScheme('wss')} />
                <Tab label="ws" active={scheme === 'ws'} onPress={() => setScheme('ws')} />
              </View>
            </View>

            {showError ? (
              <Text style={[styles.error, { color: t.err }]} numberOfLines={2}>
                {error}
              </Text>
            ) : null}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={submitting ? undefined : onContinue}
              style={[
                styles.cta,
                {
                  backgroundColor: submitting ? t.line : t.accent,
                  borderRadius: radii.lg,
                  shadowColor: '#7c5cff',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: submitting ? 0 : 0.35,
                  shadowRadius: 22,
                  elevation: submitting ? 0 : 8,
                },
              ]}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ fontFamily: fonts.sansSemiBold, color: '#fff', fontSize: 15 }}>
                  continue
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </AmPhone>
  );
}

function Field({
  label,
  value,
  onChange,
  small,
  autoCapitalize,
  autoCorrect,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  small?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'number-pad';
}) {
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
      <TextInput
        value={value}
        onChangeText={onChange}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        style={{
          fontFamily: fonts.mono,
          fontSize: small ? 16 : 17,
          color: t.ink,
          marginTop: 2,
          padding: 0,
        }}
      />
    </View>
  );
}

function Tab({ label, active = false, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: active ? t.ink : t.bgSunk,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radii.pill,
      }}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: active ? t.bg : t.ink2 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 20 },
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
  error: {
    fontFamily: fonts.mono,
    fontSize: 12,
    marginTop: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 10,
  },
  cta: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
