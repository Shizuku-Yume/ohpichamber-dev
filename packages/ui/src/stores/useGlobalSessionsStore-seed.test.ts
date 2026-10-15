import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { flushPendingSessionWrites, persistGlobalSessionSnapshot, readGlobalSessionSnapshot } from '@/sync/persist-cache';
import { clearLastActiveSession, persistLastActiveSession, readLastActiveSession } from '@/sync/last-session-cache';
import { restoreLastActiveSession } from '@/sync/last-session-restore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';
import type { SessionDiscoveryResult } from './globalSessions';

class TestStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const deferred = <T>() => Promise.withResolvers<T>();
const session = (sessionId: string, workspaceId: string, updatedAt: number): Session => ({
  sessionId, projectId: 'pro_project', workspaceId, displayPath: 'repo', rootSessionId: sessionId,
  createdAt: updatedAt - 1, updatedAt, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: sessionId, openchamber: { assist: { recap: 'Recap', suggestion: 'Continue', forMessageID: 'msg_one', generatedAt: 1 } } },
  metadataRevision: '1', archiveRevision: '0',
});
const worktree = session('ses_worktree', 'wsp_worktree', 30);
const otherProject = session('ses_other', 'wsp_other', 20);
const deletedElsewhere = session('ses_deleted', 'wsp_third', 10);
const ids = (records: readonly Session[]) => records.map((record) => record.sessionId).sort();
let runtime = 0;
const nextRuntime = () => switchRuntimeEndpoint({ apiBaseUrl: 'https://native-store-seed.test', runtimeKey: `native-store-seed-${++runtime}` });
const originalStorage = globalThis.localStorage;
let home = spyOn(hostFilesystem, 'getFilesystemHomeInfo');
let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let subagents = spyOn(canonicalClient, 'listSubagents');

const startFromSnapshot = (sessions: Session[]) => {
  persistGlobalSessionSnapshot(sessions);
  flushPendingSessionWrites();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
};

beforeEach(() => {
  flushPendingSessionWrites();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new TestStorage() });
  nextRuntime();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'wsp_hint', projectId: 'pro_hint', name: 'Hint' });
  subagents = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
});

afterEach(() => {
  flushPendingSessionWrites();
  home.mockRestore();
  resolveWorkspace.mockRestore();
  subagents.mockRestore();
  clearLastActiveSession(getRuntimeKey());
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
});

describe('persisted native global seed', () => {
  test('paints native records without completeness or invented directory authority', () => {
    startFromSnapshot([worktree, otherProject]);
    const state = useGlobalSessionsStore.getState();
    expect(ids(state.activeSessions)).toEqual(['ses_other', 'ses_worktree']);
    expect(state.sessionsByDirectory.size).toBe(0);
    expect(state.hasLoaded).toBe(false);
    expect(state.status).toBe('idle');
    expect(state.entityById.get('ses_worktree')?.metadata?.openchamber?.assist?.recap).toBe('Recap');
  });

  test('failed discovery preserves the seed and the last-session pointer without cleanup authority', async () => {
    startFromSnapshot([worktree, otherProject]);
    persistLastActiveSession(getRuntimeKey(), { sessionId: 'ses_gone', directory: '/repo' });
    const originalSetCurrentSession = useSessionUIStore.getState().setCurrentSession;
    useSessionUIStore.setState({ currentSessionId: null, setCurrentSession: () => undefined });
    const list = spyOn(canonicalClient, 'listSessions').mockRejectedValue(new Error('Host is starting'));
    try {
      expect(await restoreLastActiveSession({ refresh: false })).toBe('failed');
      const state = useGlobalSessionsStore.getState();
      expect(state.status).toBe('error');
      expect(state.hasLoaded).toBe(false);
      expect(ids(state.activeSessions)).toEqual(['ses_other', 'ses_worktree']);
      expect(readLastActiveSession(getRuntimeKey())?.sessionId).toBe('ses_gone');
    } finally {
      list.mockRestore();
      useSessionUIStore.setState({ setCurrentSession: originalSetCurrentSession });
    }
  });

  test('complete discovery retires deleted seed records and keeps unchanged list references', async () => {
    startFromSnapshot([worktree, otherProject, deletedElsewhere]);
    const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [worktree, otherProject], errors: {} });
    try {
      await useGlobalSessionsStore.getState().loadSessions();
      const loaded = useGlobalSessionsStore.getState();
      expect(loaded.status).toBe('ready');
      expect(loaded.hasLoaded).toBe(true);
      expect(ids(loaded.activeSessions)).toEqual(['ses_other', 'ses_worktree']);
      await useGlobalSessionsStore.getState().loadSessions();
      const reloaded = useGlobalSessionsStore.getState();
      expect(reloaded.activeSessions).toBe(loaded.activeSessions);
      expect(reloaded.sessionsByDirectory).toBe(loaded.sessionsByDirectory);
      flushPendingSessionWrites();
      expect(ids(readGlobalSessionSnapshot())).toEqual(['ses_other', 'ses_worktree']);
    } finally { list.mockRestore(); }
  });

  test('a deletion during first discovery survives both response and persisted snapshot', async () => {
    startFromSnapshot([worktree, otherProject]);
    const response = deferred<SessionDiscoveryResult>();
    const started = Promise.withResolvers<void>();
    const list = spyOn(canonicalClient, 'listSessions').mockImplementation(() => { started.resolve(); return response.promise; });
    try {
      const loading = useGlobalSessionsStore.getState().loadSessions();
      await started.promise;
      useGlobalSessionsStore.getState().removeSessions(['ses_other']);
      flushPendingSessionWrites();
      expect(ids(readGlobalSessionSnapshot())).toEqual(['ses_worktree']);
      response.resolve({ items: [worktree, otherProject], errors: {} });
      await loading;
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_worktree']);
      flushPendingSessionWrites();
      expect(ids(readGlobalSessionSnapshot())).toEqual(['ses_worktree']);
    } finally { list.mockRestore(); }
  });

  test('runtime reset reads only the incoming runtime seed and never grants authority', () => {
    startFromSnapshot([worktree]);
    const first = getRuntimeKey();
    nextRuntime();
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([]);
    switchRuntimeEndpoint({ apiBaseUrl: 'https://native-store-seed.test', runtimeKey: first });
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_worktree']);
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
  });
});
