import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import type { Session, Subagent } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
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

<<<<<<< HEAD
const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'pro_repo', workspaceId: 'wsp_repo', displayPath: 'repo', rootSessionId: sessionId,
  createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const },
  title: sessionId, metadata: {}, metadataRevision: '1', archiveRevision: '0', ...extra,
});
const ids = (records: readonly Session[]) => records.map((record) => record.sessionId).sort();
const advanceStartup = async (seconds = 45) => {
  for (let second = 0; second < seconds; second += 1) {
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
    jest.advanceTimersByTime(1000);
||||||| bc50ba56aa
// Every test starts from no pending global snapshot: a complete load of one
// test would otherwise seed the next test's store.
beforeEach(() => {
  flushPendingSessionWrites()
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let listRequest: Deferred<Session[]>

// The store issues one paginated request per load/refresh scope and splits
// active/archived client-side, so restored sessions (`time.archived`
// falsy-but-present) stay visible in the active list. The mock serves that
// single request.
const listSessionsPage = async (): Promise<SessionPage> => ({
  sessions: await listRequest.promise,
  cursor: {},
})
const originalListSessionsPage = opencodeClient.listSessionsPage

const session = (id: string, title = id, archived?: number): Session => ({
  id,
  projectID: 'project',
  directory: '',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  title,
  time: { created: 1, updated: 1, ...(archived !== undefined ? { archived } : {}) },
})

describe("global session mutation reconciliation", () => {
  beforeEach(() => {
    listRequest = deferred<Session[]>()
    opencodeClient.listSessionsPage = listSessionsPage
    useGlobalSessionsStore.getState().resetForRuntimeSwitch()
  })

  afterEach(() => {
    opencodeClient.listSessionsPage = originalListSessionsPage
  })

  test("keeps a session created after a full load starts", async () => {
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(session("created"))

    listRequest.resolve([])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["created"])
  })

  test("does not resurrect a session deleted after a full load starts", async () => {
    const stale = session("deleted")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().removeSessions([stale.id])

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([])
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })

  test("keeps an archive mutation newer than both list requests", async () => {
    const stale = session("archived")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().archiveSessions([stale.id], 10)

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([])
    expect(useGlobalSessionsStore.getState().archivedSessions[0]?.time.archived).toBe(10)
  })

  test("keeps a newer title when an older response finishes last", async () => {
    const stale = session("updated", "Old")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(session("updated", "New"))

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions[0]?.title).toBe("New")
  })

  test("uses commit-time state when the load fails", async () => {
    const created = session("created")
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(created)

    listRequest.reject(new Error("unavailable"))
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([created])
    expect(useGlobalSessionsStore.getState().status).toBe("error")
  })

  test("splits a restored session into the active list", async () => {
    const loading = useGlobalSessionsStore.getState().loadSessions()

    listRequest.resolve([session("active"), session("archived", "archived", 5), session("restored", "restored", 0)])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["active", "restored"])
    expect(useGlobalSessionsStore.getState().archivedSessions.map((item) => item.id)).toEqual(["archived"])
    expect(useGlobalSessionsStore.getState().status).toBe("ready")
  })

  test("does not undo a move while refreshing the source directory", async () => {
    const source = { ...session("moved"), directory: "/source" } as Session
    const destination = { ...source, directory: "/destination" } as Session
    useGlobalSessionsStore.getState().applySnapshot([source], [])
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(["/source"])
    useGlobalSessionsStore.getState().upsertSession(destination)

    listRequest.resolve([source])
    await refreshing

    expect(useGlobalSessionsStore.getState().sessionsByDirectory.get("/source")).toBe(undefined)
    expect(useGlobalSessionsStore.getState().sessionsByDirectory.get("/destination")?.[0]?.id).toBe("moved")
  })

  test("keeps a restore mutation newer than the directory refresh", async () => {
    const archived = { ...session("restored", "restored", 5), directory: "/source" } as Session
    useGlobalSessionsStore.getState().applySnapshot([], [archived])
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(["/source"])
    useGlobalSessionsStore.getState().upsertSession({ ...archived, time: { ...archived.time, archived: 0 } })

    // The server still reports the pre-restore row for this directory.
    listRequest.resolve([archived])
    await refreshing

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["restored"])
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })
})

describe("live directory-store sessions offered to a load", () => {
  const work = (state: "open" | "done") => ({ openchamber: { work: { state } } })
  const inDirectory = (directory: string, base: Session, metadata?: Session["metadata"]): Session => {
    const placed: Session = { ...base, directory }
    if (metadata) placed.metadata = metadata
    return placed
=======
// Every test starts from no pending global snapshot: a complete load of one
// test would otherwise seed the next test's store.
beforeEach(() => {
  flushPendingSessionWrites()
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let listRequest: Deferred<Session[]>

// The store issues one paginated request per load/refresh scope and splits
// active/archived client-side, so restored sessions (`time.archived`
// falsy-but-present) stay visible in the active list. The mock serves that
// single request.
const listSessionsPage = async (): Promise<SessionPage> => ({
  sessions: await listRequest.promise,
  cursor: {},
})
const originalListSessionsPage = opencodeClient.listSessionsPage

const session = (id: string, title = id, archived?: number): Session => ({
  id,
  projectID: 'project',
  directory: '',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  title,
  time: { created: 1, updated: 1, ...(archived !== undefined ? { archived } : {}) },
})

describe("global session mutation reconciliation", () => {
  beforeEach(() => {
    listRequest = deferred<Session[]>()
    opencodeClient.listSessionsPage = listSessionsPage
    useGlobalSessionsStore.getState().resetForRuntimeSwitch()
  })

  afterEach(() => {
    opencodeClient.listSessionsPage = originalListSessionsPage
  })

  test("keeps a session created after a full load starts", async () => {
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(session("created"))

    listRequest.resolve([])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["created"])
  })

  test("does not resurrect a session deleted after a full load starts", async () => {
    const stale = session("deleted")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().removeSessions([stale.id])

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([])
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })

  test("keeps an archive mutation newer than both list requests", async () => {
    const stale = session("archived")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().archiveSessions([stale.id], 10)

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([])
    expect(useGlobalSessionsStore.getState().archivedSessions[0]?.time.archived).toBe(10)
  })

  test("keeps a newer title when an older response finishes last", async () => {
    const stale = session("updated", "Old")
    useGlobalSessionsStore.getState().applySnapshot([stale], [])
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(session("updated", "New"))

    listRequest.resolve([stale])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions[0]?.title).toBe("New")
  })

  test("uses commit-time state when the load fails", async () => {
    const created = session("created")
    const loading = useGlobalSessionsStore.getState().loadSessions()
    useGlobalSessionsStore.getState().upsertSession(created)

    listRequest.reject(new Error("unavailable"))
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([created])
    expect(useGlobalSessionsStore.getState().status).toBe("error")
  })

  test("retains active and archived sessions after pagination stalls, then recovers on a complete refresh", async () => {
    const active = session("active")
    const archived = session("archived", "archived", 5)
    useGlobalSessionsStore.getState().applySnapshot([active], [archived])
    let calls = 0
    opencodeClient.listSessionsPage = async () => {
      calls += 1
      return { sessions: [active], cursor: { next: "stalled" } }
    }

    const retained = await useGlobalSessionsStore.getState().loadSessions()

    expect(calls).toBe(2)
    expect(retained.activeSessions).toEqual([active])
    expect(retained.archivedSessions).toEqual([archived])
    expect(useGlobalSessionsStore.getState().status).toBe("error")

    opencodeClient.listSessionsPage = async () => ({ sessions: [active, archived], cursor: {} })
    await useGlobalSessionsStore.getState().loadSessions()

    expect(useGlobalSessionsStore.getState().status).toBe("ready")
    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([active])
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([archived])
  })

  test("retains directory sessions when its pagination cannot establish completeness", async () => {
    const active = { ...session("active"), directory: "/source" }
    const archived = { ...session("archived", "archived", 5), directory: "/source" }
    useGlobalSessionsStore.getState().applySnapshot([active], [archived])
    opencodeClient.listSessionsPage = async () => ({ sessions: [active], cursor: { next: "stalled" } })

    const retained = await useGlobalSessionsStore.getState().refreshSessionsForDirectories(["/source"])

    expect(retained.activeSessions).toEqual([active])
    expect(retained.archivedSessions).toEqual([archived])
  })

  test("splits a restored session into the active list", async () => {
    const loading = useGlobalSessionsStore.getState().loadSessions()

    listRequest.resolve([session("active"), session("archived", "archived", 5), session("restored", "restored", 0)])
    await loading

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["active", "restored"])
    expect(useGlobalSessionsStore.getState().archivedSessions.map((item) => item.id)).toEqual(["archived"])
    expect(useGlobalSessionsStore.getState().status).toBe("ready")
  })

  test("does not undo a move while refreshing the source directory", async () => {
    const source = { ...session("moved"), directory: "/source" } as Session
    const destination = { ...source, directory: "/destination" } as Session
    useGlobalSessionsStore.getState().applySnapshot([source], [])
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(["/source"])
    useGlobalSessionsStore.getState().upsertSession(destination)

    listRequest.resolve([source])
    await refreshing

    expect(useGlobalSessionsStore.getState().sessionsByDirectory.get("/source")).toBe(undefined)
    expect(useGlobalSessionsStore.getState().sessionsByDirectory.get("/destination")?.[0]?.id).toBe("moved")
  })

  test("keeps a restore mutation newer than the directory refresh", async () => {
    const archived = { ...session("restored", "restored", 5), directory: "/source" } as Session
    useGlobalSessionsStore.getState().applySnapshot([], [archived])
    const refreshing = useGlobalSessionsStore.getState().refreshSessionsForDirectories(["/source"])
    useGlobalSessionsStore.getState().upsertSession({ ...archived, time: { ...archived.time, archived: 0 } })

    // The server still reports the pre-restore row for this directory.
    listRequest.resolve([archived])
    await refreshing

    expect(useGlobalSessionsStore.getState().activeSessions.map((item) => item.id)).toEqual(["restored"])
    expect(useGlobalSessionsStore.getState().archivedSessions).toEqual([])
  })
})

describe("live directory-store sessions offered to a load", () => {
  const work = (state: "open" | "done") => ({ openchamber: { work: { state } } })
  const inDirectory = (directory: string, base: Session, metadata?: Session["metadata"]): Session => {
    const placed: Session = { ...base, directory }
    if (metadata) placed.metadata = metadata
    return placed
>>>>>>> upstream/main
  }
  for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
};
let runtime = 0;
let request = deferred<SessionDiscoveryResult>();
let list = spyOn(canonicalClient, 'listSessions');
let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let listWorkspaces = spyOn(canonicalClient, 'listWorkspaces');
let home = spyOn(hostFilesystem, 'getFilesystemHomeInfo');
let subagents = spyOn(canonicalClient, 'listSubagents');

beforeEach(async () => {
  flushPendingSessionWrites();
  switchRuntimeEndpoint({ apiBaseUrl: 'https://native-global-races.test', runtimeKey: `native-global-races-${++runtime}` });
  home = spyOn(hostFilesystem, 'getFilesystemHomeInfo').mockResolvedValue({ home: '/home/user', chatsRoot: '/srv/chats' });
  await ensureChatsRootDirectory();
  request = deferred<SessionDiscoveryResult>();
  list = spyOn(canonicalClient, 'listSessions').mockImplementation(() => request.promise);
  listWorkspaces = spyOn(canonicalClient, 'listWorkspaces').mockResolvedValue({ items: [], errors: {} });
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
  jest.useRealTimers();
  list.mockRestore();
  resolveWorkspace.mockRestore();
  listWorkspaces.mockRestore();
  home.mockRestore();
  subagents.mockRestore();
});

describe('native global mutation reconciliation', () => {
  const warmup = () => new CanonicalApiError({ type: 'urn:test:warmup', title: 'Unavailable', status: 503, detail: 'The Agent Service is not ready.', code: 'SERVICE_UNAVAILABLE', retryable: true });

  test.each([false, true])('startup discovery recovers after delayed readiness (empty=%s)', async (empty) => {
    jest.useFakeTimers();
    const readyAt = Date.now() + 25000;
    list.mockImplementation(async () => {
      if (Date.now() < readyAt) throw warmup();
      return { items: empty ? [] : [session('ses_ready')], errors: {} };
    });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    expect(useGlobalSessionsStore.getState().status).toBe('ready');
    expect(useGlobalSessionsStore.getState().globalRefreshFailed).toBe(false);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(empty ? [] : ['ses_ready']);
    expect(listWorkspaces).toHaveBeenCalledTimes(1);
  });

  test('a real failure after warmup stays an error and retains the previous snapshot', async () => {
    jest.useFakeTimers();
    useGlobalSessionsStore.getState().applySnapshot([session('ses_saved')], []);
    list.mockRejectedValueOnce(warmup()).mockRejectedValue(new CanonicalApiError({ type: 'urn:test:failed', title: 'Failed', status: 500, detail: 'Discovery failed', code: 'INTERNAL_ERROR', retryable: false }));
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    expect(useGlobalSessionsStore.getState().status).toBe('error');
    expect(useGlobalSessionsStore.getState().globalRefreshFailed).toBe(true);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_saved']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('startup retries are bounded when the service stays unavailable', async () => {
    jest.useFakeTimers();
    list.mockRejectedValue(warmup());
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    expect(useGlobalSessionsStore.getState().status).toBe('error');
    expect(useGlobalSessionsStore.getState().globalRefreshFailed).toBe(true);
    expect(list).toHaveBeenCalledTimes(8);
  });

  test('runtime reset cancels delayed startup retries', async () => {
    jest.useFakeTimers();
    list.mockRejectedValue(warmup());
    const loading = useGlobalSessionsStore.getState().loadSessions();
    for (let turn = 0; turn < 40; turn += 1) await Promise.resolve();
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    await advanceStartup();
    await loading;
    expect(list).toHaveBeenCalledTimes(1);
    expect(useGlobalSessionsStore.getState().status).toBe('idle');
  });

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
    useGlobalSessionsStore.getState().upsertSession({ ...stale, title: 'New', metadata: {}, metadataRevision: '2' });
    useGlobalSessionsStore.getState().archiveSessions(['ses_one'], 10);
    request.resolve({ items: [stale], errors: {} });
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(state.activeSessions).toEqual([]);
    expect(state.archivedSessions[0]?.archivedAt).toBe(10);
    expect(state.archivedSessions[0]?.title).toBe('New');
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
    const restored = { ...archived };
    delete restored.archivedAt;
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
  test.each(['global', 'directory'] as const)('a later healthy %s listing clears stale discovery errors without needing new records', async (scope) => {
    useGlobalSessionsStore.getState().applySnapshot([session('ses_failed')], []);
    useGlobalSessionsStore.setState({ discoveryErrors: new Map([['wsp_repo', 'SERVICE_UNAVAILABLE'], ['ses_failed', 'METADATA_READ_FAILED'], ['wsp_other', 'SERVICE_UNAVAILABLE']]) });
    list.mockResolvedValue({ items: [session('ses_failed')], errors: {} });
    if (scope === 'global') await useGlobalSessionsStore.getState().refreshSessionHead();
    else await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    expect(useGlobalSessionsStore.getState().discoveryErrors.has('wsp_repo')).toBe(false);
    expect(useGlobalSessionsStore.getState().discoveryErrors.has('ses_failed')).toBe(false);
    expect(useGlobalSessionsStore.getState().discoveryErrors.has('wsp_other')).toBe(scope === 'directory');
  });

  test.each([false, true])('all-unavailable HTTP 200 discovery retries before accepting an empty=%s result', async (empty) => {
    jest.useFakeTimers();
    list.mockResolvedValueOnce({ items: [], errors: { wsp_repo: 'SERVICE_UNAVAILABLE', wsp_other: 'SERVICE_UNAVAILABLE' } })
      .mockResolvedValue({ items: empty ? [] : [session('ses_ready')], errors: {} });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    expect(list).toHaveBeenCalledTimes(2);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(empty ? [] : ['ses_ready']);
    expect(useGlobalSessionsStore.getState().status).toBe('ready');
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
  });

  test('an entity failure preserves its owner while healthy siblings reconcile', async () => {
    const failed = session('ses_failed', { archivedAt: 4 });
    useGlobalSessionsStore.getState().applySnapshot([session('ses_removed'), session('ses_healthy')], [failed]);
    request.resolve({ items: [session('ses_healthy', { title: 'Fresh', metadata: {}, metadataRevision: '2' })], errors: { ses_failed: 'METADATA_READ_FAILED' } });
    await useGlobalSessionsStore.getState().loadSessions();
    const state = useGlobalSessionsStore.getState();
    expect(state.entityById.get('ses_failed')).toBe(failed);
    expect(state.entityById.has('ses_removed')).toBe(false);
    expect(state.entityById.get('ses_healthy')?.title).toBe('Fresh');
    expect(state.status).toBe('ready');
    expect(state.hasLoaded).toBe(true);
    expect(state.discoveryErrors.get('ses_failed')).toBe('METADATA_READ_FAILED');
    expect(list).toHaveBeenCalledTimes(1);
  });

  test.each([false, true])('transient partial discovery recovers without losing healthy results (empty=%s)', async (empty) => {
    jest.useFakeTimers();
    useGlobalSessionsStore.getState().upsertSession(session('ses_cached'));
    const recovered = deferred<SessionDiscoveryResult>();
    list.mockResolvedValueOnce({
      items: [session('ses_healthy', { workspaceId: 'wsp_other', projectId: 'pro_other' })],
      errors: { wsp_repo: 'SERVICE_UNAVAILABLE' },
    }).mockImplementation(() => recovered.promise);
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup(1);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_cached', 'ses_healthy']);
    expect(useGlobalSessionsStore.getState().status).toBe('loading');
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(false);
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    recovered.resolve({
      items: empty ? [] : [session('ses_healthy', { workspaceId: 'wsp_other', projectId: 'pro_other' }), session('ses_recovered')],
      errors: {},
    });
    await loading;
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(empty ? [] : ['ses_healthy', 'ses_recovered']);
    expect(useGlobalSessionsStore.getState().status).toBe('ready');
    expect(useGlobalSessionsStore.getState().hasLoaded).toBe(true);
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    expect(list).toHaveBeenCalledTimes(2);
  });

  test('transient exhaustion preserves healthy results and exposes only failed scopes', async () => {
    jest.useFakeTimers();
    list.mockResolvedValue({
      items: [session('ses_healthy')],
      errors: { wsp_other: 'SERVICE_UNAVAILABLE', ses_failed: 'METADATA_READ_FAILED' },
    }).mockRejectedValueOnce(new CanonicalApiError({ type: 'urn:test:warmup', title: 'Unavailable', status: 503, detail: 'The Agent Service is not ready.', code: 'SERVICE_UNAVAILABLE', retryable: true }));
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup(1);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_healthy']);
    expect([...useGlobalSessionsStore.getState().discoveryErrors]).toEqual([['ses_failed', 'METADATA_READ_FAILED']]);
    await advanceStartup();
    await loading;
    expect(list).toHaveBeenCalledTimes(8);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_healthy']);
    expect(useGlobalSessionsStore.getState().discoveryErrors.get('wsp_other')).toBe('SERVICE_UNAVAILABLE');
    expect(useGlobalSessionsStore.getState().status).toBe('ready');
    expect(useGlobalSessionsStore.getState().globalRefreshFailed).toBe(false);
  });

  test('runtime switch retires transient partial discovery before another request', async () => {
    jest.useFakeTimers();
    list.mockResolvedValue({ items: [session('ses_old')], errors: { wsp_other: 'SERVICE_UNAVAILABLE' } });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup(1);
    const attempts = list.mock.calls.length;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://replacement.test', runtimeKey: `replacement-${++runtime}` });
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    await advanceStartup();
    await loading;
    expect(list).toHaveBeenCalledTimes(attempts);
    expect(useGlobalSessionsStore.getState().activeSessions).toEqual([]);
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
  });

  test('a failed workspace preserves its records but not missing healthy-workspace siblings', async () => {
    jest.useFakeTimers();
    useGlobalSessionsStore.getState().upsertSessions([session('ses_failed'), session('ses_removed', { workspaceId: 'wsp_other', projectId: 'pro_other' })]);
    request.resolve({ items: [], errors: { wsp_repo: 'SERVICE_UNAVAILABLE' } });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(ids(state.activeSessions)).toEqual(['ses_failed']);
    expect(state.hasLoaded).toBe(true);
    expect(state.status).toBe('ready');
    expect(state.discoveryErrors.get('wsp_repo')).toBe('SERVICE_UNAVAILABLE');
  });

  test('a failed project preserves its records but not missing healthy-project siblings', async () => {
    jest.useFakeTimers();
    useGlobalSessionsStore.getState().upsertSessions([session('ses_failed'), session('ses_removed', { workspaceId: 'wsp_other', projectId: 'pro_other' })]);
    request.resolve({ items: [], errors: { pro_repo: 'SERVICE_UNAVAILABLE' } });
    const loading = useGlobalSessionsStore.getState().loadSessions();
    await advanceStartup();
    await loading;
    const state = useGlobalSessionsStore.getState();
    expect(ids(state.activeSessions)).toEqual(['ses_failed']);
    expect(state.hasLoaded).toBe(true);
    expect(state.status).toBe('ready');
    expect(state.discoveryErrors.get('pro_repo')).toBe('SERVICE_UNAVAILABLE');
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

  test('a project-scoped error preserves only that project while its sibling reconciles', async () => {
    useGlobalSessionsStore.getState().applySnapshot([
      session('ses_failed'),
      session('ses_removed', { workspaceId: 'wsp_other', projectId: 'pro_other' }),
    ], []);
    list.mockImplementation(async (workspaceId): Promise<SessionDiscoveryResult> => {
      if (workspaceId === 'wsp_repo') return { items: [], errors: { pro_repo: 'SERVICE_UNAVAILABLE' } };
      return { items: [], errors: {} };
    });
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo', '/other']);
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_failed']);
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
    const state = useGlobalSessionsStore.getState();
    expect(ids(state.activeSessions)).toEqual(['ses_new']);
    expect(state.hasLoaded).toBe(true);
    expect(state.status).toBe('ready');
    expect(state.discoveryErrors.get(failedIdentity)).toBe('METADATA_READ_FAILED');
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

  test.each(['head', 'directory', 'workspace'] as const)('a healthy %s root listing cannot clear a failed child lookup', async (scope) => {
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await discover(false);
    expect(useGlobalSessionsStore.getState().discoveryErrors.get('ses_root')).toBe('SERVICE_UNAVAILABLE');
    if (scope === 'head') await useGlobalSessionsStore.getState().refreshSessionHead();
    else if (scope === 'directory') await discover(true);
    else useGlobalSessionsStore.getState().clearWorkspaceDiscoveryErrors('wsp_repo');
    expect(useGlobalSessionsStore.getState().discoveryErrors.get('ses_root')).toBe('SERVICE_UNAVAILABLE');
    expect([...useGlobalSessionsStore.getState().failedChildDiscoveryParents]).toEqual(['ses_root']);
    expect(subagents).toHaveBeenCalledTimes(scope === 'workspace' ? 1 : 2);

    subagents.mockResolvedValue([child()]);
    if (scope === 'directory') await discover(true);
    else await useGlobalSessionsStore.getState().refreshSessionHead();
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(true);
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    expect(useGlobalSessionsStore.getState().failedChildDiscoveryParents.size).toBe(0);
  });

  test('successful empty child retry clears the failure and removes only omitted children', async () => {
    subagents.mockResolvedValue([child()]);
    await discover(false);
    const previous = useGlobalSessionsStore.getState().entityById.get('ses_child');
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await discover(false);
    await useGlobalSessionsStore.getState().refreshSessionHead();
    expect(useGlobalSessionsStore.getState().entityById.get('ses_child')).toBe(previous);
    expect(useGlobalSessionsStore.getState().discoveryErrors.has('ses_root')).toBe(true);
    subagents.mockResolvedValue([]);
    await useGlobalSessionsStore.getState().refreshSessionHead();
    expect(ids(useGlobalSessionsStore.getState().activeSessions)).toEqual(['ses_root']);
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    expect(useGlobalSessionsStore.getState().failedChildDiscoveryParents.size).toBe(0);
  });

  test('a root-only head response cannot erase a child failure discovered while it was in flight', async () => {
    useGlobalSessionsStore.getState().applySnapshot([session('ses_root')], []);
    const rootRead = deferred<SessionDiscoveryResult>();
    list.mockImplementation((workspaceId) => workspaceId ? Promise.resolve({ items: [session('ses_root')], errors: {} }) : rootRead.promise);
    const head = useGlobalSessionsStore.getState().refreshSessionHead();
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/repo']);
    rootRead.resolve({ items: [session('ses_root')], errors: {} });
    await head;
    expect(useGlobalSessionsStore.getState().discoveryErrors.get('ses_root')).toBe('SERVICE_UNAVAILABLE');
    expect([...useGlobalSessionsStore.getState().failedChildDiscoveryParents]).toEqual(['ses_root']);
    subagents.mockResolvedValue([child()]);
    list.mockResolvedValue({ items: [session('ses_root')], errors: {} });
    await useGlobalSessionsStore.getState().refreshSessionHead();
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(true);
  });

  test('a healthy sibling directory does not clear another parent failure', async () => {
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await discover(false);
    list.mockResolvedValue({ items: [session('ses_other', { workspaceId: 'wsp_other' })], errors: {} });
    subagents.mockResolvedValue([]);
    await useGlobalSessionsStore.getState().refreshSessionsForDirectories(['/other']);
    expect(useGlobalSessionsStore.getState().discoveryErrors.get('ses_root')).toBe('SERVICE_UNAVAILABLE');
    expect(useGlobalSessionsStore.getState().entityById.has('ses_other')).toBe(true);
    expect([...useGlobalSessionsStore.getState().failedChildDiscoveryParents]).toEqual(['ses_root']);
  });

  test('runtime reset retires a pending child retry and its errors', async () => {
    subagents.mockRejectedValue(new Error('child discovery offline'));
    await discover(false);
    const started = deferred<void>();
    const pending = deferred<Subagent[]>();
    subagents.mockImplementation(() => { started.resolve(); return pending.promise; });
    const retry = useGlobalSessionsStore.getState().refreshSessionHead();
    await started.promise;
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    pending.resolve([child()]);
    await retry;
    expect(useGlobalSessionsStore.getState().discoveryErrors.size).toBe(0);
    expect(useGlobalSessionsStore.getState().failedChildDiscoveryParents.size).toBe(0);
    expect(useGlobalSessionsStore.getState().entityById.has('ses_child')).toBe(false);
  });

  test.each([false, true])('projects canonical children and indexes hierarchy (directory=%s)', async (directory) => {
    subagents.mockResolvedValue([child()]);
    await discover(directory);
    const state = useGlobalSessionsStore.getState();
    expect(state.entityById.get('ses_child')).toEqual(session('ses_child', {
      parentSessionId: 'ses_root', rootSessionId: 'ses_root', title: 'Worker', metadata: null, metadataRevision: '0',
      runtimeStatus: 'idle', activeRunId: null,
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
      title: 'Worker', metadata: null, metadataRevision: '0', runtimeStatus: 'idle', activeRunId: null,
    });
  });
});
