import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// am-spin keyframe (atoms.jsx:101) — 360° rotation, 2s linear, infinite.
export function useSpin(active = true, durationMs = 2000) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [active, durationMs, t]);

  return useAnimatedStyle(() => ({
    transform: [{ rotate: `${t.value * 360}deg` }],
  }));
}
