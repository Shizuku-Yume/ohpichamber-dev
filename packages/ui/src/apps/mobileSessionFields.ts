<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
||||||| bc50ba56aa
import type { Session } from '@/lib/opencode/model';
=======
import type { Session } from '@/lib/opencode/model';
import { getChatsRoot, isChatDirectoryPath } from '@/lib/chatDirectories';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { memoizeSessionListProjection } from '@/stores/sessionListProjection';
import type { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
>>>>>>> upstream/main

import { normalizePath } from './mobilePaths';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

<<<<<<< HEAD
/** Field readers shared by the mobile sessions sheet and its timeline list.
    Kept out of the sheet so the timeline list can read the same session
    fields without importing the sheet (which imports the list). */
||||||| bc50ba56aa
/** Session field readers shared by the phone's sessions drawer and its rows. */
=======
>>>>>>> upstream/main

<<<<<<< HEAD
export const getSessionDirectory = (session: Session): string => normalizePath(resolveGlobalSessionDirectory(session));
||||||| bc50ba56aa
export const getSessionDirectory = (session: Session): string => {
  const sessionWithDirectory = session as Session & {
    directory?: string | null;
    project?: { worktree?: string | null } | null;
  };
  return normalizePath(sessionWithDirectory.directory ?? sessionWithDirectory.project?.worktree ?? null);
};
=======
export const getSessionDirectory = (session: Session): string => {
  const sessionWithDirectory = session as Session & {
    directory?: string | null;
    project?: { worktree?: string | null } | null;
  };
  return normalizePath(sessionWithDirectory.directory ?? sessionWithDirectory.project?.worktree ?? null);
};

const hasChats = memoizeSessionListProjection((sessions: Session[], _root: string | null, _runtime: string) =>
  sessions.some((session) => isChatDirectoryPath(getSessionDirectory(session))));

export const selectHasChats = (state: ReturnType<typeof useGlobalSessionsStore.getState>): boolean =>
  hasChats(state.activeSessions, getChatsRoot(), getRuntimeKey());
>>>>>>> upstream/main
