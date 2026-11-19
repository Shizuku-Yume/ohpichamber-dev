import { create } from 'zustand';
import type { Session } from '@openchamber/agent-contract';
import { isSessionPinned } from '@/lib/sessionPins';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { countSyncPerformance } from './performance-diagnostics';

type SessionActivityPhase = 'active' | 'settled';
export type SessionOrderingMutation = { type: 'active' | 'settled' | 'remove'; sessionId: string };
type SessionOrderingState = { rankById: Map<string, number> };
export const EMPTY_SESSION_ORDER_RANKS: ReadonlyMap<string, number> = new Map();
const phaseById = new Map<string, SessionActivityPhase>();
const baselineRankById = new Map<string, { created?: number; updated?: number }>();
let lastRank = 0;
export const useSessionOrderingStore = create<SessionOrderingState>(() => ({ rankById: new Map() }));
useSessionOrderingStore.subscribe(() => countSyncPerformance('orderingPublications'));
const nextRank = (): number => { lastRank = Math.max(lastRank + 1, Date.now()); return lastRank; };
const promoteSessions = (sessionIds: Iterable<string>, shared = false): void => {
  const ids = [...sessionIds];
  if (ids.length === 0) return;
  useSessionOrderingStore.setState((state) => {
    const rankById = new Map(state.rankById);
    const rank = shared ? nextRank() : 0;
    for (const id of ids) rankById.set(id, shared ? rank : nextRank());
    return { rankById };
  });
};
<<<<<<< HEAD
export const promoteRestoredSessionOrdering = (sessionId: string): void => { if (sessionId) promoteSessions([sessionId]); };
export const observeSessionActivityEvent = (sessionId: string, phase: SessionActivityPhase): void => applySessionOrderingMutations([{ type: phase, sessionId }]);
export const applySessionOrderingMutations = (mutations: readonly SessionOrderingMutation[]): void => {
||||||| bc50ba56aa

/** Promote a confirmed restore without deriving or changing session activity. */
export const promoteRestoredSessionOrdering = (sessionId: string): void => {
  if (!sessionId) return;
  promoteSessions([sessionId]);
};

export const observeSessionActivityEvent = (
  sessionId: string,
  phase: SessionActivityPhase,
): void => {
  applySessionOrderingMutations([{ type: 'observe', sessionId, phase }]);
};

export const applySessionOrderingMutations = (
  mutations: readonly SessionOrderingMutation[],
): void => {
=======

export const promoteRestoredSessionOrdering = (sessionId: string): void => {
  if (!sessionId) return;
  promoteSessions([sessionId]);
};

export const observeSessionActivityEvent = (
  sessionId: string,
  phase: SessionActivityPhase,
): void => {
  applySessionOrderingMutations([{ type: 'observe', sessionId, phase }]);
};

export const applySessionOrderingMutations = (
  mutations: readonly SessionOrderingMutation[],
): void => {
>>>>>>> upstream/main
  if (mutations.length === 0) return;
  const current = useSessionOrderingStore.getState().rankById;
  let next: Map<string, number> | null = null;
  for (const mutation of mutations) {
    if (mutation.type === 'remove') {
      phaseById.delete(mutation.sessionId); baselineRankById.delete(mutation.sessionId);
      if ((next ?? current).has(mutation.sessionId)) { next ??= new Map(current); next.delete(mutation.sessionId); }
      continue;
    }
    const previous = phaseById.get(mutation.sessionId);
    phaseById.set(mutation.sessionId, mutation.type);
    if (previous === mutation.type || (previous === undefined && mutation.type === 'settled')) continue;
    next ??= new Map(current); next.set(mutation.sessionId, nextRank());
  }
  if (next) useSessionOrderingStore.setState({ rankById: next });
};
export const reconcileSessionActivitySnapshot = (activeSessionIds: Iterable<string>, knownSessionIds: Iterable<string>): void => {
  const active = new Set(activeSessionIds);
  const observed = new Set([...knownSessionIds, ...active]);
  const promoted: string[] = [];
  for (const id of observed) {
    const phase: SessionActivityPhase = active.has(id) ? 'active' : 'settled';
    const previous = phaseById.get(id); phaseById.set(id, phase);
    if (previous !== undefined && previous !== phase) promoted.push(id);
  }
<<<<<<< HEAD
||||||| bc50ba56aa

  // A snapshot cannot recover the order of missed transitions. Give the batch
  // one rank and let authoritative timestamps break ties deterministically.
=======

>>>>>>> upstream/main
  promoteSessions(promoted, true);
};
<<<<<<< HEAD
export const removeSessionOrdering = (sessionId: string): void => applySessionOrderingMutations([{ type: 'remove', sessionId }]);
export const resetSessionOrdering = (): void => { phaseById.clear(); baselineRankById.clear(); lastRank = 0; useSessionOrderingStore.setState({ rankById: new Map() }); };
const updatedAt = (session: Session): number => session.updatedAt;
const createdAt = (session: Session): number => session.createdAt;
const parentIdOf = (session: Session): string | null => session.parentSessionId ?? null;
const isPinned = (session: Session, pinnedSessionIds: Set<string>): boolean => session.metadata?.isPinned === true
  || isSessionPinned(pinnedSessionIds, resolveWorkspaceDirectory(session.workspaceId), session.sessionId);
||||||| bc50ba56aa

export const removeSessionOrdering = (sessionId: string): void => {
  applySessionOrderingMutations([{ type: 'remove', sessionId }]);
};

export const resetSessionOrdering = (): void => {
  phaseById.clear();
  baselineRankById.clear();
  lastRank = 0;
  useSessionOrderingStore.setState({ rankById: new Map() });
};

const finiteTime = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

/**
 * When the session last had a conversation. `time.idle` moves only when a turn
 * ends; `time.updated` also moves on title and metadata writes, which must not
 * lift a session nobody touched. Sessions migrated from 1.x have no `idle`
 * until their first 2.x turn, so they fall back to `updated`.
 */
export const getSessionActivityTime = (session: Session): number => (
  finiteTime(session.time?.idle) || finiteTime(session.time?.updated) || finiteTime(session.time?.created)
);

const createdAt = (session: Session): number => finiteTime(session.time?.created);

const parentIdOf = (session: Session): string | null => (
  (session as Session & { parentID?: string | null }).parentID ?? null
);

const sessionDirectory = (session: Session): string | null => {
  const record = session as Session & {
    directory?: string | null;
    project?: { worktree?: string | null } | null;
  };
  return record.directory ?? record.project?.worktree ?? null;
};

=======

export const removeSessionOrdering = (sessionId: string): void => {
  applySessionOrderingMutations([{ type: 'remove', sessionId }]);
};

export const resetSessionOrdering = (): void => {
  phaseById.clear();
  baselineRankById.clear();
  lastRank = 0;
  useSessionOrderingStore.setState({ rankById: new Map() });
};

const finiteTime = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

export const getSessionActivityTime = (session: Session): number => (
  finiteTime(session.time?.idle) || finiteTime(session.time?.updated) || finiteTime(session.time?.created)
);

const createdAt = (session: Session): number => finiteTime(session.time?.created);

const parentIdOf = (session: Session): string | null => (
  (session as Session & { parentID?: string | null }).parentID ?? null
);

const sessionDirectory = (session: Session): string | null => {
  const record = session as Session & {
    directory?: string | null;
    project?: { worktree?: string | null } | null;
  };
  return record.directory ?? record.project?.worktree ?? null;
};

>>>>>>> upstream/main
const baselineRank = (session: Session, pinned: boolean): number => {
  const existing = baselineRankById.get(session.sessionId);
  const key = pinned ? 'created' : 'updated';
  if (existing?.[key] !== undefined) return existing[key];
  const rank = pinned ? createdAt(session) : updatedAt(session);
  baselineRankById.set(session.sessionId, { ...existing, [key]: rank });
  return rank;
};
<<<<<<< HEAD
||||||| bc50ba56aa

/**
 * Raise cached baselines to the sessions' current authoritative timestamps.
 *
 * The frozen baseline keeps live metadata churn from reordering an open list,
 * but a client that slept through a session's whole active→settled cycle never
 * saw the transition that would have promoted its live rank — so its stale
 * baseline pins it in place forever. Call this when an authoritative session
 * SNAPSHOT arrives (global refresh); monotonic, so it can never demote.
 */
=======

>>>>>>> upstream/main
export const raiseSessionOrderingBaselines = (sessions: Iterable<Session>): void => {
  const current = useSessionOrderingStore.getState().rankById;
  let next: Map<string, number> | null = null;
  let baselineChanged = false;
  for (const session of sessions) {
<<<<<<< HEAD
    const fresh = updatedAt(session); const live = current.get(session.sessionId);
    if (live !== undefined) { if (fresh > live) { next ??= new Map(current); next.set(session.sessionId, fresh); } continue; }
    const existing = baselineRankById.get(session.sessionId);
||||||| bc50ba56aa
    const fresh = getSessionActivityTime(session);
    const liveRank = currentRanks.get(session.id);
    if (liveRank !== undefined) {
      // A live rank frozen BEFORE this newer authoritative stamp is stale —
      // the session was active again while this client wasn't watching (its
      // transition events never arrived, e.g. another device + sleep). Ranks
      // share the epoch-ms scale with `updated`, so raising is well-ordered.
      if (fresh > liveRank) {
        nextRanks = nextRanks ?? new Map(currentRanks);
        nextRanks.set(session.id, fresh);
      }
      continue;
    }
    const existing = baselineRankById.get(session.id);
=======
    const fresh = getSessionActivityTime(session);
    const liveRank = currentRanks.get(session.id);
    if (liveRank !== undefined) {
      if (fresh > liveRank) {
        nextRanks = nextRanks ?? new Map(currentRanks);
        nextRanks.set(session.id, fresh);
      }
      continue;
    }
    const existing = baselineRankById.get(session.id);
>>>>>>> upstream/main
    if (existing?.updated !== undefined && existing.updated >= fresh) continue;
<<<<<<< HEAD
    baselineRankById.set(session.sessionId, { ...existing, updated: fresh }); baselineChanged = true;
||||||| bc50ba56aa
    baselineRankById.set(session.id, { ...existing, updated: fresh });
    baselinesChanged = true;
  }

  if (nextRanks) {
    useSessionOrderingStore.setState({ rankById: nextRanks });
  } else if (baselinesChanged) {
    // Baselines live outside the store; nudge subscribers so open lists re-sort.
    useSessionOrderingStore.setState((state) => ({ rankById: new Map(state.rankById) }));
=======
    baselineRankById.set(session.id, { ...existing, updated: fresh });
    baselinesChanged = true;
  }

  if (nextRanks) {
    useSessionOrderingStore.setState({ rankById: nextRanks });
  } else if (baselinesChanged) {
    useSessionOrderingStore.setState((state) => ({ rankById: new Map(state.rankById) }));
>>>>>>> upstream/main
  }
  if (next) useSessionOrderingStore.setState({ rankById: next });
  else if (baselineChanged) useSessionOrderingStore.setState((state) => ({ rankById: new Map(state.rankById) }));
};
export const getSessionLifecycleOrderValue = (session: Session, rankById: ReadonlyMap<string, number>, pinned = false): number => rankById.get(session.sessionId) ?? baselineRank(session, pinned);
export const compareSessionsByLifecycleOrder = (left: Session, right: Session, pinnedSessionIds: Set<string>, rankById: ReadonlyMap<string, number>): number => {
  const leftPinned = isPinned(left, pinnedSessionIds);
  const rightPinned = isPinned(right, pinnedSessionIds);
  if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
  const leftFallback = baselineRank(left, leftPinned); const rightFallback = baselineRank(right, rightPinned);
  if (parentIdOf(left) === parentIdOf(right)) {
    const rankDelta = getSessionLifecycleOrderValue(right, rankById, rightPinned) - getSessionLifecycleOrderValue(left, rankById, leftPinned);
    if (rankDelta !== 0) return rankDelta;
  }
  const baselineDelta = rightFallback - leftFallback;
  if (baselineDelta !== 0) return baselineDelta;
  const createdDelta = baselineRank(right, true) - baselineRank(left, true);
  return createdDelta !== 0 ? createdDelta : left.sessionId.localeCompare(right.sessionId);
};
export const orderSessionsByLifecycleScopes = (sessions: Session[], pinnedSessionIds: Set<string>, rankById: ReadonlyMap<string, number>, hierarchy?: { rootIds: readonly string[]; childrenByParentId: ReadonlyMap<string, readonly string[]> }): Session[] => {
  countSyncPerformance('sidebarOrderBuilds');
  const ids = new Set(sessions.map((session) => session.sessionId));
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const roots: Session[] = []; const children = new Map<string, Session[]>(); const indexed = new Set<string>();
  if (hierarchy) {
    for (const id of hierarchy.rootIds) { const session = byId.get(id); if (session) { indexed.add(id); roots.push(session); } }
    for (const [parent, childIds] of hierarchy.childrenByParentId) {
      if (!ids.has(parent)) continue;
      const list = childIds.flatMap((id) => { const session = byId.get(id); if (!session) return []; indexed.add(id); return [session]; });
      if (list.length) children.set(parent, list);
    }
  }
  for (const session of sessions) {
    if (indexed.has(session.sessionId)) continue;
    const parent = parentIdOf(session);
    if (!parent || !ids.has(parent)) roots.push(session);
    else (children.get(parent) ?? (children.set(parent, []), children.get(parent)!)).push(session);
  }
  const metadata = new Map(sessions.map((session) => {
    const pinned = isPinned(session, pinnedSessionIds);
    const fallback = baselineRank(session, pinned);
    return [session.sessionId, { parent: parentIdOf(session), pinned, fallback, lifecycle: rankById.get(session.sessionId) ?? fallback, created: baselineRank(session, true) }] as const;
  }));
  countSyncPerformance('sidebarOrderMetadataEntries', metadata.size);
  const compare = (left: Session, right: Session): number => {
    const a = metadata.get(left.sessionId); const b = metadata.get(right.sessionId);
    if (!a || !b) return left.sessionId.localeCompare(right.sessionId);
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.parent === b.parent && a.lifecycle !== b.lifecycle) return b.lifecycle - a.lifecycle;
    if (a.fallback !== b.fallback) return b.fallback - a.fallback;
    if (a.created !== b.created) return b.created - a.created;
    return left.sessionId.localeCompare(right.sessionId);
  };
  roots.sort(compare); for (const list of children.values()) list.sort(compare);
  const ordered: Session[] = []; const visited = new Set<string>();
  const append = (session: Session): void => { if (visited.has(session.sessionId)) return; visited.add(session.sessionId); ordered.push(session); for (const child of children.get(session.sessionId) ?? []) append(child); };
  for (const root of roots) append(root);
  for (const session of sessions.filter((item) => !visited.has(item.sessionId)).sort(compare)) append(session);
  return ordered;
};
