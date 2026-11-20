import { parseModelSelector } from '@openchamber/agent-contract';

/** Resolve Host-configured selection without inventing service model defaults. */
const splitModel = (value) => {
  const parsed = parseModelSelector(typeof value === 'string' ? value : '');
  return parsed ? { providerId: parsed.providerId, modelId: parsed.modelId, thinkingLevel: parsed.thinkingLevel } : null;
};

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const resolveScheduledTaskOptions = (execution) => ({
  providerId: execution.useDefaults ? null : execution.providerID ?? null,
  modelId: execution.useDefaults ? null : execution.modelID ?? null,
  agentId: null,
  variant: execution.useDefaults ? null : execution.variant ?? null,
  reasoningEffort: null,
});
export const resolveSessionDefaults = ({ project }) => {
  const model = splitModel(project?.defaultModel);
  return {
    providerId: model?.providerId ?? null,
    modelId: model?.modelId ?? null,
    variant: model ? text(project?.defaultVariant) : null,
    agentId: null,
    reasoningEffort: null,
  };
};
