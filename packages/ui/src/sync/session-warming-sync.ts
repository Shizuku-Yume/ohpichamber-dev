import React from 'react';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useConfigStore } from '@/stores/useConfigStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionWarmingStore } from '@/stores/useSessionWarmingStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

/**
 * A synthetic `draft_*` id is not a session at all, and an id the Host has not
 * listed yet has nothing for the warming route to read: it answers 404
 * SESSION_NOT_FOUND. Only a listed, unarchived root is hydrated.
 */
export const isHydratableRootSession = (
  sessionId: string | null,
  session: Session | undefined,
): sessionId is string => {
  if (!sessionId || sessionId.startsWith('draft_')) return false;
  if (!session) return false;
  return session.archivedAt === undefined && session.parentSessionId === undefined;
};


/**
 * Keeps `useSessionWarmingStore` synchronized with the active root session,
 * Host reconnects, and authoritative session deletions.
 */
export function useSessionWarmingSync(): void {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  // The Host's listing is the permission the warming route needs: on a cold
  // load the selection arrives before discovery names the session, so the
  // hook must observe the entity appearing rather than sample it once.
  const hydratableSessionId = useGlobalSessionsStore(
    React.useCallback((state) => {
      const session = currentSessionId ? state.entityById.get(currentSessionId) : undefined;
      return isHydratableRootSession(currentSessionId, session) ? currentSessionId : null;
    }, [currentSessionId]),
  );
  const isConnected = useConfigStore((state) => state.isConnected);
  const wasConnectedRef = React.useRef(false);

  React.useEffect(() => {
    const reconnected = isConnected && !wasConnectedRef.current;
    wasConnectedRef.current = isConnected;
    if (!isConnected || !hydratableSessionId) return;
    void useSessionWarmingStore.getState().loadSessionWarming(hydratableSessionId, reconnected ? { force: true } : undefined);
  }, [hydratableSessionId, isConnected]);

  React.useEffect(() => {
    let baselineRuntimeKey = getRuntimeKey();
    let baselineEntities: ReadonlyMap<string, Session> | null = null;

    const reconcile = (): void => {
      const runtimeKey = getRuntimeKey();
      const state = useGlobalSessionsStore.getState();

      if (runtimeKey !== baselineRuntimeKey || !state.hasLoaded) {
        baselineRuntimeKey = runtimeKey;
        baselineEntities = null;
        return;
      }

      if (state.status !== 'ready' || state.globalRefreshFailed) {
        return;
      }

      if (baselineEntities === null) {
        baselineEntities = state.entityById;
        return;
      }

      if (state.entityById === baselineEntities) {
        return;
      }

      const deletedIds: string[] = [];
      for (const [sessionId, previousSession] of baselineEntities) {
        if (state.entityById.has(sessionId)) continue;
        if (
          state.discoveryErrors.has(previousSession.sessionId)
          || state.discoveryErrors.has(previousSession.workspaceId)
          || state.discoveryErrors.has(previousSession.projectId)
        ) {
          continue;
        }
        deletedIds.push(sessionId);
      }

      baselineEntities = state.entityById;
      if (deletedIds.length > 0) {
        useSessionWarmingStore.getState().removeSessions(deletedIds);
      }
    };

    reconcile();
    return useGlobalSessionsStore.subscribe(reconcile);
  }, []);
}
