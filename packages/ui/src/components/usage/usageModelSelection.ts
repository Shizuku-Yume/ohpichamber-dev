/**
 * The model rows a compact usage panel shows. A saved selection wins while it
 * still names a model the provider reports.
 */
export const selectVisibleModelEntries = <T>(
  _providerId: string,
  modelEntries: ReadonlyArray<readonly [string, T]>,
  selectedModels: readonly string[],
): ReadonlyArray<readonly [string, T]> => {
  if (selectedModels.length === 0) return modelEntries;
  return modelEntries.filter(([modelName]) => selectedModels.includes(modelName));
};
const selectVisibleModelNames = (
  providerId: string,
  modelNames: readonly string[],
  selectedModels: readonly string[],
): string[] => selectVisibleModelEntries(providerId, modelNames.map((name) => [name, name] as const), selectedModels)
  .map(([name]) => name);

export const toggleVisibleModel = (
  providerId: string,
  modelNames: readonly string[],
  selectedModels: readonly string[],
  modelName: string,
): string[] => {
  const visible = selectVisibleModelNames(providerId, modelNames, selectedModels);
  if (!visible.includes(modelName)) return [...visible, modelName];
  return visible.length > 1 ? visible.filter((name) => name !== modelName) : visible;
};
