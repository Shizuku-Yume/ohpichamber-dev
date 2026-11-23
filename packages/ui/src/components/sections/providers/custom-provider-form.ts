import {
  JsonObjectSchema,
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  OMP_MODEL_APIS,
  OMP_MODEL_KINDS,
  OMP_MODEL_TOKENIZERS,
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
  OMP_THINKING_EFFORTS,
  OMP_THINKING_MODES,
  OmpModelDefinitionWriteSchema,
  OmpModelOverrideWriteSchema,
  OmpProviderConfigWriteSchema,
  ProviderConfigureRequestSchema,
  ProviderModelDiscoveryRequestSchema,
  type JsonObject,
  type Model,
  type ModelCatalogInfo,
  type ModelInfoSource,
  type OmpBedrockGuardrailTrace,
  type OmpConfigApiKeyStatus,
  type OmpDiscoveryType,
  type OmpHeadersPatch,
  type OmpModelApi,
  type OmpModelDefinitionRead,
  type OmpModelDefinitionWrite,
  type OmpModelKind,
  type OmpModelOverrideRead,
  type OmpModelOverrideWrite,
  type OmpModelTokenizer,
  type OmpProviderApi,
  type OmpProviderAuthMode,
  type OmpThinkingConfig,
  type OmpThinkingEffort,
  type OmpThinkingMode,
  type ProviderConfigurationRead,
  type ProviderConfigureRequest,
  type ProviderModelDiscoveryRequest,
  type ProviderModelDiscoveryResult,
} from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';

export {
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  OMP_MODEL_APIS,
  OMP_MODEL_KINDS,
  OMP_MODEL_TOKENIZERS,
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
  OMP_THINKING_EFFORTS,
  OMP_THINKING_MODES,
};

export const CUSTOM_PROVIDER_ID = '__custom_provider__';
const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;

export type CustomProviderProtocol = (typeof CUSTOM_PROVIDER_PROTOCOLS)[number];
export type TriState = 'default' | 'true' | 'false';
export type ConfigApiKeyAction = 'keep' | 'set' | 'clear';

export const isCustomProviderProtocol = (value: string): value is CustomProviderProtocol =>
  CUSTOM_PROVIDER_PROTOCOLS.some((protocol) => protocol === value);

function nativeApiFromProtocol(protocol: CustomProviderProtocol): OmpProviderApi {
  switch (protocol) {
    case 'chat-completions':
      return 'openai-completions';
    case 'responses':
      return 'openai-responses';
    case 'messages':
      return 'anthropic-messages';
    case 'generate-content':
      return 'google-generative-ai';
  }
}

export function legacyProtocolForApi(api: string | undefined | null): CustomProviderProtocol | undefined {
  switch (api) {
    case 'openai-completions':
      return 'chat-completions';
    case 'openai-responses':
    case 'openai-codex-responses':
    case 'azure-openai-responses':
      return 'responses';
    case 'anthropic-messages':
    case 'bedrock-converse-stream':
      return 'messages';
    case 'google-generative-ai':
    case 'google-gemini-cli':
    case 'google-vertex':
      return 'generate-content';
    default:
      return undefined;
  }
}

function toTriState(value: boolean | undefined): TriState {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return 'default';
}

function fromTriState(value: TriState, includeNull: boolean): boolean | null | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return includeNull ? null : undefined;
}

function fromTriStateOptional(value: TriState): boolean | undefined {
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

/** What Save does with the uploaded logo image. */
export type CustomProviderLogoPlan =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upload'; file: File };

export interface CustomProviderFormState {
  isEdit: boolean;
  isBuiltIn: boolean;
  hasNativeEntry: boolean;
  effectiveBaseUrl: string;
  effectiveApi: string;
  providerId: string;
  name: string;
  endpoint: string;
  protocol: CustomProviderProtocol;
  api: '' | OmpProviderApi;
  auth: '' | OmpProviderAuthMode;
  authHeader: TriState;
  configApiKeyStatus: OmpConfigApiKeyStatus;
  configApiKeyAction: ConfigApiKeyAction;
  configApiKeyValue: string;
  credentialRef: string | null;
  apiKey: string;
  replaceHeaders: boolean;
  headerNames: string[];
  headersPatchRemove: string[];
  headers: HeaderRow[];
  discoveryEnabled: boolean;
  discoveryType: OmpDiscoveryType;
  discoveryTimeoutMs: string;
  discoveryInjectV1: TriState;
  discoveryAdvertisedReasoning: TriState;
  compatJson: string;
  disableStrictTools: TriState;
  transportPiNative: boolean;
  guardrailIdentifier: string;
  guardrailVersion: string;
  guardrailTrace: '' | OmpBedrockGuardrailTrace;
  requestMetadata: HeaderRow[];
  remoteCompactionEnabled: TriState;
  remoteCompactionApi: '' | OmpProviderApi;
  remoteCompactionEndpoint: string;
  remoteCompactionModel: string;
  remoteCompactionV2StreamingEnabled: TriState;
  remoteCompactionV2Endpoint: string;
  remoteCompactionStreamingEndpoint: string;
  models: ModelRow[];
  modelOverrides: ModelRow[];
  icon: CustomProviderIcon | null;
  logo: File | 'removed' | null;
}

export interface CustomProviderPersistPlan {
  request: ProviderConfigureRequest;
  providerId: string;
  providerName: string;
  apiKey: string;
  icon: CustomProviderIcon | null;
  logo: CustomProviderLogoPlan;
}

export type CustomProviderTranslator = (key: I18nKey) => string;

export interface CustomProviderFieldErrors {
  providerId?: string;
  name?: string;
  endpoint?: string;
  discoveryTimeoutMs?: string;
  compatJson?: string;
  remoteCompactionEndpoint?: string;
  remoteCompactionV2Endpoint?: string;
  remoteCompactionStreamingEndpoint?: string;
}

export interface ModelFieldErrors {
  modelId?: string;
  name?: string;
  baseUrl?: string;
  contextWindow?: string;
  maxContextWindow?: string;
  maxOutputTokens?: string;
  thinkingEfforts?: string;
  thinkingEffortMapJson?: string;
  cost?: string;
  promptCacheShort?: string;
  promptCacheLong?: string;
  premiumMultiplier?: string;
  imageCountBudget?: string;
  compatJson?: string;
  remoteCompactionEndpoint?: string;
  remoteCompactionV2Endpoint?: string;
  remoteCompactionStreamingEndpoint?: string;
  headers?: HeaderFieldErrors[];
}

export interface HeaderFieldErrors {
  name?: string;
  value?: string;
}

export interface CustomProviderValidation {
  fields: CustomProviderFieldErrors;
  models: ModelFieldErrors[];
  modelOverrides: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  requestMetadata: HeaderFieldErrors[];
  valid: boolean;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * OMP's selector grammar: the provider is the text before the first `/`, so
 * the delimiter set below would split a selection, and the id also keys plain
 * objects (`config.providers`, `metadata.providers`), so prototype names are
 * refused even though they pass the character rule.
 */
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROVIDER_ID_DELIMITERS = /[/#@:\s]/;
// A Set, not a Record: `__proto__` as an object-literal key would set the
// prototype instead of carrying the name as data.
const PROTOTYPE_KEY_HAZARDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** The one provider-id rule, used by the editor's field check and the request builder. */
export function isValidProviderID(value: string): boolean {
  return PROVIDER_ID_PATTERN.test(value)
    && !PROVIDER_ID_DELIMITERS.test(value)
    && !PROTOTYPE_KEY_HAZARDS.has(value);
}

/** OMP matches provider ids case-insensitively, so a taken id differs only by case. */
function isProviderIDTaken(providerId: string, existing: ReadonlySet<string>): boolean {
  const normalized = providerId.toLowerCase();
  for (const id of existing) {
    if (id.toLowerCase() === normalized) return true;
  }
  return false;
}

const positiveInteger = (value: string): boolean => {
  const parsed = Number(value.trim());
  return /^[0-9]+$/.test(value.trim()) && Number.isSafeInteger(parsed) && parsed > 0;
};

const nonNegativeNumber = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0;
};

function parseJsonObjectText(raw: string): { ok: true; value: JsonObject } | { ok: false } {
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

function nativeKindOf(modalities: readonly Model['modalities'][number][], explicitKind?: OmpModelKind): NativeModelKind {
  if (explicitKind) return explicitKind;
  if (modalities.includes('embedding')) return 'embedding';
  if (modalities.includes('audio')) return 'tts';
  return 'chat';
}

const isHttpEndpoint = (value: string): boolean => {
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

function createModelRowFromNative(model: OmpModelDefinitionRead | OmpModelOverrideRead, modelId: string, baseUrl?: string): ModelRow {
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

export function createEmptyCustomProviderForm(
  initial?: ProviderConfigurationRead,
  icon: CustomProviderIcon | null = null,
): CustomProviderFormState {
  if (initial?.native) {
    const native = initial.native;
    const mergedHeaderNames = [...new Set([...native.headerNames, ...initial.headerNames])];
    const resolvedApi = native.api ?? '';
    const resolvedProtocol = legacyProtocolForApi(native.api ?? native.effectiveApi) ?? initial.configuration?.protocol ?? 'chat-completions';
    const rcApi = OMP_PROVIDER_APIS.find((entry) => entry === native.remoteCompaction?.api) ?? '';
    return {
      isEdit: true,
      isBuiltIn: native.isBuiltIn,
      hasNativeEntry: native.hasNativeEntry,
      effectiveBaseUrl: native.effectiveBaseUrl ?? '',
      effectiveApi: native.effectiveApi ?? '',
      providerId: native.providerId,
      name: native.name ?? initial.configuration?.name ?? '',
      endpoint: native.baseUrl ?? '',
      protocol: resolvedProtocol,
      api: resolvedApi,
      auth: native.auth ?? '',
      authHeader: toTriState(native.authHeader),
      configApiKeyStatus: native.configApiKey ?? { configured: false },
      configApiKeyAction: 'keep',
      configApiKeyValue: '',
      credentialRef: initial.configuration?.credentialRef ?? null,
      apiKey: '',
      replaceHeaders: false,
      headerNames: mergedHeaderNames,
      headersPatchRemove: [],
      headers: [],
      discoveryEnabled: Boolean(native.discovery),
      discoveryType: native.discovery?.type ?? 'openai-models-list',
      discoveryTimeoutMs: native.discovery?.timeoutMs !== undefined ? String(native.discovery.timeoutMs) : '',
      discoveryInjectV1: toTriState(native.discovery?.injectV1),
      discoveryAdvertisedReasoning: toTriState(native.discovery?.advertisedReasoning),
      compatJson: native.compat ? JSON.stringify(native.compat, null, 2) : '',
      disableStrictTools: toTriState(native.disableStrictTools),
      transportPiNative: native.transport === 'pi-native',
      guardrailIdentifier: native.guardrailIdentifier ?? '',
      guardrailVersion: native.guardrailVersion ?? '',
      guardrailTrace: native.guardrailTrace ?? '',
      requestMetadata: Object.entries(native.requestMetadata ?? {}).map(([key, value]) => createHeaderRow(key, value)),
      remoteCompactionEnabled: toTriState(native.remoteCompaction?.enabled),
      remoteCompactionApi: rcApi,
      remoteCompactionEndpoint: native.remoteCompaction?.endpoint ?? '',
      remoteCompactionModel: native.remoteCompaction?.model ?? '',
      remoteCompactionV2StreamingEnabled: toTriState(native.remoteCompaction?.v2StreamingEnabled),
      remoteCompactionV2Endpoint: native.remoteCompaction?.v2Endpoint ?? '',
      remoteCompactionStreamingEndpoint: native.remoteCompaction?.streamingEndpoint ?? '',
      models: native.models.map((model) => createModelRowFromNative(model, model.id, model.baseUrl)),
      modelOverrides: Object.entries(native.modelOverrides).map(([modelId, override]) => createModelRowFromNative(override, modelId)),
      icon,
      logo: null,
    };
  }

  const legacyProtocol = initial?.configuration?.protocol ?? 'chat-completions';
  const legacyApi = initial?.configuration ? nativeApiFromProtocol(legacyProtocol) : 'openai-completions';
  return {
    isEdit: Boolean(initial),
    isBuiltIn: false,
    hasNativeEntry: Boolean(initial),
    effectiveBaseUrl: initial?.configuration?.endpoint ?? '',
    effectiveApi: legacyApi,
    providerId: initial?.configuration?.providerId ?? '',
    name: initial?.configuration?.name ?? '',
    endpoint: initial?.configuration?.endpoint ?? '',
    protocol: legacyProtocol,
    api: legacyApi,
    auth: '',
    authHeader: 'default',
    configApiKeyStatus: { configured: false },
    configApiKeyAction: 'keep',
    configApiKeyValue: '',
    credentialRef: initial?.configuration?.credentialRef ?? null,
    apiKey: '',
    replaceHeaders: !initial,
    headerNames: initial?.headerNames ?? [],
    headersPatchRemove: [],
    headers: initial ? [] : [createHeaderRow()],
    discoveryEnabled: false,
    discoveryType: 'openai-models-list',
    discoveryTimeoutMs: '',
    discoveryInjectV1: 'default',
    discoveryAdvertisedReasoning: 'default',
    compatJson: '',
    disableStrictTools: 'default',
    transportPiNative: false,
    guardrailIdentifier: '',
    guardrailVersion: '',
    guardrailTrace: '',
    requestMetadata: [],
    remoteCompactionEnabled: 'default',
    remoteCompactionApi: '',
    remoteCompactionEndpoint: '',
    remoteCompactionModel: '',
    remoteCompactionV2StreamingEnabled: 'default',
    remoteCompactionV2Endpoint: '',
    remoteCompactionStreamingEndpoint: '',
    models: initial ? initial.models.map(createModelRow) : [createModelRow()],
    modelOverrides: [],
    icon,
    logo: null,
  };
}

function collectHeaderMap(rows: readonly HeaderRow[]): Record<string, string> {
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

/** Omission preserves stored headers; an explicitly empty replacement removes them. */
export function providerHeaderWrite(form: CustomProviderFormState): Record<string, string> | undefined {
  if (!form.replaceHeaders) return undefined;
  return collectHeaderMap(form.headers);
}

function buildHeadersPatch(
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

function validateHeaderRows(
  rows: readonly HeaderRow[],
  t: CustomProviderTranslator,
  checkFormat = true,
): HeaderFieldErrors[] {
  const errors = rows.map((row): HeaderFieldErrors => {
    const rowErrors: HeaderFieldErrors = {};
    const name = row.name.trim();
    if (!name && !row.value) return rowErrors;
    if (!name) rowErrors.name = t('settings.providers.page.custom.error.required');
    else if (checkFormat && !HEADER_NAME_PATTERN.test(name)) rowErrors.name = t('settings.providers.page.custom.error.headerName.format');
    if (!row.value) rowErrors.value = t('settings.providers.page.custom.error.required');
    return rowErrors;
  });
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const name = row.name.trim().toLowerCase();
    if (!name) continue;
    if (seen.has(name)) errors[index]!.name = t('settings.providers.page.custom.error.duplicate');
    else seen.add(name);
  }
  return errors;
}

function validateModelRowList(
  rows: readonly ModelRow[],
  mode: 'definition' | 'override',
  t: CustomProviderTranslator,
): ModelFieldErrors[] {
  const errors = rows.map((row): ModelFieldErrors => {
    const rowError: ModelFieldErrors = {};
    if (!row.modelId.trim()) rowError.modelId = t('settings.providers.page.custom.error.required');
    if (mode === 'definition' && row.baseUrl.trim() && !isHttpEndpoint(row.baseUrl.trim())) {
      rowError.baseUrl = t('settings.providers.page.custom.omp.error.urlFormat');
    }
    if (row.contextWindow.trim() && !positiveInteger(row.contextWindow)) {
      rowError.contextWindow = t('settings.providers.page.custom.error.positiveInteger');
    }
    if (row.maxContextWindow.trim() && !positiveInteger(row.maxContextWindow)) {
      rowError.maxContextWindow = t('settings.providers.page.custom.error.positiveInteger');
    } else if (
      positiveInteger(row.contextWindow)
      && positiveInteger(row.maxContextWindow)
      && Number(row.maxContextWindow) < Number(row.contextWindow)
    ) {
      rowError.maxContextWindow = t('settings.providers.page.custom.omp.error.maxContextBelowContext');
    }
    if (row.maxOutputTokens.trim() && !positiveInteger(row.maxOutputTokens)) {
      rowError.maxOutputTokens = t('settings.providers.page.custom.error.positiveInteger');
    } else if (
      positiveInteger(row.contextWindow)
      && positiveInteger(row.maxOutputTokens)
      && Number(row.maxOutputTokens) > Number(row.contextWindow)
    ) {
      rowError.maxOutputTokens = t('settings.providers.page.custom.error.maxOutputExceedsContext');
    }

    if (row.thinkingMode && row.thinkingEfforts.length === 0) {
      rowError.thinkingEfforts = t('settings.providers.page.custom.omp.error.thinkingEffortsRequired');
    }
    if (row.thinkingEffortMapJson.trim()) {
      const parsed = parseJsonObjectText(row.thinkingEffortMapJson.trim());
      if (!parsed.ok) rowError.thinkingEffortMapJson = t('settings.providers.page.custom.omp.error.jsonObject');
    }

    const costValues = [row.costInput.trim(), row.costOutput.trim(), row.costCacheRead.trim(), row.costCacheWrite.trim()];
    const anyCost = costValues.some(Boolean);
    const allCost = costValues.every(Boolean);
    if (anyCost) {
      if (mode === 'definition' && !allCost) {
        rowError.cost = t('settings.providers.page.custom.omp.error.costIncomplete');
      } else if (costValues.some((value) => value !== '' && !nonNegativeNumber(value))) {
        rowError.cost = t('settings.providers.page.custom.omp.error.nonNegativeNumber');
      }
    }
    if (row.promptCacheShort.trim() && !nonNegativeNumber(row.promptCacheShort)) {
      rowError.promptCacheShort = t('settings.providers.page.custom.omp.error.nonNegativeNumber');
    }
    if (row.promptCacheLong.trim() && !nonNegativeNumber(row.promptCacheLong)) {
      rowError.promptCacheLong = t('settings.providers.page.custom.omp.error.nonNegativeNumber');
    }
    if (row.premiumMultiplier.trim() && !nonNegativeNumber(row.premiumMultiplier)) {
      rowError.premiumMultiplier = t('settings.providers.page.custom.omp.error.nonNegativeNumber');
    }
    if (row.imageCountBudget.trim() && !positiveInteger(row.imageCountBudget)) {
      rowError.imageCountBudget = t('settings.providers.page.custom.error.positiveInteger');
    }
    if (row.compatJson.trim() && !parseJsonObjectText(row.compatJson.trim()).ok) {
      rowError.compatJson = t('settings.providers.page.custom.omp.error.jsonObject');
    }
    if (row.remoteCompactionEndpoint.trim() && !isHttpEndpoint(row.remoteCompactionEndpoint.trim())) {
      rowError.remoteCompactionEndpoint = t('settings.providers.page.custom.omp.error.urlFormat');
    }
    if (row.remoteCompactionV2Endpoint.trim() && !isHttpEndpoint(row.remoteCompactionV2Endpoint.trim())) {
      rowError.remoteCompactionV2Endpoint = t('settings.providers.page.custom.omp.error.urlFormat');
    }
    if (row.remoteCompactionStreamingEndpoint.trim() && !isHttpEndpoint(row.remoteCompactionStreamingEndpoint.trim())) {
      rowError.remoteCompactionStreamingEndpoint = t('settings.providers.page.custom.omp.error.urlFormat');
    }
    const headerRowErrors = validateHeaderRows(row.headers, t);
    if (headerRowErrors.some((entry) => entry.name || entry.value)) {
      rowError.headers = headerRowErrors;
    }
    return rowError;
  });

  const seenModelIds = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const modelId = row.modelId.trim();
    if (!modelId) continue;
    if (seenModelIds.has(modelId)) errors[index]!.modelId = t('settings.providers.page.custom.error.duplicate');
    else seenModelIds.add(modelId);
  }
  return errors;
}

function modelErrorsClean(errors: readonly ModelFieldErrors[]): boolean {
  return errors.every((entry) => (
    !entry.modelId
    && !entry.name
    && !entry.baseUrl
    && !entry.contextWindow
    && !entry.maxContextWindow
    && !entry.maxOutputTokens
    && !entry.thinkingEfforts
    && !entry.thinkingEffortMapJson
    && !entry.cost
    && !entry.promptCacheShort
    && !entry.promptCacheLong
    && !entry.premiumMultiplier
    && !entry.imageCountBudget
    && !entry.compatJson
    && !entry.remoteCompactionEndpoint
    && !entry.remoteCompactionV2Endpoint
    && !entry.remoteCompactionStreamingEndpoint
    && (!entry.headers || entry.headers.every((h) => !h.name && !h.value))
  ));
}

/**
 * Field-level checks the editor can point at.
 */
export function validateCustomProviderForm(
  form: CustomProviderFormState,
  existingProviderIDs: ReadonlySet<string>,
  editing: boolean,
  t: CustomProviderTranslator,
): CustomProviderValidation {
  const fields: CustomProviderFieldErrors = {};
  const providerId = form.providerId.trim();
  const endpoint = form.endpoint.trim();

  if (!providerId) fields.providerId = t('settings.providers.page.custom.error.providerID.required');
  else if (!isValidProviderID(providerId)) fields.providerId = t('settings.providers.page.custom.error.providerID.format');
  else if (!editing && isProviderIDTaken(providerId, existingProviderIDs)) fields.providerId = t('settings.providers.page.custom.error.providerID.exists');

  if (!form.isBuiltIn && !form.hasNativeEntry && !form.name.trim()) {
    fields.name = t('settings.providers.page.custom.error.name.required');
  }

  const requiresBaseUrl = form.models.length > 0 || (!form.isBuiltIn && !form.hasNativeEntry);
  if (requiresBaseUrl && !endpoint) {
    fields.endpoint = t('settings.providers.page.custom.error.baseURL.required');
  } else if (endpoint && !isHttpEndpoint(endpoint)) {
    fields.endpoint = t('settings.providers.page.custom.error.baseURL.format');
  }

  if (form.discoveryEnabled && form.discoveryTimeoutMs.trim() && !positiveInteger(form.discoveryTimeoutMs)) {
    fields.discoveryTimeoutMs = t('settings.providers.page.custom.error.positiveInteger');
  }
  if (form.compatJson.trim() && !parseJsonObjectText(form.compatJson.trim()).ok) {
    fields.compatJson = t('settings.providers.page.custom.omp.error.jsonObject');
  }
  if (form.remoteCompactionEndpoint.trim() && !isHttpEndpoint(form.remoteCompactionEndpoint.trim())) {
    fields.remoteCompactionEndpoint = t('settings.providers.page.custom.omp.error.urlFormat');
  }
  if (form.remoteCompactionV2Endpoint.trim() && !isHttpEndpoint(form.remoteCompactionV2Endpoint.trim())) {
    fields.remoteCompactionV2Endpoint = t('settings.providers.page.custom.omp.error.urlFormat');
  }
  if (form.remoteCompactionStreamingEndpoint.trim() && !isHttpEndpoint(form.remoteCompactionStreamingEndpoint.trim())) {
    fields.remoteCompactionStreamingEndpoint = t('settings.providers.page.custom.omp.error.urlFormat');
  }

  const models = validateModelRowList(form.models, 'definition', t);
  const modelOverrides = validateModelRowList(form.modelOverrides, 'override', t);
  const headers = validateHeaderRows(form.headers, t, true);
  const requestMetadata = validateHeaderRows(form.requestMetadata, t, false);

  const valid = !fields.providerId
    && !fields.name
    && !fields.endpoint
    && !fields.discoveryTimeoutMs
    && !fields.compatJson
    && !fields.remoteCompactionEndpoint
    && !fields.remoteCompactionV2Endpoint
    && !fields.remoteCompactionStreamingEndpoint
    && modelErrorsClean(models)
    && modelErrorsClean(modelOverrides)
    && headers.every((row) => !row.name && !row.value)
    && requestMetadata.every((row) => !row.name && !row.value);

  return { fields, models, modelOverrides, headers, requestMetadata, valid };
}

function buildRemoteCompaction(fields: {
  enabled: TriState;
  api: '' | OmpProviderApi;
  endpoint: string;
  model: string;
  v2StreamingEnabled: TriState;
  v2Endpoint: string;
  streamingEndpoint: string;
}): OmpModelDefinitionWrite['remoteCompaction'] | undefined {
  const result: NonNullable<OmpModelDefinitionWrite['remoteCompaction']> = {};
  const enabled = fromTriStateOptional(fields.enabled);
  const v2Streaming = fromTriStateOptional(fields.v2StreamingEnabled);
  if (enabled !== undefined) result.enabled = enabled;
  if (fields.api) result.api = fields.api;
  if (fields.endpoint.trim()) result.endpoint = fields.endpoint.trim();
  if (fields.model.trim()) result.model = fields.model.trim();
  if (v2Streaming !== undefined) result.v2StreamingEnabled = v2Streaming;
  if (fields.v2Endpoint.trim()) result.v2Endpoint = fields.v2Endpoint.trim();
  if (fields.streamingEndpoint.trim()) result.streamingEndpoint = fields.streamingEndpoint.trim();
  return Object.keys(result).length > 0 ? result : undefined;
}

function buildThinkingConfig(row: ModelRow): OmpThinkingConfig | undefined {
  if (!row.thinkingMode) return undefined;
  const result: OmpThinkingConfig = {
    mode: row.thinkingMode,
    efforts: [...row.thinkingEfforts],
  };
  if (row.thinkingDefaultLevel) result.defaultLevel = row.thinkingDefaultLevel;
  const supportsDisplay = fromTriStateOptional(row.thinkingSupportsDisplay);
  if (supportsDisplay !== undefined) result.supportsDisplay = supportsDisplay;
  const requiresEffort = fromTriStateOptional(row.thinkingRequiresEffort);
  if (requiresEffort !== undefined) result.requiresEffort = requiresEffort;
  if (row.thinkingEffortMapJson.trim()) {
    const parsed = parseJsonObjectText(row.thinkingEffortMapJson.trim());
    if (!parsed.ok) throw new Error('Invalid thinking effortMap JSON');
    const effortMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.value)) {
      if (typeof v === 'string' && v.trim()) effortMap[k] = v.trim();
    }
    if (Object.keys(effortMap).length > 0) result.effortMap = effortMap;
  }
  return result;
}

function buildModelWriteBase(row: ModelRow, mode: 'definition' | 'override'): Omit<OmpModelOverrideWrite, 'cost'> {
  const common: Omit<OmpModelOverrideWrite, 'cost'> = {};
  if (row.name.trim()) common.name = row.name.trim();
  if (row.api) common.api = row.api;
  if (row.kind) common.kind = row.kind;
  if (row.reasoning !== undefined) common.reasoning = row.reasoning;
  const thinking = buildThinkingConfig(row);
  if (thinking) common.thinking = thinking;
  const normalizedModalities = normalizeModelModalities(row.nativeKind, row.modalities);
  const input = normalizedModalities.filter((entry): entry is 'text' | 'image' => entry === 'text' || entry === 'image');
  if (input.length > 0 && (mode === 'definition' || row.typed.has('modalities'))) {
    common.input = input;
  }
  if (row.imageInputDecoder) common.imageInputDecoder = row.imageInputDecoder;
  if (row.imageCountBudget.trim()) common.imageCountBudget = Number(row.imageCountBudget.trim());
  if (row.tokenizer) common.tokenizer = row.tokenizer;
  if (row.toolsSupported !== undefined) common.supportsTools = row.toolsSupported;

  if (row.promptCacheShort.trim() || row.promptCacheLong.trim()) {
    common.promptCache = {
      ...(row.promptCacheShort.trim() ? { short: Number(row.promptCacheShort.trim()) } : {}),
      ...(row.promptCacheLong.trim() ? { long: Number(row.promptCacheLong.trim()) } : {}),
    };
  }
  if (row.premiumMultiplier.trim()) common.premiumMultiplier = Number(row.premiumMultiplier.trim());
  if (row.contextWindow.trim()) common.contextWindow = Number(row.contextWindow.trim());
  if (row.maxContextWindow.trim()) common.maxContextWindow = Number(row.maxContextWindow.trim());
  if (row.maxOutputTokens.trim()) common.maxTokens = Number(row.maxOutputTokens.trim());
  const omitMax = fromTriStateOptional(row.omitMaxOutputTokens);
  if (omitMax !== undefined) common.omitMaxOutputTokens = omitMax;
  const preferWs = fromTriStateOptional(row.preferWebsockets);
  if (preferWs !== undefined) common.preferWebsockets = preferWs;

  if (row.compatJson.trim()) {
    const parsed = parseJsonObjectText(row.compatJson.trim());
    if (!parsed.ok) throw new Error('Invalid compat JSON');
    common.compat = parsed.value;
  }
  if (row.contextPromotionTarget.trim()) common.contextPromotionTarget = row.contextPromotionTarget.trim();
  if (row.compactionModel.trim()) common.compactionModel = row.compactionModel.trim();
  const remoteCompaction = buildRemoteCompaction({
    enabled: row.remoteCompactionEnabled,
    api: row.remoteCompactionApi,
    endpoint: row.remoteCompactionEndpoint,
    model: row.remoteCompactionModel,
    v2StreamingEnabled: row.remoteCompactionV2StreamingEnabled,
    v2Endpoint: row.remoteCompactionV2Endpoint,
    streamingEndpoint: row.remoteCompactionStreamingEndpoint,
  });
  if (remoteCompaction) common.remoteCompaction = remoteCompaction;

  const headerFields = buildHeadersPatch(row.headerNames, row.headers, row.headersPatchRemove, row.replaceHeaders);
  if (headerFields.headers !== undefined) common.headers = headerFields.headers;
  if (headerFields.headersPatch !== undefined) common.headersPatch = headerFields.headersPatch;

  return common;
}

function buildModelDefinitionWrite(row: ModelRow): OmpModelDefinitionWrite {
  const base = buildModelWriteBase(row, 'definition');
  const candidate: Record<string, unknown> = {
    id: row.modelId.trim(),
    ...base,
  };
  if (row.baseUrl.trim()) candidate.baseUrl = row.baseUrl.trim();
  const costInputs = [row.costInput.trim(), row.costOutput.trim(), row.costCacheRead.trim(), row.costCacheWrite.trim()];
  if (costInputs.some(Boolean)) {
    candidate.cost = {
      input: Number(row.costInput.trim()),
      output: Number(row.costOutput.trim()),
      cacheRead: Number(row.costCacheRead.trim()),
      cacheWrite: Number(row.costCacheWrite.trim()),
    };
  }
  return OmpModelDefinitionWriteSchema.parse(candidate);
}

function buildModelOverrideWrite(row: ModelRow): OmpModelOverrideWrite {
  const base = buildModelWriteBase(row, 'override');
  const candidate: Record<string, unknown> = { ...base };
  const cost: Record<string, number> = {};
  if (row.costInput.trim()) cost.input = Number(row.costInput.trim());
  if (row.costOutput.trim()) cost.output = Number(row.costOutput.trim());
  if (row.costCacheRead.trim()) cost.cacheRead = Number(row.costCacheRead.trim());
  if (row.costCacheWrite.trim()) cost.cacheWrite = Number(row.costCacheWrite.trim());
  if (Object.keys(cost).length > 0) candidate.cost = cost;
  return OmpModelOverrideWriteSchema.parse(candidate);
}

export function buildCustomProviderRequest(form: CustomProviderFormState, expectedRevision: string): CustomProviderPersistPlan {
  const providerId = form.providerId.trim();
  if (!isValidProviderID(providerId)) throw new Error('Invalid provider ID');

  const models = form.models.map(buildModelDefinitionWrite);
  if (new Set(models.map((model) => model.id)).size !== models.length) throw new Error('Duplicate model ID');

  const modelOverrides: Record<string, OmpModelOverrideWrite> = {};
  for (const row of form.modelOverrides) {
    const id = row.modelId.trim();
    if (!id || PROTOTYPE_KEY_HAZARDS.has(id)) throw new Error('Invalid override model ID');
    if (Object.hasOwn(modelOverrides, id)) throw new Error('Duplicate override model ID');
    modelOverrides[id] = buildModelOverrideWrite(row);
  }

  const endpoint = form.endpoint.trim();
  const nativeWrite: Record<string, unknown> = {
    providerId,
    models,
    modelOverrides,
  };

  if (form.name.trim()) nativeWrite.name = form.name.trim();
  if (endpoint) nativeWrite.baseUrl = endpoint;
  else if (form.isEdit) nativeWrite.baseUrl = null;

  if (form.api) nativeWrite.api = form.api;
  else if (form.isEdit) nativeWrite.api = null;

  if (form.auth) nativeWrite.auth = form.auth;
  else if (form.isEdit) nativeWrite.auth = null;

  const authHeader = fromTriState(form.authHeader, form.isEdit);
  if (authHeader !== undefined) nativeWrite.authHeader = authHeader;

  if (form.configApiKeyAction === 'clear') {
    nativeWrite.configApiKey = null;
  } else if (form.configApiKeyAction === 'set' && form.configApiKeyValue.trim()) {
    nativeWrite.configApiKey = form.configApiKeyValue.trim();
  }

  const headerFields = buildHeadersPatch(form.headerNames, form.headers, form.headersPatchRemove, form.replaceHeaders);
  if (headerFields.headers !== undefined) nativeWrite.headers = headerFields.headers;
  if (headerFields.headersPatch !== undefined) nativeWrite.headersPatch = headerFields.headersPatch;

  if (form.discoveryEnabled) {
    const discovery: Record<string, unknown> = { type: form.discoveryType };
    if (form.discoveryTimeoutMs.trim()) discovery.timeoutMs = Number(form.discoveryTimeoutMs.trim());
    if (form.discoveryType === 'openai-models-list') {
      const injectV1 = fromTriStateOptional(form.discoveryInjectV1);
      if (injectV1 !== undefined) discovery.injectV1 = injectV1;
    }
    if (form.discoveryType === 'openai-models-list' || form.discoveryType === 'lm-studio' || form.discoveryType === 'proxy') {
      const advertisedReasoning = fromTriStateOptional(form.discoveryAdvertisedReasoning);
      if (advertisedReasoning !== undefined) discovery.advertisedReasoning = advertisedReasoning;
    }
    nativeWrite.discovery = discovery;
  } else if (form.isEdit) {
    nativeWrite.discovery = null;
  }

  if (form.compatJson.trim()) {
    const parsed = parseJsonObjectText(form.compatJson.trim());
    if (!parsed.ok) throw new Error('Invalid compat JSON');
    nativeWrite.compat = parsed.value;
  } else if (form.isEdit) {
    nativeWrite.compat = null;
  }

  const disableStrictTools = fromTriState(form.disableStrictTools, form.isEdit);
  if (disableStrictTools !== undefined) nativeWrite.disableStrictTools = disableStrictTools;

  if (form.transportPiNative) nativeWrite.transport = 'pi-native';
  else if (form.isEdit) nativeWrite.transport = null;

  if (form.guardrailIdentifier.trim()) nativeWrite.guardrailIdentifier = form.guardrailIdentifier.trim();
  else if (form.isEdit) nativeWrite.guardrailIdentifier = null;

  if (form.guardrailVersion.trim()) nativeWrite.guardrailVersion = form.guardrailVersion.trim();
  else if (form.isEdit) nativeWrite.guardrailVersion = null;

  if (form.guardrailTrace) nativeWrite.guardrailTrace = form.guardrailTrace;
  else if (form.isEdit) nativeWrite.guardrailTrace = null;

  const metadataMap = collectHeaderMap(form.requestMetadata);
  if (Object.keys(metadataMap).length > 0) nativeWrite.requestMetadata = metadataMap;
  else if (form.isEdit) nativeWrite.requestMetadata = null;

  const remoteCompaction = buildRemoteCompaction({
    enabled: form.remoteCompactionEnabled,
    api: form.remoteCompactionApi,
    endpoint: form.remoteCompactionEndpoint,
    model: form.remoteCompactionModel,
    v2StreamingEnabled: form.remoteCompactionV2StreamingEnabled,
    v2Endpoint: form.remoteCompactionV2Endpoint,
    streamingEndpoint: form.remoteCompactionStreamingEndpoint,
  });
  if (remoteCompaction) nativeWrite.remoteCompaction = remoteCompaction;
  else if (form.isEdit) nativeWrite.remoteCompaction = null;

  const parsedNative = OmpProviderConfigWriteSchema.parse(nativeWrite);
  const providerName = form.name.trim() || providerId;
  const legacyProtocol = legacyProtocolForApi(form.api || form.effectiveApi);
  const configuration = !form.isBuiltIn && endpoint && legacyProtocol
    ? {
      providerId,
      name: providerName,
      endpoint,
      protocol: legacyProtocol,
      credentialRef: form.credentialRef,
    }
    : undefined;

  return {
    providerId,
    providerName,
    apiKey: form.apiKey,
    icon: form.icon,
    logo: logoPlanOf(form.logo),
    request: ProviderConfigureRequestSchema.parse({
      expectedRevision,
      ...(configuration ? { configuration } : {}),
      native: parsedNative,
    }),
  };
}

export function buildProviderDiscoveryRequest(form: CustomProviderFormState, editing: boolean): ProviderModelDiscoveryRequest {
  const endpoint = form.endpoint.trim() || form.effectiveBaseUrl.trim();
  const effectiveApi = form.api || form.effectiveApi;
  const legacyProtocol = legacyProtocolForApi(effectiveApi) ?? form.protocol;
  const nativeApi = OMP_PROVIDER_APIS.find((entry) => entry === effectiveApi);
  const headers = form.replaceHeaders
    ? providerHeaderWrite(form)
    : (() => {
      const map = collectHeaderMap(form.headers);
      return Object.keys(map).length > 0 ? map : undefined;
    })();
  const request: ProviderModelDiscoveryRequest = {
    endpoint,
    protocol: legacyProtocol,
    ...(nativeApi ? { nativeApi } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
  if (editing) request.providerId = form.providerId;
  if (form.apiKey) request.apiKey = form.apiKey;
  if (form.credentialRef) request.credentialRef = form.credentialRef;
  return ProviderModelDiscoveryRequestSchema.parse(request);
}

function logoPlanOf(logo: CustomProviderFormState['logo']): CustomProviderLogoPlan {
  if (logo === null) return { kind: 'keep' };
  if (logo === 'removed') return { kind: 'remove' };
  return { kind: 'upload', file: logo };
}

// ── Model info auto-fill and the discovery dialog ──────────────────────────

export type ModelCatalogAnswers = ReadonlyMap<string, ModelCatalogInfo>;

export function autoFillFields(row: ModelRow, catalog: ModelCatalogInfo): ModelAutoFillField[] {
  const fields: ModelAutoFillField[] = [];
  if (fillableLimit(row, 'contextWindow', String(catalog.contextWindow))) fields.push('contextWindow');
  if (fillableLimit(row, 'maxOutputTokens', String(catalog.maxTokens))) fields.push('maxOutputTokens');
  if (!row.typed.has('modalities')) {
    const next = catalogInputs(catalog.input);
    if (next.length > 0 && !sameModalities(next, row.modalities)) fields.push('modalities');
  }
  if (!row.typed.has('toolsSupported') && row.toolsSupported === undefined && catalog.toolsSupported !== undefined) fields.push('toolsSupported');
  if (!row.typed.has('reasoning') && row.reasoning === undefined) fields.push('reasoning');
  if (!row.typed.has('pricing') && !row.costInput.trim() && !row.costOutput.trim()) fields.push('pricing');
  if (!row.typed.has('thinking') && !row.thinkingMode && catalog.thinking !== undefined) fields.push('thinking');
  if (!row.typed.has('imageCountBudget') && !row.imageCountBudget.trim() && catalog.imageCountBudget !== undefined) fields.push('imageCountBudget');
  return fields;
}

const sameModalities = (left: readonly string[], right: readonly Model['modalities'][number][]): boolean =>
  left.length === right.length && left.every((value, index) => right[index] === value);

const fillableLimit = (row: ModelRow, field: 'contextWindow' | 'maxOutputTokens', value: string): boolean => {
  if (row.typed.has(field)) return false;
  const current = row[field].trim();
  if (!current) return true;
  return row.filledFrom[field] !== undefined && current !== value;
};

export function applyModelCatalogInfo(
  models: readonly ModelRow[],
  answers: ModelCatalogAnswers,
): { models: ModelRow[]; filled: number } {
  let filled = 0;
  const next = models.map((row) => {
    const catalog = answers.get(row.modelId.trim());
    if (!catalog) return row;
    const fields = autoFillFields(row, catalog);
    if (fields.length === 0) return row;
    filled += 1;
    const filledFrom = { ...row.filledFrom };
    const updated: ModelRow = { ...row, filledFrom };
    for (const field of fields) {
      filledFrom[field] = catalog.source;
      if (field === 'contextWindow') updated.contextWindow = String(catalog.contextWindow);
      else if (field === 'maxOutputTokens') updated.maxOutputTokens = String(catalog.maxTokens);
      else if (field === 'modalities') {
        const inputs = catalogInputs(catalog.input);
        const nativeKind = nativeKindOf(inputs);
        updated.nativeKind = nativeKind;
        updated.modalities = normalizeModelModalities(nativeKind, inputs);
      } else if (field === 'toolsSupported') updated.toolsSupported = catalog.toolsSupported;
      else if (field === 'reasoning') {
        updated.reasoning = catalog.reasoning;
        updated.reasoningEffortSupported = catalog.reasoning;
      } else if (field === 'pricing') {
        updated.costInput = String(catalog.cost.input);
        updated.costOutput = String(catalog.cost.output);
        updated.costCacheRead = String(catalog.cost.cacheRead);
        updated.costCacheWrite = String(catalog.cost.cacheWrite);
        updated.pricing = {
          inputPerMillionTokens: catalog.cost.input,
          outputPerMillionTokens: catalog.cost.output,
          cacheReadPerMillionTokens: catalog.cost.cacheRead,
          cacheWritePerMillionTokens: catalog.cost.cacheWrite,
        };
      } else if (field === 'thinking' && catalog.thinking) {
        updated.thinkingMode = catalog.thinking.mode;
        updated.thinkingEfforts = [...catalog.thinking.efforts];
        updated.thinkingDefaultLevel = catalog.thinking.defaultLevel ?? '';
        updated.thinkingSupportsDisplay = toTriState(catalog.thinking.supportsDisplay);
        updated.thinkingRequiresEffort = toTriState(catalog.thinking.requiresEffort);
        updated.thinkingEffortMapJson = catalog.thinking.effortMap ? JSON.stringify(catalog.thinking.effortMap, null, 2) : '';
      } else if (field === 'imageCountBudget' && catalog.imageCountBudget !== undefined) {
        updated.imageCountBudget = String(catalog.imageCountBudget);
      }
    }
    if (catalog.family !== undefined) updated.family = catalog.family;
    return updated;
  });
  return { models: next, filled };
}

export function idsMissingCatalog(
  models: readonly ModelRow[],
  catalogued: ModelCatalogAnswers,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (!modelId || seen.has(modelId) || catalogued.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export const AUTO_FILL_ENRICH_LIMIT = 500;
export const AUTO_FILL_OPENROUTER_LIMIT = 200;

export function autoFillIds(models: readonly ModelRow[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export type AutoFillNotice =
  | 'enterprise'
  | 'failed'
  | 'none'
  | 'nothing'
  | 'partial';

export function unresolvedAutoFillIds(ids: readonly string[], answers: ModelCatalogAnswers): string[] {
  const seen = new Set<string>();
  const unresolved: string[] = [];
  for (const id of ids) {
    const modelId = id.trim();
    if (!modelId || answers.has(modelId) || seen.has(modelId)) continue;
    seen.add(modelId);
    unresolved.push(modelId);
  }
  return unresolved;
}

const AUTO_FILL_NOTICE_ID_LIMIT = 10;

export function autoFillNoticeFor(input: {
  lookup: 'enterprise' | 'failed' | null;
  answered: number;
  filled: number;
  unresolved: readonly string[];
}): AutoFillNotice | null {
  if (input.lookup) return input.lookup;
  if (input.answered === 0) return 'none';
  if (input.unresolved.length > 0) return 'partial';
  if (input.filled === 0) return 'nothing';
  return null;
}

export function autoFillNoticeIds(ids: readonly string[]): { shown: string[]; hidden: number } {
  const shown = ids.slice(0, AUTO_FILL_NOTICE_ID_LIMIT);
  return { shown, hidden: Math.max(0, ids.length - shown.length) };
}

export function formatAutoFillNoticeModels(
  ids: readonly string[],
  more: (models: string, count: number) => string,
): string {
  const { shown, hidden } = autoFillNoticeIds(ids);
  const list = shown.join(', ');
  return hidden > 0 ? more(list, hidden) : list;
}

export function createDiscoveredModelRow(model: ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const row = createModelRow(model);
  if (!model.catalog) return row;
  return applyModelCatalogInfo([row], new Map([[row.modelId.trim(), model.catalog]])).models[0];
}

export function markModelFieldTyped(row: ModelRow, field: ModelAutoFillField): ModelRow {
  if (row.typed.has(field) && row.filledFrom[field] === undefined) return row;
  const { [field]: _retired, ...filledFrom } = row.filledFrom;
  return { ...row, typed: new Set([...row.typed, field]), filledFrom };
}

export function staleModelIds(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  const known = new Set(discovered.map((model) => model.modelId.trim()));
  return models
    .map((row) => row.modelId.trim())
    .filter((modelId) => modelId !== '' && !known.has(modelId));
}

export function idsToAdd(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  const existing = new Set(models.map((row) => row.modelId.trim()).filter(Boolean));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const model of discovered) {
    const modelId = model.modelId.trim();
    if (!modelId || existing.has(modelId) || seen.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export type DiscoveryFilter = 'all' | 'stale' | 'text' | 'image' | 'embedding' | 'audio';

export const discoveryFilterValues: readonly DiscoveryFilter[] = ['all', 'stale', 'text', 'image', 'embedding', 'audio'];

export interface DiscoveryRow {
  kind: 'discovered' | 'stale';
  modelId: string;
  name?: string;
  catalog?: ModelCatalogInfo;
  formRow?: ModelRow;
  family?: string;
}

export function discoveryRows(
  discovered: readonly ProviderModelDiscoveryResult['models'][number][],
  models: readonly ModelRow[],
): DiscoveryRow[] {
  const formById = new Map<string, ModelRow>();
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (modelId && !formById.has(modelId)) formById.set(modelId, row);
  }
  const discoveredIds = new Set(discovered.map((model) => model.modelId.trim()));
  const rows: DiscoveryRow[] = discovered.map((model) => {
    const modelId = model.modelId.trim();
    return {
      kind: 'discovered',
      modelId,
      name: model.name,
      catalog: model.catalog,
      formRow: formById.get(modelId),
      family: model.catalog?.family,
    };
  });
  for (const [modelId, formRow] of formById) {
    if (discoveredIds.has(modelId)) continue;
    rows.push({ kind: 'stale', modelId, name: formRow.name, formRow, family: formRow.family });
  }
  return rows;
}

export function matchesDiscoveryFilter(row: DiscoveryRow, filter: DiscoveryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'stale') return row.kind === 'stale';
  const inputs = row.catalog?.input ?? row.formRow?.modalities ?? ['text'];
  if (filter === 'text' || filter === 'image') return inputs.includes(filter);
  if (filter === 'embedding') return row.formRow?.nativeKind === 'embedding';
  return row.formRow?.nativeKind === 'tts' || row.formRow?.nativeKind === 'stt';
}

export function groupDiscoveryRows(rows: readonly DiscoveryRow[]): { grouped: boolean; groups: Array<{ family: string; rows: DiscoveryRow[] }> } {
  if (rows.length === 0 || rows.some((row) => !row.family)) return { grouped: false, groups: [] };
  const groups = new Map<string, DiscoveryRow[]>();
  for (const row of rows) {
    const family = row.family!;
    const bucket = groups.get(family);
    if (bucket) bucket.push(row);
    else groups.set(family, [row]);
  }
  return { grouped: true, groups: [...groups].map(([family, familyRows]) => ({ family, rows: familyRows })) };
}

export function discoveryFilterCounts(rows: readonly DiscoveryRow[]): Record<DiscoveryFilter, number> {
  const counts: Record<DiscoveryFilter, number> = { all: rows.length, stale: 0, text: 0, image: 0, embedding: 0, audio: 0 };
  for (const row of rows) {
    for (const filter of ['stale', 'text', 'image', 'embedding', 'audio'] as const) {
      if (matchesDiscoveryFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
