<<<<<<< HEAD
import { beforeEach, describe, expect, test } from 'bun:test';
import type { CanonicalEvent, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { applyGlobalSessionStatusEvent, applyGlobalSessionStatusEvents, applyGlobalSessionStatusSnapshot, hasActiveSubagent, replaceGlobalSessionStatusById, setSessionParentResolver, useGlobalSessionStatusStore } from './global-session-status';
import { resetSessionActivityTiming, useSessionActivityTimingStore } from './session-activity-timing';
import { resetSessionOrdering } from './session-ordering';
import { resetBackgroundShells } from './background-shells';
const event = (type: CanonicalEvent['type'], fields: Record<string, unknown>): CanonicalEvent => ({ sessionId: String(fields.sessionId ?? 'session_1'), epoch: 'epoch_1', sequence: '1', timestamp: 1, type, ...fields } as CanonicalEvent);
const status = (sessionId: string, runtimeStatus: SessionRuntimeStatus): CanonicalEvent => event('session.status', { sessionId, runtimeStatus, activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : 'run_1' });
beforeEach(() => { replaceGlobalSessionStatusById(new Map()); resetSessionOrdering(); resetSessionActivityTiming(); resetBackgroundShells(); setSessionParentResolver(() => undefined); });
describe('global canonical session status', () => {
  test('tracks runtime status strings and active membership', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    expect(useGlobalSessionStatusStore.getState().statusById.get('session_1')?.status).toBe('running');
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(true);
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('run terminal events settle timing and preserve failed outcome', () => {
    applyGlobalSessionStatusEvents('/repo', [event('run.started', { sessionId: 'session_1', runId: 'run_1', createdAt: 1 }), event('run.failed', { sessionId: 'session_1', runId: 'run_1', finishedAt: 2, error: 'failed' })]);
    expect(useSessionActivityTimingStore.getState().startedAt.has('session_1')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('failed');
  });
  test('authoritative snapshots reconcile one directory without clearing sibling status', () => {
    applyGlobalSessionStatusEvent('/repo', status('repo_session', 'running'));
    applyGlobalSessionStatusEvent('/other', status('other_session', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', {}, ['repo_session']);
    expect(useGlobalSessionStatusStore.getState().statusById.has('repo_session')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().statusById.has('other_session')).toBe(true);
  });
  test('nested active sessions keep the parent turn visible', () => {
    setSessionParentResolver((id) => id === 'child' ? 'root' : undefined);
    applyGlobalSessionStatusEvent('/repo', status('child', 'running'));
    expect(hasActiveSubagent('root', useGlobalSessionStatusStore.getState().activeSessionIds)).toBe(true);
  });
  test('scoped recovery preserves sibling timers and their active ancestor', () => {
    setSessionParentResolver((id) => id === 'other_child' ? 'root' : undefined);
    applyGlobalSessionStatusEvents('/repo', [status('root', 'running'), status('sibling', 'running')]);
    applyGlobalSessionStatusEvent('/other', status('other_child', 'running'));
    const siblingStart = useSessionActivityTimingStore.getState().startedAt.get('sibling');
    const rootStart = useSessionActivityTimingStore.getState().startedAt.get('root');
    applyGlobalSessionStatusSnapshot('/repo', { root: 'idle' }, ['root'], { root: null });
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('sibling')).toBe(true);
    expect(useSessionActivityTimingStore.getState().startedAt.get('sibling')).toBe(siblingStart);
    expect(useSessionActivityTimingStore.getState().startedAt.get('root')).toBe(rootStart);
    applyGlobalSessionStatusSnapshot('/other', {}, ['other_child']);
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('sibling')).toBe(true);
  });
  test('stale run terminals cannot clear a newer run or its timer', () => {
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'new_run', createdAt: 100 }));
    applyGlobalSessionStatusEvent('/repo', event('run.failed', { runId: 'old_run', finishedAt: 200, error: 'stale' }));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(true);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBeNull();
    expect(useSessionActivityTimingStore.getState().startedAt.get('session_1')).toBe(100);
    applyGlobalSessionStatusEvent('/repo', event('run.completed', { runId: 'new_run', finishedAt: 250 }));
    expect(useSessionActivityTimingStore.getState().settledMs.get('session_1')).toBe(150);
  });
  test('disconnect clears active status without reporting a completed run', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', { session_1: 'unavailable' }, ['session_1']);
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).not.toBe('completed');
    applyGlobalSessionStatusSnapshot('/repo', { session_1: 'running' }, ['session_1'], { session_1: 'run_2' });
    applyGlobalSessionStatusEvent('/repo', event('run.completed', { runId: 'run_2', finishedAt: Date.now() }));
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('idle following failure preserves outcome and a new run clears it', () => {
    applyGlobalSessionStatusEvents('/repo', [event('run.started', { runId: 'run_1', createdAt: 1 }), event('run.failed', { runId: 'run_1', finishedAt: 2, error: 'failed' }), status('session_1', 'idle')]);
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('failed');
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'run_2', createdAt: 3 }));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBeNull();
  });
  test('cancelled run publishes a terminal cancelled outcome', () => {
    applyGlobalSessionStatusEvent('/repo', event('run.started', { runId: 'run_cancelled', createdAt: 1 }));
    applyGlobalSessionStatusEvent('/repo', event('run.cancelled', { runId: 'run_cancelled', finishedAt: 2 }));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')?.outcome).toBe('cancelled');
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has('session_1')).toBe(false);
  });
  test('streaming-only and repeated live events preserve public references', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    const before = useGlobalSessionStatusStore.getState();
    applyGlobalSessionStatusEvent('/repo', event('part.delta', { partId: 'part_1', delta: 'x' }));
    expect(useGlobalSessionStatusStore.getState()).toBe(before);
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'running'));
    expect(useGlobalSessionStatusStore.getState()).toBe(before);
  });
  test('directory-wide empty success clears only its own statuses', () => {
    applyGlobalSessionStatusEvents('/repo', [status('one', 'running'), status('two', 'running')]);
    applyGlobalSessionStatusEvent('/other', status('other', 'running'));
    applyGlobalSessionStatusSnapshot('/repo', {});
    expect([...useGlobalSessionStatusStore.getState().activeSessionIds]).toEqual(['other']);
  });
  test('idle observations suppress host seed resurrection while preserving no-op idle', () => {
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    const observed = useGlobalSessionStatusStore.getState().observedById.get('session_1');
    expect(observed).toEqual({ directory: '/repo', outcome: null });
    const before = useGlobalSessionStatusStore.getState();
    applyGlobalSessionStatusEvent('/repo', status('session_1', 'idle'));
    expect(useGlobalSessionStatusStore.getState().observedById.get('session_1')).toEqual(observed);
    expect(useGlobalSessionStatusStore.getState().statusById).toBe(before.statusById);
  });
});
||||||| bc50ba56aa
import { beforeEach, describe, expect, test } from "bun:test"
import type { SyncEvent } from "@/lib/opencode/events"
import {
  applyGlobalSessionStatusEvent,
  applyGlobalSessionStatusEvents,
  applyGlobalSessionStatusSnapshot,
  getDirectoryOwnedSessionIds,
  hasActiveSubagent,
  setSessionParentResolver,
  useGlobalSessionStatusStore,
  replaceGlobalSessionStatusById,
  resolveSessionTurnActivity,
  subscribeSessionStatusTransitions,
} from "./global-session-status"
import { resetSessionOrdering, useSessionOrderingStore } from "./session-ordering"
import { resetSessionActivityTiming, useSessionActivityTimingStore } from "./session-activity-timing"
import { applyBackgroundShellEvents, resetBackgroundShells } from "./background-shells"
import { applyPrWatch, resetPrWatchesForRuntimeSwitch } from "./pr-watch"

beforeEach(() => {
  replaceGlobalSessionStatusById(new Map())
  resetSessionOrdering()
  resetSessionActivityTiming()
})

describe("global session status index", () => {
  const activeSessionIds = (): ReadonlySet<string> => useGlobalSessionStatusStore.getState().activeSessionIds

  test("transition listeners see intermediate activity before a single batch publication and unsubscribe", () => {
    const transitions: string[][] = []
    let publications = 0
    const unsubscribeStore = useGlobalSessionStatusStore.subscribe(() => { publications += 1 })
    const unsubscribe = subscribeSessionStatusTransitions((_id, active) => {
      transitions.push([...active])
    })
    try {
      applyGlobalSessionStatusEvents("/repo", [
        { type: "session.status", properties: { sessionID: "parent", status: { type: "busy" } } },
        { type: "session.status", properties: { sessionID: "child", status: { type: "busy" } } },
        { type: "session.idle", properties: { sessionID: "parent" } },
        { type: "session.idle", properties: { sessionID: "child" } },
      ])
      expect(transitions).toEqual([["parent"], ["parent", "child"], ["child"], []])
      expect(publications).toBe(1)
      unsubscribe()
      applyGlobalSessionStatusEvent("/repo", {
        type: "session.idle", properties: { sessionID: "parent" },
      })
      expect(transitions).toHaveLength(4)
    } finally {
      unsubscribe()
      unsubscribeStore()
    }
  })

  test("a parent directory snapshot cannot settle a worktree session merely contained in its list", () => {
    const sessions = ["/repo", "/tree"].map((directory) => ({
      id: directory, directory, projectID: "project", title: "Session", cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    }))
    applyGlobalSessionStatusSnapshot("/tree", { "/tree": { type: "busy" } })
    const ownedIds = getDirectoryOwnedSessionIds("/repo", sessions)
    expect(ownedIds).toEqual(["/repo"])
    applyGlobalSessionStatusSnapshot("/repo", {}, ownedIds)
    expect(activeSessionIds().has("/tree")).toBe(true)
  })

  test("preserves full retry status details from live events", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: {
        sessionID: "session-a",
        status: { type: "retry", attempt: 2, message: "waiting" },
      },
    } as SyncEvent)

    expect(useGlobalSessionStatusStore.getState().statusById.get("session-a")?.status).toEqual({
      type: "retry",
      attempt: 2,
      message: "waiting",
    })
  })

  test("keeps active membership stable across active status detail and directory updates", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const before = activeSessionIds()

    applyGlobalSessionStatusEvent("/other-repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "retry", attempt: 2, message: "waiting" } },
    } as SyncEvent)

    expect(activeSessionIds()).toBe(before)
  })

  test("replaces active membership only when a session becomes idle or active", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const active = activeSessionIds()

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.idle",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    const idle = activeSessionIds()
    expect(idle).not.toBe(active)
    expect(idle?.has("session-a")).toBe(false)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    expect(activeSessionIds()).not.toBe(idle)
    expect(activeSessionIds()?.has("session-a")).toBe(true)
  })

  test("removes deleted sessions from active membership", () => {
    // SAFETY: This fixture matches the SDK event shape consumed by the status event reducer.
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const active = activeSessionIds()

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.deleted",
      properties: { sessionID: "session-a" },
    } as SyncEvent)

    expect(activeSessionIds()).not.toBe(active)
    expect(activeSessionIds().has("session-a")).toBe(false)
    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("promotes on active and settled lifecycle edges only", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const busyRank = useSessionOrderingStore.getState().rankById.get("session-a")

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "retry", attempt: 1, message: "wait", next: 1 } },
    } as SyncEvent)
    expect(useSessionOrderingStore.getState().rankById.get("session-a")).toBe(busyRank)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.idle",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    const idleRank = useSessionOrderingStore.getState().rankById.get("session-a")
    expect(idleRank).toBeGreaterThan(busyRank ?? 0)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.error",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    expect(useSessionOrderingStore.getState().rankById.get("session-a")).toBe(idleRank)
  })

  test("authoritative snapshots clear absent active entries for their directory", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    expect(useGlobalSessionStatusStore.getState().statusById.get("session-a")?.status.type).toBe("busy")

    applyGlobalSessionStatusSnapshot("/repo", {}, ["session-a"])
    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("keeps active membership stable for snapshots with the same active IDs", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    const before = activeSessionIds()

    applyGlobalSessionStatusSnapshot("/repo", {
      "session-a": { type: "retry", attempt: 1, message: "wait", next: 1 },
    }, ["session-a"])

    expect(activeSessionIds()).toBe(before)
  })

  test("updates active membership when a snapshot adds and removes IDs", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    const before = activeSessionIds()

    applyGlobalSessionStatusSnapshot("/repo", {
      "session-a": { type: "busy" },
      "session-b": { type: "busy" },
    }, ["session-a", "session-b"])
    const added = activeSessionIds()
    expect(added).not.toBe(before)
    expect(added?.has("session-a")).toBe(true)
    expect(added?.has("session-b")).toBe(true)

    applyGlobalSessionStatusSnapshot("/repo", { "session-b": { type: "busy" } }, ["session-a", "session-b"])
    const removed = activeSessionIds()
    expect(removed).not.toBe(added)
    expect(removed?.has("session-a")).toBe(false)
    expect(removed?.has("session-b")).toBe(true)
  })

  test("clears active membership when a runtime reset replaces status state", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)

    replaceGlobalSessionStatusById(new Map())

    expect(activeSessionIds()?.size).toBe(0)
  })

  test("clears an explicitly idle known session when directory aliases differ", () => {
    applyGlobalSessionStatusSnapshot("/canonical/repo", { "session-a": { type: "busy" } }, ["session-a"])

    applyGlobalSessionStatusSnapshot("/alias/repo", { "session-a": { type: "idle" } }, ["session-a"])

    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("publishes status, ordering, and timing once for a large event batch", () => {
    let statusPublications = 0
    let orderingPublications = 0
    let timingPublications = 0
    const unsubscribeStatus = useGlobalSessionStatusStore.subscribe(() => { statusPublications += 1 })
    const unsubscribeOrdering = useSessionOrderingStore.subscribe(() => { orderingPublications += 1 })
    const unsubscribeTiming = useSessionActivityTimingStore.subscribe(() => { timingPublications += 1 })
    const events = Array.from({ length: 1_000 }, (_, index) => ({
      type: "session.status",
      properties: { sessionID: `session-${index}`, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
    } as SyncEvent))

    applyGlobalSessionStatusEvents("/repo", events)

    unsubscribeStatus()
    unsubscribeOrdering()
    unsubscribeTiming()
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.size).toBe(1_000)
    expect(statusPublications).toBe(1)
    expect(orderingPublications).toBe(1)
    expect(timingPublications).toBe(1)
  })

  test("keeps lifecycle event order inside a batch", () => {
    applyGlobalSessionStatusEvents("/repo", [
      {
        type: "session.status",
        properties: { sessionID: "session-a", status: { type: "busy" } },
      } as SyncEvent,
      {
        type: "session.deleted",
        properties: { sessionID: "session-a" },
      } as SyncEvent,
    ])

    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
    expect(useSessionActivityTimingStore.getState().startedAt.has("session-a")).toBe(false)
  })
})

describe("what a session row says keeps its turn open", () => {
  test("its own run first, then a running workflow over its agents' subagent state, then a command", () => {
    expect(resolveSessionTurnActivity("running", true, true)).toBe("running")
    // A workflow's agents are subagents; the row names the workflow instead.
    expect(resolveSessionTurnActivity("subagent", true, false)).toBe("workflow")
    // Between phases no agent is busy, and the workflow still runs.
    expect(resolveSessionTurnActivity(null, true, false)).toBe("workflow")
    expect(resolveSessionTurnActivity("subagent", false, true)).toBe("subagent")
    expect(resolveSessionTurnActivity(null, false, true)).toBe("shell")
    expect(resolveSessionTurnActivity(null, false, false)).toBeNull()
    // An agent waiting on its pull request reads as working, after anything that really runs.
    expect(resolveSessionTurnActivity(null, false, false, true)).toBe("pullRequest")
    expect(resolveSessionTurnActivity(null, false, true, true)).toBe("shell")
    expect(resolveSessionTurnActivity("running", false, false, true)).toBe("running")
    // An image the session waits on comes after a command and before a pull request.
    expect(resolveSessionTurnActivity(null, false, false, true, true)).toBe("image")
    expect(resolveSessionTurnActivity(null, false, true, false, true)).toBe("shell")
  })
})

describe("background subagent keeps its parent's turn open", () => {
  // Turns this client saw begin: the start rides on the event.
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => {
    setSessionParentResolver((sessionId) => (sessionId === "child" ? "parent" : undefined))
  })

  test("the parent's timer runs through the pause and settles when the subagent ends", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])

    const active = useGlobalSessionStatusStore.getState().activeSessionIds
    expect(active.has("parent")).toBe(false)
    expect(hasActiveSubagent("parent", active)).toBe(true)
    expect(timing().startedAt.has("parent")).toBe(true)
    expect(timing().settledMs.has("parent")).toBe(false)

    applyGlobalSessionStatusEvents("/repo", [idle("child")])
    expect(timing().startedAt.has("parent")).toBe(false)
    expect(timing().settledMs.has("parent")).toBe(true)
  })

  test("the parent's resumed run does not move the start of the turn it belongs to", () => {
    const hostBusy = (sessionID: string, at: number): SyncEvent => ({
      type: "session.status",
      properties: { sessionID, status: { type: "busy" }, turnStart: { at, source: "host" } },
    })
    applyGlobalSessionStatusEvents("/repo", [hostBusy("parent", Date.now() - 60_000), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    const start = timing().startedAt.get("parent")

    applyGlobalSessionStatusEvents("/repo", [hostBusy("parent", Date.now())])
    expect(timing().startedAt.get("parent")).toBe(start)
  })

  test("a caller can resolve nested lineage without changing the display resolver", () => {
    const parents = new Map([["grandchild", "nested-child"], ["nested-child", "nested-parent"]])
    const active = new Set(["grandchild"])
    expect(hasActiveSubagent("nested-parent", active, (id) => parents.get(id))).toBe(true)
    expect(hasActiveSubagent("nested-parent", active)).toBe(false)
    expect(hasActiveSubagent("parent", new Set(["child"]))).toBe(true)
  })

  test("a subagent ending while the parent runs again leaves the parent's timer alone", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    applyGlobalSessionStatusEvents("/repo", [idle("child"), busy("parent")])

    expect(timing().startedAt.has("parent")).toBe(true)
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    expect(timing().settledMs.has("parent")).toBe(true)
  })

  test("a status snapshot does not settle a parent whose subagent is running", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusSnapshot("/repo", { child: { type: "busy" } }, ["parent", "child"])
    expect(timing().startedAt.has("parent")).toBe(true)
  })
})

describe("a background command keeps its session's turn open", () => {
  // Turns this client saw begin: the start rides on the event.
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const started: SyncEvent = {
    type: "shell.started",
    properties: { shell: { id: "sh_1", sessionID: "session", command: "sleep 300", file: "/tmp/sh_1.out", startedAt: 1 } },
  }
  const ended: SyncEvent = { type: "shell.ended", properties: { shellID: "sh_1", end: { kind: "exited", status: "exited", exit: 0 }, endedAt: 2 } }
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => resetBackgroundShells())

  test("the timer runs through the pause and settles when the command ends", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])

    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has("session")).toBe(false)
    expect(timing().startedAt.has("session")).toBe(true)

    applyBackgroundShellEvents("/repo", [ended])
    expect(timing().startedAt.has("session")).toBe(false)
    expect(timing().settledMs.has("session")).toBe(true)
  })

  test("a command ending while the session runs again leaves the timer alone", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusEvents("/repo", [idle("session"), busy("session")])
    applyBackgroundShellEvents("/repo", [ended])
    expect(timing().startedAt.has("session")).toBe(true)
  })

  test("a status snapshot does not settle a session waiting on its command", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusSnapshot("/repo", {}, ["session"])
    expect(timing().startedAt.has("session")).toBe(true)
  })
})

describe("a pull request watch keeps its session's turn open", () => {
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const watch = {
    sessionID: "session", directory: "/repo", url: "https://example.test/pr/1", number: 1, title: "PR", status: "pending" as const, startedAt: 1,
  }
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => {
    resetBackgroundShells()
    resetPrWatchesForRuntimeSwitch()
  })

  test("the timer runs through the wait and settles when the user stops the watch", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatch(1, "session", watch)
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    expect(timing().startedAt.has("session")).toBe(true)

    applyPrWatch(2, "session", null)
    expect(timing().startedAt.has("session")).toBe(false)
    expect(timing().settledMs.has("session")).toBe(true)
  })

  test("a wake runs on inside the same turn", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatch(1, "session", watch)
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    const start = timing().startedAt.get("session")

    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatch(2, "session", null)
    expect(timing().startedAt.get("session")).toBe(start)
  })

  test("a watch ending leaves a session its command still holds", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatch(1, "session", watch)
    applyBackgroundShellEvents("/repo", [{
      type: "shell.started",
      properties: { shell: { id: "sh_1", sessionID: "session", command: "sleep 300", file: "/tmp/sh_1.out", startedAt: 1 } },
    }])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    applyPrWatch(2, "session", null)
    expect(timing().startedAt.has("session")).toBe(true)
  })

  test("a status snapshot does not settle a session waiting on its pull request", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatch(1, "session", watch)
    applyGlobalSessionStatusSnapshot("/repo", {}, ["session"])
    expect(timing().startedAt.has("session")).toBe(true)
  })
})
=======
import { beforeEach, describe, expect, test } from "bun:test"
import type { SyncEvent } from "@/lib/opencode/events"
import {
  applyGlobalSessionStatusEvent,
  applyGlobalSessionStatusEvents,
  applyGlobalSessionStatusSnapshot,
  getDirectoryOwnedSessionIds,
  hasActiveSubagent,
  setSessionParentResolver,
  useGlobalSessionStatusStore,
  replaceGlobalSessionStatusById,
  resolveSessionTurnActivity,
  subscribeSessionStatusTransitions,
} from "./global-session-status"
import { resetSessionOrdering, useSessionOrderingStore } from "./session-ordering"
import { resetSessionActivityTiming, useSessionActivityTimingStore } from "./session-activity-timing"
import { applyBackgroundShellEvents, resetBackgroundShells } from "./background-shells"
import { applyPrWatches, resetPrWatchesForRuntimeSwitch } from "./pr-watch"

beforeEach(() => {
  replaceGlobalSessionStatusById(new Map())
  resetSessionOrdering()
  resetSessionActivityTiming()
})

describe("global session status index", () => {
  const activeSessionIds = (): ReadonlySet<string> => useGlobalSessionStatusStore.getState().activeSessionIds

  test("transition listeners see intermediate activity before a single batch publication and unsubscribe", () => {
    const transitions: string[][] = []
    let publications = 0
    const unsubscribeStore = useGlobalSessionStatusStore.subscribe(() => { publications += 1 })
    const unsubscribe = subscribeSessionStatusTransitions((_id, active) => {
      transitions.push([...active])
    })
    try {
      applyGlobalSessionStatusEvents("/repo", [
        { type: "session.status", properties: { sessionID: "parent", status: { type: "busy" } } },
        { type: "session.status", properties: { sessionID: "child", status: { type: "busy" } } },
        { type: "session.idle", properties: { sessionID: "parent" } },
        { type: "session.idle", properties: { sessionID: "child" } },
      ])
      expect(transitions).toEqual([["parent"], ["parent", "child"], ["child"], []])
      expect(publications).toBe(1)
      unsubscribe()
      applyGlobalSessionStatusEvent("/repo", {
        type: "session.idle", properties: { sessionID: "parent" },
      })
      expect(transitions).toHaveLength(4)
    } finally {
      unsubscribe()
      unsubscribeStore()
    }
  })

  test("a parent directory snapshot cannot settle a worktree session merely contained in its list", () => {
    const sessions = ["/repo", "/tree"].map((directory) => ({
      id: directory, directory, projectID: "project", title: "Session", cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    }))
    applyGlobalSessionStatusSnapshot("/tree", { "/tree": { type: "busy" } })
    const ownedIds = getDirectoryOwnedSessionIds("/repo", sessions)
    expect(ownedIds).toEqual(["/repo"])
    applyGlobalSessionStatusSnapshot("/repo", {}, ownedIds)
    expect(activeSessionIds().has("/tree")).toBe(true)
  })

  test("preserves full retry status details from live events", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: {
        sessionID: "session-a",
        status: { type: "retry", attempt: 2, message: "waiting" },
      },
    } as SyncEvent)

    expect(useGlobalSessionStatusStore.getState().statusById.get("session-a")?.status).toEqual({
      type: "retry",
      attempt: 2,
      message: "waiting",
    })
  })

  test("keeps active membership stable across active status detail and directory updates", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const before = activeSessionIds()

    applyGlobalSessionStatusEvent("/other-repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "retry", attempt: 2, message: "waiting" } },
    } as SyncEvent)

    expect(activeSessionIds()).toBe(before)
  })

  test("replaces active membership only when a session becomes idle or active", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const active = activeSessionIds()

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.idle",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    const idle = activeSessionIds()
    expect(idle).not.toBe(active)
    expect(idle?.has("session-a")).toBe(false)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    expect(activeSessionIds()).not.toBe(idle)
    expect(activeSessionIds()?.has("session-a")).toBe(true)
  })

  test("removes deleted sessions from active membership", () => {
    // SAFETY: This fixture matches the SDK event shape consumed by the status event reducer.
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const active = activeSessionIds()

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.deleted",
      properties: { sessionID: "session-a" },
    } as SyncEvent)

    expect(activeSessionIds()).not.toBe(active)
    expect(activeSessionIds().has("session-a")).toBe(false)
    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("promotes on active and settled lifecycle edges only", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)
    const busyRank = useSessionOrderingStore.getState().rankById.get("session-a")

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "retry", attempt: 1, message: "wait", next: 1 } },
    } as SyncEvent)
    expect(useSessionOrderingStore.getState().rankById.get("session-a")).toBe(busyRank)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.idle",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    const idleRank = useSessionOrderingStore.getState().rankById.get("session-a")
    expect(idleRank).toBeGreaterThan(busyRank ?? 0)

    applyGlobalSessionStatusEvent("/repo", {
      type: "session.error",
      properties: { sessionID: "session-a" },
    } as SyncEvent)
    expect(useSessionOrderingStore.getState().rankById.get("session-a")).toBe(idleRank)
  })

  test("authoritative snapshots clear absent active entries for their directory", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    expect(useGlobalSessionStatusStore.getState().statusById.get("session-a")?.status.type).toBe("busy")

    applyGlobalSessionStatusSnapshot("/repo", {}, ["session-a"])
    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("keeps active membership stable for snapshots with the same active IDs", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    const before = activeSessionIds()

    applyGlobalSessionStatusSnapshot("/repo", {
      "session-a": { type: "retry", attempt: 1, message: "wait", next: 1 },
    }, ["session-a"])

    expect(activeSessionIds()).toBe(before)
  })

  test("updates active membership when a snapshot adds and removes IDs", () => {
    applyGlobalSessionStatusSnapshot("/repo", { "session-a": { type: "busy" } }, ["session-a"])
    const before = activeSessionIds()

    applyGlobalSessionStatusSnapshot("/repo", {
      "session-a": { type: "busy" },
      "session-b": { type: "busy" },
    }, ["session-a", "session-b"])
    const added = activeSessionIds()
    expect(added).not.toBe(before)
    expect(added?.has("session-a")).toBe(true)
    expect(added?.has("session-b")).toBe(true)

    applyGlobalSessionStatusSnapshot("/repo", { "session-b": { type: "busy" } }, ["session-a", "session-b"])
    const removed = activeSessionIds()
    expect(removed).not.toBe(added)
    expect(removed?.has("session-a")).toBe(false)
    expect(removed?.has("session-b")).toBe(true)
  })

  test("clears active membership when a runtime reset replaces status state", () => {
    applyGlobalSessionStatusEvent("/repo", {
      type: "session.status",
      properties: { sessionID: "session-a", status: { type: "busy" } },
    } as SyncEvent)

    replaceGlobalSessionStatusById(new Map())

    expect(activeSessionIds()?.size).toBe(0)
  })

  test("clears an explicitly idle known session when directory aliases differ", () => {
    applyGlobalSessionStatusSnapshot("/canonical/repo", { "session-a": { type: "busy" } }, ["session-a"])

    applyGlobalSessionStatusSnapshot("/alias/repo", { "session-a": { type: "idle" } }, ["session-a"])

    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
  })

  test("publishes status, ordering, and timing once for a large event batch", () => {
    let statusPublications = 0
    let orderingPublications = 0
    let timingPublications = 0
    const unsubscribeStatus = useGlobalSessionStatusStore.subscribe(() => { statusPublications += 1 })
    const unsubscribeOrdering = useSessionOrderingStore.subscribe(() => { orderingPublications += 1 })
    const unsubscribeTiming = useSessionActivityTimingStore.subscribe(() => { timingPublications += 1 })
    const events = Array.from({ length: 1_000 }, (_, index) => ({
      type: "session.status",
      properties: { sessionID: `session-${index}`, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
    } as SyncEvent))

    applyGlobalSessionStatusEvents("/repo", events)

    unsubscribeStatus()
    unsubscribeOrdering()
    unsubscribeTiming()
    expect(useGlobalSessionStatusStore.getState().activeSessionIds.size).toBe(1_000)
    expect(statusPublications).toBe(1)
    expect(orderingPublications).toBe(1)
    expect(timingPublications).toBe(1)
  })

  test("keeps lifecycle event order inside a batch", () => {
    applyGlobalSessionStatusEvents("/repo", [
      {
        type: "session.status",
        properties: { sessionID: "session-a", status: { type: "busy" } },
      } as SyncEvent,
      {
        type: "session.deleted",
        properties: { sessionID: "session-a" },
      } as SyncEvent,
    ])

    expect(useGlobalSessionStatusStore.getState().statusById.has("session-a")).toBe(false)
    expect(useSessionOrderingStore.getState().rankById.has("session-a")).toBe(false)
    expect(useSessionActivityTimingStore.getState().startedAt.has("session-a")).toBe(false)
  })
})

describe("what a session row says keeps its turn open", () => {
  test("its own run first, then a running workflow over its agents' subagent state, then a command", () => {
    expect(resolveSessionTurnActivity("running", true, true)).toBe("running")
    // A workflow's agents are subagents; the row names the workflow instead.
    expect(resolveSessionTurnActivity("subagent", true, false)).toBe("workflow")
    // Between phases no agent is busy, and the workflow still runs.
    expect(resolveSessionTurnActivity(null, true, false)).toBe("workflow")
    expect(resolveSessionTurnActivity("subagent", false, true)).toBe("subagent")
    expect(resolveSessionTurnActivity(null, false, true)).toBe("shell")
    expect(resolveSessionTurnActivity(null, false, false)).toBeNull()
    // An agent waiting on its pull request reads as working, after anything that really runs.
    expect(resolveSessionTurnActivity(null, false, false, true)).toBe("pullRequest")
    expect(resolveSessionTurnActivity(null, false, true, true)).toBe("shell")
    expect(resolveSessionTurnActivity("running", false, false, true)).toBe("running")
    // An image the session waits on comes after a command and before a pull request.
    expect(resolveSessionTurnActivity(null, false, false, true, true)).toBe("image")
    expect(resolveSessionTurnActivity(null, false, true, false, true)).toBe("shell")
    // So does one waiting on a timer or an extension, last of all.
    expect(resolveSessionTurnActivity(null, false, false, false, false, true)).toBe("extensionWait")
    expect(resolveSessionTurnActivity(null, false, false, true, false, true)).toBe("pullRequest")
    expect(resolveSessionTurnActivity("subagent", false, false, false, false, true)).toBe("subagent")
  })
})

describe("background subagent keeps its parent's turn open", () => {
  // Turns this client saw begin: the start rides on the event.
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => {
    setSessionParentResolver((sessionId) => (sessionId === "child" ? "parent" : undefined))
  })

  test("the parent's timer runs through the pause and settles when the subagent ends", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])

    const active = useGlobalSessionStatusStore.getState().activeSessionIds
    expect(active.has("parent")).toBe(false)
    expect(hasActiveSubagent("parent", active)).toBe(true)
    expect(timing().startedAt.has("parent")).toBe(true)
    expect(timing().settledMs.has("parent")).toBe(false)

    applyGlobalSessionStatusEvents("/repo", [idle("child")])
    expect(timing().startedAt.has("parent")).toBe(false)
    expect(timing().settledMs.has("parent")).toBe(true)
  })

  test("the parent's resumed run does not move the start of the turn it belongs to", () => {
    const hostBusy = (sessionID: string, at: number): SyncEvent => ({
      type: "session.status",
      properties: { sessionID, status: { type: "busy" }, turnStart: { at, source: "host" } },
    })
    applyGlobalSessionStatusEvents("/repo", [hostBusy("parent", Date.now() - 60_000), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    const start = timing().startedAt.get("parent")

    applyGlobalSessionStatusEvents("/repo", [hostBusy("parent", Date.now())])
    expect(timing().startedAt.get("parent")).toBe(start)
  })

  test("a caller can resolve nested lineage without changing the display resolver", () => {
    const parents = new Map([["grandchild", "nested-child"], ["nested-child", "nested-parent"]])
    const active = new Set(["grandchild"])
    expect(hasActiveSubagent("nested-parent", active, (id) => parents.get(id))).toBe(true)
    expect(hasActiveSubagent("nested-parent", active)).toBe(false)
    expect(hasActiveSubagent("parent", new Set(["child"]))).toBe(true)
  })

  test("a subagent ending while the parent runs again leaves the parent's timer alone", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    applyGlobalSessionStatusEvents("/repo", [idle("child"), busy("parent")])

    expect(timing().startedAt.has("parent")).toBe(true)
    applyGlobalSessionStatusEvents("/repo", [idle("parent")])
    expect(timing().settledMs.has("parent")).toBe(true)
  })

  test("a status snapshot does not settle a parent whose subagent is running", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("parent"), busy("child")])
    applyGlobalSessionStatusSnapshot("/repo", { child: { type: "busy" } }, ["parent", "child"])
    expect(timing().startedAt.has("parent")).toBe(true)
  })
})

describe("a background command keeps its session's turn open", () => {
  // Turns this client saw begin: the start rides on the event.
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const started: SyncEvent = {
    type: "shell.started",
    properties: { shell: { id: "sh_1", sessionID: "session", command: "sleep 300", file: "/tmp/sh_1.out", startedAt: 1 } },
  }
  const ended: SyncEvent = { type: "shell.ended", properties: { shellID: "sh_1", end: { kind: "exited", status: "exited", exit: 0 }, endedAt: 2 } }
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => resetBackgroundShells())

  test("the timer runs through the pause and settles when the command ends", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])

    expect(useGlobalSessionStatusStore.getState().activeSessionIds.has("session")).toBe(false)
    expect(timing().startedAt.has("session")).toBe(true)

    applyBackgroundShellEvents("/repo", [ended])
    expect(timing().startedAt.has("session")).toBe(false)
    expect(timing().settledMs.has("session")).toBe(true)
  })

  test("a command ending while the session runs again leaves the timer alone", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusEvents("/repo", [idle("session"), busy("session")])
    applyBackgroundShellEvents("/repo", [ended])
    expect(timing().startedAt.has("session")).toBe(true)
  })

  test("a status snapshot does not settle a session waiting on its command", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyBackgroundShellEvents("/repo", [started])
    applyGlobalSessionStatusSnapshot("/repo", {}, ["session"])
    expect(timing().startedAt.has("session")).toBe(true)
  })
})

describe("a pull request watch keeps its session's turn open", () => {
  const busy = (sessionID: string): SyncEvent => ({
    type: "session.status",
    properties: { sessionID, status: { type: "busy" }, turnStart: { at: Date.now(), source: "live" } },
  })
  const idle = (sessionID: string): SyncEvent => ({ type: "session.idle", properties: { sessionID } } as SyncEvent)
  const watch = {
    sessionID: "session", directory: "/repo", url: "https://example.test/pr/1", number: 1, title: "PR", status: "pending" as const, startedAt: 1,
  }
  const timing = () => useSessionActivityTimingStore.getState()

  beforeEach(() => {
    resetBackgroundShells()
    resetPrWatchesForRuntimeSwitch()
  })

  test("the timer runs through the wait and settles when the user stops the watch", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatches(1, "session", [watch])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    expect(timing().startedAt.has("session")).toBe(true)

    applyPrWatches(2, "session", [])
    expect(timing().startedAt.has("session")).toBe(false)
    expect(timing().settledMs.has("session")).toBe(true)
  })

  test("a wake runs on inside the same turn", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatches(1, "session", [watch])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    const start = timing().startedAt.get("session")

    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatches(2, "session", [])
    expect(timing().startedAt.get("session")).toBe(start)
  })

  test("a watch ending leaves a session its command still holds", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatches(1, "session", [watch])
    applyBackgroundShellEvents("/repo", [{
      type: "shell.started",
      properties: { shell: { id: "sh_1", sessionID: "session", command: "sleep 300", file: "/tmp/sh_1.out", startedAt: 1 } },
    }])
    applyGlobalSessionStatusEvents("/repo", [idle("session")])
    applyPrWatches(2, "session", [])
    expect(timing().startedAt.has("session")).toBe(true)
  })

  test("a status snapshot does not settle a session waiting on its pull request", () => {
    applyGlobalSessionStatusEvents("/repo", [busy("session")])
    applyPrWatches(1, "session", [watch])
    applyGlobalSessionStatusSnapshot("/repo", {}, ["session"])
    expect(timing().startedAt.has("session")).toBe(true)
  })
})
>>>>>>> upstream/main
