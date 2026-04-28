import { StyleSheet, Text, View } from 'react-native';

import { AmPhone } from '../design/phone/AmPhone';
import { useTheme } from '../design/theme/useTheme';
import { fonts } from '../design/tokens/typography';
import { SubHeaderBack } from './_parts/SubHeaderBack';

// Placeholder — the 14s hi-fi timeline lands in commit 4.
export function Streaming() {
  const t = useTheme();
  return (
    <AmPhone>
      <SubHeaderBack title="Streaming" subtitle="commit 4 · 14s loop" />
      <View style={styles.body}>
        <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 15, color: t.ink }}>
          coming in commit 4
        </Text>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: 13,
            color: t.ink3,
            textAlign: 'center',
            marginTop: 8,
            lineHeight: 18,
          }}>
          token-by-token reveal, code line clip-path, tool-row entrances, completion fade.
        </Text>
      </View>
    </AmPhone>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
});
