import { afterEach, describe, expect, test } from 'bun:test';
import { installRuntimeEndpointReset } from './runtimeEndpointReset';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalFetch = globalThis.fetch;

const installWindow = (): void => {
  const events = new EventTarget();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    },
  });
};

// The switch mints a URL auth token in the background; answer it locally so the
// test never reaches the network.
const stubFetch = (): void => {
  // SAFETY: the endpoint switch only calls fetch(input, init); Bun's extra
  // `preconnect` member is never read.
  globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof fetch;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) {
    Object.defineProperty(globalThis, 'window', originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, 'window');
  }
});

describe('installRuntimeEndpointReset', () => {
  test('resets canonical runtime state when the selected endpoint changes', () => {
    installWindow();
    stubFetch();
    const uninstall = installRuntimeEndpointReset();
    try {
      useConfigStore.setState({ isInitialized: true, isConnected: true });
<<<<<<< HEAD
      switchRuntimeEndpoint({ apiBaseUrl: 'https://remote.example', runtimeKey: 'remote' });

      expect(getRuntimeKey()).toBe('remote');
      expect(useConfigStore.getState()).toMatchObject({ isInitialized: false, isConnected: false, connectionPhase: 'connecting' });
=======
      useUIStore.setState({ customProviderLogos: { acme: { mime: 'image/png', updatedAt: 1 } } });
      switchRuntimeEndpoint({ apiBaseUrl: 'http://127.0.0.1:4100', runtimeKey: 'local' });

      expect(opencodeClient.getBaseUrl().startsWith('http://127.0.0.1:4100')).toBe(true);
      expect(useConfigStore.getState().isInitialized).toBe(false);
      expect(useConfigStore.getState().isConnected).toBe(false);
      // Uploaded logos live on the previous server; one that never stored any omits the key.
      expect(useUIStore.getState().customProviderLogos).toEqual({});
>>>>>>> bc50ba56a
    } finally {
      uninstall();
    }
  });

  test('leaves a same-runtime credential change to App', () => {
    installWindow();
    stubFetch();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://remote.example', runtimeKey: 'remote' });
    const uninstall = installRuntimeEndpointReset();
    try {
      useConfigStore.setState({ isInitialized: true, isConnected: true });
      switchRuntimeEndpoint({ apiBaseUrl: 'https://remote.example', clientToken: 'fresh-token', runtimeKey: 'remote' });

      expect(useConfigStore.getState()).toMatchObject({ isInitialized: true, isConnected: true });
    } finally {
      uninstall();
    }
  });

  test('stops resetting once uninstalled', () => {
    installWindow();
    stubFetch();
    const uninstall = installRuntimeEndpointReset();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://first.example', runtimeKey: 'first' });
    uninstall();
    useConfigStore.setState({ isInitialized: true, isConnected: true });

    switchRuntimeEndpoint({ apiBaseUrl: 'https://second.example', runtimeKey: 'second' });

    expect(useConfigStore.getState()).toMatchObject({ isInitialized: true, isConnected: true });
  });
});
