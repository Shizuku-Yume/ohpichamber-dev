import { beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * A project the server cannot see yet answers 404 for its workspace and its
 * icon. These tests pin the order: the settings write lands before the store
 * publishes the entry, before the icon read, and before the session refresh.
 *
 * The store is imported with a dynamic import because `mock.module` only
 * applies to imports that happen after it; a static import would bind the
 * real persistence module first.
 */

let persistMode: 'ok' | 'failed' | 'rejected' | 'held' = 'ok';
let persistCalls = 0;
const heldWrites: Array<() => void> = [];

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async (): Promise<{ ok: boolean }> => {
    persistCalls += 1;
    if (persistMode === 'rejected') throw new Error('settings write failed');
    if (persistMode === 'held') {
      const { promise, resolve } = Promise.withResolvers<void>();
      heldWrites.push(resolve);
      await promise;
    }
    return { ok: persistMode !== 'failed' };
  },
}));

const iconCalls: string[] = [];
const refreshCalls: string[][] = [];
let iconResponse: () => Response = () => new Response('{}', { status: 200 });

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: async (path: string) => {
    if (path.includes('/icon/discover')) {
      iconCalls.push(path);
      return iconResponse();
    }
    return new Response('{}', { status: 200 });
  },
}));

mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: {
    getState: () => ({ availableWorktreesByProject: new Map() }),
    setState: () => undefined,
  },
}));

mock.module('@/stores/useSessionFoldersStore', () => ({
  useSessionFoldersStore: { getState: () => ({ forgetScopes: () => undefined }) },
}));

mock.module('@/stores/useDirectoryStore', () => ({
  useDirectoryStore: {
    getState: () => ({
      homeDirectory: '/home/user',
      currentDirectory: '/',
      setDirectory: () => undefined,
      goToNoProjectDirectory: async () => undefined,
    }),
    setState: () => undefined,
  },
}));

mock.module('@/stores/useGlobalSessionsStore', () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      entityById: new Map(),
      activeSessions: [],
      archivedSessions: [],
      refreshSessionsForDirectories: async (directories: Iterable<string>) => {
        refreshCalls.push([...directories]);
        return { activeSessions: [], archivedSessions: [] };
      },
    }),
  },
  resolveGlobalSessionDirectory: () => null,
}));

const { useProjectsStore } = await import('./useProjectsStore');

const reset = () => {
  persistMode = 'ok';
  persistCalls = 0;
  heldWrites.length = 0;
  iconCalls.length = 0;
  refreshCalls.length = 0;
  iconResponse = () => new Response('{}', { status: 200 });
  useProjectsStore.setState({ projects: [], activeProjectId: null, manualProjectOrder: [] });
};

describe('useProjectsStore persistence ordering', () => {
  beforeEach(reset);

  test('addProject waits for the settings write before publishing the project', async () => {
    persistMode = 'held';

    const added = useProjectsStore.getState().addProject('/repo/new');
    // The first await is the settings write, so nothing is published yet.
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(iconCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
    expect(persistCalls).toBe(1);

    heldWrites[0]();
    const project = await added;

    expect(project?.path).toBe('/repo/new');
    expect(useProjectsStore.getState().projects.map((entry) => entry.path)).toEqual(['/repo/new']);
    expect(iconCalls).toHaveLength(1);
    expect(refreshCalls).toEqual([['/repo/new']]);
  });

  test('a failed settings write surfaces as a missing project instead of a 404 follow-up', async () => {
    persistMode = 'failed';

    const project = await useProjectsStore.getState().addProject('/repo/lost');

    expect(project).toBeNull();
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(iconCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('a rejected settings write rejects the add and leaves no project behind', async () => {
    persistMode = 'rejected';

    await expect(useProjectsStore.getState().addProject('/repo/boom')).rejects.toThrow('settings write failed');

    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(iconCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('addProjects persists the batch before publishing it', async () => {
    persistMode = 'failed';

    const added = await useProjectsStore.getState().addProjects(['/repo/one', '/repo/two']);

    expect(added).toEqual([]);
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(iconCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('a project without a favicon reports an empty discovery, not a failure', async () => {
    iconResponse = () => Response.json({ project: { id: 'x' }, skipped: true, reason: 'no-favicon-found' });

    const project = await useProjectsStore.getState().addProject('/repo/no-icon');

    expect(project?.path).toBe('/repo/no-icon');
    expect(useProjectsStore.getState().projects.map((entry) => entry.path)).toEqual(['/repo/no-icon']);
    const result = await useProjectsStore.getState().discoverProjectIcon('x');
    expect(result).toEqual({ status: 'no-favicon-found' });
  });

  test('a real icon discovery failure stays a failure', async () => {
    iconResponse = () => Response.json({ error: 'Project not found' }, { status: 404 });

    const result = await useProjectsStore.getState().discoverProjectIcon('x');

    expect(result).toEqual({ status: 'failed', error: 'Project not found' });
  });
});
