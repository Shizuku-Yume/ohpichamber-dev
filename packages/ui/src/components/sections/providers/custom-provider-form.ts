import {
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
  type OmpBedrockGuardrailTrace,
  type OmpConfigApiKeyStatus,
  type OmpDiscoveryType,
  type OmpProviderApi,
  type OmpProviderAuthMode,
  type ProviderConfigurationRead,
  type ProviderConfigureRequest,
} from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';
import {
  createHeaderRow,
  createModelRow,
  createModelRowFromNative,
  isHttpEndpoint,
  parseJsonObjectText,
  toTriState,
  type HeaderRow,
  type ModelRow,
  type TriState,
} from './custom-provider-model-rows';

export {
  OMP_BEDROCK_GUARDRAIL_TRACES,
  OMP_DISCOVERY_TYPES,
  OMP_PROVIDER_APIS,
  OMP_PROVIDER_AUTH_MODES,
};

export const CUSTOM_PROVIDER_ID = '__custom_provider__';
const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;

export type CustomProviderProtocol = (typeof CUSTOM_PROVIDER_PROTOCOLS)[number];
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
export const PROTOTYPE_KEY_HAZARDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

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
