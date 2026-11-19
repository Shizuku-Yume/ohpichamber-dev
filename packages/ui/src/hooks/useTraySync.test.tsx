<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
||||||| bc50ba56aa
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
=======
import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
>>>>>>> upstream/main
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { useTraySync } from './useTraySync';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useNotificationStore } from '@/sync/notification-store';
import { markSessionViewed } from '@/sync/notification-store';

const session = (sessionId: string, parentSessionId?: string): Session => ({
  sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '/project',
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const Harness = () => {
  useTraySync();
  return null;
};

<<<<<<< HEAD
||||||| bc50ba56aa
const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home' });
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;

=======
const flush = () => act(async () => {
  jest.advanceTimersByTime(500);
});

const originalHomeInfo = opencodeClient.getFilesystemHomeInfo;
opencodeClient.getFilesystemHomeInfo = async () => ({ home: '/home' });
await ensureChatsRootDirectory();
opencodeClient.getFilesystemHomeInfo = originalHomeInfo;

>>>>>>> upstream/main
describe('Dock badge with the macOS menu bar disabled', () => {
  let dom: Window;
  let root: Root;
  const counts: number[] = [];
  let listenerCount = 0;
  let intervalCount = 0;
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
  const invoke = async (command: string, args?: { dockBadgeCount?: number }) => {
    expect(command).toBe('desktop_tray_update');
    if (args?.dockBadgeCount !== undefined) counts.push(args.dockBadgeCount);
    return null;
  };
  const listen = async () => { listenerCount += 1; return () => {}; };
  const intervals = () => { intervalCount += 1; return 1; };
<<<<<<< HEAD
  // Unread state lives on the session's metadata now: an idle turn whose
  // viewed watermark never caught up is what raises the badge.
  // Upserting through the store keeps its record map and its ordered view in
  // agreement, so the badge reads the same unread state the row does.
  const append = (id: string) => {
    const unread = { openchamber: { workbench: { lastIdleAt: Date.now(), viewedAt: undefined } } };
    const existing = useGlobalSessionsStore.getState().entityById.get(id) ?? session(id);
    useGlobalSessionsStore.getState().upsertSession({ ...existing, metadata: unread });
  };
  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  };

||||||| bc50ba56aa
  let clock = 1;
  const patchSession = (id: string, patch: (time: Session['time']) => Session['time']) => useGlobalSessionsStore.setState((state) => ({
    activeSessions: state.activeSessions.map((item) => (item.id === id ? { ...item, time: patch(item.time) } : item)),
  }));
  // A turn ends: OpenCode stamps `time.idle`, which leaves the session unread.
  const finishTurn = (id: string) => patchSession(id, (time) => ({ ...time, idle: ++clock }));
  const view = (id: string) => patchSession(id, (time) => ({ ...time, viewed: time.idle }));
  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  };

=======
  let clock = 1;
  const patchSession = (id: string, patch: (time: Session['time']) => Session['time']) => useGlobalSessionsStore.setState((state) => ({
    activeSessions: state.activeSessions.map((item) => (item.id === id ? { ...item, time: patch(item.time) } : item)),
  }));
  // A turn ends: OpenCode stamps `time.idle`, which leaves the session unread.
  const finishTurn = (id: string) => patchSession(id, (time) => ({ ...time, idle: ++clock }));
  const view = (id: string) => patchSession(id, (time) => ({ ...time, viewed: time.idle }));
>>>>>>> upstream/main
  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    jest.useFakeTimers();
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: false },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
      setInterval: intervals,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    // The unread watermark is written to the host; answer exactly the metadata
    // read/write and the view POST, so a mark clears instead of rolling back.
    // Any other request fails, so an unexpected endpoint surfaces here.
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? 'GET').toUpperCase();
      const metadata = /\/api\/agent\/v1\/sessions\/[^/]+\/metadata$/.test(url);
      if (metadata && method === 'GET') {
        return Response.json({ sessionId: 'root', revision: '1', metadata: { openchamber: { workbench: { lastIdleAt: 1, viewedAt: 1 } } } });
      }
      if (metadata && method === 'PATCH') {
        return Response.json({ sessionId: 'root', revision: '2', metadata: { openchamber: { workbench: { lastIdleAt: 1, viewedAt: 1 } } } });
      }
      if (method === 'POST' && /\/api\/sessions\/[^/]+\/view$/.test(url)) {
        return new Response(null, { status: 204 });
      }
      return new Response('unexpected request', { status: 500 });
    });
    useNotificationStore.setState(useNotificationStore.getInitialState());
    const seeded = [session('root'), session('child', 'root')];
    // The global store keeps `entityById` as the record and `activeSessions` as
    // its ordered view, so a fixture that writes one has to write both.
    useGlobalSessionsStore.setState({
      activeSessions: seeded,
      entityById: new Map(seeded.map((entry) => [entry.sessionId, entry])),
    });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    counts.length = 0;
    listenerCount = 0;
    intervalCount = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
<<<<<<< HEAD
    fetchSpy.mockRestore();
||||||| bc50ba56aa
    useProjectsStore.setState({ projects: [] });
=======
    useProjectsStore.setState({ projects: [] });
    jest.useRealTimers();
>>>>>>> upstream/main
    await dom.happyDOM.close();
  });

  test('publishes unread chats, clears viewed chats, and respects the badge toggle without tray timers or listeners', async () => {
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    useUIStore.setState({ dockBadgeEnabled: false });
    await flush();
    expect(counts).toEqual([0, 1, 0]);
    useUIStore.setState({ dockBadgeEnabled: true });
    await flush();
    expect(counts).toEqual([0, 1, 0, 1]);
    markSessionViewed('root');
    await flush();
    expect(counts).toEqual([0, 1, 0, 1, 0]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });

  test('rolls subtasks up only when enabled and reconciles global session membership', async () => {
    append('child');
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    useUIStore.setState({ notifyOnSubtasks: true });
    await flush();
    expect(counts).toEqual([0, 1]);
    useGlobalSessionsStore.setState({ activeSessions: [] });
    await flush();
    expect(counts).toEqual([0, 1, 0]);
  });

  test('coalesces unread updates and cancels pending updates on unmount', async () => {
    await act(async () => root.render(<Harness />));
    append('root');
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
    markSessionViewed('root');
    await act(async () => root.unmount());
    await flush();
    expect(counts).toEqual([0, 1]);
    append('root');
    await flush();
    expect(counts).toEqual([0, 1]);
  });

  test('counts all unread chats at startup, beyond the tray menu limit', async () => {
    const sessions = Array.from({ length: 25 }, (_, index) => session(`root-${index}`));
    useGlobalSessionsStore.setState({ activeSessions: sessions });
    for (const item of sessions) append(item.sessionId);
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([25]);
  });

  test('starts with a cleared badge when both controls are disabled', async () => {
    append('root');
    useUIStore.setState({ dockBadgeEnabled: false });
    await act(async () => root.render(<Harness />));
    expect(counts).toEqual([0]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });

  test('does not publish desktop state outside Electron', async () => {
    Object.assign(dom, { __OPENCHAMBER_ELECTRON__: undefined });
    await act(async () => root.render(<Harness />));
    append('root');
    await flush();
    expect(counts).toEqual([]);
    expect(intervalCount).toBe(0);
    expect(listenerCount).toBe(0);
  });
});
<<<<<<< HEAD
||||||| bc50ba56aa

// #4698: the tray drops "Allow always" when a permission carries no save
// patterns, so every approval source has to carry the flag. The cross-directory
// index feeds the tray from two inputs — live events and the host seed — and the
// seed is the one that arrives already parsed.
describe('tray approvals carry whether a permission can be remembered', () => {
  const previousProjects = useProjectsStore.getState().projects;
  let dom: Window;
  let root: Root;
  const snapshots: Array<{ approvals?: Array<{ id: string; canSave: boolean }> }> = [];
  const invoke = async (command: string, args?: { approvals?: Array<{ id: string; canSave: boolean }> }) => {
    if (command === 'desktop_tray_update') snapshots.push(args as never);
    return null;
  };
  const listen = async () => () => {};
  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  };
  const canSaveById = () => Object.fromEntries(
    (snapshots.at(-1)?.approvals ?? []).map((a) => [a.id, a.canSave]),
  );

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: true },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [{ id: 'repo', path: '/repo' }, { id: 'unopened', path: '/unopened' }] });
    useGlobalSessionsStore.setState({ activeSessions: [session('root')] });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    snapshots.length = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: previousProjects });
    await dom.happyDOM.close();
  });

  test('a live ask keeps its save patterns through to the tray', async () => {
    await act(async () => root.render(<Harness />));
    applyGlobalBlockingRequestEvents('/repo', [
      { type: 'permission.asked', properties: { id: 'live-save', sessionID: 'root', action: 'bash', resources: ['git status'], save: ['git *'] } },
      { type: 'permission.asked', properties: { id: 'live-once', sessionID: 'root', action: 'bash', resources: ['rm -rf tmp'] } },
    ]);
    await flush();

    expect(canSaveById()).toEqual({ 'live-save': true, 'live-once': false });
  });

  test('a seeded ask does too, so an unopened directory does not lose the option', async () => {
    await act(async () => root.render(<Harness />));
    await readHostBlockingRequestsSnapshot(async () => ({
      sessions: {},
      pending: { root: {
        permissions: [
          { id: 'seed-save', sessionID: 'root', action: 'bash', resources: ['git status'], save: ['git *'] },
          { id: 'seed-once', sessionID: 'root', action: 'bash', resources: ['rm -rf tmp'] },
        ],
        forms: [],
        pages: [],
      } },
      serverTime: 0,
    }), () => '/unopened');
    await flush();

    expect(canSaveById()).toEqual({ 'seed-save': true, 'seed-once': false });
  });

  test('a complete host snapshot removes an answered page from tray approvals', async () => {
    await act(async () => root.render(<Harness />));
    applyWaitingPageEvent({
      type: 'openchamber.page-waiting',
      properties: { sessionID: 'root', directory: '/repo', page: { id: 'answered-page', title: 'Services page binding' } },
    }, () => null);
    await flush();
    expect(canSaveById()).toEqual({ 'answered-page': false });

    await readHostBlockingRequestsSnapshot(async () => ({ sessions: {}, pending: {}, serverTime: Date.now() }), () => '/repo');
    await flush();
    expect(canSaveById()).toEqual({});
  });
});

type TraySnapshotForTest = {
  sessions?: Array<{ id: string }>;
  approvals?: Array<{ id: string }>;
  dockBadgeCount?: number;
};

// The tray is a short recent-work list, so it names the sessions the sidebar
// can show. A session whose directory belongs to no configured project (an
// eval run in /tmp, say) has no row there; it must not take a tray slot or a
// place in the dock badge, which the user could never clear.
describe('Tray sessions follow the configured projects', () => {
  let dom: Window;
  let root: Root;
  const snapshots: TraySnapshotForTest[] = [];
  const invoke = async (command: string, args?: TraySnapshotForTest) => {
    if (command === 'desktop_tray_update') snapshots.push(args ?? {});
    return null;
  };
  const listen = async () => () => {};
  const flush = async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 550)); });
  };
  const lastSnapshot = () => snapshots.at(-1);

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: true },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }] });
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-project'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    useSessionDisplayStore.setState({ showChatsSection: true, showPinnedSection: true, showWorkSection: true });
    snapshots.length = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [] });
    useSessionUIStore.setState({ availableWorktreesByProject: new Map() });
    await dom.happyDOM.close();
  });

  test('lists a project session but not one from an unconfigured directory', async () => {
    // Both finished a turn nobody has viewed yet; only the listed one counts.
    useGlobalSessionsStore.setState((state) => ({
      activeSessions: state.activeSessions.map((item) => ({ ...item, time: { ...item.time, idle: 2 } })),
    }));
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-project']);
    expect(lastSnapshot()?.dockBadgeCount).toBe(1);
  });

  test('keeps a managed chat and an isolated space session', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('chat', undefined, '/home/.config/openchamber/chats/2026-10-26/session-1', CHAT_DRAFT_PROJECT_ID),
        session('space', undefined, '/spaces/a1b2c3d4e5f6/app'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id).sort()).toEqual(['chat', 'space']);
    // With the Chats section hidden the tray still lists the chat.
    useSessionDisplayStore.setState({ showChatsSection: false });
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id).sort()).toEqual(['chat', 'space']);
  });

  test('keeps a session inside a configured project worktree', async () => {
    // Managed worktrees live outside the project root, so only the worktree
    // map can resolve this directory; a path under /project would pass on the
    // project-prefix rule alone and pin nothing.
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map([
        ['/project', [{ path: '/opencode-worktrees/run-1', projectDirectory: '/project', branch: 'run-1', label: 'run-1' }]],
      ]),
    });
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-worktree', undefined, '/opencode-worktrees/run-1'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-worktree']);
  });

  test('hides in-work and pinned sessions until their destination is registered', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        { ...session('in-work', undefined, '/tmp/removed'), metadata: { openchamber: { work: { state: 'open' } } } },
        session('pinned', undefined, '/tmp/removed-too'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    const pinKey = getPinnedSessionKey(getRuntimeKey(), '/tmp/removed-too', 'pinned');
    useSessionPinnedStore.setState({ ids: new Set(pinKey ? [pinKey] : []) });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual([]);
    // Hidden sections cannot admit an unregistered destination either.
    useSessionDisplayStore.setState({ showPinnedSection: false, showWorkSection: false });
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual([]);
    useSessionPinnedStore.setState({ ids: new Set() });
  });

  test('drops a /btw fork, which the sidebar never lists', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-project'),
        { ...session('btw-fork'), metadata: { openchamber: { kind: 'btw', originalSessionID: 'in-project' } } },
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-project']);
  });

  test('hides a pending approval from an unregistered session destination', async () => {
    await act(async () => root.render(<Harness />));
    applyGlobalBlockingRequestEvents('/tmp/eval-run', [
      { type: 'permission.asked', properties: { id: 'orphan-ask', sessionID: 'elsewhere', action: 'bash', resources: ['rm -rf tmp'] } },
    ]);
    await flush();
    expect(lastSnapshot()?.approvals?.map((entry) => entry.id)).toEqual([]);
  });
});
=======

// #4698: the tray drops "Allow always" when a permission carries no save
// patterns, so every approval source has to carry the flag. The cross-directory
// index feeds the tray from two inputs — live events and the host seed — and the
// seed is the one that arrives already parsed.
describe('tray approvals carry whether a permission can be remembered', () => {
  const previousProjects = useProjectsStore.getState().projects;
  let dom: Window;
  let root: Root;
  const snapshots: Array<{ approvals?: Array<{ id: string; canSave: boolean }> }> = [];
  const invoke = async (command: string, args?: { approvals?: Array<{ id: string; canSave: boolean }> }) => {
    if (command === 'desktop_tray_update') snapshots.push(args as never);
    return null;
  };
  const listen = async () => () => {};
  const canSaveById = () => Object.fromEntries(
    (snapshots.at(-1)?.approvals ?? []).map((a) => [a.id, a.canSave]),
  );

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    jest.useFakeTimers();
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: true },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [{ id: 'repo', path: '/repo' }, { id: 'unopened', path: '/unopened' }] });
    useGlobalSessionsStore.setState({ activeSessions: [session('root')] });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    snapshots.length = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: previousProjects });
    jest.useRealTimers();
    await dom.happyDOM.close();
  });

  test('a live ask keeps its save patterns through to the tray', async () => {
    await act(async () => root.render(<Harness />));
    applyGlobalBlockingRequestEvents('/repo', [
      { type: 'permission.asked', properties: { id: 'live-save', sessionID: 'root', action: 'bash', resources: ['git status'], save: ['git *'] } },
      { type: 'permission.asked', properties: { id: 'live-once', sessionID: 'root', action: 'bash', resources: ['rm -rf tmp'] } },
    ]);
    await flush();

    expect(canSaveById()).toEqual({ 'live-save': true, 'live-once': false });
  });

  test('a seeded ask does too, so an unopened directory does not lose the option', async () => {
    await act(async () => root.render(<Harness />));
    await readHostBlockingRequestsSnapshot(async () => ({
      sessions: {},
      pending: { root: {
        permissions: [
          { id: 'seed-save', sessionID: 'root', action: 'bash', resources: ['git status'], save: ['git *'] },
          { id: 'seed-once', sessionID: 'root', action: 'bash', resources: ['rm -rf tmp'] },
        ],
        forms: [],
        pages: [],
      } },
      serverTime: 0,
    }), () => '/unopened');
    await flush();

    expect(canSaveById()).toEqual({ 'seed-save': true, 'seed-once': false });
  });

  test('a complete host snapshot removes an answered page from tray approvals', async () => {
    await act(async () => root.render(<Harness />));
    applyWaitingPageEvent({
      type: 'openchamber.page-waiting',
      properties: { sessionID: 'root', directory: '/repo', page: { id: 'answered-page', title: 'Services page binding' } },
    }, () => null);
    await flush();
    expect(canSaveById()).toEqual({ 'answered-page': false });

    await readHostBlockingRequestsSnapshot(async () => ({ sessions: {}, pending: {}, serverTime: Date.now() }), () => '/repo');
    await flush();
    expect(canSaveById()).toEqual({});
  });
});

type TraySnapshotForTest = {
  sessions?: Array<{ id: string }>;
  approvals?: Array<{ id: string }>;
  dockBadgeCount?: number;
};

// The tray is a short recent-work list, so it names the sessions the sidebar
// can show. A session whose directory belongs to no configured project (an
// eval run in /tmp, say) has no row there; it must not take a tray slot or a
// place in the dock badge, which the user could never clear.
describe('Tray sessions follow the configured projects', () => {
  let dom: Window;
  let root: Root;
  const snapshots: TraySnapshotForTest[] = [];
  const invoke = async (command: string, args?: TraySnapshotForTest) => {
    if (command === 'desktop_tray_update') snapshots.push(args ?? {});
    return null;
  };
  const listen = async () => () => {};
  const lastSnapshot = () => snapshots.at(-1);

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    jest.useFakeTimers();
    Object.assign(dom, {
      __OPENCHAMBER_PLATFORM__: 'darwin',
      __OPENCHAMBER_ELECTRON__: { runtime: 'electron', trayEnabled: true },
      __OPENCHAMBER_DESKTOP__: { invoke, listen },
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
    });
    Object.assign(globalThis, {
      window: dom, document: dom.document, navigator: dom.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }] });
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-project'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    useUIStore.setState({ dockBadgeEnabled: true, notifyOnSubtasks: false });
    useSessionDisplayStore.setState({ showChatsSection: true, showPinnedSection: true, showWorkSection: true });
    snapshots.length = 0;
    root = createRoot(document.createElement('div'));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    resetGlobalBlockingRequests();
    useProjectsStore.setState({ projects: [] });
    useSessionUIStore.setState({ availableWorktreesByProject: new Map() });
    jest.useRealTimers();
    await dom.happyDOM.close();
  });

  test('lists a project session but not one from an unconfigured directory', async () => {
    // Both finished a turn nobody has viewed yet; only the listed one counts.
    useGlobalSessionsStore.setState((state) => ({
      activeSessions: state.activeSessions.map((item) => ({ ...item, time: { ...item.time, idle: 2 } })),
    }));
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-project']);
    expect(lastSnapshot()?.dockBadgeCount).toBe(1);
  });

  test('keeps a managed chat and an isolated space session', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('chat', undefined, '/home/.config/openchamber/chats/2026-10-26/session-1', CHAT_DRAFT_PROJECT_ID),
        session('space', undefined, '/spaces/a1b2c3d4e5f6/app'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id).sort()).toEqual(['chat', 'space']);
    // With the Chats section hidden the tray still lists the chat.
    useSessionDisplayStore.setState({ showChatsSection: false });
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id).sort()).toEqual(['chat', 'space']);
  });

  test('keeps a session inside a configured project worktree', async () => {
    // Managed worktrees live outside the project root, so only the worktree
    // map can resolve this directory; a path under /project would pass on the
    // project-prefix rule alone and pin nothing.
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map([
        ['/project', [{ path: '/opencode-worktrees/run-1', projectDirectory: '/project', branch: 'run-1', label: 'run-1' }]],
      ]),
    });
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-worktree', undefined, '/opencode-worktrees/run-1'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-worktree']);
  });

  test('hides in-work and pinned sessions until their destination is registered', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        { ...session('in-work', undefined, '/tmp/removed'), metadata: { openchamber: { work: { state: 'open' } } } },
        session('pinned', undefined, '/tmp/removed-too'),
        session('elsewhere', undefined, '/tmp/eval-run'),
      ],
    });
    const pinKey = getPinnedSessionKey(getRuntimeKey(), '/tmp/removed-too', 'pinned');
    useSessionPinnedStore.setState({ ids: new Set(pinKey ? [pinKey] : []) });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual([]);
    // Hidden sections cannot admit an unregistered destination either.
    useSessionDisplayStore.setState({ showPinnedSection: false, showWorkSection: false });
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual([]);
    useSessionPinnedStore.setState({ ids: new Set() });
  });

  test('drops a /btw fork, which the sidebar never lists', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('in-project'),
        { ...session('btw-fork'), metadata: { openchamber: { kind: 'btw', originalSessionID: 'in-project' } } },
      ],
    });
    await act(async () => root.render(<Harness />));
    await flush();
    expect(lastSnapshot()?.sessions?.map((entry) => entry.id)).toEqual(['in-project']);
  });

  test('hides a pending approval from an unregistered session destination', async () => {
    await act(async () => root.render(<Harness />));
    applyGlobalBlockingRequestEvents('/tmp/eval-run', [
      { type: 'permission.asked', properties: { id: 'orphan-ask', sessionID: 'elsewhere', action: 'bash', resources: ['rm -rf tmp'] } },
    ]);
    await flush();
    expect(lastSnapshot()?.approvals?.map((entry) => entry.id)).toEqual([]);
  });
});
>>>>>>> upstream/main
