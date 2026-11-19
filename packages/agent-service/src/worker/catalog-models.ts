import { createHash, randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JSONC, YAML } from 'bun';
import { z } from 'zod';
import { AUTHENTICATED_SENTINEL, getEnvApiKey, getEnvApiKeyName, listProvidersWithEnvKey, oauthAccountKey, type AuthApiKeyOptions, type ResolvedApiKey } from '@oh-my-pi/pi-ai';
import { generateImage } from '@oh-my-pi/pi-ai/images';
import { getModelPricingStatus, IMAGE_GENERATION_APIS, modelKind, PROVIDER_DESCRIPTORS } from '@oh-my-pi/pi-catalog';
import { authPolicyFor } from '@oh-my-pi/pi-catalog/compat/auth';
import type { CreateAgentSessionOptions } from '@oh-my-pi/pi-coding-agent/sdk';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelsConfigFile, validateProviderConfiguration } from '@oh-my-pi/pi-coding-agent/config/models-config';
import { ModelsConfigSchema, type ModelsConfig } from '@oh-my-pi/pi-coding-agent/config/models-config-schema';
import { cfgDisabledProviders, cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns, getModelMatchPreferences, pickDefaultAvailableModel, resolveAllowedModels, resolveModelRoleValue } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { cfgDefaultThinkingLevel } from '@oh-my-pi/pi-coding-agent/session/settings';
import { resolveRoleModelFull } from '@oh-my-pi/pi-coding-agent/session/role-models';
import { cfgCompactionModelThresholds, cfgCompactionModelThresholdsEnabled, cfgExtendedContext } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { invalidateCommandConfig, resolveConfigHeaders, resolveConfigValue } from '@oh-my-pi/pi-coding-agent/config/resolve-config-value';
import { isDiscoveryBearerApiKey } from '@oh-my-pi/pi-coding-agent/config/model-provider-discovery';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import {
 ImageGenerateRequestSchema, ImageGenerateResultSchema, ImageModelConfigureRequestSchema,
 ImageModelMutationResultSchema, ImageModelSchema, ModelSchema, ModelCatalogSchema,
 ModelConfigureRequestSchema, ModelDeleteRequestSchema,
 ModelMutationResultSchema, ModelSelectionSchema, ProviderSchema, ProviderCatalogSchema,
 ProviderConfigurationSchema, ProviderConfigureRequestSchema, ProviderDeleteRequestSchema,
 ProviderMutationResultSchema, PositiveCounterSchema, ProviderConfigurationReadSchema,
 ProviderModelDiscoveryRequestSchema, ProviderModelDiscoveryResultSchema,
 ProviderModelEnrichRequestSchema, ProviderModelEnrichResultSchema,
 type ProviderConfigurationRead, type ProviderModelDiscoveryRequest, type ProviderModelDiscoveryResult,
 type ProviderModelEnrichRequest, type ProviderModelEnrichResult,
 type Model, type ModelCatalog, type ModelConfigureRequest, type ModelDeleteRequest,
 type ModelMutationResult, type ModelSelection, type Provider, type ProviderCatalog,
 type ProviderConfigureRequest, type ProviderDeleteRequest, type ProviderMutationResult,
 type CompletionRequest, type ImageGenerateRequest, type ImageGenerateResult,
 type ImageModelConfigureRequest, type ImageModelMutationResult,
 formatModelRef,
} from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { catalogModelInfo } from './catalog-model-info.ts';

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
 rememberProviderSecrets?: (values: Iterable<string | undefined>) => void;
};

// These are canonical records, stored alongside native models/overrides in the native file.
// OMP owns execution fields; application-only names, status and labels are not invented SDK fields.
const MetadataSchema = z.object({
 providers: z.record(z.string(), ProviderConfigurationSchema).default({}),
 models: z.record(z.string(), ModelSchema).default({}),
 // Generators are their own record: they carry no token budget, so they cannot
 // be stored as a text model without inventing the limits the type requires.
 imageModels: z.record(z.string(), ImageModelSchema).default({}),
 defaultCredentials: z.record(z.string(), z.string().nullable()).default({}),
 providerHeaders: z.record(z.string(), z.record(z.string(), z.string())).default({}),
}).default({ providers: {}, models: {}, imageModels: {}, defaultCredentials: {}, providerHeaders: {} });
const FileMetadataSchema = z.object({ openchamber: MetadataSchema });
type CatalogMetadata = z.infer<typeof MetadataSchema>;
type ConfigState = { config: ModelsConfig; metadata: CatalogMetadata; path: string; content: string | null };
type ModelsConfigInput = typeof ModelsConfigSchema.inferIn;
type NativeProviderConfigInput = NonNullable<ModelsConfigInput['providers']>[string];
type NativeModelDefinitionInput = NonNullable<NativeProviderConfigInput['models']>[number];
type NativeThinkingEffortInput = NonNullable<NonNullable<NativeModelDefinitionInput['thinking']>['efforts']>[number];

const WELL_KNOWN_PROVIDER_NAMES: Readonly<Record<string, string>> = Object.freeze({
 '302ai': '302.AI',
 'abacus': 'Abacus.AI',
 'aihubmix': 'AiHubMix',
 'anthropic': 'Anthropic',
 'openai': 'OpenAI',
 'siliconflow': 'SiliconFlow',
 'openrouter': 'OpenRouter',
});

const DESCRIPTOR_LABELS: Readonly<Record<string, string>> = Object.freeze(
 Object.fromEntries(
  PROVIDER_DESCRIPTORS.filter(d => d.catalogDiscovery?.label)
   .map(d => [d.providerId, d.catalogDiscovery!.label!])
 )
);

export function resolveProviderDisplayName(providerId: string, configuredName?: string | null): string {
 if (configuredName && configuredName.trim().length > 0) return configuredName;
 const wellKnown = WELL_KNOWN_PROVIDER_NAMES[providerId];
 if (wellKnown) return wellKnown;
 const authName = authPolicyFor(providerId)?.name;
 if (authName) return authName;
 const descriptorLabel = DESCRIPTOR_LABELS[providerId];
 if (descriptorLabel) return descriptorLabel;
 return providerId;
}

const ENV_PROVIDER_IDS: ReadonlySet<string> = new Set(listProvidersWithEnvKey());

/**
 * The environment variable that can back a provider, as a name only. OMP's own
 * resolver decides presence, so an unset or blank variable reads as absent.
 * Computed resolvers (multi-variable pickers, ADC/Bedrock probes) have no
 * single name and report `variable: null`. `active` is whether the variable
 * currently supplies the winning credential, taken from the projected source.
 */
function providerEnvironment(providerId: string, active: boolean): { variable: string | null; active: boolean } | undefined {
 // OMP's own resolver decides presence, so an unset or blank variable is absent.
 // An ambient sentinel (AWS profile, ADC) is auth without a variable to name.
 if (!active) {
  if (!ENV_PROVIDER_IDS.has(providerId)) return undefined;
  const value = getEnvApiKey(providerId);
  if (value === undefined || value === AUTHENTICATED_SENTINEL || value.trim() === '') return undefined;
 }
 return { variable: getEnvApiKeyName(providerId) ?? null, active };
}

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

function sameDiscoveryEndpoint(left: string | undefined | null, right: string | undefined | null): boolean {
 if (!left || !right) return false;
 try {
  const a = new URL(left);
  const b = new URL(right);
  return a.origin === b.origin
   && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '')
   && a.search === b.search;
 } catch {
  return left === right;
 }
}
function apiProtocol(api: NativeCatalogModel['api'] | undefined): Provider['protocol'] {
 switch (api) {
  case 'openai-completions': case 'openrouter': return 'chat-completions';
  case 'openai-responses': case 'openai-codex-responses': case 'azure-openai-responses': case 'openai-images': case 'openrouter-images': return 'responses';
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
 // OMP's per-model default is what a selection with no level resolves to, so
 // an effort picker can show the level that actually runs instead of a
 // synthetic "default" row.
 const defaultLevel = native.thinking?.defaultLevel;
 if (defaultLevel !== undefined && efforts.includes(defaultLevel)) {
  candidate.defaultReasoningEffort = defaultLevel;
 }
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
 // A model whose thinking is addressed by effort alone has no native variant
 // routes, and settings name its level as `provider/model:high`. Treat that
 // suffix as the effort it names instead of rejecting a selection the model
 // supports; a name that is neither a variant nor an effort still fails.
 const effortNamedByVariant = variant === undefined && controls?.variant != null
  ? projected.reasoningOptions.find(option => option.reasoningEffort === controls.variant)?.reasoningEffort
  : undefined;
 if (controls?.variant != null && !variant && effortNamedByVariant === undefined) {
  throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected model variant is unavailable');
 }
 if (variant && controls?.reasoningEffort != null && variant.reasoningEffort !== controls.reasoningEffort) {
  throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected model variant conflicts with the reasoning effort');
 }
 if (effortNamedByVariant !== undefined && controls?.reasoningEffort != null && effortNamedByVariant !== controls.reasoningEffort) {
  throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected model variant conflicts with the reasoning effort');
 }
 const requestedEffort = controls?.reasoningEffort ?? variant?.reasoningEffort ?? effortNamedByVariant ?? null;
 const reasoningEffort = requestedEffort === 'off' ? null
  : requestedEffort === null ? null : nativeModel.thinking?.efforts.find(effort => effort === requestedEffort);
 if (requestedEffort === 'off' && !projected.reasoningEffortSupported) {
  throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected reasoning effort is unavailable');
 }
 if (requestedEffort !== null && requestedEffort !== 'off'
  && (reasoningEffort === undefined || !projected.reasoningOptions.some(option => option.reasoningEffort === requestedEffort))) {
  throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected reasoning effort is unavailable');
 }
 if (variant) {
  nativeModel = nativeModel.thinking
   ? {
    ...nativeModel, requestModelId: variant.variant,
    thinking: {
     ...nativeModel.thinking,
     effortRouting: { ...nativeModel.thinking.effortRouting, [reasoningEffort ?? 'off']: variant.variant }
    }
   }
   : { ...nativeModel, requestModelId: variant.variant };
 }
 return { nativeModel, publicModel: projected, reasoningEffort: reasoningEffort ?? null };
}

const IMAGE_GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

export class NativeModels {
 private metadata: CatalogMetadata = MetadataSchema.parse({});
 /**
  * The last computed catalogs and the state they were computed from. Every
  * catalog read used to re-derive the whole model and provider list; the
  * composer and every Settings page read them, so the work repeated far more
  * often than the inputs changed. The key covers the four things a catalog
  * depends on: the committed catalog revision (model and provider writes),
  * the settings values the catalog reads (enabled models, disabled providers,
  * default thinking level, default and plan roles, match preferences), the
  * credential generation (auth writes), and the native models file.
  */
 private readonly catalogCache = new Map<'models' | 'providers', { key: string; catalog: ModelCatalog | ProviderCatalog }>();
 /** The native configuration `load()` last read, so a cached read needs no second file pass. */
 private currentConfig: ConfigState['config'] = {};
 private readonly modelsFile;
 /**
  * Policy state key last applied via `modelRegistry.reapplyModelPolicies()` or
  * confirmed after `modelRegistry.refresh('offline')` via `markPoliciesApplied()`.
  * Starts null so an unrefreshed `ModelRegistry` still hydrates once on first
  * use, and clears during/after failed rebuilds so retries run.
  */
 private appliedPolicyKey: string | null = null;
 private inFlightPolicySync: { key: string; promise: Promise<void> } | null = null;
 constructor(private readonly context: NativeModelsContext) {
  if (context.modelRegistry.authStorage !== context.authStorage) throw new Error('Catalog registry and credential storage must share ownership');
  this.modelsFile = ModelsConfigFile.relocate(context.modelsPath);
 }

 markPoliciesApplied(): void {
  this.appliedPolicyKey = this.policyState();
 }
 private modelsFileStamp(): string {
  const filePath = this.modelsFile.path();
  try {
   const info = statSync(filePath, { bigint: true });
   return `${filePath}:${info.ino}:${info.mtimeNs}:${info.size}`;
  } catch {
   // An absent models file is a state of its own, and `load()` has already
   // resolved it; the stamp only has to change when the file appears.
   return `${filePath}:absent`;
  }
 }

 /**
  * Inputs that `modelRegistry.reapplyModelPolicies()` depends on: the native
  * models file, credential pool generation, and policy settings.
  */
 private policyState(): string {
  const settings = this.context.settings;
  return JSON.stringify([
   this.modelsFileStamp(),
   this.context.authStorage.credentials.generation,
   cfgDisabledProviders.get(settings),
   cfgExtendedContext.get(settings),
   cfgCompactionModelThresholdsEnabled.get(settings) ? cfgCompactionModelThresholds.get(settings) : undefined,
  ]);
 }

 private async syncModelPolicies(): Promise<void> {
  while (true) {
   const key = this.policyState();
   if (this.inFlightPolicySync) {
    if (this.inFlightPolicySync.key === key) {
     return await this.inFlightPolicySync.promise;
    }
    await this.inFlightPolicySync.promise.catch(() => { });
    continue;
   }
   if (this.appliedPolicyKey === key) return;
   this.appliedPolicyKey = null;
   const promise = (async () => {
    await this.context.modelRegistry.reapplyModelPolicies();
    if (this.policyState() === key) {
     this.appliedPolicyKey = key;
    }
   })();
   this.inFlightPolicySync = { key, promise };
   try {
    await promise;
    return;
   } finally {
    if (this.inFlightPolicySync?.promise === promise) {
     this.inFlightPolicySync = null;
    }
   }
  }
 }

 async ensurePoliciesCurrent(): Promise<void> {
  await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
 }

 private async reloadCredentials(): Promise<void> {
  await this.context.authStorage.credentials.poll();
 }

 /**
  * Reloads the cheap inputs a catalog depends on and returns the identity of
  * the state they describe. Both reloads are single-file reads; the expensive
  * policy re-application and catalog construction stay behind the cache.
  */
 private async catalogState(): Promise<string> {
  await this.load();
  await this.reloadCredentials();
  // The settings revision moves on every reload even when nothing changed, so
  // the key uses the values a catalog actually reads instead.
  const settings = this.context.settings;
  return JSON.stringify([
   this.policyState(),
   cfgEnabledModels.get(settings),
   cfgDefaultThinkingLevel.get(settings), settings.getModelRole('default'), settings.getModelRole('plan'),
   getModelMatchPreferences(settings),
  ]);
 }

 private async load(): Promise<ConfigState> {
  try { await this.context.settings.reloadFromDisk(); }
  catch { throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native settings could not be read'); }
  const file = this.modelsFile;
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
  this.currentConfig = loaded.status === 'ok' ? loaded.value : {};
  return { config: loaded.status === 'ok' ? structuredClone(loaded.value) : {}, metadata: structuredClone(metadata), path: file.path(), content };
 }

 async readModels(workspaceId: string, revision: string): Promise<ModelCatalog> {
  const state = await this.catalogState();
  const cacheKey = `models|${workspaceId}|${revision}|${state}`;
  const cached = this.catalogCache.get('models');
  if (cached?.key === cacheKey) return structuredClone(cached.catalog as ModelCatalog);
  await this.syncModelPolicies();
  // A model is listed only when its provider can execute: configured
  // models.yml entries (including keyless endpoints), stored/environment/
  // oauth credentials, or native keyless local providers. The full bundled
  // registry stays the source for ProviderCatalog, so Settings still offers
  // every connectable provider.
  // Chat models keep the exact candidate pool a native session resolves roles
  // from (`getAvailable()`), so the composer never offers a model the session
  // cannot start with. Image generators are a separate native kind and are asked
  // for by kind instead of being filtered out of that pool by token limits.
  const chatModels = this.context.modelRegistry.getAvailable();
  const allowedChat = new Set(filterAvailableModelsByEnabledPatterns(chatModels, cfgEnabledModels.get(this.context.settings), this.context.settings).map(model => modelKey({ providerId: model.provider, modelId: model.id })));
  const disabledProviders = new Set(cfgDisabledProviders.get(this.context.settings));
  const models = chatModels
   .map(model => {
    const key = modelKey({ providerId: model.provider, modelId: model.id });
    return publicModel(model, this.metadata.models[key], !disabledProviders.has(model.provider) && allowedChat.has(key) && this.metadata.models[key]?.enabled !== false);
   });
  // Image generators answer a prompt with pictures and publish no token
  // limits, so they travel beside the chat models instead of through
  // `publicModel`: a `contextWindow` there would be invented.
  const rawImageModels = this.context.modelRegistry.getAvailable('all').filter(model => modelKind(model) === 'image');
  const allowedImage = new Set(filterAvailableModelsByEnabledPatterns(rawImageModels, cfgEnabledModels.get(this.context.settings), this.context.settings).map(model => modelKey({ providerId: model.provider, modelId: model.id })));
  const imageModels = rawImageModels
   .map(model => {
    const key = modelKey({ providerId: model.provider, modelId: model.id });
    const configured = this.metadata.imageModels[key];
    return ImageModelSchema.parse({
     modelId: model.id, provider: model.provider, name: configured?.name ?? model.name,
     enabled: !disabledProviders.has(model.provider) && allowedImage.has(key) && configured?.enabled !== false,
     ...(configured?.status ? { status: configured.status } : model.isBeta ? { status: 'beta' } : {}),
    });
   });
  // Plan mode needs the `plan` role; resolve it exactly as the mode
  // controller does so the composer can disable Plan before a session exists.
  const planRole = resolveRoleModelFull(this.context.settings, 'plan', this.context.modelRegistry.getAvailable(), undefined);
  const catalog = ModelCatalogSchema.parse({
   workspaceId, revision, models, imageModels,
   defaults: await this.readDefaults(), planRoleAvailable: planRole.model !== undefined
  });
  this.catalogCache.set('models', { key: cacheKey, catalog });
  return catalog;
 }

 /**
  * The model and thinking level a new OMP session resolves from `modelRoles.default`
  * and `defaultThinkingLevel`, using the same allowed set and credential pick as
  * native session startup. The composer shows these only while no explicit choice exists.
  */
 private async readDefaults(): Promise<ModelCatalog['defaults']> {
  const settings = this.context.settings;
  const matchPreferences = getModelMatchPreferences(settings);
  const allowed = await resolveAllowedModels(this.context.modelRegistry, settings, matchPreferences);
  const role = resolveModelRoleValue(settings.getModelRole('default'), allowed, { settings, matchPreferences });
  const model = role.model ?? pickDefaultAvailableModel(
   allowed.filter(candidate => this.context.modelRegistry.hasConfiguredAuth(candidate)),
   provider => this.context.modelRegistry.hasConcreteAuth(provider),
  );
  if (!model) return { model: null, thinkingLevel: null };
  const thinkingLevel = role.explicitThinkingLevel
   ? role.thinkingLevel ?? null
   : model.thinking?.defaultLevel ?? cfgDefaultThinkingLevel.get(settings);
  return { model: { providerId: model.provider, modelId: model.id }, thinkingLevel };
 }

 async readProviders(workspaceId: string, revision: string): Promise<ProviderCatalog> {
  const state = await this.catalogState();
  const cacheKey = `providers|${workspaceId}|${revision}|${state}`;
  const cached = this.catalogCache.get('providers');
  if (cached?.key === cacheKey) return structuredClone(cached.catalog as ProviderCatalog);
  await this.syncModelPolicies();
  const ids = new Set([
   ...this.context.modelRegistry.getAll('all').map(model => model.provider),
   ...Object.keys(this.currentConfig.providers ?? {}), ...Object.keys(this.metadata.providers),
   ...this.context.authStorage.credentials.list().map(row => row.provider),
   ...this.context.oauthProviderIds(),
  ]);
  const catalog = ProviderCatalogSchema.parse({ workspaceId, revision, providers: [...ids].map(id => this.provider(id)) });
  this.catalogCache.set('providers', { key: cacheKey, catalog });
  return catalog;
 }

 async supportsSelectedFileHandoff(providerId: string): Promise<boolean> {
  const state = await this.load();
  const configured = state.metadata.providers[providerId];
  return configured !== undefined && configured.protocol === 'chat-completions'
   && state.config.providers?.[providerId] !== undefined;
 }

 async readProviderConfiguration(providerId: string, revision: string): Promise<ProviderConfigurationRead> {
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
  const provider = this.provider(providerId);
  const configuration = state.metadata.providers[providerId] ?? {
   providerId, name: provider.name, endpoint: provider.endpoint, protocol: provider.protocol,
   credentialRef: this.defaultCredentialRef(providerId),
  };
  if (!configuration.endpoint || !configuration.protocol) {
   throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Provider has no configurable endpoint and protocol');
  }
  return ProviderConfigurationReadSchema.parse({
   revision, configuration,
   headerNames: [...new Set([...Object.keys(state.config.providers?.[providerId]?.headers ?? {}),
   ...Object.keys(state.metadata.providerHeaders[providerId] ?? {})])],
   models: this.context.modelRegistry.getProviderModels(providerId)
    .filter(model => model.contextWindow !== null && model.contextWindow > 0 && model.maxTokens !== null && model.maxTokens > 0)
    .map(model => publicModel(model, state.metadata.models[modelKey({ providerId, modelId: model.id })])),
   imageModels: this.context.modelRegistry.getProviderModels(providerId)
    .filter(model => modelKind(model) === 'image')
    .map(model => {
     const key = modelKey({ providerId, modelId: model.id });
     const configured = state.metadata.imageModels[key];
     return ImageModelSchema.parse({
      modelId: model.id, provider: providerId, name: configured?.name ?? model.name,
      enabled: configured?.enabled !== false,
      ...(configured?.status ? { status: configured.status } : model.isBeta ? { status: 'beta' } : {}),
     });
    }),
  });
 }

 async discoverProviderModels(input: ProviderModelDiscoveryRequest): Promise<ProviderModelDiscoveryResult> {
  const request = ProviderModelDiscoveryRequestSchema.parse(input);
  try {
   const state = await this.load();
   await this.context.authStorage.credentials.reload();
   const configured = request.providerId ? state.metadata.providers[request.providerId] : undefined;
   const nativeProvider = request.providerId ? state.config.providers?.[request.providerId] : undefined;
   const providerEndpoint = configured?.endpoint ?? nativeProvider?.baseUrl
    ?? (request.providerId ? this.context.modelRegistry.getProviderBaseUrl(request.providerId) : undefined);
   const matchesConfigured = configured !== undefined
    && sameDiscoveryEndpoint(configured.endpoint, request.endpoint)
    && configured.protocol === request.protocol;
   // Native models.yml providers have no OpenChamber metadata entry, yet OMP
   // resolves their credentials and headers against this same base URL.
   const ownsEndpoint = request.providerId !== undefined && sameDiscoveryEndpoint(providerEndpoint, request.endpoint);
   const headers = new Headers(ownsEndpoint ? {
    ...await resolveConfigHeaders(nativeProvider?.headers),
    ...(configured && matchesConfigured ? state.metadata.providerHeaders[configured.providerId] : undefined),
   } : undefined);
   for (const [name, value] of Object.entries(request.headers ?? {})) headers.set(name, value);
   let apiKey = request.apiKey;
   const source = request.providerId ? this.context.authStorage.keys.source(request.providerId) : undefined;
   const storedSource = !source || source.kind === 'api_key' || source.kind === 'oauth';
   const reference = request.credentialRef ?? (configured && matchesConfigured && storedSource ? this.defaultCredentialRef(configured.providerId) : null);
   if (!apiKey && reference) {
    if (!request.providerId) throw new ProjectionError(422, 'INVALID_REQUEST', 'Credential discovery requires a provider identity');
    const credential = await this.resolveBoundCredential(request.providerId, reference, undefined);
    if (!credential) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider credential is unavailable');
    apiKey = credential.apiKey;
   }
   if (!apiKey && !reference && ownsEndpoint && request.providerId) {
    const resolved = await this.context.authStorage.keys.get(request.providerId, undefined, { baseUrl: request.endpoint });
    // OMP keeps keyless-mode placeholders out of discovery bearers; ambient
    // auth (a cloud profile, ADC) has no bearer to send either.
    if (resolved && isDiscoveryBearerApiKey(resolved) && resolved !== AUTHENTICATED_SENTINEL) apiKey = resolved;
   }
   // A models.yml `apiKey` naming an environment variable the runtime does not
   // define resolves to its literal text in OMP, so the request leaves with a
   // bogus bearer. The cause is a missing credential, not the endpoint's auth.
   // OMP exposes no credential provenance here, so the variable-name shape is
   // a heuristic: a literal all-caps key would be reported this way on 401/403.
   const unsetKeyVariable = await (async () => {
    const configKey = nativeProvider?.apiKey;
    if (!ownsEndpoint || !configKey || configKey.startsWith('!')) return undefined;
    if (!/^[A-Z][A-Z0-9_]+$/.test(configKey)) return undefined;
    // OMP's own resolver decides: an environment-backed name resolves away
    // from its literal text, an unset one stays literal.
    return (await resolveConfigValue(configKey)) === configKey ? configKey : undefined;
   })();
   const authHeaderName = request.protocol === 'messages' ? 'x-api-key' : request.protocol === 'generate-content' ? 'x-goog-api-key' : 'authorization';
   if (apiKey) {
    if (!headers.has(authHeaderName)) headers.set(authHeaderName, authHeaderName === 'authorization' ? `Bearer ${apiKey}` : apiKey);
   }
   const hasCredential = headers.has(authHeaderName);
   if (request.protocol === 'messages' && !headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01');
   // A custom base URL may carry a query (`?api-version=`); the discovery path
   // appends to the pathname, so the query has to be reattached afterwards.
   const endpoint = new URL(request.endpoint);
   const url = new URL(`${endpoint.origin}${endpoint.pathname.replace(/\/+$/, '')}/models`);
   url.search = endpoint.search;
   const models: ProviderModelDiscoveryResult['models'] = [];
   const seen = new Set<string>();
   const pages = new Set<string>();
   const signal = AbortSignal.timeout(15_000);
   while (true) {
    if (pages.has(url.href)) throw new Error('Invalid discovery pagination');
    pages.add(url.href);
    const response = await fetch(url, { headers, signal, redirect: 'error' });
    if (!response.ok) {
     if (response.status === 401 || response.status === 403) {
      if (request.providerId && unsetKeyVariable) {
       throw new ProjectionError(
        422,
        'CREDENTIAL_UNAVAILABLE',
        `Provider ${request.providerId} has no credential: its models.yml apiKey names ${unsetKeyVariable}, which is not set. Set ${unsetKeyVariable} or save an API key.`,
       );
      }
      if (!hasCredential) {
       const envName = request.providerId ? getEnvApiKeyName(request.providerId) : undefined;
       throw new ProjectionError(
        422,
        'CREDENTIAL_UNAVAILABLE',
        request.providerId
         ? `No credential is available for ${request.providerId}${envName ? ` (save an API key or set ${envName})` : ''}.`
         : 'This endpoint requires an API key for model discovery.',
       );
      }
      if (request.providerId) {
       throw new ProjectionError(
        422,
        'CREDENTIAL_UNAVAILABLE',
        `Provider ${request.providerId} rejected the model discovery credential (HTTP ${response.status}).`,
       );
      }
     }
     throw new Error('Discovery request failed');
    }
    const payload = z.object({
     data: z.array(z.unknown()).optional(), models: z.array(z.unknown()).optional(),
     nextPageToken: z.string().optional(), has_more: z.boolean().optional(), last_id: z.string().optional()
    }).parse(await response.json());
    const rows = request.protocol === 'generate-content' ? payload.models : payload.data;
    if (!rows) throw new Error('Invalid model listing');
    for (const entry of rows) {
     const row = z.object({
      id: z.string().optional(), name: z.string().optional(), display_name: z.string().optional(),
      displayName: z.string().optional(), context_window: z.number().int().positive().optional(),
      max_output_tokens: z.number().int().positive().optional(), inputTokenLimit: z.number().int().positive().optional(),
      outputTokenLimit: z.number().int().positive().optional()
     }).parse(entry);
     const modelId = request.protocol === 'generate-content' ? row.name?.replace(/^models\//, '') : row.id;
     if (!modelId) throw new Error('Invalid model identity');
     if (seen.has(modelId)) continue;
     seen.add(modelId);
     const contextWindow = row.inputTokenLimit ?? row.context_window;
     const maxOutputTokens = row.outputTokenLimit ?? row.max_output_tokens;
     const discoveredModel: ProviderModelDiscoveryResult['models'][number] = {
      modelId,
      name: row.displayName ?? row.display_name ?? row.name ?? modelId
     };
     if (contextWindow) discoveredModel.contextWindow = contextWindow;
     if (maxOutputTokens) discoveredModel.maxOutputTokens = maxOutputTokens;
     // One request stays one request: discovery carries the same offline
     // catalog hint auto-fill would return for this id.
     const catalog = catalogModelInfo(modelId, request.providerId);
     if (catalog) discoveredModel.catalog = catalog;
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

 /**
  * Fill capability metadata for model ids from the bundled catalog. Offline by
  * design: no endpoint, credential, or provider-entry gate participates, and an
  * unknown id simply comes back without a `catalog` block.
  */
 async enrichProviderModels(input: ProviderModelEnrichRequest): Promise<ProviderModelEnrichResult> {
  const request = ProviderModelEnrichRequestSchema.parse(input);
  const models: ProviderModelEnrichResult['models'] = [];
  const seen = new Set<string>();
  for (const { modelId } of request.models) {
   if (seen.has(modelId)) continue;
   seen.add(modelId);
   const catalog = catalogModelInfo(modelId, request.providerId);
   models.push(catalog ? { modelId, catalog } : { modelId });
  }
  return ProviderModelEnrichResultSchema.parse({ models });
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
  return ProviderMutationResultSchema.parse(await this.commit(state, () => { },
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
  // The variable stays visible even when a stored key wins the cascade; only
  // its name travels, never the value.
  if (auth.status === 'configured') {
   const environment = providerEnvironment(providerId, auth.source === 'external-environment');
   if (environment) auth = { ...auth, environment };
  }
  const base = {
   providerId, name: resolveProviderDisplayName(providerId, configured?.name),
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

 /**
  * Runs an image generator for a workspace agent. The model must be an
  * executable `kind: 'image'` entry, and a configured credential must resolve:
  * generation is billed, so an unavailable model or credential fails before the
  * request leaves the service. The result carries bytes; the caller writes them
  * to a file instead of returning a multi-megabyte inline picture.
  */
 async generate(input: ImageGenerateRequest, signal?: AbortSignal): Promise<ImageGenerateResult> {
  const request = ImageGenerateRequestSchema.parse(input);
  await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
  const { providerId, modelId } = request.selection;
  const key = modelKey(request.selection);
  const configured = this.metadata.imageModels[key];
  if (configured?.enabled === false) {
   throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected image model is disabled in configuration');
  }
  if (cfgDisabledProviders.get(this.context.settings).includes(providerId)) {
   throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider is disabled');
  }
  const rawImageModels = this.context.modelRegistry.getAvailable('all').filter(model => modelKind(model) === 'image');
  const allowedImage = new Set(filterAvailableModelsByEnabledPatterns(rawImageModels, cfgEnabledModels.get(this.context.settings), this.context.settings).map(model => modelKey({ providerId: model.provider, modelId: model.id })));
  if (!allowedImage.has(key)) {
   throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected image model is disabled by policy or pattern');
  }
  const nativeModel = rawImageModels.find(model => model.provider === providerId && model.id === modelId);
  if (!nativeModel) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected image model is disabled or unavailable');
  const source = this.context.authStorage.keys.source(providerId);
  const reference = source && source.kind !== 'api_key' && source.kind !== 'oauth'
   ? null : this.defaultCredentialRef(providerId);
  if (reference) {
   const resolved = await this.resolveBoundCredential(providerId, reference, this.context.currentNativeSessionId(), { modelId });
   if (!resolved) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Selected provider credential is unavailable');
  }
  // The image transports take the SDK's `ApiKey`: a bare bearer or a resolver
  // that may rotate it between attempts.
  const apiKey = this.context.modelRegistry.resolver(nativeModel, this.context.currentNativeSessionId());
  const deadline = AbortSignal.timeout(IMAGE_GENERATION_TIMEOUT_MS);
  const imageOptions: Parameters<typeof generateImage>[1] = { prompt: request.prompt };
  if (request.inputImages) imageOptions.inputImages = request.inputImages;
  if (request.aspectRatio) imageOptions.aspectRatio = request.aspectRatio;
  if (request.imageSize) imageOptions.imageSize = request.imageSize;
  if (request.count) imageOptions.count = request.count;
  const result = await generateImage(nativeModel, imageOptions, { apiKey, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
  return ImageGenerateResultSchema.parse({
   model: request.selection,
   images: result.images.map(image => ({
    data: image.data, mimeType: image.mimeType,
    ...(image.size ? { size: image.size } : {}), ...(image.quality ? { quality: image.quality } : {}),
   })),
   ...(result.text ? { text: result.text } : {}),
  });
 }

 async selection(input: ModelSelection, controls?: Pick<CompletionRequest, 'variant' | 'reasoningEffort'>): Promise<ResolvedModelSelection> {
  await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
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
  const configured = this.metadata.models[modelKey(input)] ?? this.metadata.imageModels[modelKey(input)];
  const resolved = resolveModelSelection(this.context.modelRegistry, input, configured, controls);
  const headers = this.metadata.providerHeaders[input.providerId];
  const model = resolved.nativeModel;
  if (model.resolveHeaders || model.headers || (headers && Object.keys(headers).length > 0)) {
   resolved.nativeModel = {
    ...model, headers: undefined,
    resolveHeaders: async signal => {
     const resolvedHeaders = { ...(model.resolveHeaders ? await model.resolveHeaders(signal) : model.headers), ...headers };
     this.context.rememberProviderSecrets?.(Object.values(resolvedHeaders));
     return resolvedHeaders;
    }
   };
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

 private async commit(state: ConfigState, project: () => void,
  result: () => ModelMutationResult | ProviderMutationResult | ImageModelMutationResult) {
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
   await this.syncModelPolicies();
   this.metadata = state.metadata;
   return result();
  } catch (error) {
   if (published) {
    try {
     if (state.content === null) await rm(state.path, { force: true }); else await this.write(state.path, state.content);
     cfgEnabledModels.set(this.context.settings, oldEnabled);
     cfgDisabledProviders.set(this.context.settings, oldDisabled);
     await this.context.settings.flush();
     await this.syncModelPolicies();
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
  // A provider ID is the model selector's provider half; a slash would split
  // every selector built from it, leaving the provider unselectable.
  if (request.configuration.providerId.includes('/')) {
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Provider identity cannot contain a path separator');
  }
  PositiveCounterSchema.parse(revision);
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
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
   // The text model list cannot express generators, so a text-list replacement
   // keeps the `kind: image` rows the image form owns and rebuilds the rest.
   const keptImages = (state.config.providers[configuration.providerId].models ?? [])
    .filter(row => row.kind === 'image' && state.metadata.imageModels[modelKey({ providerId: configuration.providerId, modelId: row.id })]);
   state.config.providers[configuration.providerId].models = keptImages;
   for (const [key, model] of Object.entries(state.metadata.models)) {
    if (model.provider === configuration.providerId) delete state.metadata.models[key];
   }
   for (const model of request.models) this.stageModel(state, model);
  }
  return ProviderMutationResultSchema.parse(await this.commit(state, () => {
   cfgDisabledProviders.set(this.context.settings, cfgDisabledProviders.get(this.context.settings).filter(id => id !== configuration.providerId));
   if (request.models?.some(model => model.enabled !== undefined)) {
    const selectors = new Set(allowed.filter(row => row.provider !== configuration.providerId).map(row => formatModelRef({ provider: row.provider, modelId: row.id })));
    for (const model of request.models) {
     if (model.enabled !== false) selectors.add(formatModelRef({ provider: model.provider, modelId: model.modelId }));
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
  for (const [key, model] of Object.entries(state.metadata.imageModels)) if (model.provider === request.providerId) delete state.metadata.imageModels[key];
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
  state.config = this.validate({
   ...state.config, providers: {
    ...state.config.providers,
    [model.provider]: { ...provider, auth: provider.auth ?? 'none', models: [...(provider.models ?? []).filter(row => row.id !== model.modelId), raw] },
   }
  });
  state.metadata.models[modelKey({ providerId: model.provider, modelId: model.modelId })] = model;
 }

 async configureModel(input: ModelConfigureRequest, revision: string): Promise<ModelMutationResult> {
  const request = ModelConfigureRequestSchema.parse(input);
  PositiveCounterSchema.parse(revision);
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
  const model = request.model;
  this.stageModel(state, model);
  const before = this.context.modelRegistry.getAll('all');
  const allowed = filterAvailableModelsByEnabledPatterns(before, cfgEnabledModels.get(this.context.settings), this.context.settings);
  const selection = { providerId: model.provider, modelId: model.modelId };
  return ModelMutationResultSchema.parse(await this.commit(state, () => {
   if (model.enabled !== undefined) {
    const selectors = new Set(allowed.filter(row => row.provider !== model.provider || row.id !== model.modelId).map(row => formatModelRef({ provider: row.provider, modelId: row.id })));
    if (model.enabled) selectors.add(formatModelRef({ provider: model.provider, modelId: model.modelId }));
    cfgEnabledModels.set(this.context.settings, enabledModelSelectors(selectors));
   }
  }, () => {
   const published = this.context.modelRegistry.find(model.provider, model.modelId);
   if (!published) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Configured native model was not published');
   return ModelMutationResultSchema.parse({ revision, selection, model: publicModel(published, model, model.enabled) });
  }));
 }

 /**
  * Writes an image generator as its own native record. The text `ModelSchema`
  * cannot express this: a generator has no token budget, and marking a chat
  * model as one would invent limits it does not have. The native file receives
  * `kind: image` on the api that actually serves generation, and enablement
  * travels through the same enabled-model selectors as chat models.
  */
 async configureImageModel(input: ImageModelConfigureRequest, revision: string): Promise<ImageModelMutationResult> {
  const request = ImageModelConfigureRequestSchema.parse(input);
  PositiveCounterSchema.parse(revision);
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
  const model = request.model;
  const existing = this.context.modelRegistry.find(model.provider, model.modelId);
  const configuredProvider = state.config.providers?.[model.provider];
  const modelApi = existing?.api ?? (configuredProvider?.api && (IMAGE_GENERATION_APIS as readonly string[]).includes(configuredProvider.api) ? configuredProvider.api : 'openai-images');
  const baseUrl = configuredProvider?.baseUrl ?? this.context.modelRegistry.getProviderBaseUrl(model.provider);
  if (!baseUrl) throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Configure the native provider before configuring this model');
  if (!(IMAGE_GENERATION_APIS as readonly string[]).includes(modelApi)) {
   throw new ProjectionError(422, 'INVALID_REQUEST', 'This provider api cannot run image generation');
  }
  const raw: NativeModelDefinitionInput = {
   id: model.modelId, name: model.name, api: modelApi, kind: 'image', input: ['text'],
  };
  state.config.providers ??= {};
  const provider: NativeProviderConfigInput = {
   ...configuredProvider,
   ...(configuredProvider?.api ? { api: nativeProviderApi(configuredProvider.api) } : {}),
   baseUrl,
  };
  state.config = this.validate({
   ...state.config, providers: {
    ...state.config.providers,
    [model.provider]: { ...provider, auth: provider.auth ?? 'none', models: [...(provider.models ?? []).filter(row => row.id !== model.modelId), raw] },
   }
  });
  state.metadata.imageModels[modelKey({ providerId: model.provider, modelId: model.modelId })] = ImageModelSchema.parse(model);
  const selection = { providerId: model.provider, modelId: model.modelId };
  return ImageModelMutationResultSchema.parse(await this.commit(state, () => {
   if (model.enabled !== undefined) {
    const allowed = filterAvailableModelsByEnabledPatterns(this.context.modelRegistry.getAll('all'), cfgEnabledModels.get(this.context.settings), this.context.settings);
    const selectors = new Set(allowed.filter(row => row.provider !== model.provider || row.id !== model.modelId).map(row => formatModelRef({ provider: row.provider, modelId: row.id })));
    if (model.enabled) selectors.add(formatModelRef({ provider: model.provider, modelId: model.modelId }));
    cfgEnabledModels.set(this.context.settings, enabledModelSelectors(selectors));
   }
  }, () => {
   const published = this.context.modelRegistry.getAll('all').find(row => row.provider === model.provider && row.id === model.modelId && modelKind(row) === 'image');
   if (!published) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Configured native image model was not published');
   return ImageModelMutationResultSchema.parse({
    revision, selection,
    model: ImageModelSchema.parse({
     modelId: published.id, provider: published.provider, name: model.name,
     enabled: model.enabled ?? !cfgDisabledProviders.get(this.context.settings).includes(published.provider),
     ...(model.status ? { status: model.status } : {}),
    }),
   });
  }));
 }

 async deleteModel(input: ModelDeleteRequest, revision: string): Promise<ModelMutationResult> {
  const request = ModelDeleteRequestSchema.parse(input);
  PositiveCounterSchema.parse(revision);
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();
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
   return ModelMutationResultSchema.parse({
    revision, selection: request.selection, model: restored ? publicModel(restored, undefined,
     !cfgDisabledProviders.get(this.context.settings).includes(restored.provider) && (patterns.length === 0 || selectors.has(`${restored.provider}/${restored.id}`))) : null
   });
  }));
 }
}
