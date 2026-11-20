import type { Session } from '@openchamber/agent-contract';
import type { SessionNode } from '../types';
import type { SidebarSessionLocation } from './sessionLocation';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

type SidebarActivityItem = {
  node: SessionNode;
  projectId: string | null;
  groupDirectory: string | null;
  secondaryMeta: { projectLabel?: string | null; branchLabel?: string | null; inSpace?: boolean } | null;
  getSecondaryMeta?: (sessionId: string) => SidebarActivityItem['secondaryMeta'];
};

export const deriveTimelineActivityItems = ({
  sessions,
  getSessionLocation,
  getSessionNode,
}: {
  sessions: readonly Session[];
  getSessionLocation: (sessionId: string) => SidebarSessionLocation | null;
  getSessionNode: (session: Session) => SessionNode;
}): SidebarActivityItem[] => sessions.map((session) => {
  const location = getSessionLocation(session.sessionId);
  return {
    node: getSessionNode(session),
    projectId: location?.projectId ?? null,
    groupDirectory: location?.groupDirectory ?? resolveGlobalSessionDirectory(session),
    secondaryMeta: {
      projectLabel: location?.projectLabel ?? null,
      branchLabel: location?.branchLabel ?? null,
      inSpace: location?.inSpace ?? false,
    },
  };
});
