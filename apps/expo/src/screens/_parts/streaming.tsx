import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { Icon, type IconName } from '../../design/atoms/Icon';
import { StatusDot, type DotState } from '../../design/atoms/StatusDot';
import { useTheme } from '../../design/theme/useTheme';
import { fonts } from '../../design/tokens/typography';
import { radii } from '../../design/tokens/radii';
import { streaming } from '../../design/tokens/motion';

// All sub-components for the 14s streaming screen. They share one
// progress shared value (0 → loopMs) and derive their own ranges
// so phase boundaries stay in lockstep.

const POP_MS = 420;
const FADE_MS = 280;

// ─── tokens ────────────────────────────────────────────────────
export function StreamToken({
  progress,
  startMs,
  children,
}: {
  progress: SharedValue<number>;
  startMs: number;
  children: ReactNode;
}) {
  const t = useTheme();
  const style = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [startMs, startMs + POP_MS],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ty = interpolate(
      progress.value,
      [startMs, startMs + POP_MS],
      [2, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY: ty }] };
  });

  return (
    <Animated.Text
      style={[
        { fontFamily: fonts.sans, fontSize: 14, color: t.ink, lineHeight: 22 },
        style,
      ]}>
      {children}
      {' '}
    </Animated.Text>
  );
}

export function StreamCode({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text style={{ fontFamily: fonts.mono, fontSize: 12, color: t.ink, backgroundColor: t.codeBg }}>
      {' '}{children}{' '}
    </Text>
  );
}

// ─── caret ─────────────────────────────────────────────────────
export function StreamCaret({
  progress,
  visibleStart,
  visibleEnd,
}: {
  progress: SharedValue<number>;
  visibleStart: number;
  visibleEnd: number;
}) {
  const t = useTheme();
  const style = useAnimatedStyle(() => {
    const within = progress.value >= visibleStart && progress.value <= visibleEnd;
    if (!within) return { opacity: 0 };
    // Fast blink — 2Hz.
    const phase = ((progress.value - visibleStart) % 500) / 500;
    return { opacity: phase < 0.5 ? 1 : 0 };
  });
  return (
    <Animated.View
      style={[
        { width: 7, height: 14, backgroundColor: t.accent, borderRadius: 1, marginLeft: 2 },
        style,
      ]}
    />
  );
}

// ─── tool row (run → ok) ───────────────────────────────────────
export function StreamToolRow({
  progress,
  startMs,
  okAtMs,
  icon,
  label,
  path,
  meta,
}: {
  progress: SharedValue<number>;
  startMs: number;
  okAtMs: number;
  icon: IconName;
  label: string;
  path: string;
  meta?: string;
}) {
  const t = useTheme();
  const containerStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [startMs, startMs + POP_MS],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ty = interpolate(
      progress.value,
      [startMs, startMs + POP_MS],
      [6, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY: ty }] };
  });

  const runDot = useAnimatedStyle(() => ({
    opacity: progress.value >= startMs && progress.value < okAtMs ? 1 : 0,
  }));
  const okDot = useAnimatedStyle(() => ({
    opacity: progress.value >= okAtMs ? 1 : 0,
  }));

  return (
    <Animated.View
      style={[
        styles.toolRow,
        { backgroundColor: t.bgElev, borderColor: t.line, borderRadius: radii.sm },
        containerStyle,
      ]}>
      <View style={{ width: 8, height: 8, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[StyleSheet.absoluteFillObject, runDot]}>
          <StatusDot state="run" />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFillObject, okDot]}>
          <StatusDot state="ok" />
        </Animated.View>
      </View>
      <Icon name={icon} size={14} color={t.ink2} />
      <Text style={{ fontFamily: fonts.sansSemiBold, fontSize: 12, color: t.ink }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fonts.mono, fontSize: 12, color: t.ink3 }}>
        {path}
      </Text>
      {meta ? (
        <Text style={{ fontFamily: fonts.sans, fontSize: 12, color: t.ink3 }}>{meta}</Text>
      ) : null}
    </Animated.View>
  );
}

// ─── code line (clip-path style reveal via translateX inside overflow:hidden) ──
export function StreamCodeLine({
  progress,
  startMs,
  durMs,
  sigil,
  text,
}: {
  progress: SharedValue<number>;
  startMs: number;
  durMs: number;
  sigil: '+' | '-' | ' ';
  text: string;
}) {
  const t = useTheme();
  const style = useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [startMs, startMs + durMs],
      [0.4, 1],
      Extrapolation.CLAMP,
    );
    const tx = interpolate(
      progress.value,
      [startMs, startMs + durMs],
      [-300, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateX: tx }] };
  });

  const sigilColor = sigil === '+' ? t.ok : sigil === '-' ? t.err : t.ink3;

  return (
    <View style={styles.codeLineWrap}>
      <Animated.View style={[styles.codeLineInner, style]}>
        <Text style={[styles.codeSigil, { color: sigilColor }]}>{sigil}</Text>
        <Text style={[styles.codeText, { color: t.ink }]}>{text}</Text>
      </Animated.View>
    </View>
  );
}

// ─── helpers for fade-in/out blocks ────────────────────────────
export function useFadeIn(progress: SharedValue<number>, startMs: number) {
  return useAnimatedStyle(() => {
    const opacity = interpolate(
      progress.value,
      [startMs, startMs + FADE_MS],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const ty = interpolate(
      progress.value,
      [startMs, startMs + FADE_MS],
      [4, 0],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY: ty }] };
  });
}

// Status dot pair: working (run) until swapMs, then done (ok).
export function useStatusSwap(progress: SharedValue<number>, swapMs: number) {
  const working = useAnimatedStyle(() => ({ opacity: progress.value < swapMs ? 1 : 0 }));
  const done = useAnimatedStyle(() => ({ opacity: progress.value >= swapMs ? 1 : 0 }));
  return { working, done };
}

// State color for an indicator dot that pulses while running and locks
// to ok at swapMs. Mostly for status strip aesthetics.
export const TIMELINE = streaming;
export type StreamDotState = DotState;

const styles = StyleSheet.create({
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  codeLineWrap: {
    overflow: 'hidden',
    paddingHorizontal: 12,
  },
  codeLineInner: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 1,
  },
  codeSigil: {
    width: 10,
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    lineHeight: 18,
  },
  codeText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 18,
  },
});
