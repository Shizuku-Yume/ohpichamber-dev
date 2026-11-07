import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { plugin } from 'bun';
import { Window } from 'happy-dom';
import type { WorkerPoolManager } from '@pierre/diffs/worker';
plugin({
  name: 'diff-worker-url-stub',
  setup(build) {
    build.onResolve({ filter: /\?worker&url$/ }, ({ path }) => ({ path, namespace: 'worker-url' }));
    build.onLoad({ filter: /.*/, namespace: 'worker-url' }, () => ({ contents: 'export default "blob:test-diff-worker";', loader: 'js' }));
  },
});

import {
  DiffWorkerProvider,
  useWorkerPool,
} from './DiffWorkerProvider';

type WorkerMode = 'success' | 'timeout' | 'error' | 'render-options-error';

let currentWorkerMode: WorkerMode = 'success';
const createdWorkers: ControllableWorker[] = [];

interface WorkerMessagePayload {
  type: string;
  id: string;
}

function isWorkerMessagePayload(value: unknown): value is WorkerMessagePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    'id' in value &&
    typeof value.id === 'string'
  );
}
const NativeEventTarget = globalThis.EventTarget;
const NativeEvent = globalThis.Event;
const NativeMessageEvent = globalThis.MessageEvent;
const NativeErrorEvent = globalThis.ErrorEvent;

class ControllableWorker extends NativeEventTarget {
  terminated = false;

  private messageListeners: ((event: { data: unknown }) => void)[] = [];

  constructor() {
    super();
    createdWorkers.push(this);
  }

  override addEventListener(type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions): void {
    if (type === 'message' && typeof listener === 'function') {
      // EventListener parameter (Event) does not overlap with { data: unknown } in DOM types,
      // but worker 'message' listeners expect an event object with payload data.
      this.messageListeners.push(listener as unknown as (event: { data: unknown }) => void);
    }
    super.addEventListener(type, listener, options);
  }

  postMessage(data: unknown): void {
    if (this.terminated) return;

    if (currentWorkerMode === 'timeout') {
      // Simulate unresponsive worker to trigger workerInitializationTimeout
      return;
    }

    if (currentWorkerMode === 'error') {
      queueMicrotask(() => {
        if (this.terminated) return;
        const errEvent = new (NativeErrorEvent || NativeEvent)('error', {
          error: new Error('Simulated worker failure'),
          message: 'Simulated worker failure',
        });
        this.dispatchEvent(errEvent);
      });
      return;
    }

    if (isWorkerMessagePayload(data) && (data.type === 'initialize' || data.type === 'set-render-options')) {
      const { type, id } = data;
      queueMicrotask(() => {
        if (this.terminated) return;
        const responseData = {
          type: currentWorkerMode === 'render-options-error' && type === 'set-render-options' ? 'error' : 'success',
          requestType: type,
          id,
          error: currentWorkerMode === 'render-options-error' && type === 'set-render-options' ? 'Simulated setRenderOptions failure' : undefined,
          sentAt: Date.now(),
        };
        const msgEvent = { data: responseData };
        for (const listener of this.messageListeners) {
          try {
            listener(msgEvent);
          } catch {
            // Ignore listener errors
          }
        }
        try {
          this.dispatchEvent(new (NativeMessageEvent || NativeEvent)('message', msgEvent));
        } catch {
          // Ignore dispatch errors
        }
      });
    }
  }
  terminate(): void {
    this.terminated = true;
  }
}

const sleep = (ms: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
};

describe('DiffWorkerProvider & useWorkerPool', () => {
  let dom: Window;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const unhandledRejections: unknown[] = [];

  const onProcessUnhandled = (reason: unknown) => {
    unhandledRejections.push(reason);
  };

  beforeEach(() => {
    unhandledRejections.length = 0;
    createdWorkers.length = 0;
    currentWorkerMode = 'success';
    DiffWorkerProvider._resetPoolsForTesting?.();
    DiffWorkerProvider._setWorkerInitTimeoutForTesting?.(100);

    process.on('unhandledRejection', onProcessUnhandled);

    dom = new Window({ url: 'http://localhost' });
    for (const [name, value] of Object.entries({
      window: dom,
      Window: dom.Window,
      document: dom.document,
      navigator: dom.navigator,
      Element: dom.Element,
      HTMLElement: dom.HTMLElement,
      Node: dom.Node,
      Event: dom.Event,
      CustomEvent: dom.CustomEvent,
      MessageEvent: dom.MessageEvent,
      ErrorEvent: dom.ErrorEvent,
      customElements: dom.customElements,
      Worker: ControllableWorker,
      getComputedStyle: dom.getComputedStyle.bind(dom),
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
      cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
      requestIdleCallback: (cb: () => void) => dom.setTimeout(cb, 10),
      cancelIdleCallback: (id: unknown) => dom.clearTimeout(id as never),
      IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
  });

  afterEach(async () => {
    process.off('unhandledRejection', onProcessUnhandled);
    for (const worker of createdWorkers) {
      worker.terminate();
    }
    DiffWorkerProvider._resetPoolsForTesting?.();

    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  });

  test('initializes worker pool normally when workers succeed', async () => {
    currentWorkerMode = 'success';

    let capturedPool: WorkerPoolManager | undefined;
    function Probe() {
      capturedPool = useWorkerPool('unified');
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DiffWorkerProvider>
          <Probe />
        </DiffWorkerProvider>
      );
    });

    const start = Date.now();
    while (!capturedPool && Date.now() - start < 3000) {
      await act(async () => {
        await sleep(50);
      });
    }

    expect(unhandledRejections).toHaveLength(0);
    expect(capturedPool).toBeDefined();
    expect(capturedPool?.isWorkingPool()).toBe(true);

    await act(async () => {
      root.unmount();
    });
  });

  test('guards worker initialization timeout with zero unhandled rejections and falls back to undefined pool', async () => {
    currentWorkerMode = 'timeout';

    let capturedPool: WorkerPoolManager | undefined = undefined;
    function Probe() {
      capturedPool = useWorkerPool('unified');
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DiffWorkerProvider>
          <Probe />
        </DiffWorkerProvider>
      );
    });

    // Wait past the 100ms workerInitializationTimeout
    await act(async () => {
      await sleep(250);
    });

    // Zero unhandled rejections must be emitted
    expect(unhandledRejections).toHaveLength(0);

    // Fallback: useWorkerPool must remain undefined so @pierre/diffs renders synchronously on main thread
    expect(capturedPool).toBeUndefined();

    // Spawned workers should be terminated cleanly
    for (const worker of createdWorkers) {
      expect(worker.terminated).toBe(true);
    }

    await act(async () => {
      root.unmount();
    });
  });

  test('guards worker initialization failure with zero unhandled rejections and falls back to undefined pool', async () => {
    currentWorkerMode = 'error';

    let capturedPool: WorkerPoolManager | undefined = undefined;
    function Probe() {
      capturedPool = useWorkerPool('unified');
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DiffWorkerProvider>
          <Probe />
        </DiffWorkerProvider>
      );
    });

    // Wait for error microtasks and recovery
    await act(async () => {
      await sleep(150);
    });

    expect(unhandledRejections).toHaveLength(0);
    expect(capturedPool).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });

  test('guards setRenderOptions failure with zero unhandled rejections and falls back cleanly to undefined pool', async () => {
    currentWorkerMode = 'render-options-error';

    let capturedPool: WorkerPoolManager | undefined = undefined;
    function Probe() {
      capturedPool = useWorkerPool('unified');
      return null;
    }

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <DiffWorkerProvider>
          <Probe />
        </DiffWorkerProvider>
      );
    });

    // Wait for set-render-options error and clean fallback
    await act(async () => {
      await sleep(150);
    });

    expect(unhandledRejections).toHaveLength(0);
    expect(capturedPool).toBeUndefined();

    await act(async () => {
      root.unmount();
    });
  });
});
