import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import {
  decideMergedWorktreeCleanup,
  hasUnmergedCommits,
  runMergedWorktreeCleanup,
  type MergedWorktreeCandidate,
  type MergedWorktreeOutcome,
} from './mergedWorktreeCleanup';

const WORKTREE = '/worktrees/feature';
const SHA = 'abc123';

const session = (id: string, directory = WORKTREE): Session => {
  const workspaceId = `workspace:${directory}`;
  registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId: id, projectId: 'app', workspaceId, displayPath: directory, rootSessionId: id,
    createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    metadata: null, metadataRevision: '0', archiveRevision: '0',
  };
};

const candidate: MergedWorktreeCandidate = {
  worktree: { path: WORKTREE, projectDirectory: '/projects/app', branch: 'feature', label: 'feature', worktreeStatus: 'ready' },
  project: { id: 'app', path: '/projects/app' },
  prNumber: 7,
  mergedHeadSha: SHA,
};

const setup = (options: {
  sessions?: Session[];
  busy?: string[];
  open?: string[];
  worktreeOpen?: boolean;
  isDirty?: boolean | null;
  hasUnmergedCommits?: boolean | null;
  gitFails?: boolean;
  handled?: boolean;
  archiveFails?: boolean;
  removing?: string[];
  restored?: string[];
}) => {
  const handled = new Set<string>(options.handled ? [WORKTREE] : []);
  const archived: string[][] = [];
  const archivedWorktrees: Array<{ path: string; sessions: string[] }> = [];
  const restoredTaken: string[] = [];
  const reports: MergedWorktreeOutcome[] = [];
  const calls = { archived, archivedWorktrees, restoredTaken, removed: 0, reports };
  const deps = {
    listCandidates: (): MergedWorktreeCandidate[] => [candidate],
    isHandled: (entry: MergedWorktreeCandidate): boolean => handled.has(entry.worktree.path),
    markHandled: (entry: MergedWorktreeCandidate): void => { handled.add(entry.worktree.path); },
    getActiveSessions: (): readonly Session[] => options.sessions ?? [session('a'), session('elsewhere', '/projects/app')],
    isSessionIdle: (id: string): boolean => !(options.busy ?? []).includes(id),
    isSessionOpen: (id: string): boolean => (options.open ?? []).includes(id),
    isWorktreeOpen: (): boolean => options.worktreeOpen ?? false,
    isWorktreeRemoving: (path: string): boolean => (options.removing ?? []).includes(path),
    takeRestored: (path: string): boolean => {
      if (!(options.restored ?? []).includes(path)) return false;
      calls.restoredTaken.push(path);
      return true;
    },
    readWorktreeState: async (): Promise<{ isDirty: boolean | null; hasUnmergedCommits: boolean | null }> => {
      if (options.gitFails) throw new Error('git unavailable');
      return { isDirty: options.isDirty ?? false, hasUnmergedCommits: options.hasUnmergedCommits === undefined ? false : options.hasUnmergedCommits };
    },
    archiveSessions: async (ids: string[]): Promise<{ failedIds: string[] }> => {
      calls.archived.push(ids);
      return { failedIds: [] };
    },
    removeWorktree: async (): Promise<void> => { calls.removed += 1; },
    archiveWorktree: async (entry: MergedWorktreeCandidate, sessions: readonly Session[]): Promise<void> => {
      if (options.archiveFails) throw new Error('archive refused');
      calls.archivedWorktrees.push({ path: entry.worktree.path, sessions: sessions.map((item) => item.sessionId) });
    },
    report: (outcome: MergedWorktreeOutcome): void => { calls.reports.push(outcome); },
  };
  return { deps, calls, handled };
};

describe('decideMergedWorktreeCleanup', () => {
  const base = { sessionsBusyOrUnknown: false, sessionOpen: false, isDirty: false, hasUnmergedCommits: false };

  test('removes only when the checkout is clean and holds no commit the merged PR lacks', () => {
    expect(decideMergedWorktreeCleanup(base)).toEqual({ action: 'remove' });
    expect(decideMergedWorktreeCleanup({ ...base, isDirty: true })).toEqual({ action: 'archive-only' });
    expect(decideMergedWorktreeCleanup({ ...base, isDirty: null })).toEqual({ action: 'archive-only' });
    expect(decideMergedWorktreeCleanup({ ...base, hasUnmergedCommits: true })).toEqual({ action: 'archive-only' });
    expect(decideMergedWorktreeCleanup({ ...base, hasUnmergedCommits: null })).toEqual({ action: 'archive-only' });
  });

  test('waits while an agent runs or a session is open', () => {
    expect(decideMergedWorktreeCleanup({ ...base, sessionsBusyOrUnknown: true })).toEqual({ action: 'wait' });
    expect(decideMergedWorktreeCleanup({ ...base, sessionOpen: true })).toEqual({ action: 'wait' });
  });
});

describe('hasUnmergedCommits', () => {
  const pushed = { tracking: 'origin/feature', ahead: 0 };

  test('the PR head answers when this clone has it, including a checkout behind it', async () => {
    expect(await hasUnmergedCommits({ mergedHeadSha: SHA, status: pushed, hasCommitsAfter: async () => false })).toBe(false);
    expect(await hasUnmergedCommits({ mergedHeadSha: SHA, status: pushed, hasCommitsAfter: async () => true })).toBe(true);
  });

  test('without the PR head, only a branch with nothing left to push has lost nothing', async () => {
    const missing = async (): Promise<boolean> => { throw new Error('unknown revision'); };
    expect(await hasUnmergedCommits({ mergedHeadSha: SHA, status: pushed, hasCommitsAfter: missing })).toBe(false);
    expect(await hasUnmergedCommits({ mergedHeadSha: SHA, status: { ...pushed, ahead: 2 }, hasCommitsAfter: missing })).toBe(true);
    expect(await hasUnmergedCommits({ mergedHeadSha: SHA, status: { tracking: null, ahead: 0 }, hasCommitsAfter: missing })).toBeNull();
    expect(await hasUnmergedCommits({ mergedHeadSha: null, status: { tracking: null, ahead: 0 }, hasCommitsAfter: missing })).toBeNull();
  });
});

describe('runMergedWorktreeCleanup', () => {
  test('archives the worktree sessions, then removes the worktree', async () => {
    const { deps, calls } = setup({});
    await runMergedWorktreeCleanup(deps);
    expect(calls.archived).toEqual([['a']]);
    expect(calls.removed).toBe(1);
    expect(calls.reports.map((entry) => entry.kind)).toEqual(['removed']);
  });

  test('keeps a worktree with commits after the merge and archives it through the archive flow once', async () => {
    const { deps, calls } = setup({ hasUnmergedCommits: true });
    await runMergedWorktreeCleanup(deps);
    await runMergedWorktreeCleanup(deps);
    expect(calls.archived).toEqual([]);
    expect(calls.archivedWorktrees).toEqual([{ path: WORKTREE, sessions: ['a'] }]);
    expect(calls.removed).toBe(0);
    expect(calls.reports.map((entry) => entry.kind)).toEqual(['archived']);
  });

  test('a busy agent, an open session or an open draft there leaves it for a later pass', async () => {
    for (const options of [{ busy: ['a'] }, { open: ['a'] }, { worktreeOpen: true }]) {
      const { deps, calls, handled } = setup(options);
      await runMergedWorktreeCleanup(deps);
      expect(calls.archived).toEqual([]);
      expect(calls.archivedWorktrees).toEqual([]);
      expect(handled.size).toBe(0);
    }
  });

  test('a worktree being removed right now is left alone', async () => {
    const { deps, calls, handled } = setup({ removing: [WORKTREE] });
    await runMergedWorktreeCleanup(deps);
    expect(calls.archived).toEqual([]);
    expect(calls.archivedWorktrees).toEqual([]);
    expect(handled.size).toBe(0);
  });

  test('a worktree the user restored is marked done instead of archived again', async () => {
    const { deps, calls, handled } = setup({ restored: [WORKTREE] });
    await runMergedWorktreeCleanup(deps);
    expect(calls.restoredTaken).toEqual([WORKTREE]);
    expect(calls.archivedWorktrees).toEqual([]);
    expect(handled.has(WORKTREE)).toBe(true);
  });

  test('git that cannot answer decides nothing', async () => {
    const { deps, calls, handled } = setup({ gitFails: true });
    await runMergedWorktreeCleanup(deps);
    expect(calls.archived).toEqual([]);
    expect(calls.archivedWorktrees).toEqual([]);
    expect(handled.size).toBe(0);
  });

  test('a failed archive keeps the worktree and is reported', async () => {
    const { deps, calls } = setup({ archiveFails: true, hasUnmergedCommits: true });
    await runMergedWorktreeCleanup(deps);
    expect(calls.removed).toBe(0);
    expect(calls.reports.map((entry) => entry.kind)).toEqual(['failed']);
  });

  test('a kept worktree without sessions is archived all the same', async () => {
    const { deps, calls } = setup({ sessions: [], isDirty: true });
    await runMergedWorktreeCleanup(deps);
    expect(calls.archivedWorktrees).toEqual([{ path: WORKTREE, sessions: [] }]);
    expect(calls.archived).toEqual([]);
    expect(calls.reports.map((entry) => entry.kind)).toEqual(['archived']);
  });

  test('a handled kept worktree is not archived again on the next pass', async () => {
    const { deps, calls } = setup({ sessions: [], isDirty: true });
    await runMergedWorktreeCleanup(deps);
    await runMergedWorktreeCleanup(deps);
    expect(calls.archivedWorktrees).toHaveLength(1);
    expect(calls.reports.map((entry) => entry.kind)).toEqual(['archived']);
  });

  test('sessions in a kept worktree mean the work went on there: nothing is archived or removed', async () => {
    const { deps, calls } = setup({ handled: true });
    await runMergedWorktreeCleanup(deps);
    expect(calls.archived).toEqual([]);
    expect(calls.archivedWorktrees).toEqual([]);
    expect(calls.removed).toBe(0);
  });
});
