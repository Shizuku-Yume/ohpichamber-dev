import type { Session } from '@openchamber/agent-contract';
import type { SessionGroup } from '../types';

/**
 * The sessions "Archive all" takes from a project: every top-level session in
 * its groups, minus the ones the user still wants in front of them. Subagent
 * children go with their parent, and the archived bucket is already archived.
 */
export const selectArchiveAllSessionIds = (
  groups: readonly SessionGroup[],
  isKept: (session: Session) => boolean,
): string[] => {
  const ids = new Set<string>();
  for (const group of groups) {
    if (group.isArchivedBucket) continue;
    for (const node of group.sessions) {
      const { session } = node;
      if (session.archivedAt !== undefined) continue;
      if (isKept(session)) continue;
      ids.add(session.sessionId);
    }
  }
  return [...ids];
};
