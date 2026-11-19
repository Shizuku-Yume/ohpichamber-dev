import React from 'react';
import type { SessionMode } from '@openchamber/agent-contract';
import { useSession } from '@/sync/sync-context';
import { useConfigStore } from '@/stores/useConfigStore';

/**
 * Whether OMP's goal mode is available at all. The switch is OMP's own
 * `goal.enabled`; there is no second copy in the Host settings, so the composer,
 * the goal row and the dialog cannot disagree about it. OMP defaults it on, and
 * so does an unanswered or still-loading read: hiding the mode while settings
 * load would look like the feature disappeared.
 */
export function useGoalModeEnabled(): boolean {
  const ompSettings = useConfigStore((state) => state.ompSettings);
  const loadOmpSettings = useConfigStore((state) => state.loadOmpSettings);

  React.useEffect(() => {
    if (!ompSettings) void loadOmpSettings();
  }, [ompSettings, loadOmpSettings]);

  return ompSettings?.settings.find((setting) => setting.id === 'goal.enabled')?.value !== false;
}

export interface SessionGoalState {
<<<<<<< HEAD
  mode: Extract<SessionMode, { kind: 'goal' }> | null;
||||||| bc50ba56aa
  /** Parsed goal payload, or null when the session has no goal. */
  goal: SessionGoalPayload | null;
  /** The Settings → Chat toggle; when off, goal UI stays hidden. */
=======
  goal: SessionGoalPayload | null;
>>>>>>> upstream/main
  enabled: boolean;
  running: boolean;
}

export function useSessionGoal(sessionId: string, directory?: string): SessionGoalState {
  const session = useSession(sessionId, directory);
  const enabled = useGoalModeEnabled();
  return {
    mode: session?.mode.kind === 'goal' ? session.mode : null,
    enabled,
    running: session?.activeRunId != null || session?.continuationPending === true,
  };
}

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * False only when nothing can check a goal's progress: Jev is not the chosen
 * checker or has no classification provider, and the small model is known to
 * be unavailable. The server checks with the small model whenever Jev cannot,
 * so that is the model asked about here.
 */
export function useGoalCheckAvailable(directory: string | undefined, active: boolean): boolean {
  const jevAvailable = useRoutingStore(selectSafetyNetAvailable);
  const checker = useUIStore((state) => state.sessionGoalChecker);
  const jevChecks = jevAvailable && checker === 'classifier';
  const smallModel = useSmallModelAvailability(directory, active && !jevChecks);
  return jevChecks || smallModel !== 'unavailable';
}
=======
export function useGoalCheckAvailable(directory: string | undefined, active: boolean): boolean {
  const jevAvailable = useRoutingStore(selectSafetyNetAvailable);
  const checker = useUIStore((state) => state.sessionGoalChecker);
  const jevChecks = jevAvailable && checker === 'classifier';
  const smallModel = useSmallModelAvailability(directory, active && !jevChecks);
  return jevChecks || smallModel !== 'unavailable';
}
>>>>>>> upstream/main

<<<<<<< HEAD
||||||| bc50ba56aa
const OBJECTIVE_CONTENT_CACHE_MAX = 64;
const objectiveContentByFetchKey = new Map<string, Promise<string | null>>();

// Effective objective text for display. Inline goals return the metadata
// text directly; file-backed goals fetch the server-side file once per
// goal edit (keyed by id + updatedAt). Display-only: a failed fetch yields
// null and callers degrade gracefully (e.g. VS Code, where the OpenChamber
// route is unavailable — the strip then shows a generic goal title).
export function useGoalObjectiveContent(sessionId: string, goal: SessionGoalPayload | null): string | null {
  const [fetched, setFetched] = React.useState<string | null>(null);
  const fetchKey = goal?.objectiveFile ? `${sessionId}:${goal.id}:${goal.updatedAt}` : '';

  React.useEffect(() => {
    if (!fetchKey) {
      setFetched(null);
      return undefined;
    }
    let alive = true;
    // The key already names the goal edit, so a remount (every session switch
    // remounts the strip) reuses the text instead of fetching the file again.
    let request = objectiveContentByFetchKey.get(fetchKey);
    if (!request) {
      request = fetchGoalObjectiveContent(sessionId);
      objectiveContentByFetchKey.set(fetchKey, request);
      if (objectiveContentByFetchKey.size > OBJECTIVE_CONTENT_CACHE_MAX) {
        const oldest = objectiveContentByFetchKey.keys().next().value;
        if (oldest !== undefined) objectiveContentByFetchKey.delete(oldest);
      }
    }
    void request.then((content) => {
      if (alive) setFetched(content);
    });
    return () => {
      alive = false;
    };
  }, [fetchKey, sessionId]);

  if (!goal) return null;
  return goal.objectiveFile ? fetched : goal.objective;
}
=======
const OBJECTIVE_CONTENT_CACHE_MAX = 64;
const objectiveContentByFetchKey = new Map<string, Promise<string | null>>();

export function useGoalObjectiveContent(sessionId: string, goal: SessionGoalPayload | null): string | null {
  const [fetched, setFetched] = React.useState<string | null>(null);
  const fetchKey = goal?.objectiveFile ? `${sessionId}:${goal.id}:${goal.updatedAt}` : '';

  React.useEffect(() => {
    if (!fetchKey) {
      setFetched(null);
      return undefined;
    }
    let alive = true;
    let request = objectiveContentByFetchKey.get(fetchKey);
    if (!request) {
      request = fetchGoalObjectiveContent(sessionId);
      objectiveContentByFetchKey.set(fetchKey, request);
      if (objectiveContentByFetchKey.size > OBJECTIVE_CONTENT_CACHE_MAX) {
        const oldest = objectiveContentByFetchKey.keys().next().value;
        if (oldest !== undefined) objectiveContentByFetchKey.delete(oldest);
      }
    }
    void request.then((content) => {
      if (alive) setFetched(content);
    });
    return () => {
      alive = false;
    };
  }, [fetchKey, sessionId]);

  if (!goal) return null;
  return goal.objectiveFile ? fetched : goal.objective;
}
>>>>>>> upstream/main
