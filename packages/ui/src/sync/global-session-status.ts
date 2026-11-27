

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
import { useWorkflowActivityStore } from './workflow-activity';
import { usePrWatchStore } from './pr-watch';

type GlobalSessionStatusEntry = { status: SessionRuntimeStatus; directory: string };
type GlobalSessionStatusState = {
  observedById: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>;
  statusById: Map<string, GlobalSessionStatusEntry>;
  activeSessionIds: ReadonlySet<string>;
  /**
   * The active ids plus every ancestor of an active session, resolved once per
   * publication. Subagent-activity selectors are O(1) membership lookups
   * against this set instead of walking every active session's ancestry per
   * subscriber.
   */
  activeWithAncestors: ReadonlySet<string>;
};
const EMPTY_ACTIVE_SESSION_IDS: ReadonlySet<string> = new Set();
const initialState: GlobalSessionStatusState = { observedById: new Map(), statusById: new Map(), activeSessionIds: EMPTY_ACTIVE_SESSION_IDS, activeWithAncestors: EMPTY_ACTIVE_SESSION_IDS };
const activeRunIdBySession = new Map<string, string>();
export const useGlobalSessionStatusStore: UseBoundStore<StoreApi<GlobalSessionStatusState>> = create<GlobalSessionStatusState>(() => initialState);
useGlobalSessionStatusStore.subscribe(() => countSyncPerformance('globalStatusPublications'));

const isLiveStatus = (status: SessionRuntimeStatus): boolean => status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';
const sameSet = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => left.size === right.size && [...left].every((id) => right.has(id));
const sameStatusMap = (left: ReadonlyMap<string, GlobalSessionStatusEntry>, right: ReadonlyMap<string, GlobalSessionStatusEntry>): boolean => left.size === right.size && [...left].every(([id, entry]) => right.get(id)?.directory === entry.directory && right.get(id)?.status === entry.status);
const sameObservedMap = (left: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>, right: ReadonlyMap<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>): boolean => left.size === right.size && [...left].every(([id, entry]) => right.get(id)?.directory === entry.directory && right.get(id)?.outcome === entry.outcome);
const resolveAncestorClosure = (activeSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
  if (activeSessionIds.size === 0) return EMPTY_ACTIVE_SESSION_IDS;
  const closure = new Set<string>(activeSessionIds);
  for (const id of activeSessionIds) forEachAncestorId(id, (ancestorId) => { closure.add(ancestorId); });
  return closure;
};
const setState = (statusById: Map<string, GlobalSessionStatusEntry>, observedById: Map<string, { directory: string; outcome: 'completed' | 'failed' | 'cancelled' | null }>): void => {
  const active = new Set<string>();
  for (const [id, entry] of statusById) if (isLiveStatus(entry.status)) active.add(id);
  const current = useGlobalSessionStatusStore.getState();
  if (sameStatusMap(current.statusById, statusById) && sameObservedMap(current.observedById, observedById)) return;
  const activeSessionIds = sameSet(current.activeSessionIds, active) ? current.activeSessionIds : active;
  // The closure is resolved once per publication rather than once per
  // subscriber per publication. Parentage is read live from the resolver
  // here, so a publication always sees the currently known hierarchy —
  // the same resolution moment the per-subscriber scans used.
  useGlobalSessionStatusStore.setState({
    statusById,
    observedById,
    activeSessionIds,
    activeWithAncestors: resolveAncestorClosure(activeSessionIds),
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

type SessionStatusTransitionListener = (sessionId: string, activeSessionIds: ReadonlySet<string>) => void;
const transitionListeners = new Set<SessionStatusTransitionListener>();

export const subscribeSessionStatusTransitions = (listener: SessionStatusTransitionListener): (() => void) => {
  transitionListeners.add(listener);
  return () => { transitionListeners.delete(listener); };
};

type SessionParentResolver = (sessionId: string) => string | undefined;
let resolveSessionParentId: SessionParentResolver = () => undefined;

export const setSessionParentResolver = (resolver: SessionParentResolver): void => {
  resolveSessionParentId = resolver;
};

const MAX_SUBAGENT_DEPTH = 8;
const forEachAncestorId = (sessionId: string, visit: (ancestorId: string) => void): void => {
  let current = resolveSessionParentId(sessionId);
  for (let depth = 0; current && depth < MAX_SUBAGENT_DEPTH; depth += 1) { visit(current); current = resolveSessionParentId(current); }
};
/**
 * True when `sessionId` has at least one active descendant. Callers that can
 * read the store's published `activeWithAncestors` should prefer the O(1)
 * membership lookup `activeWithAncestors.has(id) && !activeSessionIds.has(id)`;
 * this standalone form resolves the closure per call for direct use.
 */
export const hasActiveSubagent = (sessionId: string, activeSessionIds: ReadonlySet<string>): boolean => {
  for (const activeId of activeSessionIds) {
    if (activeId === sessionId) continue;
    let found = false;
    forEachAncestorId(activeId, (ancestorId) => { if (ancestorId === sessionId) found = true; });
    if (found) return true;
  }
  return false;
};
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
export const useSessionTurnActivity = (sessionId: string): SessionTurnActivity | null => {
  const status = useGlobalSessionStatusStore((state): 'running' | 'subagent' | null => {
    if (state.activeSessionIds.has(sessionId)) return 'running';
    return state.activeWithAncestors.has(sessionId) ? 'subagent' : null;
  });
  const shell = useBackgroundShellsStore((state) => state.sessionIds.has(sessionId));
  return status ?? (shell ? 'shell' : null);
};
useBackgroundShellsStore.subscribe((state, previous) => {
  if (state.sessionIds === previous.sessionIds) return;
  const store = useGlobalSessionStatusStore.getState();
  const mutations: SessionActivityTimingMutation[] = [];
  for (const id of previous.sessionIds) if (!state.sessionIds.has(id) && !store.activeSessionIds.has(id) && !store.activeWithAncestors.has(id)) mutations.push({ type: 'settled', sessionId: id });
  applySessionActivityTimingMutations(mutations);
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
  const notifyTransition = (sessionId: string): void => {
    const active = activeFromStatuses(statuses);
    for (const listener of transitionListeners) listener(sessionId, active);
  };
  const activeBefore = activeFromStatuses(statuses);
  const settle = (sessionId: string, outcome: 'completed' | 'failed' | 'cancelled' | null = null, status: SessionRuntimeStatus = 'idle', at?: number, runId?: string): void => {
    recordObserved(observed, sessionId, directory, outcome);
    if (status === 'idle') statuses.delete(sessionId);
    else statuses.set(sessionId, { status, directory });
    activeRunIdBySession.delete(sessionId);
    ordering.push({ type: 'settled', sessionId });
    if (!hasBackgroundWork(sessionId, activeFromStatuses(statuses))) timing.push({ type: 'settled', sessionId, at, runId });
  };
  for (const event of payloads) {
    const transitioned = event.type === 'session.status' || event.type === 'session.updated'
      || event.type === 'run.started' || event.type === 'run.completed'
      || event.type === 'run.failed' || event.type === 'run.cancelled';
    switch (event.type) {
      case 'session.status': {
        const priorOutcome = observed.get(event.sessionId)?.outcome ?? null;
        recordObserved(observed, event.sessionId, directory, isLiveStatus(event.runtimeStatus) ? null : priorOutcome);
        applyStatus(directory, event.sessionId, event.runtimeStatus, event.activeRunId, statuses);
        if (isLiveStatus(event.runtimeStatus)) ordering.push({ type: 'active', sessionId: event.sessionId });
        if (isLiveStatus(event.runtimeStatus)) timing.push({ type: 'active', sessionId: event.sessionId, ...(event.activeRunId === null ? {} : { runId: event.activeRunId }) });
        else settle(event.sessionId, priorOutcome, event.runtimeStatus);
        break;
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
    }
    if (transitioned) notifyTransition(event.sessionId);
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
    sessionIds.find((id) => state.activeWithAncestors.has(id)) ?? null
  ));
  const inWorkflow = useWorkflowActivityStore((state) => sessionIds.find((id) => state.runningSessionIds.has(id)) ?? null);
  const onShell = useBackgroundShellsStore((state) => sessionIds.find((id) => state.sessionIds.has(id)) ?? null);
  const onPullRequest = usePrWatchStore((state) => sessionIds.find((id) => state.bySession.has(id)) ?? null);
  return inTurn ?? inWorkflow ?? onShell ?? onPullRequest;
};

