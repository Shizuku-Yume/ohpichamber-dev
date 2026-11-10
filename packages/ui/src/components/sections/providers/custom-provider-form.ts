import { ModelSchema, ProviderConfigureRequestSchema, ProviderModelDiscoveryRequestSchema } from '@openchamber/agent-contract';
import type { Model, ProviderConfigurationRead, ProviderConfigureRequest, ProviderModelDiscoveryRequest, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';

export const CUSTOM_PROVIDER_ID = '__custom_provider__';
export const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;

export type CustomProviderProtocol = (typeof CUSTOM_PROVIDER_PROTOCOLS)[number];

export const isCustomProviderProtocol = (value: string): value is CustomProviderProtocol =>
  CUSTOM_PROVIDER_PROTOCOLS.some((protocol) => protocol === value);

export interface ModelRow {
  row: string;
  modelId: string;
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
<<<<<<< HEAD
  modalities: Model['modalities'];
  toolsSupported?: boolean;
  /** Canonical fields the controls do not edit (reasoning, pricing, status, enabled). */
  base?: Model;
}
export interface HeaderRow { row: string; name: string; value: string }
export interface CustomProviderFormState {
  providerId: string;
  name: string;
  endpoint: string;
=======
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
export type CustomProviderLogoPlan =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upload'; file: File };

export type CustomProviderFormState = {
  providerID: string;
  name: string;
  /** Null keeps the provider's own logo or the generic fallback. */
  icon: CustomProviderIcon | null;
  /** The logo image: a file picked here, the stored one cleared, or null for whatever is stored. Wins over `icon`. */
  logo: File | 'removed' | null;
>>>>>>> bc50ba56a
  protocol: CustomProviderProtocol;
  credentialRef: string | null;
  apiKey: string;
  replaceHeaders: boolean;
  headerNames: string[];
  headers: HeaderRow[];
  models: ModelRow[];
  icon: CustomProviderIcon | null;
}
export interface CustomProviderPersistPlan {
  request: ProviderConfigureRequest;
  apiKey: string;
  icon: CustomProviderIcon | null;
}

export type CustomProviderTranslator = (key: I18nKey) => string;

export interface CustomProviderFieldErrors {
  providerId?: string;
  name?: string;
  endpoint?: string;
}
export interface ModelFieldErrors {
  modelId?: string;
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
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  valid: boolean;
=======
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
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  result?: CustomProviderPersistPlan;
};

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
};

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
>>>>>>> bc50ba56a
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

<<<<<<< HEAD
const positiveInteger = (value: string): boolean => {
  const parsed = Number(value.trim());
  return /^[0-9]+$/.test(value.trim()) && Number.isSafeInteger(parsed) && parsed > 0;
=======
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

/**
 * The live provider list reports OpenCode's own implementation of an `aisdk:`
 * package (`aisdk:@ai-sdk/openai` is served as `@opencode/ai/providers/openai`),
 * so both spellings map to the protocol the form saved.
 */
const NATIVE_CUSTOM_PROVIDER_PACKAGES: Record<string, CustomProviderProtocol> = {
  '@opencode/ai/providers/openai-compatible': 'openai-chat',
  '@opencode/ai/providers/openai': 'openai-responses',
  '@opencode/ai/providers/anthropic': 'anthropic-messages',
>>>>>>> bc50ba56a
};

const isHttpEndpoint = (value: string): boolean => {
  try {
    const endpoint = new URL(value);
    return (endpoint.protocol === 'http:' || endpoint.protocol === 'https:')
      && endpoint.username === '' && endpoint.password === '' && endpoint.search === '' && endpoint.hash === '';
  } catch {
    return false;
  }
};

<<<<<<< HEAD
const isCanonicalModel = (model: Model | ProviderModelDiscoveryResult['models'][number] | undefined): model is Model =>
  model !== undefined && 'modalities' in model;
=======
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
>>>>>>> bc50ba56a

export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const canonical = isCanonicalModel(model) ? { ...model } : undefined;
  const { modelId = '', name = '', contextWindow, maxOutputTokens } = model ?? {};
  return {
<<<<<<< HEAD
    row: crypto.randomUUID(),
    modelId,
    name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    modalities: canonical ? [...canonical.modalities] : ['text'],
    toolsSupported: canonical?.toolsSupported,
    base: canonical,
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
>>>>>>> bc50ba56a
  };
}

export function createHeaderRow(): HeaderRow {
  return { row: crypto.randomUUID(), name: '', value: '' };
}

<<<<<<< HEAD
export function createEmptyCustomProviderForm(
  initial?: ProviderConfigurationRead,
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
>>>>>>> bc50ba56a
  icon: CustomProviderIcon | null = null,
): CustomProviderFormState {
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
<<<<<<< HEAD
=======
    logo: null,
    protocol: stored.package ? storedState.protocol : liveState.protocol,
    baseURL: storedState.baseURL || liveState.baseURL,
    // The live `env` and headers may come from a built-in provider this one
    // inherits from; only what the entry itself stores is edited here.
    apiKey: storedState.apiKey,
    models: stored.models && Object.keys(stored.models).length > 0
      ? storedState.models
      : liveState.models.map((model) => ({ ...model, savedVariants: undefined })),
    headers: storedState.headers,
>>>>>>> bc50ba56a
  };
}

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

  if (!providerId) fields.providerId = t('settings.providers.page.custom.error.providerID.required');
  else if (!/^[a-z0-9][a-z0-9_-]*$/.test(providerId)) fields.providerId = t('settings.providers.page.custom.error.providerID.format');
  else if (!editing && existingProviderIDs.has(providerId)) fields.providerId = t('settings.providers.page.custom.error.providerID.exists');

  if (!name) fields.name = t('settings.providers.page.custom.error.name.required');

  if (!endpoint) fields.endpoint = t('settings.providers.page.custom.error.baseURL.required');
  else if (!isHttpEndpoint(endpoint)) fields.endpoint = t('settings.providers.page.custom.error.baseURL.format');

  const models = form.models.map((row): ModelFieldErrors => {
    const errors: ModelFieldErrors = {};
    if (!row.modelId.trim()) errors.modelId = t('settings.providers.page.custom.error.required');
    if (!row.name.trim()) errors.name = t('settings.providers.page.custom.error.required');
    if (!row.contextWindow.trim()) errors.contextWindow = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.contextWindow)) errors.contextWindow = t('settings.providers.page.custom.error.positiveInteger');
    if (!row.maxOutputTokens.trim()) errors.maxOutputTokens = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.maxOutputTokens)) errors.maxOutputTokens = t('settings.providers.page.custom.error.positiveInteger');
    else if (positiveInteger(row.contextWindow) && Number(row.maxOutputTokens) > Number(row.contextWindow)) {
      errors.maxOutputTokens = t('settings.providers.native.invalidConfiguration');
    }
    return errors;
  });
  const seenModelIds = new Set<string>();
  for (const [index, row] of form.models.entries()) {
    const modelId = row.modelId.trim();
    if (!modelId) continue;
    if (seenModelIds.has(modelId)) models[index]!.modelId = t('settings.providers.page.custom.error.duplicate');
    else seenModelIds.add(modelId);
  }

<<<<<<< HEAD
  const headers = form.replaceHeaders
    ? form.headers.map((row): HeaderFieldErrors => {
      const errors: HeaderFieldErrors = {};
      const headerName = row.name.trim();
      if (!headerName && !row.value) return errors;
      if (!headerName) errors.name = t('settings.providers.page.custom.error.required');
      else if (!HEADER_NAME_PATTERN.test(headerName)) errors.name = t('settings.providers.native.invalidConfiguration');
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
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(providerId)) throw new Error('Invalid provider ID');
  const models = form.models.map((row) => {
    // All canonical metadata survives editing. Discovery supplies no fabricated limits.
    const model = {
      ...(row.base ?? { reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }),
      provider: providerId,
      modelId: row.modelId.trim(),
      name: row.name.trim(),
      contextWindow: row.contextWindow.trim() ? Number(row.contextWindow) : 0,
      maxOutputTokens: row.maxOutputTokens.trim() ? Number(row.maxOutputTokens) : 0,
      modalities: row.modalities,
    };
    // Omission preserves the native runner's own tool-support default.
    if (row.toolsSupported === undefined) return ModelSchema.parse(model);
    return ModelSchema.parse({ ...model, toolsSupported: row.toolsSupported });
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length) throw new Error('Duplicate model ID');
  return {
    apiKey: form.apiKey,
    icon: form.icon,
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
  };
}

export function buildProviderDiscoveryRequest(form: CustomProviderFormState, editing: boolean): ProviderModelDiscoveryRequest {
  const request: ProviderModelDiscoveryRequest = {
    endpoint: form.endpoint.trim(),
    protocol: form.protocol,
    headers: providerHeaderWrite(form),
=======
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
    }
    const keyError = !headerKey
      ? input.t('settings.providers.page.custom.error.required')
      : seenHeaders.has(headerKey.toLowerCase())
        ? input.t('settings.providers.page.custom.error.duplicate')
        : (() => {
            seenHeaders.add(headerKey.toLowerCase());
            return undefined;
          })();
    const valueError = !headerValue
      ? input.t('settings.providers.page.custom.error.required')
      : undefined;
    return { key: keyError, value: valueError };
  });

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
  }

  return {
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
  };
}

// Only what the user did in the field changes the stored image; an untouched
// field keeps whatever is stored, including a logo another client just uploaded.
function logoPlanOf(logo: CustomProviderFormState['logo']): CustomProviderLogoPlan {
  if (logo === null) return { kind: 'keep' };
  if (logo === 'removed') return { kind: 'remove' };
  return { kind: 'upload', file: logo };
}

function parsePositiveInteger(value: string): number | undefined {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

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
>>>>>>> bc50ba56a
  };
  if (editing) request.providerId = form.providerId;
  if (form.apiKey) request.apiKey = form.apiKey;
  if (form.credentialRef) request.credentialRef = form.credentialRef;
  return ProviderModelDiscoveryRequestSchema.parse(request);
}
