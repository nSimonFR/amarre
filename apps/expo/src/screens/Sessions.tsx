import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AmAvatar } from '../design/atoms/AmAvatar';
import { AmWordmark } from '../design/atoms/AmWordmark';
import { HeaderPill } from '../design/atoms/HeaderPill';
import { Icon } from '../design/atoms/Icon';
import { StatusOrb, type OrbState } from '../design/atoms/StatusOrb';
import { AmHeader } from '../design/phone/AmHeader';
import { AmPhone } from '../design/phone/AmPhone';
import { AmScroll } from '../design/phone/AmScroll';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { radii } from '../design/tokens/radii';
import { useAmarre } from '../lib/AmarreProvider';
import { httpBaseUrl, loadSettings, type Settings } from '../lib/persistence/settings';
import {
  createSession,
  deleteSession,
  listSessions,
  restartSession,
  RestError,
  type SessionInfo,
} from '../lib/rest/sessions';

export function Sessions() {
  const t = useTheme();
  const { connectToSession } = useAmarre();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (s: Settings | null) => {
    if (!s) return;
    try {
      const list = await listSessions(httpBaseUrl(s));
      list.sort((a, b) => b.spawnedAt - a.spawnedAt);
      setSessions(list);
      setError(null);
    } catch (e) {
      setSessions([]);
      setError(formatError(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadSettings();
        if (cancelled) return;
        if (!s) {
          router.replace('/connect');
          return;
        }
        setSettings(s);
        await refresh(s);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh]),
  );

  const onSpawn = async () => {
    if (!settings) return;
    setBusy('spawn');
    setError(null);
    try {
      const info = await createSession(httpBaseUrl(settings));
      await connectToSession(info.id);
      router.replace('/chat');
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(null);
    }
  };

  const onPick = async (info: SessionInfo) => {
    if (!settings) return;
    if (info.status === 'crashed' || info.status === 'stopped') {
      setBusy(info.id);
      try {
        await restartSession(httpBaseUrl(settings), info.id);
      } catch (e) {
        setError(formatError(e));
        setBusy(null);
        return;
      }
    } else {
      setBusy(info.id);
    }
    try {
      await connectToSession(info.id);
      router.replace('/chat');
    } catch (e) {
      setError(formatError(e));
    } finally {
      setBusy(null);
    }
  };

  const onDelete = (info: SessionInfo) => {
    if (!settings) return;
    const run = async () => {
      try {
        await deleteSession(httpBaseUrl(settings), info.id);
        await refresh(settings);
      } catch (e) {
        setError(formatError(e));
      }
    };
    Alert.alert(
      'Stop session?',
      `${info.name ?? info.id.slice(0, 6)} will be terminated.`,
      [
        { text: 'cancel', style: 'cancel' },
        { text: 'stop', style: 'destructive', onPress: () => void run() },
      ],
    );
  };

  const live = sessions?.filter((s) => s.status === 'running').length ?? 0;
  const crashed = sessions?.filter((s) => s.status === 'crashed').length ?? 0;
  const subtitle = sessions === null
    ? 'loading…'
    : `${live} live${crashed ? ` · ${crashed} crashed` : ''}`;

  return (
    <AmPhone>
      <AmHeader
        title="Sessions"
        subtitle={subtitle}
        leading={
          <View style={styles.brand}>
            <AmAvatar size={32} />
            <AmWordmark size={22} />
          </View>
        }
        trailing={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable hitSlop={8} onPress={() => refresh(settings)}>
              <HeaderPill>
                <Icon name="search" size={18} color={t.ink2} />
              </HeaderPill>
            </Pressable>
            <Pressable
              onPress={busy === 'spawn' ? undefined : onSpawn}
              style={[styles.add, { backgroundColor: busy === 'spawn' ? t.line : t.accent }]}>
              {busy === 'spawn' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Icon name="plus" size={18} color="#fff" />
              )}
            </Pressable>
          </View>
        }
      />

      {error ? (
        <View style={[styles.errorBar, { backgroundColor: t.bgSunk, borderColor: t.line }]}>
          <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.err }} numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}

      <AmScroll>
        {sessions === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : sessions.length === 0 ? (
          <EmptyHint t={t} />
        ) : (
          <View style={styles.cards}>
            {sessions.map((s) => (
              <SessionCard
                key={s.id}
                info={s}
                busy={busy === s.id}
                onPress={() => onPick(s)}
                onDelete={() => onDelete(s)}
              />
            ))}
          </View>
        )}
        <View style={{ height: 80 }} />
      </AmScroll>
    </AmPhone>
  );
}

function EmptyHint({ t }: { t: ReturnType<typeof useTheme> }) {
  return (
    <View style={styles.empty}>
      <Text style={{ fontFamily: fonts.serifItalic, fontSize: 22, color: t.ink, textAlign: 'center' }}>
        no sessions yet
      </Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: t.ink3, marginTop: 8, textAlign: 'center' }}>
        tap + to spawn one
      </Text>
    </View>
  );
}

function SessionCard({
  info,
  busy,
  onPress,
  onDelete,
}: {
  info: SessionInfo;
  busy: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const t = useTheme();
  const orb: OrbState = orbStateFor(info.status);
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      onLongPress={onDelete}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.bgElev,
          borderColor: t.line,
          borderRadius: radii.md,
          opacity: pressed ? 0.7 : 1,
          ...t.shadows.base,
        },
      ]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <StatusOrb state={orb} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink }}>
              {info.name ?? info.id.slice(0, 8)}
            </Text>
            {info.status === 'crashed' ? (
              <View style={{ backgroundColor: 'rgba(240, 91, 91, 0.14)', paddingVertical: 2, paddingHorizontal: 7, borderRadius: radii.pill }}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 10, color: t.err }}>tap to restart</Text>
              </View>
            ) : (
              <Text style={{ fontFamily: fonts.sans, fontSize: 11, color: t.ink3 }}>{humanAgo(info.spawnedAt)}</Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{info.agent}</Text>
            <Text style={{ color: t.ink3, opacity: 0.4 }}>·</Text>
            <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{info.id.slice(0, 8)}</Text>
            {info.clients > 0 ? (
              <>
                <Text style={{ color: t.ink3, opacity: 0.4 }}>·</Text>
                <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>{info.clients} client{info.clients === 1 ? '' : 's'}</Text>
              </>
            ) : null}
          </View>
        </View>
        {busy ? <ActivityIndicator color={t.accent} /> : null}
      </View>
    </Pressable>
  );
}

function orbStateFor(status: SessionInfo['status']): OrbState {
  switch (status) {
    case 'running':
      return 'running';
    case 'crashed':
      return 'waiting';
    default:
      return 'idle';
  }
}

function humanAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 30_000) return 'now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

function formatError(e: unknown): string {
  if (e instanceof RestError) {
    if (e.status === 429 && e.body && typeof e.body === 'object' && 'limit' in e.body) {
      return `max sessions reached (limit ${(e.body as { limit: number }).limit})`;
    }
    return `${e.status}: ${e.message}`;
  }
  return e instanceof Error ? e.message : String(e);
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  add: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  errorBar: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.sm,
  },
  cards: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  card: {
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  loading: { paddingVertical: 64, alignItems: 'center' },
  empty: { paddingHorizontal: 24, paddingVertical: 64 },
});
