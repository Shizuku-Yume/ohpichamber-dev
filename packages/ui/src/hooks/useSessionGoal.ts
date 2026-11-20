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
  mode: Extract<SessionMode, { kind: 'goal' }> | null;
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
