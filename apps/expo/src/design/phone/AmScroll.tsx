import { type ReactNode } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

// phone.jsx:78-84 — scrollable body. RN's ScrollView already does
// momentum on iOS and pan on Android; no -webkit-overflow-scrolling
// equivalent needed.
export function AmScroll({
  children,
  contentContainerStyle,
  ...rest
}: { children: ReactNode } & ScrollViewProps) {
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingBottom: 32 }, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
      {...rest}>
      {children}
    </ScrollView>
  );
}
