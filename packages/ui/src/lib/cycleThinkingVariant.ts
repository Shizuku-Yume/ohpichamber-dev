import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore, ROOT_SELECTION_AGENT } from '@/sync/selection-store';
import { getModelThinkingLevels, nextThinkingLevel, getReasoningEffortLevels, resolveThinkingLevel } from '@/lib/modelThinkingLevels';

<<<<<<< HEAD
/**
 * Moves the current model to its next effort level and records the choice
 * for `sessionId`, so the session keeps it. Returns false when the model has
 * no effort levels. The keyboard shortcut and the phone's effort button both
 * cycle through this.
 *
 * Real OMP efforts (`reasoningOptions`) come first; a legacy catalog's route
 * ids are the fallback. Each tap writes one authority, exactly as the desktop
 * pickers do: the config's effort and no route override for real efforts, or
 * the route override for legacy variants.
 */
||||||| bc50ba56aa
/**
 * Moves the current model to its next effort level and records the choice
 * for `sessionId`, so the session keeps it. Returns false when the model has
 * no effort levels. The keyboard shortcut and the phone's effort button both
 * cycle through this.
 */
=======
>>>>>>> upstream/main
export const cycleThinkingVariant = (sessionId: string | null | undefined): boolean => {
  const state = useConfigStore.getState();
  const model = state.getCurrentModel();
  const levels = getModelThinkingLevels(model);
  if (levels.length === 0) return false;

  const usesEfforts = getReasoningEffortLevels(model).length > 0;
  if (usesEfforts) {
    const current = resolveThinkingLevel(levels, [
      state.currentReasoningEffort,
      model?.defaultReasoningEffort,
    ]);
    const next = nextThinkingLevel(levels, current);
    if (next === undefined) return false;
    state.setCurrentReasoningEffort(next);
    state.setCurrentVariantOverride(null, state.currentVariantSelection.inherited);
    const { currentAgentName, currentProviderId, currentModelId } = useConfigStore.getState();
    if (sessionId && currentProviderId && currentModelId) {
      useSelectionStore.getState().saveAgentModelVariantForSession(
        sessionId,
        currentAgentName ?? ROOT_SELECTION_AGENT,
        currentProviderId,
        currentModelId,
        null,
      );
      useSelectionStore.getState().saveAgentModelReasoningEffortForSession(
        sessionId,
        currentAgentName ?? ROOT_SELECTION_AGENT,
        currentProviderId,
        currentModelId,
        next,
      );
    }
    return true;
  }

  const nextVariantOverride = state.cycleCurrentVariant();
  const { currentAgentName, currentProviderId, currentModelId } = useConfigStore.getState();
  if (sessionId && currentAgentName && currentProviderId && currentModelId) {
    useSelectionStore.getState().saveAgentModelVariantForSession(
      sessionId,
      currentAgentName,
      currentProviderId,
      currentModelId,
      nextVariantOverride,
    );
  }
  return true;
};
