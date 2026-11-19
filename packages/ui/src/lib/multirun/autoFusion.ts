import React from 'react';
import type { RunStatus, Session } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { useConfigStore } from '@/stores/useConfigStore';
import { subscribeSessionStatusTransitions, useGlobalSessionStatusStore } from '@/sync/global-session-status';
import { useI18n } from '@/lib/i18n';
import { NoFusionOutputsError, startRunFusion, type FusionJudge } from './fusion';
import { hasRunningGoal } from './laneStatus';
import type { MultiRunSummary } from './runs';
import { useMultiRunSessions } from './useMultiRuns';
import { RUN_LAUNCHER_ID } from './launcher';

<<<<<<< HEAD
/** Resolves the judge's display name and context window from the provider catalog. */
export const resolveFusionJudge = (selection: FusionJudge): FusionJudge => {
  const model = useConfigStore.getState().providers.find((provider) => provider.providerId === selection.providerId)?.models.find((entry) => entry.modelId === selection.modelId);
||||||| bc50ba56aa
/** Resolves the judge's display name and context window from the provider catalog. */
export const resolveFusionJudge = (selection: { providerID: string; modelID: string; variant?: string; agent?: string }): FusionJudge => {
  const provider = useConfigStore.getState().providers.find((entry) => entry.id === selection.providerID);
  const model = provider?.models.find((entry) => entry.id === selection.modelID);
=======
export const resolveFusionJudge = (selection: { providerID: string; modelID: string; variant?: string; agent?: string }): FusionJudge => {
  const provider = useConfigStore.getState().providers.find((entry) => entry.id === selection.providerID);
  const model = provider?.models.find((entry) => entry.id === selection.modelID);
>>>>>>> upstream/main
  return {
    ...selection,
    modelName: model?.name || selection.modelId,
    contextLimit: model?.contextWindow || undefined,
  };
};

const startedRunKeys = new Set<string>();
<<<<<<< HEAD
// Lanes seen running on this page. A lane is finished only after it was seen
// running and then left the live busy set with an outcome: persisted history
// or a missing status entry never counts as finished.
||||||| bc50ba56aa
// Lanes seen running on this page. A lane is finished only after it was seen
// running and then left the live busy set with an outcome. A parent idling for
// a subagent must record a newer completion before its answer can be fused.
=======
>>>>>>> upstream/main
const seenRunningLaneIds = new Set<string>();
// A parent idling for a subagent must record a newer idle time before its
// answer can be fused; a resumed parent may finish again in the same batch.
const waitingLaneIdleTimes = new Map<string, number | undefined>();
const waitingForResumptionLaneIds = new Set<string>();

// The display resolver covers only the selected directory; fusion has its own
// complete session map, including children outside it.
const hasActiveChild = (sessionId: string, activeIds: ReadonlySet<string>, sessionById: ReadonlyMap<string, Session>): boolean => {
  for (const activeId of activeIds) {
    if (activeId === sessionId) continue;
    let current = sessionById.get(activeId)?.parentSessionId;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current === sessionId) return true;
      current = sessionById.get(current)?.parentSessionId;
    }
  }
  return false;
};

type FusionStart = (run: MultiRunSummary) => Promise<void>;
export type AutoFusionFailure = 'no-outputs' | 'failed';


/** Terminal live evidence only: absence and in-progress outcomes never finish a lane. */
export const isAutoFusionLaneFinished = (input: { seenRunning: boolean; busy: boolean; outcome: RunStatus | null | undefined }): boolean => (
  input.seenRunning && !input.busy
  && (input.outcome === 'completed' || input.outcome === 'failed' || input.outcome === 'cancelled')
);
function useRunAutoFusion(onStartFailed: (failure: AutoFusionFailure) => void): void {
  const { index, sessionById } = useMultiRunSessions();
  const activeSessionIds = useGlobalSessionStatusStore((state) => state.activeSessionIds);
  const observedById = useGlobalSessionStatusStore((state) => state.observedById);
  const failureRef = React.useRef(onStartFailed);
  failureRef.current = onStartFailed;

  React.useEffect(() => subscribeSessionStatusTransitions((sessionId, activeIds) => {
    for (const run of index.runs.values()) {
      if (run.autoFusion?.launcherId !== RUN_LAUNCHER_ID || startedRunKeys.has(run.key) || run.fusions.length > 0) continue;
<<<<<<< HEAD
      if (!run.lanes.some((lane) => lane.sessionId === sessionId)) continue;
      if (activeIds.has(sessionId)) {
        seenRunningLaneIds.add(sessionId);
        // The mark stays: a resumed lane's next idle has to be newer than the
        // idle that started this wait, and that newer time is its completion.
        waitingForResumptionLaneIds.delete(sessionId);
      } else if (hasActiveChild(sessionId, activeIds, sessionById)) {
        waitingForResumptionLaneIds.add(sessionId);
||||||| bc50ba56aa
      for (const lane of run.lanes) {
        if (lane.sessionId !== sessionId) continue;
        if (activeIds.has(sessionId)) {
          seenRunningLaneIds.add(sessionId);
          // A resumed parent may finish again before this batch reaches React.
          waitingForResumptionLaneIds.delete(sessionId);
          waitingLaneIdleTimes.delete(sessionId);
        } else if (hasActiveSubagent(sessionId, activeIds, (id) => sessionById.get(id)?.parentID)) {
          waitingForResumptionLaneIds.add(sessionId);
        }
=======
      for (const lane of run.lanes) {
        if (lane.sessionId !== sessionId) continue;
        if (activeIds.has(sessionId)) {
          seenRunningLaneIds.add(sessionId);
          waitingForResumptionLaneIds.delete(sessionId);
          waitingLaneIdleTimes.delete(sessionId);
        } else if (hasActiveSubagent(sessionId, activeIds, (id) => sessionById.get(id)?.parentID)) {
          waitingForResumptionLaneIds.add(sessionId);
        }
>>>>>>> upstream/main
      }
    }
  }), [index, sessionById]);

  React.useEffect(() => {
    const start: FusionStart = async (run) => {
      const autoFusion = run.autoFusion;
      if (!autoFusion) return;
      startedRunKeys.add(run.key);
      try {
        await startRunFusion({
          run,
          sourceIds: run.lanes.map((lane) => lane.sessionId),
          judge: resolveFusionJudge({ providerId: autoFusion.providerID, modelId: autoFusion.modelID, variant: autoFusion.variant }),
          sessionById,
        });
      } catch (error) {
        console.error('[MultiRun] Auto-fusion failed to start', error);
        failureRef.current(error instanceof NoFusionOutputsError ? 'no-outputs' : 'failed');
      }
    };
    for (const run of index.runs.values()) {
      if (run.autoFusion?.launcherId !== RUN_LAUNCHER_ID || startedRunKeys.has(run.key) || run.fusions.length > 0) continue;
      for (const lane of run.lanes) {
        if (activeSessionIds.has(lane.sessionId)) {
          seenRunningLaneIds.add(lane.sessionId);
        } else if (hasActiveChild(lane.sessionId, activeSessionIds, sessionById)) {
          waitingLaneIdleTimes.set(lane.sessionId, sessionById.get(lane.sessionId)?.updatedAt);
        } else if ((sessionById.get(lane.sessionId)?.updatedAt ?? 0) > (waitingLaneIdleTimes.get(lane.sessionId) ?? 0)) {
          // A newer completion answers the resumption the lane was waiting for;
          // the waiting mark stays, since that completion is this lane's evidence.
          waitingForResumptionLaneIds.delete(lane.sessionId);
        }
      }
      const finished = run.lanes.every((lane) => {
        const busy = activeSessionIds.has(lane.sessionId);
        const seenRunning = seenRunningLaneIds.has(lane.sessionId);
        const waitingMark = waitingLaneIdleTimes.get(lane.sessionId);
        // A parent idling for a subagent finishes, resumes, then idles again; the
        // second run may publish no terminal event, so its newer idle time is the
        // completion evidence. A lane that never waited still needs a terminal one.
        const answeredResumption = waitingMark !== undefined
          && (sessionById.get(lane.sessionId)?.updatedAt ?? 0) > waitingMark;
        const observed = seenRunning && !busy && !waitingForResumptionLaneIds.has(lane.sessionId)
          && isAutoFusionLaneFinished({ seenRunning, busy, outcome: observedById.get(lane.sessionId)?.outcome });
        return (observed || (seenRunning && !busy && answeredResumption))
          && !hasRunningGoal(sessionById.get(lane.sessionId));
      });
      if (finished) void start(run);
    }
  }, [activeSessionIds, observedById, index, sessionById]);
}

export function RunAutoFusion(): null {
  const { t } = useI18n();
  useRunAutoFusion(React.useCallback((failure: AutoFusionFailure) => {
    toast.error(failure === 'no-outputs' ? t('multirun.fusion.toast.noOutputs') : t('multirun.fusion.toast.failed'));
  }, [t]));
  return null;
}
