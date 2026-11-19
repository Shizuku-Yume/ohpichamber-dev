import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore, ROOT_SELECTION_AGENT } from '@/sync/selection-store';
import { getModelThinkingLevels, nextThinkingLevel, getReasoningEffortLevels, resolveThinkingLevel } from '@/lib/modelThinkingLevels';

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
