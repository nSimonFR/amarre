import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'amarre.settings.v1';

export type Scheme = 'wss' | 'ws';

export type Settings = {
  host: string;
  port: string;
  scheme: Scheme;
};

export function settingsToUrl(s: Settings): string {
  return `${s.scheme}://${s.host}:${s.port}/`;
}

export async function loadSettings(): Promise<Settings | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (typeof parsed.host !== 'string' || typeof parsed.port !== 'string') return null;
    const scheme: Scheme = parsed.scheme === 'ws' ? 'ws' : 'wss';
    return { host: parsed.host, port: parsed.port, scheme };
  } catch {
    return null;
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export async function clearSettings(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
