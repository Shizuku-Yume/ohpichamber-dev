import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { flushPendingSessionWrites, persistManagedChatSessions, readManagedChatSessions } from '@/sync/persist-cache';
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { registerWorkspaceDirectory } from './globalSessions';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';

class TestStorage implements Storage {
  readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

const chat = (sessionId: string): Session => ({
  sessionId, projectId: 'pro_chats', workspaceId: `wsp_${sessionId}`, displayPath: 'chats/day', rootSessionId: sessionId,
  createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
});
const ids = (records: readonly Session[]) => records.map((record) => record.sessionId).sort();
const savedDirectory = '/srv/chats/day/session-saved';
let runtime = 0;
const nextRuntime = () => switchRuntimeEndpoint({ apiBaseUrl: 'https://native-store-chats.test', runtimeKey: `native-store-chats-${++runtime}` });
let home = spyOn(hostFilesystem, 'getFilesystemHomeInfo');
let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let subagents = spyOn(canonicalClient, 'listSubagents');
const originalStorage = globalThis.localStorage;

beforeEach(() => {
  flushPendingSessionWrites();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new TestStorage() });
  nextRuntime();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
  subagents = spyOn(canonicalClient, 'listSubagents').mockResolvedValue([]);
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === savedDirectory ? 'wsp_saved' : 'wsp_hint', projectId: 'pro_chats', name: 'Chat',
  }));
});

afterEach(() => {
  flushPendingSessionWrites();
  home.mockRestore();
  resolveWorkspace.mockRestore();
  subagents.mockRestore();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
});

const seed = () => {
  persistManagedChatSessions([chat('saved')]);
  flushPendingSessionWrites();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  registerWorkspaceDirectory('wsp_saved', savedDirectory);
};

describe('native global managed-chat readiness', () => {
  test('concurrent loads wait for root and keep the native saved scope after discovery failure', async () => {
    seed();
    const root = Promise.withResolvers<{ home: string; chatsRoot: string }>();
    home.mockImplementationOnce(() => root.promise);
    const list = spyOn(canonicalClient, 'listSessions').mockRejectedValue(new Error('offline'));
    try {
      const first = useGlobalSessionsStore.getState().loadSessions();
      const second = useGlobalSessionsStore.getState().loadSessions();
      expect(useGlobalSessionsStore.getState().status).toBe('loading');
      expect(list.mock.calls).toHaveLength(0);
      root.resolve({ home: '/home/user', chatsRoot: '/srv/chats' });
      await Promise.all([first, second]);
      expect(useGlobalSessionsStore.getState().status).toBe('error');
      expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['saved']);
      expect(ids(readManagedChatSessions())).toEqual(['saved']);
    } finally { list.mockRestore(); }
  });

  test('root failure preserves the saved native scope and retry can establish completeness', async () => {
    seed();
    home.mockRejectedValueOnce(new Error('root offline'));
    await useGlobalSessionsStore.getState().loadSessions();
    expect(ids(readManagedChatSessions())).toEqual(['saved']);
    const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [chat('saved')], errors: {} });
    try {
      await useGlobalSessionsStore.getState().loadSessions();
      expect(useGlobalSessionsStore.getState().status).toBe('ready');
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['saved']);
    } finally { list.mockRestore(); }
  });

  test('create and delete before discovery preserve saved chats plus explicit mutations', async () => {
    seed();
    await ensureChatsRootDirectory();
    registerWorkspaceDirectory('wsp_created', '/srv/chats/day/session-created');
    useGlobalSessionsStore.getState().upsertSession(chat('created'));
    flushPendingSessionWrites();
    expect(ids(readManagedChatSessions())).toEqual(['created', 'saved']);
    useGlobalSessionsStore.getState().removeSessions(['saved']);
    flushPendingSessionWrites();
    expect(ids(readManagedChatSessions())).toEqual(['created']);
    const list = spyOn(canonicalClient, 'listSessions').mockRejectedValue(new Error('offline'));
    try {
      await useGlobalSessionsStore.getState().loadSessions();
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['created']);
    } finally { list.mockRestore(); }
  });

  test('directory refresh retires its saved seed even if later global discovery fails', async () => {
    seed();
    const refreshed = { ...chat('refreshed'), workspaceId: 'wsp_saved' };
    const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [refreshed], errors: {} });
    try {
      await useGlobalSessionsStore.getState().refreshSessionsForDirectories([savedDirectory]);
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['refreshed']);
      list.mockRejectedValue(new Error('offline'));
      await useGlobalSessionsStore.getState().loadSessions();
      expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['refreshed']);
      flushPendingSessionWrites();
      expect(ids(readManagedChatSessions())).toEqual(['refreshed']);
    } finally { list.mockRestore(); }
  });

  test('hydration retains a newer archive and native entity index during discovery failure', async () => {
    seed();
    const archived = { ...chat('archived'), archivedAt: 3, archiveRevision: '1' };
    useGlobalSessionsStore.getState().upsertSession(archived);
    const list = spyOn(canonicalClient, 'listSessions').mockRejectedValue(new Error('offline'));
    try {
      await useGlobalSessionsStore.getState().loadSessions();
      const state = useGlobalSessionsStore.getState();
      expect(ids(state.activeSessions)).toEqual(['saved']);
      expect(state.archivedSessions).toEqual([archived]);
      expect([...state.entityById.keys()].sort()).toEqual(['archived', 'saved']);
    } finally { list.mockRestore(); }
  });

  test('runtime reset during root wait rejects old discovery and hydration', async () => {
    seed();
    const root = Promise.withResolvers<{ home: string; chatsRoot: string }>();
    home.mockImplementationOnce(() => root.promise);
    const list = spyOn(canonicalClient, 'listSessions');
    try {
      const pending = useGlobalSessionsStore.getState().loadSessions();
      nextRuntime();
      useGlobalSessionsStore.getState().resetForRuntimeSwitch();
      root.resolve({ home: '/home/user', chatsRoot: '/srv/chats' });
      await pending;
      expect(list.mock.calls).toHaveLength(0);
      expect(useGlobalSessionsStore.getState().status).toBe('idle');
      expect(useGlobalSessionsStore.getState().activeSessions).toEqual([]);
      expect(readManagedChatSessions()).toEqual([]);
    } finally { list.mockRestore(); }
  });
});
