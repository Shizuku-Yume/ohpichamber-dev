import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session, Subagent } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { flushPendingSessionWrites } from '@/sync/persist-cache';
import { registerWorkspaceDirectory, resolveWorkspaceDirectory } from './globalSessions';
import type { SessionDiscoveryResult } from './globalSessions';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';

const deferred = <T>() => {
  const result = Promise.withResolvers<T>();
  void result.promise.catch(() => undefined);
  return result;
};

const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'pro_repo', workspaceId: 'wsp_repo', displayPath: 'repo', rootSessionId: sessionId,
  createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0', ...extra,
});
const ids = (records: readonly Session[]) => records.map((record) => record.sessionId).sort();
let runtime = 0;
let request = deferred<SessionDiscoveryResult>();
let list = spyOn(canonicalClient, 'listSessions');
let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let home = spyOn(hostFilesystem, 'getFilesystemHomeInfo');
let subagents = spyOn(canonicalClient, 'listSubagents');

beforeEach(async () => {
  flushPendingSessionWrites();
  switchRuntimeEndpoint({ apiBaseUrl: 'https://native-global-races.test', runtimeKey: `native-global-races-${++runtime}` });
  home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
  await ensureChatsRootDirectory();
  request = deferred<SessionDiscoveryResult>();
  list = spyOn(canonicalClient, 'listSessions').mockImplementation(() => request.promise);
  subagents = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === '/repo' ? 'wsp_repo' : directory === '/other' ? 'wsp_other' : 'wsp_hint',
    projectId: directory === '/other' ? 'pro_other' : 'pro_repo', name: 'Workspace',
  }));
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useGlobalSessionsStore.getState().applySnapshot([], [], 'idle');
  registerWorkspaceDirectory('wsp_repo', '/repo');
  registerWorkspaceDirectory('wsp_other', '/other');
});

afterEach(() => {
  list.mockRestore();
  resolveWorkspace.mockRestore();
  home.mockRestore();
  subagents.mockRestore();
});

describe('native global mutation reconciliation', () => {
  test('keeps a create after discovery starts', async () => {
    const loading = useGlobalSessionsStore.getState().loadSessions();
    useGlobalSessionsStore.getState().upsertSession(session('ses_created'));
    request.resolve({ items: [], errors: {} });
    const committed = await loading;
    expect(ids(committed.activeSessions)).toEqual(['ses_created']);
  });

  test('does not resurrect a deletion or an absent-entity tombstone', async () => {
    const stale = session('ses_deleted');
    useGlobalSessionsStore.getState().applySnapshot([stale], []);
    const loading = useGlobalSessionsStore.getState().loadSessions();
    useGlobalSessionsStore.getState().removeSessions(['ses_deleted', 'ses_absent']);
    request.resolve({ items: [stale, session('ses_absent')], errors: {} });
    await loading;
    expect(useGlobalSessionsStore.getState().entityById.size).toBe(0);
  });

  test('keeps archive and Host title mutations newer than discovery', async () => {
    const stale = session('ses_one');
    useGlobalSessionsStore.getState().applySnapshot([stale], []);
    const loading = useGlobalSessionsStore.getState().loadSessions();
    useGlobalSessionsStore.getState().upsertSession({ ...stale, metadata: { title: 'New' }, metadataRevision: '2' });
    useGlobalSessionsStore.getState().archiveSessions(['ses_one'], 10);
    request.resolve({ items: [stale], errors: {} });
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(state.activeSessions).toEqual([]);
    expect(state.archivedSessions[0]?.archivedAt).toBe(10);
    expect(state.archivedSessions[0]?.metadata?.title).toBe('New');
  });

  test('uses commit-time state and fills only unlisted live gaps after failure', async () => {
    const known = session('ses_known', { metadata: { openchamber: { work: { state: 'done' } } } });
    useGlobalSessionsStore.getState().applySnapshot([known], []);
    const loading = useGlobalSessionsStore.getState().loadSessions([
      { ...known, metadata: { openchamber: { work: { state: 'open' } } } }, session('ses_live'),
    ]);
    useGlobalSessionsStore.getState().upsertSession(session('ses_created'));
    request.reject(new Error('offline'));
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(ids(state.activeSessions)).toEqual(['ses_created', 'ses_known', 'ses_live']);
    expect(state.entityById.get('ses_known')?.metadata?.openchamber?.work?.state).toBe('done');
    expect(state.status).toBe('error');
  });

  test('restores without a legacy zero archive marker', async () => {
    const archived = session('ses_restored', { archivedAt: 5, archiveRevision: '1' });
    useGlobalSessionsStore.getState().applySnapshot([], [archived]);
    const loading = useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    const { archivedAt: _archivedAt, ...restored } = archived;
    useGlobalSessionsStore.getState().upsertSession({ ...restored, archiveRevision: '2' });
    request.resolve({ items: [archived], errors: {} });
    await loading;
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_restored']);
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([]);
  });

  test('a native workspace move survives a refresh of its old directory', async () => {
    const source = session('ses_moved');
    useGlobalSessionsStore.getState().applySnapshot([source], []);
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    useGlobalSessionsStore.getState().upsertSession({ ...source, workspaceId: 'wsp_other', projectId: 'pro_other' });
    request.resolve({ items: [source], errors: {} });
    await refreshing;
    expect(useGlobalSessionsStore.getState().sessionsByDirectory.has('/repo')).toBe(false);
    expect(useGlobalSessionsStore.getState().sessionsByDirectory.get('/other')?.[0]?.sessionId).toBe('ses_moved');
  });

  test('an archived record is never replaced by an older live fallback', async () => {
    const archived = session('ses_archived', { archivedAt: 5 });
    useGlobalSessionsStore.getState().applySnapshot([], [archived]);
    const loading = useGlobalSessionsStore.getState().loadSessions([session('ses_archived')]);
    request.reject(new Error('offline'));
    await loading;
    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([]);
    expect(ids(useGlobalSessionsStore.getState().archivedSessions)).toEqual(['ses_archived']);
  });

  test('runtime reset rejects stale discovery and clears native bindings', async () => {
    const started = Promise.withResolvers<void>();
    list.mockImplementation(() => { started.resolve(); return request.promise; });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await started.promise;
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    request.resolve({ items: [session('ses_stale')], errors: {} });
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(state.entityById.size).toBe(0);
    expect(state.status).toBe('idle');
    expect(state.hasLoaded).toBe(false);
    expect(resolveWorkspaceDirectory('wsp_repo')).toBeNull();
  });

  test('a retired workspace resolution cannot bind a directory or list another runtime', async () => {
    const started = Promise.withResolvers<void>();
    const resolved = Promise.withResolvers<{ workspaceId: string; projectId: string; name: string }>();
    resolveWorkspace.mockImplementation(() => { started.resolve(); return resolved.promise; });
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    await started.promise;
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    resolved.resolve({ workspaceId: 'wsp_old', projectId: 'pro_repo', name: 'Old workspace' });
    await refreshing;
    expect(resolveWorkspaceDirectory('wsp_old')).toBeNull();
    expect(list.mock.calls).toHaveLength(0);
    expect(useGlobalSessionsStore.getState().status).toBe('idle');
  });
});

describe('native discovery completeness scopes', () => {
  test('an entity failure preserves its owner while healthy siblings reconcile', async () => {
    const failed = session('ses_failed', { archivedAt: 4 });
    useGlobalSessionsStore.getState().applySnapshot([session('ses_removed'), session('ses_healthy')], [failed]);
    request.resolve({ items: [session('ses_healthy', { metadata: { title: 'Fresh' }, metadataRevision: '2' })], errors: { ses_failed: 'METADATA_READ_FAILED' } });
    await useGlobalSessionsStore.getState().loadSessions();
    const state = useGlobalSessionsStore.getState();
    expect(state.entityById.get('ses_failed')).toBe(failed);
    expect(state.entityById.has('ses_removed')).toBe(false);
    expect(state.entityById.get('ses_healthy')?.metadata?.title).toBe('Fresh');
    expect(state.status).toBe('error');
    expect(state.hasLoaded).toBe(true);
  });

  test('a failed workspace preserves its records but not missing healthy-workspace siblings', async () => {
    useGlobalSessionsStore.getState().upsertSessions([session('ses_failed'), session('ses_removed', { workspaceId: 'wsp_other', projectId: 'pro_other' })]);
    request.resolve({ items: [], errors: { wsp_repo: 'SERVICE_UNAVAILABLE' } });
    await useGlobalSessionsStore.getState().loadSessions();
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_failed']);
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
  });

  test('directory entity errors preserve only failed sessions in that directory', async () => {
    const failed = session('ses_failed', { archivedAt: 4 });
    useGlobalSessionsStore.getState().applySnapshot([session('ses_removed')], [failed, session('ses_archived_removed', { archivedAt: 3 })]);
    request.resolve({ items: [session('ses_new')], errors: { ses_failed: 'METADATA_READ_FAILED' } });
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_new']);
    expect(ids(useGlobalSessionsStore.getState().archivedSessions)).toEqual(['ses_failed']);
  });

  test('relative and display-path candidates never reach workspace resolution', async () => {
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['repo', './repo', 'C:repo']);
    expect(resolveWorkspace.mock.calls).toHaveLength(0);
    expect(list.mock.calls).toHaveLength(0);
  });

  test('a failed directory does not block successful empty siblings', async () => {
    useGlobalSessionsStore.getState().applySnapshot([session('ses_failed'), session('ses_removed', { workspaceId: 'wsp_other', projectId: 'pro_other' })], []);
    list.mockImplementation(async (workspaceId) => {
      if (workspaceId === 'wsp_repo') throw new Error('offline');
      return { items: [], errors: {} };
    });
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo', '/other']);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_failed']);
  });

  test.each(['ses_uncached', 'wsp_uncached'])('an uncached native failure %s does not block healthy missing records from reconciling', async (failedIdentity) => {
    useGlobalSessionsStore.getState().upsertSession(session('ses_removed'));
    request.resolve({ items: [session('ses_new')], errors: { [failedIdentity]: 'METADATA_READ_FAILED' } });
    await useGlobalSessionsStore.getState().loadSessions();
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_new']);
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
  });
});

describe('canonical sidebar child discovery', () => {
  const child = (status: Subagent['status'] = 'running'): Subagent => ({
    subagentId: 'sub_worker', parentSessionId: 'ses_root', childSessionId: 'ses_child', role: 'Worker', status,
  });
  const discover = async (directory: boolean) => {
    list.mockResolvedValue({ items: [session('ses_root')], errors: {} });
    return directory ? useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo'])
      : useGlobalSessionsStore.getState().loadSessions();
  };

  test.each([false, true])('projects canonical children and indexes hierarchy (directory=%s)', async (directory) => {
    subagents.mockResolvedValue([child()]);
    await discover(directory);
    const state = useGlobalSessionsStore.getState();
    expect(state.entityById.get('ses_child')).toEqual(session('ses_child', {
      parentSessionId: 'ses_root', rootSessionId: 'ses_root', metadata: { title: 'Worker' },
      runtimeStatus: 'running', activeRunId: 'subagent:sub_worker',
    }));
    expect(state.structure.activeRootIds).toEqual(['ses_root']);
    expect(state.structure.activeChildrenByParentId.get('ses_root')).toEqual(['ses_child']);
    expect(ids(state.sessionsByDirectory.get('/repo') ?? [])).toEqual(['ses_child', 'ses_root']);
    expect(subagents.mock.calls.map(([id]) => id)).toEqual(['ses_root']);
    const first = state.entityById.get('ses_child');
    await discover(directory);
    expect(useGlobalSessionsStore.getState().entityById.get('ses_child')).toEqual(first);
  });

  test.each([false, true])('failed child discovery preserves known children, successful omission removes them (directory=%s)', async (directory) => {
    subagents.mockResolvedValue([child('completed')]);
    await discover(directory);
    const previous = useGlobalSessionsStore.getState().entityById.get('ses_child');
    expect(previous).toMatchObject({ runtimeStatus: 'idle', activeRunId: null });
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await discover(directory);
    expect(useGlobalSessionsStore.getState().entityById.get('ses_child')).toBe(previous);
    subagents.mockResolvedValue([]);
    await discover(directory);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(false);
    expect(useGlobalSessionsStore.getState().structure.activeChildrenByParentId.has('ses_root')).toBe(false);
  });

  test('directory root omission alone cannot erase a previously discovered child', async () => {
    subagents.mockResolvedValue([child()]);
    await discover(true);
    list.mockResolvedValue({ items: [], errors: {} });
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(true);
  });

  test('successful child omission cannot be undone by a stale live-directory fallback', async () => {
    subagents.mockResolvedValue([child()]);
    await discover(true);
    const previous = useGlobalSessionsStore.getState().activeSessions;
    subagents.mockResolvedValue([]);
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo'], previous);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(false);
  });

  test('bounds concurrent child reads across active roots', async () => {
    list.mockResolvedValue({ items: [session('ses_a'), session('ses_b'), session('ses_c')], errors: {} });
    const firstTwo = Promise.withResolvers<void>();
    const release = Promise.withResolvers<Subagent[]>();
    let active = 0;
    let maximum = 0;
    subagents.mockImplementation(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      if (active === 2) firstTwo.resolve();
      try { return await release.promise; }
      finally { active -= 1; }
    });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await firstTwo.promise;
    expect(subagents.mock.calls).toHaveLength(2);
    release.resolve([]);
    await loading;
    expect(subagents.mock.calls).toHaveLength(3);
    expect(maximum).toBe(2);
  });

  test.each([false, true])('runtime switch ignores delayed child responses (directory=%s)', async (directory) => {
    const started = Promise.withResolvers<void>();
    const pending = Promise.withResolvers<Subagent[]>();
    subagents.mockImplementation(() => { started.resolve(); return pending.promise; });
    const loading = discover(directory);
    await started.promise;
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useGlobalSessionsStore.getState().applySnapshot([], [], 'idle');
    pending.resolve([child()]);
    await loading;
    expect(useGlobalSessionsStore.getState().entityById.size).toBe(0);
    expect(useGlobalSessionsStore.getState().status).toBe('idle');
  });

  test('rejects conflicting parent and child identities and skips child and archived discovery', async () => {
    const existingChild = session('ses_other_child', { parentSessionId: 'ses_other', rootSessionId: 'ses_other' });
    useGlobalSessionsStore.getState().upsertSession(existingChild);
    list.mockResolvedValue({ items: [session('ses_root'), session('ses_archived', { archivedAt: 3 }), existingChild], errors: {} });
    subagents.mockResolvedValue([
      { ...child(), parentSessionId: 'ses_wrong' },
      { ...child(), childSessionId: 'ses_root' },
      { ...child(), childSessionId: 'ses_other_child' },
    ]);
    await useGlobalSessionsStore.getState().loadSessions();
    expect(subagents.mock.calls.map(([id]) => id)).toEqual(['ses_root']);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(false);
    expect(useGlobalSessionsStore.getState().entityById.get('ses_other_child')?.parentSessionId).toBe('ses_other');
  });

  test('title projection remains valid when root metadata is confirmed missing', async () => {
    list.mockResolvedValue({ items: [session('ses_root', { metadata: null, metadataRevision: '0' })], errors: {} });
    subagents.mockResolvedValue([child('failed')]);
    await useGlobalSessionsStore.getState().loadSessions();
    expect(useGlobalSessionsStore.getState().entityById.get('ses_child')).toMatchObject({
      metadata: { title: 'Worker' }, metadataRevision: '1', runtimeStatus: 'idle', activeRunId: null,
    });
  });
});
