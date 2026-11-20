import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeKey, subscribeRuntimeEndpointChanged, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import {
  GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS,
  GLOBAL_SESSIONS_RETRY_INTERVAL_MS,
  startGlobalSessionsPolling,
  useGlobalSessionsPolling,
} from './useGlobalSessionsPolling';

type SessionList = { items: Session[]; errors: Record<string, string> };

const flush = async () => { await new Promise<void>((resolve) => queueMicrotask(resolve)); };
const settlePromises = async () => { for (let turn = 0; turn < 32; turn += 1) await Promise.resolve(); };
const timers = () => {
  let nextId = 0;
  const pending = new Map<number, { callback: () => void; delay: number }>();
  return {
    pending,
    schedule: (callback: () => void, delay: number) => {
      const id = ++nextId;
      pending.set(id, { callback, delay });
      return id;
    },
    clear: (id: number) => { pending.delete(id); },
    fire: async () => {
      expect(pending.size).toBe(1);
      const entry = pending.entries().next().value;
      if (!entry) throw new Error('No scheduled refresh');
      pending.delete(entry[0]);
      entry[1].callback();
      await flush();
    },
    delay: () => [...pending.values()][0]?.delay,
  };
};

describe('global sessions polling lifecycle', () => {
  const realNow = Date.now;
  beforeEach(() => { Date.now = () => 1_800_000_000_000; });
  afterEach(() => { Date.now = realNow; });

  test('loads immediately, schedules only after completion, and clears its timer on disposal', async () => {
    const clock = timers();
    let initialLoads = 0;
    let refreshes = 0;
    let complete: (success: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => { complete = resolve; });
    const dispose = startGlobalSessionsPolling(
      () => { initialLoads += 1; return pending; },
      async () => { refreshes += 1; return true; },
      clock.schedule, clock.clear,
    );
    expect(initialLoads).toBe(1);
    expect(clock.pending.size).toBe(0);
    complete(true);
    await flush();
    // Before: a 45 s timer, though the event stream already names every new session.
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    await clock.fire();
    expect(refreshes).toBe(1);
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    dispose();
    expect(clock.pending.size).toBe(0);
  });

  test('recovers a startup failure without waiting for the full interval or user interaction', async () => {
    const clock = timers();
    let calls = 0;
    const dispose = startGlobalSessionsPolling(
      async () => false,
      async () => { calls += 1; return true; },
      clock.schedule, clock.clear,
    );
    await flush();
    expect(clock.delay()).toBe(1_000);
    await clock.fire();
    expect(calls).toBe(1);
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    dispose();
  });

  test('bounds startup retries and keeps retrying at the retry interval after exhaustion', async () => {
    const clock = timers();
    const fail = async () => false;
    const dispose = startGlobalSessionsPolling(fail, fail, clock.schedule, clock.clear);
    await flush();
    for (const delay of [1_000, 2_000, 4_000, GLOBAL_SESSIONS_RETRY_INTERVAL_MS]) {
      expect(clock.delay()).toBe(delay);
      await clock.fire();
    }
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_RETRY_INTERVAL_MS);
    dispose();
  });

  test('a background failure after success retries without restarting the startup burst', async () => {
    const clock = timers();
    const dispose = startGlobalSessionsPolling(async () => true, async () => false, clock.schedule, clock.clear);
    await flush();
    await clock.fire();
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_RETRY_INTERVAL_MS);
    dispose();
  });

  test('the Agent Service answering ends the wait after a failed startup load', async () => {
    const clock = timers();
    let ready: () => void = () => undefined;
    let refreshes = 0;
    const fail = async () => false;
    const dispose = startGlobalSessionsPolling(
      fail,
      async () => { refreshes += 1; return refreshes > 3; },
      clock.schedule, clock.clear, undefined,
      (listener) => { ready = listener; return () => { ready = () => undefined; }; },
    );
    await flush();
    for (let attempt = 0; attempt < 3; attempt += 1) await clock.fire();
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_RETRY_INTERVAL_MS);
    ready();
    await flush();
    expect(refreshes).toBe(4);
    expect(clock.pending.size).toBe(1);
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    // After a success it changes nothing.
    ready();
    await flush();
    expect(refreshes).toBe(4);
    dispose();
  });

  test('the Agent Service answering during a failing load runs one more load right after it', async () => {
    const clock = timers();
    let ready: () => void = () => undefined;
    let finishInitial: (success: boolean) => void = () => undefined;
    let refreshes = 0;
    const dispose = startGlobalSessionsPolling(
      () => new Promise<boolean>((resolve) => { finishInitial = resolve; }),
      async () => { refreshes += 1; return true; },
      clock.schedule, clock.clear, undefined,
      (listener) => { ready = listener; return () => undefined; },
    );
    ready();
    finishInitial(false);
    await flush();
    await flush();
    expect(refreshes).toBe(1);
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    dispose();
  });

  test('a rejected load remains recoverable', async () => {
    const clock = timers();
    const dispose = startGlobalSessionsPolling(
      async () => { throw new Error('offline'); }, async () => true, clock.schedule, clock.clear,
    );
    await flush();
    expect(clock.delay()).toBe(1_000);
    await clock.fire();
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    dispose();
  });

  test('a refresh that comes due while hidden waits for the app to be visible again', async () => {
    const clock = timers();
    let hidden = false;
    let notifyVisible: () => void = () => undefined;
    let listening = false;
    const visibility = {
      isHidden: () => hidden,
      onVisible: (listener: () => void) => {
        notifyVisible = listener;
        listening = true;
        return () => { listening = false; };
      },
    };
    let refreshes = 0;
    const dispose = startGlobalSessionsPolling(
      async () => true,
      async () => { refreshes += 1; return true; },
      clock.schedule, clock.clear, visibility,
    );
    await flush();

    hidden = true;
    await clock.fire();
    expect(refreshes).toBe(0);
    expect(clock.pending.size).toBe(0);

    // Becoming visible runs the missed refresh once and resumes the cadence.
    hidden = false;
    notifyVisible();
    await flush();
    expect(refreshes).toBe(1);
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    notifyVisible();
    await flush();
    expect(refreshes).toBe(1);

    // Visible again before anything came due: nothing extra.
    await clock.fire();
    expect(refreshes).toBe(2);
    notifyVisible();
    await flush();
    expect(refreshes).toBe(2);
    dispose();
    expect(listening).toBe(false);
  });

  test('disposal during a load prevents a late completion from scheduling more work', async () => {
    const clock = timers();
    let complete: (success: boolean) => void = () => undefined;
    const pending = new Promise<boolean>((resolve) => { complete = resolve; });
    const dispose = startGlobalSessionsPolling(() => pending, async () => true, clock.schedule, clock.clear);
    dispose();
    complete(false);
    await flush();
    expect(clock.pending.size).toBe(0);
  });
});

test('the mounted poller recovers real store failure and starts a fresh load on runtime switch', async () => {
  const dom = new Window({ url: 'http://sessions.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, localStorage: dom.localStorage,
    Element: dom.Element, HTMLElement: dom.HTMLElement, Node: dom.Node,
    CustomEvent: dom.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const fetch = spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
  const home = spyOn(hostFilesystem, 'getFilesystemHomeInfo')
    .mockRejectedValueOnce(new Error('startup unavailable'))
    .mockResolvedValue({ home: '/home/user', chatsRoot: '/chats' });
  const workspace = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Project' });
  const subagents = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
  const session = (sessionId: string): SessionList => ({ items: [{
    sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId,
    createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    metadata: null, metadataRevision: '0', archiveRevision: '0',
  }], errors: {} });
  const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue(session('restored'));
  const clock = timers();
  // happy-dom returns Node timer handles; retain that contract while controlling time.
  const originalTimeout = dom.setTimeout.bind(dom);
  const originalClear = dom.clearTimeout.bind(dom);
  const handles = new Map<ReturnType<typeof dom.setTimeout>, number>();
  const timeout = spyOn(dom, 'setTimeout').mockImplementation((callback, delay) => {
    const handle = originalTimeout(() => undefined, 0);
    originalClear(handle);
    handles.set(handle, clock.schedule(() => callback(), delay ?? 0));
    return handle;
  });
  const clear = spyOn(dom, 'clearTimeout').mockImplementation((handle) => {
    const id = handle === undefined ? undefined : handles.get(handle);
    if (id !== undefined) clock.clear(id);
  });
  // The app resets the store before the poller's endpoint listener runs.
  const reset = subscribeRuntimeEndpointChanged(() => useGlobalSessionsStore.getState().resetForRuntimeSwitch());
  switchRuntimeEndpoint({ apiBaseUrl: 'http://sessions.test', runtimeKey: 'startup-a' });
  const root = createRoot(document.createElement('div'));
  const Harness = ({ enabled }: { enabled: boolean }) => { useGlobalSessionsPolling(enabled); return null; };
  let resolveOldPage: (page: SessionList) => void = () => undefined;
  const subscribeToNextReady = (): Promise<void> => {
    let unsubscribe: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      unsubscribe = useGlobalSessionsStore.subscribe((state) => {
        if (state.status !== 'ready') return;
        unsubscribe();
        resolve();
      });
    });
    return ready;
  };
  try {
    await act(async () => root.render(React.createElement(Harness, { enabled: false })));
    expect(home.mock.calls.length).toBe(0);
    await act(async () => root.render(React.createElement(Harness, { enabled: true })));
    expect(useGlobalSessionsStore.getState().status).toBe('error');
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
    expect(clock.delay()).toBe(1_000);
    const recovered = subscribeToNextReady();
    await act(async () => { await clock.fire(); await recovered; });
    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.sessionId)).toEqual(['restored']);
    expect(useGlobalSessionsStore.getState().status).toBe('ready');
    expect(clock.delay()).toBe(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS);
    expect(list.mock.calls.every(([workspaceId]) => workspaceId === undefined)).toBe(true);

    const oldPage = new Promise<SessionList>((resolve) => { resolveOldPage = resolve; });
    list.mockImplementation(() => getRuntimeKey() === 'startup-a' ? oldPage : Promise.resolve(session('new-runtime')));
    await act(async () => clock.fire());
    expect(useGlobalSessionsStore.getState().status).toBe('loading');
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(true);
    expect(clock.pending.size).toBe(0);
    const switched = subscribeToNextReady();
    await act(async () => { switchRuntimeEndpoint({ apiBaseUrl: 'http://sessions.test', runtimeKey: 'startup-b' }); await switched; });
    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.sessionId)).toEqual(['new-runtime']);
    expect(clock.pending.size).toBe(1);
    await act(async () => { resolveOldPage(session('stale')); await settlePromises(); });
    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.sessionId)).toEqual(['new-runtime']);
    expect(clock.pending.size).toBe(1);
    // The app may reset stores when the endpoint changes but runtime identity stays the same.
    const reconnected = subscribeToNextReady();
    list.mockResolvedValue(session('reconnected'));
    await act(async () => { switchRuntimeEndpoint({ apiBaseUrl: 'http://reconnected.test', runtimeKey: 'startup-b' }); await reconnected; });
    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.sessionId)).toEqual(['reconnected']);
    expect(clock.pending.size).toBe(1);
    await act(async () => root.render(React.createElement(Harness, { enabled: false })));
    expect(clock.pending.size).toBe(0);
  } finally {
    resolveOldPage(session('stale'));
    await act(async () => root.unmount());
    reset();
    for (const spy of [fetch, home, workspace, subagents, list, timeout, clear]) spy.mockRestore();
    await dom.happyDOM.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

/**
 * Each window renders its own app root with its own global sessions store,
 * so every root whose UI lists sessions from that store must start the
 * polling itself. The Mini Chat window's session switcher once read an
 * empty store because its root never did (#4643).
 */
describe('global session polling root coverage', () => {
  // The desktop root lists sessions from the global store, so it starts the
  // poller. Mini Chat and VS Code roots do not exist on the retained surfaces
  // (VS Code is retired; Mini Chat reads the canonical sync stores).
  const rootSources: Array<[string, string, RegExp]> = [
    ['App', '../App.tsx', /^\s*useGlobalSessionsPolling\(true\);/m],
  ];

  for (const [rootName, sourcePath, mountCall] of rootSources) {
    test(`${rootName} mounts useGlobalSessionsPolling`, () => {
      const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
      expect(mountCall.test(source)).toBe(true);
    });
  }

  // The mobile shell has no poller on purpose: its sessions sheet loads the
  // list when it opens. That load must run the host seed too, or a question
  // already waiting at startup never reaches the index its rows read (#5098).
  test('the mobile sessions sheet seeds the host index after its own load', () => {
    const source = readFileSync(new URL('../apps/MobileSessionsSheet.tsx', import.meta.url), 'utf8');
    expect(/refreshGlobalSessionsWhenShown\(GLOBAL_SESSIONS_FULL_REFRESH_INTERVAL_MS, liveSessions\)\.then\(\(\) => seedGlobalSessionStatusFromHost\(\)\)/.test(source)).toBe(true);
  });
});
