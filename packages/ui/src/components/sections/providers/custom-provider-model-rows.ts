import {
  JsonObjectSchema,
  OMP_PROVIDER_APIS,
  type JsonObject,
  type Model,
  type ModelInfoSource,
  type OmpHeadersPatch,
  type OmpModelApi,
  type OmpModelDefinitionRead,
  type OmpModelKind,
  type OmpModelOverrideRead,
  type OmpModelTokenizer,
  type OmpProviderApi,
  type OmpThinkingEffort,
  type OmpThinkingMode,
  type ProviderModelDiscoveryResult,
} from '@openchamber/agent-contract';

export type TriState = 'default' | 'true' | 'false';

export function toTriState(value: boolean | undefined): TriState {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'default';
}

export function fromTriState(value: TriState, includeNull: boolean): boolean | null | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return includeNull ? null : undefined;
}

export function fromTriStateOptional(value: TriState): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** The fields auto-fill may write, and the ones whose provenance it tracks. */
export type ModelAutoFillField =
  | 'contextWindow'
  | 'maxOutputTokens'
  | 'modalities'
  | 'toolsSupported'
  | 'reasoning'
  | 'pricing'
  | 'thinking'
  | 'imageCountBudget';

export interface HeaderRow { row: string; name: string; value: string }

export interface ModelRow {
  row: string;
  modelId: string;
  name: string;
  api: '' | OmpModelApi;
  kind: '' | OmpModelKind;
  baseUrl: string;
  contextWindow: string;
  maxContextWindow: string;
  maxOutputTokens: string;
  modalities: Model['modalities'];
  /**
   * The row's native runner kind. OMP publishes `audio` only for `tts`/`stt`
   * models and `embedding` only for embedding models, and the writer rejects
   * either on any other kind, so which chips may be offered follows from here.
   */
  nativeKind: NativeModelKind;
  toolsSupported?: boolean;
  reasoning?: boolean;
  thinkingMode: '' | OmpThinkingMode;
  thinkingEfforts: OmpThinkingEffort[];
  thinkingDefaultLevel: '' | OmpThinkingEffort;
  thinkingSupportsDisplay: TriState;
  thinkingRequiresEffort: TriState;
  thinkingEffortMapJson: string;
  costInput: string;
  costOutput: string;
  costCacheRead: string;
  costCacheWrite: string;
  promptCacheShort: string;
  promptCacheLong: string;
  premiumMultiplier: string;
  imageCountBudget: string;
  imageInputDecoder: '' | 'stb';
  tokenizer: '' | OmpModelTokenizer;
  omitMaxOutputTokens: TriState;
  preferWebsockets: TriState;
  compatJson: string;
  contextPromotionTarget: string;
  compactionModel: string;
  remoteCompactionEnabled: TriState;
  remoteCompactionApi: '' | OmpProviderApi;
  remoteCompactionEndpoint: string;
  remoteCompactionModel: string;
  remoteCompactionV2StreamingEnabled: TriState;
  remoteCompactionV2Endpoint: string;
  remoteCompactionStreamingEndpoint: string;
  headerNames: string[];
  headersPatchRemove: string[];
  headers: HeaderRow[];
  replaceHeaders: boolean;
  /** Canonical fields kept for legacy fallback or display metadata. */
  base?: Model;
  reasoningEffortSupported?: boolean;
  pricing?: Model['pricing'];
  /**
   * Fields the user set (typed or saved). Auto-fill may refill its own values
   * but never one of these, so a typed limit survives a later catalog read.
   */
  typed: ReadonlySet<ModelAutoFillField>;
  /** Where each auto-filled value came from, for the label under the control. */
  filledFrom: Partial<Record<ModelAutoFillField, ModelInfoSource>>;
  /** Catalog family, when a catalog read named one; the dialog groups by it. */
  family?: string;
}

export function parseJsonObjectText(raw: string): { ok: true; value: JsonObject } | { ok: false } {
  try {
    const parsed: unknown = JSON.parse(raw);
    const checked = JsonObjectSchema.safeParse(parsed);
    return checked.success ? { ok: true, value: checked.data } : { ok: false };
  } catch {
    return { ok: false };
  }
}

export const COMPAT_BOOLEAN_FLAGS = [
  'supportsStore',
  'supportsDeveloperRole',
  'supportsReasoningEffort',
  'supportsUsageInStreaming',
  'requiresThinkingAsText',
] as const;
export type CompatBooleanFlag = (typeof COMPAT_BOOLEAN_FLAGS)[number];
export const COMPAT_MAX_TOKENS_FIELDS = ['max_completion_tokens', 'max_tokens'] as const;

export function readCompatBooleanFlag(compatJson: string, flag: CompatBooleanFlag): TriState {
  const trimmed = compatJson.trim();
  if (!trimmed) return 'default';
  const parsed = parseJsonObjectText(trimmed);
  if (!parsed.ok) return 'default';
  const value = parsed.value[flag];
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'default';
}

export function readCompatMaxTokensField(compatJson: string): string {
  const trimmed = compatJson.trim();
  if (!trimmed) return '';
  const parsed = parseJsonObjectText(trimmed);
  if (!parsed.ok) return '';
  const value = parsed.value.maxTokensField;
  return typeof value === 'string' ? value : '';
}

export function updateCompatJsonFlag(
  compatJson: string,
  key: CompatBooleanFlag | 'maxTokensField',
  nextValue: TriState | string,
): string {
  const trimmed = compatJson.trim();
  const base: JsonObject = trimmed ? (() => {
    const parsed = parseJsonObjectText(trimmed);
    return parsed.ok ? { ...parsed.value } : {};
  })() : {};
  if (key === 'maxTokensField') {
    const field = typeof nextValue === 'string' ? nextValue.trim() : '';
    if (!field) delete base.maxTokensField;
    else base.maxTokensField = field;
  } else if (nextValue === 'true') {
    base[key] = true;
  } else if (nextValue === 'false') {
    base[key] = false;
  } else {
    delete base[key];
  }
  return Object.keys(base).length > 0 ? JSON.stringify(base, null, 2) : '';
}

export function duplicateModelRow(source: ModelRow): ModelRow {
  return {
    ...source,
    row: crypto.randomUUID(),
    modelId: '',
    name: '',
    modalities: [...source.modalities],
    thinkingEfforts: [...source.thinkingEfforts],
    headerNames: [],
    headersPatchRemove: [],
    headers: [],
    replaceHeaders: false,
    typed: new Set(source.typed),
    filledFrom: {},
    base: undefined,
  };
}

/**
 * The native runner kinds whose modality chips differ.
 */
export type NativeModelKind = 'chat' | 'tts' | 'stt' | 'embedding' | 'image' | 'tiny' | 'rerank' | 'video' | 'judge';

const BASE_MODALITIES = ['text', 'image'] as const;

export function modelModalitiesForKind(kind: NativeModelKind): readonly Model['modalities'][number][] {
  if (kind === 'tts' || kind === 'stt') return [...BASE_MODALITIES, 'audio'];
  if (kind === 'embedding') return [...BASE_MODALITIES, 'embedding'];
  return BASE_MODALITIES;
}

export function normalizeModelModalities(
  kind: NativeModelKind,
  modalities: readonly Model['modalities'][number][],
): Model['modalities'] {
  const allowed = modelModalitiesForKind(kind);
  const kept = [...new Set(modalities)].filter((modality) => allowed.includes(modality));
  if (!kept.some((modality) => modality === 'text' || modality === 'image')) kept.unshift('text');
  return kept;
}

export function catalogInputs(input: readonly ('text' | 'image')[]): Array<'text' | 'image'> {
  return (['text', 'image'] as const).filter((modality) => input.includes(modality));
}

export function nativeKindOf(modalities: readonly Model['modalities'][number][], explicitKind?: OmpModelKind): NativeModelKind {
  if (explicitKind) return explicitKind;
  if (modalities.includes('embedding')) return 'embedding';
  if (modalities.includes('audio')) return 'tts';
  return 'chat';
}

export const isHttpEndpoint = (value: string): boolean => {
  try {
    const endpoint = new URL(value);
    return (endpoint.protocol === 'http:' || endpoint.protocol === 'https:')
      && endpoint.username === '' && endpoint.password === '' && endpoint.hash === '';
  } catch {
    return false;
  }
};

const isCanonicalModel = (model: Model | ProviderModelDiscoveryResult['models'][number] | undefined): model is Model =>
  model !== undefined && 'modalities' in model;

function emptyModelRowFields(overrides: Partial<ModelRow> = {}): ModelRow {
  return {
    row: crypto.randomUUID(),
    modelId: '',
    name: '',
    api: '',
    kind: '',
    baseUrl: '',
    contextWindow: '',
    maxContextWindow: '',
    maxOutputTokens: '',
    modalities: ['text'],
    nativeKind: 'chat',
    toolsSupported: undefined,
    reasoning: undefined,
    thinkingMode: '',
    thinkingEfforts: [],
    thinkingDefaultLevel: '',
    thinkingSupportsDisplay: 'default',
    thinkingRequiresEffort: 'default',
    thinkingEffortMapJson: '',
    costInput: '',
    costOutput: '',
    costCacheRead: '',
    costCacheWrite: '',
    promptCacheShort: '',
    promptCacheLong: '',
    premiumMultiplier: '',
    imageCountBudget: '',
    imageInputDecoder: '',
    tokenizer: '',
    omitMaxOutputTokens: 'default',
    preferWebsockets: 'default',
    compatJson: '',
    contextPromotionTarget: '',
    compactionModel: '',
    remoteCompactionEnabled: 'default',
    remoteCompactionApi: '',
    remoteCompactionEndpoint: '',
    remoteCompactionModel: '',
    remoteCompactionV2StreamingEnabled: 'default',
    remoteCompactionV2Endpoint: '',
    remoteCompactionStreamingEndpoint: '',
    headerNames: [],
    headersPatchRemove: [],
    headers: [],
    replaceHeaders: false,
    typed: new Set(),
    filledFrom: {},
    ...overrides,
  };
}

export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const canonical = isCanonicalModel(model) ? { ...model } : undefined;
  const { modelId = '', name = '', contextWindow, maxOutputTokens } = model ?? {};
  const modalities: Model['modalities'] = canonical ? [...canonical.modalities] : ['text'];
  const nativeKind = nativeKindOf(modalities);
  const typed: ModelAutoFillField[] = canonical ? ['contextWindow', 'maxOutputTokens', 'modalities', 'reasoning', 'pricing'] : [];
  if (canonical?.toolsSupported !== undefined) typed.push('toolsSupported');
  return emptyModelRowFields({
    modelId,
    name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    modalities: normalizeModelModalities(nativeKind, modalities),
    nativeKind,
    toolsSupported: canonical?.toolsSupported,
    reasoning: canonical ? canonical.reasoningEffortSupported : undefined,
    costInput: canonical?.pricing ? String(canonical.pricing.inputPerMillionTokens) : '',
    costOutput: canonical?.pricing ? String(canonical.pricing.outputPerMillionTokens) : '',
    costCacheRead: canonical?.pricing?.cacheReadPerMillionTokens !== undefined && canonical.pricing.cacheReadPerMillionTokens !== null
      ? String(canonical.pricing.cacheReadPerMillionTokens)
      : '',
    costCacheWrite: canonical?.pricing?.cacheWritePerMillionTokens !== undefined && canonical.pricing.cacheWritePerMillionTokens !== null
      ? String(canonical.pricing.cacheWritePerMillionTokens)
      : '',
    base: canonical,
    reasoningEffortSupported: canonical?.reasoningEffortSupported,
    pricing: canonical?.pricing,
    typed: new Set(typed),
  });
}

export function createModelRowFromNative(model: OmpModelDefinitionRead | OmpModelOverrideRead, modelId: string, baseUrl?: string): ModelRow {
  const modalities: Model['modalities'] = model.input ? [...model.input] : ['text'];
  const nativeKind = nativeKindOf(modalities, model.kind);
  const typed: ModelAutoFillField[] = [];
  if (model.contextWindow !== undefined) typed.push('contextWindow');
  if (model.maxTokens !== undefined) typed.push('maxOutputTokens');
  if (model.input !== undefined) typed.push('modalities');
  if (model.supportsTools !== undefined) typed.push('toolsSupported');
  if (model.reasoning !== undefined) typed.push('reasoning');
  if (model.cost !== undefined) typed.push('pricing');
  if (model.thinking !== undefined) typed.push('thinking');
  if (model.imageCountBudget !== undefined) typed.push('imageCountBudget');

  const rcApi = OMP_PROVIDER_APIS.find((entry) => entry === model.remoteCompaction?.api) ?? '';
  return emptyModelRowFields({
    modelId,
    name: model.name ?? '',
    api: model.api ?? '',
    kind: model.kind ?? '',
    baseUrl: baseUrl ?? '',
    contextWindow: model.contextWindow !== undefined ? String(model.contextWindow) : '',
    maxContextWindow: model.maxContextWindow !== undefined ? String(model.maxContextWindow) : '',
    maxOutputTokens: model.maxTokens !== undefined ? String(model.maxTokens) : '',
    modalities: normalizeModelModalities(nativeKind, modalities),
    nativeKind,
    toolsSupported: model.supportsTools,
    reasoning: model.reasoning,
    thinkingMode: model.thinking?.mode ?? '',
    thinkingEfforts: model.thinking?.efforts ? [...model.thinking.efforts] : [],
    thinkingDefaultLevel: model.thinking?.defaultLevel ?? '',
    thinkingSupportsDisplay: toTriState(model.thinking?.supportsDisplay),
    thinkingRequiresEffort: toTriState(model.thinking?.requiresEffort),
    thinkingEffortMapJson: model.thinking?.effortMap ? JSON.stringify(model.thinking.effortMap, null, 2) : '',
    costInput: model.cost?.input !== undefined ? String(model.cost.input) : '',
    costOutput: model.cost?.output !== undefined ? String(model.cost.output) : '',
    costCacheRead: model.cost?.cacheRead !== undefined ? String(model.cost.cacheRead) : '',
    costCacheWrite: model.cost?.cacheWrite !== undefined ? String(model.cost.cacheWrite) : '',
    promptCacheShort: model.promptCache?.short !== undefined ? String(model.promptCache.short) : '',
    promptCacheLong: model.promptCache?.long !== undefined ? String(model.promptCache.long) : '',
    premiumMultiplier: model.premiumMultiplier !== undefined ? String(model.premiumMultiplier) : '',
    imageCountBudget: model.imageCountBudget !== undefined ? String(model.imageCountBudget) : '',
    imageInputDecoder: model.imageInputDecoder ?? '',
    tokenizer: model.tokenizer ?? '',
    omitMaxOutputTokens: toTriState(model.omitMaxOutputTokens),
    preferWebsockets: toTriState(model.preferWebsockets),
    compatJson: model.compat ? JSON.stringify(model.compat, null, 2) : '',
    contextPromotionTarget: model.contextPromotionTarget ?? '',
    compactionModel: model.compactionModel ?? '',
    remoteCompactionEnabled: toTriState(model.remoteCompaction?.enabled),
    remoteCompactionApi: rcApi,
    remoteCompactionEndpoint: model.remoteCompaction?.endpoint ?? '',
    remoteCompactionModel: model.remoteCompaction?.model ?? '',
    remoteCompactionV2StreamingEnabled: toTriState(model.remoteCompaction?.v2StreamingEnabled),
    remoteCompactionV2Endpoint: model.remoteCompaction?.v2Endpoint ?? '',
    remoteCompactionStreamingEndpoint: model.remoteCompaction?.streamingEndpoint ?? '',
    headerNames: [...model.headerNames],
    headersPatchRemove: [],
    headers: [],
    replaceHeaders: false,
    typed: new Set(typed),
  });
}

export function createHeaderRow(name = '', value = ''): HeaderRow {
  return { row: crypto.randomUUID(), name, value };
}

export function collectHeaderMap(rows: readonly HeaderRow[]): Record<string, string> {
  const headers: Record<string, string> = {};
  const names = new Set<string>();
  for (const row of rows) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    if (!name || names.has(name.toLowerCase())) throw new Error('Invalid or duplicate header');
    names.add(name.toLowerCase());
    headers[name] = row.value;
  }
  return headers;
}

export function buildHeadersPatch(
  headerNames: readonly string[],
  headers: readonly HeaderRow[],
  removeList: readonly string[],
  replaceHeaders: boolean,
): { headers?: Record<string, string>; headersPatch?: OmpHeadersPatch } {
  if (replaceHeaders) {
    return { headers: collectHeaderMap(headers) };
  }
  const setMap = collectHeaderMap(headers);
  const remove = removeList.filter((name) => headerNames.includes(name));
  const hasSet = Object.keys(setMap).length > 0;
  const hasRemove = remove.length > 0;
  if (!hasSet && !hasRemove) return {};
  return {
    headersPatch: {
      ...(hasSet ? { set: setMap } : {}),
      ...(hasRemove ? { remove } : {}),
    },
  };
}

export function markModelFieldTyped(row: ModelRow, field: ModelAutoFillField): ModelRow {
  if (row.typed.has(field) && row.filledFrom[field] === undefined) return row;
  const { [field]: _retired, ...filledFrom } = row.filledFrom;
  return { ...row, typed: new Set([...row.typed, field]), filledFrom };
}
