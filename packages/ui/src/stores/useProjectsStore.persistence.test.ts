import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { DesktopSettings } from '@/lib/desktop';
import { createProjectIdFromPath } from '@/lib/projectId';

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
let failWrite = 0;
let emptyProjects = false;
const canonicalPaths = new Map<string, string>();
const heldWrites: Array<() => void> = [];

mock.module('@/lib/persistence', () => ({
  updateDesktopSettings: async (changes: Partial<DesktopSettings>): Promise<{ ok: boolean; settings?: DesktopSettings }> => {
    persistCalls += 1;
    if (persistMode === 'rejected') throw new Error('settings write failed');
    if (persistMode === 'held') {
      const { promise, resolve } = Promise.withResolvers<void>();
      heldWrites.push(resolve);
      await promise;
    }
    const projects = emptyProjects ? [] : changes.projects?.map((entry) => {
      const path = canonicalPaths.get(entry.path) ?? entry.path;
      return { ...entry, path, id: createProjectIdFromPath(path) };
    });
    const activePath = changes.projects?.find((entry) => entry.id === changes.activeProjectId)?.path;
    const activeProjectId = activePath
      ? createProjectIdFromPath(canonicalPaths.get(activePath) ?? activePath)
      : changes.activeProjectId;
    return {
      ok: persistMode !== 'failed' && persistCalls !== failWrite,
      settings: {
        ...changes, projects, activeProjectId,
      },
    };
  },
}));

const iconCalls: string[] = [];
const refreshCalls: string[][] = [];
let refreshed = Promise.withResolvers<void>();
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
        refreshed.resolve();
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
  failWrite = 0;
  emptyProjects = false;
  canonicalPaths.clear();
  heldWrites.length = 0;
  iconCalls.length = 0;
  refreshCalls.length = 0;
  refreshed = Promise.withResolvers<void>();
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

  test('returns the Host-normalized identity for the first project draft and discovery', async () => {
    canonicalPaths.set('/tmp/project', '/private/tmp/project');

    const project = await useProjectsStore.getState().addProject('/tmp/project');

    expect(project?.path).toBe('/private/tmp/project');
    expect(project?.id).toBe(createProjectIdFromPath('/private/tmp/project'));
    expect(useProjectsStore.getState().projects).toEqual([expect.objectContaining({ id: project?.id, path: project?.path })]);
    expect(useProjectsStore.getState().activeProjectId).toBe(project?.id ?? null);
    expect(iconCalls).toEqual([`/api/projects/${project?.id}/icon/discover`]);
    expect(refreshCalls).toEqual([['/private/tmp/project']]);
  });

  test('normalizes a batch before returning the projects used to open drafts', async () => {
    canonicalPaths.set('/tmp/one', '/private/tmp/one');
    canonicalPaths.set('/tmp/two', '/private/tmp/two');

    const projects = await useProjectsStore.getState().addProjects(['/tmp/one', '/tmp/two']);
    await refreshed.promise;

    expect(projects.map((project) => project.path)).toEqual(['/private/tmp/one', '/private/tmp/two']);
    expect(useProjectsStore.getState().activeProjectId).toBe(projects[0]?.id ?? null);
    expect(useProjectsStore.getState().projects).toMatchObject(projects.map(({ id, path }) => ({ id, path })));
    expect(refreshCalls).toEqual([['/private/tmp/one', '/private/tmp/two']]);
  });

  test('does not invent a project when the acknowledged project list is empty', async () => {
    emptyProjects = true;

    expect(await useProjectsStore.getState().addProject('/repo/removed')).toBeNull();
    expect(await useProjectsStore.getState().addProjects(['/repo/removed'])).toEqual([]);
    expect(useProjectsStore.getState().projects).toEqual([]);
    expect(iconCalls).toEqual([]);
    expect(refreshCalls).toEqual([]);
  });

  test('does not open a normalized draft when its settings write fails', async () => {
    canonicalPaths.set('/tmp/project', '/private/tmp/project');
    failWrite = 1;

    expect(await useProjectsStore.getState().addProject('/tmp/project')).toBeNull();
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
