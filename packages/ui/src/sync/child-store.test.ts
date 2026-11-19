import { describe, expect, test } from "bun:test"
import {
  ChildStoreManager,
  markDirectorySessionPartChanged,
  subscribeDirectoryForm,
  subscribeDirectoryForms,
  subscribeDirectoryPermission,
  subscribeDirectoryPermissions,
  subscribeDirectorySessionMessages,
} from "./child-store"
import { DIR_IDLE_TTL_MS, EVICTION_GRACE_MS, MAX_DIR_STORES, type State } from "./types"
import { FilesystemError } from "@/lib/api/files-errors"
import { CanonicalApiError } from "@/api/canonicalClient"
import type { ApprovalRequest, QuestionRequest } from "@openchamber/agent-contract"
import { nativeSnapshot } from "./session-message-loader-test-fixtures"

type Deferred = { promise: Promise<void>; resolve: () => void }
const settle = async () => { await Promise.resolve(); await Promise.resolve() }
const deferred = (): Deferred => {
  let resolve!: () => void
  const promise = new Promise<void>((next) => { resolve = next })
  return { promise, resolve }
}
const approval = (approvalId: string, sessionId: string): ApprovalRequest => ({
  version: "1", epoch: "epoch-1", workerGeneration: "worker-1", approvalId, sessionId,
  turnId: "turn-1", toolCallId: `tool-${approvalId}`, toolName: "bash", actionType: "bash_command",
  commandSummary: "ls", details: {}, status: "pending", requestedAt: 1,
})
const question = (questionId: string, sessionId: string): QuestionRequest => ({
  version: "1", epoch: "epoch-1", workerGeneration: "worker-1", questionId, sessionId, turnId: "turn-1",
  prompt: "Continue?", status: "pending", requestedAt: 1,
})
const message = (messageId: string, sessionId = "session-1") => ({
  messageId, sessionId, turnId: "turn-1", role: "assistant" as const, createdAt: 1, parts: [],
})

describe("ChildStoreManager subscriptions", () => {
  test("notifies only the changed permission and form buckets", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    let permissionCalls = 0
    let formCalls = 0
    const unsubscribers = [
      subscribeDirectoryPermissions(child, ["session-1"], () => { permissionCalls += 1 }),
      subscribeDirectoryPermission(child, "session-2", () => { permissionCalls += 1 }),
      subscribeDirectoryForms(child, ["session-1"], () => { formCalls += 1 }),
      subscribeDirectoryForm(child, "session-2", () => { formCalls += 1 }),
    ]
    child.setState({ permission: { "session-1": [approval("approval-1", "session-1")] } })
    expect(permissionCalls).toBe(1)
    expect(formCalls).toBe(0)
    child.setState({ form: { "session-2": [question("question-2", "session-2")] } })
    expect(permissionCalls).toBe(1)
    expect(formCalls).toBe(1)
    child.setState({ permission: { "session-1": child.getState().permission["session-1"]!, "session-2": [approval("approval-2", "session-2")] } })
    expect(permissionCalls).toBe(2)
    for (const unsubscribe of unsubscribers) unsubscribe()
    manager.disposeAll()
  })

  test("routes inline part changes only to the owning session", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    const changes: Array<{ messagesChanged: boolean; partMessageIds: readonly string[] }> = []
    child.setState({ message: { "session-1": [message("message-1")], "session-2": [message("message-2", "session-2")] } })
    const unsubscribe = subscribeDirectorySessionMessages(child, "session-1", (change) => changes.push(change))
    markDirectorySessionPartChanged(child, "session-1", "message-1")
    child.setState({ message: { ...child.getState().message, "session-1": [{ ...message("message-1"), parts: [{ type: "text", partId: "part-1", content: "hello" }] }] } })
    expect(changes.at(-1)).toMatchObject({ messagesChanged: false, partMessageIds: ["message-1"] })
    unsubscribe()
    manager.disposeAll()
  })

  test("keeps unrelated message changes out of a session subscriber", () => {
    const manager = new ChildStoreManager()
    const child = manager.ensureChild("/workspace", { bootstrap: false })
    let calls = 0
    const unsubscribe = subscribeDirectorySessionMessages(child, "session-1", () => { calls += 1 })
    child.setState({ message: { "session-2": [message("message-2", "session-2")] } })
    expect(calls).toBe(0)
    unsubscribe()
    manager.disposeAll()
  })
})

describe("ChildStoreManager directory lifecycle", () => {
  test("keeps an idle directory alive until its final consumer releases it", () => {
    const manager = new ChildStoreManager()
    const originalDateNow = Date.now
    let currentTime = 10_000
    Date.now = () => currentTime
    try {
      const child = manager.ensureChild("/workspace", { bootstrap: false })
      manager.pin("/workspace/")
      manager.pin("/workspace")
      manager.unpin("/workspace")
      currentTime += DIR_IDLE_TTL_MS + EVICTION_GRACE_MS + 1
      manager.runEviction()
      expect(manager.pinned("/workspace")).toBe(true)
      expect(manager.getChild("/workspace")).toBe(child)
      manager.unpin("/workspace/")
      expect(manager.pinned("/workspace")).toBe(false)
      expect(manager.getChild("/workspace")).toBeUndefined()
    } finally {
      Date.now = originalDateNow
      manager.disposeAll()
    }
  })

  test("keeps expanded directories alive while foreground demand exists", () => {
    const manager = new ChildStoreManager()
    const originalDateNow = Date.now
    let currentTime = 10_000
    Date.now = () => currentTime
    const directories = Array.from({ length: MAX_DIR_STORES + 5 }, (_, index) => `/workspace-${index}`)
    try {
      for (const directory of directories) manager.ensureChild(directory, { bootstrap: false }).setState({ status: "complete" })
      manager.setBootstrapDemand("expanded-sidebar", directories.map((directory) => ({ directory, priority: "expanded" as const, reason: "project-expanded" as const })))
      currentTime += EVICTION_GRACE_MS + 1
      manager.runEviction()
      expect(directories.every((directory) => manager.getChild(directory))).toBe(true)
    } finally {
      Date.now = originalDateNow
      manager.disposeAll()
    }
  })
})

describe("ChildStoreManager bootstrap scheduler", () => {
  test("bounds concurrency and eventually refreshes every queued directory", async () => {
    const manager = new ChildStoreManager()
    const running = new Map<string, Deferred>()
    const started: string[] = []
    let maxRunning = 0
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: ({ directory }) => {
        const task = deferred()
        running.set(directory, task)
        started.push(directory)
        maxRunning = Math.max(maxRunning, running.size)
        return task.promise.finally(() => running.delete(directory))
      },
    })
    manager.setBootstrapDemand("sidebar", Array.from({ length: 10 }, (_, index) => ({ directory: `/workspace-${index}`, priority: "expanded" as const, reason: "project-expanded" as const })))
    while (started.length < 10) {
      expect(running.size).toBeLessThanOrEqual(2)
      running.values().next().value?.resolve()
      await settle()
    }
    for (const task of running.values()) task.resolve()
    await settle()
    expect(new Set(started).size).toBe(10)
    expect(maxRunning).toBe(2)
    cleanup()
    manager.disposeAll()
  })

  test("continues after a synchronous failure and records a failed directory", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ directory }) => { started.push(directory); if (directory === "/failed") throw new Error("failed") },
    })
    manager.setBootstrapDemand("sidebar", [
      { directory: "/failed", priority: "expanded", reason: "project-expanded" },
      { directory: "/healthy", priority: "expanded", reason: "project-expanded" },
    ])
    await settle(); await settle()
    expect(started).toEqual(["/failed", "/healthy"])
    expect(manager.getBootstrapState("/failed")).toBe("failed")
    expect(manager.getBootstrapState("/healthy")).toBe("complete")
    cleanup(); manager.disposeAll()
  })

  test("requeues a failed environment initialization when the bootstrap list phase completed", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    let failEnvironment = true
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        trackInitialization(failEnvironment ? Promise.reject(new Error("environment unavailable")) : Promise.resolve())
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("failed")

    failEnvironment = false
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(true)
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    await settle(); await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("complete")

    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    expect(runs).toBe(2)
    cleanup(); manager.disposeAll()
  })

  test("consumes a recovery signal received while environment initialization is running", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    let rejectInitialization!: (error: unknown) => void
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        if (runs === 1) trackInitialization(new Promise<void>((_, reject) => { rejectInitialization = reject }))
        else trackInitialization(Promise.resolve())
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getInitializationState("/workspace")).toBe("running")
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)

    rejectInitialization(new Error("environment unavailable"))
    await settle(); await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getInitializationState("/workspace")).toBe("complete")
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    cleanup(); manager.disposeAll()
  })

  test("does not requeue a non-retryable initialization failure", async () => {
    const manager = new ChildStoreManager()
    let runs = 0
    const denial = new CanonicalApiError({ type: "urn:test:denied", title: "Denied", status: 403, detail: "Forbidden", code: "UNAUTHORIZED", retryable: false })
    const cleanup = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: ({ trackInitialization }) => {
        runs += 1
        trackInitialization(Promise.reject(denial))
      },
    })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "current-directory" })
    await settle(); await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    expect(manager.getInitializationState("/workspace")).toBe("failed")

    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    await settle(); await settle()
    expect(manager.retryFailedBootstraps().has("/workspace")).toBe(false)
    expect(runs).toBe(1)
    expect(manager.getInitializationState("/workspace")).toBe("failed")
    cleanup(); manager.disposeAll()
  })

  test("records permission failures and clears them on a forced retry", async () => {
    const manager = new ChildStoreManager()
    let denied = true
    const cleanup = manager.configure({ onBootstrap: () => { if (denied) throw new FilesystemError("Access denied", { reason: "os-permission", status: 403 }) } })
    manager.requestBootstrap({ directory: "/protected", priority: "selected", reason: "current-directory" })
    await settle(); await settle()
    expect(manager.getBootstrapFailure("/protected")).toBe("os-permission")
    denied = false
    manager.requestBootstrap({ directory: "/protected", priority: "selected", reason: "action-demand", force: true })
    await settle(); await settle()
    expect(manager.getBootstrapState("/protected")).toBe("complete")
    expect(manager.getBootstrapFailure("/protected")).toBeUndefined()
    cleanup(); manager.disposeAll()
  })

  test("does not publish a completion from a superseded runtime scope", async () => {
    const manager = new ChildStoreManager()
    let current = true
    let runs = 0
    const old = deferred()
    manager.configure({ isCurrentScope: () => current, onBootstrap: () => { runs += 1; return old.promise } })
    manager.requestBootstrap({ directory: "/workspace", priority: "selected", reason: "selected-session" })
    current = false
    old.resolve()
    await settle(); await settle()
    expect(runs).toBe(1)
    expect(manager.getBootstrapState("/workspace")).toBe("queued")
    current = true
    manager.configure({ isCurrentScope: () => current, onBootstrap: () => { runs += 1 } })
    await settle(); await settle()
    expect(runs).toBe(2)
    expect(manager.getBootstrapState("/workspace")).toBe("complete")
    manager.disposeAll()
  })
})

describe("ChildStoreManager stream restart recovery", () => {
  const bootstrapped = (manager: ChildStoreManager, directory: string, patch: Partial<State> = {}) => manager.ensureChild(directory, { bootstrap: false }).setState({ status: "complete", ...patch })

  test("refreshes current, pinned, waiting, and active directories while deferring idle stores", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    bootstrapped(manager, "/current")
    bootstrapped(manager, "/pinned")
    bootstrapped(manager, "/waiting", { permission: { waiting: [approval("approval", "waiting")] } })
    bootstrapped(manager, "/busy", { session_status: { busy: "running" } })
    bootstrapped(manager, "/idle")
    manager.setBootstrapDemand("column", [{ directory: "/pinned", priority: "selected", reason: "selected-session" }])
    const cleanup = manager.configure({ bootstrapConcurrency: 2, onBootstrap: async ({ directory }) => { started.push(directory) } })
    const refreshing = manager.refreshAfterStreamRestart("/current")
    for (let index = 0; index < 10; index += 1) await settle()
    expect([...refreshing].sort()).toEqual(["/busy", "/current", "/pinned", "/waiting"])
    expect(started).toEqual(expect.arrayContaining(["/current", "/pinned", "/waiting", "/busy"]))
    expect(started).not.toContain("/idle")
    cleanup(); manager.disposeAll()
  })

<<<<<<< HEAD
  test("refreshes an idle store when a listed session becomes active during the gap", async () => {
    const manager = new ChildStoreManager()
    const started: string[] = []
    bootstrapped(manager, "/current")
    bootstrapped(manager, "/asked", { session: [{ ...nativeSnapshot("session-asked", []).session, metadata: null, metadataRevision: "0", archiveRevision: "0" }], session_status: { "session-asked": "idle" } })
    const cleanup = manager.configure({ bootstrapConcurrency: 2, onBootstrap: async ({ directory }) => { started.push(directory) } })
    manager.refreshAfterStreamRestart("/current")
    await settle(); await settle()
    expect([...manager.refreshStaleDirectoriesWithActiveSessions(new Set(["session-asked", "elsewhere"]))]).toEqual(["/asked"])
    await settle(); await settle()
    expect(started).toEqual(["/current", "/asked"])
    cleanup(); manager.disposeAll()
  })
})
||||||| bc50ba56aa
  test('reruns a manual demand after its bootstrap generation becomes stale', async () => {
    const manager = new ChildStoreManager();
    const staleRun = deferred();
    const started: string[] = [];
    const cleanupStale = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: () => {
        started.push('stale');
        return staleRun.promise;
      },
    });

    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
    cleanupStale();
    const cleanupCurrent = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: () => {
        started.push('current');
      },
    });
    staleRun.resolve();
    await settle();
    await settle();

    expect(started).toEqual(['stale', 'current']);
    expect(manager.getBootstrapState('/workspace')).toBe('complete');
    cleanupCurrent();
    manager.disposeAll();
  });
});

describe('ChildStoreManager bootstrap context liveness', () => {
  test('isCurrent stays true after the run settles so deferred recovery work can commit', async () => {
    const manager = new ChildStoreManager();
    let captured: DirectoryBootstrapContext | undefined;
    const cleanup = manager.configure({
      onBootstrap: (context) => {
        captured = context;
      },
    });
    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
    await settle();
    expect(manager.getBootstrapState('/workspace')).toBe('complete');

    // bootstrapDirectory schedules deferred recovery pulls (permission.list
    // and friends) from a setTimeout(0), which always runs after the pump's
    // .finally() has cleaned up the run entry. isCurrent must remain true
    // there, or those pulls and every commit they make get skipped.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(captured?.isCurrent()).toBe(true);

    cleanup();
    expect(captured?.isCurrent()).toBe(false);
    manager.disposeAll();
  });

  test('a newer same-directory run invalidates the previous context', async () => {
    const manager = new ChildStoreManager();
    const contexts: DirectoryBootstrapContext[] = [];
    const cleanup = manager.configure({
      onBootstrap: (context) => {
        contexts.push(context);
      },
    });
    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
    await settle();
    expect(contexts[0]?.isCurrent()).toBe(true);

    // A forced rerun for the same directory must retire the previous
    // context: its in-flight deferred responses may no longer commit over
    // whatever the newer run synchronizes.
    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'server-connected', force: true });
    await settle();
    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.isCurrent()).toBe(false);
    expect(contexts[1]?.isCurrent()).toBe(true);

    cleanup();
    manager.disposeAll();
  });
});

describe('ChildStoreManager after an OpenCode stream restart', () => {
  const bootstrapped = (manager: ChildStoreManager, directory: string, patch: Partial<State> = {}) => {
    manager.ensureChild(directory, { bootstrap: false }).setState({ status: 'complete', ...patch });
  };

  // Before: every bootstrapped store re-read at once (six bootstraps here, each
  // about eight requests and a location start on v2).
  test('re-reads only stores in use or showing live state, the rest on their next demand', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    bootstrapped(manager, '/current');
    bootstrapped(manager, '/pinned-column');
    bootstrapped(manager, '/waiting', {
      permission: { ses_waiting: [{ id: 'per_1', sessionID: 'ses_waiting' } as PermissionRequest] },
    });
    bootstrapped(manager, '/busy', { session_status: { ses_busy: { type: 'busy' } } });
    bootstrapped(manager, '/idle-a', { session_status: { ses_idle: { type: 'idle' } } });
    bootstrapped(manager, '/idle-b');
    manager.ensureChild('/never-bootstrapped', { bootstrap: false });
    manager.setBootstrapDemand('column', [{ directory: '/pinned-column', priority: 'selected', reason: 'selected-session' }]);
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => { started.push(directory); },
    });
    expect(started).toEqual([]);

    const refreshing = manager.refreshAfterStreamRestart('/current');
    for (let index = 0; index < 20; index += 1) await settle();

    expect([...refreshing].sort()).toEqual(['/busy', '/current', '/pinned-column', '/waiting']);
    expect([...started].sort()).toEqual(['/busy', '/current', '/pinned-column', '/waiting']);
    // Foreground first; live-state stores drain behind them in the background.
    expect(started.slice(0, 2).sort()).toEqual(['/current', '/pinned-column']);

    // A deferred store re-reads as soon as something uses it, once.
    manager.setBootstrapDemand('sidebar', [{ directory: '/idle-a', priority: 'selected', reason: 'selected-session' }]);
    await settle();
    expect(started.filter((directory) => directory === '/idle-a')).toEqual(['/idle-a']);
    manager.setBootstrapDemand('sidebar', [
      { directory: '/idle-a', priority: 'selected', reason: 'selected-session' },
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
    ]);
    await settle();
    expect(started.filter((directory) => directory === '/idle-a' || directory === '/current')).toEqual(['/current', '/idle-a']);
    expect(started.includes('/idle-b')).toBe(false);
    expect(started.includes('/never-bootstrapped')).toBe(false);
    cleanup();
    manager.disposeAll();
  });

  test('a store idle before the gap re-reads when OpenCode lists one of its sessions active', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    const session = (id: string) => ({ id } as State['session'][number]);
    bootstrapped(manager, '/current');
    // Idle before the gap; its session asked a permission while events were lost.
    bootstrapped(manager, '/asked-during-gap', { session: [session('ses_asked')], session_status: { ses_asked: { type: 'idle' } } });
    bootstrapped(manager, '/still-idle', { session: [session('ses_quiet')] });
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => { started.push(directory); },
    });

    manager.refreshAfterStreamRestart('/current');
    await settle();
    expect(started).toEqual(['/current']);

    // Before: nothing re-read it until it was selected, so it showed idle
    // with no permission. The current store is not stale anymore and is skipped.
    const queued = manager.refreshStaleDirectoriesWithActiveSessions(new Set(['ses_asked', 'ses_elsewhere']));
    for (let index = 0; index < 5; index += 1) await settle();
    expect([...queued]).toEqual(['/asked-during-gap']);
    expect(started).toEqual(['/current', '/asked-during-gap']);

    // A store that re-read is no longer stale; a second answer queues nothing.
    expect([...manager.refreshStaleDirectoriesWithActiveSessions(new Set(['ses_asked']))]).toEqual([]);
    cleanup();
    manager.disposeAll();
  });

  test('bootstraps that failed while OpenCode started re-run on its first connection; complete ones do not', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    let openCodeReady = false;
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => {
        started.push(directory);
        if (!openCodeReady && directory !== '/complete') throw new Error('502 OpenCode is starting');
      },
    });
    manager.setBootstrapDemand('sidebar', [
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
      { directory: '/complete', priority: 'active-project', reason: 'known-project' },
    ]);
    manager.requestBootstrap({ directory: '/background', priority: 'background', reason: 'action-demand' });
    for (let index = 0; index < 10; index += 1) await settle();
    expect(manager.getBootstrapState('/current')).toBe('failed');
    expect(manager.getBootstrapState('/background')).toBe('failed');
    expect(manager.getBootstrapState('/complete')).toBe('complete');
    // A failed bootstrap stays failed: demand without force does not retry it.
    manager.setBootstrapDemand('sidebar', [
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
      { directory: '/complete', priority: 'active-project', reason: 'known-project' },
    ]);
    await settle();
    expect(started.filter((directory) => directory === '/current')).toEqual(['/current']);

    openCodeReady = true;
    started.length = 0;
    const queued = manager.retryFailedBootstraps();
    for (let index = 0; index < 10; index += 1) await settle();
    expect([...queued]).toEqual(['/current']);
    expect(started).toEqual(['/current']);
    expect(manager.getBootstrapState('/current')).toBe('complete');

    // The background store re-reads when something uses it again.
    manager.setBootstrapDemand('column', [{ directory: '/background', priority: 'visible', reason: 'known-project' }]);
    for (let index = 0; index < 10; index += 1) await settle();
    expect(started).toEqual(['/current', '/background']);
    expect(manager.getBootstrapState('/background')).toBe('complete');
    cleanup();
    manager.disposeAll();
  });

  test('a bootstrap running across the restart reruns when its store is in use', async () => {
    const manager = new ChildStoreManager();
    const tasks: Array<ReturnType<typeof deferred>> = [];
    const started: string[] = [];
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: ({ directory }) => {
        started.push(directory);
        const task = deferred();
        tasks.push(task);
        return task.promise;
      },
    });
    manager.ensureChild('/current', { bootstrap: false }).setState({ status: 'partial' });
    manager.setBootstrapDemand('sidebar', [{ directory: '/current', priority: 'selected', reason: 'current-directory', force: true }]);
    expect(started).toEqual(['/current']);

    manager.refreshAfterStreamRestart('/current');
    tasks[0]?.resolve();
    await settle();
    await settle();
    expect(started).toEqual(['/current', '/current']);
    tasks[1]?.resolve();
    await settle();
    cleanup();
    manager.disposeAll();
  });
});

describe('ChildStoreManager persisted session seed', () => {
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  const spaceDirectory = '/spaces/a1b2c3d4e5f6/app';
  const session = (directory: string): Session => ({
    id: `ses_${directory.length}`,
    projectID: 'project',
    directory,
    title: 'Cached',
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
  });
  const seedCache = (directory: string) => {
    persistSessions(directory, [session(directory)]);
    flushPendingSessionWrites();
    expect(readDirCache(directory).sessions?.length).toBe(1);
  };
  const cachedKeys = () => [...values.keys()].filter((key) => key.startsWith('oc.dir.'));

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
  });

  test('a new store seeds from the cache only where the owner allows it', () => {
    seedCache('/workspace');
    seedCache(spaceDirectory);
    const manager = new ChildStoreManager({ seedsSessions: (directory) => !directory.startsWith('/spaces/') });
    // Before `configure` as well: a consumer's store made during the first render is gated too.
    expect(manager.ensureChild('/workspace', { bootstrap: false }).getState().session.map((entry) => entry.id)).toEqual(['ses_10']);
    const space = manager.ensureChild(spaceDirectory, { bootstrap: false }).getState();
    expect(space.session).toEqual([]);
    expect(space.sessionListSource).toBe('empty');
    // The cache itself stays: the owner may know the space at the next start.
    expect(readDirCache(spaceDirectory).sessions?.length).toBe(1);
    manager.disposeAll();
  });

  test('forgetting a directory empties its store, drops its cache and disposes it once nothing holds it', () => {
    seedCache(spaceDirectory);
    const manager = new ChildStoreManager();
    const store = manager.ensureChild(spaceDirectory, { bootstrap: false });
    expect(store.getState().session.length).toBe(1);
    manager.pin(spaceDirectory);
    manager.forgetDirectory(spaceDirectory);
    // Held by a consumer: the store stays, listing nothing, and its cache is gone.
    expect(manager.getChild(spaceDirectory)).toBe(store);
    expect(store.getState().session).toEqual([]);
    expect(store.getState().sessionListSource).toBe('empty');
    expect(cachedKeys()).toEqual([]);
    manager.unpin(spaceDirectory);
    manager.forgetDirectory(spaceDirectory);
    expect(manager.getChild(spaceDirectory)).toBe(undefined);
    expect(cachedKeys()).toEqual([]);
    manager.disposeAll();
  });
});
=======
  test('reruns a manual demand after its bootstrap generation becomes stale', async () => {
    const manager = new ChildStoreManager();
    const staleRun = deferred();
    const started: string[] = [];
    const cleanupStale = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: () => {
        started.push('stale');
        return staleRun.promise;
      },
    });

    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
    cleanupStale();
    const cleanupCurrent = manager.configure({
      bootstrapConcurrency: 1,
      onBootstrap: () => {
        started.push('current');
      },
    });
    staleRun.resolve();
    await settle();
    await settle();

    expect(started).toEqual(['stale', 'current']);
    expect(manager.getBootstrapState('/workspace')).toBe('complete');
    cleanupCurrent();
    manager.disposeAll();
  });
});

describe('ChildStoreManager bootstrap context liveness', () => {
  test('isCurrent stays true after the run settles so deferred recovery work can commit', async () => {
    const manager = new ChildStoreManager();
    let captured: DirectoryBootstrapContext | undefined;
    const cleanup = manager.configure({
      onBootstrap: (context) => {
        captured = context;
      },
    });
    const completed = deferred();
    const unsubscribe = manager.subscribeBootstrap(() => {
      if (manager.getBootstrapState('/workspace') === 'complete') completed.resolve();
    });
    try {
      manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
      await completed.promise;
      expect(manager.getBootstrapState('/workspace')).toBe('complete');

      // Completion is published after the pump's .finally() removes the run.
      // Deferred recovery pulls must still be allowed to commit at that point.
      expect(captured?.isCurrent()).toBe(true);

      cleanup();
      expect(captured?.isCurrent()).toBe(false);
    } finally {
      unsubscribe();
      cleanup();
      manager.disposeAll();
    }
  });

  test('a newer same-directory run invalidates the previous context', async () => {
    const manager = new ChildStoreManager();
    const contexts: DirectoryBootstrapContext[] = [];
    const cleanup = manager.configure({
      onBootstrap: (context) => {
        contexts.push(context);
      },
    });
    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'current-directory' });
    await settle();
    expect(contexts[0]?.isCurrent()).toBe(true);

    // A forced rerun for the same directory must retire the previous
    // context: its in-flight deferred responses may no longer commit over
    // whatever the newer run synchronizes.
    manager.requestBootstrap({ directory: '/workspace', priority: 'selected', reason: 'server-connected', force: true });
    await settle();
    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.isCurrent()).toBe(false);
    expect(contexts[1]?.isCurrent()).toBe(true);

    cleanup();
    manager.disposeAll();
  });
});

describe('ChildStoreManager after an OpenCode stream restart', () => {
  const bootstrapped = (manager: ChildStoreManager, directory: string, patch: Partial<State> = {}) => {
    manager.ensureChild(directory, { bootstrap: false }).setState({ status: 'complete', ...patch });
  };

  // Before: every bootstrapped store re-read at once (six bootstraps here, each
  // about eight requests and a location start on v2).
  test('re-reads only stores in use or showing live state, the rest on their next demand', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    bootstrapped(manager, '/current');
    bootstrapped(manager, '/pinned-column');
    bootstrapped(manager, '/waiting', {
      permission: { ses_waiting: [{ id: 'per_1', sessionID: 'ses_waiting' } as PermissionRequest] },
    });
    bootstrapped(manager, '/busy', { session_status: { ses_busy: { type: 'busy' } } });
    bootstrapped(manager, '/idle-a', { session_status: { ses_idle: { type: 'idle' } } });
    bootstrapped(manager, '/idle-b');
    manager.ensureChild('/never-bootstrapped', { bootstrap: false });
    manager.setBootstrapDemand('column', [{ directory: '/pinned-column', priority: 'selected', reason: 'selected-session' }]);
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => { started.push(directory); },
    });
    expect(started).toEqual([]);

    const refreshing = manager.refreshAfterStreamRestart('/current');
    for (let index = 0; index < 20; index += 1) await settle();

    expect([...refreshing].sort()).toEqual(['/busy', '/current', '/pinned-column', '/waiting']);
    expect([...started].sort()).toEqual(['/busy', '/current', '/pinned-column', '/waiting']);
    // Foreground first; live-state stores drain behind them in the background.
    expect(started.slice(0, 2).sort()).toEqual(['/current', '/pinned-column']);

    // A deferred store re-reads as soon as something uses it, once.
    manager.setBootstrapDemand('sidebar', [{ directory: '/idle-a', priority: 'selected', reason: 'selected-session' }]);
    await settle();
    expect(started.filter((directory) => directory === '/idle-a')).toEqual(['/idle-a']);
    manager.setBootstrapDemand('sidebar', [
      { directory: '/idle-a', priority: 'selected', reason: 'selected-session' },
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
    ]);
    await settle();
    expect(started.filter((directory) => directory === '/idle-a' || directory === '/current')).toEqual(['/current', '/idle-a']);
    expect(started.includes('/idle-b')).toBe(false);
    expect(started.includes('/never-bootstrapped')).toBe(false);
    cleanup();
    manager.disposeAll();
  });

  test('a store idle before the gap re-reads when OpenCode lists one of its sessions active', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    const session = (id: string) => ({ id } as State['session'][number]);
    bootstrapped(manager, '/current');
    // Idle before the gap; its session asked a permission while events were lost.
    bootstrapped(manager, '/asked-during-gap', { session: [session('ses_asked')], session_status: { ses_asked: { type: 'idle' } } });
    bootstrapped(manager, '/still-idle', { session: [session('ses_quiet')] });
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => { started.push(directory); },
    });

    manager.refreshAfterStreamRestart('/current');
    await settle();
    expect(started).toEqual(['/current']);

    // Before: nothing re-read it until it was selected, so it showed idle
    // with no permission. The current store is not stale anymore and is skipped.
    const queued = manager.refreshStaleDirectoriesWithActiveSessions(new Set(['ses_asked', 'ses_elsewhere']));
    for (let index = 0; index < 5; index += 1) await settle();
    expect([...queued]).toEqual(['/asked-during-gap']);
    expect(started).toEqual(['/current', '/asked-during-gap']);

    // A store that re-read is no longer stale; a second answer queues nothing.
    expect([...manager.refreshStaleDirectoriesWithActiveSessions(new Set(['ses_asked']))]).toEqual([]);
    cleanup();
    manager.disposeAll();
  });

  test('bootstraps that failed while OpenCode started re-run on its first connection; complete ones do not', async () => {
    const manager = new ChildStoreManager();
    const started: string[] = [];
    let openCodeReady = false;
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: async ({ directory }) => {
        started.push(directory);
        if (!openCodeReady && directory !== '/complete') throw new Error('502 OpenCode is starting');
      },
    });
    manager.setBootstrapDemand('sidebar', [
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
      { directory: '/complete', priority: 'active-project', reason: 'known-project' },
    ]);
    manager.requestBootstrap({ directory: '/background', priority: 'background', reason: 'action-demand' });
    for (let index = 0; index < 10; index += 1) await settle();
    expect(manager.getBootstrapState('/current')).toBe('failed');
    expect(manager.getBootstrapState('/background')).toBe('failed');
    expect(manager.getBootstrapState('/complete')).toBe('complete');
    // A failed bootstrap stays failed: demand without force does not retry it.
    manager.setBootstrapDemand('sidebar', [
      { directory: '/current', priority: 'selected', reason: 'current-directory' },
      { directory: '/complete', priority: 'active-project', reason: 'known-project' },
    ]);
    await settle();
    expect(started.filter((directory) => directory === '/current')).toEqual(['/current']);

    openCodeReady = true;
    started.length = 0;
    const queued = manager.retryFailedBootstraps();
    for (let index = 0; index < 10; index += 1) await settle();
    expect([...queued]).toEqual(['/current']);
    expect(started).toEqual(['/current']);
    expect(manager.getBootstrapState('/current')).toBe('complete');

    // The background store re-reads when something uses it again.
    manager.setBootstrapDemand('column', [{ directory: '/background', priority: 'visible', reason: 'known-project' }]);
    for (let index = 0; index < 10; index += 1) await settle();
    expect(started).toEqual(['/current', '/background']);
    expect(manager.getBootstrapState('/background')).toBe('complete');
    cleanup();
    manager.disposeAll();
  });

  test('a bootstrap running across the restart reruns when its store is in use', async () => {
    const manager = new ChildStoreManager();
    const tasks: Array<ReturnType<typeof deferred>> = [];
    const started: string[] = [];
    const cleanup = manager.configure({
      bootstrapConcurrency: 2,
      onBootstrap: ({ directory }) => {
        started.push(directory);
        const task = deferred();
        tasks.push(task);
        return task.promise;
      },
    });
    manager.ensureChild('/current', { bootstrap: false }).setState({ status: 'partial' });
    manager.setBootstrapDemand('sidebar', [{ directory: '/current', priority: 'selected', reason: 'current-directory', force: true }]);
    expect(started).toEqual(['/current']);

    manager.refreshAfterStreamRestart('/current');
    tasks[0]?.resolve();
    await settle();
    await settle();
    expect(started).toEqual(['/current', '/current']);
    tasks[1]?.resolve();
    await settle();
    cleanup();
    manager.disposeAll();
  });
});

describe('ChildStoreManager persisted session seed', () => {
  const originalLocalStorage = globalThis.localStorage;
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
  const spaceDirectory = '/spaces/a1b2c3d4e5f6/app';
  const session = (directory: string): Session => ({
    id: `ses_${directory.length}`,
    projectID: 'project',
    directory,
    title: 'Cached',
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 1, updated: 2 },
  });
  const seedCache = (directory: string) => {
    persistSessions(directory, [session(directory)]);
    flushPendingSessionWrites();
    expect(readDirCache(directory).sessions?.length).toBe(1);
  };
  const cachedKeys = () => [...values.keys()].filter((key) => key.startsWith('oc.dir.'));

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  });
  afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalLocalStorage });
  });

  test('a new store seeds from the cache only where the owner allows it', () => {
    seedCache('/workspace');
    seedCache(spaceDirectory);
    const manager = new ChildStoreManager({ seedsSessions: (directory) => !directory.startsWith('/spaces/') });
    // Before `configure` as well: a consumer's store made during the first render is gated too.
    expect(manager.ensureChild('/workspace', { bootstrap: false }).getState().session.map((entry) => entry.id)).toEqual(['ses_10']);
    const space = manager.ensureChild(spaceDirectory, { bootstrap: false }).getState();
    expect(space.session).toEqual([]);
    expect(space.sessionListSource).toBe('empty');
    // The cache itself stays: the owner may know the space at the next start.
    expect(readDirCache(spaceDirectory).sessions?.length).toBe(1);
    manager.disposeAll();
  });

  test('forgetting a directory empties its store, drops its cache and disposes it once nothing holds it', () => {
    seedCache(spaceDirectory);
    const manager = new ChildStoreManager();
    const store = manager.ensureChild(spaceDirectory, { bootstrap: false });
    expect(store.getState().session.length).toBe(1);
    manager.pin(spaceDirectory);
    manager.forgetDirectory(spaceDirectory);
    // Held by a consumer: the store stays, listing nothing, and its cache is gone.
    expect(manager.getChild(spaceDirectory)).toBe(store);
    expect(store.getState().session).toEqual([]);
    expect(store.getState().sessionListSource).toBe('empty');
    expect(cachedKeys()).toEqual([]);
    manager.unpin(spaceDirectory);
    manager.forgetDirectory(spaceDirectory);
    expect(manager.getChild(spaceDirectory)).toBe(undefined);
    expect(cachedKeys()).toEqual([]);
    manager.disposeAll();
  });
});
>>>>>>> upstream/main
