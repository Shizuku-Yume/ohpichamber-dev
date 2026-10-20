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
}
export interface CustomProviderValidation {
  fields: CustomProviderFieldErrors;
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  valid: boolean;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

const positiveInteger = (value: string): boolean => {
  const parsed = Number(value.trim());
  return /^[0-9]+$/.test(value.trim()) && Number.isSafeInteger(parsed) && parsed > 0;
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

const isCanonicalModel = (model: Model | ProviderModelDiscoveryResult['models'][number] | undefined): model is Model =>
  model !== undefined && 'modalities' in model;

export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const canonical = isCanonicalModel(model) ? { ...model } : undefined;
  const { modelId = '', name = '', contextWindow, maxOutputTokens } = model ?? {};
  return {
    row: crypto.randomUUID(),
    modelId,
    name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    modalities: canonical ? [...canonical.modalities] : ['text'],
    toolsSupported: canonical?.toolsSupported,
    base: canonical,
  };
}

export function createHeaderRow(): HeaderRow {
  return { row: crypto.randomUUID(), name: '', value: '' };
}

export function createEmptyCustomProviderForm(
  initial?: ProviderConfigurationRead,
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
  };
  if (editing) request.providerId = form.providerId;
  if (form.apiKey) request.apiKey = form.apiKey;
  if (form.credentialRef) request.credentialRef = form.credentialRef;
  return ProviderModelDiscoveryRequestSchema.parse(request);
}
