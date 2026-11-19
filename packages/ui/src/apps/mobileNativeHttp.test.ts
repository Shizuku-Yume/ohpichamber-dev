import { expect, test } from 'bun:test';
import type { HttpOptions } from '@capacitor/core';
import { serveTestHttp } from '@/lib/test-http-server';

test('native connection checks disable redirects and keep the browser fallback closed', async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalCapacitor = Object.getOwnPropertyDescriptor(globalThis, 'Capacitor');
  let targetRequests = 0;
  let failNative = false;
  let bootstrap: unknown = { sessionToken: 'signed-passwordless-session' };
  let bootstrapStatus = 200;
  let failStorage = false;
  let sessionExpired = false;
  const secrets = new Map<string, string>();
  const metadata = new Map<string, string>();
  const target = await serveTestHttp((_request, response) => {
    targetRequests += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ authenticated: true }));
  });
  const source = await serveTestHttp((_request, response) => {
    response.writeHead(302, { Location: target.url.toString() });
    response.end();
  });
  Object.defineProperty(globalThis, 'Capacitor', { configurable: true, writable: true, value: {
    PluginHeaders: [
      { name: 'CapacitorHttp', methods: [{ name: 'request', rtype: 'promise' }] },
      { name: 'SecureStorage', methods: ['internalGetItem', 'internalSetItem', 'internalRemoveItem'].map(name => ({ name, rtype: 'promise' })) },
    ],
    nativePromise: async (plugin: string, method: string, options: HttpOptions & { prefixedKey: string; data: string }) => {
      if (plugin === 'SecureStorage') {
        if (method === 'internalGetItem') return { data: secrets.get(options.prefixedKey) ?? null };
        if (failStorage) throw new Error('Secure storage unavailable');
        if (method === 'internalSetItem') secrets.set(options.prefixedKey, options.data);
        else secrets.delete(options.prefixedKey);
        return { success: true };
      }
      if (options.url.startsWith('https://passwordless.example')) {
        if (options.method === 'POST') {
          expect(options.data).toEqual({ issueSessionToken: true, trustDevice: true });
          return { status: bootstrapStatus, data: bootstrap };
        }
        return { status: sessionExpired && new Headers(options.headers).has('Authorization') ? 401 : 200, data: { authenticated: !sessionExpired, disabled: true } };
      }
      if (failNative) throw new Error('Native transport unavailable');
      const response = await fetch(options.url, {
        headers: options.headers, redirect: options.disableRedirects ? 'manual' : 'follow',
      });
      return { status: response.status, data: await response.text(), headers: {}, url: response.url };
    },
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    Capacitor: { isNativePlatform: () => true }, location: { protocol: 'capacitor:' },
    setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis),
    localStorage: { getItem: (key: string) => metadata.get(key) ?? null, setItem: (key: string, value: string) => metadata.set(key, value) },
    dispatchEvent: () => true,
  } });
  try {
    const { validateMobileConnectionSession } = await import('./mobileConnections');
    const url = source.url.toString().replace(/\/$/, '');
    const input = { url, requestHeaders: { url, values: { 'X-Proxy-Secret': 'synthetic-only' } } };
    expect(await validateMobileConnectionSession(input)).toBe(false);
    expect(targetRequests).toBe(0);
    failNative = true;
    expect(await validateMobileConnectionSession(input)).toBe(false);
    expect(targetRequests).toBe(0);
    failNative = false;
    expect(await validateMobileConnectionSession({ url })).toBe(true);
    expect(targetRequests).toBe(2);

    const { autoConnectLastInstance, upsertMobileConnection, loadMobileConnections, reprobeActiveConnection } = await import('./mobileConnections');
    const { getRuntimeBearerTokenSync } = await import('@/lib/runtime-auth');
    const { switchRuntimeEndpoint } = await import('@/lib/runtime-switch');
    await upsertMobileConnection({ label: 'Passwordless', candidates: [{ kind: 'direct', url: 'https://passwordless.example' }] });
    expect(await autoConnectLastInstance({ fast: false })).toEqual({ status: 'connected' });
    expect(getRuntimeBearerTokenSync()).toBe('signed-passwordless-session');
    expect((await loadMobileConnections())[0].hasToken).toBe(true);
    expect(JSON.stringify([...metadata.values()])).not.toContain('signed-passwordless-session');
    expect([...secrets.values()]).toContain('signed-passwordless-session');
    sessionExpired = true;
    expect(await autoConnectLastInstance({ fast: false })).toEqual({ status: 'connected' });
    bootstrap = { sessionToken: 'renewed-passwordless-session' };
    expect(await reprobeActiveConnection({ fast: false })).toBe('switched');
    expect(getRuntimeBearerTokenSync()).toBe('renewed-passwordless-session');
    expect([...secrets.values()]).toContain('renewed-passwordless-session');
    bootstrap = { sessionToken: 'signed-passwordless-session' };
    sessionExpired = false;
    switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null });
    for (const result of [{ sessionToken: '' }, {}, null]) {
      bootstrap = result;
      metadata.clear();
      secrets.clear();
      await upsertMobileConnection({ label: 'Passwordless', candidates: [{ kind: 'direct', url: 'https://passwordless.example' }] });
      expect(await autoConnectLastInstance({ fast: false })).toEqual({ status: 'unreachable', label: 'Passwordless' });
      expect(getRuntimeBearerTokenSync()).toBe('');
    }
    bootstrap = { sessionToken: 'signed-passwordless-session' };
    bootstrapStatus = 503;
    expect(await autoConnectLastInstance({ fast: false })).toEqual({ status: 'unreachable', label: 'Passwordless' });
    bootstrapStatus = 200;
    failStorage = true;
    expect(await autoConnectLastInstance({ fast: false })).toEqual({ status: 'unreachable', label: 'Passwordless' });
    expect((await loadMobileConnections())[0].hasToken).toBe(false);
  } finally {
    source.close();
    target.close();
    for (const [name, descriptor] of [['window', originalWindow], ['Capacitor', originalCapacitor]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
