// Pure registration logic for amarre push tokens (PROTOCOL §13).
// Side-effecting deps (expo-notifications, expo-device, expo-constants,
// react-native Platform, AsyncStorage, fetch) are injected via PushDeps so
// this module loads cleanly under bun test without a React Native runtime.

import { httpBaseUrl, type Settings } from '../persistence/settings';

export type PermissionStatus = 'granted' | 'denied' | 'undetermined';

export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export interface PushDeps {
  isWeb: () => boolean;
  isDevice: () => boolean;
  getProjectId: () => string | undefined;
  ensureChannel: () => Promise<void>;
  getPermission: () => Promise<PermissionStatus>;
  requestPermission: () => Promise<PermissionStatus>;
  getExpoPushToken: (projectId: string) => Promise<string>;
  getDeviceName: () => string | undefined;
  getPlatform: () => 'ios' | 'android' | 'web';
  fetchImpl: FetchImpl;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  };
  log: (msg: string, ...args: unknown[]) => void;
}

export type RegisterResult =
  | { kind: 'ok'; token: string }
  | { kind: 'skipped'; reason: 'web' | 'simulator' | 'no-project-id' | 'permission-denied' }
  | { kind: 'error'; message: string };

export const LAST_TOKEN_KEY = 'amarre.push.lastToken.v1';

export async function registerForPushAsync(
  settings: Settings,
  deps: PushDeps,
): Promise<RegisterResult> {
  if (deps.isWeb()) return { kind: 'skipped', reason: 'web' };
  if (!deps.isDevice()) return { kind: 'skipped', reason: 'simulator' };

  const projectId = deps.getProjectId();
  if (!projectId || projectId.startsWith('TODO')) {
    deps.log('no EAS projectId configured — skipping push registration');
    return { kind: 'skipped', reason: 'no-project-id' };
  }

  if (deps.getPlatform() === 'android') {
    await deps.ensureChannel();
  }

  let status = await deps.getPermission();
  if (status !== 'granted') status = await deps.requestPermission();
  if (status !== 'granted') return { kind: 'skipped', reason: 'permission-denied' };

  let token: string;
  try {
    token = await deps.getExpoPushToken(projectId);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  await postTokenBestEffort(settings, token, deps);

  try {
    await deps.storage.setItem(
      LAST_TOKEN_KEY,
      JSON.stringify({ token, base: httpBaseUrl(settings) }),
    );
  } catch {
    // Storage is best-effort cache; ignore failures.
  }

  return { kind: 'ok', token };
}

async function postTokenBestEffort(
  settings: Settings,
  token: string,
  deps: PushDeps,
): Promise<void> {
  const url = `${httpBaseUrl(settings)}/push/tokens`;
  const body = JSON.stringify({
    token,
    platform: deps.getPlatform(),
    deviceName: deps.getDeviceName(),
  });
  const attempt = async () => {
    const r = await deps.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  };
  try {
    await attempt();
  } catch {
    try {
      await attempt();
    } catch (e) {
      deps.log('register POST failed (best-effort):', e instanceof Error ? e.message : e);
    }
  }
}

export async function getLastRegistration(
  deps: Pick<PushDeps, 'storage'>,
): Promise<{ token: string; base: string } | null> {
  try {
    const raw = await deps.storage.getItem(LAST_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; base?: unknown };
    if (typeof parsed.token === 'string' && typeof parsed.base === 'string') {
      return { token: parsed.token, base: parsed.base };
    }
    return null;
  } catch {
    return null;
  }
}
