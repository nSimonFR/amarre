// Default PushDeps backed by real Expo + React Native modules.
// Imported only by app-side wiring (AmarreProvider, Connect screen). Tests
// import register.ts directly with synthetic deps to avoid loading these.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { type Settings } from '../persistence/settings';
import {
  registerForPushAsync as core,
  type PushDeps,
  type PermissionStatus,
  type RegisterResult,
} from './register';

function toStatus(s: Notifications.PermissionStatus): PermissionStatus {
  if (s === 'granted') return 'granted';
  if (s === 'denied') return 'denied';
  return 'undetermined';
}

const expoDeps: PushDeps = {
  isWeb: () => Platform.OS === 'web',
  isDevice: () => Device.isDevice,
  getProjectId: () => {
    const fromExtra = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const fromEas = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    return fromExtra ?? fromEas;
  },
  ensureChannel: async () => {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  },
  getPermission: async () => toStatus((await Notifications.getPermissionsAsync()).status),
  requestPermission: async () =>
    toStatus((await Notifications.requestPermissionsAsync()).status),
  getExpoPushToken: async (projectId) =>
    (await Notifications.getExpoPushTokenAsync({ projectId })).data,
  getDeviceName: () => Device.deviceName ?? undefined,
  getPlatform: () => Platform.OS as 'ios' | 'android' | 'web',
  fetchImpl: (...args) => fetch(...args),
  storage: {
    getItem: (k) => AsyncStorage.getItem(k),
    setItem: (k, v) => AsyncStorage.setItem(k, v),
  },
  log: (msg, ...args) => console.warn(`[push] ${msg}`, ...args),
};

export function registerForPushAsync(settings: Settings): Promise<RegisterResult> {
  return core(settings, expoDeps);
}
