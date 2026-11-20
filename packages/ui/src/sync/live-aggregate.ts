import type { Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import type { State } from './types';
import { countSyncPerformance } from './performance-diagnostics';

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
