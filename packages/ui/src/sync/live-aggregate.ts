<<<<<<< HEAD
import type { Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import type { State } from './types';
import { countSyncPerformance } from './performance-diagnostics';
=======
import type { Session, SessionStatus } from '@/lib/opencode/model'
import type { State } from './types'
import { countSyncPerformance } from './performance-diagnostics'

type LiveStateSlice = Pick<State, 'session' | 'session_status'>

const getSessionUpdatedAt = (session: Session): number => {
  const updatedAt = session.time?.updated
  if (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) {
    return updatedAt
  }

  const createdAt = session.time?.created
  return typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0
}

// The fields a live-session consumer renders or orders by. Compared field by
// field rather than through a joined string: this runs over every live
// session each time any directory's session list changes, and an unchanged
// session is usually the same object, which is checked first.
const areSessionsEquivalent = (left: Session, right: Session): boolean => {
  if (left === right) return true
  return left.id === right.id
    && (left.title ?? '') === (right.title ?? '')
    && (left.time?.created ?? 0) === (right.time?.created ?? 0)
    && (left.time?.updated ?? 0) === (right.time?.updated ?? 0)
    && (left.time?.archived ?? 0) === (right.time?.archived ?? 0)
    && (left.directory ?? '') === (right.directory ?? '')
    && (left.parentID ?? '') === (right.parentID ?? '')
    && left.model?.id === right.model?.id
    && left.model?.providerID === right.model?.providerID
    // A metadata write leaves time.updated alone. By reference: a patch brings
    // a new object, and every other update carries the same one over.
    && left.metadata === right.metadata
}

const getStatusPriority = (status: SessionStatus | undefined): number => {
  switch (status?.type) {
    case 'retry':
      return 4
    case 'busy':
      return 3
    case 'idle':
      return 1
    default:
      return 0
  }
}

// Only the retry variant carries attempt/message/next, so equality compares
// those fields when both sides are retries and the discriminator otherwise.
const areStatusesEquivalent = (left: SessionStatus | undefined, right: SessionStatus | undefined): boolean => {
  if (left?.type !== right?.type) return false
  if (left?.type !== 'retry' || right?.type !== 'retry') return true
  return left.attempt === right.attempt && left.message === right.message && left.next === right.next
}

type StatusCandidate = {
  status: SessionStatus
  sessionUpdatedAt: number
}

const getStatusCandidate = (state: LiveStateSlice, sessionId: string): StatusCandidate | null => {
  const status = state.session_status?.[sessionId]
  if (!status) {
    return null
  }

  const session = state.session.find((candidate) => candidate.id === sessionId)
  return {
    status,
    sessionUpdatedAt: session ? getSessionUpdatedAt(session) : -1,
  }
}

const shouldReplaceStatusCandidate = (current: StatusCandidate | undefined, next: StatusCandidate): boolean => {
  if (!current) {
    return true
  }

  if (next.sessionUpdatedAt !== current.sessionUpdatedAt) {
    return next.sessionUpdatedAt > current.sessionUpdatedAt
  }

  return getStatusPriority(next.status) >= getStatusPriority(current.status)
}

export const areSessionListsEquivalent = (left: Session[], right: Session[]): boolean => {
  if (left === right) {
    return true
  }
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index += 1) {
    if (!areSessionsEquivalent(left[index], right[index])) {
      return false
    }
  }

  return true
}

export const areStatusMapsEquivalent = (
  left: Record<string, SessionStatus>,
  right: Record<string, SessionStatus>,
): boolean => {
  if (left === right) {
    return true
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }

  for (const key of leftKeys) {
    if (!(key in right)) {
      return false
    }
    const leftStatus = left[key]
    const rightStatus = right[key]
    if (!areStatusesEquivalent(leftStatus, rightStatus)) {
      return false
    }
  }

  return true
}
>>>>>>> bc50ba56a

type LiveStateSlice = Pick<State, 'session' | 'session_status'>;
const updatedAt = (session: Session): number => session.updatedAt;
// Session lists are rebuilt on every event, so an equal-but-new metadata object
// must compare equal. Metadata is a small revisioned blob, not history.
const metadataEquivalent = (left: Session['metadata'], right: Session['metadata']): boolean => left === right || JSON.stringify(left) === JSON.stringify(right);
const sessionsEquivalent = (left: Session, right: Session): boolean => left === right || (left.sessionId === right.sessionId && left.projectId === right.projectId && left.workspaceId === right.workspaceId && left.displayPath === right.displayPath && left.parentSessionId === right.parentSessionId && left.rootSessionId === right.rootSessionId && left.createdAt === right.createdAt && left.updatedAt === right.updatedAt && left.epoch === right.epoch && left.headSequence === right.headSequence && left.runtimeStatus === right.runtimeStatus && left.activeRunId === right.activeRunId && left.archivedAt === right.archivedAt && left.title === right.title && metadataEquivalent(left.metadata, right.metadata) && left.metadataRevision === right.metadataRevision && left.archiveRevision === right.archiveRevision);
const statusPriority = (status: SessionRuntimeStatus | undefined): number => {
  switch (status) { case 'awaiting_approval': case 'awaiting_input': return 4; case 'running': return 3; case 'idle': return 1; case 'unavailable': return 0; default: return -1; }
};
const statusesEquivalent = (left: SessionRuntimeStatus | undefined, right: SessionRuntimeStatus | undefined): boolean => left === right;
type StatusCandidate = { status: SessionRuntimeStatus; sessionUpdatedAt: number };
const candidate = (state: LiveStateSlice, sessionId: string): StatusCandidate | null => {
  const status = state.session_status[sessionId]; if (!status) return null;
  const session = state.session.find((item) => item.sessionId === sessionId);
  return { status, sessionUpdatedAt: session ? updatedAt(session) : -1 };
};
const shouldReplace = (current: StatusCandidate | undefined, next: StatusCandidate): boolean => !current || next.sessionUpdatedAt > current.sessionUpdatedAt || (next.sessionUpdatedAt === current.sessionUpdatedAt && statusPriority(next.status) >= statusPriority(current.status));
export const areSessionListsEquivalent = (left: Session[], right: Session[]): boolean => left === right || (left.length === right.length && left.every((session, index) => sessionsEquivalent(session, right[index])));
export const areStatusMapsEquivalent = (left: Record<string, SessionRuntimeStatus>, right: Record<string, SessionRuntimeStatus>): boolean => {
  if (left === right) return true;
  const keys = Object.keys(left); if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && statusesEquivalent(left[key], right[key]));
};
export function aggregateLiveSessions(states: Iterable<LiveStateSlice>): Session[] {
  const byId = new Map<string, Session>();
  for (const state of states) for (const session of state.session) {
    const current = byId.get(session.sessionId);
    if (!current || updatedAt(session) >= updatedAt(current)) byId.set(session.sessionId, session);
  }
  return [...byId.values()].sort((left, right) => updatedAt(right) - updatedAt(left));
}
export function aggregateLiveSessionStatuses(states: Iterable<LiveStateSlice>): Record<string, SessionRuntimeStatus> {
  const candidates = new Map<string, StatusCandidate>();
  for (const state of states) {
    const sessionTimes = new Map<string, number>();
    for (const session of state.session) { countSyncPerformance('statusAggregationSessionEntries'); sessionTimes.set(session.sessionId, updatedAt(session)); }
    for (const [sessionId, status] of Object.entries(state.session_status)) {
      countSyncPerformance('statusAggregationCandidates');
      const next = { status, sessionUpdatedAt: sessionTimes.get(sessionId) ?? -1 };
      if (shouldReplace(candidates.get(sessionId), next)) candidates.set(sessionId, next);
    }
  }
  const result: Record<string, SessionRuntimeStatus> = {};
  for (const [id, value] of candidates) result[id] = value.status;
  return result;
}
export function findLiveSession(states: Iterable<LiveStateSlice>, sessionId?: string | null): Session | undefined {
  if (!sessionId) return undefined;
  let match: Session | undefined;
  for (const state of states) for (const session of state.session) if (session.sessionId === sessionId && (!match || updatedAt(session) >= updatedAt(match))) match = session;
  return match;
}
export function findLiveSessionStatus(states: Iterable<LiveStateSlice>, sessionId?: string | null): SessionRuntimeStatus | undefined {
  if (!sessionId) return undefined;
  let match: StatusCandidate | undefined;
  for (const state of states) { const next = candidate(state, sessionId); if (next && shouldReplace(match, next)) match = next; }
  return match?.status;
}
