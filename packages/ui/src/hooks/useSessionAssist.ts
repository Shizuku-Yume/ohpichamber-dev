import React from 'react';
import { useDirectorySync, useSession, useSessionStatus } from '@/sync/sync-context';
import { getCurrentSessionAssist, type SessionAssistPayload } from '@/lib/sessionAssistMetadata';
import { selectBoundRunId, sessionActivityPhase } from '@/hooks/useSessionActivity';
import { useUIStore } from '@/stores/useUIStore';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { SessionRecapListResponseSchema } from '@openchamber/agent-contract';
import { useSessionRecapStore } from '@/stores/useSessionRecapStore';
import { useSessionSuggestionStore } from '@/stores/useSessionSuggestionStore';

export interface SessionAssistState {
  assist: SessionAssistPayload | null;
  visibleRecap: string | null;
  suggestion: string | null;
  sessionKnown: boolean;
}

/**
 * The newest native recap for a session, read from the journal OMP's
 * `IdleMaintenance` writes to (`history.db` → `session_recaps`) through the
 * canonical route. This is the fallback for recaps published before this
 * client connected; a live `session.recap` event supersedes it.
 */
function useNativeRecap(sessionId: string, enabled: boolean): string | null {
  const [recap, setRecap] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled || !sessionId || sessionId.startsWith('draft_')) {
      setRecap(null);
      return undefined;
    }
    const controller = new AbortController();
    void runtimeFetch(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/recaps`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const parsed = SessionRecapListResponseSchema.safeParse(await response.json().catch(() => null));
        return parsed.success ? parsed.data.recaps[0]?.recap ?? null : null;
      })
      .then((next) => {
        if (!controller.signal.aborted) setRecap(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecap(null);
      });
    return () => controller.abort();
  }, [enabled, sessionId]);

  return recap;
}

export function useSessionAssistState(sessionId: string, directory?: string): SessionAssistState {
  const session = useSession(sessionId, directory);
  const status = useSessionStatus(sessionId, directory);
  const boundRunId = useDirectorySync(
    React.useCallback((state) => selectBoundRunId(state, sessionId), [sessionId]),
    directory,
  );
  const sessionRecapEnabled = useUIStore((state) => state.sessionRecapEnabled);
  // The same settled rule the composer uses for its send/stop button. Accepting
  // only `idle` dropped a real recap and suggestion after a reload: the Agent
  // Service reports a session it no longer holds as `unavailable`, and a
  // session whose event stream has not connected yet has no status at all.
  const isSettled = sessionActivityPhase(status, boundRunId) === 'idle';
  // The recap journal route is root-only: a draft, an unknown id, and a
  // subagent child all answer 403/404 there. Without a projected root row
  // there is nothing to read.
  const recapReadable = session !== undefined && session !== null && !session.parentSessionId
    && session.rootSessionId === session.sessionId;
  // Same freshness rule as the sidebar row's recap tooltip: the canonical
  // session update is authoritative, not the last loaded assistant answer.
  const assist = isSettled ? getCurrentSessionAssist(session) : null;

  // A recap the worker just published wins immediately; the journal route covers
  // the frames this client missed (reload, reconnect), and the metadata payload
  // remains the last fallback for a session that predates the journal. No
  // client-side quiet window: OMP already waited `recap.idleSeconds`.
  const pushedRecap = useSessionRecapStore(
    React.useCallback((state) => state.recap[sessionId]?.recap ?? null, [sessionId]),
  );
  const pushedSuggestion = useSessionSuggestionStore(
    React.useCallback((state) => state.suggestions[sessionId]?.suggestion ?? null, [sessionId]),
  );
  const journalledRecap = useNativeRecap(sessionId, sessionRecapEnabled && isSettled && recapReadable);
  const promoted = pushedRecap ?? journalledRecap ?? (assist && assist.recap ? assist.recap : null);

  return {
    assist,
    visibleRecap: sessionRecapEnabled ? promoted : null,
    suggestion: isSettled ? pushedSuggestion : null,
    sessionKnown: session !== undefined && session !== null,
  };
}
