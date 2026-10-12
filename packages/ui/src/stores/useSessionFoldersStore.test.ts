import { afterEach, beforeEach, describe, expect, jest, mock, test } from 'bun:test';

const storage = new Map<string, string>();
let storageSetCount = 0;
let runtimeKey = 'runtime-a';
let diskResponseBody = JSON.stringify({ version: 1, exists: false });

const safeStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageSetCount += 1;
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;

mock.module('./utils/safeStorage', () => ({
  getDeferredSafeStorage: () => safeStorage,
  getSafeStorage: () => safeStorage,
}));

const postedBodies: string[] = [];
// The workspace's TypeScript lib does not include Promise.withResolvers.
const createHydrationRead = () => {
  let resolve: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve: () => resolve() };
};
let hydrationRead = createHydrationRead();

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: mock(async (_path: string, init?: RequestInit) => {
    if (init?.method === 'POST') postedBodies.push(String(init.body));
    const body = JSON.parse(diskResponseBody);
    const response = new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
    response.json = async () => {
      queueMicrotask(() => hydrationRead.resolve());
      return body;
    };
    return response;
  }),
}));
mock.module('@/lib/runtime-switch', () => ({ getRuntimeKey: () => runtimeKey }));

const { useSessionFoldersStore } = await import('./useSessionFoldersStore');

const waitForPersist = async () => { jest.advanceTimersByTime(350); await Promise.resolve(); };
const waitForHydration = async () => { await hydrationRead.promise; await Promise.resolve(); };

describe('useSessionFoldersStore folder assignments', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    hydrationRead = createHydrationRead();
    storage.clear();
    storageSetCount = 0;
    runtimeKey = 'runtime-a';
    diskResponseBody = JSON.stringify({ version: 1, exists: false });
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    useSessionFoldersStore.setState({
      foldersMap: {},
      collapsedFolderIds: new Set<string>(),
    });
  });
  afterEach(() => jest.useRealTimers());

  test('repeated addSessionToFolder to the same folder preserves foldersMap reference', async () => {
    const store = useSessionFoldersStore.getState();
    const folder = store.createFolder('/workspace/project', 'Work');
    store.addSessionToFolder('/workspace/project', folder.id, 'ses_1');
    await waitForPersist();
    storageSetCount = 0;

    const before = useSessionFoldersStore.getState().foldersMap;
    useSessionFoldersStore.getState().addSessionToFolder('/workspace/project', folder.id, 'ses_1');
    await waitForPersist();

    expect(useSessionFoldersStore.getState().foldersMap).toBe(before);
    expect(storageSetCount).toBe(0);
  });

  test('repeated addSessionsToFolder to the same folder preserves foldersMap reference', async () => {
    const store = useSessionFoldersStore.getState();
    const folder = store.createFolder('/workspace/project', 'Batch');
    store.addSessionsToFolder('/workspace/project', folder.id, ['ses_1', 'ses_2']);
    await waitForPersist();
    storageSetCount = 0;

    const before = useSessionFoldersStore.getState().foldersMap;
    useSessionFoldersStore.getState().addSessionsToFolder('/workspace/project', folder.id, ['ses_1', 'ses_2']);
    await waitForPersist();

    expect(useSessionFoldersStore.getState().foldersMap).toBe(before);
    expect(storageSetCount).toBe(0);
  });

  test('bulk cross-scope move clears the former folder membership before assigning the target', () => {
    const store = useSessionFoldersStore.getState();
    const source = store.createFolder('/workspace/project', 'Source');
    const target = store.createFolder('/workspace/project-worktree', 'Target');
    store.addSessionsToFolder('/workspace/project', source.id, ['ses_1', 'ses_2']);

    store.removeSessionsFromFolders('/workspace/project', ['ses_1', 'ses_2']);
    store.addSessionsToFolder('/workspace/project-worktree', target.id, ['ses_1', 'ses_2']);

    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project')[0]?.sessionIds).toEqual([]);
    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project-worktree')[0]?.sessionIds).toEqual(['ses_1', 'ses_2']);
  });

  test('restores independent folder snapshots across runtime switches', async () => {
    useSessionFoldersStore.getState().createFolder('/workspace/project', 'Runtime A');
    await waitForPersist();

    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project')).toEqual([]);
    useSessionFoldersStore.getState().createFolder('/workspace/project', 'Runtime B');
    await waitForPersist();

    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project').map((folder) => folder.name)).toEqual(['Runtime A']);
  });

  test('flushes the outgoing runtime before a debounced browser write can be lost', () => {
    useSessionFoldersStore.getState().createFolder('/workspace/project', 'Runtime A pending');

    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);

    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project').map((folder) => folder.name)).toEqual(['Runtime A pending']);
  });

  test('does not replace browser folders when the server has no disk snapshot', async () => {
    useSessionFoldersStore.getState().createFolder('/workspace/project', 'Browser folder');
    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);

    await Promise.resolve();

    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project').map((folder) => folder.name)).toEqual(['Browser folder']);
  });

  // Server persistence and hydration only run in a browser.
  const withWindow = (run: () => Promise<void>) => async () => {
    const original = globalThis.window;
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    try {
      await run();
    } finally {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: original });
    }
  };

  test('sends a deleted folder as a tombstone and clears it once the server stores it', withWindow(async () => {
    const folder = useSessionFoldersStore.getState().createFolder('/workspace/project', 'Gone');
    await waitForPersist();
    postedBodies.length = 0;

    useSessionFoldersStore.getState().deleteFolder('/workspace/project', folder.id);
    await waitForPersist();

    expect(postedBodies).toHaveLength(1);
    expect(Object.keys(JSON.parse(postedBodies[0]).deletedFolderIds)).toEqual([folder.id]);
    expect(Array.from(storage.keys()).some((key) => key.startsWith('oc.sessions.folderDeletions'))).toBe(false);
  }));

  test('drops a folder another device deleted even when the browser copy is newer', withWindow(async () => {
    const folder = useSessionFoldersStore.getState().createFolder('/workspace/project', 'Deleted elsewhere');
    useSessionFoldersStore.getState().createFolder('/workspace/project', 'Kept');
    diskResponseBody = JSON.stringify({
      version: 1,
      exists: true,
      foldersMap: {},
      collapsedFolderIds: [],
      deletedFolderIds: { [folder.id]: Date.now() },
      updatedAt: 1,
    });

    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    await waitForHydration();

    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project').map((entry) => entry.name)).toEqual(['Kept']);
  }));

  test('preserves failed scope folders and collapse state while applying valid scopes', withWindow(async () => {
    const failed = useSessionFoldersStore.getState().createFolder('/failed', 'Cached');
    const valid = useSessionFoldersStore.getState().createFolder('/valid', 'Old');
    useSessionFoldersStore.getState().toggleFolderCollapse(failed.id);
    diskResponseBody = JSON.stringify({
      version: 1, exists: true,
      foldersMap: { '/valid': [{ ...valid, name: 'Fresh' }] },
      collapsedFolderIds: [], errors: { '/failed': 'METADATA_CORRUPT' }, updatedAt: Date.now() + 1,
    });
    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    await waitForHydration();
    expect(useSessionFoldersStore.getState().foldersMap['/failed']?.[0]?.name).toBe('Cached');
    expect(useSessionFoldersStore.getState().foldersMap['/valid']?.[0]?.name).toBe('Fresh');
    expect(useSessionFoldersStore.getState().collapsedFolderIds.has(failed.id)).toBe(true);
  }));

  test('preserves cache on source-wide conversion failure', withWindow(async () => {
    const folder = useSessionFoldersStore.getState().createFolder('/workspace/project', 'Cached');
    diskResponseBody = JSON.stringify({ version: 1, exists: true, foldersMap: {}, collapsedFolderIds: [], conversion: { status: 'failed', code: 'METADATA_READ_FAILED' }, updatedAt: Date.now() + 1 });
    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    await waitForHydration();
    expect(useSessionFoldersStore.getState().foldersMap['/workspace/project']?.[0]?.id).toBe(folder.id);
  }));

  test('applies known SQLite scopes when a corrupt legacy source leaves other scopes unknown', withWindow(async () => {
    const cached = useSessionFoldersStore.getState().createFolder('/unknown', 'Cached');
    const valid = useSessionFoldersStore.getState().createFolder('/valid', 'Old');
    useSessionFoldersStore.getState().toggleFolderCollapse(cached.id);
    diskResponseBody = JSON.stringify({
      version: 1, exists: true, foldersMap: { '/valid': [{ ...valid, name: 'Confirmed' }] },
      collapsedFolderIds: [], conversion: { status: 'corrupt', code: 'METADATA_CORRUPT' }, updatedAt: Date.now() + 1,
    });
    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    await waitForHydration();
    expect(useSessionFoldersStore.getState().foldersMap['/unknown']?.[0]?.id).toBe(cached.id);
    expect(useSessionFoldersStore.getState().foldersMap['/valid']?.[0]?.name).toBe('Confirmed');
    expect(useSessionFoldersStore.getState().collapsedFolderIds.has(cached.id)).toBe(true);
  }));

  test('rejects malformed disk responses without clearing cached folders', withWindow(async () => {
    const cached = useSessionFoldersStore.getState().createFolder('/workspace/project', 'Cached');
    diskResponseBody = JSON.stringify({ version: 1, exists: true, foldersMap: { '/workspace/project': [{ id: 'invalid', name: 'Broken' }] }, collapsedFolderIds: [], updatedAt: Date.now() + 1 });
    runtimeKey = 'runtime-b';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    runtimeKey = 'runtime-a';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    await waitForHydration();
    expect(useSessionFoldersStore.getState().foldersMap['/workspace/project']?.[0]?.id).toBe(cached.id);
  }));

  test('does not silently evict folder state from older runtimes', () => {
    for (let index = 0; index < 10; index += 1) {
      runtimeKey = `runtime-${index}`;
      useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
      useSessionFoldersStore.getState().createFolder('/workspace/project', `Folder ${index}`);
    }

    runtimeKey = 'runtime-0';
    useSessionFoldersStore.getState().resetForRuntimeSwitch(runtimeKey);
    expect(useSessionFoldersStore.getState().getFoldersForScope('/workspace/project').map((folder) => folder.name)).toEqual(['Folder 0']);
  });
});
