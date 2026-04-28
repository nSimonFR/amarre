import { useEffect } from 'react';
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { streaming } from '../tokens/motion';

// Single shared value 0 → loopMs, looping linearly. All animated
// pieces in the Streaming screen read from this so phases stay
// in lockstep.
export function useStreamingTimeline(): SharedValue<number> {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(streaming.loopMs, { duration: streaming.loopMs, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  return progress;
}
