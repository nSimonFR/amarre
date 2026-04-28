import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../design/theme/useTheme';
import { fonts } from '../../design/tokens/typography';
import { radii } from '../../design/tokens/radii';
import { useAmarre } from '../../lib/AmarreProvider';
import { store, usePermissionRequests } from '../../lib/store';

export function PermissionSheet() {
  const t = useTheme();
  const { client } = useAmarre();
  const queue = usePermissionRequests();
  const req = queue[0];
  const visible = !!req;

  const respond = (decision: 'allow' | 'deny') => {
    if (!req) return;
    if (req.method === 'confirm') {
      client.send({ type: 'extension_ui_response', id: req.id, confirmed: decision === 'allow' });
    } else if (req.method === 'select' && req.options && req.options.length) {
      // Best-effort: pick the first option for allow, last for deny.
      const value = decision === 'allow' ? req.options[0] : req.options[req.options.length - 1];
      client.send({ type: 'extension_ui_response', id: req.id, value });
    } else {
      // input/editor → cancel.
      client.send({ type: 'extension_ui_response', id: req.id, cancelled: true });
    }
    store.dismissPermission(req.id);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => respond('deny')}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => respond('deny')} />
        {req ? (
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: t.bgElev,
                borderColor: t.lineStrong,
                borderRadius: radii.lg,
                ...t.shadows.lift,
              },
            ]}>
            <View style={[styles.rail, { backgroundColor: t.accent }]} />

            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.kicker, { color: t.ink3 }]}>
                  PERMISSION · {(req.method ?? 'confirm').toUpperCase()}
                </Text>
                <Text style={[styles.title, { color: t.ink }]}>{req.title ?? 'amarre is asking for permission'}</Text>
              </View>
              {req.timeout ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    backgroundColor: t.bgSunk,
                    borderRadius: radii.pill,
                  }}>
                  <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink3 }}>
                    {Math.round(req.timeout / 1000)}s
                  </Text>
                </View>
              ) : null}
            </View>

            {req.message ? (
              <ScrollView
                style={[styles.bodyWrap, { backgroundColor: t.bgSunk, borderColor: t.line, borderRadius: radii.sm }]}
                contentContainerStyle={{ padding: 12 }}
                showsVerticalScrollIndicator={false}>
                <Text style={{ fontFamily: fonts.mono, fontSize: 11, color: t.ink2, lineHeight: 17 }}>
                  {req.message}
                </Text>
              </ScrollView>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={() => respond('deny')}
                style={[styles.btn, { backgroundColor: t.bgSunk, borderRadius: radii.sm }]}>
                <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: t.ink2 }}>
                  Deny
                </Text>
              </Pressable>
              <Pressable
                onPress={() => respond('allow')}
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

            {queue.length > 1 ? (
              <Text style={[styles.queueNote, { color: t.ink3 }]}>
                +{queue.length - 1} more pending
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  sheet: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
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
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  kicker: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 15,
    marginTop: 2,
  },
  bodyWrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    maxHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueNote: {
    textAlign: 'center',
    fontFamily: fonts.mono,
    fontSize: 11,
    paddingBottom: 10,
  },
});
