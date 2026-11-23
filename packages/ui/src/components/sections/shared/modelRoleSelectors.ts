import {
  JsonObjectSchema,
  MAX_THINKING_SUFFIX_OPTIONS,
  THINKING_LEVELS,
  formatModelRef,
  formatModelSelector,
  formatModelSelectorValue,
  parseConfiguredThinkingLevel,
  parseModelSelector,
  splitSelectorThinking,
  type JsonValue,
  type Model,
  type OmpSettingsChange,
  type OmpSettingsState,
} from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';

/** Level ids a picker may show, in OMP's display order minus the grammar-only `inherit`. */
const EFFORT_LEVELS = THINKING_LEVELS.filter((level) => level !== 'inherit');

const EFFORT_LABEL_KEYS: Record<string, I18nKey> = {
  auto: 'settings.remoteInstances.page.field.auto',
  off: 'settings.omp.modelRoles.effort.off',
  minimal: 'settings.omp.modelRoles.effort.minimal',
  low: 'settings.omp.modelRoles.effort.low',
  medium: 'settings.omp.modelRoles.effort.medium',
  high: 'settings.omp.modelRoles.effort.high',
  xhigh: 'settings.omp.modelRoles.effort.xhigh',
  max: 'settings.omp.modelRoles.effort.max',
};

/** A model's model half and thinking level, read by the one selector grammar. */
export function splitRoleSelector(
  selector: string | null | undefined,
  models: readonly Model[],
): { model: string; effort: string } {
  const literal = (providerId: string | undefined, modelId: string) =>
    providerId !== undefined && models.some((model) => model.provider === providerId && model.modelId === modelId);
  const split = splitSelectorThinking(selector ?? null, { ...MAX_THINKING_SUFFIX_OPTIONS, isLiteralModelId: literal });
  return { model: split.model, effort: split.thinkingLevel ?? '' };
}

/** Write a selector back as `provider/model[:level]`; an empty model writes nothing. */
export function formatRoleSelector(model: string, effort: string): string {
  const trimmed = model.trim();
  if (!trimmed) return '';
  const level = parseConfiguredThinkingLevel(effort);
  const parsed = parseModelSelector(trimmed);
  return parsed
    ? formatModelSelector({ providerId: parsed.providerId, modelId: parsed.modelId, thinkingLevel: level })
    : formatModelSelectorValue(trimmed, level);
}

/** The model a selector names, so labels and effort options come from the catalog. */
export function modelForSelector(models: readonly Model[], selector: string): Model | undefined {
  return models.find((model) => formatModelRef(model) === selector);
}

/**
 * The levels a picker offers for a model: the efforts the catalog advertises,
 * else OMP's level names. A model that publishes no per-model default starts
 * at `off`, which is what OMP resolves when the selection names none.
 */
export function listModelEfforts(
  model: Model | undefined,
  translate: (key: I18nKey) => string,
): { level: string; label: string }[] {
  if (!model || !model.reasoningEffortSupported) return [];
  if (model.reasoningOptions.length > 0) {
    // A catalog label that is just the level id (`high`) is a spelling, not a
    // name: translate it. A model-specific label (`High effort`) is the model's
    // own wording and stays as published.
    return model.reasoningOptions.map((option) => ({
      level: option.reasoningEffort,
      label: option.label === option.reasoningEffort ? levelLabel(translate, option.reasoningEffort) : option.label,
    }));
  }
  return EFFORT_LEVELS.map((level) => ({ level, label: levelLabel(translate, level) }));
}

/**
 * The level that actually runs when the selection names none, resolved in the
 * order OMP applies: the selection's own level, then the model's own default,
 * then the session-wide `defaultThinkingLevel`, and only then `off`. A picker
 * shows the resolved level as the current one instead of inventing a "default"
 * row the user cannot inspect.
 */
export function concreteEffort(
  model: Model | undefined,
  explicitLevel: string,
  globalLevel?: string,
): string {
  if (explicitLevel) return explicitLevel;
  return model?.defaultReasoningEffort ?? globalLevel ?? 'off';
}

/** Localized name of a level, from the shared effort vocabulary. */
export const levelLabel = (translate: (key: I18nKey) => string, level: string): string => {
  const key = EFFORT_LABEL_KEYS[level];
  if (key === undefined) return level;
  const label = translate(key);
  return label === key ? level : label;
};

/** Every entry the native `modelRoles` record holds, arrays and objects included. */
export function parseRolesRecord(val: unknown): Record<string, JsonValue> {
  const parsed = JsonObjectSchema.safeParse(val);
  return parsed.success ? parsed.data : {};
}

/** The selector shown for a role; native role values may be arrays of fallbacks. */
export function roleSelector(value: JsonValue | undefined): string {
  const primary = typeof value === 'string' ? value
    : Array.isArray(value) ? value[0]
    : value && typeof value === 'object' ? value.selector
    : undefined;
  return typeof primary === 'string' ? (primary.split(',', 1)[0] ?? '').trim() : '';
}

export function replaceFirstSelector(value: JsonValue | undefined, selector: string): string {
  const separator = typeof value === 'string' ? value.indexOf(',') : -1;
  return separator < 0 || typeof value !== 'string' ? selector : selector + value.slice(separator);
}

export function modelRoleChange(state: OmpSettingsState, role: string, selector: string): OmpSettingsChange {
  const roles = parseRolesRecord(state.settings.find((setting) => setting.id === 'modelRoles')?.value);
  const prior = roles[role];
  if (!selector) {
    delete roles[role];
  } else if (Array.isArray(prior)) {
    roles[role] = [replaceFirstSelector(prior[0], selector), ...prior.slice(1)];
  } else if (prior && typeof prior === 'object') {
    roles[role] = { ...prior, selector: replaceFirstSelector(prior.selector, selector) };
  } else {
    roles[role] = replaceFirstSelector(prior, selector);
  }
  return { id: 'modelRoles', value: roles };
}
