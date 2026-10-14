import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { opencodeClient } from '@/lib/opencode/client';
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
let home = spyOn(opencodeClient, 'getFilesystemHomeInfo');

beforeEach(async () => {
  flushPendingSessionWrites();
  switchRuntimeEndpoint({ apiBaseUrl: 'https://native-global-races.test', runtimeKey: `native-global-races-${++runtime}` });
  home = spyOn(opencodeClient, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
  await ensureChatsRootDirectory();
  request = deferred<SessionDiscoveryResult>();
  list = spyOn(canonicalClient, 'listSessions').mockImplementation(() => request.promise);
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
