import { memoizeSessionListProjection } from '@/stores/sessionListProjection';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { readMultiRunIdentity } from './runs';
import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useAllLiveSessions } from '@/sync/sync-context';
import { buildMultiRunIndex, readMultiRunIdentityWith, type MultiRunIndex, type MultiRunSummary } from './runs';

export type MultiRunSessions = {
  index: MultiRunIndex;
  sessionById: ReadonlyMap<string, Session>;
};

const resolveLegacyScope = (session: Session): string => (
  useSessionUIStore.getState().worktreeMetadata.get(session.sessionId)?.projectDirectory
    ?? resolveGlobalSessionDirectory(session)
    ?? session.workspaceId
);

export function useMultiRunSessions(): MultiRunSessions {
  const activeSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const liveSessions = useAllLiveSessions();
  return React.useMemo(() => {
    const sessionById = new Map<string, Session>();
    for (const session of activeSessions) sessionById.set(session.sessionId, session);
    for (const session of liveSessions) sessionById.set(session.sessionId, session);
    return { index: buildMultiRunIndex(sessionById.values(), resolveLegacyScope), sessionById };
  }, [activeSessions, liveSessions]);
}

const isActiveRoot = (session: Session): boolean => !session.archivedAt && !session.parentSessionId;

export function useMultiRunTitle(runKey: string | null): string | null {
  const selectTitle = React.useMemo(() => {
    const title = memoizeSessionListProjection((
      sessions: Session[],
      key: string,
      _worktrees: ReturnType<typeof useSessionUIStore.getState>['worktreeMetadata'],
    ) => {
      let found: string | null = null;
      let members = 0;
      for (const session of sessions) {
        if (!isActiveRoot(session)) continue;
        const identity = readMultiRunIdentityWith(session, resolveLegacyScope);
        if (identity?.key !== key) continue;
        members += 1;
        found = identity.title ?? found ?? identity.groupSlug;
      }
      return members >= 2 ? found : null;
    });
    return (state: ReturnType<typeof useGlobalSessionsStore.getState>): string | null => (
      runKey ? title(state.activeSessions, runKey, useSessionUIStore.getState().worktreeMetadata) : null
    );
  }, [runKey]);
  return useGlobalSessionsStore(selectTitle);
}

export function useMultiRunMemberIds(sessionId: string | null): readonly string[] {
  const selectJoined = React.useMemo(() => {
    const project = memoizeSessionListProjection((sessions: Session[], targetId: string) => {
      const own = sessions.find((session) => session.sessionId === targetId);
      const key = own && isActiveRoot(own) ? readMultiRunIdentity(own, resolveLegacyScope(own))?.key : undefined;
      if (!key) return '';
      const ids = sessions
        .filter((session) => isActiveRoot(session) && readMultiRunIdentity(session, resolveLegacyScope(session))?.key === key)
        .map((session) => session.sessionId);
      return ids.length >= 2 ? ids.join('\n') : '';
    });
    return (state: ReturnType<typeof useGlobalSessionsStore.getState>) => sessionId
      ? project(state.activeSessions, sessionId, useSessionUIStore.getState().worktreeMetadata)
      : '';
  }, [sessionId]);
  const joined = useGlobalSessionsStore(selectJoined);
  return React.useMemo(() => (joined ? joined.split('\n') : []), [joined]);
}

export type MultiRunLookup = { run: MultiRunSummary | null; sessionById: ReadonlyMap<string, Session> };

export function useMultiRun(runKey: string | null): MultiRunLookup {
  const { index, sessionById } = useMultiRunSessions();
  return { run: runKey ? index.runs.get(runKey) ?? null : null, sessionById };
}
