import {
  OMP_PROVIDER_APIS,
  OmpModelDefinitionWriteSchema,
  OmpModelOverrideWriteSchema,
  OmpProviderConfigWriteSchema,
  ProviderConfigureRequestSchema,
  ProviderModelDiscoveryRequestSchema,
  type OmpModelDefinitionWrite,
  type OmpModelOverrideWrite,
  type OmpProviderApi,
  type OmpThinkingConfig,
  type ProviderModelDiscoveryRequest,
} from '@openchamber/agent-contract';
import {
  isValidProviderID,
  legacyProtocolForApi,
  PROTOTYPE_KEY_HAZARDS,
  type CustomProviderFormState,
  type CustomProviderLogoPlan,
  type CustomProviderPersistPlan,
} from './custom-provider-form';
import {
  buildHeadersPatch,
  collectHeaderMap,
  fromTriState,
  fromTriStateOptional,
  normalizeModelModalities,
  parseJsonObjectText,
  type ModelRow,
  type TriState,
} from './custom-provider-model-rows';

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

function logoPlanOf(logo: CustomProviderFormState['logo']): CustomProviderLogoPlan {
  if (logo === null) return { kind: 'keep' };
  if (logo === 'removed') return { kind: 'remove' };
  return { kind: 'upload', file: logo };
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

/** Omission preserves stored headers; an explicitly empty replacement removes them. */
export function providerHeaderWrite(form: CustomProviderFormState): Record<string, string> | undefined {
  if (!form.replaceHeaders) return undefined;
  return collectHeaderMap(form.headers);
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
