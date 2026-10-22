import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JSONC, YAML } from 'bun';
import { z } from 'zod';
import { oauthAccountKey, type AuthApiKeyOptions, type ResolvedApiKey } from '@oh-my-pi/pi-ai';
import { getModelPricingStatus } from '@oh-my-pi/pi-catalog';
import type { CreateAgentSessionOptions } from '@oh-my-pi/pi-coding-agent/sdk';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelsConfigFile, validateProviderConfiguration } from '@oh-my-pi/pi-coding-agent/config/models-config';
import { ModelsConfigSchema, type ModelsConfig } from '@oh-my-pi/pi-coding-agent/config/models-config-schema';
import { cfgDisabledProviders, cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { invalidateCommandConfig, resolveConfigHeaders, resolveConfigValue } from '@oh-my-pi/pi-coding-agent/config/resolve-config-value';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import {
  ModelSchema, ModelCatalogSchema, ModelConfigureRequestSchema, ModelDeleteRequestSchema,
  ModelMutationResultSchema, ModelSelectionSchema, ProviderSchema, ProviderCatalogSchema,
  ProviderConfigurationSchema, ProviderConfigureRequestSchema, ProviderDeleteRequestSchema,
  ProviderMutationResultSchema, PositiveCounterSchema, ProviderConfigurationReadSchema,
  ProviderModelDiscoveryRequestSchema, ProviderModelDiscoveryResultSchema,
  type ProviderConfigurationRead, type ProviderModelDiscoveryRequest, type ProviderModelDiscoveryResult,
  type Model, type ModelCatalog, type ModelConfigureRequest, type ModelDeleteRequest,
  type ModelMutationResult, type ModelSelection, type Provider, type ProviderCatalog,
  type ProviderConfigureRequest, type ProviderDeleteRequest, type ProviderMutationResult,
  type CompletionRequest,
} from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';

export type NativeCatalogModel = NonNullable<CreateAgentSessionOptions['model']>;
export type NativeReasoningEffort = NonNullable<NativeCatalogModel['thinking']>['efforts'][number];
export type ResolvedModelSelection = {
  nativeModel: NativeCatalogModel;
  publicModel: Model;
  reasoningEffort: NativeReasoningEffort | null;
  nativeCredentialSessionId?: string;
};
export type BoundProviderCredentialResolution =
  | { bound: false }
  | { bound: true; credential: ResolvedApiKey | undefined };
export type NativeModelsContext = {
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  settings: Settings;
  modelsPath: string;
  oauthProviderIds: () => ReadonlySet<string>;
  currentNativeSessionId: () => string;
};

// These are canonical records, stored alongside native models/overrides in the native file.
// OMP owns execution fields; application-only names, status and labels are not invented SDK fields.
const MetadataSchema = z.object({
  providers: z.record(z.string(), ProviderConfigurationSchema).default({}),
  models: z.record(z.string(), ModelSchema).default({}),
  defaultCredentials: z.record(z.string(), z.string().nullable()).default({}),
  providerHeaders: z.record(z.string(), z.record(z.string(), z.string())).default({}),
}).default({ providers: {}, models: {}, defaultCredentials: {}, providerHeaders: {} });
const FileMetadataSchema = z.object({ openchamber: MetadataSchema });
type CatalogMetadata = z.infer<typeof MetadataSchema>;
type ConfigState = { config: ModelsConfig; metadata: CatalogMetadata; path: string; content: string | null };
type ModelsConfigInput = typeof ModelsConfigSchema.inferIn;
type NativeProviderConfigInput = NonNullable<ModelsConfigInput['providers']>[string];
type NativeModelDefinitionInput = NonNullable<NativeProviderConfigInput['models']>[number];
type NativeThinkingEffortInput = NonNullable<NonNullable<NativeModelDefinitionInput['thinking']>['efforts']>[number];

function modelKey(selection: ModelSelection): string {
  return JSON.stringify([selection.providerId, selection.modelId]);
}

function enabledModelSelectors(selectors: ReadonlySet<string>): string[] {
  // [] means unrestricted to OMP. A nonmatching glob keeps an explicit empty allowlist
  // on the native selector path without its fuzzy/substring fallback.
  return selectors.size > 0 ? [...selectors] : ['__openchamber_no_enabled_models__/*'];
}

export function credentialReference(providerId: string, id: number): string {
  return `credential_${createHash('sha256').update(`${providerId}\0${id}`).digest('hex').slice(0, 24)}`;
}

function apiProtocol(api: NativeCatalogModel['api'] | undefined): Provider['protocol'] {
  switch (api) {
    case 'openai-completions': case 'openrouter': return 'chat-completions';
    case 'openai-responses': case 'openai-codex-responses': case 'azure-openai-responses': return 'responses';
    case 'anthropic-messages': case 'bedrock-converse-stream': return 'messages';
    case 'google-generative-ai': case 'google-gemini-cli': case 'google-vertex': return 'generate-content';
    default: return null;
  }
}

function nativeApi(protocol: NonNullable<Provider['protocol']>): NonNullable<NonNullable<ModelsConfig['providers']>[string]['api']> {
  switch (protocol) {
    case 'chat-completions': return 'openai-completions';
    case 'responses': return 'openai-responses';
    case 'messages': return 'anthropic-messages';
    case 'generate-content': return 'google-generative-ai';
  }
}

function nativeProviderApi(api: string): NonNullable<NativeProviderConfigInput['api']> {
  switch (api) {
    case 'openai-completions': case 'openai-responses': case 'openai-codex-responses':
    case 'azure-openai-responses': case 'anthropic-messages': case 'bedrock-converse-stream':
    case 'google-generative-ai': case 'google-gemini-cli': case 'google-vertex':
    case 'openrouter-decisions': case 'typesafe':
      return api;
    default:
      throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
  }
}

function nativeThinkingEffort(effort: string): NativeThinkingEffortInput {
  switch (effort) {
    case 'minimal': case 'low': case 'medium': case 'high': case 'xhigh': case 'max':
      return effort;
    default:
      throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
  }
}

export function publicModel(native: NativeCatalogModel, configured?: Model, enabled?: boolean): Model {
  if (native.contextWindow === null || native.maxTokens === null || native.contextWindow <= 0 || native.maxTokens <= 0) {
    throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Native model has no published usable token limits');
  }
  const modalities: Model['modalities'] = [...native.input];
  if (native.kind === 'tts' || native.kind === 'stt') modalities.push('audio');
  if (native.kind === 'embedding') modalities.push('embedding');
  const efforts = native.thinking?.efforts ?? [];
  const variants: Model['variants'] = [];
  for (const effort of efforts) {
    const route = native.thinking?.effortRouting?.[effort];
    if (route && !variants.some(variant => variant.variant === route)) {
      variants.push({ variant: route, label: route, reasoningEffort: effort });
    }
  }
  const offRoute = native.thinking?.effortRouting?.off;
  if (offRoute && !variants.some(variant => variant.variant === offRoute)) variants.push({ variant: offRoute, label: offRoute, reasoningEffort: null });
  const cost = native.cost;
  const pricingStatus = getModelPricingStatus(native);
  const hasPublishedRates = cost.input >= 0 && cost.output >= 0 && cost.cacheRead >= 0 && cost.cacheWrite >= 0
    && (pricingStatus === 'fixed' || pricingStatus === 'free');
  const candidate: Model = {
    modelId: native.id, provider: native.provider, name: configured?.name ?? native.name,
    modalities: [...new Set(modalities)], contextWindow: native.contextWindow,
    maxOutputTokens: Math.min(native.contextWindow, native.maxTokens),
    reasoningEffortSupported: native.reasoning || efforts.length > 0,
    reasoningOptions: configured?.reasoningOptions ?? efforts.map(reasoningEffort => ({
      reasoningEffort, label: reasoningEffort, budgetTokens: native.thinking?.effortBudgets?.[reasoningEffort] ?? null,
    })),
    variants: configured?.variants ?? variants,
    pricing: configured ? configured.pricing : hasPublishedRates ? {
      inputPerMillionTokens: cost.input, outputPerMillionTokens: cost.output,
      cacheReadPerMillionTokens: cost.cacheRead, cacheWritePerMillionTokens: cost.cacheWrite,
    } : null,
  };
  if (native.supportsTools !== undefined) candidate.toolsSupported = native.supportsTools;
  if (enabled !== undefined) candidate.enabled = enabled;
  if (configured?.status) candidate.status = configured.status;
  else if (native.isBeta) candidate.status = 'beta';
  return ModelSchema.parse(candidate);
}

function resolveModelSelection(registry: ModelRegistry, input: ModelSelection, configured?: Model,
  controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): ResolvedModelSelection {
  const selection = ModelSelectionSchema.parse(input);
  const original = registry.find(selection.providerId, selection.modelId);
  if (!original || configured?.enabled === false) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model is unavailable');
  let nativeModel = original;
  if (configured && original.thinking) {
    const effortBudgets = { ...original.thinking.effortBudgets };
    const effortRouting = { ...original.thinking.effortRouting };
    for (const effort of original.thinking.efforts) {
      const option = configured.reasoningOptions.find(option => option.reasoningEffort === effort);
      if (option?.budgetTokens !== null && option?.budgetTokens !== undefined) effortBudgets[effort] = option.budgetTokens;
      const variant = configured.variants.find(variant => variant.reasoningEffort === effort);
      if (variant) effortRouting[effort] = variant.variant;
    }
    const off = configured.variants.find(variant => variant.reasoningEffort === null);
    if (off) effortRouting.off = off.variant;
    nativeModel = { ...original, thinking: { ...original.thinking, effortBudgets, effortRouting } };
  }
  const projected = publicModel(nativeModel, configured);
  const variant = controls?.variant == null ? undefined : projected.variants.find(item => item.variant === controls.variant);
  if (controls?.variant != null && !variant) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected model variant is unavailable');
  if (variant && controls?.reasoningEffort != null && variant.reasoningEffort !== controls.reasoningEffort) {
    throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected model variant conflicts with the reasoning effort');
  }
  const requestedEffort = controls?.reasoningEffort ?? variant?.reasoningEffort ?? null;
  const reasoningEffort = requestedEffort === null ? null : nativeModel.thinking?.efforts.find(effort => effort === requestedEffort);
  if (requestedEffort !== null && (reasoningEffort === undefined || !projected.reasoningOptions.some(option => option.reasoningEffort === requestedEffort))) {
    throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected reasoning effort is unavailable');
  }
  if (variant) {
    nativeModel = nativeModel.thinking
      ? { ...nativeModel, requestModelId: variant.variant,
        thinking: { ...nativeModel.thinking,
          effortRouting: { ...nativeModel.thinking.effortRouting, [reasoningEffort ?? 'off']: variant.variant } } }
      : { ...nativeModel, requestModelId: variant.variant };
  }
  return { nativeModel, publicModel: projected, reasoningEffort: reasoningEffort ?? null };
}

export class NativeModels {
  private metadata: CatalogMetadata = MetadataSchema.parse({});
  constructor(private readonly context: NativeModelsContext) {
    if (context.modelRegistry.authStorage !== context.authStorage) throw new Error('Catalog registry and credential storage must share ownership');
  }

  private async load(): Promise<ConfigState> {
    try { await this.context.settings.reloadFromDisk(); }
    catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native settings could not be read'); }
    const file = ModelsConfigFile.relocate(this.context.modelsPath);
    file.invalidate();
    const loaded = file.tryLoad();
    if (loaded.status === 'error') throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native model configuration could not be read');
    let content: string | null = null;
    let metadata: CatalogMetadata = MetadataSchema.parse({});
    if (loaded.status === 'ok') {
      try {
        content = await readFile(file.path(), 'utf8');
        metadata = FileMetadataSchema.parse(file.path().endsWith('.json') || file.path().endsWith('.jsonc') ? JSONC.parse(content) : YAML.parse(content)).openchamber;
      } catch {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native catalog metadata could not be read');
      }
    }
    this.metadata = metadata;
    return { config: loaded.status === 'ok' ? structuredClone(loaded.value) : {}, metadata: structuredClone(metadata), path: file.path(), content };
  }

  async readModels(workspaceId: string, revision: string): Promise<ModelCatalog> {
    await this.load();
    await this.context.modelRegistry.reapplyModelPolicies();
    // A model is listed only when its provider can execute: configured
    // models.yml entries (including keyless endpoints), stored/environment/
    // oauth credentials, or native keyless local providers. The full bundled
    // registry stays the source for ProviderCatalog, so Settings still offers
    // every connectable provider.
    const all = this.context.modelRegistry.getAvailable('all');
    const allowed = new Set(filterAvailableModelsByEnabledPatterns(all, cfgEnabledModels.get(this.context.settings), this.context.settings).map(model => modelKey({ providerId: model.provider, modelId: model.id })));
    const disabledProviders = new Set(cfgDisabledProviders.get(this.context.settings));
    const models = all.filter(model => model.contextWindow !== null && model.maxTokens !== null && model.contextWindow > 0 && model.maxTokens > 0)
      .map(model => {
        const key = modelKey({ providerId: model.provider, modelId: model.id });
        return publicModel(model, this.metadata.models[key], !disabledProviders.has(model.provider) && allowed.has(key) && this.metadata.models[key]?.enabled !== false);
      });
    return ModelCatalogSchema.parse({ workspaceId, revision, models });
  }

  async readProviders(workspaceId: string, revision: string): Promise<ProviderCatalog> {
    const state = await this.load();
    await this.context.authStorage.credentials.reload();
    await this.context.modelRegistry.reapplyModelPolicies();
    const ids = new Set([
      ...this.context.modelRegistry.getAll('all').map(model => model.provider),
      ...Object.keys(state.config.providers ?? {}), ...Object.keys(state.metadata.providers),
      ...this.context.authStorage.credentials.list().map(row => row.provider),
      ...this.context.oauthProviderIds(),
    ]);
    return ProviderCatalogSchema.parse({ workspaceId, revision, providers: [...ids].map(id => this.provider(id)) });
  }

  async supportsSelectedFileHandoff(providerId: string): Promise<boolean> {
    const state = await this.load();
    const configured = state.metadata.providers[providerId];
    return configured !== undefined && configured.protocol === 'chat-completions'
      && state.config.providers?.[providerId] !== undefined;
  }

  async readProviderConfiguration(providerId: string, revision: string): Promise<ProviderConfigurationRead> {
    const state = await this.load();
    await this.context.modelRegistry.reapplyModelPolicies();
    const provider = this.provider(providerId);
    const configuration = state.metadata.providers[providerId] ?? {
      providerId, name: provider.name, endpoint: provider.endpoint, protocol: provider.protocol,
      credentialRef: this.defaultCredentialRef(providerId),
    };
    if (!configuration.endpoint || !configuration.protocol) {
      throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Provider has no configurable endpoint and protocol');
    }
    return ProviderConfigurationReadSchema.parse({ revision, configuration,
      headerNames: [...new Set([...Object.keys(state.config.providers?.[providerId]?.headers ?? {}),
        ...Object.keys(state.metadata.providerHeaders[providerId] ?? {})])],
      models: this.context.modelRegistry.getProviderModels(providerId)
        .filter(model => model.contextWindow !== null && model.contextWindow > 0 && model.maxTokens !== null && model.maxTokens > 0)
        .map(model => publicModel(model, state.metadata.models[modelKey({ providerId, modelId: model.id })])),
    });
  }

  async discoverProviderModels(input: ProviderModelDiscoveryRequest): Promise<ProviderModelDiscoveryResult> {
    const request = ProviderModelDiscoveryRequestSchema.parse(input);
    try {
      const state = await this.load();
      await this.context.authStorage.credentials.reload();
      const configured = request.providerId ? state.metadata.providers[request.providerId] : undefined;
      const matchesConfigured = configured?.endpoint === request.endpoint && configured.protocol === request.protocol;
      const headers = new Headers(matchesConfigured ? {
        ...await resolveConfigHeaders(state.config.providers?.[configured.providerId]?.headers),
        ...state.metadata.providerHeaders[configured.providerId],
      } : undefined);
      for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value);
      let apiKey = request.apiKey;
      const source = request.providerId ? this.context.authStorage.keys.source(request.providerId) : undefined;
      const storedSource = !source || source.kind === 'api_key' || source.kind === 'oauth';
      const reference = request.credentialRef ?? (matchesConfigured && storedSource ? this.defaultCredentialRef(configured.providerId) : null);
      if (!apiKey && reference) {
        if (!request.providerId) throw new ProjectionError(422, 'INVALID_REQUEST', 'Credential discovery requires a provider identity');
        const credential = await this.resolveBoundCredential(request.providerId, reference, undefined);
        if (!credential) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider credential is unavailable');
        apiKey = credential.apiKey;
      }
      if (!apiKey && !reference && matchesConfigured) {
        apiKey = await this.context.authStorage.keys.get(configured.providerId, undefined, { baseUrl: request.endpoint });
      }
      if (apiKey) {
        const name = request.protocol === 'messages' ? 'x-api-key' : request.protocol === 'generate-content' ? 'x-goog-api-key' : 'authorization';
        if (!headers.has(name)) headers.set(name, name === 'authorization' ? `Bearer ${apiKey}` : apiKey);
      }
      if (request.protocol === 'messages' && !headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01');
      const url = new URL(`${request.endpoint.replace(/\/+$/, '')}/models`);
      const models: ProviderModelDiscoveryResult['models'] = [];
      const seen = new Set<string>();
      const pages = new Set<string>();
      const signal = AbortSignal.timeout(15_000);
      while (true) {
        if (pages.has(url.href)) throw new Error('Invalid discovery pagination');
        pages.add(url.href);
        const response = await fetch(url, { headers, signal, redirect: 'error' });
        if (!response.ok) throw new Error('Discovery request failed');
        const payload = z.object({ data: z.array(z.unknown()).optional(), models: z.array(z.unknown()).optional(),
          nextPageToken: z.string().optional(), has_more: z.boolean().optional(), last_id: z.string().optional() }).parse(await response.json());
        const rows = request.protocol === 'generate-content' ? payload.models : payload.data;
        if (!rows) throw new Error('Invalid model listing');
        for (const entry of rows) {
          const row = z.object({ id: z.string().optional(), name: z.string().optional(), display_name: z.string().optional(),
            displayName: z.string().optional(), context_window: z.number().int().positive().optional(),
            max_output_tokens: z.number().int().positive().optional(), inputTokenLimit: z.number().int().positive().optional(),
            outputTokenLimit: z.number().int().positive().optional() }).parse(entry);
          const modelId = request.protocol === 'generate-content' ? row.name?.replace(/^models\//, '') : row.id;
          if (!modelId) throw new Error('Invalid model identity');
          if (seen.has(modelId)) continue;
          seen.add(modelId);
          const contextWindow = row.inputTokenLimit ?? row.context_window;
          const maxOutputTokens = row.outputTokenLimit ?? row.max_output_tokens;
          const discoveredModel: ProviderModelDiscoveryResult['models'][number] = { modelId,
            name: row.displayName ?? row.display_name ?? row.name ?? modelId };
          if (contextWindow) discoveredModel.contextWindow = contextWindow;
          if (maxOutputTokens) discoveredModel.maxOutputTokens = maxOutputTokens;
          models.push(discoveredModel);
        }
        if (request.protocol === 'generate-content' && payload.nextPageToken) url.searchParams.set('pageToken', payload.nextPageToken);
        else if (request.protocol === 'messages' && payload.has_more) {
          if (!payload.last_id) throw new Error('Invalid discovery pagination');
          url.searchParams.set('after_id', payload.last_id);
        } else break;
      }
      return ProviderModelDiscoveryResultSchema.parse({ models });
    } catch (error) {
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Provider model discovery failed');
    }
  }

  defaultCredentialRef(providerId: string): string | null {
    return this.metadata.defaultCredentials[providerId] ?? this.metadata.providers[providerId]?.credentialRef ?? null;
  }

  async selectCredential(providerId: string, credentialRef: string | null, revision: string): Promise<ProviderMutationResult> {
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    await this.context.authStorage.credentials.reload();
    if (credentialRef !== null && !this.context.authStorage.credentials.list(providerId)
      .some(row => row.disabledCause === null && credentialReference(providerId, row.id) === credentialRef)) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider credential reference is not available');
    }
    state.metadata.defaultCredentials[providerId] = credentialRef;
    const configured = state.metadata.providers[providerId];
    if (configured) configured.credentialRef = credentialRef;
    return ProviderMutationResultSchema.parse(await this.commit(state, () => {},
      () => ({ revision, providerId, provider: this.provider(providerId) })));
  }

  provider(providerId: string): Provider {
    const reference = this.defaultCredentialRef(providerId);
    const configured = this.metadata.providers[providerId];
    const first = this.context.modelRegistry.getProviderModels(providerId)[0];
    const rawEndpoint = configured?.endpoint ?? this.context.modelRegistry.getProviderBaseUrl(providerId) ?? null;
    const source = this.context.authStorage.keys.source(providerId);
    const rows = this.context.authStorage.credentials.list(providerId).filter(row => row.disabledCause === null);
    const supportedOAuth = this.context.oauthProviderIds().has(providerId) || rows.some(row => row.credential.type === 'oauth');
    const authMethods: Provider['authMethods'] = supportedOAuth ? ['api-key', 'oauth'] : ['api-key'];
    let auth: Provider['auth'] = { status: 'missing' };
    if (reference && (!source || source.kind === 'api_key' || source.kind === 'oauth')) {
      const selected = rows.find(row => credentialReference(providerId, row.id) === reference);
      if (selected) {
        auth = {
          status: 'configured',
          method: selected.credential.type === 'oauth' ? 'oauth' : 'api-key',
          credentialRef: reference,
          source: 'stored-credential',
        };
      }
    } else if (source) {
      const method = source.kind === 'oauth' ? 'oauth' : 'api-key';
      const selected = rows.find(row => method === 'oauth' ? row.credential.type === 'oauth' : row.credential.type === 'api_key');
      const storedSource = source.kind === 'oauth' || source.kind === 'api_key';
      auth = {
        status: 'configured', method,
        credentialRef: storedSource && selected ? credentialReference(providerId, selected.id)
          : `credential_${createHash('sha256').update(`${providerId}\0${source.kind}`).digest('hex').slice(0, 24)}`,
        source: storedSource ? 'stored-credential' : source.kind === 'env' ? 'external-environment' : 'managed-environment',
      };
    }
    const base = {
      providerId, name: configured?.name ?? providerId,
      protocol: configured?.protocol ?? apiProtocol(first?.api), authMethods, auth,
    };
    const withEndpoint = ProviderSchema.safeParse({ ...base, endpoint: rawEndpoint });
    return withEndpoint.success ? withEndpoint.data : ProviderSchema.parse({ ...base, endpoint: null });
  }

  private async resolveBoundCredential(
    providerId: string,
    reference: string,
    sessionId: string | undefined,
    options?: AuthApiKeyOptions,
  ): Promise<ResolvedApiKey | undefined> {
    if (options?.signal?.aborted) return undefined;
    if (cfgDisabledProviders.get(this.context.settings).includes(providerId)) return undefined;
    const row = this.context.authStorage.credentials.list(providerId)
      .find(candidate => candidate.disabledCause === null
        && credentialReference(providerId, candidate.id) === reference);
    if (!row) return undefined;
    if (row.credential.type === 'api_key') {
      if (options?.forceRefresh) invalidateCommandConfig(row.credential.key);
      const apiKey = await resolveConfigValue(row.credential.key);
      if (!apiKey || options?.signal?.aborted) return undefined;
      return { apiKey, credentialId: row.id };
    }
    const accountAccess = options?.accountIds
      ? undefined
      : options?.modelId ? this.context.modelRegistry.find(providerId, options.modelId)?.accountAccess : undefined;
    const accountIds = options?.accountIds ?? (accountAccess ? Object.keys(accountAccess) : undefined);
    const accountKey = oauthAccountKey(row.credential);
    if (accountIds && accountIds.length > 0 && (accountKey === undefined || !accountIds.includes(accountKey))) {
      return undefined;
    }
    const targetSessionId = sessionId ?? this.context.currentNativeSessionId();
    if (targetSessionId && !this.context.authStorage.sessions.pin(providerId, targetSessionId, row.id)) {
      return undefined;
    }
    const accessOptions: AuthApiKeyOptions = {
      baseUrl: options?.baseUrl,
      modelId: options?.modelId,
      forceRefresh: options?.forceRefresh,
      refreshReason: options?.refreshReason,
      signal: options?.signal,
    };
    if (accountIds) accessOptions.accountIds = accountIds;
    const access = await this.context.authStorage.oauth.accessById(providerId, row.id, accessOptions);
    if (!access?.ok) return undefined;
    return {
      apiKey: access.accessToken,
      credentialId: access.credentialId ?? row.id,
      oauthIdentity: {
        orgId: access.orgId,
        region: access.region,
        inferenceRegion: access.inferenceRegion,
      },
    };
  }

  async resolveProviderCredential(
    providerId: string,
    sessionId: string | undefined,
    options?: AuthApiKeyOptions,
  ): Promise<BoundProviderCredentialResolution> {
    await this.load();
    await this.context.authStorage.credentials.reload();
    const source = this.context.authStorage.keys.source(providerId);
    if (source && source.kind !== 'api_key' && source.kind !== 'oauth') return { bound: false };
    const reference = this.defaultCredentialRef(providerId);
    if (!reference) return { bound: false };
    return {
      bound: true,
      credential: await this.resolveBoundCredential(providerId, reference, sessionId, options),
    };
  }

  async selection(input: ModelSelection, controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): Promise<ResolvedModelSelection> {
    await this.load();
    await this.context.modelRegistry.reapplyModelPolicies();
    await this.context.authStorage.credentials.reload();
    if (cfgDisabledProviders.get(this.context.settings).includes(input.providerId)) {
      throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider is disabled');
    }
    const enabled = filterAvailableModelsByEnabledPatterns(this.context.modelRegistry.getAll('all'), cfgEnabledModels.get(this.context.settings), this.context.settings);
    if (!enabled.some(model => model.provider === input.providerId && model.id === input.modelId)) {
      throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model is disabled or unavailable');
    }
    const nativeCredentialSessionId = this.context.currentNativeSessionId();
    const source = this.context.authStorage.keys.source(input.providerId);
    const reference = source && source.kind !== 'api_key' && source.kind !== 'oauth'
      ? null : this.defaultCredentialRef(input.providerId);
    if (reference) {
      const resolved = await this.resolveBoundCredential(input.providerId, reference, nativeCredentialSessionId, { modelId: input.modelId });
      if (!resolved) {
        throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider credential is unavailable');
      }
    }
    const configured = this.metadata.models[modelKey(input)];
    const resolved = resolveModelSelection(this.context.modelRegistry, input, configured, controls);
    const headers = this.metadata.providerHeaders[input.providerId];
    if (headers && Object.keys(headers).length > 0) {
      const model = resolved.nativeModel;
      resolved.nativeModel = { ...model, headers: undefined,
        resolveHeaders: async signal => ({ ...(model.resolveHeaders ? await model.resolveHeaders(signal) : model.headers), ...headers }) };
    }
    return { ...resolved, nativeCredentialSessionId };
  }

  private validate(config: ModelsConfigInput): ModelsConfig {
    try {
      const parsed = ModelsConfigSchema.assert(config);
      for (const [providerId, provider] of Object.entries(parsed.providers ?? {})) {
        validateProviderConfiguration(providerId, { ...provider, models: provider.models ?? [] }, 'models-config');
      }
      return parsed;
    } catch {
      throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
    }
  }

  private async write(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const staged = `${path}.${randomUUID()}.tmp`;
    try {
      const file = await open(staged, 'wx', 0o600);
      try { await file.writeFile(content, 'utf8'); await file.sync(); } finally { await file.close(); }
      await replaceFileAtomically(staged, path);
    } finally { await rm(staged, { force: true }); }
  }

  private async commit(state: ConfigState, project: () => void, result: () => ModelMutationResult | ProviderMutationResult) {
    const config = this.validate(state.config);
    const oldMetadata = this.metadata;
    const oldEnabled = [...cfgEnabledModels.get(this.context.settings)];
    const oldDisabled = [...cfgDisabledProviders.get(this.context.settings)];
    const content = state.path.endsWith('.json') || state.path.endsWith('.jsonc')
      ? JSON.stringify({ ...config, openchamber: state.metadata }, null, 2) : YAML.stringify({ ...config, openchamber: state.metadata });
    let published = false;
    try {
      await this.write(state.path, content);
      published = true;
      project();
      await this.context.settings.flush();
      await this.context.modelRegistry.reapplyModelPolicies();
      this.metadata = state.metadata;
      return result();
    } catch (error) {
      if (published) {
        try {
          if (state.content === null) await rm(state.path, { force: true }); else await this.write(state.path, state.content);
          cfgEnabledModels.set(this.context.settings, oldEnabled);
          cfgDisabledProviders.set(this.context.settings, oldDisabled);
          await this.context.settings.flush();
          await this.context.modelRegistry.reapplyModelPolicies();
          this.metadata = oldMetadata;
        } catch {
          throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native catalog mutation failed and previous configuration could not be restored');
        }
      }
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native catalog configuration could not be committed');
    }
  }

  async configureProvider(input: ProviderConfigureRequest, revision: string): Promise<ProviderMutationResult> {
    const request = ProviderConfigureRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    await this.context.authStorage.credentials.reload();
    await this.context.modelRegistry.reapplyModelPolicies();
    const configuration = request.configuration;
    if (configuration.credentialRef !== null && !this.context.authStorage.credentials.list(configuration.providerId)
      .some(row => credentialReference(configuration.providerId, row.id) === configuration.credentialRef && row.disabledCause === null)) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider credential reference is not available');
    }
    state.config.providers ??= {};
    const previousProvider = state.config.providers[configuration.providerId];
    const previousApi = previousProvider?.api ?? (state.metadata.providers[configuration.providerId]
      ? nativeApi(state.metadata.providers[configuration.providerId].protocol) : undefined);
    if (previousApi !== nativeApi(configuration.protocol)) {
      for (const model of previousProvider?.models ?? []) {
        const key = modelKey({ providerId: configuration.providerId, modelId: model.id });
        // Older canonical writes copied the provider API onto chat models. External
        // definitions and differing explicit transports remain native-owned overrides.
        if (state.metadata.models[key] && (model.kind === undefined || model.kind === 'chat') && model.api === previousApi) {
          delete model.api;
        }
      }
    }
    state.config.providers[configuration.providerId] = {
      ...state.config.providers[configuration.providerId], baseUrl: configuration.endpoint, api: nativeApi(configuration.protocol),
    };
    state.metadata.providers[configuration.providerId] = configuration;
    state.metadata.defaultCredentials[configuration.providerId] = configuration.credentialRef;
    if (request.headers !== undefined) {
      delete state.config.providers[configuration.providerId].headers;
      state.metadata.providerHeaders[configuration.providerId] = request.headers;
    }
    const allowed = filterAvailableModelsByEnabledPatterns(this.context.modelRegistry.getAll('all'),
      cfgEnabledModels.get(this.context.settings), this.context.settings);
    if (request.models !== undefined) {
      if (request.models.some(model => model.provider !== configuration.providerId)
        || new Set(request.models.map(model => model.modelId)).size !== request.models.length) {
        throw new ProjectionError(422, 'INVALID_REQUEST', 'Configured models must have unique identities within this provider');
      }
      state.config.providers[configuration.providerId].models = [];
      for (const [key, model] of Object.entries(state.metadata.models)) {
        if (model.provider === configuration.providerId) delete state.metadata.models[key];
      }
      for (const model of request.models) this.stageModel(state, model);
    }
    return ProviderMutationResultSchema.parse(await this.commit(state, () => {
      cfgDisabledProviders.set(this.context.settings, cfgDisabledProviders.get(this.context.settings).filter(id => id !== configuration.providerId));
      if (request.models?.some(model => model.enabled !== undefined)) {
        const selectors = new Set(allowed.filter(row => row.provider !== configuration.providerId).map(row => `${row.provider}/${row.id}`));
        for (const model of request.models) {
          if (model.enabled !== false) selectors.add(`${model.provider}/${model.modelId}`);
        }
        cfgEnabledModels.set(this.context.settings, enabledModelSelectors(selectors));
      }
    }, () => ProviderMutationResultSchema.parse({ revision, providerId: configuration.providerId, provider: this.provider(configuration.providerId) })));
  }

  async deleteProvider(input: ProviderDeleteRequest, revision: string): Promise<ProviderMutationResult> {
    const request = ProviderDeleteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    if (state.config.providers) delete state.config.providers[request.providerId];
    delete state.metadata.providers[request.providerId];
    delete state.metadata.defaultCredentials[request.providerId];
    delete state.metadata.providerHeaders[request.providerId];
    for (const [key, model] of Object.entries(state.metadata.models)) if (model.provider === request.providerId) delete state.metadata.models[key];
    return ProviderMutationResultSchema.parse(await this.commit(state, () => {
      cfgDisabledProviders.set(this.context.settings, [...new Set([...cfgDisabledProviders.get(this.context.settings), request.providerId])]);
    }, () => ProviderMutationResultSchema.parse({ revision, providerId: request.providerId, provider: null })));
  }

  private stageModel(state: ConfigState, model: Model): void {
    const existing = this.context.modelRegistry.find(model.provider, model.modelId);
    const providerBase = this.context.modelRegistry.getProviderBaseUrl(model.provider);
    const configuredProvider = state.config.providers?.[model.provider];
    const api = configuredProvider?.api ?? existing?.api;
    const baseUrl = configuredProvider?.baseUrl ?? providerBase;
    if (!api || !baseUrl) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Configure the native provider before configuring this model');
    if (model.modalities.some(modality => modality === 'audio' && existing?.kind !== 'tts' && existing?.kind !== 'stt'
      || modality === 'embedding' && existing?.kind !== 'embedding')) {
      throw new ProjectionError(422, 'INVALID_REQUEST', 'Requested modalities do not match the native provider runner');
    }
    const nativeInput = model.modalities.filter((modality): modality is 'text' | 'image' => modality === 'text' || modality === 'image');
    if (nativeInput.length === 0) throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model requires a supported input modality');
    const reasoning: NativeModelDefinitionInput['thinking'] = model.reasoningOptions.length > 0
      ? { mode: existing?.thinking?.mode ?? 'effort', efforts: model.reasoningOptions.map(option => nativeThinkingEffort(option.reasoningEffort)) }
      : undefined;
    const cost = model.pricing === null ? existing?.cost : {
      input: model.pricing.inputPerMillionTokens, output: model.pricing.outputPerMillionTokens,
      cacheRead: model.pricing.cacheReadPerMillionTokens ?? 0, cacheWrite: model.pricing.cacheWritePerMillionTokens ?? 0,
    };
    state.config.providers ??= {};
    const provider: NativeProviderConfigInput = { ...configuredProvider, api: nativeProviderApi(api), baseUrl };
    const raw: NativeModelDefinitionInput = {
      id: model.modelId, name: model.name,
      input: nativeInput, reasoning: model.reasoningEffortSupported,
      contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens,
    };
    const previousDefinition = configuredProvider?.models?.find(row => row.id === model.modelId);
    const previouslyGenerated = state.metadata.models[modelKey({ providerId: model.provider, modelId: model.modelId })]
      && (previousDefinition?.kind === undefined || previousDefinition.kind === 'chat') && previousDefinition?.api === configuredProvider?.api;
    if (previousDefinition?.api && !previouslyGenerated) raw.api = previousDefinition.api;
    else if (existing?.kind && existing.kind !== 'chat') raw.api = existing.api;
    if (existing?.kind) {
      if (existing.kind === 'search') {
        throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
      }
      raw.kind = existing.kind;
    }
    if (reasoning) raw.thinking = reasoning;
    if (cost) raw.cost = cost;
    if (model.toolsSupported !== undefined) raw.supportsTools = model.toolsSupported;
    // Native 'none' is a keyless fallback, not a credential override: stored/env auth still wins.
    // It permits custom definitions without copying AuthStorage's secrets into models.yml.
    state.config = this.validate({ ...state.config, providers: {
      ...state.config.providers,
      [model.provider]: { ...provider, auth: provider.auth ?? 'none', models: [...(provider.models ?? []).filter(row => row.id !== model.modelId), raw] },
    } });
    state.metadata.models[modelKey({ providerId: model.provider, modelId: model.modelId })] = model;
  }

  async configureModel(input: ModelConfigureRequest, revision: string): Promise<ModelMutationResult> {
    const request = ModelConfigureRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    await this.context.modelRegistry.reapplyModelPolicies();
    const model = request.model;
    this.stageModel(state, model);
    const before = this.context.modelRegistry.getAll('all');
    const allowed = filterAvailableModelsByEnabledPatterns(before, cfgEnabledModels.get(this.context.settings), this.context.settings);
    const selection = { providerId: model.provider, modelId: model.modelId };
    return ModelMutationResultSchema.parse(await this.commit(state, () => {
      if (model.enabled !== undefined) {
        const selectors = new Set(allowed.filter(row => row.provider !== model.provider || row.id !== model.modelId).map(row => `${row.provider}/${row.id}`));
        if (model.enabled) selectors.add(`${model.provider}/${model.modelId}`);
        cfgEnabledModels.set(this.context.settings, enabledModelSelectors(selectors));
      }
    }, () => {
      const published = this.context.modelRegistry.find(model.provider, model.modelId);
      if (!published) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Configured native model was not published');
      return ModelMutationResultSchema.parse({ revision, selection, model: publicModel(published, model, model.enabled) });
    }));
  }

  async deleteModel(input: ModelDeleteRequest, revision: string): Promise<ModelMutationResult> {
    const request = ModelDeleteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    await this.context.modelRegistry.reapplyModelPolicies();
    const patterns = cfgEnabledModels.get(this.context.settings);
    const allowed = filterAvailableModelsByEnabledPatterns(this.context.modelRegistry.getAll('all'), patterns, this.context.settings);
    const selectors = new Set(allowed.filter(model => model.provider !== request.selection.providerId || model.id !== request.selection.modelId)
      .map(model => `${model.provider}/${model.id}`));
    const provider = state.config.providers?.[request.selection.providerId];
    if (provider) {
      provider.models = provider.models?.filter(model => model.id !== request.selection.modelId);
      if (provider.modelOverrides) delete provider.modelOverrides[request.selection.modelId];
    }
    delete state.metadata.models[modelKey(request.selection)];
    return ModelMutationResultSchema.parse(await this.commit(state, () => {
      if (patterns.length > 0) cfgEnabledModels.set(this.context.settings, enabledModelSelectors(selectors));
    }, () => {
      const restored = this.context.modelRegistry.find(request.selection.providerId, request.selection.modelId);
      return ModelMutationResultSchema.parse({ revision, selection: request.selection, model: restored ? publicModel(restored, undefined,
        !cfgDisabledProviders.get(this.context.settings).includes(restored.provider) && (patterns.length === 0 || selectors.has(`${restored.provider}/${restored.id}`))) : null });
    }));
  }
}
