import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// am-breathe keyframe (tokens-v2.css:127-130) — scale 1 → 1.08,
// opacity 0.45 → 0.85, 2.4s ease-in-out, infinite.
export function useBreathe(active = true) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(t);
  }, [active, t]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: 1 + t.value * 0.08 }],
    opacity: 0.45 + t.value * 0.4,
  }));
}
