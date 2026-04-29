import { StyleSheet, Text, View } from 'react-native';

import { ModePill } from '../../design/atoms/ModePill';
import { StatusDot, type DotState } from '../../design/atoms/StatusDot';
import { useTheme } from '../../design/theme/useTheme';
import { fonts } from '../../design/tokens/typography';

// Used by Chat, Permission, PR — sits between header and scroll body.
export function StatusStrip({
  state,
  text,
  mode = 'code',
}: {
  state: DotState;
  text: string;
  mode?: 'code' | 'plan';
}) {
  const t = useTheme();
  return (
    <View style={styles.root}>
      <StatusDot state={state} />
      <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink2 }}>{text}</Text>
      <View style={{ flex: 1 }} />
      <ModePill mode={mode} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
