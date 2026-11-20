import { parseModelSelector } from '@openchamber/agent-contract';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';

/**
 * The model, agent and variant a session the app starts on its own sends with:
 * the defaults from Settings, falling back to what the user picked last. Used
 * where no composer is involved, such as an extension starting a session or the
 * Memory panel's tidy-up.
 */

const resolveDefaultModelSelection = (): { providerID: string; modelID: string } | null => {
  const parsed = parseModelSelector(useConfigStore.getState().settingsDefaultModel);
  if (!parsed) {
    return null;
  }
  if (!useConfigStore.getState().getModelMetadata(parsed.providerId, parsed.modelId)) {
    return null;
  }
  return { providerID: parsed.providerId, modelID: parsed.modelId };
};

const resolveDefaultVariant = (providerID: string, modelID: string): string | undefined => {
  const configState = useConfigStore.getState();
  const configuredVariant = configState.getDefaultVariantForModel(providerID, modelID);
  const currentVariant = configState.currentProviderId === providerID && configState.currentModelId === modelID
    ? configState.currentVariant
    : undefined;
  const provider = configState.providers.find((entry) => entry.providerId === providerID);
  const model = provider?.models.find((entry) => entry.modelId === modelID);
  const variantNames = model?.variants ? model.variants.map((v) => v.variant) : [];
  if (variantNames.length === 0) {
    return configuredVariant || currentVariant || undefined;
  }
  if (configuredVariant && variantNames.includes(configuredVariant)) {
    return configuredVariant;
  }
  if (currentVariant && variantNames.includes(currentVariant)) {
    return currentVariant;
  }
  return undefined;
};

export const captureDefaultSendSelection = () => {
  const configState = useConfigStore.getState();
  const lastUsedProvider = useSelectionStore.getState().lastUsedProvider;
  const defaultModel = resolveDefaultModelSelection();
  const providerID = defaultModel?.providerID || configState.currentProviderId || lastUsedProvider?.providerID;
  const modelID = defaultModel?.modelID || configState.currentModelId || lastUsedProvider?.modelID;
  if (!providerID || !modelID) {
    return null;
  }
  return { providerID, modelID, variant: resolveDefaultVariant(providerID, modelID) };
};
