import { createHash, randomUUID } from 'node:crypto';
import { statSync } from 'node:fs';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { JSONC, YAML } from 'bun';
import { z } from 'zod';
import { AUTHENTICATED_SENTINEL, getEnvApiKey, getEnvApiKeyName, listProvidersWithEnvKey, oauthAccountKey, type AuthApiKeyOptions, type ResolvedApiKey } from '@oh-my-pi/pi-ai';
import { generateImage } from '@oh-my-pi/pi-ai/images';
import { getModelPricingStatus, IMAGE_GENERATION_APIS, isGeneratedProvider, modelKind, PROVIDER_DESCRIPTORS } from '@oh-my-pi/pi-catalog';
import { authPolicyFor } from '@oh-my-pi/pi-catalog/compat/auth';
import { providerEntry } from '@oh-my-pi/pi-catalog/compat/providers';
import type { CreateAgentSessionOptions } from '@oh-my-pi/pi-coding-agent/sdk';
import type { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import type { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ModelsConfigFile, validateProviderConfiguration } from '@oh-my-pi/pi-coding-agent/config/models-config';
import { ModelsConfigSchema, type ModelsConfig } from '@oh-my-pi/pi-coding-agent/config/models-config-schema';
import { getModelsConfigSchemaBundle } from '@oh-my-pi/pi-coding-agent/config/models-config-schema-bundle';
import { cfgDisabledProviders, cfgEnabledModels } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { filterAvailableModelsByEnabledPatterns, getModelMatchPreferences, pickDefaultAvailableModel, resolveAllowedModels, resolveModelRoleValue } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { cfgDefaultThinkingLevel } from '@oh-my-pi/pi-coding-agent/session/settings';
import { resolveRoleModelFull } from '@oh-my-pi/pi-coding-agent/session/role-models';
import { cfgCompactionModelThresholds, cfgCompactionModelThresholdsEnabled, cfgExtendedContext } from '@oh-my-pi/pi-coding-agent/session/context-settings';
import { invalidateCommandConfig, resolveConfigHeaders, resolveConfigValue } from '@oh-my-pi/pi-coding-agent/config/resolve-config-value';
import { isDiscoveryBearerApiKey } from '@oh-my-pi/pi-coding-agent/config/model-provider-discovery';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { stringifyYamlConfig } from '@oh-my-pi/pi-utils/yaml-config';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import {
 ImageGenerateRequestSchema, ImageGenerateResultSchema, ImageModelConfigureRequestSchema,
 ImageModelMutationResultSchema, ImageModelSchema, JsonObjectSchema, ModelSchema, ModelCatalogSchema,
 ModelConfigureRequestSchema, ModelDeleteRequestSchema,
 ModelMutationResultSchema, ModelSelectionSchema, ProviderSchema, ProviderCatalogSchema,
 ProviderConfigurationSchema, ProviderConfigureRequestSchema, ProviderDeleteRequestSchema,
 ProviderMutationResultSchema, PositiveCounterSchema, ProviderConfigurationReadSchema,
 ProviderModelDiscoveryRequestSchema, ProviderModelDiscoveryResultSchema,
 ProviderModelEnrichRequestSchema, ProviderModelEnrichResultSchema, PublicEndpointSchema,
 OmpModelDefinitionReadSchema, OmpModelOverrideReadSchema, OmpProviderConfigReadSchema,
 OmpThinkingConfigSchema,
 type ProviderConfigurationRead, type ProviderModelDiscoveryRequest, type ProviderModelDiscoveryResult,
 type ProviderModelEnrichRequest, type ProviderModelEnrichResult,
 type Model, type ModelCatalog, type ModelConfigureRequest, type ModelDeleteRequest,
 type ModelMutationResult, type ModelSelection, type Provider, type ProviderCatalog,
 type ProviderConfigureRequest, type ProviderDeleteRequest, type ProviderMutationResult,
 type CompletionRequest, type ImageGenerateRequest, type ImageGenerateResult,
 type ImageModelConfigureRequest, type ImageModelMutationResult,
 type JsonObject, type OmpConfigApiKeyStatus, type OmpHeadersPatch,
 type OmpModelDefinitionRead, type OmpModelDefinitionWrite,
 type OmpModelOverrideRead, type OmpModelOverrideWrite,
 type OmpProviderConfigWrite,
 type OmpProviderDiscovery, type OmpRemoteCompaction, type OmpThinkingConfig,
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

export type AuthorizeImageUse = (use: { providerId: string; modelId: string; endpoint?: string }) => Promise<void>;

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
 providerNames: z.record(z.string(), z.string()).default({}),
}).default({ providers: {}, models: {}, imageModels: {}, defaultCredentials: {}, providerHeaders: {}, providerNames: {} });
const FileMetadataSchema = z.object({ openchamber: MetadataSchema });
type CatalogMetadata = z.infer<typeof MetadataSchema>;
type ConfigState = { config: ModelsConfig; metadata: CatalogMetadata; path: string; content: string | null };
type NativeProviderConfig = NonNullable<ModelsConfig['providers']>[string];
type NativeModelDefinition = NonNullable<NativeProviderConfig['models']>[number];
type NativeModelOverride = NonNullable<NativeProviderConfig['modelOverrides']>[string];
type NativeDiscovery = NonNullable<NativeProviderConfig['discovery']>;
type NativeRemoteCompaction = NonNullable<NativeProviderConfig['remoteCompaction']>;
type NativeThinking = NonNullable<NativeModelDefinition['thinking']>;
type NativeThinkingEffort = NonNullable<NativeThinking['efforts']>[number];
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

const DESCRIPTOR_IDS: ReadonlySet<string> = new Set(PROVIDER_DESCRIPTORS.map(d => d.providerId));
const RETIRED_PROVIDER_IDS = { 'opencode-zen': true, 'opencode-go': true } as const;

function isBuiltInProvider(providerId: string): boolean {
 return isGeneratedProvider(providerId)
  || providerEntry(providerId) !== undefined
  || DESCRIPTOR_IDS.has(providerId)
  || authPolicyFor(providerId) !== undefined;
}

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

function customProviderBaseUrl(endpoint: string, protocol: 'chat-completions' | 'responses' | 'messages' | 'generate-content'): string {
 if (protocol !== 'chat-completions' && protocol !== 'responses') return endpoint;
 const url = new URL(endpoint);
 if (url.pathname !== '/') return endpoint;
 url.pathname = '/v1';
 return url.href;
}

function discoveryProtocolFor(request: ProviderModelDiscoveryRequest): 'chat-completions' | 'responses' | 'messages' | 'generate-content' {
 if (request.protocol !== undefined) return request.protocol;
 switch (request.nativeApi) {
  case 'anthropic-messages':
  case 'bedrock-converse-stream':
   return 'messages';
  case 'google-generative-ai':
  case 'google-gemini-cli':
  case 'google-vertex':
   return 'generate-content';
  case 'openai-responses':
  case 'openai-codex-responses':
  case 'azure-openai-responses':
   return 'responses';
  default:
   return 'chat-completions';
 }
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

function nativeProviderApi(api: string): NonNullable<NativeProviderConfig['api']> {
 switch (api) {
  case 'openai-completions': case 'openai-responses': case 'openai-codex-responses':
  case 'azure-openai-responses': case 'anthropic-messages': case 'bedrock-converse-stream':
  case 'google-generative-ai': case 'google-gemini-cli': case 'google-vertex':
  case 'openrouter-decisions': case 'openai-decisions': case 'google-decisions':
  case 'workers-ai-systemone': case 'liquid-systemone': case 'nace-systemone':
  case 'typesafe':
   return api;
  default:
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
 }
}

function nativeThinkingEffort(effort: string): NativeThinkingEffort {
 switch (effort) {
  case 'minimal': case 'low': case 'medium': case 'high': case 'xhigh': case 'max':
   return effort;
  default:
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Native model or provider configuration is invalid');
 }
}

const PROTOTYPE_KEY_HAZARDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

function configApiKeyStatus(apiKey: string | undefined): OmpConfigApiKeyStatus {
 if (!apiKey) return { configured: false };
 if (apiKey.startsWith('!')) return { configured: true, source: 'command' };
 if (/^[A-Z_][A-Z0-9_]*$/.test(apiKey) && process.env[apiKey] !== undefined) {
  return { configured: true, source: 'env', envVar: apiKey };
 }
 return { configured: true, source: 'literal' };
}

function mergeHeaders(
 existing: Record<string, string> | undefined,
 replace: Record<string, string> | undefined,
 patch: OmpHeadersPatch | undefined,
): Record<string, string> | undefined {
 if (replace !== undefined) {
  return Object.keys(replace).length > 0 ? { ...replace } : undefined;
 }
 const next: Record<string, string> = { ...(existing ?? {}) };
 if (patch !== undefined) {
  for (const key of patch.remove ?? []) delete next[key];
  for (const [key, value] of Object.entries(patch.set ?? {})) next[key] = value;
 }
 return Object.keys(next).length > 0 ? next : undefined;
}

function toThinkingRead(thinking: NonNullable<NonNullable<ModelsConfig['providers']>[string]['models']>[number]['thinking'] | undefined): OmpThinkingConfig | undefined {
 if (thinking === undefined) return undefined;
 const candidate: OmpThinkingConfig = { mode: thinking.mode, efforts: [...thinking.efforts] };
 if (thinking.defaultLevel !== undefined) candidate.defaultLevel = thinking.defaultLevel;
 if (thinking.effortMap !== undefined) candidate.effortMap = { ...thinking.effortMap };
 if (thinking.supportsDisplay !== undefined) candidate.supportsDisplay = thinking.supportsDisplay;
 if (thinking.requiresEffort !== undefined) candidate.requiresEffort = thinking.requiresEffort;
 return OmpThinkingConfigSchema.parse(candidate);
}

function toThinkingInput(thinking: OmpThinkingConfig): NativeThinking {
 const result: NativeThinking = { mode: thinking.mode, efforts: [...thinking.efforts] };
 if (thinking.defaultLevel !== undefined) result.defaultLevel = thinking.defaultLevel;
 if (thinking.effortMap !== undefined) result.effortMap = { ...thinking.effortMap };
 if (thinking.supportsDisplay !== undefined) result.supportsDisplay = thinking.supportsDisplay;
 if (thinking.requiresEffort !== undefined) result.requiresEffort = thinking.requiresEffort;
 return result;
}

function toDiscoveryInput(discovery: OmpProviderDiscovery): NativeDiscovery {
 const result: NativeDiscovery = { type: discovery.type };
 if (discovery.timeoutMs !== undefined) result.timeoutMs = discovery.timeoutMs;
 if (discovery.injectV1 !== undefined) result.injectV1 = discovery.injectV1;
 if (discovery.advertisedReasoning !== undefined) result.advertisedReasoning = discovery.advertisedReasoning;
 return result;
}

function toRemoteCompactionInput(rc: OmpRemoteCompaction): NativeRemoteCompaction {
 const result: NativeRemoteCompaction = {};
 if (rc.enabled !== undefined) result.enabled = rc.enabled;
 if (rc.api !== undefined) result.api = nativeProviderApi(rc.api);
 if (rc.endpoint !== undefined) result.endpoint = rc.endpoint;
 if (rc.model !== undefined) result.model = rc.model;
 if (rc.v2StreamingEnabled !== undefined) result.v2StreamingEnabled = rc.v2StreamingEnabled;
 if (rc.v2Endpoint !== undefined) result.v2Endpoint = rc.v2Endpoint;
 if (rc.streamingEndpoint !== undefined) result.streamingEndpoint = rc.streamingEndpoint;
 return result;
}

function toRemoteCompactionRead(rc: NativeRemoteCompaction | undefined): OmpRemoteCompaction | undefined {
 if (rc === undefined) return undefined;
 const result: OmpRemoteCompaction = {};
 if (rc.enabled !== undefined) result.enabled = rc.enabled;
 if (rc.api !== undefined) result.api = rc.api;
 if (rc.endpoint !== undefined && PublicEndpointSchema.safeParse(rc.endpoint).success) result.endpoint = rc.endpoint;
 if (rc.model !== undefined) result.model = rc.model;
 if (rc.v2StreamingEnabled !== undefined) result.v2StreamingEnabled = rc.v2StreamingEnabled;
 if (rc.v2Endpoint !== undefined && PublicEndpointSchema.safeParse(rc.v2Endpoint).success) result.v2Endpoint = rc.v2Endpoint;
 if (rc.streamingEndpoint !== undefined && PublicEndpointSchema.safeParse(rc.streamingEndpoint).success) result.streamingEndpoint = rc.streamingEndpoint;
 return result;
}

function toCompatRead(compat: NativeProviderConfig['compat'] | undefined): JsonObject | undefined {
 if (compat === undefined) return undefined;
 return JsonObjectSchema.parse(compat);
}

function toCompatInput(compat: JsonObject): NativeProviderConfig['compat'] {
 return getModelsConfigSchemaBundle().ApiCompatSchema.assert(compat);
}

type NativeLoadedModel = NonNullable<NonNullable<ModelsConfig['providers']>[string]['models']>[number];
type NativeLoadedOverride = NonNullable<NonNullable<ModelsConfig['providers']>[string]['modelOverrides']>[string];

function toModelDefinitionRead(model: NativeLoadedModel): OmpModelDefinitionRead {
 const inputModalities = model.input?.filter((entry): entry is 'text' | 'image' => entry === 'text' || entry === 'image');
 const thinking = toThinkingRead(model.thinking);
 const compat = toCompatRead(model.compat);
 const remoteCompaction = toRemoteCompactionRead(model.remoteCompaction);
 const candidate: Record<string, unknown> = {
  id: model.id,
  headerNames: Object.keys(model.headers ?? {}),
 };
 if (model.name !== undefined) candidate.name = model.name;
 if (model.api !== undefined) candidate.api = model.api;
 if (model.kind !== undefined) candidate.kind = model.kind;
 if (model.baseUrl !== undefined && PublicEndpointSchema.safeParse(model.baseUrl).success) candidate.baseUrl = model.baseUrl;
 if (model.reasoning !== undefined) candidate.reasoning = model.reasoning;
 if (thinking !== undefined) candidate.thinking = thinking;
 if (inputModalities !== undefined && inputModalities.length > 0) candidate.input = inputModalities;
 if (model.imageInputDecoder !== undefined) candidate.imageInputDecoder = model.imageInputDecoder;
 if (model.imageCountBudget !== undefined) candidate.imageCountBudget = model.imageCountBudget;
 if (model.tokenizer !== undefined) candidate.tokenizer = model.tokenizer;
 if (model.supportsTools !== undefined) candidate.supportsTools = model.supportsTools;
 if (model.cost !== undefined) candidate.cost = { ...model.cost };
 if (model.promptCache !== undefined) candidate.promptCache = { ...model.promptCache };
 if (model.premiumMultiplier !== undefined) candidate.premiumMultiplier = model.premiumMultiplier;
 if (model.contextWindow !== undefined) candidate.contextWindow = model.contextWindow;
 if (model.maxContextWindow !== undefined) candidate.maxContextWindow = model.maxContextWindow;
 if (model.maxTokens !== undefined) candidate.maxTokens = model.maxTokens;
 if (model.omitMaxOutputTokens !== undefined) candidate.omitMaxOutputTokens = model.omitMaxOutputTokens;
 if (model.preferWebsockets !== undefined) candidate.preferWebsockets = model.preferWebsockets;
 if (compat !== undefined) candidate.compat = compat;
 if (model.contextPromotionTarget !== undefined) candidate.contextPromotionTarget = model.contextPromotionTarget;
 if (model.compactionModel !== undefined) candidate.compactionModel = model.compactionModel;
 if (remoteCompaction !== undefined) candidate.remoteCompaction = remoteCompaction;
 return OmpModelDefinitionReadSchema.parse(candidate);
}

function toModelOverrideRead(override: NativeLoadedOverride): OmpModelOverrideRead {
 const inputModalities = override.input?.filter((entry): entry is 'text' | 'image' => entry === 'text' || entry === 'image');
 const thinking = toThinkingRead(override.thinking);
 const compat = toCompatRead(override.compat);
 const remoteCompaction = toRemoteCompactionRead(override.remoteCompaction);
 const candidate: Record<string, unknown> = {
  headerNames: Object.keys(override.headers ?? {}),
 };
 if (override.name !== undefined) candidate.name = override.name;
 if (override.api !== undefined) candidate.api = override.api;
 if (override.kind !== undefined) candidate.kind = override.kind;
 if (override.reasoning !== undefined) candidate.reasoning = override.reasoning;
 if (thinking !== undefined) candidate.thinking = thinking;
 if (inputModalities !== undefined && inputModalities.length > 0) candidate.input = inputModalities;
 if (override.imageInputDecoder !== undefined) candidate.imageInputDecoder = override.imageInputDecoder;
 if (override.imageCountBudget !== undefined) candidate.imageCountBudget = override.imageCountBudget;
 if (override.tokenizer !== undefined) candidate.tokenizer = override.tokenizer;
 if (override.supportsTools !== undefined) candidate.supportsTools = override.supportsTools;
 if (override.cost !== undefined) candidate.cost = { ...override.cost };
 if (override.promptCache !== undefined) candidate.promptCache = { ...override.promptCache };
 if (override.premiumMultiplier !== undefined) candidate.premiumMultiplier = override.premiumMultiplier;
 if (override.contextWindow !== undefined) candidate.contextWindow = override.contextWindow;
 if (override.maxContextWindow !== undefined) candidate.maxContextWindow = override.maxContextWindow;
 if (override.maxTokens !== undefined) candidate.maxTokens = override.maxTokens;
 if (override.omitMaxOutputTokens !== undefined) candidate.omitMaxOutputTokens = override.omitMaxOutputTokens;
 if (override.preferWebsockets !== undefined) candidate.preferWebsockets = override.preferWebsockets;
 if (compat !== undefined) candidate.compat = compat;
 if (override.contextPromotionTarget !== undefined) candidate.contextPromotionTarget = override.contextPromotionTarget;
 if (override.compactionModel !== undefined) candidate.compactionModel = override.compactionModel;
 if (remoteCompaction !== undefined) candidate.remoteCompaction = remoteCompaction;
 return OmpModelOverrideReadSchema.parse(candidate);
}

function toModelDefinitionInput(
 model: OmpModelDefinitionWrite,
 existingHeaders: Record<string, string> | undefined,
): NativeModelDefinition {
 const result: NativeModelDefinition = { id: model.id };
 if (model.name !== undefined) result.name = model.name;
 if (model.api !== undefined) result.api = model.api;
 if (model.kind !== undefined) result.kind = model.kind;
 if (model.baseUrl !== undefined) result.baseUrl = model.baseUrl;
 if (model.reasoning !== undefined) result.reasoning = model.reasoning;
 if (model.thinking !== undefined) result.thinking = toThinkingInput(model.thinking);
 if (model.input !== undefined) result.input = [...model.input];
 if (model.imageInputDecoder !== undefined) result.imageInputDecoder = model.imageInputDecoder;
 if (model.imageCountBudget !== undefined) result.imageCountBudget = model.imageCountBudget;
 if (model.tokenizer !== undefined) result.tokenizer = model.tokenizer;
 if (model.supportsTools !== undefined) result.supportsTools = model.supportsTools;
 if (model.cost !== undefined) result.cost = { ...model.cost };
 if (model.promptCache !== undefined) result.promptCache = { ...model.promptCache };
 if (model.premiumMultiplier !== undefined) result.premiumMultiplier = model.premiumMultiplier;
 if (model.contextWindow !== undefined) result.contextWindow = model.contextWindow;
 if (model.maxContextWindow !== undefined) result.maxContextWindow = model.maxContextWindow;
 if (model.maxTokens !== undefined) result.maxTokens = model.maxTokens;
 if (model.omitMaxOutputTokens !== undefined) result.omitMaxOutputTokens = model.omitMaxOutputTokens;
 if (model.preferWebsockets !== undefined) result.preferWebsockets = model.preferWebsockets;
 const headers = mergeHeaders(existingHeaders, model.headers, model.headersPatch);
 if (headers !== undefined) result.headers = headers;
 if (model.compat !== undefined) result.compat = toCompatInput(model.compat);
 if (model.contextPromotionTarget !== undefined) result.contextPromotionTarget = model.contextPromotionTarget;
 if (model.compactionModel !== undefined) result.compactionModel = model.compactionModel;
 if (model.remoteCompaction !== undefined) result.remoteCompaction = toRemoteCompactionInput(model.remoteCompaction);
 return result;
}

function toModelOverrideInput(
 override: OmpModelOverrideWrite,
 existingHeaders: Record<string, string> | undefined,
): NativeModelOverride {
 const result: NativeModelOverride = {};
 if (override.name !== undefined) result.name = override.name;
 if (override.api !== undefined) result.api = override.api;
 if (override.kind !== undefined) result.kind = override.kind;
 if (override.reasoning !== undefined) result.reasoning = override.reasoning;
 if (override.thinking !== undefined) result.thinking = toThinkingInput(override.thinking);
 if (override.input !== undefined) result.input = [...override.input];
 if (override.imageInputDecoder !== undefined) result.imageInputDecoder = override.imageInputDecoder;
 if (override.imageCountBudget !== undefined) result.imageCountBudget = override.imageCountBudget;
 if (override.tokenizer !== undefined) result.tokenizer = override.tokenizer;
 if (override.supportsTools !== undefined) result.supportsTools = override.supportsTools;
 if (override.cost !== undefined) result.cost = { ...override.cost };
 if (override.promptCache !== undefined) result.promptCache = { ...override.promptCache };
 if (override.premiumMultiplier !== undefined) result.premiumMultiplier = override.premiumMultiplier;
 if (override.contextWindow !== undefined) result.contextWindow = override.contextWindow;
 if (override.maxContextWindow !== undefined) result.maxContextWindow = override.maxContextWindow;
 if (override.maxTokens !== undefined) result.maxTokens = override.maxTokens;
 if (override.omitMaxOutputTokens !== undefined) result.omitMaxOutputTokens = override.omitMaxOutputTokens;
 if (override.preferWebsockets !== undefined) result.preferWebsockets = override.preferWebsockets;
 const headers = mergeHeaders(existingHeaders, override.headers, override.headersPatch);
 if (headers !== undefined) result.headers = headers;
 if (override.compat !== undefined) result.compat = toCompatInput(override.compat);
 if (override.contextPromotionTarget !== undefined) result.contextPromotionTarget = override.contextPromotionTarget;
 if (override.compactionModel !== undefined) result.compactionModel = override.compactionModel;
 if (override.remoteCompaction !== undefined) result.remoteCompaction = toRemoteCompactionInput(override.remoteCompaction);
 return result;
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
  reasoningOptions: configured?.reasoningOptions.length ? configured.reasoningOptions : efforts.map(reasoningEffort => ({
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
 if (defaultLevel !== undefined && candidate.reasoningOptions.some(option => option.reasoningEffort === defaultLevel)) {
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
 modelsFileStamp(): string {
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
    const parsedDocument = file.path().endsWith('.json') || file.path().endsWith('.jsonc') ? JSONC.parse(content) : YAML.parse(content);
    const parsedRecord = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {};
    metadata = FileMetadataSchema.parse(parsedRecord).openchamber;
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
  const chatModels = this.context.modelRegistry.getAvailable().filter(model => !Object.hasOwn(RETIRED_PROVIDER_IDS, model.provider));
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
  const rawImageModels = this.context.modelRegistry.getAvailable('all').filter(model => modelKind(model) === 'image' && !Object.hasOwn(RETIRED_PROVIDER_IDS, model.provider));
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
  const catalog = ProviderCatalogSchema.parse({
   workspaceId, revision,
   providers: [...ids].filter(id => !Object.hasOwn(RETIRED_PROVIDER_IDS, id)).map(id => this.provider(id)),
  });
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
  const nativeEntry = state.config.providers?.[providerId];
  const configuredMeta = state.metadata.providers[providerId];
  const hasRegistryModels = this.context.modelRegistry.getProviderModels(providerId).length > 0;
  const builtIn = isBuiltInProvider(providerId);
  if (!builtIn && !nativeEntry && !configuredMeta && !hasRegistryModels) {
   throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Provider has no configurable endpoint and protocol');
  }
  const provider = this.provider(providerId);
  const legacyCandidate = configuredMeta ?? {
   providerId,
   name: provider.name,
   endpoint: provider.endpoint,
   protocol: provider.protocol,
   credentialRef: this.defaultCredentialRef(providerId),
  };
  const parsedLegacy = ProviderConfigurationSchema.safeParse(legacyCandidate);
  const configuration = parsedLegacy.success ? parsedLegacy.data : null;

  const rawEffectiveBaseUrl = this.context.modelRegistry.getProviderBaseUrl(providerId);
  const effectiveBaseUrl = rawEffectiveBaseUrl && PublicEndpointSchema.safeParse(rawEffectiveBaseUrl).success
   ? rawEffectiveBaseUrl
   : undefined;
  const registryFirst = this.context.modelRegistry.getProviderModels(providerId)[0];
  const nativeApiParsed = registryFirst ? OmpModelDefinitionReadSchema.shape.api.safeParse(registryFirst.api) : undefined;
  const effectiveApi = nativeApiParsed?.success ? nativeApiParsed.data : undefined;

  const nativeBaseUrl = nativeEntry?.baseUrl && PublicEndpointSchema.safeParse(nativeEntry.baseUrl).success
   ? nativeEntry.baseUrl
   : undefined;
  const customName = state.metadata.providerNames[providerId] ?? configuredMeta?.name;
  const nativeCandidate: Record<string, unknown> = {
   providerId,
   isBuiltIn: builtIn,
   hasNativeEntry: nativeEntry !== undefined,
   configApiKey: configApiKeyStatus(nativeEntry?.apiKey),
   headerNames: Object.keys(nativeEntry?.headers ?? {}),
   models: (nativeEntry?.models ?? []).map(toModelDefinitionRead),
   modelOverrides: Object.fromEntries(
    Object.entries(nativeEntry?.modelOverrides ?? {}).map(([id, override]) => [id, toModelOverrideRead(override)]),
   ),
  };
  if (customName && customName.trim().length > 0) nativeCandidate.name = customName;
  if (effectiveBaseUrl !== undefined) nativeCandidate.effectiveBaseUrl = effectiveBaseUrl;
  if (effectiveApi !== undefined) nativeCandidate.effectiveApi = effectiveApi;
  if (nativeBaseUrl !== undefined) nativeCandidate.baseUrl = nativeBaseUrl;
  if (nativeEntry?.api !== undefined) nativeCandidate.api = nativeEntry.api;
  if (nativeEntry?.auth !== undefined) nativeCandidate.auth = nativeEntry.auth;
  if (nativeEntry?.authHeader !== undefined) nativeCandidate.authHeader = nativeEntry.authHeader;
  if (nativeEntry?.discovery !== undefined) {
   const discoveryCandidate: OmpProviderDiscovery = { type: nativeEntry.discovery.type };
   if (nativeEntry.discovery.timeoutMs !== undefined) discoveryCandidate.timeoutMs = nativeEntry.discovery.timeoutMs;
   if (nativeEntry.discovery.injectV1 !== undefined) discoveryCandidate.injectV1 = nativeEntry.discovery.injectV1;
   if (nativeEntry.discovery.advertisedReasoning !== undefined) discoveryCandidate.advertisedReasoning = nativeEntry.discovery.advertisedReasoning;
   nativeCandidate.discovery = discoveryCandidate;
  }
  const compat = toCompatRead(nativeEntry?.compat);
  if (compat !== undefined) nativeCandidate.compat = compat;
  if (nativeEntry?.disableStrictTools !== undefined) nativeCandidate.disableStrictTools = nativeEntry.disableStrictTools;
  if (nativeEntry?.guardrailIdentifier !== undefined) nativeCandidate.guardrailIdentifier = nativeEntry.guardrailIdentifier;
  if (nativeEntry?.guardrailVersion !== undefined) nativeCandidate.guardrailVersion = nativeEntry.guardrailVersion;
  if (nativeEntry?.guardrailTrace !== undefined) nativeCandidate.guardrailTrace = nativeEntry.guardrailTrace;
  if (nativeEntry?.requestMetadata !== undefined) nativeCandidate.requestMetadata = { ...nativeEntry.requestMetadata };
  const remoteCompaction = toRemoteCompactionRead(nativeEntry?.remoteCompaction);
  if (remoteCompaction !== undefined) nativeCandidate.remoteCompaction = remoteCompaction;
  if (nativeEntry?.transport !== undefined) nativeCandidate.transport = nativeEntry.transport;
  const native = OmpProviderConfigReadSchema.parse(nativeCandidate);

  return ProviderConfigurationReadSchema.parse({
   revision,
   configuration,
   headerNames: [...new Set([
    ...Object.keys(nativeEntry?.headers ?? {}),
    ...Object.keys(state.metadata.providerHeaders[providerId] ?? {}),
   ])],
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
   native,
  });
 }

 async discoverProviderModels(input: ProviderModelDiscoveryRequest): Promise<ProviderModelDiscoveryResult> {
  const request = ProviderModelDiscoveryRequestSchema.parse(input);
  const protocol = discoveryProtocolFor(request);
  try {
   const state = await this.load();
   await this.context.authStorage.credentials.reload();
   const configured = request.providerId ? state.metadata.providers[request.providerId] : undefined;
   const nativeProvider = request.providerId ? state.config.providers?.[request.providerId] : undefined;
   const providerEndpoint = configured?.endpoint ?? nativeProvider?.baseUrl
    ?? (request.providerId ? this.context.modelRegistry.getProviderBaseUrl(request.providerId) : undefined);
   // A saved root endpoint is authoritative until its configuration is updated.
   const baseUrl = sameDiscoveryEndpoint(providerEndpoint, request.endpoint)
    ? request.endpoint : customProviderBaseUrl(request.endpoint, protocol);
   const matchesConfigured = configured !== undefined
    && sameDiscoveryEndpoint(configured.endpoint, baseUrl)
    && configured.protocol === protocol;
   // Native models.yml providers have no OpenChamber metadata entry, yet OMP
   // resolves their credentials and headers against this same base URL.
   const ownsEndpoint = request.providerId !== undefined && sameDiscoveryEndpoint(providerEndpoint, baseUrl);
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
    const resolved = await this.context.authStorage.keys.get(request.providerId, undefined, { baseUrl });
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
   const authHeaderName = protocol === 'messages' ? 'x-api-key' : protocol === 'generate-content' ? 'x-goog-api-key' : 'authorization';
   if (apiKey) {
    if (!headers.has(authHeaderName)) headers.set(authHeaderName, authHeaderName === 'authorization' ? `Bearer ${apiKey}` : apiKey);
   }
   const hasCredential = headers.has(authHeaderName);
   if (protocol === 'messages' && !headers.has('anthropic-version')) headers.set('anthropic-version', '2023-06-01');
   // A custom base URL may carry a query (`?api-version=`); the discovery path
   // appends to the pathname, so the query has to be reattached afterwards.
   const endpoint = new URL(baseUrl);
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
    const rows = protocol === 'generate-content' ? payload.models : payload.data;
    if (!rows) throw new Error('Invalid model listing');
    for (const entry of rows) {
     const row = z.object({
      id: z.string().optional(), name: z.string().optional(), display_name: z.string().optional(),
      displayName: z.string().optional(), context_window: z.number().int().positive().optional(),
      max_output_tokens: z.number().int().positive().optional(), inputTokenLimit: z.number().int().positive().optional(),
      outputTokenLimit: z.number().int().positive().optional()
     }).parse(entry);
     const modelId = protocol === 'generate-content' ? row.name?.replace(/^models\//, '') : row.id;
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
    if (protocol === 'generate-content' && payload.nextPageToken) url.searchParams.set('pageToken', payload.nextPageToken);
    else if (protocol === 'messages' && payload.has_more) {
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
  return Object.hasOwn(this.metadata.defaultCredentials, providerId)
   ? this.metadata.defaultCredentials[providerId] ?? null
   : this.metadata.providers[providerId]?.credentialRef ?? null;
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

 async removeCredential(providerId: string, credentialRef: string, revision: string, remove: () => Promise<void>): Promise<void> {
  if (this.defaultCredentialRef(providerId) !== credentialRef) {
   await remove();
   return;
  }
  const state = await this.load();
  state.metadata.defaultCredentials[providerId] = null;
  await this.commit(state, () => { }, () => ({ revision, providerId, provider: this.provider(providerId) }), remove);
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
   providerId, name: resolveProviderDisplayName(providerId, configured?.name ?? this.metadata.providerNames[providerId]),
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
  const reference = this.defaultCredentialRef(providerId);
  const overridden = source && source.kind !== 'api_key' && source.kind !== 'oauth';
  if (overridden || !reference) {
   const targetSessionId = sessionId ?? this.context.currentNativeSessionId();
   const sessions = this.context.authStorage.sessions;
   if (targetSessionId && (overridden || sessions.sticky?.(providerId, targetSessionId)?.explicit === true)) {
    sessions.release(providerId, targetSessionId);
   }
   return { bound: false };
  }
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
 async generate(input: ImageGenerateRequest, authorizeImageUse: AuthorizeImageUse, signal?: AbortSignal): Promise<ImageGenerateResult> {
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
  await authorizeImageUse(nativeModel.baseUrl
   ? { providerId, modelId, endpoint: nativeModel.baseUrl }
   : { providerId, modelId });
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

 private validate(config: ModelsConfig): ModelsConfig {
  try {
   const parsed = ModelsConfigSchema.assert(config);
   for (const [providerId, provider] of Object.entries(parsed.providers ?? {})) {
    validateProviderConfiguration(providerId, { ...provider, models: provider.models ?? [] }, 'models-config');
   }
   return parsed;
  } catch (error) {
   const detail = error instanceof Error && error.message.trim().length > 0
    ? error.message
    : 'Native model or provider configuration is invalid';
   throw new ProjectionError(422, 'INVALID_REQUEST', detail);
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

 private hasMetadata(metadata: CatalogMetadata): boolean {
  return Object.keys(metadata.providers).length > 0
   || Object.keys(metadata.models).length > 0
   || Object.keys(metadata.imageModels).length > 0
   || Object.keys(metadata.defaultCredentials).length > 0
   || Object.keys(metadata.providerHeaders).length > 0
   || Object.keys(metadata.providerNames).length > 0;
 }

 private async commit(state: ConfigState, project: () => void,
  result: () => ModelMutationResult | ProviderMutationResult | ImageModelMutationResult, finalize?: () => Promise<void>) {
  const config = this.validate(state.config);
  const oldMetadata = this.metadata;
  const oldEnabled = [...cfgEnabledModels.get(this.context.settings)];
  const oldDisabled = [...cfgDisabledProviders.get(this.context.settings)];
  const payload = this.hasMetadata(state.metadata) ? { ...config, openchamber: state.metadata } : config;
  const content = state.path.endsWith('.json') || state.path.endsWith('.jsonc')
   ? JSON.stringify(payload, null, 2) : stringifyYamlConfig(payload);
  let published = false;
  try {
   await this.write(state.path, content);
   published = true;
   project();
   await this.context.settings.flush();
   await this.syncModelPolicies();
   this.metadata = state.metadata;
   await finalize?.();
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

 private configureNativeProvider(
  state: ConfigState,
  native: OmpProviderConfigWrite,
  configuration: ProviderConfigureRequest['configuration'],
 ): void {
  const providerId = native.providerId;
  if (providerId.includes('/') || PROTOTYPE_KEY_HAZARDS.has(providerId)) {
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Provider identity is invalid');
  }
  if (configuration?.credentialRef !== undefined && configuration.credentialRef !== null
   && !this.context.authStorage.credentials.list(providerId)
    .some(row => credentialReference(providerId, row.id) === configuration.credentialRef && row.disabledCause === null)) {
   throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider credential reference is not available');
  }
  const existing = state.config.providers?.[providerId];
  const nextProvider: NativeProviderConfig = {};

  const nextBaseUrl = native.baseUrl === undefined ? existing?.baseUrl : native.baseUrl === null ? undefined : native.baseUrl;
  if (nextBaseUrl !== undefined) nextProvider.baseUrl = nextBaseUrl;

  const nextApi = native.api === undefined ? existing?.api : native.api === null ? undefined : nativeProviderApi(native.api);
  if (nextApi !== undefined) nextProvider.api = nextApi;

  const nextApiKey = native.configApiKey === undefined ? existing?.apiKey : native.configApiKey === null ? undefined : native.configApiKey;
  if (nextApiKey !== undefined) nextProvider.apiKey = nextApiKey;
  const nextAuthHeader = native.authHeader === undefined ? existing?.authHeader : native.authHeader === null ? undefined : native.authHeader;
  if (nextAuthHeader !== undefined) nextProvider.authHeader = nextAuthHeader;

  const existingHeaders = {
   ...(existing?.headers ?? {}),
   ...(state.metadata.providerHeaders[providerId] ?? {}),
  };
  const nextHeaders = mergeHeaders(
   Object.keys(existingHeaders).length > 0 ? existingHeaders : undefined,
   native.headers,
   native.headersPatch,
  );
  if (nextHeaders !== undefined) nextProvider.headers = nextHeaders;

  const nextDiscovery = native.discovery === undefined
   ? existing?.discovery
   : native.discovery === null
    ? undefined
    : toDiscoveryInput(native.discovery);
  if (nextDiscovery !== undefined) nextProvider.discovery = nextDiscovery;

  const nextCompat = native.compat === undefined
   ? existing?.compat
   : native.compat === null
    ? undefined
    : toCompatInput(native.compat);
  if (nextCompat !== undefined) nextProvider.compat = nextCompat;

  const nextDisableStrictTools = native.disableStrictTools === undefined
   ? existing?.disableStrictTools
   : native.disableStrictTools === null
    ? undefined
    : native.disableStrictTools;
  if (nextDisableStrictTools !== undefined) nextProvider.disableStrictTools = nextDisableStrictTools;

  const nextGuardrailId = native.guardrailIdentifier === undefined
   ? existing?.guardrailIdentifier
   : native.guardrailIdentifier === null
    ? undefined
    : native.guardrailIdentifier;
  if (nextGuardrailId !== undefined) nextProvider.guardrailIdentifier = nextGuardrailId;

  const nextGuardrailVersion = native.guardrailVersion === undefined
   ? existing?.guardrailVersion
   : native.guardrailVersion === null
    ? undefined
    : native.guardrailVersion;
  if (nextGuardrailVersion !== undefined) nextProvider.guardrailVersion = nextGuardrailVersion;

  const nextGuardrailTrace = native.guardrailTrace === undefined
   ? existing?.guardrailTrace
   : native.guardrailTrace === null
    ? undefined
    : native.guardrailTrace;
  if (nextGuardrailTrace !== undefined) nextProvider.guardrailTrace = nextGuardrailTrace;

  const nextRequestMetadata = native.requestMetadata === undefined
   ? existing?.requestMetadata
   : native.requestMetadata === null
    ? undefined
    : { ...native.requestMetadata };
  if (nextRequestMetadata !== undefined) nextProvider.requestMetadata = nextRequestMetadata;

  const nextRemoteCompaction = native.remoteCompaction === undefined
   ? existing?.remoteCompaction
   : native.remoteCompaction === null
    ? undefined
    : toRemoteCompactionInput(native.remoteCompaction);
  if (nextRemoteCompaction !== undefined) nextProvider.remoteCompaction = nextRemoteCompaction;

  const nextTransport = native.transport === undefined
   ? existing?.transport
   : native.transport === null
    ? undefined
    : native.transport;
  if (nextTransport !== undefined) nextProvider.transport = nextTransport;

  if (native.models !== undefined) {
   const existingModelsById = new Map<string, NativeLoadedModel>();
   for (const row of existing?.models ?? []) existingModelsById.set(row.id, row);
   if (native.models.length > 0) {
    nextProvider.models = native.models.map(model => toModelDefinitionInput(model, existingModelsById.get(model.id)?.headers));
   }
   for (const [key, metaModel] of Object.entries(state.metadata.models)) {
    if (metaModel.provider === providerId) delete state.metadata.models[key];
   }
  } else if (existing?.models !== undefined) {
   nextProvider.models = existing.models.map(row => ({ ...row }));
  }

  if (native.modelOverrides !== undefined) {
   const existingOverrides = existing?.modelOverrides ?? {};
   const nextOverrides: Record<string, NativeModelOverride> = {};
   for (const [modelId, override] of Object.entries(native.modelOverrides)) {
    if (PROTOTYPE_KEY_HAZARDS.has(modelId) || override === null) continue;
    nextOverrides[modelId] = toModelOverrideInput(override, existingOverrides[modelId]?.headers);
   }
   if (Object.keys(nextOverrides).length > 0) nextProvider.modelOverrides = nextOverrides;
  } else if (existing?.modelOverrides !== undefined) {
   nextProvider.modelOverrides = { ...existing.modelOverrides };
  }

  let nextAuth = native.auth === undefined
   ? existing?.auth
   : native.auth === null
    ? undefined
    : native.auth;
  if ((nextProvider.models?.length ?? 0) > 0 && !nextProvider.apiKey) {
   if (nextAuth === undefined || (native.auth === undefined && native.configApiKey === null && nextAuth === 'apiKey')) {
    nextAuth = 'none';
   }
  }
  if (nextAuth !== undefined) nextProvider.auth = nextAuth;
  const hasOverrideOrModels = Boolean(
   nextProvider.baseUrl
   || nextProvider.headers
   || nextProvider.apiKey
   || nextProvider.auth === 'none'
   || nextProvider.compat
   || nextProvider.disableStrictTools
   || nextProvider.guardrailIdentifier
   || nextProvider.requestMetadata
   || nextProvider.remoteCompaction
   || (nextProvider.modelOverrides && Object.keys(nextProvider.modelOverrides).length > 0)
   || nextProvider.discovery
   || (nextProvider.models && nextProvider.models.length > 0)
  );

  state.config.providers ??= {};
  if (!hasOverrideOrModels && isBuiltInProvider(providerId)) {
   delete state.config.providers[providerId];
  } else {
   state.config.providers[providerId] = nextProvider;
  }

  if (native.name === null) {
   delete state.metadata.providerNames[providerId];
  } else if (native.name !== undefined) {
   state.metadata.providerNames[providerId] = native.name;
  } else if (configuration?.name) {
   state.metadata.providerNames[providerId] = configuration.name;
  }

  if (native.headers !== undefined || native.headersPatch !== undefined) {
   delete state.metadata.providerHeaders[providerId];
  }
  if (configuration?.credentialRef !== undefined) {
   state.metadata.defaultCredentials[providerId] = configuration.credentialRef;
  }

  const legacyName = state.metadata.providerNames[providerId] ?? configuration?.name ?? resolveProviderDisplayName(providerId);
  const legacyProtocol = configuration?.protocol ?? apiProtocol(nextProvider.api);
  const legacyEndpoint = nextProvider.baseUrl ?? configuration?.endpoint;
  const legacyParsed = ProviderConfigurationSchema.safeParse({
   providerId,
   name: legacyName,
   endpoint: legacyEndpoint,
   protocol: legacyProtocol,
   credentialRef: configuration?.credentialRef ?? this.defaultCredentialRef(providerId),
  });
  if (legacyParsed.success && (configuration !== undefined || state.metadata.providers[providerId] !== undefined) && (nextProvider.models?.length ?? 0) > 0) {
   state.metadata.providers[providerId] = legacyParsed.data;
  } else {
   delete state.metadata.providers[providerId];
  }
 }

 async configureProvider(input: ProviderConfigureRequest, revision: string): Promise<ProviderMutationResult> {
  const request = ProviderConfigureRequestSchema.parse(input);
  const targetProviderId = request.native?.providerId ?? request.configuration?.providerId;
  if (!targetProviderId || targetProviderId.includes('/') || PROTOTYPE_KEY_HAZARDS.has(targetProviderId)) {
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Provider identity is invalid');
  }
  PositiveCounterSchema.parse(revision);
  const state = await this.load();
  await this.reloadCredentials();
  await this.syncModelPolicies();

  if (request.native !== undefined) {
   this.configureNativeProvider(state, request.native, request.configuration);
   return ProviderMutationResultSchema.parse(await this.commit(state, () => {
    cfgDisabledProviders.set(this.context.settings, cfgDisabledProviders.get(this.context.settings).filter(id => id !== targetProviderId));
   }, () => ProviderMutationResultSchema.parse({ revision, providerId: targetProviderId, provider: this.provider(targetProviderId) })));
  }

  if (!request.configuration) {
   throw new ProjectionError(422, 'INVALID_REQUEST', 'Provider configuration is missing');
  }
  const configuration = {
   ...request.configuration,
   endpoint: customProviderBaseUrl(request.configuration.endpoint, request.configuration.protocol),
  };
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
  delete state.metadata.providerNames[request.providerId];
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
  const reasoning: NativeModelDefinition['thinking'] = model.reasoningOptions.length > 0
   ? { mode: existing?.thinking?.mode ?? 'effort', efforts: model.reasoningOptions.map(option => nativeThinkingEffort(option.reasoningEffort)) }
   : undefined;
  const cost = model.pricing === null ? existing?.cost : {
   input: model.pricing.inputPerMillionTokens, output: model.pricing.outputPerMillionTokens,
   cacheRead: model.pricing.cacheReadPerMillionTokens ?? 0, cacheWrite: model.pricing.cacheWritePerMillionTokens ?? 0,
  };
  state.config.providers ??= {};
  const provider: NativeProviderConfig = { ...configuredProvider, api: nativeProviderApi(api), baseUrl };
  const raw: NativeModelDefinition = {
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
  const raw: NativeModelDefinition = {
   id: model.modelId, name: model.name, api: modelApi, kind: 'image', input: ['text'],
  };
  state.config.providers ??= {};
  const provider: NativeProviderConfig = {
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
