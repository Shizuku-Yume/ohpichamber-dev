import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, test } from 'bun:test';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { ChildStoreManager } from '@/sync/child-store';
import { FilesystemError } from '@/lib/api/files-errors';
import { installHookTestDom } from '../test-utils/testDom';
import type { SessionGroup, SessionNode } from '../types';
import type { ProjectSection } from '../projects/sessionProjectRender';
import { retryGroupStatus } from '../projects/sessionProjectListActions';
import { useSidebarGroupStatus, type SidebarGroupStatusResult } from './useSidebarGroupStatus';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

const sections: ProjectSection[] = [];
const chatGroup: SessionGroup = {
  id: 'managed-chats', label: '', branch: null, description: null, isMain: true,
  worktree: null, directory: '/chats', folderScopeKey: '/chats', sessions: [],
  folderScopes: [{ scopeKey: '/chats', directory: '/chats' }, { scopeKey: '/chats/session', directory: '/chats/session' }],
};

beforeEach(() => useGlobalSessionsStore.getState().resetForRuntimeSwitch());

for (const failure of ['load-failed', 'initialization-failed', 'permission-denied'] as const) {
  test(`a Chats-only sidebar observes ${failure} and a successful retry`, async () => {
    const dom = installHookTestDom();
    const root = createRoot(dom.container);
    const manager = new ChildStoreManager();
    const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
    let renders = 0;
    let fail = true;
    manager.configure({ onBootstrap: (context) => {
      if (!fail) { context.trackInitialization(Promise.resolve()); return; }
      if (failure === 'load-failed') throw new Error('list failed');
      const error = failure === 'permission-denied'
        ? new FilesystemError('Access denied', { reason: 'os-permission' })
        : new Error('initialization failed');
      context.trackInitialization(Promise.reject(error));
    } });
    const Harness = ({ nativeAccess = true }: { nativeAccess?: boolean }) => {
      renders += 1;
      captured.current = useSidebarGroupStatus({ childStores: manager, sections, chatGroup, canGrantAccess: nativeAccess });
      return null;
    };
    try {
      await act(async () => root.render(<Harness />));
      await act(async () => manager.requestBootstrap({ directory: '/chats/session', priority: 'selected', reason: 'selected-session' }));
      expect(captured.current?.groupStatusByKey.get('activity:chats')).toEqual({
        state: failure, directory: '/chats/session', canGrantAccess: failure === 'permission-denied',
      });
      await act(async () => root.render(<Harness nativeAccess={false} />));
      expect(captured.current?.groupStatusByKey.get('activity:chats')?.canGrantAccess).toBe(false);

      const previousRenders = renders;
      await act(async () => manager.requestBootstrap({ directory: '/unrelated', priority: 'selected', reason: 'selected-session' }));
      expect(renders).toBe(previousRenders);
      fail = false;
      await act(async () => manager.requestBootstrap({ directory: '/chats/session', priority: 'expanded', reason: 'project-expanded', force: true }));
      // One completed directory does not cover the other Chats scope.
      expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('loading');
      await act(async () => manager.requestBootstrap({ directory: '/chats', priority: 'selected', reason: 'current-directory' }));
      expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('ready');
    } finally {
      await act(async () => root.unmount());
      manager.disposeAll();
      dom.restore();
    }
  });
}

test('Chats loading ends when its list completes, without waiting for initialization', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  let resolveList: () => void = () => undefined;
  let resolveInitialization: () => void = () => undefined;
  const list = new Promise<void>((resolve) => { resolveList = resolve; });
  const initialization = new Promise<void>((resolve) => { resolveInitialization = resolve; });
  manager.configure({ onBootstrap: (context) => { context.trackInitialization(initialization); return list; } });
  const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections, chatGroup, canGrantAccess: false });
    return null;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => manager.requestBootstrap({ directory: '/chats', priority: 'selected', reason: 'selected-session' }));
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('loading');
    await act(async () => manager.requestBootstrap({ directory: '/chats/session', priority: 'selected', reason: 'selected-session' }));
    await act(async () => resolveList());
    expect(manager.getInitializationState('/chats')).toBe('running');
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('ready');
  } finally {
    await act(async () => { resolveList(); resolveInitialization(); root.unmount(); });
    manager.disposeAll();
    dom.restore();
  }
});

test('A complete global list keeps an opened empty group out of loading', async () => {
  useGlobalSessionsStore.getState().applySnapshot([], []);
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  let resolveList: () => void = () => undefined;
  const list = new Promise<void>((resolve) => { resolveList = resolve; });
  manager.configure({ onBootstrap: () => list });
  const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections, chatGroup, canGrantAccess: false });
    return null;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => manager.requestBootstrap({ directory: '/chats', priority: 'selected', reason: 'selected-session' }));
    expect(manager.getBootstrapState('/chats')).toBe('running');
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('ready');
  } finally {
    await act(async () => { resolveList(); root.unmount(); });
    manager.disposeAll();
    dom.restore();
  }
});

const projectGroup: SessionGroup = {
  ...chatGroup, id: 'root', directory: '/project', folderScopeKey: '/project', folderScopes: undefined,
};
const projectSections: ProjectSection[] = [{
  project: { id: 'project', normalizedPath: '/project' }, groups: [projectGroup],
}];

test('a global refresh error alone does not mark unopened groups failed; their own refresh does', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  let failProject = true;
  manager.configure({ onBootstrap: ({ directory }) => {
    if (directory === '/project' && failProject) throw new Error('list failed');
  } });
  const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections: projectSections, chatGroup, canGrantAccess: true });
    return null;
  };
  const states = () => [...(captured.current?.groupStatusByKey.values() ?? [])];
  try {
    await act(async () => root.render(<Harness />));
    expect(states().map((status) => status.state)).toEqual(['loading', 'loading']);
    await act(async () => useGlobalSessionsStore.setState({ status: 'loading' }));
    expect(states().map((status) => status.state)).toEqual(['loading', 'loading']);
    await act(async () => useGlobalSessionsStore.setState({ status: 'error' }));
    // A partial global error, but neither group ran its own refresh yet.
    expect(states().map((status) => status.state)).toEqual(['loading', 'loading']);
    await act(async () => useGlobalSessionsStore.setState({ status: 'error', globalRefreshFailed: true }));
    // A total global request failure keeps its retry visible on every group.
    expect(states().map((status) => status.state)).toEqual(['load-failed', 'load-failed']);
    await act(async () => useGlobalSessionsStore.setState({ status: 'loading', globalRefreshFailed: false }));
    await act(async () => manager.requestBootstrap({ directory: '/project', priority: 'selected', reason: 'current-directory' }));
    expect(captured.current?.groupStatusByKey.get('project:root')).toEqual({ state: 'load-failed', directory: '/project', canGrantAccess: false });
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('loading');
    failProject = false;
    await act(async () => manager.requestBootstrap({ directory: '/project', priority: 'expanded', reason: 'project-expanded', force: true }));
    await act(async () => manager.requestBootstrap({ directory: '/chats', priority: 'selected', reason: 'current-directory' }));
    await act(async () => manager.requestBootstrap({ directory: '/chats/session', priority: 'selected', reason: 'selected-session' }));
    expect(states().map((status) => status.state)).toEqual(['ready', 'ready']);
    // Routine polling must not flash loading over a known empty group.
    await act(async () => useGlobalSessionsStore.setState({ status: 'loading' }));
    expect(states().map((status) => status.state)).toEqual(['ready', 'ready']);
    await act(async () => useGlobalSessionsStore.getState().resetForRuntimeSwitch());
    expect(states().map((status) => status.state)).toEqual(['ready', 'ready']);
  } finally {
    await act(async () => root.unmount());
    manager.disposeAll();
    dom.restore();
  }
});

test('a complete directory does not inherit an unrelated refresh failure', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  manager.configure({ onBootstrap: () => undefined });
  const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections: projectSections, chatGroup, canGrantAccess: false });
    return null;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => manager.requestBootstrap({ directory: '/project', priority: 'selected', reason: 'current-directory' }));
    await act(async () => useGlobalSessionsStore.setState({ status: 'error' }));
    expect(captured.current?.groupStatusByKey.get('project:root')?.state).toBe('ready');
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('loading');
  } finally {
    await act(async () => root.unmount());
    manager.disposeAll();
    dom.restore();
  }
});

test('directory active-list coverage cannot finish an archived group before the global list', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  manager.configure({ onBootstrap: () => undefined });
  const archivedSections: ProjectSection[] = [{
    project: projectSections[0].project,
    groups: [projectGroup, { ...projectGroup, id: 'archived', isArchivedBucket: true }],
  }];
  const captured = React.createRef<ReturnType<typeof useSidebarGroupStatus>>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections: archivedSections, chatGroup: null, canGrantAccess: false });
    return null;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => manager.requestBootstrap({ directory: '/project', priority: 'selected', reason: 'current-directory' }));
    expect(captured.current?.groupStatusByKey.get('project:root')?.state).toBe('ready');
    expect(captured.current?.groupStatusByKey.get('project:archived')?.state).toBe('loading');
    await act(async () => useGlobalSessionsStore.getState().applySnapshot([], []));
    expect(captured.current?.groupStatusByKey.get('project:archived')?.state).toBe('ready');
  } finally {
    await act(async () => root.unmount());
    manager.disposeAll();
    dom.restore();
  }
});

test('scoped discovery error degrades only the failing workspace while healthy groups remain ready', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  manager.configure({ onBootstrap: () => undefined });
  const multiWorktreeSections: ProjectSection[] = [{
    project: projectSections[0].project,
    groups: [
      { ...projectGroup, id: 'healthy-wt', directory: '/project/healthy', folderScopes: [{ scopeKey: '/project/healthy', directory: '/project/healthy' }] },
      { ...projectGroup, id: 'failing-wt', directory: '/project/failing', folderScopes: [{ scopeKey: '/project/failing', directory: '/project/failing' }] },
    ],
  }];
  const captured = React.createRef<SidebarGroupStatusResult | null>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections: multiWorktreeSections, chatGroup: null, canGrantAccess: false });
    return null;
  };
    registerWorkspaceDirectory('wsp_healthy', '/project/healthy');
    registerWorkspaceDirectory('wsp_failing', '/project/failing');
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      useGlobalSessionsStore.setState({
        hasLoaded: true,
        status: 'ready',
        discoveryErrors: new Map([['wsp_failing', 'METADATA_READ_FAILED']]),
      });
    });
    expect(captured.current?.groupStatusByKey.get('project:healthy-wt')?.state).toBe('ready');
    expect(captured.current?.groupStatusByKey.get('project:failing-wt')?.state).toBe('load-failed');
  } finally {
    await act(async () => root.unmount());
    manager.disposeAll();
    dom.restore();
  }
});

test('Chats Retry refreshes the global list that reported the workspace error', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  const bootstrapped: string[] = [];
  manager.configure({ onBootstrap: ({ directory }) => { bootstrapped.push(directory); } });
  const captured = React.createRef<SidebarGroupStatusResult | null>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections, chatGroup, canGrantAccess: false });
    return null;
  };
  const { loadSessions } = useGlobalSessionsStore.getState();
  registerWorkspaceDirectory('wsp_managed_chats', '/chats');
  try {
    await act(async () => {
      useGlobalSessionsStore.setState({
        hasLoaded: true,
        status: 'ready',
        discoveryErrors: new Map([['wsp_managed_chats', 'SERVICE_UNAVAILABLE']]),
        loadSessions: async () => {
          useGlobalSessionsStore.setState({ discoveryErrors: new Map() });
          return { activeSessions: [], archivedSessions: [] };
        },
      });
      root.render(<Harness />);
    });
    const status = captured.current?.groupStatusByKey.get('activity:chats');
    if (!status) throw new Error('Expected Chats status');
    expect(status.state).toBe('load-failed');
    await act(async () => retryGroupStatus({
      kind: 'status', key: 'chats-status', estimateSize: 20, status, group: chatGroup, groupKey: 'activity:chats',
    }, manager));
    expect(captured.current?.groupStatusByKey.get('activity:chats')?.state).toBe('ready');
    expect(bootstrapped).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    useGlobalSessionsStore.setState({ loadSessions });
    manager.disposeAll();
    dom.restore();
  }
});

test('scoped discovery error degrades group by exact session workspaceId even when directory is unregistered', async () => {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  const manager = new ChildStoreManager();
  manager.configure({ onBootstrap: () => undefined });
  const mockSession = (workspaceId: string): SessionNode => ({
    session: {
      sessionId: `ses_${workspaceId}`, workspaceId, projectId: 'project',
      rootSessionId: `ses_${workspaceId}`, createdAt: 1, updatedAt: 1, epoch: 'e',
      headSequence: '0', runtimeStatus: 'idle', activeRunId: null, displayPath: 'p',
      mode: { kind: 'main' },
      title: 'T',
      metadata: {}, metadataRevision: '1', archiveRevision: '0',
    },
    children: [],
    worktree: null,
  });
  const sectionsWithSession: ProjectSection[] = [{
    project: projectSections[0].project,
    groups: [
      { ...projectGroup, id: 'exact-wt', directory: '/project/unregistered', folderScopes: [{ scopeKey: '/project/unregistered', directory: '/project/unregistered' }], sessions: [mockSession('wsp_exact_error')] },
    ],
  }];
  const captured = React.createRef<SidebarGroupStatusResult | null>();
  const Harness = () => {
    captured.current = useSidebarGroupStatus({ childStores: manager, sections: sectionsWithSession, chatGroup: null, canGrantAccess: false });
    return null;
  };
  try {
    await act(async () => root.render(<Harness />));
    await act(async () => {
      useGlobalSessionsStore.setState({
        hasLoaded: true,
        status: 'ready',
        discoveryErrors: new Map([['wsp_exact_error', 'COMMAND_IN_FLIGHT']]),
      });
    });
    expect(captured.current?.groupStatusByKey.get('project:exact-wt')?.state).toBe('load-failed');
  } finally {
    await act(async () => root.unmount());
    manager.disposeAll();
    dom.restore();
  }
});
