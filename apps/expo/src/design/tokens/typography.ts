// Font families match tokens-v2.css:20-22. Names are the loaded keys
// from @expo-google-fonts packages — see app/_layout.tsx useFonts().

export const fonts = {
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemiBold: 'JetBrainsMono_600SemiBold',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const sizes = {
  xs: 10,
  sm: 11,
  body: 13,
  lg: 15,
  title: 17,
  display: 28,
} as const;
