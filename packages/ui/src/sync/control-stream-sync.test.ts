import { expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import { getRuntimeKey } from '@/lib/runtime-switch';

class EventSourceFixture {
  static CLOSED = 2;
  static instances: EventSourceFixture[] = [];
  readyState = 1;
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) { EventSourceFixture.instances.push(this); }
  close() { this.readyState = EventSourceFixture.CLOSED; }
}

// The control stream is the one every client opens, whatever carries its main
// events (WebSocket, SSE, the desktop's fallback), so the toast comes from it.
// Loaded the way the app loads it: through the sync context, which this
// module's own imports lead back to.
await import('./sync-context');
const { subscribeControlStreamSync } = await import('./control-stream-sync');
const { toast } = await import('@/components/ui');

test('toasts an answer to a shared page from the control stream, and nothing else', () => {
  const dom = new Window({ url: 'http://control.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({ window: dom, document: dom.document, EventSource: EventSourceFixture })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const toasts: string[] = [];
  const shown = spyOn(toast, 'info').mockImplementation((title, options) => {
    toasts.push(`${title}|${options?.id}`);
    return options?.id ?? 'notification';
  });
  const unsubscribe = subscribeControlStreamSync(getRuntimeKey());
  try {
    const source = EventSourceFixture.instances.at(-1);
    const emit = (properties: { kind: string; title: string; tag: string; sessionId?: string; directory?: string; toastOnly?: boolean }) => source?.onmessage?.({ data: JSON.stringify({ type: 'openchamber:notification', properties }) });
    emit({ kind: 'share-answer', title: 'Yulia answered “Schema”', tag: 'share-ses_1', sessionId: 'ses_1', directory: '/repo', toastOnly: true });
    emit({ kind: 'ready', title: 'Done', tag: 'ready-ses_1' });
    expect(toasts).toEqual(['Yulia answered “Schema”|share-ses_1']);
  } finally {
    unsubscribe();
    shown.mockRestore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
