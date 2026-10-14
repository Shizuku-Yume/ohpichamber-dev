import type { Session } from '@openchamber/agent-contract';

/**
 * Select newly discovered native child sessions. A listing can race an archive
 * mutation; a globally known archived child must not be reintroduced as active.
 */
export const selectNewChildSessions = (
  listed: readonly Session[],
  existingIds: ReadonlySet<string>,
  parentIds: ReadonlySet<string>,
  isKnownArchived: (sessionId: string) => boolean,
): Session[] => {
  const children: Session[] = [];
  for (const session of listed) {
    if (existingIds.has(session.sessionId) || session.archivedAt !== undefined) continue;
    const parentSessionId = session.parentSessionId;
    if (!parentSessionId || !parentIds.has(parentSessionId)) continue;
    if (isKnownArchived(session.sessionId)) continue;
    children.push(session);
  }
  return children;
};
