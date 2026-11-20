import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { useSidebarSpaces } from '@/lib/spaces/spaces-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import type { ProjectEntry } from '@/lib/api/types';
import type { WorktreeMetadata } from '@/types/worktree';
import { createSessionOwnershipIndex } from '../sessions/sessionOwnership';
import { normalizePath } from '../utils';
import { partitionSidebarSessions } from './sessionCollection';
import { orderByProjectRank, rankByLatestActivity, sortProjectsByOrder } from './projectSort';

const NO_PROJECTS: ProjectEntry[] = [];
const NO_IDS: string[] = [];
const NO_SESSIONS: Session[] = [];
const NO_WORKTREES = new Map<string, WorktreeMetadata[]>();

export const useProjectsInSidebarOrder = <T extends { id: string }>(
  items: readonly T[],
  enabled = true,
): readonly T[] => {
  const projects = useProjectsStore((state) => (enabled ? state.projects : NO_PROJECTS));
  const manualOrder = useProjectsStore((state) => (enabled ? state.manualProjectOrder : NO_IDS));
  const order = useSessionDisplayStore((state) => (enabled ? state.projectSortOrder : 'manual'));
  const recent = enabled && order === 'recent';
  const sessions = useGlobalSessionsStore((state) => (recent ? state.activeSessions : NO_SESSIONS));
  const archivedSessions = useGlobalSessionsStore((state) => (recent ? state.archivedSessions : NO_SESSIONS));
  const worktrees = useSessionUIStore((state) => (recent ? state.availableWorktreesByProject : NO_WORKTREES));
  const spaces = useSidebarSpaces(recent);

  const orderKey = React.useMemo(() => {
    const sorted = sortProjectsByOrder(projects, order, manualOrder);
    const ranked = recent
      ? rankByLatestActivity(sorted, order, (project) => project.id, createSessionOwnershipIndex(
        partitionSidebarSessions(sessions, false).projectSessions,
        sorted.flatMap((project) => {
          const normalizedPath = normalizePath(project.path);
          return normalizedPath ? [{ id: project.id, normalizedPath }] : [];
        }),
        worktrees,
        archivedSessions,
        spaces,
      ).sessionsByProject)
      : sorted;
    return ranked.map((project) => project.id).join('\n');
  }, [archivedSessions, manualOrder, order, projects, recent, sessions, spaces, worktrees]);
  const rankById = React.useMemo(
    () => new Map(orderKey.split('\n').map((id, index) => [id, index])),
    [orderKey],
  );
  const ordered = React.useMemo(
    () => (enabled ? orderByProjectRank(items, rankById) : null),
    [enabled, items, rankById],
  );

  const shownRef = React.useRef<{ items: readonly T[]; ordered: readonly T[] } | null>(null);
  if (ordered) {
    shownRef.current = { items, ordered };
    return ordered;
  }
  return shownRef.current?.items === items ? shownRef.current.ordered : items;
};
