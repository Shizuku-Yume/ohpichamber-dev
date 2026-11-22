import { act } from 'react';
import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { buildPairingConnectionPayload, encodePairingConnectionPayload } from '@/lib/connectionPayload';
import { serveTestHttp } from '@/lib/test-http-server';

const capacitorBridge = {};

test.each(['appUrlOpen', 'getLaunchUrl only', 'appUrlOpen before getLaunchUrl'] as const)('mobile reconnect preserves secure headers and confirms pairing once via %s', async (delivery) => {
  const dom = new Window({ url: 'http://localhost' });
  const secrets = new Map<string, string>();
  let authenticated = true;
  const received: string[] = [];
  const pairingRequests: string[] = [];
  let healthRequests = 0;
  let allowPairing = false;
  let pairingStatus = 400;
  let pairingBody: unknown = { error: 'Invalid or expired pairing session' };
  let onAppUrlOpen: ((event: { url: string }) => void) | undefined;
  let launch = Promise.withResolvers<{ url: string } | undefined>();
  let launchRequested = false;
  let confirmations = 0;
  const server = await serveTestHttp((request, response) => {
    if (request.url === '/api/client-auth/pairing/redeem') {
      pairingRequests.push(request.method ?? '');
      response.writeHead(allowPairing ? 200 : pairingStatus, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(allowPairing
        ? { clientToken: 'synthetic-paired-token' }
        : pairingBody));
      return;
    }
    if (request.url === '/health') healthRequests += 1;
    received.push(String(request.headers['x-proxy'] || ''));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.url === '/health' ? { status: 'ok' } : request.method === 'POST'
      ? { sessionToken: 'signed-passwordless-session' } : { authenticated, disabled: authenticated }));
  });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    Capacitor: Object.assign(capacitorBridge, {
      PluginHeaders: [
        { name: 'App', methods: [{ name: 'addListener', rtype: 'callback' }, { name: 'removeListener', rtype: 'callback' }, { name: 'getLaunchUrl', rtype: 'promise' }] },
        { name: 'SecureStorage', methods: ['internalGetItem', 'internalSetItem', 'internalRemoveItem'].map((name) => ({ name, rtype: 'promise' })) },
        { name: 'CapacitorHttp', methods: [{ name: 'request', rtype: 'promise' }] },
      ],
      nativeCallback: (plugin: string, method: string, options: { eventName: string }, callback: (event: { url: string }) => void) => {
        if (plugin === 'App' && options.eventName === 'appUrlOpen') {
          onAppUrlOpen = method === 'addListener' ? callback : undefined;
        }
        return Promise.resolve('fixture-listener');
      },
      nativePromise: async (plugin: string, method: string, options: { prefixedKey: string; data?: unknown; url: string; method?: string; headers: Record<string, string> }) => {
        if (plugin === 'App' && method === 'getLaunchUrl') {
          launchRequested = true;
          return launch.promise;
        }
        if (plugin === 'CapacitorHttp') {
          const response = await fetch(options.url, { method: options.method, body: options.data === undefined ? undefined : JSON.stringify(options.data), headers: options.headers, redirect: 'manual' });
          return { status: response.status, data: await response.text(), headers: {}, url: response.url };
        }
        if (method === 'internalGetItem') return { data: secrets.get(options.prefixedKey) ?? null };
        if (method === 'internalSetItem') { secrets.set(options.prefixedKey, String(options.data || '')); return; }
        secrets.delete(options.prefixedKey);
        return { success: true };
      },
    }),
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  Object.assign(dom, { Capacitor: { isNativePlatform: () => true } });
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { MobileConnectionWelcome } = await import('./MobileConnectionWelcome');
  const { MobileInstancesSurface } = await import('./MobileInstancesSurface');
  const { useDeepLinkSource } = await import('./deepLinkNavigation');
  const { useMobilePairingConfirmation } = await import('./useMobilePairingConfirmation');
  const { upsertMobileConnection, loadMobileConnectionHeaders, loadMobileConnections } = await import('./mobileConnections');
  const { switchRuntimeEndpoint, getRuntimeApiBaseUrl } = await import('@/lib/runtime-switch');
  const { toast } = await import('@/components/ui');
  const { useSessionUIStore } = await import('@/sync/session-ui-store');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const url = server.url.toString().replace(/\/$/, '');
  let connected = 0;
  const onConnected = () => { connected += 1; };
  const PairingLinkReceiver = ({ welcome = false }: { welcome?: boolean }) => {
    const { onPairing, pairingConfirmation } = useMobilePairingConfirmation(onConnected);
    useDeepLinkSource({ ready: false, onPairing: (payload) => {
      confirmations += 1;
      void onPairing(payload);
    } });
    return <>{welcome ? <MobileConnectionWelcome onConnected={onConnected} /> : null}{pairingConfirmation}</>;
  };
  const input = async (selector: string, value: string) => {
    const element = document.querySelector<HTMLInputElement>(selector);
    if (!element) throw new Error(`Missing input ${selector}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  const click = async (selector: string) => {
    const element = document.querySelector<HTMLButtonElement>(selector);
    if (!element) throw new Error(`Missing button ${selector}`);
    await act(async () => element.click());
  };
  const clickText = async (text: string, selector = 'button') => {
    const element = [...document.querySelectorAll<HTMLButtonElement>(selector)].find((button) => button.textContent?.trim() === text);
    if (!element) throw new Error(`Missing button ${text}`);
    await act(async () => element.click());
  };
  const settle = async (done: () => boolean) => {
    for (let attempt = 0; attempt < 100 && !done(); attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    expect(done()).toBe(true);
  };
  try {
    const config = { url, values: { 'x-proxy': 'synthetic-secret' } };
    const saved = (await upsertMobileConnection({ label: 'Protected', candidates: [{ kind: 'direct', url }], requestHeaders: config }))[0];
    await act(async () => root.render(<I18nProvider><MobileConnectionWelcome onConnected={onConnected} /></I18nProvider>));
    await clickText('Connect by address');
    await input('input[type="url"]', url);
    await act(async () => document.querySelector('input[type="url"]')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle(() => connected === 1);
    expect(received.length).toBeGreaterThan(0);
    expect(received.every((header) => header === 'synthetic-secret')).toBe(true);
    expect(await loadMobileConnectionHeaders(saved.id)).toEqual(config);
    expect([...secrets.values()]).toContain('signed-passwordless-session');
    const secretSnapshot = [...secrets.entries()];

    authenticated = false;
    received.length = 0;
    await act(async () => document.querySelector('input[type="url"]')!.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle(() => Boolean(document.querySelector('input[type="password"]')));
    await clickText('Use another server');
    expect(await loadMobileConnectionHeaders(saved.id)).toEqual(config);
    expect([...secrets.entries()]).toEqual(secretSnapshot);
    expect(received.every((header) => header === 'synthetic-secret')).toBe(true);

    await act(async () => root.render(<I18nProvider><MobileInstancesSurface onConnect={onConnected} onActiveConnectionDeleted={() => {}} /></I18nProvider>));
    await settle(() => Boolean(document.querySelector('[aria-label="Actions for Protected"]')));
    expect(document.body.textContent).toContain('Connected · Local network');
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Connect')).toBe(false);
    await click('[aria-label="Actions for Protected"]');
    await clickText('Edit');
    await settle(() => Boolean(document.querySelector('input[value="synthetic-secret"]')));
    await click('[aria-label="Remove header"]');
    expect(document.querySelector('form')!.checkValidity()).toBe(true);
    await click('form button[type="submit"]');
    await settle(() => !document.querySelector('form'));
    expect(await loadMobileConnectionHeaders(saved.id)).toBeUndefined();
    expect((await loadMobileConnections())[0].requestHeadersKey).toBeUndefined();
    expect([...secrets.values()]).toEqual(['signed-passwordless-session']);

    const relay = { relayUrl: 'wss://relay.example/tunnel', serverId: 'relay-only', hostEncPubJwk: { kty: 'EC', crv: 'P-256', x: 'eHhY', y: 'eVlZ' } };
    const relaySaved = (await upsertMobileConnection({ label: 'Relay only', candidates: [{ kind: 'relay', relay }] }))[0];
    await act(async () => root.render(<I18nProvider><MobileInstancesSurface key="relay" onConnect={onConnected} onActiveConnectionDeleted={() => {}} /></I18nProvider>));
    await settle(() => Boolean(document.querySelector('[aria-label="Actions for Relay only"]')));
    await click('[aria-label="Actions for Relay only"]');
    await clickText('Edit');
    await settle(() => Boolean(document.querySelector('form')));
    expect(document.querySelector('form input[type="url"]')).toBeNull();
    expect(document.querySelector('form fieldset')).toBeNull();
    await input('form input', '');
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await settle(() => !document.querySelector('form'));
    const retainedRelay = (await loadMobileConnections()).find((connection) => connection.id === relaySaved.id);
    expect(retainedRelay?.label).toBe('Relay only');
    expect(retainedRelay?.candidates).toEqual([{ kind: 'relay', relay }]);

    await act(async () => root.render(<I18nProvider><MobileConnectionWelcome onConnected={onConnected} /></I18nProvider>));
    await clickText('Connect by address');
    const requestsBeforeMalformedLink = received.length;
    await input('input[type="url"]', 'ohpichamber://connect?v=2&p=malformed');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('Pairing link is invalid or expired. Generate a new one.');
    expect(document.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(true);
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(received).toHaveLength(requestsBeforeMalformedLink);
    expect(pairingRequests).toEqual([]);
    await input('input[type="url"]', url);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.querySelector<HTMLButtonElement>('form button[type="submit"]')?.disabled).toBe(false);
    await input('input[type="url"]', 'ohpichamber://connect?v=2&p=malformed');
    const pairingLink = encodePairingConnectionPayload(buildPairingConnectionPayload({
      pairingId: 'pair_fixture',
      secret: 'synthetic-fixture',
      candidates: [{ type: 'lan', url, priority: 10 }],
    }));
    await input('input[type="url"]', pairingLink);
    await settle(() => document.body.textContent!.includes('Pairing link is invalid or expired. Generate a new one.'));
    expect(pairingRequests).toEqual(['POST']);
    expect(document.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe('');

    pairingStatus = 429;
    await input('input[type="url"]', pairingLink);
    await settle(() => document.body.textContent!.includes('Pairing failed (HTTP 429).'));
    expect(pairingRequests).toEqual(['POST', 'POST']);

    pairingStatus = 200;
    for (const body of [{}, { clientToken: '' }]) {
      await input('input[type="url"]', url);
      pairingBody = body;
      await input('input[type="url"]', pairingLink);
      await settle(() => document.body.textContent!.includes('The server returned an invalid pairing response.'));
    }
    expect(pairingRequests).toHaveLength(4);

    allowPairing = true;
    const connectedBeforeLink = connected;
    await act(async () => root.render(<I18nProvider><PairingLinkReceiver welcome /></I18nProvider>));
    await settle(() => Boolean(onAppUrlOpen) && launchRequested);
    await clickText('Connect by address');
    await input('input[type="url"]', 'http://draft.example');
    const probesBeforeLink = healthRequests;
    expect(confirmations).toBe(0);
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(document.querySelector('#mobile-overlay-root [role="dialog"]')?.classList.contains('z-[60]')).toBe(true);
    await act(async () => {
      if (delivery === 'getLaunchUrl only') launch.resolve({ url: pairingLink });
      else onAppUrlOpen?.({ url: pairingLink });
    });
    expect(confirmations).toBe(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(document.querySelector('[data-slot="dialog-layer"]')?.classList.contains('z-[70]')).toBe(true);
    expect(document.querySelector('[data-slot="dialog-overlay"]')?.classList.contains('z-[70]')).toBe(true);
    expect(document.querySelector('[data-slot="dialog-content"]')?.textContent).toContain(url);
    expect(document.querySelector('[data-slot="dialog-content"]')?.textContent).not.toContain('synthetic-fixture');
    expect(healthRequests).toBe(probesBeforeLink);
    expect(pairingRequests).toHaveLength(4);
    await clickText('Cancel');
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(document.querySelector<HTMLInputElement>('input[type="url"]')?.value).toBe('http://draft.example');
    await click('#mobile-overlay-root [aria-label="Close"]');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pairingRequests).toHaveLength(4);
    expect(connected).toBe(connectedBeforeLink);

    if (delivery !== 'getLaunchUrl only') {
      await act(async () => launch.resolve(delivery === 'appUrlOpen before getLaunchUrl' ? { url: pairingLink } : undefined));
    }
    expect(confirmations).toBe(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(healthRequests).toBe(probesBeforeLink);
    expect(pairingRequests).toHaveLength(4);
    expect(connected).toBe(connectedBeforeLink);

    await act(async () => onAppUrlOpen?.({ url: pairingLink }));
    expect(confirmations).toBe(2);
    await clickText('Connect', '[data-slot="dialog-content"] button');
    await settle(() => connected === connectedBeforeLink + 1);
    expect(pairingRequests).toEqual(['POST', 'POST', 'POST', 'POST', 'POST']);
    expect([...secrets.values()]).toContain('synthetic-paired-token');

    const expiredPayload = {
      ...buildPairingConnectionPayload({
        pairingId: 'pair_expired',
        secret: 'synthetic-expired',
        candidates: [{ type: 'lan', url, priority: 10 }],
      }),
      expiresAt: '2000-01-01T00:00:00.000Z',
    };
    const expiredLink = `ohpichamber://connect?v=2&p=${Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')}`;
    const connectionsBeforeExpired = await loadMobileConnections();
    const endpointBeforeExpired = getRuntimeApiBaseUrl();
    useSessionUIStore.setState({ currentSessionId: 'existing-chat', currentSessionDirectory: '/existing-project' });
    const sessionBeforeExpired = useSessionUIStore.getState();
    const connectedBeforeExpired = connected;
    const requestsBeforeExpired = received.length;
    const toastsBeforeExpired = toast.getHistory().length;
    launch = Promise.withResolvers<{ url: string } | undefined>();
    onAppUrlOpen = undefined;
    launchRequested = false;
    await act(async () => root.render(<I18nProvider><PairingLinkReceiver key="expired" /></I18nProvider>));
    await settle(() => Boolean(onAppUrlOpen) && launchRequested);
    await act(async () => {
      if (delivery === 'getLaunchUrl only') launch.resolve({ url: expiredLink });
      else onAppUrlOpen?.({ url: expiredLink });
    });
    await settle(() => toast.getHistory().length === toastsBeforeExpired + 1);
    expect(toast.getHistory().at(-1)).toMatchObject({ title: 'Pairing link is invalid or expired. Generate a new one.' });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(pairingRequests).toHaveLength(5);
    expect(received).toHaveLength(requestsBeforeExpired);
    expect(connected).toBe(connectedBeforeExpired);
    expect(getRuntimeApiBaseUrl()).toBe(endpointBeforeExpired);
    expect(await loadMobileConnections()).toEqual(connectionsBeforeExpired);
    expect(useSessionUIStore.getState()).toBe(sessionBeforeExpired);
    if (delivery === 'appUrlOpen before getLaunchUrl') {
      await act(async () => launch.resolve({ url: expiredLink }));
      expect(toast.getHistory()).toHaveLength(toastsBeforeExpired + 1);
    }
  } finally {
    await act(async () => root.unmount());
    switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null });
    server.close();
    await dom.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
