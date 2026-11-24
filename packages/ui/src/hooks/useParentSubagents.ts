import React from 'react';
import type { Subagent } from '@openchamber/agent-contract';
import { useSubagentsStore } from '@/stores/useSubagentsStore';

const EMPTY_SUBAGENTS: Subagent[] = [];

export const useParentSubagents = (sessionId: string | null): Subagent[] => {
  const liveSubagents = useSubagentsStore(
    React.useCallback((state) => (sessionId && state.byParent[sessionId] ? state.byParent[sessionId] : EMPTY_SUBAGENTS), [sessionId]),
  );

  React.useEffect(() => {
    if (!sessionId) return;
    void useSubagentsStore.getState().hydrateParent(sessionId);
  }, [sessionId]);

  return liveSubagents;
};
