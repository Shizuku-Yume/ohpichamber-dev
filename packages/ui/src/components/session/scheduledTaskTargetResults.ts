import type { Session } from '@openchamber/agent-contract';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { isReviewSession } from '@/lib/sessionReviewMetadata';

export const SCHEDULED_TASK_TARGET_LIMIT = 100;

export type ScheduledTaskTargetRow = {
  id: string;
  title: string;
  subagent: boolean;
  parentTitle: string | null;
};

type ScheduledTaskTargetResults = {
  selected: ScheduledTaskTargetRow | null;
  rows: ScheduledTaskTargetRow[];
  more: boolean;
};

export const scheduledTaskTargetCandidates = (
  cachedActive: readonly Session[],
  cachedArchived: readonly Session[],
  live: readonly Session[],
): Session[] => {
  const archivedIds = new Set(cachedArchived.map((session) => session.sessionId));
  const byId = new Map(cachedActive.map((session) => [session.sessionId, session]));
  for (const session of live) {
    if (!byId.has(session.sessionId) && !archivedIds.has(session.sessionId)) byId.set(session.sessionId, session);
  }
  return [...byId.values()].filter((session) => session.archivedAt === undefined && !archivedIds.has(session.sessionId));
};

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export const scheduledTaskTargetLoad = ({ eligibility, eligibilityCoversCache, cacheLoaded, cacheStatus, hasCandidates }: {
  eligibility: LoadStatus;
  eligibilityCoversCache: boolean;
  cacheLoaded: boolean;
  cacheStatus: LoadStatus;
  hasCandidates: boolean;
}): 'loading' | 'error' | 'ready' => {
  if (eligibility === 'error') return 'error';
  if (!cacheLoaded) return cacheStatus === 'error' ? 'error' : 'loading';
  if (eligibility === 'idle' && hasCandidates) return 'loading';
  if (eligibility === 'loading' || (eligibility === 'ready' && !eligibilityCoversCache)) return 'loading';
  return 'ready';
};

const isRoot = (session: Session): boolean => !session.parentSessionId || isReviewSession(session);

const titleOf = (session: Session): string => session.title?.trim() || session.sessionId;

const toRow = (session: Session, byId: ReadonlyMap<string, Session>): ScheduledTaskTargetRow => {
  if (isRoot(session)) return { id: session.sessionId, title: titleOf(session), subagent: false, parentTitle: null };
  const parent = session.parentSessionId ? byId.get(session.parentSessionId) : undefined;
  return { id: session.sessionId, title: titleOf(session), subagent: true, parentTitle: parent ? titleOf(parent) : null };
};

const findMatches = (sessions: readonly Session[], query: string) => {
  const trimmed = query.trim().toLowerCase();
  const byId = sessions.filter((session) => session.sessionId.toLowerCase() === trimmed);
  if (byId.length > 0) return { matches: byId, hiddenSubagents: false };
  const roots = sessions.filter(isRoot);
  if (!trimmed) return { matches: roots, hiddenSubagents: roots.length < sessions.length };
  const byTitle = (session: Session) => [titleOf(session)];
  const subagents = sessions.filter((session) => !isRoot(session));
  return {
    matches: [...rankByQuery(roots, query, byTitle, { fuzzy: false }), ...rankByQuery(subagents, query, byTitle, { fuzzy: false })],
    hiddenSubagents: false,
  };
};

export const scheduledTaskTargetResults = ({ eligible, known, query, selectedId, compare }: {
  eligible: readonly Session[];
  known: readonly Session[];
  query: string;
  selectedId: string;
  compare: (left: Session, right: Session) => number;
}): ScheduledTaskTargetResults => {
  const byId = new Map(known.map((session) => [session.sessionId, session]));
  const searching = query.trim().length > 0;
  const pinSelected = Boolean(selectedId) && !searching;
  const listed = eligible
    .filter((session) => !(pinSelected && session.sessionId === selectedId))
    .sort(compare);
  const { matches, hiddenSubagents } = findMatches(listed, query);
  const selectedSession = pinSelected ? byId.get(selectedId) : undefined;
  const pinnedRow = !pinSelected
    ? null
    : selectedSession ? toRow(selectedSession, byId) : { id: selectedId, title: selectedId, subagent: false, parentTitle: null };
  return {
    selected: pinnedRow,
    rows: matches.slice(0, SCHEDULED_TASK_TARGET_LIMIT).map((session) => toRow(session, byId)),
    more: hiddenSubagents || matches.length > SCHEDULED_TASK_TARGET_LIMIT,
  };
};
