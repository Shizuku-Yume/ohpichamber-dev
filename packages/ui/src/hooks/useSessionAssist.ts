import React from 'react';
import { useDirectorySync, useSession, useSessionStatus } from '@/sync/sync-context';
import { getCurrentSessionAssist, type SessionAssistPayload } from '@/lib/sessionAssistMetadata';
import { selectBoundRunId, sessionActivityPhase } from '@/hooks/useSessionActivity';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { runtimeFetch } from '@/lib/runtime-fetch';
import { SessionRecapListResponseSchema } from '@openchamber/agent-contract';
import { useSessionRecapStore } from '@/stores/useSessionRecapStore';
import { useSessionSuggestionStore } from '@/stores/useSessionSuggestionStore';
||||||| bc50ba56aa

// How long the chat must sit untouched before the recap becomes visible.
// The suggestion has no such delay — it shows as soon as it arrives.
const RECAP_VISIBILITY_DELAY_MS = 60 * 1000;
=======

const RECAP_VISIBILITY_DELAY_MS = 60 * 1000;
>>>>>>> upstream/main

export interface SessionAssistState {
  assist: SessionAssistPayload | null;
<<<<<<< HEAD
  /** Recap text, shown as soon as OMP publishes one for an idle session. */
||||||| bc50ba56aa
  /** Recap text, only when the 1-minute quiet window has elapsed. */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
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
||||||| bc50ba56aa
  const isIdle = !status || status.type === 'idle';
  // Same freshness rule as the sidebar row's recap tooltip. Comparing against the
  // last loaded message disagreed with it: in v2 the newest record is the
  // turn's `idle` marker (or a model/agent switch), never the assistant answer.
  const assist = isIdle ? getCurrentSessionAssist(session) : null;

  // Recap waits out the quiet window after the turn ended; re-render once when
  // the boundary passes.
  const idleAt = session?.time?.idle ?? 0;
  const [, forceTick] = React.useReducer((tick: number) => tick + 1, 0);
  const quietElapsed = assist ? Date.now() - idleAt >= RECAP_VISIBILITY_DELAY_MS : false;

  React.useEffect(() => {
    if (!assist || quietElapsed || !idleAt) return undefined;
    const remaining = RECAP_VISIBILITY_DELAY_MS - (Date.now() - idleAt);
    if (remaining <= 0) return undefined;
    const timer = setTimeout(forceTick, remaining + 250);
    return () => clearTimeout(timer);
  }, [assist, quietElapsed, idleAt]);
=======
  const isIdle = !status || status.type === 'idle';
  const assist = isIdle ? getCurrentSessionAssist(session) : null;

  const idleAt = session?.time?.idle ?? 0;
  const [, forceTick] = React.useReducer((tick: number) => tick + 1, 0);
  const quietElapsed = assist ? Date.now() - idleAt >= RECAP_VISIBILITY_DELAY_MS : false;

  React.useEffect(() => {
    if (!assist || quietElapsed || !idleAt) return undefined;
    const remaining = RECAP_VISIBILITY_DELAY_MS - (Date.now() - idleAt);
    if (remaining <= 0) return undefined;
    const timer = setTimeout(forceTick, remaining + 250);
    return () => clearTimeout(timer);
  }, [assist, quietElapsed, idleAt]);
>>>>>>> upstream/main

  return {
    assist,
    visibleRecap: sessionRecapEnabled ? promoted : null,
    suggestion: isSettled ? pushedSuggestion : null,
    sessionKnown: session !== undefined && session !== null,
  };
}
