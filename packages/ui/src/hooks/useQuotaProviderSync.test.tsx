import { act } from 'react';
import { expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

class EventSourceFixture {
  static CLOSED = 2;
  static instances: EventSourceFixture[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { EventSourceFixture.instances.push(this); }
  close() { this.readyState = EventSourceFixture.CLOSED; }
  emit(type: string, properties: { providerId?: string } = {}) { this.onmessage?.({ data: JSON.stringify({ type, properties }) }); }
}

test('quota cards follow Host catalog invalidations and reconnects without losing rows on failure', async () => {
  const dom = new Window({ url: 'http://quota-sync.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    EventSource: EventSourceFixture, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  EventSourceFixture.instances = [];
  let reads = 0;
  let fail = false;
  let empty = false;
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const path = new URL(input instanceof Request ? input.url : String(input), dom.location.href).pathname;
    if (path !== '/api/quota/extensions') return Response.json({});
    reads += 1;
    if (fail) return Response.json({ error: 'Catalog unavailable' }, { status: 503 });
    return Response.json({ extensions: empty ? [] : [{ id: 'ext-ci', name: 'CI', icon: 'gauge', guestId: 'ci' }] });
  });
  const warn = spyOn(console, 'warn').mockImplementation(() => { });
  const { createRoot } = await import('react-dom/client');
  const { useQuotaStore } = await import('@/stores/useQuotaStore');
  const { useQuotaProviderSync } = await import('./useQuotaProviderSync');
  const refreshAfterCredentialChange = useQuotaStore.getState().refreshAfterCredentialChange;
  const refreshProviderAfterChange = useQuotaStore.getState().refreshProviderAfterChange;
  const refresh = spyOn(useQuotaStore.getState(), 'refreshAfterCredentialChange').mockResolvedValue();
  const refreshProvider = spyOn(useQuotaStore.getState(), 'refreshProviderAfterChange').mockResolvedValue();
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe() { useQuotaProviderSync(); return null; }
  const ids = () => useQuotaStore.getState().extensionProviders.map((provider) => provider.id);
  try {
    await act(async () => root.render(<Probe />));
    expect(reads).toBe(0);
    const source = EventSourceFixture.instances[0];
    await act(async () => source.emit('openchamber:terminal-sessions-changed'));
    expect(reads).toBe(0);
    // A scoped extension usage-provider announcement refreshes the extension
    // providers and the provider's own card.
    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'ext-ci' }));
    expect(reads).toBe(1);
    expect(ids()).toEqual(['ext-ci']);
    expect(refreshProvider).toHaveBeenCalledTimes(1);
    expect(refreshProvider).toHaveBeenLastCalledWith('ext-ci');
    // The same envelope without its scope is malformed and ignored.
    await act(async () => source.emit('openchamber:quota-providers-changed'));
    expect(reads).toBe(1);
    await act(async () => source.emit('openchamber:guests-changed'));
    expect(reads).toBe(2);
    fail = true;
    await act(async () => source.emit('openchamber:guests-changed'));
    expect(reads).toBe(3);
    expect(ids()).toEqual(['ext-ci']);
    expect(warn).toHaveBeenCalled();
    fail = false;
    empty = true;
    await act(async () => source.emit('openchamber:event-stream-ready'));
    expect(reads).toBe(4);
    expect(ids()).toEqual([]);
    expect(refresh).toHaveBeenCalledTimes(1);
    // A scoped built-in provider announcement refreshes only that provider's
    // card; the extension list is not read again.
    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'claude' }));
    expect(refreshProvider).toHaveBeenCalledTimes(2);
    expect(refreshProvider).toHaveBeenLastCalledWith('claude');
    expect(reads).toBe(4);
    await act(async () => root.unmount());
    source.emit('openchamber:guests-changed');
    expect(reads).toBe(4);
  } finally {
    await act(async () => root.unmount());
    useQuotaStore.getState().resetForRuntimeSwitch();
    refresh.mockRestore();
    useQuotaStore.setState({ refreshAfterCredentialChange, refreshProviderAfterChange });
    refreshProvider.mockRestore();
    fetch.mockRestore();
    warn.mockRestore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});

test('a scoped built-in provider announcement refetches that provider through the real store', async () => {
  const dom = new Window({ url: 'http://quota-sync-scoped.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    EventSource: EventSourceFixture, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  EventSourceFixture.instances = [];
  const quotaReads: string[] = [];
  let providerListReads = 0;
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), dom.location.href);
    if (url.pathname === '/api/quota/extensions') return Response.json({ extensions: [] });
    if (url.pathname === '/api/quota/providers') {
      providerListReads += 1;
      return Response.json({ providers: ['claude'], nativeToLogical: { anthropic: 'claude' } });
    }
    if (url.pathname === '/api/quota/claude') {
      quotaReads.push('claude');
      return Response.json({
        providerId: 'claude', providerName: 'Claude', ok: true, configured: true, fetchedAt: Date.now(),
        usage: { windows: { '5h': { usedPercent: 10, remainingPercent: 90, windowSeconds: 18000, resetAfterSeconds: null, resetAt: null, resetAtFormatted: null, resetAfterFormatted: null } } },
      });
    }
    return Response.json({});
  });
  const warn = spyOn(console, 'warn').mockImplementation(() => { });
  const { createRoot } = await import('react-dom/client');
  const { useConfigStore } = await import('@/stores/useConfigStore');
  const { useQuotaStore, useQuotaAutoRefresh } = await import('@/stores/useQuotaStore');
  const { useQuotaProviderSync } = await import('./useQuotaProviderSync');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe() { useQuotaProviderSync(); useQuotaAutoRefresh(true); return null; }
  try {
    useConfigStore.setState({ isInitialized: true, workspaceId: 'ws_scoped_sync' });
    useQuotaStore.getState().resetForRuntimeSwitch();
    await act(async () => root.render(<Probe />));
    await act(async () => { });
    await act(async () => { });
    const source = EventSourceFixture.instances[0];
    expect(source).toBeDefined();
    const baselineListReads = providerListReads;
    const baselineReads = quotaReads.length;

    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'claude' }));
    await act(async () => { });
    await act(async () => { });
    expect(quotaReads.length).toBeGreaterThan(baselineReads);

    // An unknown provider id announces nothing the store can act on: no fetch.
    const beforeUnknown = quotaReads.length;
    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'teapot' }));
    await act(async () => { });
    await act(async () => { });
    expect(quotaReads.length).toBe(beforeUnknown);
    expect(providerListReads).toBeGreaterThanOrEqual(baselineListReads);
  } finally {
    await act(async () => root.unmount());
    useQuotaStore.getState().resetForRuntimeSwitch();
    useConfigStore.setState({ isInitialized: false, workspaceId: '' });
    fetch.mockRestore();
    warn.mockRestore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});

test('a narrowed dropdown subset does not drop a built-in provider announcement', async () => {
  const dom = new Window({ url: 'http://quota-sync-narrowed.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node, Event: dom.Event, CustomEvent: dom.CustomEvent,
    EventSource: EventSourceFixture, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  EventSourceFixture.instances = [];
  const quotaReads: string[] = [];
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), dom.location.href);
    if (url.pathname === '/api/quota/extensions') return Response.json({ extensions: [] });
    if (url.pathname === '/api/quota/providers') return Response.json({ providers: ['claude', 'codex'], nativeToLogical: {} });
    if (url.pathname === '/api/quota/claude' || url.pathname === '/api/quota/codex') {
      const id = url.pathname.endsWith('claude') ? 'claude' : 'codex';
      quotaReads.push(id);
      return Response.json({
        providerId: id, providerName: id, ok: true, configured: true, fetchedAt: Date.now(),
        usage: { windows: { '5h': { usedPercent: 10, remainingPercent: 90, windowSeconds: 18000, resetAfterSeconds: null, resetAt: null, resetAtFormatted: null, resetAfterFormatted: null } } },
      });
    }
    return Response.json({});
  });
  const warn = spyOn(console, 'warn').mockImplementation(() => { });
  const { createRoot } = await import('react-dom/client');
  const { useConfigStore } = await import('@/stores/useConfigStore');
  const { useQuotaStore, useQuotaAutoRefresh } = await import('@/stores/useQuotaStore');
  const { useQuotaProviderSync } = await import('./useQuotaProviderSync');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe() { useQuotaProviderSync(); useQuotaAutoRefresh(true); return null; }
  try {
    useConfigStore.setState({ isInitialized: true, workspaceId: 'ws_narrowed_sync' });
    useQuotaStore.getState().resetForRuntimeSwitch();
    // The user once narrowed the header dropdown to codex only; claude has no
    // card data yet, so neither gate half covers it.
    useQuotaStore.setState({ savedDropdownProviderIds: ['codex'], dropdownProviderIds: ['codex'], results: [] });
    await act(async () => root.render(<Probe />));
    await act(async () => { });
    await act(async () => { });
    const source = EventSourceFixture.instances[0];
    const claudeBefore = quotaReads.filter((id) => id === 'claude').length;

    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'claude' }));
    await act(async () => { });
    await act(async () => { });
    expect(quotaReads.filter((id) => id === 'claude').length).toBeGreaterThan(claudeBefore);
  } finally {
    await act(async () => root.unmount());
    useQuotaStore.getState().resetForRuntimeSwitch();
    useConfigStore.setState({ isInitialized: false, workspaceId: '' });
    fetch.mockRestore();
    warn.mockRestore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
