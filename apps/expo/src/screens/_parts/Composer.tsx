import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { GlassPill } from '../../design/atoms/GlassPill';
import { Icon } from '../../design/atoms/Icon';
import { useTheme } from '../../design/theme/useTheme';
import { fonts } from '../../design/tokens/typography';
import { radii } from '../../design/tokens/radii';

export function Composer({
  mode = 'code',
  working = false,
  onChangeMode,
  onSend,
  onStop,
}: {
  mode?: 'code' | 'plan';
  working?: boolean;
  onChangeMode?: (m: 'code' | 'plan') => void;
  onSend?: (text: string) => void;
  onStop?: () => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed || !onSend) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <View style={[styles.root, { backgroundColor: t.bg, paddingBottom: Platform.OS === 'ios' ? 28 : 16 }]}>
      <GlassPill
        radius={radii.lg}
        style={[
          styles.pill,
          {
            ...t.shadows.lift,
          },
        ]}>
        <View style={{ paddingTop: 4, paddingHorizontal: 4 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={working ? 'steer amarre…' : 'message amarre…'}
            placeholderTextColor={t.ink3}
            multiline
            blurOnSubmit
            onSubmitEditing={submit}
            style={{
              fontFamily: fonts.sans,
              fontSize: 14,
              color: t.ink,
              minHeight: 20,
              padding: 0,
            }}
          />
        </View>
        <View style={styles.rowBottom}>
          <View style={[styles.segmented, { backgroundColor: t.bgSunk }]}>
            {(['code', 'plan'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => onChangeMode?.(m)}
                style={[
                  styles.segItem,
                  mode === m ? { backgroundColor: t.bgElev } : null,
                ]}>
                <Text
                  style={{
                    fontFamily: fonts.monoSemiBold,
                    fontSize: 11,
                    letterSpacing: 0.4,
                    color: mode === m ? t.ink : t.ink3,
                  }}>
                  {m === 'code' ? '</> CODE' : '◇ PLAN'}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={8} style={[styles.iconBtn]}>
            <Icon name="attach" size={18} color={t.ink2} />
          </Pressable>
          {working ? (
            <Pressable
              onPress={onStop}
              style={[styles.send, { backgroundColor: t.ink }]}>
              <View style={{ width: 10, height: 10, backgroundColor: t.bg, borderRadius: 2 }} />
            </Pressable>
          ) : (
            <Pressable
              onPress={submit}
              style={[
                styles.send,
                { backgroundColor: text.trim() ? t.accent : t.lineStrong },
              ]}>
              <Icon name="arrow-up" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      </GlassPill>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
  },
  pill: {
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  segmented: {
    flexDirection: 'row',
    padding: 2,
    borderRadius: radii.pill,
  },
  segItem: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: radii.pill,
  },
  iconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
