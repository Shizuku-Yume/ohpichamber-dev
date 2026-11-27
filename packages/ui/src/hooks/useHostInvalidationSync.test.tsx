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

// The production mount point both app roots compose, rendered as the roots
// render it: a quota-providers-changed broadcast must reach the quota store's
// targeted refresh through this composition. When the useQuotaProviderSync
// mount is removed from useHostInvalidationSync this test fails — the event
// is emitted and no quota read ever happens.
test('the mounted sync composition drives a provider refetch on quota-providers-changed', async () => {
  const dom = new Window({ url: 'http://host-invalidation-sync.test' });
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
    if (url.pathname === '/api/quota/providers') {
      return Response.json({ providers: ['codex'], nativeToLogical: { 'openai-codex': 'codex' } });
    }
    if (url.pathname === '/api/quota/codex') {
      quotaReads.push('codex');
      return Response.json({
        providerId: 'codex', providerName: 'Codex', ok: true, configured: true, fetchedAt: Date.now(),
        usage: { windows: { '5h': { usedPercent: 10, remainingPercent: 90, windowSeconds: 18000, resetAfterSeconds: null, resetAt: null, resetAtFormatted: null, resetAfterFormatted: null } } },
      });
    }
    // The guest-marks sibling in the composition reads its own endpoint; the
    // promise never resolves so its retry loop cannot interfere here.
    return new Promise<Response>(() => undefined);
  });
  const warn = spyOn(console, 'warn').mockImplementation(() => { });
  const { createRoot } = await import('react-dom/client');
  const { useConfigStore } = await import('@/stores/useConfigStore');
  const { useQuotaStore, useQuotaAutoRefresh } = await import('@/stores/useQuotaStore');
  const { useHostInvalidationSync } = await import('./useHostInvalidationSync');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe() {
    useHostInvalidationSync();
    // The store only refreshes while a quota readout is visible; the Usage
    // surface and Work Status both register through this hook.
    useQuotaAutoRefresh(true);
    return null;
  }
  try {
    useConfigStore.setState({ isInitialized: true, workspaceId: 'ws_mount_sync' });
    useQuotaStore.getState().resetForRuntimeSwitch();
    await act(async () => root.render(<Probe />));
    await act(async () => { });
    await act(async () => { });
    const source = EventSourceFixture.instances[0];
    expect(source).toBeDefined();
    const baselineReads = quotaReads.length;

    await act(async () => source.emit('openchamber:quota-providers-changed', { providerId: 'codex' }));
    await act(async () => { });
    await act(async () => { });
    expect(quotaReads.length).toBeGreaterThan(baselineReads);
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
