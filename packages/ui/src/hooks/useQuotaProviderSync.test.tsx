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
  emit(type: string) { this.onmessage?.({ data: JSON.stringify({ type, properties: {} }) }); }
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
  const warn = spyOn(console, 'warn').mockImplementation(() => {});
  const { createRoot } = await import('react-dom/client');
  const { useQuotaStore } = await import('@/stores/useQuotaStore');
  const { useQuotaProviderSync } = await import('./useQuotaProviderSync');
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  function Probe() { useQuotaProviderSync(); return null; }
  const ids = () => useQuotaStore.getState().extensionProviders.map((provider) => provider.id);
  try {
    await act(async () => root.render(<Probe />));
    expect(reads).toBe(0);
    const source = EventSourceFixture.instances[0];
    await act(async () => source.emit('openchamber:terminal-sessions-changed'));
    expect(reads).toBe(0);
    await act(async () => source.emit('openchamber:guests-changed'));
    expect(reads).toBe(1);
    expect(ids()).toEqual(['ext-ci']);
    fail = true;
    await act(async () => source.emit('openchamber:guests-changed'));
    expect(reads).toBe(2);
    expect(ids()).toEqual(['ext-ci']);
    expect(warn).toHaveBeenCalled();
    fail = false;
    empty = true;
    await act(async () => source.emit('openchamber:event-stream-ready'));
    expect(reads).toBe(3);
    expect(ids()).toEqual([]);
    await act(async () => root.unmount());
    source.emit('openchamber:guests-changed');
    expect(reads).toBe(3);
  } finally {
    await act(async () => root.unmount());
    useQuotaStore.getState().resetForRuntimeSwitch();
    fetch.mockRestore();
    warn.mockRestore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
