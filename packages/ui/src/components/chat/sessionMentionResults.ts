import type { Session } from '@openchamber/agent-contract';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';

const isMentionable = (session: Session, currentSessionId: string | null): boolean => (
    !session.parentSessionId && session.sessionId !== currentSessionId && Boolean(session.title?.trim())
);

export const hasSessionMention = (
    sessions: readonly Session[],
    query: string,
    currentSessionId: string | null,
): boolean => (
    query.trim().length > 0
    && sessions.some((session) => isMentionable(session, currentSessionId) && matchesRankQuery([session.title], query))
);
