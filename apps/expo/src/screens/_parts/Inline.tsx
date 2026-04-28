import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '../../design/atoms/Icon';
import { StatusDot, type DotState } from '../../design/atoms/StatusDot';
import { useTheme } from '../../design/theme/useTheme';
import { fonts } from '../../design/tokens/typography';
import { radii } from '../../design/tokens/radii';

// Inline `<code>` styling — small monospace pill.
export function CodeText({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontFamily: fonts.mono,
        fontSize: 12,
        color: t.ink,
        backgroundColor: t.codeBg,
      }}>
      {' '}{children}{' '}
    </Text>
  );
}

// User bubble — right-aligned, soft elevation.
export function UserBubble({ children }: { children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
      <View
        style={{
          maxWidth: '82%',
          paddingVertical: 10,
          paddingHorizontal: 14,
          backgroundColor: t.bgElev,
          borderColor: t.line,
          borderWidth: StyleSheet.hairlineWidth,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 20,
          borderBottomLeftRadius: 6,
        }}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, color: t.ink }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

// Single-line tool row (used after the agent invokes Read/Grep/etc.)
export function ToolRow({
  icon,
  label,
  path,
  state,
  meta,
}: {
  icon: IconName;
  label: string;
  path: string;
  state: DotState;
  meta?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: t.bgElev,
        borderColor: t.line,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radii.sm,
      }}>
      <StatusDot state={state} />
      <Icon name={icon} size={14} color={t.ink2} />
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: t.ink }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fonts.mono, fontSize: 12, color: t.ink3 }}>
        {path}
      </Text>
      {meta ? <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink3 }}>{meta}</Text> : null}
    </View>
  );
}
