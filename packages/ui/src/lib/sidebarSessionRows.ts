import type { Session } from '@openchamber/agent-contract';
import { isSessionInWork } from '@/lib/sessionWorkMetadata';

<<<<<<< HEAD
/**
 * Whether a top-level session has a row in the sidebar, by the rules that hold
 * in every sidebar layout: a /btw fork never does (`partitionSidebarSessions`),
 * a session the sidebar can place under a project, worktree, chat or space
 * does, and so does a pinned or in-work session, which the Pinned and In work
 * zones list whether or not its project still exists. Surfaces that list
 * sessions outside the sidebar (the desktop tray) use this, so the two agree.
 */
||||||| bc50ba56aa
/**
 * Whether a top-level session has a row in the sidebar: a /btw fork never does
 * (`partitionSidebarSessions`), a session the sidebar can place under a
 * project, worktree, chat or space does, and so does a pinned or in-work
 * session while its zone renders (`zones`, as `SessionProjectCollection`
 * gates them), since the Pinned and In work zones list it whether or not its
 * project still exists, provided its destination is admitted. Surfaces that list sessions outside the sidebar (the
 * desktop tray and dock badge) use this, so the two agree.
 */
=======
>>>>>>> upstream/main
export const sessionHasSidebarRow = (
  session: Session,
  { isPlaced, isPinned }: { isPlaced: boolean; isPinned: boolean },
): boolean => {
  if (session.parentSessionId || session.archivedAt) return false;
  return isPlaced || isPinned || isSessionInWork(session);
};
