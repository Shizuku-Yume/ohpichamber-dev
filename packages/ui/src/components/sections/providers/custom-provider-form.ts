import { ModelSchema, ProviderConfigureRequestSchema, ProviderModelDiscoveryRequestSchema } from '@openchamber/agent-contract';
import type { Model, ModelCatalogInfo, ModelInfoSource, ProviderConfigurationRead, ProviderConfigureRequest, ProviderModelDiscoveryRequest, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Custom provider form helpers.
 * Mirrors OpenCode web UI validation and request construction so a provider
 * can be defined from Settings without code changes.
 */

/**
 * OpenCode 2 names a provider's SDK in `package`, and an AI SDK package carries
 * the `aisdk:` prefix. `@ai-sdk/openai-compatible` is the default because that
 * is what a self-hosted OpenAI-shaped endpoint needs.
 */
export const CUSTOM_PROVIDER_PROTOCOLS = {
  'openai-chat': 'aisdk:@ai-sdk/openai-compatible',
  'openai-responses': 'aisdk:@ai-sdk/openai',
  'anthropic-messages': 'aisdk:@ai-sdk/anthropic',
} as const;
export type CustomProviderProtocol = keyof typeof CUSTOM_PROVIDER_PROTOCOLS;
export type CustomProviderPackage = (typeof CUSTOM_PROVIDER_PROTOCOLS)[CustomProviderProtocol];
=======

export const CUSTOM_PROVIDER_PROTOCOLS = {
  'openai-chat': 'aisdk:@ai-sdk/openai-compatible',
  'openai-responses': 'aisdk:@ai-sdk/openai',
  'anthropic-messages': 'aisdk:@ai-sdk/anthropic',
} as const;
export type CustomProviderProtocol = keyof typeof CUSTOM_PROVIDER_PROTOCOLS;
export type CustomProviderPackage = (typeof CUSTOM_PROVIDER_PROTOCOLS)[CustomProviderProtocol]
  | keyof typeof NATIVE_CUSTOM_PROVIDER_PACKAGES;
>>>>>>> upstream/main
export const CUSTOM_PROVIDER_ID = '__custom_provider__';
export const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;

export type CustomProviderProtocol = (typeof CUSTOM_PROVIDER_PROTOCOLS)[number];

<<<<<<< HEAD
export const isCustomProviderProtocol = (value: string): value is CustomProviderProtocol =>
  CUSTOM_PROVIDER_PROTOCOLS.some((protocol) => protocol === value);
||||||| bc50ba56aa
/** One reasoning level as OpenCode stores it: an id plus the request change. */
type ModelVariantConfig = Model['variants'][number];
/** What one reasoning level changes on the request. */
export type ModelVariantOverlay = Omit<ModelVariantConfig, 'id'>;
=======
type ModelVariantConfig = Model['variants'][number];
export type ModelVariantOverlay = Omit<ModelVariantConfig, 'id'>;
>>>>>>> upstream/main

/** The fields auto-fill may write, and the only ones whose provenance it tracks. */
export type ModelAutoFillField = 'contextWindow' | 'maxOutputTokens' | 'modalities' | 'toolsSupported' | 'reasoning' | 'pricing';

export interface ModelRow {
  row: string;
  modelId: string;
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
<<<<<<< HEAD
  modalities: Model['modalities'];
  /**
   * The row's native runner kind. OMP publishes `audio` only for `tts`/`stt`
   * models and `embedding` only for embedding models, and the writer rejects
   * either on any other kind, so which chips may be offered follows from here.
   */
  nativeKind: NativeModelKind;
  toolsSupported?: boolean;
  /** Canonical fields the controls do not edit (reasoning, pricing, status, enabled). */
  base?: Model;
  /** Auto-filled reasoning support, overriding `base`; absent when no catalog answered. */
  reasoningEffortSupported?: boolean;
  /** Auto-filled pricing, overriding `base`; absent when no catalog answered. */
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
export interface HeaderRow { row: string; name: string; value: string }
/** What Save does with the uploaded logo image. */
||||||| bc50ba56aa
  inputCapabilities: string[];
  outputCapabilities: string[];
  tools: boolean;
  /**
   * The model's type as saved (`image`, `decision`, ...), or set by the image
   * generation checkbox. Undefined for a model without one, which OpenCode
   * treats as chat; then nothing is written.
   */
  type?: string;
  /**
   * Whether the capabilities above are known (saved config, discovery, or the
   * user's own edit). Unknown ones are not written, so a save never replaces
   * what OpenCode knows about the model with a text-only default.
   */
  capabilitiesKnown: boolean;
  metadataSource?: 'provider-api' | 'models.dev' | 'manual';
  /** Comma-separated reasoning levels, e.g. "low, medium, high". */
  variants: string;
  /**
   * Levels loaded from the saved config, kept verbatim so a hand-written
   * overlay survives an edit. Emptied when the protocol changes; undefined
   * only for rows the user added in this form.
   */
  savedVariants?: Record<string, ModelVariantOverlay>;
};

export type HeaderRow = {
  row: string;
  key: string;
  value: string;
};

/** What Save does with the uploaded logo image. */
=======
  inputCapabilities: string[];
  outputCapabilities: string[];
  tools: boolean;
  type?: string;
  capabilitiesKnown: boolean;
  metadataSource?: 'provider-api' | 'models.dev' | 'manual';
  variants: string;
  savedVariants?: Record<string, ModelVariantOverlay>;
};

export type HeaderRow = {
  row: string;
  key: string;
  value: string;
};

>>>>>>> upstream/main
export type CustomProviderLogoPlan =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upload'; file: File };

<<<<<<< HEAD
export interface CustomProviderFormState {
  providerId: string;
||||||| bc50ba56aa
export type CustomProviderFormState = {
  providerID: string;
=======
export type ClientCertificateFields = {
  cert: string;
  key: string;
  passphrase: string;
};

export type CustomProviderFormState = {
  providerID: string;
>>>>>>> upstream/main
  name: string;
<<<<<<< HEAD
  endpoint: string;
  protocol: CustomProviderProtocol;
  credentialRef: string | null;
  apiKey: string;
  replaceHeaders: boolean;
  headerNames: string[];
  headers: HeaderRow[];
  models: ModelRow[];
||||||| bc50ba56aa
  /** Null keeps the provider's own logo or the generic fallback. */
=======
>>>>>>> upstream/main
  icon: CustomProviderIcon | null;
  logo: File | 'removed' | null;
<<<<<<< HEAD
}
export interface CustomProviderPersistPlan {
  request: ProviderConfigureRequest;
||||||| bc50ba56aa
  protocol: CustomProviderProtocol;
  baseURL: string;
=======
  protocol: CustomProviderProtocol;
  package?: CustomProviderPackage;
  baseURL: string;
>>>>>>> upstream/main
  apiKey: string;
<<<<<<< HEAD
  icon: CustomProviderIcon | null;
  logo: CustomProviderLogoPlan;
}
||||||| bc50ba56aa
  models: ModelRow[];
  headers: HeaderRow[];
};
=======
  models: ModelRow[];
  headers: HeaderRow[];
  tls: ClientCertificateFields | null;
};
>>>>>>> upstream/main

export type CustomProviderTranslator = (key: I18nKey) => string;

export interface CustomProviderFieldErrors {
  providerId?: string;
  name?: string;
<<<<<<< HEAD
  endpoint?: string;
}
export interface ModelFieldErrors {
  modelId?: string;
||||||| bc50ba56aa
  baseURL?: string;
  apiKey?: string;
};

export type ModelFieldErrors = {
  id?: string;
=======
  baseURL?: string;
  apiKey?: string;
  tlsCert?: string;
  tlsKey?: string;
};

export type ModelFieldErrors = {
  id?: string;
>>>>>>> upstream/main
  name?: string;
  contextWindow?: string;
  maxOutputTokens?: string;
}
export interface HeaderFieldErrors {
  name?: string;
  value?: string;
<<<<<<< HEAD
}
export interface CustomProviderValidation {
  fields: CustomProviderFieldErrors;
||||||| bc50ba56aa
};

export type CustomProviderConfig = {
  package: CustomProviderPackage;
  name: string;
  env?: string[];
  settings: {
    baseURL: string;
  };
  headers?: Record<string, string>;
  models: Record<string, CustomProviderModelConfig>;
};

export type CustomProviderModelConfig = {
  modelID: string;
  name: string;
  type?: string;
  variants?: ModelVariantConfig[];
  limit?: { context?: number; output?: number };
  capabilities?: { tools: boolean; input: string[]; output: string[] };
};

export type CustomProviderPersistPlan = {
  providerID: string;
  name: string;
  icon: CustomProviderIcon | null;
  logo: CustomProviderLogoPlan;
  /** Literal API key stored as an OpenCode credential after the config write; omitted when using {env:VAR} or empty. */
  apiKey?: string;
  /** Edit without a new key or env: the provider keeps the credential OpenCode already holds. */
  keepsStoredCredential?: boolean;
  config: CustomProviderConfig;
};

export type ValidateCustomProviderInput = {
  form: CustomProviderFormState;
  t: CustomProviderTranslator;
  existingProviderIDs: ReadonlySet<string>;
  disabledProviders?: readonly string[];
  /** When editing this provider id, treat it as an allowed update target. */
  editingProviderID?: string;
  /**
   * When true, empty apiKey is allowed because auth.json already has a credential
   * (edit path). Still requires env or key when false.
   */
  allowExistingAuth?: boolean;
};

export type ValidateCustomProviderResult = {
  err: FieldErrors;
=======
};

export type CustomProviderConfig = {
  package: CustomProviderPackage;
  name: string;
  env?: string[];
  settings: {
    baseURL: string;
    tls?: StoredClientCertificate | null;
  };
  headers?: Record<string, string>;
  models: Record<string, CustomProviderModelConfig>;
};

export type StoredClientCertificate = { cert: string; key: string; passphrase?: string };

export type CustomProviderModelConfig = {
  modelID: string;
  name: string;
  type?: string;
  variants?: ModelVariantConfig[];
  limit?: { context?: number; output?: number };
  capabilities?: { tools: boolean; input: string[]; output: string[] };
};

export type CustomProviderPersistPlan = {
  providerID: string;
  name: string;
  icon: CustomProviderIcon | null;
  logo: CustomProviderLogoPlan;
  apiKey?: string;
  keepsStoredCredential?: boolean;
  config: CustomProviderConfig;
};

export type ValidateCustomProviderInput = {
  form: CustomProviderFormState;
  t: CustomProviderTranslator;
  existingProviderIDs: ReadonlySet<string>;
  disabledProviders?: readonly string[];
  editingProviderID?: string;
  allowExistingAuth?: boolean;
};

export type ValidateCustomProviderResult = {
  err: FieldErrors;
>>>>>>> upstream/main
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  valid: boolean;
}

<<<<<<< HEAD
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
||||||| bc50ba56aa
export type ProviderLikeForCustomForm = {
  id: string;
  name?: string;
  env?: string[];
  /** v2 spelling. */
  package?: string;
  settings?: Record<string, unknown> | null;
  headers?: Record<string, string> | null;
  /** v1 spelling, still read from older config entries. */
  options?: Record<string, unknown> | null;
  models?:
    | Array<{
      id?: string;
      modelID?: string;
      name?: string;
      type?: string;
      package?: string;
      api?: { npm?: string };
      variants?: readonly ModelVariantConfig[];
      limit?: { context?: number; output?: number };
      capabilities?: { tools?: boolean; input?: string[]; output?: string[] };
    }>
    | Record<string, unknown>;
};

/** The SDK package of a provider or of one of its models, either spelling. */
const readPackage = (
  source: { package?: string; api?: { npm?: string } } | null | undefined,
): string | undefined => {
  if (!source) return undefined;
  if (typeof source.package === 'string' && source.package) return source.package;
  const npm = source.api?.npm;
  return typeof npm === 'string' && npm ? `aisdk:${npm}` : undefined;
};

/** The provider's request settings, v2 `settings` first, v1 `options` after. */
const readSettings = (provider: ProviderLikeForCustomForm): Record<string, unknown> => {
  if (provider.settings && typeof provider.settings === 'object') return provider.settings;
  if (provider.options && typeof provider.options === 'object') return provider.options;
  return {};
};

let rowCounter = 0;

const nextRow = (): string => `row-${rowCounter++}`;

export const createModelRow = (): ModelRow => ({
  row: nextRow(),
  id: '',
  name: '',
  contextWindow: '',
  maxOutputTokens: '',
  inputCapabilities: ['text'],
  outputCapabilities: ['text'],
  tools: true,
  capabilitiesKnown: false,
  variants: '',
});

const discoveredLimitSchema = z.object({ context: z.number().optional(), output: z.number().optional() });
const discoveredCapabilitiesSchema = z.object({
  tools: z.boolean(),
  input: z.array(z.string()),
  output: z.array(z.string()),
});
const discoveredModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  limit: discoveredLimitSchema.optional(),
  capabilities: discoveredCapabilitiesSchema.optional(),
  metadata: z.object({
    providerID: z.string(),
    modelID: z.string(),
    name: z.string().optional(),
    limit: discoveredLimitSchema.optional(),
    capabilities: discoveredCapabilitiesSchema.optional(),
  }).optional(),
});

/** What `POST /api/provider/discover-models` answers on success. */
export const modelDiscoveryResponseSchema = z.object({ models: z.array(discoveredModelSchema) });
/** What it answers on failure. */
export const modelDiscoveryErrorSchema = z.object({ error: z.string() });

export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;
=======
export type ProviderLikeForCustomForm = {
  id: string;
  name?: string;
  env?: string[];
  package?: string;
  settings?: Record<string, unknown> | null;
  headers?: Record<string, string> | null;
  options?: Record<string, unknown> | null;
  models?:
    | Array<{
      id?: string;
      modelID?: string;
      name?: string;
      type?: string;
      package?: string;
      api?: { npm?: string };
      variants?: readonly ModelVariantConfig[];
      limit?: { context?: number; output?: number };
      capabilities?: { tools?: boolean; input?: string[]; output?: string[] };
    }>
    | Record<string, unknown>;
};

const readPackage = (
  source: { package?: string; api?: { npm?: string } } | null | undefined,
): string | undefined => {
  if (!source) return undefined;
  if (typeof source.package === 'string' && source.package) return source.package;
  const npm = source.api?.npm;
  return typeof npm === 'string' && npm ? `aisdk:${npm}` : undefined;
};

const readSettings = (provider: ProviderLikeForCustomForm): Record<string, unknown> => {
  if (provider.settings && typeof provider.settings === 'object') return provider.settings;
  if (provider.options && typeof provider.options === 'object') return provider.options;
  return {};
};

let rowCounter = 0;

const nextRow = (): string => `row-${rowCounter++}`;

export const createModelRow = (): ModelRow => ({
  row: nextRow(),
  id: '',
  name: '',
  contextWindow: '',
  maxOutputTokens: '',
  inputCapabilities: ['text'],
  outputCapabilities: ['text'],
  tools: true,
  capabilitiesKnown: false,
  variants: '',
});

const discoveredLimitSchema = z.object({ context: z.number().optional(), output: z.number().optional() });
const discoveredCapabilitiesSchema = z.object({
  tools: z.boolean(),
  input: z.array(z.string()),
  output: z.array(z.string()),
});
const discoveredModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  limit: discoveredLimitSchema.optional(),
  capabilities: discoveredCapabilitiesSchema.optional(),
  metadata: z.object({
    providerID: z.string(),
    modelID: z.string(),
    name: z.string().optional(),
    limit: discoveredLimitSchema.optional(),
    capabilities: discoveredCapabilitiesSchema.optional(),
  }).optional(),
});

export const modelDiscoveryResponseSchema = z.object({ models: z.array(discoveredModelSchema) });
export const modelDiscoveryErrorSchema = z.object({ error: z.string() });

export type DiscoveredModel = z.infer<typeof discoveredModelSchema>;
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
/**
 * A form row for one discovered model. The provider's own numbers win over
 * models.dev field by field; a model nothing describes defaults to text in,
 * text out, with tool calls.
 */
export const modelRowFromDiscovery = (model: DiscoveredModel): ModelRow => {
  const metadata = model.metadata;
  const context = model.limit?.context ?? metadata?.limit?.context;
  const output = model.limit?.output ?? metadata?.limit?.output;
  const capabilities = model.capabilities ?? metadata?.capabilities;
  const describedByProvider = Boolean(model.limit || model.capabilities);
  return {
    ...createModelRow(),
    id: model.id,
    name: model.name !== model.id ? model.name : (metadata?.name ?? model.id),
    contextWindow: context ? String(context) : '',
    maxOutputTokens: output ? String(output) : '',
    inputCapabilities: capabilities?.input ?? ['text'],
    outputCapabilities: capabilities?.output ?? ['text'],
    tools: capabilities?.tools ?? true,
    capabilitiesKnown: Boolean(capabilities),
    ...(describedByProvider
      ? { metadataSource: 'provider-api' as const }
      : metadata ? { metadataSource: 'models.dev' as const } : {}),
  };
=======
export const modelRowFromDiscovery = (model: DiscoveredModel): ModelRow => {
  const metadata = model.metadata;
  const context = model.limit?.context ?? metadata?.limit?.context;
  const output = model.limit?.output ?? metadata?.limit?.output;
  const capabilities = model.capabilities ?? metadata?.capabilities;
  const describedByProvider = Boolean(model.limit || model.capabilities);
  return {
    ...createModelRow(),
    id: model.id,
    name: model.name !== model.id ? model.name : (metadata?.name ?? model.id),
    contextWindow: context ? String(context) : '',
    maxOutputTokens: output ? String(output) : '',
    inputCapabilities: capabilities?.input ?? ['text'],
    outputCapabilities: capabilities?.output ?? ['text'],
    tools: capabilities?.tools ?? true,
    capabilitiesKnown: Boolean(capabilities),
    ...(describedByProvider
      ? { metadataSource: 'provider-api' as const }
      : metadata ? { metadataSource: 'models.dev' as const } : {}),
  };
>>>>>>> upstream/main
};

<<<<<<< HEAD
/**
 * The native runner kinds whose modality chips differ. A canonical `Model`
 * carries no kind, so a tts or stt model is only recognizable by its `audio`
 * modality; both allow the same chips, so they collapse into one kind here.
 */
export type NativeModelKind = 'chat' | 'tts' | 'stt' | 'embedding';
||||||| bc50ba56aa
/**
 * The request change for one reasoning level, spelled the way OpenCode spells
 * it for its own providers of the same protocol (core/src/variant.ts). The
 * `aisdk:` packages a custom provider uses get no automatic levels there.
 */
function customVariantOverlay(protocol: CustomProviderProtocol, effort: string): ModelVariantOverlay {
  switch (protocol) {
    case 'openai-chat':
      return { settings: { reasoningEffort: effort } };
    case 'openai-responses':
      return {
        settings: { reasoningEffort: effort, reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] },
      };
    case 'anthropic-messages':
      return { settings: { thinking: { type: 'adaptive', display: 'summarized' }, effort } };
  }
}
=======
function customVariantOverlay(protocol: CustomProviderProtocol, effort: string): ModelVariantOverlay {
  switch (protocol) {
    case 'openai-chat':
      return { settings: { reasoningEffort: effort } };
    case 'openai-responses':
      return {
        settings: { reasoningEffort: effort, reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] },
      };
    case 'anthropic-messages':
      return { settings: { thinking: { type: 'adaptive', display: 'summarized' }, effort } };
  }
}
>>>>>>> upstream/main

<<<<<<< HEAD
const BASE_MODALITIES = ['text', 'image'] as const;
||||||| bc50ba56aa
function parseVariantIDs(value: string): string[] {
  const ids = value.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function readSavedVariants(variants: readonly ModelVariantConfig[] | undefined): Record<string, ModelVariantOverlay> {
  return Object.fromEntries((variants ?? []).map(({ id, ...overlay }) => [id, overlay]));
}

export const createHeaderRow = (): HeaderRow => ({
  row: nextRow(),
  key: '',
  value: '',
});

export const createEmptyCustomProviderForm = (): CustomProviderFormState => ({
  providerID: '',
  name: '',
  icon: null,
  logo: null,
  protocol: 'openai-chat',
  baseURL: '',
  apiKey: '',
  models: [createModelRow()],
  headers: [createHeaderRow()],
});
=======
function parseVariantIDs(value: string): string[] {
  const ids = value.split(/[,\s]+/).map((id) => id.trim()).filter(Boolean);
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

function readSavedVariants(variants: readonly ModelVariantConfig[] | undefined): Record<string, ModelVariantOverlay> {
  return Object.fromEntries((variants ?? []).map(({ id, ...overlay }) => [id, overlay]));
}

export const createHeaderRow = (): HeaderRow => ({
  row: nextRow(),
  key: '',
  value: '',
});

export const EMPTY_CLIENT_CERTIFICATE: ClientCertificateFields = { cert: '', key: '', passphrase: '' };

export const createEmptyCustomProviderForm = (): CustomProviderFormState => ({
  providerID: '',
  name: '',
  icon: null,
  logo: null,
  protocol: 'openai-chat',
  baseURL: '',
  apiKey: '',
  models: [createModelRow()],
  headers: [createHeaderRow()],
  tls: EMPTY_CLIENT_CERTIFICATE,
});
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * Which input chips a model of this kind can actually save. OpenChamber's
 * writer keeps `audio` only for tts/stt runners and `embedding` only for an
 * embedding runner; on any other kind it rejects the request with 422.
 */
export function modelModalitiesForKind(kind: NativeModelKind): readonly Model['modalities'][number][] {
  if (kind === 'tts' || kind === 'stt') return [...BASE_MODALITIES, 'audio'];
  if (kind === 'embedding') return [...BASE_MODALITIES, 'embedding'];
  return BASE_MODALITIES;
||||||| bc50ba56aa
/**
 * The live provider list reports OpenCode's own implementation of an `aisdk:`
 * package (`aisdk:@ai-sdk/openai` is served as `@opencode/ai/providers/openai`),
 * so both spellings map to the protocol the form saved.
 */
const NATIVE_CUSTOM_PROVIDER_PACKAGES: Record<string, CustomProviderProtocol> = {
  '@opencode/ai/providers/openai-compatible': 'openai-chat',
  '@opencode/ai/providers/openai': 'openai-responses',
  '@opencode/ai/providers/anthropic': 'anthropic-messages',
};

function protocolFromPackage(pkg: string | undefined): CustomProviderProtocol {
  const native = pkg ? NATIVE_CUSTOM_PROVIDER_PACKAGES[pkg] : undefined;
  if (native) return native;
  switch (pkg) {
    case 'aisdk:@ai-sdk/openai':
    case '@ai-sdk/openai':
      return 'openai-responses';
    case 'aisdk:@ai-sdk/anthropic':
    case '@ai-sdk/anthropic':
      return 'anthropic-messages';
    default:
      return 'openai-chat';
  }
=======
const FILE_REFERENCE_PATTERN = /^\{file:([^}]+)\}$/;

const storedTlsSchema = z.object({
  cert: z.string().optional(),
  key: z.string().optional(),
  passphrase: z.string().optional(),
});
type StoredTlsFields = z.infer<typeof storedTlsSchema>;

const clientCertificateFieldOf = (value: string | undefined): string => {
  if (value === undefined) return '';
  return value.trim().match(FILE_REFERENCE_PATTERN)?.[1]?.trim() ?? value;
};

const storedClientCertificateValueOf = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('{') || trimmed.includes('-----BEGIN')) return trimmed;
  return `{file:${trimmed}}`;
};

const isRelativeCertificatePath = (value: string): boolean => {
  const trimmed = value.trim();
  const path = trimmed.match(FILE_REFERENCE_PATTERN)?.[1]?.trim()
    ?? (trimmed.startsWith('{') || trimmed.includes('-----BEGIN') ? '' : trimmed);
  return Boolean(path) && !/^(\/|~\/|[A-Za-z]:[\\/]|\\\\)/.test(path);
};

const clientCertificateFieldsOf = (stored: StoredTlsFields | undefined): ClientCertificateFields => {
  if (!stored) return EMPTY_CLIENT_CERTIFICATE;
  return {
    cert: clientCertificateFieldOf(stored.cert),
    key: clientCertificateFieldOf(stored.key),
    passphrase: stored.passphrase ?? '',
  };
};

export const storedClientCertificateOf = (
  fields: ClientCertificateFields | null,
): StoredClientCertificate | null | undefined => {
  if (fields === null) return undefined;
  const cert = storedClientCertificateValueOf(fields.cert);
  const key = storedClientCertificateValueOf(fields.key);
  const passphrase = fields.passphrase.trim() ? fields.passphrase : '';
  if (!cert && !key && !passphrase) return null;
  const stored: StoredClientCertificate = { cert, key };
  if (passphrase) stored.passphrase = passphrase;
  return stored;
};

const NATIVE_CUSTOM_PROVIDER_PACKAGES = {
  '@opencode/ai/providers/openai-compatible': 'openai-chat',
  '@opencode/ai/providers/openai-compatible/responses': 'openai-responses',
  '@opencode/ai/providers/openai-compatible-responses': 'openai-responses',
  '@opencode/ai/providers/openai': 'openai-responses',
  '@opencode/ai/providers/openai/chat': 'openai-chat',
  '@opencode/ai/providers/openai/responses': 'openai-responses',
  '@opencode/ai/providers/anthropic': 'anthropic-messages',
  '@opencode/ai/providers/anthropic-compatible': 'anthropic-messages',
} as const;

function isNativeCustomProviderPackage(pkg: string | undefined): pkg is keyof typeof NATIVE_CUSTOM_PROVIDER_PACKAGES {
  return pkg !== undefined && Object.hasOwn(NATIVE_CUSTOM_PROVIDER_PACKAGES, pkg);
}

function protocolFromPackage(pkg: string | undefined): CustomProviderProtocol {
  if (isNativeCustomProviderPackage(pkg)) return NATIVE_CUSTOM_PROVIDER_PACKAGES[pkg];
  switch (pkg) {
    case 'aisdk:@ai-sdk/openai':
    case '@ai-sdk/openai':
      return 'openai-responses';
    case 'aisdk:@ai-sdk/anthropic':
    case '@ai-sdk/anthropic':
      return 'anthropic-messages';
    default:
      return 'openai-chat';
  }
>>>>>>> upstream/main
}

<<<<<<< HEAD
/**
 * Drops a modality the kind cannot save and keeps text or image, which the
 * writer requires even from a tts or embedding runner.
 */
export function normalizeModelModalities(
  kind: NativeModelKind,
  modalities: readonly Model['modalities'][number][],
): Model['modalities'] {
  const allowed = modelModalitiesForKind(kind);
  const kept = [...new Set(modalities)].filter((modality) => allowed.includes(modality));
  if (!kept.some((modality) => modality === 'text' || modality === 'image')) kept.unshift('text');
  return kept;
}

/**
 * A catalog's text/image inputs in the editor's order: text first. The writer
 * and the pickers read the list as-is, so an OpenRouter answer that lists
 * `image` before `text` must not produce a row that reads image-first.
 */
export function catalogInputs(input: readonly ('text' | 'image')[]): Array<'text' | 'image'> {
  return (['text', 'image'] as const).filter((modality) => input.includes(modality));
}

/** A canonical model's kind as far as the editor can tell; absent kinds are chat. */
function nativeKindOf(modalities: readonly Model['modalities'][number][]): NativeModelKind {
  if (modalities.includes('embedding')) return 'embedding';
  if (modalities.includes('audio')) return 'tts';
  return 'chat';
}

/** A query string is part of a gateway endpoint (`?api-version=` on Azure);
 *  embedded credentials and fragments are not. */
const isHttpEndpoint = (value: string): boolean => {
  try {
    const endpoint = new URL(value);
    return (endpoint.protocol === 'http:' || endpoint.protocol === 'https:')
      && endpoint.username === '' && endpoint.password === '' && endpoint.hash === '';
  } catch {
||||||| bc50ba56aa
function parseEnvApiKey(apiKey: string): { env?: string; key?: string } {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {};
  }
  const envMatch = trimmed.match(ENV_KEY_PATTERN);
  const env = envMatch?.[1]?.trim();
  if (env) {
    return { env };
  }
  return { key: trimmed };
}

export function isCustomOpenAICompatibleProvider(provider: ProviderLikeForCustomForm): boolean {
  const settings = readSettings(provider);
  const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL.trim() : '';
  if (baseURL && BASE_URL_PATTERN.test(baseURL)) {
    return true;
  }

  const knownPackages = new Set<string>([
    ...Object.values(CUSTOM_PROVIDER_PROTOCOLS),
    ...Object.keys(NATIVE_CUSTOM_PROVIDER_PACKAGES),
  ]);
  if (knownPackages.has(readPackage(provider) ?? '')) {
    return true;
  }

  const models = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.values(provider.models)
      : []);

  return models.some((model) => {
    if (!model || typeof model !== 'object') {
      return false;
    }
    // SAFETY: only the two package spellings are read off the entry; anything
    // else stays untouched.
    return knownPackages.has(readPackage(model as { package?: string; api?: { npm?: string } }) ?? '');
  });
}

export type ProviderConfigSourcesLike = {
  user?: { exists?: boolean };
  project?: { exists?: boolean };
  custom?: { exists?: boolean };
};

export type ProviderConfigScope = 'user' | 'project' | 'custom';

/**
 * True when a provider both looks OpenAI-compatible-custom and is defined in a
 * user/project/custom OpenCode config layer. Catalog-only providers often share
 * the same npm/baseURL signals and must not get Edit / config overrides.
 */
export function isConfigDefinedCustomProvider(
  provider: ProviderLikeForCustomForm,
  sources: ProviderConfigSourcesLike | null | undefined,
): boolean {
  if (!sources) {
=======
function parseEnvApiKey(apiKey: string): { env?: string; key?: string } {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return {};
  }
  const envMatch = trimmed.match(ENV_KEY_PATTERN);
  const env = envMatch?.[1]?.trim();
  if (env) {
    return { env };
  }
  return { key: trimmed };
}

export function isCustomOpenAICompatibleProvider(provider: ProviderLikeForCustomForm): boolean {
  const settings = readSettings(provider);
  const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL.trim() : '';
  if (baseURL && BASE_URL_PATTERN.test(baseURL)) {
    return true;
  }

  const knownPackages = new Set<string>([
    ...Object.values(CUSTOM_PROVIDER_PROTOCOLS),
    ...Object.keys(NATIVE_CUSTOM_PROVIDER_PACKAGES),
  ]);
  if (knownPackages.has(readPackage(provider) ?? '')) {
    return true;
  }

  const models = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.values(provider.models)
      : []);

  return models.some((model) => {
    if (!model || typeof model !== 'object') {
      return false;
    }
    // SAFETY: only the two package spellings are read off the entry; anything
    // else stays untouched.
    return knownPackages.has(readPackage(model as { package?: string; api?: { npm?: string } }) ?? '');
  });
}

export type ProviderConfigSourcesLike = {
  user?: { exists?: boolean };
  project?: { exists?: boolean };
  custom?: { exists?: boolean };
};

export type ProviderConfigScope = 'user' | 'project' | 'custom';

export function isConfigDefinedCustomProvider(
  provider: ProviderLikeForCustomForm,
  sources: ProviderConfigSourcesLike | null | undefined,
): boolean {
  if (!sources) {
>>>>>>> upstream/main
    return false;
  }
};

const isCanonicalModel = (model: Model | ProviderModelDiscoveryResult['models'][number] | undefined): model is Model =>
  model !== undefined && 'modalities' in model;

<<<<<<< HEAD
/**
 * A row from a saved model knows every field it carries was set by a person,
 * so auto-fill leaves all of them alone. A new row starts with nothing typed.
 */
export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const canonical = isCanonicalModel(model) ? { ...model } : undefined;
  const { modelId = '', name = '', contextWindow, maxOutputTokens } = model ?? {};
  const modalities: Model['modalities'] = canonical ? [...canonical.modalities] : ['text'];
  const nativeKind = nativeKindOf(modalities);
  const typed: ModelAutoFillField[] = canonical ? ['contextWindow', 'maxOutputTokens', 'modalities', 'reasoning', 'pricing'] : [];
  if (canonical?.toolsSupported !== undefined) typed.push('toolsSupported');
||||||| bc50ba56aa
/**
 * Effective writable config layer for a provider, matching OpenCode merge
 * precedence: custom > project > user.
 */
export function resolveProviderConfigScope(
  sources: ProviderConfigSourcesLike | null | undefined,
): ProviderConfigScope {
  if (sources?.custom?.exists) {
    return 'custom';
  }
  if (sources?.project?.exists) {
    return 'project';
  }
  return 'user';
}

export function providerToCustomFormState(provider: ProviderLikeForCustomForm): CustomProviderFormState {
  const settings = readSettings(provider);
  const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL : '';
  const headersSource = provider.headers && typeof provider.headers === 'object'
    ? provider.headers
    : (settings.headers && typeof settings.headers === 'object' && !Array.isArray(settings.headers)
      ? settings.headers as Record<string, unknown>
      : {});
  const headerRows = Object.entries(headersSource)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([key, value]) => ({ row: nextRow(), key, value }));

  const modelEntries = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.entries(provider.models).map(([id, value]) => {
          const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          return {
            id,
            modelID: typeof entry.modelID === 'string' ? entry.modelID : id,
            name: typeof entry.name === 'string' ? entry.name : id,
            type: z.string().safeParse(entry.type).data,
            package: typeof entry.package === 'string' ? entry.package : undefined,
            variants: storedVariantsSchema.safeParse(entry.variants).data,
            limit: storedLimitSchema.safeParse(entry.limit).data,
            capabilities: storedCapabilitiesSchema.safeParse(entry.capabilities).data,
          };
        })
      : []);

  const models = modelEntries.length > 0
    ? modelEntries.map((model) => {
        const id = typeof model?.modelID === 'string' && model.modelID
          ? model.modelID
          : (typeof model?.id === 'string' ? model.id : '');
        const savedVariants = readSavedVariants(model?.variants);
        return {
          row: nextRow(),
          id,
          name: typeof model?.name === 'string' ? model.name : id,
          contextWindow: model.limit?.context ? String(model.limit.context) : '',
          maxOutputTokens: model.limit?.output ? String(model.limit.output) : '',
          inputCapabilities: model.capabilities?.input ?? ['text'],
          outputCapabilities: model.capabilities?.output ?? ['text'],
          tools: model.capabilities?.tools ?? true,
          type: model.type,
          capabilitiesKnown: Boolean(model.capabilities),
          variants: Object.keys(savedVariants).join(', '),
          savedVariants,
        };
      })
    : [createModelRow()];

  const envName = Array.isArray(provider.env)
    ? provider.env.find((entry) => typeof entry === 'string' && entry.trim().length > 0)?.trim()
    : undefined;

  const modelPackage = modelEntries
    .map((model) => readPackage(model))
    .find((pkg) => Boolean(pkg));

=======
export function resolveProviderConfigScope(
  sources: ProviderConfigSourcesLike | null | undefined,
): ProviderConfigScope {
  if (sources?.custom?.exists) {
    return 'custom';
  }
  if (sources?.project?.exists) {
    return 'project';
  }
  return 'user';
}

export function providerToCustomFormState(provider: ProviderLikeForCustomForm): CustomProviderFormState {
  const settings = readSettings(provider);
  const baseURL = typeof settings.baseURL === 'string' ? settings.baseURL : '';
  const headersSource = provider.headers && typeof provider.headers === 'object'
    ? provider.headers
    : (settings.headers && typeof settings.headers === 'object' && !Array.isArray(settings.headers)
      ? settings.headers as Record<string, unknown>
      : {});
  const headerRows = Object.entries(headersSource)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([key, value]) => ({ row: nextRow(), key, value }));

  const modelEntries = Array.isArray(provider.models)
    ? provider.models
    : (provider.models && typeof provider.models === 'object'
      ? Object.entries(provider.models).map(([id, value]) => {
          const entry = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          return {
            id,
            modelID: typeof entry.modelID === 'string' ? entry.modelID : id,
            name: typeof entry.name === 'string' ? entry.name : id,
            type: z.string().safeParse(entry.type).data,
            package: typeof entry.package === 'string' ? entry.package : undefined,
            variants: storedVariantsSchema.safeParse(entry.variants).data,
            limit: storedLimitSchema.safeParse(entry.limit).data,
            capabilities: storedCapabilitiesSchema.safeParse(entry.capabilities).data,
          };
        })
      : []);

  const models = modelEntries.length > 0
    ? modelEntries.map((model) => {
        const id = typeof model?.modelID === 'string' && model.modelID
          ? model.modelID
          : (typeof model?.id === 'string' ? model.id : '');
        const savedVariants = readSavedVariants(model?.variants);
        return {
          row: nextRow(),
          id,
          name: typeof model?.name === 'string' ? model.name : id,
          contextWindow: model.limit?.context ? String(model.limit.context) : '',
          maxOutputTokens: model.limit?.output ? String(model.limit.output) : '',
          inputCapabilities: model.capabilities?.input ?? ['text'],
          outputCapabilities: model.capabilities?.output ?? ['text'],
          tools: model.capabilities?.tools ?? true,
          type: model.type,
          capabilitiesKnown: Boolean(model.capabilities),
          variants: Object.keys(savedVariants).join(', '),
          savedVariants,
        };
      })
    : [createModelRow()];

  const envName = Array.isArray(provider.env)
    ? provider.env.find((entry) => typeof entry === 'string' && entry.trim().length > 0)?.trim()
    : undefined;

  const modelPackage = modelEntries
    .map((model) => readPackage(model))
    .find((pkg) => Boolean(pkg));

>>>>>>> upstream/main
  return {
<<<<<<< HEAD
    row: crypto.randomUUID(),
    modelId,
    name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    modalities: normalizeModelModalities(nativeKind, modalities),
    nativeKind,
    toolsSupported: canonical?.toolsSupported,
    base: canonical,
    typed: new Set(typed),
    filledFrom: {},
||||||| bc50ba56aa
    providerID: provider.id,
    name: typeof provider.name === 'string' && provider.name.trim() ? provider.name : provider.id,
    icon: null,
    logo: null,
    protocol: protocolFromPackage(readPackage(provider) ?? modelPackage),
    baseURL,
    apiKey: envName ? `{env:${envName}}` : '',
    models,
    headers: headerRows.length > 0 ? headerRows : [createHeaderRow()],
=======
    providerID: provider.id,
    name: typeof provider.name === 'string' && provider.name.trim() ? provider.name : provider.id,
    icon: null,
    logo: null,
    protocol: protocolFromPackage(readPackage(provider) ?? modelPackage),
    baseURL,
    apiKey: envName ? `{env:${envName}}` : '',
    models,
    headers: headerRows.length > 0 ? headerRows : [createHeaderRow()],
    tls: clientCertificateFieldsOf(storedTlsSchema.safeParse(settings.tls).data),
>>>>>>> upstream/main
  };
}

export function createHeaderRow(): HeaderRow {
  return { row: crypto.randomUUID(), name: '', value: '' };
}

<<<<<<< HEAD
export function createEmptyCustomProviderForm(
  initial?: ProviderConfigurationRead,
||||||| bc50ba56aa
const storedLimitSchema = z.object({ context: z.number().optional(), output: z.number().optional() });
const storedCapabilitiesSchema = z.object({
  tools: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  output: z.array(z.string()).optional(),
});

export const storedProviderEntrySchema = z.object({
  name: z.string().optional(),
  package: z.string().optional(),
  env: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.record(z.string(), z.object({
    modelID: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    package: z.string().optional(),
    variants: storedVariantsSchema.optional(),
    limit: storedLimitSchema.optional(),
    capabilities: storedCapabilitiesSchema.optional(),
  })).optional(),
});

/**
 * The provider entry as written in the OpenCode config file, returned by
 * `/api/provider/:id/source` in v2 shape. Unlike the live provider it keeps
 * `env` and carries only the reasoning levels the user wrote.
 */
export type StoredProviderEntry = z.infer<typeof storedProviderEntrySchema>;

/**
 * Edit form state for a config-defined provider. The stored entry is the
 * source of truth; the live provider only fills the name, protocol, base URL,
 * or models when the entry leaves them out (inherited from elsewhere). Live reasoning levels are never
 * loaded: OpenCode generates them, and saving them back would write levels the
 * user never configured. Without a stored entry, live models load without
 * levels, so a save leaves the models' stored levels as they are.
 */
export function providerToEditFormState(
  live: ProviderLikeForCustomForm,
  stored: StoredProviderEntry | null,
=======
const storedLimitSchema = z.object({ context: z.number().optional(), output: z.number().optional() });
const storedCapabilitiesSchema = z.object({
  tools: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  output: z.array(z.string()).optional(),
});

export const storedProviderEntrySchema = z.object({
  name: z.string().optional(),
  package: z.string().optional(),
  env: z.array(z.string()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.record(z.string(), z.object({
    modelID: z.string().optional(),
    name: z.string().optional(),
    type: z.string().optional(),
    package: z.string().optional(),
    variants: storedVariantsSchema.optional(),
    limit: storedLimitSchema.optional(),
    capabilities: storedCapabilitiesSchema.optional(),
  })).optional(),
});

export type StoredProviderEntry = z.infer<typeof storedProviderEntrySchema>;

export function providerToEditFormState(
  live: ProviderLikeForCustomForm,
  stored: StoredProviderEntry | null,
>>>>>>> upstream/main
  icon: CustomProviderIcon | null = null,
): CustomProviderFormState {
<<<<<<< HEAD
||||||| bc50ba56aa
  const liveModels = Array.isArray(live.models)
    ? live.models.map((model) => ({ ...model, variants: undefined }))
    : live.models;
  const liveState = providerToCustomFormState({ ...live, models: liveModels });
  if (!stored) {
    return { ...liveState, icon, models: liveState.models.map((model) => ({ ...model, savedVariants: undefined })) };
  }

  const storedState = providerToCustomFormState({ ...stored, id: live.id });
=======
  const liveModels = Array.isArray(live.models)
    ? live.models.map((model) => ({ ...model, variants: undefined }))
    : live.models;
  const liveState = providerToCustomFormState({ ...live, models: liveModels });
  if (!stored) {
    return {
      ...liveState,
      icon,
      models: liveState.models.map((model) => ({ ...model, savedVariants: undefined })),
      tls: null,
    };
  }

  const storedState = providerToCustomFormState({ ...stored, id: live.id });
>>>>>>> upstream/main
  return {
    providerId: initial?.configuration.providerId ?? '',
    name: initial?.configuration.name ?? '',
    endpoint: initial?.configuration.endpoint ?? '',
    protocol: initial?.configuration.protocol ?? 'chat-completions',
    credentialRef: initial?.configuration.credentialRef ?? null,
    apiKey: '',
    replaceHeaders: !initial,
    headerNames: initial?.headerNames ?? [],
    headers: initial ? [] : [createHeaderRow()],
    models: initial ? initial.models.map(createModelRow) : [createModelRow()],
    icon,
    logo: null,
<<<<<<< HEAD
||||||| bc50ba56aa
    protocol: stored.package ? storedState.protocol : liveState.protocol,
    baseURL: storedState.baseURL || liveState.baseURL,
    // The live `env` and headers may come from a built-in provider this one
    // inherits from; only what the entry itself stores is edited here.
    apiKey: storedState.apiKey,
    models: stored.models && Object.keys(stored.models).length > 0
      ? storedState.models
      : liveState.models.map((model) => ({ ...model, savedVariants: undefined })),
    headers: storedState.headers,
=======
    protocol: stored.package ? storedState.protocol : liveState.protocol,
    package: isNativeCustomProviderPackage(stored.package) ? stored.package : undefined,
    baseURL: storedState.baseURL || liveState.baseURL,
    apiKey: storedState.apiKey,
    models: stored.models && Object.keys(stored.models).length > 0
      ? storedState.models
      : liveState.models.map((model) => ({ ...model, savedVariants: undefined })),
    headers: storedState.headers,
    tls: storedState.tls,
>>>>>>> upstream/main
  };
}

<<<<<<< HEAD
/** Omission preserves stored headers; an explicitly empty replacement removes them. */
export function providerHeaderWrite(form: CustomProviderFormState): Record<string, string> | undefined {
  if (!form.replaceHeaders) return undefined;
  const headers: Record<string, string> = {};
  const names = new Set<string>();
  for (const row of form.headers) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    if (!name || names.has(name.toLowerCase())) throw new Error('Invalid or duplicate header');
    names.add(name.toLowerCase());
    headers[name] = row.value;
  }
  return headers;
}

/**
 * Field-level checks the editor can point at. The canonical build still runs
 * afterwards, because model reasoning/variant invariants belong to its schema.
 */
export function validateCustomProviderForm(
  form: CustomProviderFormState,
  existingProviderIDs: ReadonlySet<string>,
  editing: boolean,
  t: CustomProviderTranslator,
): CustomProviderValidation {
  const fields: CustomProviderFieldErrors = {};
  const providerId = form.providerId.trim();
  const name = form.name.trim();
  const endpoint = form.endpoint.trim();
||||||| bc50ba56aa
/**
 * Validates form input and builds the auth + OpenCode provider config payloads.
 */
export function validateCustomProvider(input: ValidateCustomProviderInput): ValidateCustomProviderResult {
  const providerID = input.form.providerID.trim();
  const name = input.form.name.trim();
  const baseURL = input.form.baseURL.trim();
  const { env, key } = parseEnvApiKey(input.form.apiKey);
  const disabledProviders = input.disabledProviders ?? [];
  const editingProviderID = input.editingProviderID?.trim();
=======
export function validateCustomProvider(input: ValidateCustomProviderInput): ValidateCustomProviderResult {
  const providerID = input.form.providerID.trim();
  const name = input.form.name.trim();
  const baseURL = input.form.baseURL.trim();
  const { env, key } = parseEnvApiKey(input.form.apiKey);
  const disabledProviders = input.disabledProviders ?? [];
  const editingProviderID = input.editingProviderID?.trim();
>>>>>>> upstream/main

  if (!providerId) fields.providerId = t('settings.providers.page.custom.error.providerID.required');
  else if (!isValidProviderID(providerId)) fields.providerId = t('settings.providers.page.custom.error.providerID.format');
  else if (!editing && isProviderIDTaken(providerId, existingProviderIDs)) fields.providerId = t('settings.providers.page.custom.error.providerID.exists');

  if (!name) fields.name = t('settings.providers.page.custom.error.name.required');

  if (!endpoint) fields.endpoint = t('settings.providers.page.custom.error.baseURL.required');
  else if (!isHttpEndpoint(endpoint)) fields.endpoint = t('settings.providers.page.custom.error.baseURL.format');

<<<<<<< HEAD
  const models = form.models.map((row): ModelFieldErrors => {
    const errors: ModelFieldErrors = {};
    if (!row.modelId.trim()) errors.modelId = t('settings.providers.page.custom.error.required');
    if (!row.name.trim()) errors.name = t('settings.providers.page.custom.error.required');
    if (!row.contextWindow.trim()) errors.contextWindow = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.contextWindow)) errors.contextWindow = t('settings.providers.page.custom.error.positiveInteger');
    if (!row.maxOutputTokens.trim()) errors.maxOutputTokens = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.maxOutputTokens)) errors.maxOutputTokens = t('settings.providers.page.custom.error.positiveInteger');
    else if (positiveInteger(row.contextWindow) && Number(row.maxOutputTokens) > Number(row.contextWindow)) {
      errors.maxOutputTokens = t('settings.providers.page.custom.error.maxOutputExceedsContext');
||||||| bc50ba56aa
  const credentialsSatisfied = Boolean(env || key || (editingProviderID && input.allowExistingAuth && editingProviderID === providerID));
  const apiKeyError = credentialsSatisfied
    ? undefined
    : input.t('settings.providers.page.custom.error.apiKey.required');

  const disabled = disabledProviders.includes(providerID);
  const isSelfEdit = Boolean(editingProviderID && editingProviderID === providerID);
  const existsError = idError || isSelfEdit
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t('settings.providers.page.custom.error.providerID.exists')
      : undefined;

  const seenModels = new Set<string>();
  const modelErrors = input.form.models.map((model) => {
    const id = model.id.trim();
    const modelIdError = !id
      ? input.t('settings.providers.page.custom.error.required')
      : seenModels.has(id)
        ? input.t('settings.providers.page.custom.error.duplicate')
        : (() => {
            seenModels.add(id);
            return undefined;
          })();
    const modelNameError = !model.name.trim()
      ? input.t('settings.providers.page.custom.error.required')
      : undefined;
    const contextWindowError = model.contextWindow.trim() && !parsePositiveInteger(model.contextWindow)
      ? input.t('settings.providers.page.custom.error.positiveInteger')
      : undefined;
    const maxOutputTokensError = model.maxOutputTokens.trim() && !parsePositiveInteger(model.maxOutputTokens)
      ? input.t('settings.providers.page.custom.error.positiveInteger')
      : undefined;
    return { id: modelIdError, name: modelNameError, contextWindow: contextWindowError, maxOutputTokens: maxOutputTokensError };
  });

  const modelsValid = modelErrors.every((entry) => !entry.id && !entry.name && !entry.contextWindow && !entry.maxOutputTokens);
  // v2 keeps the model id inside the entry too; the catalog reads `modelID`.
  const modelConfig = Object.fromEntries(
    input.form.models.map((model) => {
      const modelID = model.id.trim();
      const entry: CustomProviderModelConfig = { modelID, name: model.name.trim() };
      if (model.type) entry.type = model.type;
      const context = parsePositiveInteger(model.contextWindow);
      const output = parsePositiveInteger(model.maxOutputTokens);
      if (context || output) entry.limit = { ...(context ? { context } : {}), ...(output ? { output } : {}) };
      if (model.capabilitiesKnown) {
        entry.capabilities = {
          tools: model.tools,
          input: model.inputCapabilities,
          output: model.outputCapabilities,
        };
      }
      const variantIDs = parseVariantIDs(model.variants);
      // A row loaded from config always sends its list, so emptying the field
      // clears saved levels; a new row with no levels leaves the key out.
      if (variantIDs.length > 0 || model.savedVariants !== undefined) {
        entry.variants = variantIDs.map((id) => ({
          id,
          ...(model.savedVariants?.[id] ?? customVariantOverlay(input.form.protocol, id)),
        }));
      }
      return [modelID, entry];
    }),
  );

  const seenHeaders = new Set<string>();
  const headerErrors = input.form.headers.map((header) => {
    const headerKey = header.key.trim();
    const headerValue = header.value.trim();
    if (!headerKey && !headerValue) {
      return {};
=======
  const credentialsSatisfied = Boolean(env || key || (editingProviderID && input.allowExistingAuth && editingProviderID === providerID));
  const apiKeyError = credentialsSatisfied
    ? undefined
    : input.t('settings.providers.page.custom.error.apiKey.required');

  const disabled = disabledProviders.includes(providerID);
  const isSelfEdit = Boolean(editingProviderID && editingProviderID === providerID);
  const existsError = idError || isSelfEdit
    ? undefined
    : input.existingProviderIDs.has(providerID) && !disabled
      ? input.t('settings.providers.page.custom.error.providerID.exists')
      : undefined;

  const seenModels = new Set<string>();
  const modelErrors = input.form.models.map((model) => {
    const id = model.id.trim();
    const modelIdError = !id
      ? input.t('settings.providers.page.custom.error.required')
      : seenModels.has(id)
        ? input.t('settings.providers.page.custom.error.duplicate')
        : (() => {
            seenModels.add(id);
            return undefined;
          })();
    const modelNameError = !model.name.trim()
      ? input.t('settings.providers.page.custom.error.required')
      : undefined;
    const contextWindowError = model.contextWindow.trim() && !parsePositiveInteger(model.contextWindow)
      ? input.t('settings.providers.page.custom.error.positiveInteger')
      : undefined;
    const maxOutputTokensError = model.maxOutputTokens.trim() && !parsePositiveInteger(model.maxOutputTokens)
      ? input.t('settings.providers.page.custom.error.positiveInteger')
      : undefined;
    return { id: modelIdError, name: modelNameError, contextWindow: contextWindowError, maxOutputTokens: maxOutputTokensError };
  });

  const modelsValid = modelErrors.every((entry) => !entry.id && !entry.name && !entry.contextWindow && !entry.maxOutputTokens);
  const modelConfig = Object.fromEntries(
    input.form.models.map((model) => {
      const modelID = model.id.trim();
      const entry: CustomProviderModelConfig = { modelID, name: model.name.trim() };
      if (model.type) entry.type = model.type;
      const context = parsePositiveInteger(model.contextWindow);
      const output = parsePositiveInteger(model.maxOutputTokens);
      if (context || output) entry.limit = { ...(context ? { context } : {}), ...(output ? { output } : {}) };
      if (model.capabilitiesKnown) {
        entry.capabilities = {
          tools: model.tools,
          input: model.inputCapabilities,
          output: model.outputCapabilities,
        };
      }
      const variantIDs = parseVariantIDs(model.variants);
      if (variantIDs.length > 0 || model.savedVariants !== undefined) {
        entry.variants = variantIDs.map((id) => ({
          id,
          ...(model.savedVariants?.[id] ?? customVariantOverlay(input.form.protocol, id)),
        }));
      }
      return [modelID, entry];
    }),
  );

  const seenHeaders = new Set<string>();
  const headerErrors = input.form.headers.map((header) => {
    const headerKey = header.key.trim();
    const headerValue = header.value.trim();
    if (!headerKey && !headerValue) {
      return {};
>>>>>>> upstream/main
    }
    return errors;
  });
<<<<<<< HEAD
  const seenModelIds = new Set<string>();
  for (const [index, row] of form.models.entries()) {
    const modelId = row.modelId.trim();
    if (!modelId) continue;
    if (seenModelIds.has(modelId)) models[index]!.modelId = t('settings.providers.page.custom.error.duplicate');
    else seenModelIds.add(modelId);
||||||| bc50ba56aa

  const headersValid = headerErrors.every((entry) => !entry.key && !entry.value);
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
      .filter((header) => header.key && header.value)
      .map((header) => [header.key, header.value]),
  );

  const err: FieldErrors = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
    apiKey: apiKeyError,
  };

  const ok = !idError && !existsError && !nameError && !urlError && !apiKeyError && modelsValid && headersValid;
  if (!ok) {
    return { err, models: modelErrors, headers: headerErrors };
=======

  const headersValid = headerErrors.every((entry) => !entry.key && !entry.value);
  const headerConfig = Object.fromEntries(
    input.form.headers
      .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
      .filter((header) => header.key && header.value)
      .map((header) => [header.key, header.value]),
  );

  const tls = storedClientCertificateOf(input.form.tls);
  const certificatePathError = (field: string): string | undefined => {
    if (!tls) return undefined;
    if (!field.trim()) return input.t('settings.providers.page.custom.error.tls.incomplete');
    return isRelativeCertificatePath(field) ? input.t('settings.providers.page.custom.error.tls.relativePath') : undefined;
  };
  const tlsCertError = certificatePathError(input.form.tls?.cert ?? '');
  const tlsKeyError = certificatePathError(input.form.tls?.key ?? '');

  const err: FieldErrors = {
    providerID: idError ?? existsError,
    name: nameError,
    baseURL: urlError,
    apiKey: apiKeyError,
    tlsCert: tlsCertError,
    tlsKey: tlsKeyError,
  };

  const ok = !idError && !existsError && !nameError && !urlError && !apiKeyError && !tlsCertError && !tlsKeyError
    && modelsValid && headersValid;
  if (!ok) {
    return { err, models: modelErrors, headers: headerErrors };
>>>>>>> upstream/main
  }

  const headers = form.replaceHeaders
    ? form.headers.map((row): HeaderFieldErrors => {
      const errors: HeaderFieldErrors = {};
      const headerName = row.name.trim();
      if (!headerName && !row.value) return errors;
      if (!headerName) errors.name = t('settings.providers.page.custom.error.required');
      else if (!HEADER_NAME_PATTERN.test(headerName)) errors.name = t('settings.providers.page.custom.error.headerName.format');
      if (!row.value) errors.value = t('settings.providers.page.custom.error.required');
      return errors;
    })
    : [];
  if (form.replaceHeaders) {
    const seenHeaders = new Set<string>();
    for (const [index, row] of form.headers.entries()) {
      const headerName = row.name.trim().toLowerCase();
      if (!headerName) continue;
      if (seenHeaders.has(headerName)) headers[index]!.name = t('settings.providers.page.custom.error.duplicate');
      else seenHeaders.add(headerName);
    }
  }

  const valid = !fields.providerId && !fields.name && !fields.endpoint
    && models.every((errors) => !errors.modelId && !errors.name && !errors.contextWindow && !errors.maxOutputTokens)
    && headers.every((errors) => !errors.name && !errors.value);
  return { fields, models, headers, valid };
}

export function buildCustomProviderRequest(form: CustomProviderFormState, expectedRevision: string): CustomProviderPersistPlan {
  const providerId = form.providerId.trim();
  if (!isValidProviderID(providerId)) throw new Error('Invalid provider ID');
  const models = form.models.map((row) => {
    // All canonical metadata survives editing. Discovery supplies no fabricated limits.
    const model = {
      ...(row.base ?? { reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }),
      provider: providerId,
      modelId: row.modelId.trim(),
      name: row.name.trim(),
      contextWindow: row.contextWindow.trim() ? Number(row.contextWindow) : 0,
      maxOutputTokens: row.maxOutputTokens.trim() ? Number(row.maxOutputTokens) : 0,
      // A saved row can predate a kind change; the request carries only what
      // the native runner accepts, matching the writer's own modality rule.
      modalities: normalizeModelModalities(row.nativeKind, row.modalities),
    };
    // Auto-fill only ever replaces fields the user did not set, so these
    // overrides cannot disagree with a value typed into the editor.
    if (row.reasoningEffortSupported !== undefined) model.reasoningEffortSupported = row.reasoningEffortSupported;
    if (row.pricing !== undefined) model.pricing = row.pricing;
    // Omission preserves the native runner's own tool-support default.
    if (row.toolsSupported === undefined) return ModelSchema.parse(model);
    return ModelSchema.parse({ ...model, toolsSupported: row.toolsSupported });
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length) throw new Error('Duplicate model ID');
  return {
<<<<<<< HEAD
    apiKey: form.apiKey,
    icon: form.icon,
    logo: logoPlanOf(form.logo),
    request: ProviderConfigureRequestSchema.parse({
      expectedRevision,
      configuration: {
        providerId,
        name: form.name.trim(),
        endpoint: form.endpoint.trim(),
        protocol: form.protocol,
        credentialRef: form.credentialRef,
      },
      headers: providerHeaderWrite(form),
      models,
    }),
||||||| bc50ba56aa
    err,
    models: modelErrors,
    headers: headerErrors,
    result: {
      providerID,
      name,
      icon: input.form.icon,
      logo: logoPlanOf(input.form.logo),
      apiKey: key,
      ...(!env && !key ? { keepsStoredCredential: true } : {}),
      config: buildCustomProviderConfig({
        protocol: input.form.protocol,
        name,
        env,
        baseURL,
        headers: headerConfig,
        models: modelConfig,
      }),
    },
=======
    err,
    models: modelErrors,
    headers: headerErrors,
    result: {
      providerID,
      name,
      icon: input.form.icon,
      logo: logoPlanOf(input.form.logo),
      apiKey: key,
      ...(!env && !key ? { keepsStoredCredential: true } : {}),
      config: buildCustomProviderConfig({
        protocol: input.form.protocol,
        package: input.form.package,
        name,
        env,
        baseURL,
        tls,
        headers: headerConfig,
        models: modelConfig,
      }),
    },
>>>>>>> upstream/main
  };
}

<<<<<<< HEAD
export function buildProviderDiscoveryRequest(form: CustomProviderFormState, editing: boolean): ProviderModelDiscoveryRequest {
  const request: ProviderModelDiscoveryRequest = {
    endpoint: form.endpoint.trim(),
    protocol: form.protocol,
    headers: providerHeaderWrite(form),
  };
  if (editing) request.providerId = form.providerId;
  if (form.apiKey) request.apiKey = form.apiKey;
  if (form.credentialRef) request.credentialRef = form.credentialRef;
  return ProviderModelDiscoveryRequestSchema.parse(request);
}

// Only what the user did in the field changes the stored image; an untouched
// field keeps whatever is stored, including a logo another client just uploaded.
||||||| bc50ba56aa
// Only what the user did in the field changes the stored image; an untouched
// field keeps whatever is stored, including a logo another client just uploaded.
=======
>>>>>>> upstream/main
function logoPlanOf(logo: CustomProviderFormState['logo']): CustomProviderLogoPlan {
  if (logo === null) return { kind: 'keep' };
  if (logo === 'removed') return { kind: 'remove' };
  return { kind: 'upload', file: logo };
}

// ── Model info auto-fill and the discovery dialog ──────────────────────────

<<<<<<< HEAD
/** A catalog answer keyed by model id, as both auto-fill sources return it. */
export type ModelCatalogAnswers = ReadonlyMap<string, ModelCatalogInfo>;
||||||| bc50ba56aa
function buildCustomProviderConfig(input: {
  protocol: CustomProviderProtocol;
  name: string;
  env?: string;
  baseURL: string;
  headers: Record<string, string>;
  models: Record<string, CustomProviderModelConfig>;
}): CustomProviderConfig {
  const config: CustomProviderConfig = {
    package: CUSTOM_PROVIDER_PROTOCOLS[input.protocol],
    name: input.name,
    settings: { baseURL: input.baseURL },
    models: input.models,
  };
  if (input.env) config.env = [input.env];
  if (Object.keys(input.headers).length > 0) config.headers = input.headers;
  return config;
}
=======
function buildCustomProviderConfig(input: {
  protocol: CustomProviderProtocol;
  package?: CustomProviderPackage;
  name: string;
  env?: string;
  baseURL: string;
  tls?: StoredClientCertificate | null;
  headers: Record<string, string>;
  models: Record<string, CustomProviderModelConfig>;
}): CustomProviderConfig {
  const config: CustomProviderConfig = {
    package: input.package && protocolFromPackage(input.package) === input.protocol
      ? input.package
      : CUSTOM_PROVIDER_PROTOCOLS[input.protocol],
    name: input.name,
    settings: { baseURL: input.baseURL },
    models: input.models,
  };
  if (input.tls !== undefined) config.settings.tls = input.tls;
  if (input.env) config.env = [input.env];
  if (Object.keys(input.headers).length > 0) config.headers = input.headers;
  return config;
}
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * Which fields a catalog answer can still write into a row. A field the user
 * set is skipped even when it is empty: "I typed it" is the user's answer.
 */
export function autoFillFields(row: ModelRow, catalog: ModelCatalogInfo): ModelAutoFillField[] {
  const fields: ModelAutoFillField[] = [];
  if (fillableLimit(row, 'contextWindow', String(catalog.contextWindow))) fields.push('contextWindow');
  if (fillableLimit(row, 'maxOutputTokens', String(catalog.maxTokens))) fields.push('maxOutputTokens');
  if (!row.typed.has('modalities')) {
    const next = catalogInputs(catalog.input);
    if (next.length > 0 && !sameModalities(next, row.modalities)) fields.push('modalities');
||||||| bc50ba56aa
/**
 * Builds the `integration.connect.key` request body when a literal API key is
 * present. OpenCode v2 stores provider keys as integration credentials; there
 * is no `auth.json` to write any more. A custom provider has no catalog entry,
 * so OpenCode registers its key method only once the provider is in config:
 * send this after the config write (see `storeKeyAfterConfigWrite`).
 */
export function buildIntegrationKeyRequest(plan: CustomProviderPersistPlan): {
  integrationID: string;
  key: string;
} | null {
  if (!plan.apiKey) {
    return null;
=======
export function buildIntegrationKeyRequest(plan: CustomProviderPersistPlan): {
  integrationID: string;
  key: string;
} | null {
  if (!plan.apiKey) {
    return null;
>>>>>>> upstream/main
  }
  if (!row.typed.has('toolsSupported') && row.toolsSupported === undefined && catalog.toolsSupported !== undefined) fields.push('toolsSupported');
  if (!row.typed.has('reasoning') && row.reasoningEffortSupported === undefined) fields.push('reasoning');
  if (!row.typed.has('pricing') && row.pricing === undefined) fields.push('pricing');
  return fields;
}

const sameModalities = (left: readonly string[], right: readonly Model['modalities'][number][]): boolean =>
  left.length === right.length && left.every((value, index) => right[index] === value);

/**
 * A limit may be written when the field is empty and unset, or when nothing
 * but a previous auto-fill put the current value there. A typed value stays.
 */
const fillableLimit = (row: ModelRow, field: 'contextWindow' | 'maxOutputTokens', value: string): boolean => {
  if (row.typed.has(field)) return false;
  const current = row[field].trim();
  if (!current) return true;
  return row.filledFrom[field] !== undefined && current !== value;
};

/**
 * Applies the answers to the form's rows. Only fields the user did not set are
 * written, and each written field records its source for the label under the
 * control. A row whose id no answer names is left exactly as it was.
 */
export function applyModelCatalogInfo(
  models: readonly ModelRow[],
  answers: ModelCatalogAnswers,
): { models: ModelRow[]; filled: number } {
  let filled = 0;
  const next = models.map((row) => {
    const catalog = answers.get(row.modelId.trim());
    if (!catalog) return row;
    const fields = autoFillFields(row, catalog);
    // A family alone groups the dialog row; it is not a value the user reads
    // in the form, so a family-only answer counts as nothing filled.
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
      else if (field === 'reasoning') updated.reasoningEffortSupported = catalog.reasoning;
      else if (field === 'pricing') {
        updated.pricing = {
          inputPerMillionTokens: catalog.cost.input,
          outputPerMillionTokens: catalog.cost.output,
          cacheReadPerMillionTokens: catalog.cost.cacheRead,
          cacheWritePerMillionTokens: catalog.cost.cacheWrite,
        };
      }
    }
    if (catalog.family !== undefined) updated.family = catalog.family;
    return updated;
  });
  return { models: next, filled };
}

<<<<<<< HEAD
/**
 * The ids to ask the OpenRouter route for: models the OMP catalog did not
 * answer, and only when they are not already catalogued from a previous fill.
 */
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
||||||| bc50ba56aa
/**
 * Builds the OpenChamber provider upsert request body (config persistence).
 * `scope` selects the OpenCode config layer (user/project/custom). Create
 * defaults to user; edit must pass the provider's effective existing layer.
 */
export function buildProviderUpsertRequest(
  plan: CustomProviderPersistPlan,
  options?: { scope?: ProviderConfigScope },
): {
  providerID: string;
  config: CustomProviderConfig;
  scope: ProviderConfigScope;
  hasCredential: boolean;
} {
  return {
    providerID: plan.providerID,
    config: plan.config,
    scope: options?.scope ?? 'user',
    // The server cannot see OpenCode 2 credentials, so the form vouches for a
    // key it is about to store or one the edited provider already has.
    hasCredential: Boolean(plan.apiKey || plan.keepsStoredCredential),
  };
=======
export function buildProviderUpsertRequest(
  plan: CustomProviderPersistPlan,
  options?: { scope?: ProviderConfigScope },
): {
  providerID: string;
  config: CustomProviderConfig;
  scope: ProviderConfigScope;
  hasCredential: boolean;
} {
  return {
    providerID: plan.providerID,
    config: plan.config,
    scope: options?.scope ?? 'user',
    hasCredential: Boolean(plan.apiKey || plan.keepsStoredCredential),
  };
>>>>>>> upstream/main
}

/** Each request keeps to its own id limit: the agent contract caps 500, the Host route 200. */
export const AUTO_FILL_ENRICH_LIMIT = 500;
export const AUTO_FILL_OPENROUTER_LIMIT = 200;

/** The distinct model ids a fill would ask about, in form order. */
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

/** Why a fill has nothing more to say, when it does. */
export type AutoFillNotice =
  /** The OpenRouter leg was refused by enterprise policy. */
  | 'enterprise'
  /** The OpenRouter leg failed. */
  | 'failed'
  /** No source knew any of the ids. */
  | 'none'
  /** Every row already had its own value. */
  | 'nothing'
  /** Some ids stayed unknown; they are listed in the notice. */
  | 'partial';

<<<<<<< HEAD
/**
 * The distinct ids no source answered for, in the order given. Ids a source
 * cap kept out of a request belong here too: nobody asked, so nobody answered,
 * and the reader is told which models stayed empty rather than left to guess.
 */
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

/** How many unknown ids the partial notice names before counting the rest. */
const AUTO_FILL_NOTICE_ID_LIMIT = 10;

/**
 * What the fill reports, in order of what the reader must know: a refused or
 * failed lookup first (a catalog-only result must never read as success), then
 * the case where no source answered at all, then the ids that stayed unknown,
 * and only then "nothing left to fill". Unknown ids outrank "nothing": a
 * second click, or a discovery that already prefilled the catalogued rows,
 * fills nothing while those models still have no limits.
 */
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

/** The ids a notice names, and how many it leaves to a count. */
export function autoFillNoticeIds(ids: readonly string[]): { shown: string[]; hidden: number } {
  const shown = ids.slice(0, AUTO_FILL_NOTICE_ID_LIMIT);
  return { shown, hidden: Math.max(0, ids.length - shown.length) };
}

/**
 * The id list a partial notice prints. The count past the cap goes through the
 * caller's translated template, so every locale keeps its own way of saying
 * "and N more" (and its own bidi order) instead of a bare `(+N)`.
 */
export function formatAutoFillNoticeModels(
  ids: readonly string[],
  more: (models: string, count: number) => string,
): string {
  const { shown, hidden } = autoFillNoticeIds(ids);
  const list = shown.join(', ');
  return hidden > 0 ? more(list, hidden) : list;
}

/** A row imported from a discovery result, prefilled from what the catalog already knows. */
export function createDiscoveredModelRow(model: ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const row = createModelRow(model);
  if (!model.catalog) return row;
  return applyModelCatalogInfo([row], new Map([[row.modelId.trim(), model.catalog]])).models[0];
}

/**
 * Records that the user set this field by hand, so auto-fill stops touching it.
 * The typing also retires the field's provenance: a value the user wrote (or
 * cleared) came from the user, not from the catalog that filled it before.
 */
export function markModelFieldTyped(row: ModelRow, field: ModelAutoFillField): ModelRow {
  if (row.typed.has(field) && row.filledFrom[field] === undefined) return row;
  const { [field]: _retired, ...filledFrom } = row.filledFrom;
  return { ...row, typed: new Set([...row.typed, field]), filledFrom };
}

/** A row whose id the freshly discovered list no longer carries. */
export function staleModelIds(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  // Ids compare trimmed on both sides: a discovery result may pad an id that
  // a form row already carries without the padding.
  const known = new Set(discovered.map((model) => model.modelId.trim()));
  return models
    .map((row) => row.modelId.trim())
    .filter((modelId) => modelId !== '' && !known.has(modelId));
}

/** Every discovered id the form does not hold yet, in discovery order. */
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

/**
 * Every chip the dialog offers. The contract has no video modality, so there
 * is no video chip; a chip whose count is zero shows zero rather than vanish,
 * because a hidden chip would read as "this provider cannot do that".
 */
export const discoveryFilterValues: readonly DiscoveryFilter[] = ['all', 'stale', 'text', 'image', 'embedding', 'audio'];

/** One row of the dialog: a discovered model, or a form row the list lost. */
export interface DiscoveryRow {
  kind: 'discovered' | 'stale';
  modelId: string;
  name?: string;
  catalog?: ModelCatalogInfo;
  /** The form row this id already belongs to, when it does. */
  formRow?: ModelRow;
  family?: string;
}

/**
 * The dialog's rows: every discovered model, plus form rows the fresh list
 * does not carry (a stale row can be removed individually). A form row marks
 * the discovered model it stands for, so a row is never listed twice.
 */
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

/**
 * A row passes the chosen filter. Text and image read the catalog's input
 * modalities, or the form row's own when no catalog answered; embedding and
 * audio read the native kind, which is what OMP accepts for them.
 */
export function matchesDiscoveryFilter(row: DiscoveryRow, filter: DiscoveryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'stale') return row.kind === 'stale';
  // A discovered model with no catalog and no form row still accepts text:
  // every custom provider model can, so the chip counts it rather than hiding it.
  const inputs = row.catalog?.input ?? row.formRow?.modalities ?? ['text'];
  if (filter === 'text' || filter === 'image') return inputs.includes(filter);
  if (filter === 'embedding') return row.formRow?.nativeKind === 'embedding';
  return row.formRow?.nativeKind === 'tts' || row.formRow?.nativeKind === 'stt';
}

/**
 * Grouping by family only pays off when every visible row names one; a list
 * with a single unnamed row stays flat, since half a grouping reads worse.
 */
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

/** How many rows each filter would show. A chip is always offered, count and all. */
export function discoveryFilterCounts(rows: readonly DiscoveryRow[]): Record<DiscoveryFilter, number> {
  const counts: Record<DiscoveryFilter, number> = { all: rows.length, stale: 0, text: 0, image: 0, embedding: 0, audio: 0 };
  for (const row of rows) {
    for (const filter of ['stale', 'text', 'image', 'embedding', 'audio'] as const) {
      if (matchesDiscoveryFilter(row, filter)) counts[filter] += 1;
||||||| bc50ba56aa
/**
 * Stores a custom provider's key right after its config was written. OpenCode
 * picks the config up from its file watcher, and until then it rejects the key
 * with "Integration not found"; only that rejection is retried, briefly.
 */
export async function storeKeyAfterConfigWrite(
  connectKey: () => Promise<unknown>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await connectKey();
      return;
    } catch (error) {
      const delay = KEY_METHOD_RETRY_DELAYS_MS[attempt];
      const notRegisteredYet = error instanceof Error && /not found/i.test(error.message);
      if (!notRegisteredYet || delay === undefined) throw error;
      await wait(delay);
=======
export async function storeKeyAfterConfigWrite(
  connectKey: () => Promise<unknown>,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await connectKey();
      return;
    } catch (error) {
      const delay = KEY_METHOD_RETRY_DELAYS_MS[attempt];
      const notRegisteredYet = error instanceof Error && /not found/i.test(error.message);
      if (!notRegisteredYet || delay === undefined) throw error;
      await wait(delay);
>>>>>>> upstream/main
    }
  }
  return counts;
}
