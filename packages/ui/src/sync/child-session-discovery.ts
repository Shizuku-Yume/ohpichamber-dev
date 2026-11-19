import type { Session } from '@openchamber/agent-contract';

<<<<<<< HEAD
/**
 * Select newly discovered native child sessions. A listing can race an archive
 * mutation; a globally known archived child must not be reintroduced as active.
 */
||||||| bc50ba56aa
/**
 * Pick the children a discovery listing adds to a directory store.
 *
 * The listing asks the server for active children only, but it is a plain
 * request with no ordering against local mutations: a response that left the
 * server before the user archived a parent still carries the children without
 * `time.archived`, and adding them back would show them as active orphans until
 * the next refresh. The global sessions cache learns about an archive before
 * the archive action resolves, so a child it already lists as archived is a
 * stale copy and is dropped here. Credit for spotting the race: #2580.
 */
=======
>>>>>>> upstream/main
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
