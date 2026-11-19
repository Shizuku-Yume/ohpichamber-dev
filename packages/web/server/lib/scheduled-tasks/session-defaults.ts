<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/session-defaults.js
import { parseModelSelector } from '@openchamber/agent-contract';

/** Resolve Host-configured selection without inventing service model defaults. */
const splitModel = (value) => {
  const parsed = parseModelSelector(typeof value === 'string' ? value : '');
  return parsed ? { providerId: parsed.providerId, modelId: parsed.modelId, thinkingLevel: parsed.thinkingLevel } : null;
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/session-defaults.js
/**
 * The model, thinking level and agent a new session starts with, as Settings
 * and the project define them: the project's own default first, then the
 * global one. A thinking level travels with the model it was set next to.
 * Anything unset is null, and OpenCode then applies its own default.
 */
const splitModel = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const slash = text.indexOf('/');
  if (slash <= 0 || slash === text.length - 1) return null;
  return { providerID: text.slice(0, slash), modelID: text.slice(slash + 1) };
=======
export interface SessionDefaultSettings {
  defaultModel?: unknown;
  defaultVariant?: unknown;
  defaultAgent?: unknown;
}

const isString = (value: unknown): value is string => typeof value === 'string';

const splitModel = (value: SessionDefaultSettings['defaultModel']) => {
  const text = isString(value) ? value.trim() : '';
  const slash = text.indexOf('/');
  if (slash <= 0 || slash === text.length - 1) return null;
  return { providerID: text.slice(0, slash), modelID: text.slice(slash + 1) };
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/session-defaults.ts
};

const text = (value: SessionDefaultSettings['defaultAgent']) => (isString(value) && value.trim() ? value.trim() : null);

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/session-defaults.js
export const resolveScheduledTaskOptions = (execution) => ({
  providerId: execution.useDefaults ? null : execution.providerID ?? null,
  modelId: execution.useDefaults ? null : execution.modelID ?? null,
  agentId: null,
  variant: execution.useDefaults ? null : execution.variant ?? null,
  reasoningEffort: null,
});
export const resolveSessionDefaults = ({ project }) => {
  const model = splitModel(project?.defaultModel);
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/session-defaults.js
export const resolveSessionDefaults = ({ settings, project }) => {
  const projectModel = splitModel(project?.defaultModel);
  const globalModel = splitModel(settings?.defaultModel);
  const model = projectModel ?? globalModel;
  const variant = projectModel ? text(project?.defaultVariant) : globalModel ? text(settings?.defaultVariant) : null;
=======
export const resolveSessionDefaults = ({ settings, project }: {
  settings?: SessionDefaultSettings | null;
  project?: SessionDefaultSettings | null;
}) => {
  const projectModel = splitModel(project?.defaultModel);
  const globalModel = splitModel(settings?.defaultModel);
  const model = projectModel ?? globalModel;
  const variant = projectModel ? text(project?.defaultVariant) : globalModel ? text(settings?.defaultVariant) : null;
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/session-defaults.ts
  return {
    providerId: model?.providerId ?? null,
    modelId: model?.modelId ?? null,
    variant: model ? text(project?.defaultVariant) : null,
    agentId: null,
    reasoningEffort: null,
  };
};
