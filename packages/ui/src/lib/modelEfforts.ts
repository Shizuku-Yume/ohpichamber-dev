import { modelRefKey } from '@openchamber/agent-contract';
import { useUIStore } from '@/stores/useUIStore';

<<<<<<< HEAD
/**
 * A thinking level in the same three states the selection store uses: a
 * variant name, `null` for an explicit Default, and `undefined` for no choice.
 */
type EffortChoice = string | null | undefined;
||||||| bc50ba56aa
/**
 * A thinking level in the same three states the selection store uses: a
 * variant name, `null` for an explicit Default, and `undefined` for no choice.
 */
export type EffortChoice = string | null | undefined;
=======
export type EffortChoice = string | null | undefined;
>>>>>>> upstream/main

type EffortAgentPin = {
  name?: string;
  id?: string;
  model?: { providerID?: string; id?: string; variant?: string };
};

const effortMemoryKey = (providerID: string, modelID: string): string => modelRefKey(providerID, modelID);

const effortRevisions = new Map<string, number>();
export const readEffortRevision = (providerID: string, modelID: string): number =>
  effortRevisions.get(effortMemoryKey(providerID, modelID)) ?? 0;

<<<<<<< HEAD
/** The last chosen level for this model, across sessions and projects. */
const readRememberedEffort = (providerID: string, modelID: string): EffortChoice => {
||||||| bc50ba56aa
/** The last chosen level for this model, across sessions and projects. */
export const readRememberedEffort = (providerID: string, modelID: string): EffortChoice => {
=======
export const readRememberedEffort = (providerID: string, modelID: string): EffortChoice => {
>>>>>>> upstream/main
  if (!providerID || !modelID) return undefined;
  return (useUIStore.getState().lastUsedEfforts ?? {})[effortMemoryKey(providerID, modelID)];
};

export const rememberEffort = (providerID: string, modelID: string, effort: EffortChoice, expectedRevision?: number): void => {
  if (!providerID || !modelID) return;
  const revision = readEffortRevision(providerID, modelID);
  if (expectedRevision !== undefined && revision !== expectedRevision) return;
  effortRevisions.set(effortMemoryKey(providerID, modelID), revision + 1);
  useUIStore.getState().rememberLastUsedEffort(providerID, modelID, effort ?? null);
};

export const resolveEffortChoice = (
  sources: readonly EffortChoice[],
  variants: readonly string[],
): EffortChoice => {
  for (const source of sources) {
    if (source === null) return null;
    if (source !== undefined && variants.includes(source)) return source;
  }
  return undefined;
};

export const resolveEffortForModelSelection = ({
  providerID,
  modelID,
  variants,
  agents,
  agentName,
  configuredVariant,
  rememberedEffort = readRememberedEffort(providerID, modelID),
}: {
  providerID: string;
  modelID: string;
  variants: readonly string[];
  agents?: readonly EffortAgentPin[];
  agentName?: string | null;
  configuredVariant?: string | null;
  rememberedEffort?: EffortChoice;
}): EffortChoice => {
  if (variants.length === 0) return undefined;
  const wantedAgent = agentName?.trim() ?? '';
  const agent = wantedAgent
    ? agents?.find((entry) => entry.name === wantedAgent || entry.id === wantedAgent)
    : undefined;
  const agentModel = agent?.model;
  const agentVariant = agentModel?.providerID === providerID && agentModel?.id === modelID
    ? agentModel.variant
    : undefined;
  return resolveEffortChoice(
    [agentVariant, configuredVariant, rememberedEffort],
    variants,
  );
};
