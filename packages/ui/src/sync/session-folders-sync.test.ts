import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { subscribeSessionFoldersSync } from './session-folders-sync';

// The real runtime switch drives the runtime key: a module mock of
// @/lib/runtime-switch would survive this file in the shared worker process
// and break every other suite's staleness detection. The event stream and the
// folder-store handlers are injected through the sync module's own seams.
let reads = 0;
type SyncDeps = NonNullable<Parameters<typeof subscribeSessionFoldersSync>[1]>;
type SyncSubscribeEvents = NonNullable<SyncDeps['subscribeEvents']>;
type SyncEvent = Parameters<Parameters<SyncSubscribeEvents>[0]>[0];
let emit: (event: SyncEvent) => void = () => {};
const subscribeEvents: SyncSubscribeEvents = (listener) => {
  emit = listener;
  return () => { emit = () => {}; };
};
const handlers = {
  onFoldersChanged: () => {},
  onStreamReady: () => { reads += 1; },
  subscribeEvents,
};

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalRuntimeKey = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
const fakeWindow = new EventTarget();
const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' });
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: fakeWindow });
Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: fakeDocument });
const restoreGlobal = (key: 'window' | 'document', descriptor: PropertyDescriptor | undefined) => {
  if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  else Reflect.deleteProperty(globalThis, key);
};
afterAll(() => {
  restoreGlobal('window', originalWindow);
  restoreGlobal('document', originalDocument);
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntimeKey });
});

const useRuntime = (runtimeKey: string) => {
  switchRuntimeEndpoint({ apiBaseUrl: `https://folders-${runtimeKey}.test`, runtimeKey });
};

describe('subscribeSessionFoldersSync', () => {
  let unsubscribe: () => void = () => {};
  const originalNow = Date.now;
  let now = 1_000_000;

  beforeEach(() => {
    unsubscribe();
    reads = 0;
    useRuntime('runtime-a');
    fakeDocument.visibilityState = 'visible';
    Date.now = () => now;
    now += 60_000;
    unsubscribe = subscribeSessionFoldersSync('runtime-a', handlers);
  });
  afterAll(() => {
    unsubscribe();
    Date.now = originalNow;
  });

  for (const signal of ['focus', 'pageshow', 'online', 'openchamber:system-resume']) {
    test(`reads the folders on ${signal}`, () => {
      fakeWindow.dispatchEvent(new Event(signal));
      expect(reads).toBe(1);
    });
  }

  test('reads the folders when the window becomes visible, and not when it hides', () => {
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(reads).toBe(0);

    fakeDocument.visibilityState = 'visible';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(reads).toBe(1);
  });

  test('one return firing several signals is one read; a later return reads again', () => {
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    fakeWindow.dispatchEvent(new Event('focus'));
    fakeWindow.dispatchEvent(new Event('pageshow'));
    expect(reads).toBe(1);

    now += 2_000;
    fakeWindow.dispatchEvent(new Event('focus'));
    expect(reads).toBe(2);
  });

  test('coming back online reads even right after a read made while still offline', () => {
    fakeWindow.dispatchEvent(new Event('focus'));
    fakeWindow.dispatchEvent(new Event('online'));
    expect(reads).toBe(2);
  });

  test('a window of another runtime does not read, and an unsubscribed one stops', () => {
    useRuntime('runtime-b');
    fakeWindow.dispatchEvent(new Event('focus'));
    expect(reads).toBe(0);

    useRuntime('runtime-a');
    unsubscribe();
    fakeWindow.dispatchEvent(new Event('focus'));
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(reads).toBe(0);
  });

  test('still reads when the stream reconnects', () => {
    emit({ type: 'event-stream-ready', connectionId: null });
    expect(reads).toBe(1);
  });
});
