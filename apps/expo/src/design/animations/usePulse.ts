import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// am-pulse keyframe (tokens-v2.css:104-107) — expanding box-shadow halo
// around an 8px dot. RN can't animate box-shadow, so we ride opacity
// + scale on a sibling ring view. Returns the animated style for that
// ring; the dot itself stays static.
export function usePulse(active = true) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(t);
  }, [active, t]);

  return useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - t.value),
    transform: [{ scale: 1 + t.value * 1.6 }],
  }));
}
