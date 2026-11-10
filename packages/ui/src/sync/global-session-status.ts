import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { CanonicalEvent, RuntimeSession, Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import {
  applySessionOrderingMutations,
  reconcileSessionActivitySnapshot,
  type SessionOrderingMutation,
} from './session-ordering';
import {
  applySessionActivityEvents,
  applySessionActivityTimingMutations,
  reconcileSessionActivityTiming,
  type SessionActivityTimingMutation,
} from './session-activity-timing';
import { countSyncPerformance } from './performance-diagnostics';
import { hasRunningShell, useBackgroundShellsStore } from './background-shells';
import { hasRunningImage, useBackgroundImagesStore } from './background-images';
import { useWorkflowActivityStore } from './workflow-activity';
import { usePrWatchStore } from './pr-watch';

type GlobalSessionStatusEntry = { status: SessionRuntimeStatus; directory: string };
type GlobalSessionStatusState = {
  observedById: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>;
  statusById: Map<string, GlobalSessionStatusEntry>;
  activeSessionIds: ReadonlySet<string>;
};
const EMPTY_ACTIVE_SESSION_IDS: ReadonlySet<string> = new Set();
const initialState: GlobalSessionStatusState = { observedById: new Map(), statusById: new Map(), activeSessionIds: EMPTY_ACTIVE_SESSION_IDS };
const activeRunIdBySession = new Map<string, string>();
export const useGlobalSessionStatusStore: UseBoundStore<StoreApi<GlobalSessionStatusState>> = create<GlobalSessionStatusState>(() => initialState);
useGlobalSessionStatusStore.subscribe(() => countSyncPerformance('globalStatusPublications'));

<<<<<<< HEAD
const isLiveStatus = (status: SessionRuntimeStatus): boolean => status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
const sameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => left.size === right.size && [...left].every((id) => right.has(id));
const sameStatusMap = (left: ReadonlyMap<string, GlobalSessionStatusEntry>, right: ReadonlyMap<string, GlobalSessionStatusEntry>): boolean => left.size === right.size && [...left].every(([id, entry]) => right.get(id)?.directory === entry.directory && right.get(id)?.status === entry.status);
const sameObservedMap = (left: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>, right: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>): boolean => left.size === right.size && [...left].every(([id, entry]) => right.get(id)?.directory === entry.directory && right.get(id)?.outcome === entry.outcome);
const setState = (statusById: Map<string, GlobalSessionStatusEntry>, observedById: Map<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>): void => {
  const active = new Set<string>();
  for (const [id, entry] of statusById) if (isLiveStatus(entry.status)) active.add(id);
=======
type SessionStatusTransitionListener = (sessionId: string, activeSessionIds: ReadonlySet<string>) => void;
const transitionListeners = new Set<SessionStatusTransitionListener>();

/** Runs synchronously for each ordered status event, before the batch is published.
 * The active-ID draft is valid only during the callback; listeners must not retain it.
 */
export const subscribeSessionStatusTransitions = (listener: SessionStatusTransitionListener): (() => void) => {
  transitionListeners.add(listener);
  return () => { transitionListeners.delete(listener); };
};

/**
 * Replaces the status map wholesale and derives active membership from it.
 * This is the ONE sanctioned way to swap statusById from outside the event
 * reducers (runtime switch, tests) — previously a setState monkeypatch
 * derived membership for arbitrary callers, which silently trusted any
 * caller passing both fields to keep them consistent.
 */
export const replaceGlobalSessionStatusById = (statusById: Map<string, GlobalSessionStatusEntry>): void => {
>>>>>>> bc50ba56a
  const current = useGlobalSessionStatusStore.getState();
  if (sameStatusMap(current.statusById, statusById) && sameObservedMap(current.observedById, observedById)) return;
  useGlobalSessionStatusStore.setState({
    statusById,
    observedById,
    activeSessionIds: sameSet(current.activeSessionIds, active) ? current.activeSessionIds : active,
  });
};

export const removeGlobalSessionStatuses = (sessionIds: Iterable<string>): void => {
  const ids = new Set(sessionIds);
  if (ids.size === 0) return;
  const state = useGlobalSessionStatusStore.getState();
  const statuses = new Map(state.statusById);
  const observed = new Map(state.observedById);
  const ordering: SessionOrderingMutation[] = [];
  const timing: SessionActivityTimingMutation[] = [];
  for (const id of ids) {
    activeRunIdBySession.delete(id);
    statuses.delete(id);
    observed.delete(id);
    ordering.push({ type: 'remove', sessionId: id });
    timing.push({ type: 'remove', sessionId: id });
  }
  setState(statuses, observed);
  applySessionOrderingMutations(ordering);
  applySessionActivityTimingMutations(timing);
};
export const replaceGlobalSessionStatusById = (statusById: Map<string, GlobalSessionStatusEntry>): void => {
  activeRunIdBySession.clear();
  setState(statusById, new Map());
};

type SessionParentResolver = (sessionId: string) => string | undefined;
let resolveSessionParentId: SessionParentResolver = () => undefined;
export const setSessionParentResolver = (resolver: SessionParentResolver): void => { resolveSessionParentId = resolver; };
const MAX_SUBAGENT_DEPTH = 8;
const forEachAncestorId = (sessionId: string, visit: (ancestorId: string) => void): void => {
  let current = resolveSessionParentId(sessionId);
  for (let depth = 0; current && depth < MAX_SUBAGENT_DEPTH; depth += 1) { visit(current); current = resolveSessionParentId(current); }
};
export const hasActiveSubagent = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => {
  for (const activeId of activeSessionIds) {
    if (activeId === sessionId) continue;
    let found = false;
    forEachAncestorId(activeId, (ancestorId) => { if (ancestorId === sessionId) found = true; });
    if (found) return true;
  }
  return false;
};
<<<<<<< HEAD
export const collectOpenTurnSessionIds = (
  activeSessionIds: ReadonlySet<string>,
  waitingSessionIds: readonly Iterable<string>[],
): ReadonlySet<string> => {
  const open = new Set(activeSessionIds);
  for (const activeId of activeSessionIds) forEachAncestorId(activeId, (ancestorId) => open.add(ancestorId));
  for (const sessionIds of waitingSessionIds) {
    for (const sessionId of sessionIds) open.add(sessionId);
  }
  return open;
};
const withBackgroundWork = (activeSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
  let extended: Set<string> | null = null;
  const add = (id: string): void => { if (activeSessionIds.has(id)) return; extended ??= new Set(activeSessionIds); extended.add(id); };
  for (const id of activeSessionIds) forEachAncestorId(id, add);
  for (const id of useBackgroundShellsStore.getState().sessionIds) add(id);
  return extended ?? activeSessionIds;
};
const hasBackgroundWork = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => hasActiveSubagent(sessionId, activeSessionIds) || hasRunningShell(sessionId);
type SessionTurnActivity = 'running' | 'subagent' | 'shell';
=======

/**
 * Active sessions plus every session whose turn they keep open: ancestors of
 * running subagents, and sessions waiting on a background command, an image
 * or a pull request.
 */
const withBackgroundWork = (activeSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
  let extended: Set<string> | null = null;
  const add = (sessionId: string): void => {
    if (activeSessionIds.has(sessionId)) return;
    extended ??= new Set(activeSessionIds);
    extended.add(sessionId);
  };
  for (const activeId of activeSessionIds) forEachAncestorId(activeId, add);
  for (const sessionId of useBackgroundShellsStore.getState().sessionIds) add(sessionId);
  for (const sessionId of useBackgroundImagesStore.getState().sessionIds) add(sessionId);
  for (const sessionId of usePrWatchStore.getState().bySession.keys()) add(sessionId);
  return extended ?? activeSessionIds;
};

/** True when something the session waits on keeps its turn open and will hand it back. */
export const hasBackgroundWork = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => (
  hasActiveSubagent(sessionId, activeSessionIds)
  || hasRunningShell(sessionId)
  || hasRunningImage(sessionId)
  || usePrWatchStore.getState().bySession.has(sessionId)
);

/**
 * What keeps the session's turn open, or null when nothing does: the session
 * runs itself, or it idles while a workflow run it proposed runs, or while a
 * subagent below it runs, or while a command or an image it started in the
 * background runs, or while it waits on its pull request. The session's own run wins; a workflow comes next, because its agents
 * are subagents too and the run says what they are doing; then a subagent.
 * The workflow state is the run's own (the OpenChamber server's runs, kept by
 * its events, see `workflow-activity.ts`), so it holds between phases when no
 * agent happens to be busy.
 */
type SessionTurnActivity = 'running' | 'workflow' | 'subagent' | 'shell' | 'image' | 'pullRequest';

/**
 * The order above: the session's own run, a workflow, a subagent, a command,
 * an image, and last an agent waiting on its pull request (`pr-watch.ts`): the server
 * wakes it, as a background subagent's result does.
 */
export const resolveSessionTurnActivity = (
  status: 'running' | 'subagent' | null,
  workflowRunning: boolean,
  waitingOnShell: boolean,
  waitingOnPullRequest = false,
  waitingOnImage = false,
): SessionTurnActivity | null => {
  if (status === 'running') return status;
  if (workflowRunning) return 'workflow';
  if (status) return status;
  if (waitingOnShell) return 'shell';
  if (waitingOnImage) return 'image';
  return waitingOnPullRequest ? 'pullRequest' : null;
};

>>>>>>> bc50ba56a
export const useSessionTurnActivity = (sessionId: string): SessionTurnActivity | null => {
  const status = useGlobalSessionStatusStore((state): 'running' | 'subagent' | null => {
    if (state.activeSessionIds.has(sessionId)) return 'running';
    return hasActiveSubagent(sessionId, state.activeSessionIds) ? 'subagent' : null;
  });
<<<<<<< HEAD
  const shell = useBackgroundShellsStore((state) => state.sessionIds.has(sessionId));
  return status ?? (shell ? 'shell' : null);
};
useBackgroundShellsStore.subscribe((state, previous) => {
  if (state.sessionIds === previous.sessionIds) return;
  const active = useGlobalSessionStatusStore.getState().activeSessionIds;
  const mutations: SessionActivityTimingMutation[] = [];
  for (const id of previous.sessionIds) if (!state.sessionIds.has(id) && !active.has(id) && !hasActiveSubagent(id, active)) mutations.push({ type: 'settled', sessionId: id });
  applySessionActivityTimingMutations(mutations);
=======
  const workflowRunning = useWorkflowActivityStore((state) => state.runningSessionIds.has(sessionId));
  const waitingOnShell = useBackgroundShellsStore((state) => state.sessionIds.has(sessionId));
  const waitingOnImage = useBackgroundImagesStore((state) => state.sessionIds.has(sessionId));
  const waitingOnPullRequest = usePrWatchStore((state) => state.bySession.has(sessionId));
  return resolveSessionTurnActivity(status, workflowRunning, waitingOnShell, waitingOnPullRequest, waitingOnImage);
};

/** The first of the sessions `useSessionTurnActivity` reads as working, or null. */
export const useFirstSessionWithOpenTurn = (sessionIds: readonly string[]): string | null => {
  const inTurn = useGlobalSessionStatusStore((state) => (
    sessionIds.find((id) => state.activeSessionIds.has(id) || hasActiveSubagent(id, state.activeSessionIds)) ?? null
  ));
  const inWorkflow = useWorkflowActivityStore((state) => sessionIds.find((id) => state.runningSessionIds.has(id)) ?? null);
  const onShell = useBackgroundShellsStore((state) => sessionIds.find((id) => state.sessionIds.has(id)) ?? null);
  const onImage = useBackgroundImagesStore((state) => sessionIds.find((id) => state.sessionIds.has(id)) ?? null);
  const onPullRequest = usePrWatchStore((state) => sessionIds.find((id) => state.bySession.has(id)) ?? null);
  return inTurn ?? inWorkflow ?? onShell ?? onImage ?? onPullRequest;
};

/**
 * Every session `useSessionTurnActivity` reads as working, for a consumer that
 * asks about many at once: the running ones, their ancestors, and the sessions
 * waiting on work outside them (a workflow run, a command, a pull request).
 */
export const collectOpenTurnSessionIds = (
  activeSessionIds: ReadonlySet<string>,
  waitingSessionIds: readonly Iterable<string>[],
): ReadonlySet<string> => {
  const open = new Set(activeSessionIds);
  for (const activeId of activeSessionIds) forEachAncestorId(activeId, (ancestorId) => open.add(ancestorId));
  for (const sessionIds of waitingSessionIds) {
    for (const sessionId of sessionIds) open.add(sessionId);
  }
  return open;
};

// The last thing an idle session waited on ending closes its turn, the way the
// last subagent finishing does below. A wake reaches the session before its
// watch ends, so the session then runs on inside the same turn.
const settleSessionsWithoutBackgroundWork = (sessionIds: Iterable<string>, stillWaiting: (sessionId: string) => boolean): void => {
  const { activeSessionIds } = useGlobalSessionStatusStore.getState();
  const timingMutations: SessionActivityTimingMutation[] = [];
  for (const sessionId of sessionIds) {
    if (stillWaiting(sessionId)) continue;
    if (activeSessionIds.has(sessionId) || hasBackgroundWork(sessionId, activeSessionIds)) continue;
    timingMutations.push({ type: 'observe', sessionId, phase: 'settled' });
  }
  applySessionActivityTimingMutations(timingMutations);
};

useBackgroundShellsStore.subscribe((state, previous) => {
  if (state.sessionIds === previous.sessionIds) return;
  settleSessionsWithoutBackgroundWork(previous.sessionIds, (sessionId) => state.sessionIds.has(sessionId));
});

useBackgroundImagesStore.subscribe((state, previous) => {
  if (state.sessionIds === previous.sessionIds) return;
  settleSessionsWithoutBackgroundWork(previous.sessionIds, (sessionId) => state.sessionIds.has(sessionId));
});

usePrWatchStore.subscribe((state, previous) => {
  if (state.bySession === previous.bySession) return;
  settleSessionsWithoutBackgroundWork(previous.bySession.keys(), (sessionId) => state.bySession.has(sessionId));
>>>>>>> bc50ba56a
});

const normalizeDirectory = (directory: string): string => directory;
const recordSession = (session: RuntimeSession | Session | undefined, directory: string, statuses: Map<string, GlobalSessionStatusEntry>): void => {
  if (!session) return;
  if (session.runtimeStatus === 'idle') statuses.delete(session.sessionId);
  else statuses.set(session.sessionId, { status: session.runtimeStatus, directory });
  if (session.activeRunId === null) activeRunIdBySession.delete(session.sessionId);
  else activeRunIdBySession.set(session.sessionId, session.activeRunId);
};
const applyStatus = (directory: string, sessionId: string, status: SessionRuntimeStatus, activeRunId: string | null, statuses: Map<string, GlobalSessionStatusEntry>): void => {
  if (status === 'idle') statuses.delete(sessionId);
  else statuses.set(sessionId, { status, directory });
  if (activeRunId === null) activeRunIdBySession.delete(sessionId);
  else activeRunIdBySession.set(sessionId, activeRunId);
};
const activeFromStatuses = (statuses: ReadonlyMap<string, GlobalSessionStatusEntry>): Set<string> => {
  const active = new Set<string>();
  for (const [id, entry] of statuses) if (isLiveStatus(entry.status)) active.add(id);
  return active;
};
const recordObserved = (observed: Map<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>, sessionId: string, directory: string, outcome: 'completed' | 'failed' | 'cancelled' | null): void => {
  observed.delete(sessionId);
  observed.set(sessionId, { directory, outcome });
  if (observed.size > 2000) observed.delete(observed.keys().next().value!);
};

export const applyGlobalSessionStatusEvents = (rawDirectory: string, payloads: readonly CanonicalEvent[]): void => {
  if (payloads.length === 0) return;
  const hasStatusEvent = payloads.some((event) => event.type === 'session.status' || event.type === 'session.updated' || event.type === 'session.deleted' || event.type === 'run.started' || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled');
  const hasActivityEvent = payloads.some((event) => event.type === 'turn.started' || event.type === 'turn.completed');
  if (!hasStatusEvent) {
    if (hasActivityEvent) applySessionActivityEvents(rawDirectory, payloads);
    return;
  }
  const directory = normalizeDirectory(rawDirectory);
  const state = useGlobalSessionStatusStore.getState();
  const statuses = new Map(state.statusById);
  const observed = new Map(state.observedById);
  const ordering: SessionOrderingMutation[] = [];
  const timing: SessionActivityTimingMutation[] = [];
  const activeBefore = activeFromStatuses(statuses);
  const settle = (sessionId: string, outcome: 'completed' | 'failed' | 'cancelled' | null = null, status: SessionRuntimeStatus = 'idle', at?: number, runId?: string): void => {
    recordObserved(observed, sessionId, directory, outcome);
    if (status === 'idle') statuses.delete(sessionId);
    else statuses.set(sessionId, { status, directory });
    activeRunIdBySession.delete(sessionId);
    ordering.push({ type: 'settled', sessionId });
    if (!hasBackgroundWork(sessionId, activeFromStatuses(statuses))) timing.push({ type: 'settled', sessionId, at, runId });
  };
<<<<<<< HEAD
  for (const event of payloads) {
    switch (event.type) {
      case 'session.status': {
        const priorOutcome = observed.get(event.sessionId)?.outcome ?? null;
        recordObserved(observed, event.sessionId, directory, isLiveStatus(event.runtimeStatus) ? null : priorOutcome);
        applyStatus(directory, event.sessionId, event.runtimeStatus, event.activeRunId, statuses);
        if (isLiveStatus(event.runtimeStatus)) ordering.push({ type: 'active', sessionId: event.sessionId });
        if (isLiveStatus(event.runtimeStatus)) timing.push({ type: 'active', sessionId: event.sessionId, ...(event.activeRunId === null ? {} : { runId: event.activeRunId }) });
        else settle(event.sessionId, priorOutcome, event.runtimeStatus);
        break;
=======
  const orderingMutations: SessionOrderingMutation[] = [];
  const timingMutations: SessionActivityTimingMutation[] = [];
  const currentStatuses = (): ReadonlyMap<string, GlobalSessionStatusEntry> => statusById ?? state.statusById;
  const draftStatuses = (): Map<string, GlobalSessionStatusEntry> => (statusById ??= new Map(state.statusById));
  const draftActiveIds = (): Set<string> => (activeSessionIds ??= new Set(state.activeSessionIds));
  const currentActiveIds = (): ReadonlySet<string> => activeSessionIds ?? state.activeSessionIds;
  const notifyTransition = (sessionId: string): void => {
    for (const listener of transitionListeners) listener(sessionId, currentActiveIds());
  };
  const settledIds: string[] = [];
  const settle = (sessionId: string): void => {
    if (currentStatuses().has(sessionId)) {
      draftStatuses().delete(sessionId);
      draftActiveIds().delete(sessionId);
    }
    notifyTransition(sessionId);
    orderingMutations.push({ type: 'observe', sessionId, phase: 'settled' });
    settledIds.push(sessionId);
    // The turn timer keeps running through a background-subagent or background-command pause.
    if (!hasBackgroundWork(sessionId, currentActiveIds())) {
      timingMutations.push({ type: 'observe', sessionId, phase: 'settled' });
    } else {
      timingMutations.push({ type: 'hold', sessionId });
    }
  };

  for (const payload of payloads) {
    if (payload.type === 'session.status') {
      const { sessionID, status, turnStart } = payload.properties;
      if (!sessionID) continue;
      const type = normalizeStatusType(status.type);
      // A status event only records that the session is running again; the
      // outcome of the turn stays whatever the terminal event reported.
      observe(sessionID, type === 'idle' ? (observedById ?? state.observedById).get(sessionID)?.outcome ?? null : null);
      if (type === 'idle') {
        settle(sessionID);
        continue;
>>>>>>> bc50ba56a
      }
      case 'session.updated': {
        if (event.session && (event.session.sessionId !== event.sessionId || event.session.epoch !== event.epoch)) break;
        const priorOutcome = observed.get(event.sessionId)?.outcome ?? null;
        recordSession(event.session, directory, statuses);
        if (event.session && isLiveStatus(event.session.runtimeStatus)) {
          recordObserved(observed, event.sessionId, directory, null);
          ordering.push({ type: 'active', sessionId: event.sessionId });
          timing.push({ type: 'active', sessionId: event.sessionId, ...(event.session.activeRunId === null ? {} : { runId: event.session.activeRunId }) });
        } else if (event.session) settle(event.sessionId, priorOutcome, event.session.runtimeStatus);
        break;
      }
<<<<<<< HEAD
      case 'run.started':
        applyStatus(directory, event.sessionId, 'running', event.runId, statuses);
        recordObserved(observed, event.sessionId, directory, null);
        ordering.push({ type: 'active', sessionId: event.sessionId });
        timing.push({ type: 'active', sessionId: event.sessionId, at: event.createdAt, runId: event.runId });
        break;
      case 'run.completed':
        if (activeRunIdBySession.get(event.sessionId) !== event.runId) break;
        settle(event.sessionId, 'completed', 'idle', event.finishedAt, event.runId);
        break;
      case 'run.failed':
        if (activeRunIdBySession.get(event.sessionId) !== event.runId) break;
        settle(event.sessionId, 'failed', 'idle', event.finishedAt, event.runId);
        break;
      case 'run.cancelled':
        if (activeRunIdBySession.get(event.sessionId) !== event.runId) break;
        settle(event.sessionId, 'cancelled', 'idle', event.finishedAt, event.runId);
        break;
      case 'turn.started':
        timing.push({ type: 'active', sessionId: event.sessionId, runId: event.runId });
        break;
      case 'session.deleted':
        for (const id of event.deletedSessionIds) {
          activeRunIdBySession.delete(id);
          statuses.delete(id); observed.delete(id); ordering.push({ type: 'remove', sessionId: id }); timing.push({ type: 'remove', sessionId: id });
        }
        break;
      default:
        break;
=======
      notifyTransition(sessionID);
      orderingMutations.push({ type: 'observe', sessionId: sessionID, phase: 'active' });
      timingMutations.push({ type: 'observe', sessionId: sessionID, phase: 'active', turnStart });
      continue;
    }

    if (payload.type === 'session.idle' || payload.type === 'session.error') {
      const { sessionID } = payload.properties;
      if (sessionID) {
        observe(sessionID, payload.type === 'session.error' ? 'failed' : 'completed');
        settle(sessionID);
      }
      continue;
    }

    if (payload.type === 'session.deleted') {
      const { sessionID } = payload.properties;
      if (!sessionID) continue;
      if ((observedById ?? state.observedById).has(sessionID)) {
        observedById ??= new Map(state.observedById);
        observedById.delete(sessionID);
      }
      if (currentStatuses().has(sessionID)) {
        draftStatuses().delete(sessionID);
        draftActiveIds().delete(sessionID);
      }
      orderingMutations.push({ type: 'remove', sessionId: sessionID });
      timingMutations.push({ type: 'remove', sessionId: sessionID });
>>>>>>> bc50ba56a
    }
  }
  const finalActive = activeFromStatuses(statuses);
  for (const id of activeBefore) if (!finalActive.has(id) && !hasBackgroundWork(id, finalActive)) timing.push({ type: 'settled', sessionId: id });
  for (const id of activeBefore) if (!finalActive.has(id)) forEachAncestorId(id, (ancestorId) => {
    if (!finalActive.has(ancestorId) && !hasBackgroundWork(ancestorId, finalActive)) timing.push({ type: 'settled', sessionId: ancestorId });
  });
  setState(statuses, observed);
  applySessionOrderingMutations(ordering);
  applySessionActivityTimingMutations(timing);
};
export const applyGlobalSessionStatusEvent = (directory: string, payload: CanonicalEvent): void => applyGlobalSessionStatusEvents(directory, [payload]);

export const applyGlobalSessionStatusSnapshot = (
  rawDirectory: string,
  raw: Record<string, SessionRuntimeStatus>,
  knownSessionIds?: Iterable<string>,
  activeRunIds?: Readonly<Record<string, string | null>>,
): void => {
  const directory = normalizeDirectory(rawDirectory);
  const hasKnownScope = knownSessionIds !== undefined;
  const known = new Set(knownSessionIds ?? []);
  const state = useGlobalSessionStatusStore.getState();
  const covered = new Set(known);
  if (!hasKnownScope) for (const [id, entry] of state.statusById) if (entry.directory === directory) covered.add(id);
  for (const id of Object.keys(raw)) covered.add(id);
  const statuses = new Map(state.statusById);
  const observed = new Map(state.observedById);
  for (const id of covered) {
    if (!Object.hasOwn(raw, id)) statuses.delete(id);
    if (activeRunIds && Object.prototype.hasOwnProperty.call(activeRunIds, id)) {
      const runId = activeRunIds[id];
      if (typeof runId === 'string') activeRunIdBySession.set(id, runId); else activeRunIdBySession.delete(id);
    } else if (!Object.hasOwn(raw, id) || !isLiveStatus(raw[id]!)) activeRunIdBySession.delete(id);
  }
  for (const [id, status] of Object.entries(raw)) {
    const previous = observed.get(id)?.outcome ?? null;
    if (status === 'idle') recordObserved(observed, id, directory, previous);
    else if (isLiveStatus(status)) recordObserved(observed, id, directory, null);
    if (status === 'idle') statuses.delete(id);
    else statuses.set(id, { status, directory });
  }
  const active = activeFromStatuses(statuses);
  reconcileSessionActivitySnapshot(active, covered);
  const timingScope = new Set(covered);
  for (const id of covered) forEachAncestorId(id, (ancestorId) => timingScope.add(ancestorId));
  reconcileSessionActivityTiming(withBackgroundWork(active), (id) => timingScope.has(id));
  setState(statuses, observed);
};

/** The first of the sessions `useSessionTurnActivity` reads as working, or null. */
export const useFirstSessionWithOpenTurn = (sessionIds: readonly string[]): string | null => {
  const inTurn = useGlobalSessionStatusStore((state) => (
    sessionIds.find((id) => state.activeSessionIds.has(id) || hasActiveSubagent(id, state.activeSessionIds)) ?? null
  ));
  const inWorkflow = useWorkflowActivityStore((state) => sessionIds.find((id) => state.runningSessionIds.has(id)) ?? null);
  const onShell = useBackgroundShellsStore((state) => sessionIds.find((id) => state.sessionIds.has(id)) ?? null);
  const onPullRequest = usePrWatchStore((state) => sessionIds.find((id) => state.bySession.has(id)) ?? null);
  return inTurn ?? inWorkflow ?? onShell ?? onPullRequest;
};

