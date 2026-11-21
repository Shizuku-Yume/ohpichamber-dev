import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import type { WorktreeMetadata } from '@/types/worktree';
import { GitWorktreeRequestError, type GitWorktreeArchive } from '@/lib/api/types';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey } from '@/lib/runtime-switch';

const archivedSessionIds: string[][] = [];
const restoredSessionIds: string[][] = [];
const worktreeArchives: Array<{ sessionIds: string[] }> = [];
const teardowns: Array<{ projectDirectory: string; directory: string; teardownCommand: string }> = [];
let runTeardown: () => Promise<void> = async () => undefined;
const teardownAsks: Array<boolean | undefined> = [];
let resolveTeardown: () => Promise<string | undefined> = async () => undefined;
let runArchive: () => Promise<void> = async () => undefined;
let runRestore: () => Promise<{ id: string; conflicts: boolean }> = async () => ({ id: 'a1', conflicts: false });
let setupCommands: string[] | null = [];
let restoreFailedIds: string[] = [];
const createRestoreWorktree = mock(async () => worktree);
const removeRestoreWorktree = mock(async () => undefined);
const discoverSessions = mock(async () => {
  useGlobalSessionsStore.getState().upsertSession({ ...session, archivedAt: 1234, archiveRevision: '1' });
  const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
  return { activeSessions, archivedSessions };
});

type ProjectRef = { id: string; path: string };

mock.module('@/lib/worktrees/worktreeManager', () => ({
  resolveWorktreeTeardownCommand: (_project: ProjectRef, _worktree: WorktreeMetadata, options?: { ask?: boolean }) => {
    teardownAsks.push(options?.ask);
    return resolveTeardown();
  },
  archiveProjectWorktree: async (_project: ProjectRef, _worktree: WorktreeMetadata, input: { sessionIds: string[] }) => {
    worktreeArchives.push({ sessionIds: input.sessionIds });
    await runArchive();
    return { id: 'a1' };
  },
  createWorktree: createRestoreWorktree,
  listProjectWorktrees: async () => [],
  removeProjectWorktree: removeRestoreWorktree,
}));

const actualSessionActions = await import('@/sync/session-actions');
mock.module('@/sync/session-actions', () => ({
  ...actualSessionActions,
  archiveSessions: async (ids: string[]) => {
    archivedSessionIds.push(ids);
    return { archivedIds: ids, failedIds: [] };
  },
  unarchiveSessions: async (ids: string[]) => {
    restoredSessionIds.push(ids);
    return { failedIds: restoreFailedIds };
  },
}));

mock.module('@/lib/gitApi', () => ({
  canArchiveWorktrees: () => false,
  git: {
    worktree: {
      restoreArchive: async () => runRestore(),
      teardown: async (projectDirectory: string, payload: { directory: string; teardownCommand: string }) => {
        teardowns.push({ projectDirectory, ...payload });
        await runTeardown();
        return true;
      },
    },
  },
}));
mock.module('@/lib/sharedTrustConfirmation', () => ({ resolveWorktreeSetupCommandsOrCancel: async () => setupCommands }));

// The module subscribes to runtime switches at import, which needs a window.
const dom = new Window({ url: 'http://instance-a.test' });
for (const [name, value] of Object.entries({ window: dom, CustomEvent: dom.CustomEvent })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

const { archiveWorktreeWork, restoreArchivedWorktree } = await import('./worktreeArchive');

const project = { id: 'project', path: '/repo' };
const worktree: WorktreeMetadata = { path: '/repo-feature', branch: 'feature', projectDirectory: '/repo', label: 'feature' };
const session: Session = {
  sessionId: 'ses_1',
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: '/repo-feature',
  parentSessionId: undefined,
  rootSessionId: 'ses_1',
  title: 'Feature',
  createdAt: 1,
  updatedAt: 1,
  epoch: 'epoch',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
};

describe('archiveWorktreeWork teardown', () => {
  beforeEach(() => {
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useGlobalSessionsStore.setState({ loadSessions: discoverSessions });
    useGlobalSessionsStore.getState().upsertSession(session);
    discoverSessions.mockClear();
    archivedSessionIds.length = 0;
    restoredSessionIds.length = 0;
    worktreeArchives.length = 0;
    teardownAsks.length = 0;
    teardowns.length = 0;
    runTeardown = async () => undefined;
    runArchive = async () => undefined;
  });

  test('a pass nobody started leaves the sessions alone when the shared teardown is not trusted', async () => {
    resolveTeardown = () => Promise.reject(new Error('The repository\'s teardown commands are not trusted yet'));

    await expect(archiveWorktreeWork({ project, worktree, sessions: [session], askForTrust: false })).rejects.toThrow('not trusted yet');

    expect(teardownAsks).toEqual([false]);
    expect(archivedSessionIds).toEqual([]);
    expect(restoredSessionIds).toEqual([]);
    expect(worktreeArchives).toEqual([]);
  });

  test('a failing teardown archives and restores nothing', async () => {
    resolveTeardown = async () => 'docker compose down';
    runTeardown = () => Promise.reject(new Error('stack still running'));

    await expect(archiveWorktreeWork({ project, worktree, sessions: [session], askForTrust: false })).rejects.toThrow('stack still running');

    expect(archivedSessionIds).toEqual([]);
    expect(restoredSessionIds).toEqual([]);
    expect(worktreeArchives).toEqual([]);
  });

  test('Done runs the teardown before any session is archived, then archives the worktree', async () => {
    const order: string[] = [];
    resolveTeardown = async () => 'docker compose down';
    runTeardown = async () => {
      order.push(`teardown, ${archivedSessionIds.length} sessions archived`);
    };

    await archiveWorktreeWork({ project, worktree, sessions: [session] });

    expect(order).toEqual(['teardown, 0 sessions archived']);
    expect(teardownAsks).toEqual([undefined]);
    expect(teardowns).toEqual([{ projectDirectory: '/repo', directory: '/repo-feature', teardownCommand: 'docker compose down' }]);
    expect(archivedSessionIds).toEqual([]);
    expect(worktreeArchives).toEqual([{ sessionIds: ['ses_1'] }]);
  });

  test('nothing to tear down archives without a teardown request', async () => {
    resolveTeardown = async () => undefined;

    await archiveWorktreeWork({ project, worktree, sessions: [session] });

    expect(teardowns).toEqual([]);
    expect(worktreeArchives).toEqual([{ sessionIds: ['ses_1'] }]);
  });

  test('an empty client session list still lets the Host capture the checkout', async () => {
    resolveTeardown = async () => undefined;
    await archiveWorktreeWork({ project, worktree, sessions: [] });
    expect(worktreeArchives).toEqual([{ sessionIds: [] }]);
    expect(archivedSessionIds).toEqual([]);
    expect(discoverSessions).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])('Host capture reconciles the client before settling (partial: %s)', async (partial) => {
    resolveTeardown = async () => undefined;
    runArchive = async () => {
      expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
      expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([]);
      expect(discoverSessions).not.toHaveBeenCalled();
      if (partial) throw new GitWorktreeRequestError('WORKTREE_ARCHIVE_PARTIAL', 'Checkout removal incomplete', 409);
    };

    const archive = archiveWorktreeWork({ project, worktree, sessions: [session] });
    if (partial) await expect(archive).rejects.toThrow('Checkout removal incomplete');
    else await archive;

    const state = useGlobalSessionsStore.getState();
    expect(state.activeSessions.map((entry) => entry.sessionId)).toEqual([]);
    expect(state.archivedSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
    expect(state.entityById.get('ses_1')).toMatchObject({ archivedAt: 1234, archiveRevision: '1' });
    expect(discoverSessions).toHaveBeenCalledTimes(1);
    expect(archivedSessionIds).toEqual([]);
  });

  test('a refused Host capture does not refresh or archive the client sessions', async () => {
    resolveTeardown = async () => undefined;
    runArchive = async () => { throw new Error('Host capture refused'); };
    await expect(archiveWorktreeWork({ project, worktree, sessions: [session] })).rejects.toThrow('Host capture refused');
    expect(discoverSessions).not.toHaveBeenCalled();
    expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([]);
  });

  test('failed discovery preserves the previous client snapshot without undoing Host capture', async () => {
    resolveTeardown = async () => undefined;
    discoverSessions.mockImplementationOnce(async () => {
      useGlobalSessionsStore.setState({ status: 'error', globalRefreshFailed: true });
      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      return { activeSessions, archivedSessions };
    });
    await archiveWorktreeWork({ project, worktree, sessions: [session] });
    const state = useGlobalSessionsStore.getState();
    expect(state.globalRefreshFailed).toBe(true);
    expect(state.activeSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
    expect(state.archivedSessions).toEqual([]);
    expect(restoredSessionIds).toEqual([]);
    expect(discoverSessions).toHaveBeenCalledTimes(1);
  });

  test.each([
    new Error('Host capture refused'),
    new GitWorktreeRequestError('WORKTREE_ARCHIVE_PARTIAL', 'Checkout removal incomplete', 409),
  ])('a Host failure leaves session rollback to the Host (%s)', async (error) => {
    resolveTeardown = async () => undefined;
    runArchive = async () => { throw error; };
    await expect(archiveWorktreeWork({ project, worktree, sessions: [session] })).rejects.toThrow(error.message);
    expect(archivedSessionIds).toEqual([]);
    expect(restoredSessionIds).toEqual([]);
  });
});

describe('restoreArchivedWorktree reconciliation', () => {
  const archive: GitWorktreeArchive = {
    id: 'a1', ref: 'refs/openchamber/archives/a1', commit: 'snapshot', head: 'head',
    path: '/repo-feature', branch: 'feature', title: 'Feature', archivedAt: 1234,
    sessionIds: ['ses_1'], branchExists: true, sessionBinding: { status: 'bound' },
  };

  beforeEach(() => {
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useGlobalSessionsStore.setState({ loadSessions: discoverSessions });
    useGlobalSessionsStore.getState().upsertSession({ ...session, archivedAt: 1234, archiveRevision: '1' });
    discoverSessions.mockClear();
    restoredSessionIds.length = 0;
    restoreFailedIds = [];
    setupCommands = [];
    createRestoreWorktree.mockClear();
    removeRestoreWorktree.mockClear();
    runRestore = async () => ({ id: 'a1', conflicts: false });
  });

  test.each([
    { conflicts: false, failedIds: [] },
    { conflicts: true, failedIds: [] },
    { conflicts: false, failedIds: ['ses_1'] },
  ])('Host restore reconciles the client before returning (%j)', async ({ conflicts, failedIds }) => {
    restoreFailedIds = failedIds;
    runRestore = async () => {
      expect(useGlobalSessionsStore.getState().archivedSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
      expect(discoverSessions).not.toHaveBeenCalled();
      return { id: 'a1', conflicts };
    };
    discoverSessions.mockImplementationOnce(async () => {
      useGlobalSessionsStore.getState().upsertSession({ ...session, archiveRevision: '2' });
      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      return { activeSessions, archivedSessions };
    });

    expect(await restoreArchivedWorktree({ project, archive })).toMatchObject({
      outcome: 'restored', conflicts, sessionsFailed: failedIds.length,
    });
    const state = useGlobalSessionsStore.getState();
    expect(state.archivedSessions).toEqual([]);
    expect(state.activeSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
    expect(state.entityById.get('ses_1')?.archiveRevision).toBe('2');
    expect(discoverSessions).toHaveBeenCalledTimes(1);
  });

  test('a Host error after session restoration still reconciles before rejecting', async () => {
    runRestore = async () => { throw new Error('Archive finalization failed'); };
    discoverSessions.mockImplementationOnce(async () => {
      useGlobalSessionsStore.getState().upsertSession({ ...session, archiveRevision: '2' });
      const { activeSessions, archivedSessions } = useGlobalSessionsStore.getState();
      return { activeSessions, archivedSessions };
    });
    await expect(restoreArchivedWorktree({ project, archive })).rejects.toThrow('Archive finalization failed');
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([]);
    expect(useGlobalSessionsStore.getState().activeSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
    expect(removeRestoreWorktree).toHaveBeenCalledTimes(1);
    expect(discoverSessions).toHaveBeenCalledTimes(1);
  });

  test('cancellation does not create a checkout or refresh sessions', async () => {
    setupCommands = null;
    expect(await restoreArchivedWorktree({ project, archive })).toEqual({ outcome: 'cancelled' });
    expect(createRestoreWorktree).not.toHaveBeenCalled();
    expect(discoverSessions).not.toHaveBeenCalled();
    expect(useGlobalSessionsStore.getState().archivedSessions.map((entry) => entry.sessionId)).toEqual(['ses_1']);
  });

  test('a restore completed on an old runtime does not refresh the new runtime', async () => {
    const runtimeWindow = window as typeof window & { __OPENCHAMBER_API_BASE_URL__?: string };
    const previousUrl = runtimeWindow.__OPENCHAMBER_API_BASE_URL__;
    const runtimeKey = getRuntimeKey();
    runRestore = async () => {
      runtimeWindow.__OPENCHAMBER_API_BASE_URL__ = 'http://instance-b.test';
      expect(getRuntimeKey()).not.toBe(runtimeKey);
      return { id: 'a1', conflicts: false };
    };
    try {
      await restoreArchivedWorktree({ project, archive: { ...archive, sessionIds: [] } });
      expect(discoverSessions).not.toHaveBeenCalled();
    } finally {
      runtimeWindow.__OPENCHAMBER_API_BASE_URL__ = previousUrl;
    }
  });
});
