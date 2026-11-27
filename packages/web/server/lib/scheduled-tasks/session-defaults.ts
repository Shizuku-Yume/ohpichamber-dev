import { parseModelSelector } from '@openchamber/agent-contract';
import type { CapturedSendOptions } from '@openchamber/agent-contract';
import type { SettingsDocument } from '../settings/settings-helpers.js';
import { asNonEmptyString } from '../shared/guards.js';

export interface ScheduledExecutionSelectionInput {
  useDefaults?: boolean;
  providerID?: string;
  modelID?: string;
  variant?: string;
}

export interface SessionDefaultsProject {
  defaultModel?: string | null;
  defaultVariant?: string | null;
}

export interface SessionDefaultsInput {
  settings?: SettingsDocument | null | undefined;
  project?: SessionDefaultsProject | null | undefined;
}

const splitModel = (value: string | null | undefined) => {
  const parsed = parseModelSelector(asNonEmptyString(value) ?? '');
  return parsed ? { providerId: parsed.providerId, modelId: parsed.modelId, thinkingLevel: parsed.thinkingLevel } : null;
};

export const resolveScheduledTaskOptions = (execution: ScheduledExecutionSelectionInput): CapturedSendOptions => ({
  providerId: execution.useDefaults ? null : execution.providerID ?? null,
  modelId: execution.useDefaults ? null : execution.modelID ?? null,
  agentId: null,
  variant: execution.useDefaults ? null : execution.variant ?? null,
  reasoningEffort: null,
});

export const resolveSessionDefaults = ({ project }: SessionDefaultsInput): CapturedSendOptions => {
  const model = splitModel(project?.defaultModel);
  return {
    providerId: model?.providerId ?? null,
    modelId: model?.modelId ?? null,
    variant: model ? asNonEmptyString(project?.defaultVariant) : null,
    agentId: null,
    reasoningEffort: null,
  };
};
