/** Resolve Host-configured selection without inventing service model defaults. */
const splitModel = (value) => {
  const text = typeof value === 'string' ? value.trim() : '';
  const slash = text.indexOf('/');
  if (slash <= 0 || slash === text.length - 1) return null;
  return { providerId: text.slice(0, slash), modelId: text.slice(slash + 1) };
};

const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const resolveSessionDefaults = ({ settings, project }) => {
  const projectModel = splitModel(project?.defaultModel);
  const globalModel = splitModel(settings?.defaultModel);
  const model = projectModel ?? globalModel;
  const variant = projectModel ? text(project?.defaultVariant) : globalModel ? text(settings?.defaultVariant) : null;
  return {
    providerId: model?.providerId ?? null,
    modelId: model?.modelId ?? null,
    variant,
    agentId: text(project?.defaultAgent) ?? text(settings?.defaultAgent),
    reasoningEffort: null,
  };
};
