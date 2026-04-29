import { Platform, type ViewStyle } from 'react-native';

// CSS shadows from tokens-v2.css:52-53 / 67-68 don't have a 1:1 RN
// equivalent (RN can't stack two shadows). We approximate with the
// larger of the two layers and let elevation carry Android.

const lightBase: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#14141a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
  },
  android: { elevation: 2 },
  default: {},
})!;

const lightLift: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#14141a',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 40,
  },
  android: { elevation: 8 },
  default: {},
})!;

const darkBase: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  android: { elevation: 2 },
  default: {},
})!;

const darkLift: ViewStyle = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 50,
  },
  android: { elevation: 10 },
  default: {},
})!;

export const lightShadows = { base: lightBase, lift: lightLift } as const;
export const darkShadows = { base: darkBase, lift: darkLift } as const;
export type Shadows = typeof lightShadows;
