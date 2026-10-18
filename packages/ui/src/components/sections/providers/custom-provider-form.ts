import { ModelSchema, ProviderConfigureRequestSchema, ProviderModelDiscoveryRequestSchema } from '@openchamber/agent-contract';
import type { Model, ProviderConfigurationRead, ProviderConfigureRequest, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';

export const CUSTOM_PROVIDER_ID = '__custom_provider__';
export const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;
export interface ModelRow {
  row: string;
  modelId: string;
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
  details: string;
}
export interface HeaderRow { row: string; name: string; value: string }
export interface CustomProviderFormState {
  providerId: string;
  name: string;
  endpoint: string;
  protocol: ProviderConfigureRequest['configuration']['protocol'];
  credentialRef: string | null;
  apiKey: string;
  replaceHeaders: boolean;
  headerNames: string[];
  headers: HeaderRow[];
  models: ModelRow[];
}
export interface CustomProviderPersistPlan { request: ProviderConfigureRequest; apiKey: string }

export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const { modelId = '', name = '', contextWindow, maxOutputTokens, ...details } = model ?? {};
  return {
    row: crypto.randomUUID(), modelId, name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    details: JSON.stringify({ modalities: ['text'], reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null, ...details }, null, 2),
  };
}
export function createEmptyCustomProviderForm(initial?: ProviderConfigurationRead): CustomProviderFormState {
  return {
    providerId: initial?.configuration.providerId ?? '', name: initial?.configuration.name ?? '',
    endpoint: initial?.configuration.endpoint ?? '', protocol: initial?.configuration.protocol ?? 'chat-completions',
    credentialRef: initial?.configuration.credentialRef ?? null, apiKey: '',
    replaceHeaders: !initial, headerNames: initial?.headerNames ?? [], headers: [],
    models: initial ? initial.models.map(createModelRow) : [createModelRow()],
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

export function buildCustomProviderRequest(form: CustomProviderFormState, expectedRevision: string): CustomProviderPersistPlan {
  const providerId = form.providerId.trim();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(providerId)) throw new Error('Invalid provider ID');
  const models = form.models.map((row) => {
    // All canonical metadata survives editing. Discovery supplies no fabricated limits.
    const details: unknown = JSON.parse(row.details);
    if (!details || typeof details !== 'object' || Array.isArray(details)) throw new Error('Invalid model metadata');
    return ModelSchema.parse({ ...details, provider: providerId, modelId: row.modelId.trim(), name: row.name.trim(),
      contextWindow: row.contextWindow.trim() ? Number(row.contextWindow) : 0,
      maxOutputTokens: row.maxOutputTokens.trim() ? Number(row.maxOutputTokens) : 0 });
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length) throw new Error('Duplicate model ID');
  return { apiKey: form.apiKey, request: ProviderConfigureRequestSchema.parse({ expectedRevision,
    configuration: { providerId, name: form.name.trim(), endpoint: form.endpoint.trim(), protocol: form.protocol, credentialRef: form.credentialRef },
    headers: providerHeaderWrite(form), models }) };
}

export function buildProviderDiscoveryRequest(form: CustomProviderFormState, editing: boolean) {
  return ProviderModelDiscoveryRequestSchema.parse({
    ...(editing ? { providerId: form.providerId } : {}), endpoint: form.endpoint.trim(), protocol: form.protocol,
    headers: providerHeaderWrite(form), ...(form.apiKey ? { apiKey: form.apiKey } : {}),
    ...(form.credentialRef ? { credentialRef: form.credentialRef } : {}),
  });
}
