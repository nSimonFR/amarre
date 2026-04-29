import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Icon } from '../../design/atoms/Icon';
import { AmSubHeader } from '../../design/phone/AmSubHeader';
import { useTheme } from '../../design/theme/useTheme';

// Convenience wrapper used across Chat / Permission / PR — sub-header
// with a back button and the standard "more" affordance.
export function SubHeaderBack({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  const t = useTheme();
  const handleBack = onBack ?? (() => {
    if (router.canGoBack()) router.back();
  });
  return (
    <AmSubHeader
      title={title}
      subtitle={subtitle}
      leading={
        <Pressable hitSlop={8} onPress={handleBack}>
          <Icon name="back" size={20} color={t.ink2} />
        </Pressable>
      }
      trailing={
        <Pressable hitSlop={8}>
          <Icon name="more" size={18} color={t.ink2} />
        </Pressable>
      }
    />
  );
}
