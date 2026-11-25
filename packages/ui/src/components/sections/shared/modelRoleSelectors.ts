import { z } from 'zod';
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
  type ProblemDetails,
} from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import { toast } from '@/components/ui';

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
    models.some((model) => (providerId === undefined || model.provider === providerId) && model.modelId === modelId);
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

const RoleSelectorObjectSchema = z.object({ selector: z.string() });
const RoleSelectorEntrySchema = z.union([
  z.string(),
  RoleSelectorObjectSchema,
]);
const RoleSelectorValueSchema = z.union([
  z.string(),
  z.array(RoleSelectorEntrySchema),
  RoleSelectorObjectSchema,
]);

export function defaultThinkingLevelFromState(state: OmpSettingsState | null | undefined): string | undefined {
  const parsed = z.string().safeParse(state?.settings.find((setting) => setting.id === 'defaultThinkingLevel')?.value);
  return parsed.success && parsed.data.length > 0 ? parsed.data : undefined;
}

function extractFallbackSelectors(rawValue: JsonValue | readonly string[] | undefined): string[] {
  const parsed = RoleSelectorValueSchema.safeParse(rawValue);
  if (!parsed.success) return [];
  const entries: string[] = [];
  const pushString = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.includes(' → ') || (/\s/.test(trimmed) && !trimmed.includes(','))) {
      entries.push(trimmed);
      return;
    }
    for (const part of trimmed.split(',')) {
      const candidate = part.trim();
      if (candidate) entries.push(candidate);
    }
  };
  const data = parsed.data;
  const stringValue = z.string().safeParse(data);
  if (stringValue.success) {
    pushString(stringValue.data);
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const itemString = z.string().safeParse(item);
      if (itemString.success) {
        pushString(itemString.data);
      } else {
        const itemObj = RoleSelectorObjectSchema.safeParse(item);
        if (itemObj.success) pushString(itemObj.data.selector);
      }
    }
  } else {
    const objValue = RoleSelectorObjectSchema.safeParse(data);
    if (objValue.success) pushString(objValue.data.selector);
  }
  return entries;
}

export function formatRoleDisplayValue(
  rawValue: JsonValue | readonly string[] | undefined,
  models: readonly Model[],
  t: (key: I18nKey) => string,
): string {
  const entries = extractFallbackSelectors(rawValue);
  if (entries.length === 0) return t('settings.omp.modelRoles.inheritFallback');
  const primary = entries[0];
  const extraCount = entries.length - 1;
  if (/\s/.test(primary)) {
    return extraCount > 0 ? `${primary} +${extraCount}` : primary;
  }
  const { model: modelRef, effort } = splitRoleSelector(primary, models);
  const catalogModel = modelForSelector(models, modelRef);
  const parsed = catalogModel ? null : parseModelSelector(modelRef, MAX_THINKING_SUFFIX_OPTIONS);
  const modelLabel = catalogModel
    ? (catalogModel.name.trim() || catalogModel.modelId)
    : (parsed ? parsed.modelId : modelRef);
  const effortText = effort ? levelLabel(t, effort) : '';
  const base = effortText ? `${modelLabel} · ${effortText}` : modelLabel;
  return extraCount > 0 ? `${base} +${extraCount}` : base;
}

/**
 * The one way a model-role write failure surfaces: a catalog conflict means the
 * project's own config file overrides the value, anything else is a plain save
 * failure. Every role editor reports through here so the wording cannot drift.
 */
export function reportModelRoleSaveProblem(
  problem: ProblemDetails | null,
  translate: (key: I18nKey) => string,
): void {
  if (problem?.status === 409 && problem.code === 'CATALOG_CONFLICT') {
    toast.error(translate('settings.omp.modelRoles.catalogConflict'));
    return;
  }
  toast.error(translate('settings.omp.modelRoles.saveFailed'));
}
