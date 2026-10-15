import type { Session } from '@openchamber/agent-contract';

import { normalizePath } from './mobilePaths';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

/** Field readers shared by the mobile sessions sheet and its timeline list.
    Kept out of the sheet so the timeline list can read the same session
    fields without importing the sheet (which imports the list). */

export const getParentId = (session: Session): string | null => session.parentSessionId ?? null;

export const getSessionDirectory = (session: Session): string => normalizePath(resolveGlobalSessionDirectory(session));

export const getSessionTimestamp = (session: Session): number => (
  Number.isFinite(session.updatedAt) && session.updatedAt > 0 ? session.updatedAt : session.createdAt
);

export const formatRelativeShort = (timestamp: number): string => {
  if (timestamp <= 0) return '';
  const diffMs = Date.now() - timestamp;
  if (diffMs < 60_000) return 'now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(timestamp));
};
