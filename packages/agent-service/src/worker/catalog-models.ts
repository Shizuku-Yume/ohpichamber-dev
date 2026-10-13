import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JSONC, YAML } from 'bun';
import { z } from 'zod';
import type { CreateAgentSessionOptions } from '@oh-my-pi/pi-coding-agent/sdk';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelsConfigFile, validateProviderConfiguration } from '@oh-my-pi/pi-coding-agent/config/models-config';
import { ModelsConfigSchema, type ModelsConfig } from '@oh-my-pi/pi-coding-agent/config/models-config-schema';
import { cfgDisabledProviders, cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import {
  ModelSchema, ModelCatalogSchema, ModelConfigureRequestSchema, ModelDeleteRequestSchema,
  ModelMutationResultSchema, ModelSelectionSchema, ProviderSchema, ProviderCatalogSchema,
  ProviderConfigurationSchema, ProviderConfigureRequestSchema, ProviderDeleteRequestSchema,
  ProviderMutationResultSchema, PositiveCounterSchema,
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
}).default({ providers: {}, models: {} });
const FileMetadataSchema = z.object({ openchamber: MetadataSchema });
type CatalogMetadata = z.infer<typeof MetadataSchema>;
type ConfigState = { config: ModelsConfig; metadata: CatalogMetadata; path: string; content: string | null };
type NativeProviderConfig = NonNullable<ModelsConfig['providers']>[string];
type NativeModelDefinition = NonNullable<NativeProviderConfig['models']>[number];

function modelKey(selection: ModelSelection): string {
  return JSON.stringify([selection.providerId, selection.modelId]);
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

function nativeProviderApi(api: NativeCatalogModel['api'] | undefined): NativeProviderConfig['api'] {
  switch (api) {
    case 'openai-completions': case 'openai-responses': case 'openai-codex-responses':
    case 'azure-openai-responses': case 'anthropic-messages': case 'bedrock-converse-stream':
    case 'google-generative-ai': case 'google-gemini-cli': case 'google-vertex':
    case 'openrouter-decisions': case 'typesafe':
      return api;
    default:
      return undefined;
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
  const candidate: Model = {
    modelId: native.id, provider: native.provider, name: configured?.name ?? native.name,
    modalities: [...new Set(modalities)], contextWindow: native.contextWindow,
    maxOutputTokens: Math.min(native.contextWindow, native.maxTokens),
    reasoningEffortSupported: native.reasoning || efforts.length > 0,
    reasoningOptions: configured?.reasoningOptions ?? efforts.map(reasoningEffort => ({
      reasoningEffort, label: reasoningEffort, budgetTokens: native.thinking?.effortBudgets?.[reasoningEffort] ?? null,
    })),
    variants: configured?.variants ?? variants,
    pricing: configured ? configured.pricing : native.pricingStatus === 'unknown' || (native.pricingStatus === undefined && Object.values(native.cost).every(cost => cost === 0)) ? null : {
      inputPerMillionTokens: native.cost.input, outputPerMillionTokens: native.cost.output,
      cacheReadPerMillionTokens: native.cost.cacheRead, cacheWritePerMillionTokens: native.cost.cacheWrite,
    },
  };
  if (native.supportsTools !== undefined) candidate.toolsSupported = native.supportsTools;
  if (enabled !== undefined) candidate.enabled = enabled;
  if (configured?.status) candidate.status = configured.status;
  else if (native.isBeta) candidate.status = 'beta';
  return ModelSchema.parse(candidate);
}

export function resolveModelSelection(registry: ModelRegistry, input: ModelSelection, configured?: Model,
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
  private metadata: CatalogMetadata = { providers: {}, models: {} };
  constructor(private readonly context: NativeModelsContext) {
    if (context.modelRegistry.authStorage !== context.authStorage) throw new Error('Catalog registry and credential storage must share ownership');
  }

  private async load(): Promise<ConfigState> {
    const file = ModelsConfigFile.relocate(this.context.modelsPath);
    file.invalidate();
    const loaded = file.tryLoad();
    if (loaded.status === 'error') throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native model configuration could not be read');
    let content: string | null = null;
    let metadata: CatalogMetadata = { providers: {}, models: {} };
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
    await this.context.modelRegistry.refresh('offline');
    const all = this.context.modelRegistry.getAll('all');
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
    await this.context.modelRegistry.refresh('offline');
    const ids = new Set([
      ...this.context.modelRegistry.getAll('all').map(model => model.provider),
      ...Object.keys(state.config.providers ?? {}), ...Object.keys(state.metadata.providers),
      ...this.context.authStorage.credentials.list().map(row => row.provider),
      ...this.context.oauthProviderIds(),
    ]);
    return ProviderCatalogSchema.parse({ workspaceId, revision, providers: [...ids].map(id => this.provider(id)) });
  }

  provider(providerId: string): Provider {
    const configured = this.metadata.providers[providerId];
    const first = this.context.modelRegistry.getProviderModels(providerId)[0];
    const rawEndpoint = configured?.endpoint ?? this.context.modelRegistry.getProviderBaseUrl(providerId) ?? null;
    const source = this.context.authStorage.keys.source(providerId);
    const rows = this.context.authStorage.credentials.list(providerId).filter(row => row.disabledCause === null);
    const supportedOAuth = this.context.oauthProviderIds().has(providerId) || rows.some(row => row.credential.type === 'oauth');
    const authMethods: Provider['authMethods'] = supportedOAuth ? ['api-key', 'oauth'] : ['api-key'];
    let auth: Provider['auth'] = { status: 'missing' };
    if (source) {
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

  async selection(input: ModelSelection, controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): Promise<ResolvedModelSelection> {
    await this.load();
    await this.context.modelRegistry.refresh('offline');
    await this.context.authStorage.credentials.reload();
    if (cfgDisabledProviders.get(this.context.settings).includes(input.providerId)) {
      throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider is disabled');
    }
    const enabled = filterAvailableModelsByEnabledPatterns(this.context.modelRegistry.getAll('all'), cfgEnabledModels.get(this.context.settings), this.context.settings);
    if (!enabled.some(model => model.provider === input.providerId && model.id === input.modelId)) {
      throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model is disabled or unavailable');
    }
    const nativeCredentialSessionId = this.context.currentNativeSessionId();
    const reference = this.metadata.providers[input.providerId]?.credentialRef;
    if (reference) {
      const row = this.context.authStorage.credentials.list(input.providerId)
        .find(row => row.disabledCause === null && credentialReference(input.providerId, row.id) === reference);
      if (!row || !this.context.authStorage.sessions.pin(input.providerId, nativeCredentialSessionId, row.id)) {
        throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider credential is unavailable');
      }
    }
    const configured = this.metadata.models[modelKey(input)];
    return { ...resolveModelSelection(this.context.modelRegistry, input, configured, controls), nativeCredentialSessionId };
  }

  private validate(config: ModelsConfig): ModelsConfig {
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
      await this.context.modelRegistry.refresh('offline');
      this.metadata = state.metadata;
      return result();
    } catch (error) {
      if (published) {
        try {
          if (state.content === null) await rm(state.path, { force: true }); else await this.write(state.path, state.content);
          cfgEnabledModels.set(this.context.settings, oldEnabled);
          cfgDisabledProviders.set(this.context.settings, oldDisabled);
          await this.context.settings.flush();
          await this.context.modelRegistry.refresh('offline');
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
    const configuration = request.configuration;
    if (configuration.credentialRef !== null && !this.context.authStorage.credentials.list(configuration.providerId)
      .some(row => credentialReference(configuration.providerId, row.id) === configuration.credentialRef && row.disabledCause === null)) {
      throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider credential reference is not available');
    }
    state.config.providers ??= {};
    state.config.providers[configuration.providerId] = {
      ...state.config.providers[configuration.providerId], baseUrl: configuration.endpoint, api: nativeApi(configuration.protocol),
    };
    state.metadata.providers[configuration.providerId] = configuration;
    return ProviderMutationResultSchema.parse(await this.commit(state, () => {
      cfgDisabledProviders.set(this.context.settings, cfgDisabledProviders.get(this.context.settings).filter(id => id !== configuration.providerId));
    }, () => ProviderMutationResultSchema.parse({ revision, providerId: configuration.providerId, provider: this.provider(configuration.providerId) })));
  }

  async deleteProvider(input: ProviderDeleteRequest, revision: string): Promise<ProviderMutationResult> {
    const request = ProviderDeleteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    if (state.config.providers) delete state.config.providers[request.providerId];
    delete state.metadata.providers[request.providerId];
    for (const [key, model] of Object.entries(state.metadata.models)) if (model.provider === request.providerId) delete state.metadata.models[key];
    return ProviderMutationResultSchema.parse(await this.commit(state, () => {
      cfgDisabledProviders.set(this.context.settings, [...new Set([...cfgDisabledProviders.get(this.context.settings), request.providerId])]);
    }, () => ProviderMutationResultSchema.parse({ revision, providerId: request.providerId, provider: null })));
  }

  async configureModel(input: ModelConfigureRequest, revision: string): Promise<ModelMutationResult> {
    const request = ModelConfigureRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    const state = await this.load();
    const model = request.model;
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
    const reasoning = model.reasoningOptions.length > 0 ? { mode: existing?.thinking?.mode ?? 'effort', efforts: model.reasoningOptions.map(option => option.reasoningEffort) } : undefined;
    const cost = model.pricing === null ? existing?.cost : {
      input: model.pricing.inputPerMillionTokens, output: model.pricing.outputPerMillionTokens,
      cacheRead: model.pricing.cacheReadPerMillionTokens ?? 0, cacheWrite: model.pricing.cacheWritePerMillionTokens ?? 0,
    };
    state.config.providers ??= {};
    const providerApi = configuredProvider?.api ?? nativeProviderApi(existing?.api);
    const provider: NativeProviderConfig = { ...configuredProvider, baseUrl };
    if (providerApi) provider.api = providerApi;
    const raw: NativeModelDefinition = {
      id: model.modelId, name: model.name, api,
      input: nativeInput, reasoning: model.reasoningEffortSupported,
      contextWindow: model.contextWindow, maxTokens: model.maxOutputTokens,
    };
    if (existing?.kind) raw.kind = existing.kind;
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
    const before = this.context.modelRegistry.getAll('all');
    const allowed = filterAvailableModelsByEnabledPatterns(before, cfgEnabledModels.get(this.context.settings), this.context.settings);
    const selection = { providerId: model.provider, modelId: model.modelId };
    return ModelMutationResultSchema.parse(await this.commit(state, () => {
      if (model.enabled !== undefined) {
        const selectors = new Set(allowed.filter(row => row.provider !== model.provider || row.id !== model.modelId).map(row => `${row.provider}/${row.id}`));
        if (model.enabled) selectors.add(`${model.provider}/${model.modelId}`);
        cfgEnabledModels.set(this.context.settings, [...selectors]);
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
    const provider = state.config.providers?.[request.selection.providerId];
    if (provider) {
      provider.models = provider.models?.filter(model => model.id !== request.selection.modelId);
      if (provider.modelOverrides) delete provider.modelOverrides[request.selection.modelId];
    }
    delete state.metadata.models[modelKey(request.selection)];
    return ModelMutationResultSchema.parse(await this.commit(state, () => {}, () => {
      const restored = this.context.modelRegistry.find(request.selection.providerId, request.selection.modelId);
      return ModelMutationResultSchema.parse({ revision, selection: request.selection, model: restored ? publicModel(restored) : null });
    }));
  }
}
