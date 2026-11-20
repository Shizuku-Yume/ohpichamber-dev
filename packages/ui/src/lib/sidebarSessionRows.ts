import type { Session } from '@openchamber/agent-contract';
import { isSessionInWork } from '@/lib/sessionWorkMetadata';

export const sessionHasSidebarRow = (
  session: Session,
  { isPlaced, isPinned }: { isPlaced: boolean; isPinned: boolean },
): boolean => {
  if (session.parentSessionId || session.archivedAt) return false;
  return isPlaced || isPinned || isSessionInWork(session);
};
