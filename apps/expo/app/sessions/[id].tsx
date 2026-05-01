import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { AmPhone } from '../../src/design/phone/AmPhone';
import { useTheme } from '../../src/design/theme/useTheme';
import { fonts } from '../../src/design/tokens/typography';

export default function SessionDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AmPhone>
      <View style={{ flex: 1, padding: 24, gap: 16 }}>
        <Text style={{ fontFamily: fonts.sansBold, fontSize: 22, color: t.ink }}>session</Text>
        <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: t.ink2 }}>
          id: {id ?? '(none)'}
        </Text>
        <Pressable
          onPress={() => router.replace('/sessions')}
          style={{ marginTop: 24, padding: 12, alignSelf: 'flex-start' }}>
          <Text style={{ fontFamily: fonts.sansMedium, color: t.accent }}>back to sessions</Text>
        </Pressable>
      </View>
    </AmPhone>
  );
}
