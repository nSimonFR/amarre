import { beforeEach, describe, expect, mock, test } from 'bun:test';

import { type Settings } from '../persistence/settings';
import {
  LAST_TOKEN_KEY,
  registerForPushAsync,
  type PushDeps,
} from './register';

const settings: Settings = { host: 'rpi5.test', port: '8343', scheme: 'wss' };
const expectedUrl = 'https://rpi5.test:8343/push/tokens';
const fakeToken = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

function makeDeps(over: Partial<PushDeps> = {}): PushDeps {
  const ok = (status = 201) => mock(() => Promise.resolve(new Response('{}', { status })));
  const granted = (): Promise<'granted'> => Promise.resolve('granted');
  return {
    isWeb: () => false,
    isDevice: () => true,
    isExpoGo: () => false,
    getProjectId: () => 'fake-project-id',
    ensureChannel: mock(() => Promise.resolve()),
    getPermission: mock(granted),
    requestPermission: mock(granted),
    getExpoPushToken: mock((_p: string | null) => Promise.resolve(fakeToken)),
    getDeviceName: () => 'iPhone Test',
    getPlatform: () => 'ios',
    fetchImpl: ok(),
    storage: {
      getItem: mock(() => Promise.resolve(null as string | null)),
      setItem: mock(() => Promise.resolve()),
    },
    log: mock(() => {}),
    ...over,
  };
}

describe('registerForPushAsync', () => {
  beforeEach(() => {
    // each test builds fresh mocks; nothing shared.
  });

  test('skips on web platform without touching native APIs or fetch', async () => {
    const deps = makeDeps({ isWeb: () => true });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'skipped', reason: 'web' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.getExpoPushToken).not.toHaveBeenCalled();
    expect(deps.storage.setItem).not.toHaveBeenCalled();
  });

  test('skips on simulator (Device.isDevice false)', async () => {
    const deps = makeDeps({ isDevice: () => false });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'skipped', reason: 'simulator' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  test('skips when projectId is missing or stub-prefixed', async () => {
    const undef = await registerForPushAsync(settings, makeDeps({ getProjectId: () => undefined }));
    expect(undef).toEqual({ kind: 'skipped', reason: 'no-project-id' });

    const stub = await registerForPushAsync(
      settings,
      makeDeps({ getProjectId: () => 'TODO-eas-project-id' }),
    );
    expect(stub).toEqual({ kind: 'skipped', reason: 'no-project-id' });
  });

  test('Expo Go: registers without projectId (anonymous Expo project)', async () => {
    const deps = makeDeps({ isExpoGo: () => true, getProjectId: () => undefined });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'ok', token: fakeToken });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const arg = (deps.getExpoPushToken as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(arg).toBeNull();
  });

  test('Expo Go: TODO stub still allowed (passes null to getExpoPushToken)', async () => {
    const deps = makeDeps({ isExpoGo: () => true, getProjectId: () => 'TODO-eas-project-id' });
    const r = await registerForPushAsync(settings, deps);
    expect(r.kind).toBe('ok');
    const arg = (deps.getExpoPushToken as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(arg).toBeNull();
  });

  test('dev build: real projectId is forwarded to getExpoPushToken', async () => {
    const deps = makeDeps({ isExpoGo: () => false, getProjectId: () => 'real-eas-id-abc' });
    const r = await registerForPushAsync(settings, deps);
    expect(r.kind).toBe('ok');
    const arg = (deps.getExpoPushToken as ReturnType<typeof mock>).mock.calls[0]?.[0];
    expect(arg).toBe('real-eas-id-abc');
  });

  test('skips on permission denial without registering or POSTing', async () => {
    const undetermined = (): Promise<'undetermined'> => Promise.resolve('undetermined');
    const denied = (): Promise<'denied'> => Promise.resolve('denied');
    const deps = makeDeps({
      getPermission: mock(undetermined),
      requestPermission: mock(denied),
    });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'skipped', reason: 'permission-denied' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.getExpoPushToken).not.toHaveBeenCalled();
    expect(deps.storage.setItem).not.toHaveBeenCalled();
  });

  test('happy path: ensures channel on android, POSTs token, persists last registration', async () => {
    const deps = makeDeps({ getPlatform: () => 'android' });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'ok', token: fakeToken });
    expect(deps.ensureChannel).toHaveBeenCalledTimes(1);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (deps.fetchImpl as ReturnType<typeof mock>).mock.calls[0]!;
    expect(url).toBe(expectedUrl);
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init!.body as string);
    expect(body).toEqual({ token: fakeToken, platform: 'android', deviceName: 'iPhone Test' });
    expect(deps.storage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = (deps.storage.setItem as ReturnType<typeof mock>).mock.calls[0]!;
    expect(key).toBe(LAST_TOKEN_KEY);
    expect(JSON.parse(value as string)).toEqual({
      token: fakeToken,
      base: 'https://rpi5.test:8343',
    });
  });

  test('iOS happy path skips android channel setup', async () => {
    const deps = makeDeps();
    const r = await registerForPushAsync(settings, deps);
    expect(r.kind).toBe('ok');
    expect(deps.ensureChannel).not.toHaveBeenCalled();
  });

  test('retries POST once on first failure then succeeds', async () => {
    let calls = 0;
    const deps = makeDeps({
      fetchImpl: mock(() => {
        calls++;
        if (calls === 1) return Promise.resolve(new Response('boom', { status: 500 }));
        return Promise.resolve(new Response('{}', { status: 201 }));
      }),
    });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'ok', token: fakeToken });
    expect(calls).toBe(2);
    expect(deps.storage.setItem).toHaveBeenCalledTimes(1);
  });

  test('returns ok and persists even when POST fails twice (best-effort)', async () => {
    const deps = makeDeps({
      fetchImpl: mock(() => Promise.resolve(new Response('boom', { status: 500 }))),
    });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'ok', token: fakeToken });
    expect((deps.fetchImpl as ReturnType<typeof mock>).mock.calls.length).toBe(2);
    expect(deps.storage.setItem).toHaveBeenCalledTimes(1);
    expect(deps.log).toHaveBeenCalled();
  });

  test('returns error when getExpoPushToken throws', async () => {
    const deps = makeDeps({
      getExpoPushToken: mock(() => Promise.reject(new Error('expo down'))),
    });
    const r = await registerForPushAsync(settings, deps);
    expect(r).toEqual({ kind: 'error', message: 'expo down' });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(deps.storage.setItem).not.toHaveBeenCalled();
  });
});
