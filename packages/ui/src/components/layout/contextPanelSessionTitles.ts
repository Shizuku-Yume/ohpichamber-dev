
import type { Session } from '@openchamber/agent-contract';

/** What a directory child store holds for the tab titles: canonical sessions. */
type SessionSlice = { session: readonly Session[] };

export const EMPTY_SESSION_TITLE_MAP: ReadonlyMap<string, string> = new Map<string, string>();

export const areTitleMapsEqual = (a: ReadonlyMap<string, string>, b: ReadonlyMap<string, string>): boolean => {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
};

const getSessionUpdatedAt = (session: Session): number => (
  Number.isFinite(session.updatedAt) ? session.updatedAt : 0
);

export const buildSessionTitleMap = (states: Iterable<SessionSlice>, sessionIDs: readonly string[]): ReadonlyMap<string, string> => {
  if (sessionIDs.length === 0) return EMPTY_SESSION_TITLE_MAP;
  const wanted = new Set(sessionIDs);
  const updatedAtById = new Map<string, number>();
  const next = new Map<string, string>();
  for (const state of states) {
    for (const session of state.session) {
      if (!wanted.has(session.sessionId)) continue;
      const title = session.title?.trim();
      if (!title) continue;
      const updatedAt = getSessionUpdatedAt(session);
      const seenAt = updatedAtById.get(session.sessionId);
      if (seenAt !== undefined && seenAt > updatedAt) continue;
      updatedAtById.set(session.sessionId, updatedAt);
      next.set(session.sessionId, title);
    }
  }
  return next.size === 0 ? EMPTY_SESSION_TITLE_MAP : next;
};

export const getSessionIDFromDedupeKey = (dedupeKey: string | undefined): string | null => {
  if (!dedupeKey || !dedupeKey.startsWith('session:')) {
    return null;
  }

  const sessionID = dedupeKey.slice('session:'.length).trim();
  return sessionID || null;
};
