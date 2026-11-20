import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React, { act, useMemo, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { FileDiff, FileDiffOptions, SelectedLineRange, Virtualizer } from '@pierre/diffs';
import type { WorkerPoolManager } from '@pierre/diffs/worker';
import type { WorkerPoolStatus } from '@/contexts/DiffWorkerProvider';
import type { SharedVirtualizer } from './sharedVirtualizer';
import type { DiffAnnotation } from './types';

const browser = new Window({ url: 'http://localhost/' });
for (const [name, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 1; },
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const instances: FakeFileDiff[] = [];
class FakeFileDiff {
  constructor(public options: FileDiffOptions<DiffAnnotation, never>, readonly pool: WorkerPoolManager | undefined) {
    instances.push(this);
  }
  cleanUp = mock(() => {});
  render = mock((_options: unknown) => {});
  rerender = mock(() => {});
  setLineAnnotations = mock((_annotations: unknown) => {});
  setSelectedLines = mock((_selection: unknown) => {});
  setOptions(options: FileDiffOptions<DiffAnnotation, never>) { this.options = options; }
}

class FakeVirtualizedFileDiff extends FakeFileDiff {
  constructor(options: FileDiffOptions<DiffAnnotation, never>, _virtualizer: Virtualizer, _metrics: unknown, pool: WorkerPoolManager | undefined) {
    super(options, pool);
  }
  setMetrics = mock((_metrics: unknown) => {});
}

let shared: SharedVirtualizer | null = null;
const acquire = mock(() => shared);
const forceUpdate = mock(() => {});
const holdTypingField = mock(() => {});
const paintSelection = mock((_selection: SelectedLineRange) => {});
mock.module('@pierre/diffs', () => ({
  FileDiff: FakeFileDiff,
  VirtualizedFileDiff: FakeVirtualizedFileDiff,
  areFilesEqual: (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right),
  areOptionsEqual: (left: unknown, right: unknown) => left === right,
}));
mock.module('./sharedVirtualizer', () => ({
  acquireSharedVirtualizer: acquire,
  diffVirtualMetrics: (lineHeight: number) => ({ lineHeight }),
  wakeVirtualizer: () => {},
}));
mock.module('./diffDom', () => ({
  preserveScrollPosition: () => () => {},
  waitForDiffReady: (_container: HTMLElement, ready: () => void) => { ready(); return () => {}; },
}));

const { useDiffInstance } = await import('./useDiffInstance');
const options: FileDiffOptions<DiffAnnotation, never> = { themeType: 'light' };
const readyPool = {} as WorkerPoolManager;
type HarnessProps = { status: WorkerPoolStatus; pool?: WorkerPoolManager; original?: string; modified?: string };

const Harness = ({ status, pool, original = 'old', modified = 'new' }: HarnessProps) => {
  const diffRootRef = useRef<HTMLDivElement>(null);
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const diffInstanceRef = useRef<FileDiff<DiffAnnotation> | null>(null);
  const sharedVirtualizerRef = useRef<SharedVirtualizer | null>(null);
  const instanceVirtualizerRef = useRef<Virtualizer | null>(null);
  const selectionRef = useRef<SelectedLineRange | null>(null);
  const lastAppliedSelectionRef = useRef<SelectedLineRange | null>(null);
  const isApplyingSelectionRef = useRef(false);
  const lineAnnotations = useMemo(() => [], []);
  const lineAnnotationsRef = useRef(lineAnnotations);
  useDiffInstance({
    diffRootRef, diffContainerRef, diffInstanceRef, sharedVirtualizerRef, instanceVirtualizerRef,
    workerPool: pool, workerPoolStatus: status, fileDiff: undefined, fileName: 'file.ts', language: 'typescript',
    original, modified, options, diffThemeKey: 'light', diffLineHeight: 24, holdTypingField,
    lineAnnotations, lineAnnotationsRef, selection: null, selectionRef, isApplyingSelectionRef,
    lastAppliedSelectionRef, paintSelection, forceUpdate,
  });
  return <div ref={diffRootRef}><div ref={diffContainerRef} /></div>;
};

describe('useDiffInstance worker lifecycle', () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = async (props: HarnessProps) => act(async () => root.render(<Harness {...props} />));

  beforeEach(() => {
    instances.length = 0;
    shared = null;
    acquire.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test('pending initialization does not create or render a second instance', async () => {
    await render({ status: 'pending' });
    expect(instances).toHaveLength(0);
    expect(acquire).not.toHaveBeenCalled();
  });

  test('a ready worker pool is passed to exactly one instance', async () => {
    await render({ status: 'ready', pool: readyPool });
    expect(instances).toHaveLength(1);
    expect(instances[0].pool).toBe(readyPool);
    expect(instances[0].render).toHaveBeenCalledTimes(1);
    expect(instances[0].render).toHaveBeenCalledWith(expect.objectContaining({
      oldFile: expect.objectContaining({ contents: 'old' }), newFile: expect.objectContaining({ contents: 'new' }),
    }));
  });

  test('failed initialization renders on the main thread', async () => {
    await render({ status: 'failed' });
    expect(instances).toHaveLength(1);
    expect(instances[0].pool).toBeUndefined();
    expect(instances[0].render).toHaveBeenCalledTimes(1);
  });

  test('pending to failed renders even though the pool stays undefined', async () => {
    await render({ status: 'pending' });
    await render({ status: 'failed' });
    expect(instances).toHaveLength(1);
    expect(instances[0].render).toHaveBeenCalledTimes(1);
  });

  test('empty file contents still reach the main-thread renderer', async () => {
    await render({ status: 'failed', original: '', modified: '' });
    expect(instances[0].render).toHaveBeenCalledWith(expect.objectContaining({
      oldFile: expect.objectContaining({ contents: '' }), newFile: expect.objectContaining({ contents: '' }),
    }));
  });

  test('virtualized fallback keeps the shared virtualizer and releases it once', async () => {
    const release = mock(() => {});
    shared = { virtualizer: {} as Virtualizer, root: document, release };
    await render({ status: 'failed' });
    const instance = instances[0];
    expect(instance).toBeInstanceOf(FakeVirtualizedFileDiff);
    expect(instance.pool).toBeUndefined();
    await act(async () => root.render(null));
    expect(instance.cleanUp).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('worker replacement cleans up the old instance without duplicating ownership', async () => {
    await render({ status: 'ready', pool: readyPool });
    const first = instances[0];
    await render({ status: 'failed' });
    expect(first.cleanUp).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(2);
    expect(instances[1].pool).toBeUndefined();
    await act(async () => root.render(null));
    expect(first.cleanUp).toHaveBeenCalledTimes(1);
    expect(instances[1].cleanUp).toHaveBeenCalledTimes(1);
  });
});

afterAll(() => browser.close());
