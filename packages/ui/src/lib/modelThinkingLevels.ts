/**
 * The effort levels a model offers, derived in one place. A model carries
 * `reasoningOptions` when it has real OMP effort levels; older catalogs use
 * `variants` (routes) whose ids name the level. The phone's effort button and
 * the composer's effort panel both read this module so they cannot list
 * different levels for the same model.
 */
type ThinkingLevelModel = {
  reasoningEffortSupported?: boolean;
  reasoningOptions?: readonly { reasoningEffort: string }[];
  variants?: readonly { variant: string }[];
  defaultReasoningEffort?: string;
};

const distinct = (values: readonly string[]): string[] => {
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
};

/**
 * Real effort levels only, in the composer's picker shape: `['off', ...levels]`.
 * Models without OMP effort support have none — their `variants` are routes,
 * not levels.
 */
export const getReasoningEffortLevels = (model: ThinkingLevelModel | undefined): string[] => {
  if (!model?.reasoningEffortSupported) return [];
  const levels = distinct((model.reasoningOptions ?? []).map((option) => option.reasoningEffort))
    .filter((level) => level !== 'off');
  return ['off', ...levels];
};

/**
 * Every level the phone can step through: real effort levels first, then the
 * legacy variant ids. Empty means the model has nothing to cycle.
 */
export const getModelThinkingLevels = (model: ThinkingLevelModel | undefined): string[] => {
  const efforts = getReasoningEffortLevels(model);
  if (efforts.length > 0) return efforts;
  const variants = distinct((model?.variants ?? []).map((route) => route.variant));
  return variants.length > 0 ? ['off', ...variants] : [];
};

/**
 * The level a send currently carries, as the composer shows it: an explicit
 * pick, the model's own default, else off. `candidates` narrows whatever the
 * stores hold to levels this model actually runs.
 */
export const resolveThinkingLevel = (
  levels: readonly string[],
  candidates: readonly (string | undefined)[],
): string => {
  if (levels.length === 0) return 'off';
  for (const candidate of candidates) {
    if (candidate !== undefined && levels.includes(candidate)) return candidate;
  }
  return 'off';
};

/** The level a tap moves to, wrapping at the end. `current` may be unknown. */
export const nextThinkingLevel = (levels: readonly string[], current: string | undefined): string | undefined => {
  if (levels.length === 0) return undefined;
  // An unknown level counts as the first one, so a tap moves past the default.
  const index = Math.max(0, levels.indexOf(current ?? ''));
  return levels[(index + 1) % levels.length];
};
