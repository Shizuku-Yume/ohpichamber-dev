import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { buildSessionRetentionCandidates, isSessionKeptByUser, runSessionRetentionCleanup, useSessionRetentionRunStore } from './session-retention';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { getPinnedSessionKey } from '@/stores/useSessionPinnedStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from './session-ui-store';
import { replaceGlobalSessionStatusById } from './global-session-status';
<<<<<<< HEAD
import * as actions from './session-actions';
=======
import { buildSessionRetentionCandidates, inWorkKeepsSessions, isSessionKeptByUser, runSessionRetentionCleanup, useSessionRetentionRunStore } from './session-retention';
>>>>>>> bc50ba56a

const day = 86_400_000;
const now = Date.now();
const session = (sessionId: string, patch: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: 'repo', rootSessionId: sessionId,
  createdAt: now - 60 * day, updatedAt: now - 40 * day, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, metadata: null, metadataRevision: '0', archiveRevision: '0',
  ...patch,
});
const recent = Array.from({ length: 5 }, (_, index) => session(`recent-${index}`, { createdAt: now - day, updatedAt: now - day }));
const candidates = (sessions: Session[], action: 'archive' | 'delete' = 'delete') => buildSessionRetentionCandidates({
  sessions: [...recent, ...sessions], cutoffDays: 30, currentSessionId: null, action, activeSessionIds: new Set(), now,
});

<<<<<<< HEAD
describe('native retention eligibility', () => {
  test('retains recent, current, archived, and running sessions', () => {
    const archived = session('archived', { archivedAt: 3 });
=======
beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://retention.test', runtimeKey: 'retention-test' });
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSessionUIStore.setState({ currentSessionId: null, isLoading: false });
  replaceGlobalSessionStatusById(new Map());
  useUIStore.setState({
    autoDeleteEnabled: true, autoDeleteAfterDays: 30, sessionRetentionAction: 'delete', sessionRetentionOnlyArchived: false, autoDeleteLastRunAt: 0,
    sessionWorkEnabled: true, sessionRetentionIncludeInWork: false,
  });
  spyOn(useGlobalSessionsStore.getState(), 'loadSessions').mockImplementation(async () => {
    const state = useGlobalSessionsStore.getState();
    return { activeSessions: state.activeSessions, archivedSessions: state.archivedSessions };
  });
  spyOn(opencodeClient, 'getSession').mockImplementation(async (id) => {
    const item = useGlobalSessionsStore.getState().entityById.get(id);
    if (!item) throw Object.assign(new Error('not found'), { status: 404 });
    return item;
  });
  spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { mock.restore(); });

describe('retention eligibility', () => {
  test('retains recent, current, archived and running sessions', () => {
    const sessions = [
      session('old'), session('current'),
      session('archived', { time: { created: 1, updated: 2, archived: 3 } }), session('busy'),
    ];
>>>>>>> bc50ba56a
    expect(buildSessionRetentionCandidates({
      sessions: [...recent, session('old'), session('current'), archived, session('busy')],
      cutoffDays: 30, currentSessionId: 'current', action: 'delete', activeSessionIds: new Set(['busy']), now,
    })).toEqual(['old']);
  });
<<<<<<< HEAD
  test('keeps pinned and open-work sessions when a directory resolver is supplied', () => {
    const pinned = session('pinned');
    const inWork = session('in-work', { metadata: { openchamber: { work: { state: 'open' } } }, metadataRevision: '1' });
    const old = session('old');
    const pinnedIds = new Set([getPinnedSessionKey(getRuntimeKey(), 'repo', 'pinned')!]);
    const isKept = (entry: Session) => isSessionKeptByUser(entry, pinnedIds, 'repo');
    expect(buildSessionRetentionCandidates({
      sessions: [...recent, pinned, inWork, old], cutoffDays: 30, currentSessionId: null,
      action: 'archive', activeSessionIds: new Set(), isKept, now,
    })).toEqual(['old']);
=======

  test('keeps pinned sessions, and In work sessions while the In work block keeps them', () => {
    const pinned = session('pinned', { metadata: { openchamber: { pinned: { at: 1 } } } });
    const inWork = session('in-work', { metadata: { openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'auto' } } } });
    const doneWork = session('done-work', { metadata: { openchamber: { work: { state: 'done', openedAt: 1, openedBy: 'user', doneAt: 2 } } } });
    const eligible = (workKeeps: boolean) => buildSessionRetentionCandidates({
      sessions: [...recent, session('old'), pinned, inWork, doneWork], cutoffDays: 30, currentSessionId: null,
      action: 'archive', activeSessionIds: new Set(), isKept: (item) => isSessionKeptByUser(item, new Set(), workKeeps), now,
    }).sort();
    expect(eligible(true)).toEqual(['done-work', 'old']);
    expect(eligible(false)).toEqual(['done-work', 'in-work', 'old']);
    expect(inWorkKeepsSessions({ sessionWorkEnabled: true, sessionRetentionIncludeInWork: false })).toBe(true);
    expect(inWorkKeepsSessions({ sessionWorkEnabled: true, sessionRetentionIncludeInWork: true })).toBe(false);
    // Without sessions in work nobody sees the block or can press Done.
    expect(inWorkKeepsSessions({ sessionWorkEnabled: false, sessionRetentionIncludeInWork: false })).toBe(false);
>>>>>>> bc50ba56a
  });
  test('protects native running sessions and Host pins without directory knowledge', () => {
    const running = session('running', { runtimeStatus: 'running', activeRunId: 'run_1' });
    const pinned = session('host-pinned', { metadata: { isPinned: true }, metadataRevision: '1' });
    expect(buildSessionRetentionCandidates({ sessions: [...recent, running, pinned, session('old')], cutoffDays: 30, currentSessionId: null, action: 'delete', activeSessionIds: new Set(), isKept: (entry) => isSessionKeptByUser(entry, new Set(), null), now })).toEqual(['old']);
  });
  test('protects every ancestor of a retained child from cascade deletion', () => {
    expect(candidates([
      session('root'), session('middle', { parentSessionId: 'root' }),
      { ...recent[0], sessionId: 'child', parentSessionId: 'middle' }, session('unrelated'),
    ])).toEqual(['unrelated']);
  });
  test('archives old parents independently because archive does not cascade', () => {
    expect(candidates([session('root'), { ...recent[0], sessionId: 'child', parentSessionId: 'root' }], 'archive')).toEqual(['root']);
  });
  test('orders descendants before ancestors', () => {
    expect(candidates([session('root'), session('child', { parentSessionId: 'root' }), session('leaf', { parentSessionId: 'child' })]))
      .toEqual(['leaf', 'child', 'root']);
  });
  test('uses archive time for archived-only retention', () => {
    const old = session('old', { archivedAt: now - 40 * day, updatedAt: now });
    const recentArchived = session('recent-archived', { archivedAt: now - day, updatedAt: 1 });
    expect(buildSessionRetentionCandidates({
      sessions: [...recent.map((entry) => ({ ...entry, archivedAt: now - day })), old, recentArchived], cutoffDays: 30, currentSessionId: null,
      action: 'delete', onlyArchived: true, activeSessionIds: new Set(), now,
    })).toEqual(['old']);
  });
  test('rejects invalid periods and cyclic hierarchies', () => {
    for (const cutoffDays of [0, -1, NaN, Infinity]) {
      expect(buildSessionRetentionCandidates({ sessions: [session('old')], cutoffDays, currentSessionId: null, action: 'delete', activeSessionIds: new Set(), now })).toEqual([]);
    }
    expect(candidates([session('a', { parentSessionId: 'b' }), session('b', { parentSessionId: 'a' })])).toEqual([]);
  });
});

describe('native retention execution', () => {
  const store = useGlobalSessionsStore;
  const seed = (items: Session[]) => store.getState().applySnapshot(
    [...recent, ...items.filter((item) => item.archivedAt === undefined)],
    items.filter((item) => item.archivedAt !== undefined),
  );
  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://retention.test', runtimeKey: 'retention-test' });
    store.getState().resetForRuntimeSwitch();
    registerWorkspaceDirectory('workspace', '/retention-project');
    useSessionUIStore.setState({ currentSessionId: null, isLoading: false });
    useSessionRetentionRunStore.setState({ isRunning: false });
    replaceGlobalSessionStatusById(new Map());
    useUIStore.setState({ autoDeleteEnabled: true, autoDeleteAfterDays: 30, sessionRetentionAction: 'delete', sessionRetentionOnlyArchived: false, autoDeleteLastRunAt: 0 });
    spyOn(store.getState(), 'loadSessions').mockImplementation(async () => ({ activeSessions: store.getState().activeSessions, archivedSessions: store.getState().archivedSessions }));
    spyOn(actions, 'deleteSession').mockImplementation(async (sessionId) => { store.getState().removeSessions([sessionId]); return true; });
    spyOn(actions, 'archiveSession').mockImplementation(async (sessionId) => { store.getState().archiveSessions([sessionId], now); return true; });
  });
  afterEach(() => { mock.restore(); });

  test('claims the shared lock before loading and releases after failure', async () => {
    seed([session('old')]);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    spyOn(store.getState(), 'loadSessions').mockImplementation(async () => { await gate; throw new Error('offline'); });
    const first = runSessionRetentionCleanup({ force: true });
    expect(useSessionRetentionRunStore.getState().isRunning).toBe(true);
    expect((await runSessionRetentionCleanup({ force: true })).skippedReason).toBe('running');
    finish();
    await expect(first).rejects.toThrow('offline');
    expect(useSessionRetentionRunStore.getState().isRunning).toBe(false);
  });
  test('refuses incomplete global authority while preserving fallback', async () => {
    seed([session('old')]);
    store.setState({ status: 'error' });
    await expect(runSessionRetentionCleanup({ force: true })).rejects.toThrow('complete session list');
    expect(actions.deleteSession).not.toHaveBeenCalled();
    expect(store.getState().entityById.has('old')).toBe(true);
  });
  test('reloads fresh authority before selecting candidates', async () => {
    seed([session('old')]);
    spyOn(store.getState(), 'loadSessions').mockImplementation(async () => {
      seed([session('old', { updatedAt: now })]);
      return { activeSessions: store.getState().activeSessions, archivedSessions: [] };
    });
    expect((await runSessionRetentionCleanup({ force: true })).skippedReason).toBe('no-candidates');
    expect(actions.deleteSession).not.toHaveBeenCalled();
  });
  test('protects failed descendants without blocking unrelated successes', async () => {
    seed([session('root'), session('child', { parentSessionId: 'root' }), session('leaf', { parentSessionId: 'child' }), session('other')]);
    const remove = spyOn(actions, 'deleteSession').mockImplementation(async (sessionId) => {
      if (sessionId === 'leaf') return false;
      store.getState().removeSessions([sessionId]);
      return true;
    });
    const result = await runSessionRetentionCleanup({ force: true });
    expect(result.completedIds).toEqual(['other']);
    expect(result.failedIds).toEqual(['leaf', 'child', 'root']);
    expect(remove.mock.calls.map(([sessionId]) => sessionId)).toEqual(['leaf', 'other']);
  });
  test('rechecks selection, recency, and new descendants between actions', async () => {
    seed([session('first'), session('selected'), session('updated'), session('parent')]);
    const remove = spyOn(actions, 'deleteSession').mockImplementation(async (sessionId) => {
      store.getState().removeSessions([sessionId]);
      useSessionUIStore.setState({ currentSessionId: 'selected' });
      store.getState().upsertSessions([session('updated', { updatedAt: now }), session('new-child', { parentSessionId: 'parent', updatedAt: now })]);
      return true;
    });
    expect((await runSessionRetentionCleanup({ force: true })).completedIds).toEqual(['first']);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(store.getState().entityById.has('parent')).toBe(true);
  });
<<<<<<< HEAD
  test('stops on runtime change without changing destination cooldown', async () => {
=======

  test('takes In work sessions only while retention includes them, rechecked before each request', async () => {
    const work = { metadata: { openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'auto' } } } };
    seed([session('first', work), session('second', work)]);
    expect((await runSessionRetentionCleanup({ force: true })).skippedReason).toBe('no-candidates');

    useUIStore.setState({ sessionRetentionIncludeInWork: true });
    const remove = spyOn(opencodeClient, 'deleteSession').mockImplementation(async () => {
      useUIStore.setState({ sessionRetentionIncludeInWork: false });
      return true;
    });
    const result = await runSessionRetentionCleanup({ force: true });
    expect(result.completedIds).toHaveLength(1);
    expect(result.failedIds).toEqual([]);
    expect(remove.mock.calls).toHaveLength(1);
  });

  test('stops at a runtime switch without reconciling the destination or its cooldown', async () => {
>>>>>>> bc50ba56a
    seed([session('first'), session('second')]);
    const remove = spyOn(actions, 'deleteSession').mockImplementation(async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://retention-other.test', runtimeKey: 'retention-other' });
      useUIStore.setState({ autoDeleteLastRunAt: 123 });
      return false;
    });
    const result = await runSessionRetentionCleanup({ force: true });
    expect(result.failedIds).toEqual(['first', 'second']);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().autoDeleteLastRunAt).toBe(123);
  });
  test('delegates archive to its action owner with captured runtime', async () => {
    seed([session('old')]);
    useUIStore.setState({ sessionRetentionAction: 'archive' });
    expect((await runSessionRetentionCleanup({ force: true })).completedIds).toEqual(['old']);
    expect(actions.archiveSession).toHaveBeenCalledWith('old', getRuntimeKey());
    expect(actions.deleteSession).not.toHaveBeenCalled();
  });
  test('processes 850 hierarchical sessions once each', async () => {
    seed(Array.from({ length: 850 }, (_, index) => session(`old-${index}`, index % 10 ? { parentSessionId: `old-${index - index % 10}` } : {})));
    const result = await runSessionRetentionCleanup({ force: true });
    expect(result.completedIds).toHaveLength(850);
    expect(result.failedIds).toEqual([]);
    expect(actions.deleteSession).toHaveBeenCalledTimes(850);
    expect(store.getState().activeSessions).toHaveLength(5);
  });
<<<<<<< HEAD
  test('forces deletion for archived-only retention', async () => {
    seed([
      ...recent.map((entry) => ({ ...entry, sessionId: `archived-${entry.sessionId}`, archivedAt: now - day })),
      session('parent', { archivedAt: now - 40 * day }), session('child', { parentSessionId: 'parent', archivedAt: now - 40 * day }),
    ]);
=======
});

describe('archived-only retention', () => {
  const archivedCandidates = (sessions: Session[]) => buildSessionRetentionCandidates({
    sessions: [...recentArchived, ...sessions], cutoffDays: 30, currentSessionId: null,
    action: 'archive', onlyArchived: true, activeSessionIds: new Set(), now,
  });

  test('filters only archived sessions and uses archive time instead of last activity', () => {
    expect(archivedCandidates([
      archived('old-archive', { time: { created: 1, updated: now, archived: now - 40 * day } }),
      archived('new-archive', { time: { created: 1, updated: 2, archived: now - 2 * day } }),
      session('unarchived'),
      session('restored', { time: { created: 1, updated: 2, archived: 0 } }),
    ])).toEqual(['old-archive']);
  });

  test('deletes archived sessions whose metadata still carries open work, which no block lists', () => {
    const staleWork = archived('stale-work', { metadata: { openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'auto' } } } });
    expect(buildSessionRetentionCandidates({
      sessions: [...recentArchived, staleWork], cutoffDays: 30, currentSessionId: null,
      action: 'delete', onlyArchived: true, activeSessionIds: new Set(), isKept: (item) => isSessionKeptByUser(item, new Set(), true), now,
    })).toEqual(['stale-work']);
  });

  test('preserves the five most recently archived sessions even when all are expired', () => {
    const sessions = Array.from({ length: 7 }, (_, index) => archived(`archived-${index}`, {
      time: { created: 1, updated: now, archived: now - (40 + index) * day },
    }));
    expect(buildSessionRetentionCandidates({
      sessions, cutoffDays: 30, currentSessionId: null, action: 'delete', onlyArchived: true, activeSessionIds: new Set(), now,
    })).toEqual(['archived-5', 'archived-6']);
  });

  test('protects parents of unarchived or recently archived descendants', () => {
    expect(archivedCandidates([
      archived('parent'), session('active-child', { parentID: 'parent' }),
      archived('recent-parent'), { ...recentArchived[0], parentID: 'recent-parent' },
      archived('unrelated'),
    ])).toEqual(['unrelated']);
  });

  test('forces deletion in core even if a stale setting still requests archive', async () => {
    seed([...recentArchived, archived('parent'), archived('child', { parentID: 'parent' }), session('unarchived')]);
>>>>>>> bc50ba56a
    useUIStore.setState({ sessionRetentionOnlyArchived: true, sessionRetentionAction: 'archive' });
    const result = await runSessionRetentionCleanup({ force: true });
    expect(result.action).toBe('delete');
    expect(result.completedIds).toEqual(['child', 'parent']);
    expect(actions.archiveSession).not.toHaveBeenCalled();
  });
});
