import { parseModelSelector } from '@openchamber/agent-contract';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';

<<<<<<< HEAD
/**
 * The model, agent and variant a session the app starts on its own sends with:
 * the defaults from Settings, falling back to what the user picked last. Used
 * where no composer is involved, such as an extension starting a session or the
 * Memory panel's tidy-up.
 */
||||||| bc50ba56aa
/**
 * The model, agent and variant a session the app starts on its own sends with:
 * the defaults from Settings, falling back to what the user picked last. Used
 * where no composer is involved, such as an extension starting a session or the
 * Memory panel's tidy-up.
 */
const resolveDefaultAgentName = (): string | undefined => {
  const configState = useConfigStore.getState();
  if (configState.settingsDefaultAgent) {
    return configState.settingsDefaultAgent;
  }
  const visibleAgents = configState.agents.filter((agent) => !agent.hidden);
  return (
    configState.currentAgentName
    || visibleAgents.find((agent) => agent.mode === 'primary' || !agent.mode)?.name
    || visibleAgents[0]?.name
  );
};
=======
const resolveDefaultAgentName = (): string | undefined => {
  const configState = useConfigStore.getState();
  if (configState.settingsDefaultAgent) {
    return configState.settingsDefaultAgent;
  }
  const visibleAgents = configState.agents.filter((agent) => !agent.hidden);
  return (
    configState.currentAgentName
    || visibleAgents.find((agent) => agent.mode === 'primary' || !agent.mode)?.name
    || visibleAgents[0]?.name
  );
};
>>>>>>> upstream/main

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
<<<<<<< HEAD
  if (configuredVariant && variantNames.includes(configuredVariant)) {
    return configuredVariant;
  }
  if (currentVariant && variantNames.includes(currentVariant)) {
    return currentVariant;
  }
  return undefined;
||||||| bc50ba56aa
  // The agent's pin for this model is configuration too; after it the level
  // this model was last sent with, then whatever the composer currently shows.
  // `null` is an explicit Default and is kept as the answer.
  return resolveEffortChoice(
    [resolveEffortForModelSelection({
      providerID, modelID, variants: variantNames,
      agents: configState.agents, agentName, configuredVariant,
    }), currentVariant],
    variantNames,
  );
=======
  return resolveEffortChoice(
    [resolveEffortForModelSelection({
      providerID, modelID, variants: variantNames,
      agents: configState.agents, agentName, configuredVariant,
    }), currentVariant],
    variantNames,
  );
>>>>>>> upstream/main
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
