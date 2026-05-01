import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AmarreProvider } from '../src/lib/AmarreProvider';
import { PermissionSheet } from '../src/screens/_parts/PermissionSheet';
import { ThemeProvider } from '../src/design/theme/ThemeProvider';
import { useTheme } from '../src/design/theme/useTheme';

function Root() {
  const t = useTheme();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <AmarreProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.bg },
            animation: 'fade',
          }}
        />
        <PermissionSheet />
      </AmarreProvider>
    </GestureHandlerRootView>
  );
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function routeFromResponse(resp: Notifications.NotificationResponse | null) {
  if (!resp) return;
  const data = resp.notification.request.content.data as
    | { amarre?: string; sessionId?: string; trigger?: string }
    | undefined;
  if (!data || data.amarre !== '1' || !data.sessionId) return;
  router.push(`/sessions/${data.sessionId}` as never);
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    InstrumentSerif_400Regular_Italic,
  });

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(routeFromResponse).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(routeFromResponse);
    return () => sub.remove();
  }, []);

  if (!loaded) return null;

  return (
    <ThemeProvider override="auto">
      <Root />
    </ThemeProvider>
  );
}
