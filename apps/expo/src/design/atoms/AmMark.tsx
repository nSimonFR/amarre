import Svg, { Path } from 'react-native-svg';

// atoms.jsx:5-16 — interlocking bowline knot.
export function AmMark({
  size = 24,
  color = 'currentColor',
}: {
  size?: number;
  color?: string;
}) {
  const stroke = 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 8 a4 4 0 1 0 0 8 a4 4 0 1 0 0 -8 z"
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
      />
      <Path
        d="M15 8 a4 4 0 1 1 0 8 a4 4 0 1 1 0 -8 z"
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
      />
      <Path d="M11.6 8.7 L12.4 8.3" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      <Path d="M11.6 15.3 L12.4 15.7" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
    </Svg>
  );
}
