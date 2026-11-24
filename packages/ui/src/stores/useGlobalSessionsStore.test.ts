import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session, Subagent } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from './globalSessions';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from './useGlobalSessionsStore';

const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'pro_project', workspaceId: 'wsp_repo', displayPath: 'repo',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, title: sessionId, metadata: {},
  metadataRevision: '1', archiveRevision: '0', ...extra,
});

beforeEach(() => {
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useGlobalSessionsStore.getState().applySnapshot([], [], 'idle');
  registerWorkspaceDirectory('wsp_repo', '/repo');
  registerWorkspaceDirectory('wsp_other', '/other');
});

describe('native global session mutations', () => {
  test('keeps OMP titles in the runtime record and updates the native entity', () => {
    useGlobalSessionsStore.getState().upsertSession(session('ses_one'));
    useGlobalSessionsStore.getState().upsertSession(session('ses_one', { title: 'Renamed' }));
    expect(useGlobalSessionsStore.getState().entityById.get('ses_one')?.title).toBe('Renamed');
  });

  test('resolves directories only from authorized workspace bindings', () => {
    const record = session('ses_one', { displayPath: 'not-an-absolute-directory' });
    useGlobalSessionsStore.getState().upsertSession(record);
    expect(resolveGlobalSessionDirectory(record)).toBe('/repo');
    expect(resolveGlobalSessionDirectory({ ...record, workspaceId: 'wsp_unknown' })).toBeNull();
  });

  test('indexes a directory binding which arrives after the session', () => {
    useGlobalSessionsStore.getState().upsertSession(session('ses_late', { workspaceId: 'wsp_late' }));
    registerWorkspaceDirectory('wsp_late', '/late');
    const state = useGlobalSessionsStore.getState();
    expect(state.sessionsByDirectory.get('/late')?.map((item) => item.sessionId)).toEqual(['ses_late']);
    expect(state.structure.activeIdsByDirectory.get('/late')).toEqual(['ses_late']);
  });

  test('moves a native workspace without retaining an obsolete directory', () => {
    const record = session('ses_one');
    useGlobalSessionsStore.getState().upsertSession(record);
    useGlobalSessionsStore.getState().upsertSession({ ...record, workspaceId: 'wsp_other' });
    const state = useGlobalSessionsStore.getState();
    expect(state.sessionsByDirectory.has('/repo')).toBe(false);
    expect(state.sessionsByDirectory.get('/other')?.[0]?.sessionId).toBe('ses_one');
  });

  test('archives and restores without legacy zero timestamps', () => {
    const record = session('ses_one');
    useGlobalSessionsStore.getState().upsertSession(record);
    useGlobalSessionsStore.getState().archiveSessions(['ses_one'], 0);
    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([]);
    expect(useGlobalSessionsStore.getState().archivedSessions[0]?.archivedAt).toBe(0);
    useGlobalSessionsStore.getState().upsertSession({ ...record, archiveRevision: '2' });
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([]);
    expect(useGlobalSessionsStore.getState().activeSessions[0]?.sessionId).toBe('ses_one');
  });

  test('preserves opposite list and hierarchy references during entity-only changes', () => {
    const active = session('ses_active');
    const archived = session('ses_archived', { archivedAt: 3, archiveRevision: '1' });
    useGlobalSessionsStore.getState().applySnapshot([active], [archived]);
    const before = useGlobalSessionsStore.getState();
    useGlobalSessionsStore.getState().upsertSession({ ...active, title: 'New', metadata: {}, metadataRevision: '2' });
    const after = useGlobalSessionsStore.getState();
    expect(after.archivedSessions).toBe(before.archivedSessions);
    expect(after.structure).toBe(before.structure);
    useGlobalSessionsStore.getState().upsertSession({ ...archived, updatedAt: 4 });
    expect(useGlobalSessionsStore.getState().activeSessions).toBe(after.activeSessions);
    expect(useGlobalSessionsStore.getState().structure).toBe(after.structure);
  });

  test('publishes a thousand native children once', () => {
    let publications = 0;
    const stop = useGlobalSessionsStore.subscribe(() => { publications += 1; });
    const parent = session('ses_parent');
    const children = Array.from({ length: 1_000 }, (_, index) => session(`ses_child_${index}`, { parentSessionId: parent.sessionId, rootSessionId: parent.sessionId }));
    useGlobalSessionsStore.getState().upsertSessions([parent, ...children]);
    stop();
    const state = useGlobalSessionsStore.getState();
    expect(publications).toBe(1);
    expect(state.structure.activeRootIds).toEqual(['ses_parent']);
    expect(state.structure.activeChildrenByParentId.get('ses_parent')).toHaveLength(1_000);
  });

  test('reparents only affected hierarchy buckets', () => {
    const child = session('ses_child', { parentSessionId: 'ses_a', rootSessionId: 'ses_a' });
    const unrelated = session('ses_other', { parentSessionId: 'ses_c', rootSessionId: 'ses_c' });
    useGlobalSessionsStore.getState().upsertSessions([session('ses_a'), session('ses_b'), session('ses_c'), child, unrelated]);
    const before = useGlobalSessionsStore.getState().structure;
    useGlobalSessionsStore.getState().upsertSession({ ...child, parentSessionId: 'ses_b', rootSessionId: 'ses_b' });
    const after = useGlobalSessionsStore.getState().structure;
    expect(after.activeChildrenByParentId.has('ses_a')).toBe(false);
    expect(after.activeChildrenByParentId.get('ses_b')).toEqual(['ses_child']);
    expect(after.activeChildrenByParentId.get('ses_c')).toBe(before.activeChildrenByParentId.get('ses_c'));
  });

  test('applies ordered mixed mutations in one publication', () => {
    useGlobalSessionsStore.getState().upsertSession(session('ses_original'));
    let publications = 0;
    const stop = useGlobalSessionsStore.subscribe(() => { publications += 1; });
    useGlobalSessionsStore.getState().applySessionMutations([
      { type: 'upsert', session: session('ses_temporary') },
      { type: 'remove', sessionId: 'ses_original' },
      { type: 'remove', sessionId: 'ses_temporary' },
      { type: 'upsert', session: session('ses_final') },
    ]);
    stop();
    expect(publications).toBe(1);
    expect(useGlobalSessionsStore.getState().structure.activeRootIds).toEqual(['ses_final']);
  });

  test('records no-op deletions as tombstones', () => {
    useGlobalSessionsStore.getState().removeSessions(['ses_absent']);
    const state = useGlobalSessionsStore.getState();
    expect(state.mutationRevisionBySessionId.get('ses_absent')).toBe(state.mutationRevision);
    expect(state.mutationRevision).toBeGreaterThan(0);
  });

  test('does not discard native runtime changes under unchanged Host revisions', () => {
    const record = session('ses_one');
    useGlobalSessionsStore.getState().upsertSession(record);
    useGlobalSessionsStore.getState().upsertSession({ ...record, runtimeStatus: 'running', activeRunId: 'run_one', headSequence: '1' });
    expect(useGlobalSessionsStore.getState().entityById.get('ses_one')?.runtimeStatus).toBe('running');
  });

  test('preserves unchanged entities when a sibling changes in a snapshot', () => {
    const first = session('ses_first');
    const second = session('ses_second');
    useGlobalSessionsStore.getState().applySnapshot([first, second], []);
    useGlobalSessionsStore.getState().applySnapshot([{ ...first }, { ...second, updatedAt: 3 }], []);
    expect(useGlobalSessionsStore.getState().entityById.get('ses_first')).toBe(first);
  });
});

describe('native recency updates', () => {
  test('publishes a native timestamp change without replacing unrelated entities', () => {
    const record = session('ses_one');
    useGlobalSessionsStore.getState().upsertSession(record);
    useGlobalSessionsStore.getState().upsertSession(session('ses_other'));
    const other = useGlobalSessionsStore.getState().entityById.get('ses_other');
    useGlobalSessionsStore.getState().upsertSession({ ...record, updatedAt: 3 });
    expect(useGlobalSessionsStore.getState().entityById.get('ses_one')?.updatedAt).toBe(3);
    expect(useGlobalSessionsStore.getState().entityById.get('ses_other')).toBe(other);
  });

  test('upsertSubagents uses child createdAt/updatedAt and falls back to parent when omitted', () => {
    const parent = session('ses_parent', { createdAt: 1_000, updatedAt: 50_000 });
    useGlobalSessionsStore.getState().upsertSession(parent);
    const withTimestamps: Subagent = {
      subagentId: 'BetaWorker-3',
      parentSessionId: parent.sessionId,
      childSessionId: 'child_stamped',
      role: 'task',
      status: 'cancelled',
      createdAt: 10_000,
      updatedAt: 22_000,
    };
    const withoutTimestamps: Subagent = {
      subagentId: 'AlphaFallback',
      parentSessionId: parent.sessionId,
      childSessionId: 'child_fallback',
      role: 'scout',
      status: 'completed',
    };
    useGlobalSessionsStore.getState().upsertSubagents(parent, [withTimestamps, withoutTimestamps]);

    const stamped = useGlobalSessionsStore.getState().entityById.get('child_stamped');
    expect(stamped?.createdAt).toBe(10_000);
    expect(stamped?.updatedAt).toBe(22_000);

    const fallback = useGlobalSessionsStore.getState().entityById.get('child_fallback');
    expect(fallback?.createdAt).toBe(1_000);
    expect(fallback?.updatedAt).toBe(50_000);
  });
});
