import { Text } from 'react-native';

import { fonts } from '../tokens/typography';
import { useTheme } from '../theme/useTheme';

// atoms.jsx:19-25 — italic serif "amarre".
export function AmWordmark({ size = 22, color }: { size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontFamily: fonts.serifItalic,
        fontSize: size,
        color: color ?? t.ink,
        letterSpacing: -0.3,
        lineHeight: size,
      }}>
      amarre
    </Text>
  );
}
