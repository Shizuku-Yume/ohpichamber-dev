import { expect, test } from 'bun:test';
import type { Model, ModelCatalogInfo, ProviderConfigurationRead } from '@openchamber/agent-contract';
import {
  applyModelCatalogInfo,
  autoFillFields,
  autoFillIds,
  autoFillNoticeFor,
  autoFillNoticeIds,
  catalogInputs,
  formatAutoFillNoticeModels,
  unresolvedAutoFillIds,
  buildCustomProviderRequest,
  createDiscoveredModelRow,
  createEmptyCustomProviderForm,
  createModelRow,
  discoveryFilterCounts,
  discoveryFilterValues,
  discoveryRows,
  groupDiscoveryRows,
  idsMissingCatalog,
  idsToAdd,
  markModelFieldTyped,
  matchesDiscoveryFilter,
  staleModelIds,
  isCustomProviderProtocol,
  isValidProviderID,
  modelModalitiesForKind,
  normalizeModelModalities,
  validateCustomProviderForm,
  type CustomProviderTranslator,
} from './custom-provider-form';

const translate: CustomProviderTranslator = (key) => key;

<<<<<<< HEAD
test('the protocol guard admits only the native provider protocols', () => {
  expect(isCustomProviderProtocol('responses')).toBe(true);
  expect(isCustomProviderProtocol('generate-content')).toBe(true);
  expect(isCustomProviderProtocol('openai-chat')).toBe(false);
||||||| bc50ba56aa
const baseForm = (overrides: Partial<CustomProviderFormState> = {}): CustomProviderFormState => ({
  providerID: 'custom-provider',
  name: 'Custom Provider',
  icon: 'server',
  logo: null,
  protocol: 'openai-chat',
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  models: [{
    row: 'm0',
    id: 'model-a',
    name: 'Model A',
    contextWindow: '',
    maxOutputTokens: '',
    inputCapabilities: ['text'],
    outputCapabilities: ['text'],
    tools: true,
    capabilitiesKnown: false,
    variants: '',
  }],
  headers: [{ row: 'h0', key: '', value: '' }],
  ...overrides,
=======
const baseForm = (overrides: Partial<CustomProviderFormState> = {}): CustomProviderFormState => ({
  providerID: 'custom-provider',
  name: 'Custom Provider',
  icon: 'server',
  logo: null,
  protocol: 'openai-chat',
  baseURL: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  models: [{
    row: 'm0',
    id: 'model-a',
    name: 'Model A',
    contextWindow: '',
    maxOutputTokens: '',
    inputCapabilities: ['text'],
    outputCapabilities: ['text'],
    tools: true,
    capabilitiesKnown: false,
    variants: '',
  }],
  headers: [{ row: 'h0', key: '', value: '' }],
  tls: null,
  ...overrides,
>>>>>>> upstream/main
});

test('discovering only an identity does not invent model limits that can be saved', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models = [createModelRow({ modelId: 'research', name: 'Research' })];

  expect(() => buildCustomProviderRequest(form, '4')).toThrow();

  // The user reviews and supplies the missing native execution limits before saving.
  form.models[0]!.contextWindow = '32768';
  form.models[0]!.maxOutputTokens = '4096';
  expect(buildCustomProviderRequest(form, '4').request.models?.[0]).toMatchObject({
    modelId: 'research', contextWindow: 32768, maxOutputTokens: 4096,
  });
});

<<<<<<< HEAD
test('editing provider connection settings preserves reviewed canonical model capabilities', () => {
  const model: Model = {
    modelId: 'research', provider: 'campus', name: 'Research', modalities: ['text', 'image'],
    contextWindow: 32768, maxOutputTokens: 4096, reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: 2048 }],
    variants: [{ variant: 'deep', label: 'Deep', reasoningEffort: 'high' }],
    toolsSupported: false, enabled: true, status: 'beta',
    pricing: {
      inputPerMillionTokens: 1, outputPerMillionTokens: 3,
      cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: null
    },
  };
  const initial: ProviderConfigurationRead = {
    revision: '4', configuration: {
      providerId: 'campus', name: 'Campus',
      endpoint: 'https://models.example.edu/v1', protocol: 'responses', credentialRef: null
    },
    headerNames: ['X-Tenant'], models: [model], imageModels: [],
  };
  const form = createEmptyCustomProviderForm(initial);
  form.endpoint = 'https://models.example.edu/v2';

  const saved = buildCustomProviderRequest(form, '4');
  expect(saved.request.configuration.endpoint).toBe(form.endpoint);
  expect(saved.request.models).toEqual([model]);
});

test('model controls update only the edited native fields', () => {
  const model: Model = {
    modelId: 'research', provider: 'campus', name: 'Research', modalities: ['text'],
    contextWindow: 32768, maxOutputTokens: 4096, reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: 2048 }],
    variants: [], toolsSupported: false,
    pricing: {
      inputPerMillionTokens: 1, outputPerMillionTokens: 3,
      cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: null
    },
  };
  const form = createEmptyCustomProviderForm({
    revision: '4', configuration: {
      providerId: 'campus', name: 'Campus',
      endpoint: 'https://models.example.edu/v1', protocol: 'chat-completions', credentialRef: null
    },
    headerNames: [], models: [model], imageModels: [],
  });
  form.models[0]!.modalities = ['text', 'image'];
  form.models[0]!.toolsSupported = true;

  expect(buildCustomProviderRequest(form, '4').request.models?.[0]).toMatchObject({
    modalities: ['text', 'image'],
    toolsSupported: true,
    reasoningOptions: model.reasoningOptions,
    pricing: model.pricing,
  });
});

test('validation points at duplicate model identities and invalid limits before submit', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models = [
    { ...createModelRow(), modelId: 'research', name: 'Research', contextWindow: '100', maxOutputTokens: '200' },
    { ...createModelRow(), modelId: 'research', name: 'Research copy', contextWindow: '100', maxOutputTokens: '50' },
  ];

  const validation = validateCustomProviderForm(form, new Set(), false, translate);
  expect(validation.valid).toBe(false);
  expect(validation.models[0]?.maxOutputTokens).toBe('settings.providers.page.custom.error.maxOutputExceedsContext');
  expect(validation.models[1]?.modelId).toBe('settings.providers.page.custom.error.duplicate');
});

test('the provider id rule follows OMP\'s selector grammar', () => {
  expect(isValidProviderID('Campus.2')).toBe(true);
  expect(isValidProviderID('campus_2-alpha')).toBe(true);

  for (const invalid of ['a/b', 'a#b', 'a@b', 'a:b', 'a b', '__proto__', 'constructor', 'prototype', '', 'a'.repeat(129)]) {
    expect(isValidProviderID(invalid)).toBe(false);
  }
  expect(isValidProviderID('a'.repeat(128))).toBe(true);
||||||| bc50ba56aa
/** The editable fields a model row carries before anyone fills them in. */
const MODEL_ROW_DEFAULTS = {
  contextWindow: '',
  maxOutputTokens: '',
  inputCapabilities: ['text'],
  outputCapabilities: ['text'],
  tools: true,
  capabilitiesKnown: false,
};

/** Mirrors server upsert semantics for request-construction tests. */
function mergeProviderConfig(
  existing: Record<string, unknown>,
  providerID: string,
  config: CustomProviderConfig,
): Record<string, unknown> {
  const providerSection = (
    typeof existing.provider === 'object' && existing.provider !== null && !Array.isArray(existing.provider)
      ? { ...(existing.provider as Record<string, unknown>) }
      : {}
  );
  providerSection[providerID] = config;
  const next: Record<string, unknown> = {
    ...existing,
    provider: providerSection,
  };
  if (Array.isArray(existing.disabled_providers)) {
    next.disabled_providers = existing.disabled_providers.filter((entry) => entry !== providerID);
  }
  return next;
}
=======
/** The editable fields a model row carries before anyone fills them in. */
const MODEL_ROW_DEFAULTS = {
  contextWindow: '',
  maxOutputTokens: '',
  inputCapabilities: ['text'],
  outputCapabilities: ['text'],
  tools: true,
  capabilitiesKnown: false,
};

describe('client certificate', () => {
  const certificateForm = (tls: CustomProviderFormState['tls']) => validateCustomProvider({
    form: baseForm({ tls }), t, existingProviderIDs: new Set(),
  });

  test('saves file paths as file references and keeps references, PEM text and a literal passphrase as written', () => {
    expect(certificateForm({ cert: ' /etc/company/client.pem ', key: '~/keys/client.key', passphrase: '{env:KEY_PASS}' }).result?.config.settings)
      .toEqual({
        baseURL: 'https://api.example.com/v1',
        tls: { cert: '{file:/etc/company/client.pem}', key: '{file:~/keys/client.key}', passphrase: '{env:KEY_PASS}' },
      });
    const pem = '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----';
    expect(certificateForm({ cert: pem, key: 'C:\\certs\\client.key', passphrase: ' two words ' }).result?.config.settings.tls)
      .toEqual({ cert: pem, key: '{file:C:\\certs\\client.key}', passphrase: ' two words ' });
  });

  test('cleared fields remove the certificate, and fields never loaded leave the stored one alone', () => {
    expect(certificateForm({ cert: '', key: '', passphrase: '' }).result?.config.settings)
      .toEqual({ baseURL: 'https://api.example.com/v1', tls: null });
    expect(certificateForm(null).result?.config.settings).toEqual({ baseURL: 'https://api.example.com/v1' });
  });

  test('half a certificate or a relative path is refused on the field', () => {
    const half = certificateForm({ cert: '/etc/client.pem', key: '', passphrase: '' });
    expect(half.result).toBeUndefined();
    expect(half.err.tlsKey).toBe('settings.providers.page.custom.error.tls.incomplete');
    const passphraseOnly = certificateForm({ cert: '', key: '', passphrase: 'secret' });
    expect(passphraseOnly.err.tlsCert).toBe('settings.providers.page.custom.error.tls.incomplete');
    expect(passphraseOnly.err.tlsKey).toBe('settings.providers.page.custom.error.tls.incomplete');
    const relative = certificateForm({ cert: 'certs/client.pem', key: '/etc/client.key', passphrase: '' });
    expect(relative.result).toBeUndefined();
    expect(relative.err.tlsCert).toBe('settings.providers.page.custom.error.tls.relativePath');
    expect(relative.err.tlsKey).toBeUndefined();
    expect(certificateForm({ cert: '{file:certs/client.pem}', key: '{env:CLIENT_KEY}', passphrase: '' }).err.tlsCert)
      .toBe('settings.providers.page.custom.error.tls.relativePath');
  });

  test('editing shows the stored paths, never the certificate the live provider resolved', () => {
    const live = { id: 'gw', name: 'Gateway', settings: { baseURL: 'https://gw.example/v1', tls: { cert: '-----BEGIN CERTIFICATE-----', key: '-----BEGIN KEY-----' } } };
    expect(providerToEditFormState(live, null).tls).toBeNull();
    const stored = { settings: { baseURL: 'https://gw.example/v1', tls: { cert: '{file:/etc/client.pem}', key: '{file:/etc/client.key}', passphrase: '{env:P}' } } };
    expect(providerToEditFormState(live, stored).tls).toEqual({ cert: '/etc/client.pem', key: '/etc/client.key', passphrase: '{env:P}' });
  });
});
>>>>>>> upstream/main

<<<<<<< HEAD
  expect(validateCustomProviderForm({ ...createEmptyCustomProviderForm(), providerId: 'a/b' }, new Set(), false, translate)
    .fields.providerId).toBe('settings.providers.page.custom.error.providerID.format');
||||||| bc50ba56aa
describe('validateCustomProvider', () => {
  test('builds trimmed config and auth payloads', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: ' custom-provider ',
        name: ' Custom Provider ',
        baseURL: ' https://api.example.com/v1 ',
        apiKey: ' sk-secret ',
        models: [baseModel({ id: ' model-a ', name: ' Model A ' })],
        headers: [
          { row: 'h0', key: ' X-Test ', value: ' enabled ' },
          { row: 'h1', key: '', value: '' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual({
      providerID: 'custom-provider',
      icon: 'server',
      logo: { kind: 'keep' },
      name: 'Custom Provider',
      apiKey: 'sk-secret',
      config: {
        package: 'aisdk:@ai-sdk/openai-compatible',
        name: 'Custom Provider',
        settings: {
          baseURL: 'https://api.example.com/v1',
        },
        headers: {
          'X-Test': 'enabled',
        },
        models: {
          'model-a': { modelID: 'model-a', name: 'Model A' },
        },
      },
    });
  });

  test('persists reviewed model limits and capabilities', () => {
    const result = validateCustomProvider({
      form: baseForm({
        models: [baseModel({
          contextWindow: '128000',
          maxOutputTokens: '16384',
          inputCapabilities: ['text', 'image'],
          outputCapabilities: ['text'],
          tools: false,
          capabilitiesKnown: true,
        })],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.models['model-a']).toEqual({
      modelID: 'model-a',
      name: 'Model A',
      limit: { context: 128000, output: 16384 },
      capabilities: { tools: false, input: ['text', 'image'], output: ['text'] },
    });
  });

  test('keeps the selected OpenChamber provider icon in the persistence plan', () => {
    const result = validateCustomProvider({
      form: baseForm({ icon: 'cloud' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.icon).toBe('cloud');
    expect('icon' in (result.result?.config ?? {})).toBe(false);
  });

  test('keeps no icon for a new provider so its own logo still shows', () => {
    expect(createEmptyCustomProviderForm().icon).toBeNull();
    expect(createEmptyCustomProviderForm().logo).toBeNull();
  });

  test('changes the stored logo image only through what the user did in the field', () => {
    const planFor = (logo: CustomProviderFormState['logo']) => validateCustomProvider({
      form: baseForm({ logo }),
      t,
      existingProviderIDs: new Set(),
    }).result?.logo;
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    // Untouched: a logo kept from before, or uploaded by another client meanwhile, stays.
    expect(planFor(null)).toEqual({ kind: 'keep' });
    expect(planFor(file)).toEqual({ kind: 'upload', file });
    expect(planFor('removed')).toEqual({ kind: 'remove' });
  });

  test('turns a discovered model into a row, the provider winning over models.dev field by field', () => {
    const row = modelRowFromDiscovery({
      id: 'llama-3',
      name: 'llama-3',
      limit: { context: 8192 },
      metadata: {
        providerID: 'meta',
        modelID: 'llama-3',
        name: 'Llama 3',
        limit: { context: 128000, output: 4096 },
        capabilities: { tools: false, input: ['text', 'image'], output: ['text'] },
      },
    });
    expect(row.id).toBe('llama-3');
    expect(row.name).toBe('Llama 3');
    expect(row.contextWindow).toBe('8192');
    expect(row.maxOutputTokens).toBe('4096');
    expect(row.inputCapabilities).toEqual(['text', 'image']);
    expect(row.tools).toBe(false);
    expect(row.metadataSource).toBe('provider-api');
  });

  test('a discovered model nothing describes gets text in and out with tool calls', () => {
    const row = modelRowFromDiscovery({ id: 'plain', name: 'plain' });
    expect(row.contextWindow).toBe('');
    expect(row.inputCapabilities).toEqual(['text']);
    expect(row.tools).toBe(true);
    expect(row.metadataSource).toBe(undefined);
  });

  test('supports {env:VAR} credentials without writing an auth key', () => {
    const result = validateCustomProvider({
      form: baseForm({
        apiKey: '{env: CUSTOM_PROVIDER_KEY}',
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.apiKey).toEqual(undefined);
    expect(result.result?.config.env).toEqual(['CUSTOM_PROVIDER_KEY']);
  });

  test('uses the selected OpenCode provider adapter', () => {
    const result = validateCustomProvider({
      form: baseForm({ protocol: 'openai-responses' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.package).toBe('aisdk:@ai-sdk/openai');
  });

  test('rejects missing credentials', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '   ' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.apiKey).toBe('settings.providers.page.custom.error.apiKey.required');
  });

  test('allows empty api key when editing with existing auth', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
      allowExistingAuth: true,
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.apiKey).toEqual(undefined);
    expect(result.result?.apiKey).toEqual(undefined);
  });

  test('rejects invalid provider id, base URL, and duplicate rows', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: 'Bad ID',
        baseURL: 'ftp://example.com',
        models: [
          baseModel(),
          baseModel({ row: 'm1', name: 'Model A 2' }),
        ],
        headers: [
          { row: 'h0', key: 'Authorization', value: 'one' },
          { row: 'h1', key: 'authorization', value: 'two' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.format');
    expect(result.err.baseURL).toBe('settings.providers.page.custom.error.baseURL.format');
    expect(result.models[1]).toEqual({
      id: 'settings.providers.page.custom.error.duplicate',
      name: undefined,
    });
    expect(result.headers[1]).toEqual({
      key: 'settings.providers.page.custom.error.duplicate',
      value: undefined,
    });
  });

  test('allows reconnecting a disabled provider id', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      disabledProviders: ['custom-provider'],
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });

  test('rejects an already-connected provider id on create', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.exists');
  });

  test('allows updating the same provider id while editing', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: 'sk-updated' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });
=======
describe('validateCustomProvider', () => {
  test('builds trimmed config and auth payloads', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: ' custom-provider ',
        name: ' Custom Provider ',
        baseURL: ' https://api.example.com/v1 ',
        apiKey: ' sk-secret ',
        models: [baseModel({ id: ' model-a ', name: ' Model A ' })],
        headers: [
          { row: 'h0', key: ' X-Test ', value: ' enabled ' },
          { row: 'h1', key: '', value: '' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual({
      providerID: 'custom-provider',
      icon: 'server',
      logo: { kind: 'keep' },
      name: 'Custom Provider',
      apiKey: 'sk-secret',
      config: {
        package: 'aisdk:@ai-sdk/openai-compatible',
        name: 'Custom Provider',
        settings: {
          baseURL: 'https://api.example.com/v1',
        },
        headers: {
          'X-Test': 'enabled',
        },
        models: {
          'model-a': { modelID: 'model-a', name: 'Model A' },
        },
      } satisfies CustomProviderConfig,
    });
  });

  test('persists reviewed model limits and capabilities', () => {
    const result = validateCustomProvider({
      form: baseForm({
        models: [baseModel({
          contextWindow: '128000',
          maxOutputTokens: '16384',
          inputCapabilities: ['text', 'image'],
          outputCapabilities: ['text'],
          tools: false,
          capabilitiesKnown: true,
        })],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.models['model-a']).toEqual({
      modelID: 'model-a',
      name: 'Model A',
      limit: { context: 128000, output: 16384 },
      capabilities: { tools: false, input: ['text', 'image'], output: ['text'] },
    });
  });

  test('keeps the selected OpenChamber provider icon in the persistence plan', () => {
    const result = validateCustomProvider({
      form: baseForm({ icon: 'cloud' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.icon).toBe('cloud');
    expect('icon' in (result.result?.config ?? {})).toBe(false);
  });

  test('keeps no icon for a new provider so its own logo still shows', () => {
    expect(createEmptyCustomProviderForm().icon).toBeNull();
    expect(createEmptyCustomProviderForm().logo).toBeNull();
  });

  test('changes the stored logo image only through what the user did in the field', () => {
    const planFor = (logo: CustomProviderFormState['logo']) => validateCustomProvider({
      form: baseForm({ logo }),
      t,
      existingProviderIDs: new Set(),
    }).result?.logo;
    const file = new File(['png'], 'logo.png', { type: 'image/png' });

    // Untouched: a logo kept from before, or uploaded by another client meanwhile, stays.
    expect(planFor(null)).toEqual({ kind: 'keep' });
    expect(planFor(file)).toEqual({ kind: 'upload', file });
    expect(planFor('removed')).toEqual({ kind: 'remove' });
  });

  test('turns a discovered model into a row, the provider winning over models.dev field by field', () => {
    const row = modelRowFromDiscovery({
      id: 'llama-3',
      name: 'llama-3',
      limit: { context: 8192 },
      metadata: {
        providerID: 'meta',
        modelID: 'llama-3',
        name: 'Llama 3',
        limit: { context: 128000, output: 4096 },
        capabilities: { tools: false, input: ['text', 'image'], output: ['text'] },
      },
    });
    expect(row.id).toBe('llama-3');
    expect(row.name).toBe('Llama 3');
    expect(row.contextWindow).toBe('8192');
    expect(row.maxOutputTokens).toBe('4096');
    expect(row.inputCapabilities).toEqual(['text', 'image']);
    expect(row.tools).toBe(false);
    expect(row.metadataSource).toBe('provider-api');
  });

  test('a discovered model nothing describes gets text in and out with tool calls', () => {
    const row = modelRowFromDiscovery({ id: 'plain', name: 'plain' });
    expect(row.contextWindow).toBe('');
    expect(row.inputCapabilities).toEqual(['text']);
    expect(row.tools).toBe(true);
    expect(row.metadataSource).toBe(undefined);
  });

  test('supports {env:VAR} credentials without writing an auth key', () => {
    const result = validateCustomProvider({
      form: baseForm({
        apiKey: '{env: CUSTOM_PROVIDER_KEY}',
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.apiKey).toEqual(undefined);
    expect(result.result?.config.env).toEqual(['CUSTOM_PROVIDER_KEY']);
  });

  test('uses the selected OpenCode provider adapter', () => {
    const result = validateCustomProvider({
      form: baseForm({ protocol: 'openai-responses' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result?.config.package).toBe('aisdk:@ai-sdk/openai');
  });

  test('rejects missing credentials', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '   ' }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.apiKey).toBe('settings.providers.page.custom.error.apiKey.required');
  });

  test('allows empty api key when editing with existing auth', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: '' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
      allowExistingAuth: true,
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.apiKey).toEqual(undefined);
    expect(result.result?.apiKey).toEqual(undefined);
  });

  test('rejects invalid provider id, base URL, and duplicate rows', () => {
    const result = validateCustomProvider({
      form: baseForm({
        providerID: 'Bad ID',
        baseURL: 'ftp://example.com',
        models: [
          baseModel(),
          baseModel({ row: 'm1', name: 'Model A 2' }),
        ],
        headers: [
          { row: 'h0', key: 'Authorization', value: 'one' },
          { row: 'h1', key: 'authorization', value: 'two' },
        ],
      }),
      t,
      existingProviderIDs: new Set(),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.format');
    expect(result.err.baseURL).toBe('settings.providers.page.custom.error.baseURL.format');
    expect(result.models[1]).toEqual({
      id: 'settings.providers.page.custom.error.duplicate',
      name: undefined,
    });
    expect(result.headers[1]).toEqual({
      key: 'settings.providers.page.custom.error.duplicate',
      value: undefined,
    });
  });

  test('allows reconnecting a disabled provider id', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      disabledProviders: ['custom-provider'],
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });

  test('rejects an already-connected provider id on create', () => {
    const result = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(['custom-provider']),
    });

    expect(result.result).toEqual(undefined);
    expect(result.err.providerID).toBe('settings.providers.page.custom.error.providerID.exists');
  });

  test('allows updating the same provider id while editing', () => {
    const result = validateCustomProvider({
      form: baseForm({ apiKey: 'sk-updated' }),
      t,
      existingProviderIDs: new Set(['custom-provider']),
      editingProviderID: 'custom-provider',
    });

    expect(result.result?.providerID).toBe('custom-provider');
    expect(result.err.providerID).toEqual(undefined);
  });
>>>>>>> upstream/main
});

test('provider ids are unique regardless of case', () => {
  const form = { ...createEmptyCustomProviderForm(), providerId: 'Campus.2' };
  expect(validateCustomProviderForm(form, new Set(['campus.2']), false, translate).fields.providerId)
    .toBe('settings.providers.page.custom.error.providerID.exists');
  expect(validateCustomProviderForm(form, new Set(['campus.3']), false, translate).fields.providerId)
    .toBeUndefined();
});

<<<<<<< HEAD
test('the request builder keeps a gateway query string unchanged', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'Campus.2';
  form.name = 'Campus';
  form.endpoint = 'https://res.openai.azure.com/openai/v1?api-version=2024-10-21';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '32768';
  form.models[0]!.maxOutputTokens = '4096';

  expect(validateCustomProviderForm(form, new Set(), false, translate).fields.endpoint).toBeUndefined();
  expect(buildCustomProviderRequest(form, '4').request.configuration.endpoint)
    .toBe('https://res.openai.azure.com/openai/v1?api-version=2024-10-21');
});

test('the base URL still refuses fragments and embedded credentials', () => {
  for (const endpoint of [
    'https://user:secret@models.example.edu/v1',
    'https://user@models.example.edu/v1',
    'https://models.example.edu/v1#section',
    'ftp://models.example.edu/v1',
  ]) {
    const form = { ...createEmptyCustomProviderForm(), endpoint };
    expect(validateCustomProviderForm(form, new Set(), false, translate).fields.endpoint)
      .toBe('settings.providers.page.custom.error.baseURL.format');
  }
||||||| bc50ba56aa
describe('mergeProviderConfig persistence shape', () => {
  test('merges provider block and clears disabled_providers entry', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    const next = mergeProviderConfig(
      {
        model: 'openai/gpt-4o',
        provider: {
          openai: { name: 'OpenAI' },
        },
        disabled_providers: ['custom-provider', 'other'],
      },
      plan.providerID,
      plan.config,
    );

    expect(next).toEqual({
      model: 'openai/gpt-4o',
      provider: {
        openai: { name: 'OpenAI' },
        'custom-provider': plan.config,
      },
      disabled_providers: ['other'],
    });
  });

  test('creates provider section when missing', () => {
    const validated = validateCustomProvider({
      form: baseForm(),
      t,
      existingProviderIDs: new Set(),
    });
    const plan = validated.result!;

    const next = mergeProviderConfig({}, plan.providerID, plan.config);
    expect(next.provider).toEqual({
      'custom-provider': plan.config,
    });
  });
});

describe('provider edit helpers', () => {
  test('detects openai-compatible custom providers and prefills form state', () => {
    expect(isCustomOpenAICompatibleProvider({
      id: 'campus-llm',
      options: { baseURL: 'https://llm.example.edu/v1' },
      models: [],
    })).toBe(true);

    const state = providerToCustomFormState({
      id: 'campus-llm',
      name: 'Campus LLM',
      env: ['CAMPUS_KEY'],
      options: {
        baseURL: 'https://llm.example.edu/v1',
        headers: { 'X-Campus': '1' },
      },
      models: [{ id: 'fast', name: 'Fast' }],
    });

    expect(state.providerID).toBe('campus-llm');
    expect(state.name).toBe('Campus LLM');
    expect(state.baseURL).toBe('https://llm.example.edu/v1');
    expect(state.apiKey).toBe('{env:CAMPUS_KEY}');
    expect(state.protocol).toBe('openai-chat');
    expect(state.models[0]).toEqual({ ...MODEL_ROW_DEFAULTS, row: state.models[0].row, id: 'fast', name: 'Fast', variants: '', savedVariants: {} });
    expect(state.headers[0]).toEqual({ row: state.headers[0].row, key: 'X-Campus', value: '1' });
  });

  test('prefills the protocol from a v1 model api.npm', () => {
    const state = providerToCustomFormState({
      id: 'responses-api',
      options: { baseURL: 'https://api.example.com/v1' },
      models: [{ id: 'gpt', name: 'GPT', api: { npm: '@ai-sdk/openai' } }],
    });

    expect(state.protocol).toBe('openai-responses');
  });

  test('reads a v2 provider: package, settings, headers, modelID', () => {
    const state = providerToCustomFormState({
      id: 'campus-llm',
      name: 'Campus LLM',
      env: ['CAMPUS_KEY'],
      package: 'aisdk:@ai-sdk/anthropic',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      headers: { 'X-Campus': '1' },
      models: { fast: { modelID: 'fast-model', name: 'Fast' } },
    });

    expect(state.protocol).toBe('anthropic-messages');
    expect(state.baseURL).toBe('https://llm.example.edu/v1');
    expect(state.headers[0]).toEqual({ row: state.headers[0].row, key: 'X-Campus', value: '1' });
    expect(state.models[0]).toEqual({ ...MODEL_ROW_DEFAULTS, row: state.models[0].row, id: 'fast-model', name: 'Fast', variants: '', savedVariants: {} });
  });

  test('a v2 provider with only a known package still reads as custom', () => {
    expect(isCustomOpenAICompatibleProvider({
      id: 'campus-llm',
      package: 'aisdk:@ai-sdk/openai-compatible',
      models: [],
    })).toBe(true);
  });

  test('requires a config-layer source before treating a provider as editable custom', () => {
    const catalogLike = {
      id: 'openai',
      options: { baseURL: 'https://api.openai.com/v1' },
      models: [{ id: 'gpt-4o', name: 'GPT-4o', api: { npm: '@ai-sdk/openai-compatible' } }],
    };

    expect(isCustomOpenAICompatibleProvider(catalogLike)).toBe(true);
    expect(isConfigDefinedCustomProvider(catalogLike, undefined)).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: false },
      project: { exists: false },
      custom: { exists: false },
    })).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: true },
      project: { exists: false },
    })).toBe(true);
  });

  test('resolveProviderConfigScope follows custom > project > user precedence', () => {
    expect(resolveProviderConfigScope(undefined)).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: false },
      custom: { exists: false },
    })).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: false },
    })).toBe('project');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: true },
    })).toBe('custom');
    expect(resolveProviderConfigScope({
      user: { exists: false },
      project: { exists: false },
      custom: { exists: true },
    })).toBe('custom');
  });
=======
describe('provider edit helpers', () => {
  test('detects openai-compatible custom providers and prefills form state', () => {
    expect(isCustomOpenAICompatibleProvider({
      id: 'campus-llm',
      options: { baseURL: 'https://llm.example.edu/v1' },
      models: [],
    })).toBe(true);

    const state = providerToCustomFormState({
      id: 'campus-llm',
      name: 'Campus LLM',
      env: ['CAMPUS_KEY'],
      options: {
        baseURL: 'https://llm.example.edu/v1',
        headers: { 'X-Campus': '1' },
      },
      models: [{ id: 'fast', name: 'Fast' }],
    });

    expect(state.providerID).toBe('campus-llm');
    expect(state.name).toBe('Campus LLM');
    expect(state.baseURL).toBe('https://llm.example.edu/v1');
    expect(state.apiKey).toBe('{env:CAMPUS_KEY}');
    expect(state.protocol).toBe('openai-chat');
    expect(state.models[0]).toEqual({ ...MODEL_ROW_DEFAULTS, row: state.models[0].row, id: 'fast', name: 'Fast', variants: '', savedVariants: {} });
    expect(state.headers[0]).toEqual({ row: state.headers[0].row, key: 'X-Campus', value: '1' });
  });

  test('prefills the protocol from a v1 model api.npm', () => {
    const state = providerToCustomFormState({
      id: 'responses-api',
      options: { baseURL: 'https://api.example.com/v1' },
      models: [{ id: 'gpt', name: 'GPT', api: { npm: '@ai-sdk/openai' } }],
    });

    expect(state.protocol).toBe('openai-responses');
  });

  test('reads a v2 provider: package, settings, headers, modelID', () => {
    const state = providerToCustomFormState({
      id: 'campus-llm',
      name: 'Campus LLM',
      env: ['CAMPUS_KEY'],
      package: 'aisdk:@ai-sdk/anthropic',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      headers: { 'X-Campus': '1' },
      models: { fast: { modelID: 'fast-model', name: 'Fast' } },
    });

    expect(state.protocol).toBe('anthropic-messages');
    expect(state.baseURL).toBe('https://llm.example.edu/v1');
    expect(state.headers[0]).toEqual({ row: state.headers[0].row, key: 'X-Campus', value: '1' });
    expect(state.models[0]).toEqual({ ...MODEL_ROW_DEFAULTS, row: state.models[0].row, id: 'fast-model', name: 'Fast', variants: '', savedVariants: {} });
  });

  test('a v2 provider with only a known package still reads as custom', () => {
    expect(isCustomOpenAICompatibleProvider({
      id: 'campus-llm',
      package: 'aisdk:@ai-sdk/openai-compatible',
      models: [],
    })).toBe(true);
  });

  test('requires a config-layer source before treating a provider as editable custom', () => {
    const catalogLike = {
      id: 'openai',
      options: { baseURL: 'https://api.openai.com/v1' },
      models: [{ id: 'gpt-4o', name: 'GPT-4o', api: { npm: '@ai-sdk/openai-compatible' } }],
    };

    expect(isCustomOpenAICompatibleProvider(catalogLike)).toBe(true);
    expect(isConfigDefinedCustomProvider(catalogLike, undefined)).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: false },
      project: { exists: false },
      custom: { exists: false },
    })).toBe(false);
    expect(isConfigDefinedCustomProvider(catalogLike, {
      user: { exists: true },
      project: { exists: false },
    })).toBe(true);
  });

  test('resolveProviderConfigScope follows custom > project > user precedence', () => {
    expect(resolveProviderConfigScope(undefined)).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: false },
      custom: { exists: false },
    })).toBe('user');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: false },
    })).toBe('project');
    expect(resolveProviderConfigScope({
      user: { exists: true },
      project: { exists: true },
      custom: { exists: true },
    })).toBe('custom');
    expect(resolveProviderConfigScope({
      user: { exists: false },
      project: { exists: false },
      custom: { exists: true },
    })).toBe('custom');
  });
>>>>>>> upstream/main
});

test('audio and embedding chips follow the native kind the writer accepts', () => {
  expect(modelModalitiesForKind('chat')).toEqual(['text', 'image']);
  expect(modelModalitiesForKind('tts')).toEqual(['text', 'image', 'audio']);
  expect(modelModalitiesForKind('stt')).toEqual(['text', 'image', 'audio']);
  expect(modelModalitiesForKind('embedding')).toEqual(['text', 'image', 'embedding']);

  // A saved chat row can still carry an audio modality; the request drops it
  // instead of sending a combination the writer rejects with 422.
  expect(normalizeModelModalities('chat', ['text', 'audio'])).toEqual(['text']);
  expect(normalizeModelModalities('embedding', ['text', 'audio'])).toEqual(['text']);
  expect(normalizeModelModalities('tts', ['audio'])).toEqual(['text', 'audio']);
});

test('a tts row keeps audio in the built request', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'speech';
  form.name = 'Speech';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'voice';
  form.models[0]!.name = 'Voice';
  form.models[0]!.contextWindow = '4096';
  form.models[0]!.maxOutputTokens = '1024';
  form.models[0]!.nativeKind = 'tts';
  form.models[0]!.modalities = ['text', 'audio'];

  expect(buildCustomProviderRequest(form, '4').request.models?.[0]?.modalities).toEqual(['text', 'audio']);
});

<<<<<<< HEAD
test('a row carries the native kind a saved model implies', () => {
  const embedding = createModelRow({
    modelId: 'embed', provider: 'campus', name: 'Embed', modalities: ['text', 'embedding'],
    contextWindow: 8192, maxOutputTokens: 1024, reasoningEffortSupported: false,
    reasoningOptions: [], variants: [], pricing: null,
||||||| bc50ba56aa
describe('edit form from the stored config entry', () => {
  // What OpenCode serves: no `env`, and reasoning levels it generated itself.
  const live = {
    id: 'campus-llm',
    name: 'Campus LLM (live)',
    package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: 'https://live.example.com/v1' },
    models: [{
      id: 'fast',
      name: 'Fast',
      variants: [{ id: 'low', settings: { reasoningEffort: 'low' } }, { id: 'high', settings: { reasoningEffort: 'high' } }],
    }],
  };

  const editAndSave = (form: CustomProviderFormState) => validateCustomProvider({
    form,
    t,
    existingProviderIDs: new Set(['campus-llm']),
    editingProviderID: 'campus-llm',
    allowExistingAuth: true,
  }).result?.config;

  test('keeps env and writes back only the levels the user stored', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      package: 'aisdk:@ai-sdk/openai-compatible',
      env: ['CAMPUS_KEY'],
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { fast: { modelID: 'fast', name: 'Fast', variants: [{ id: 'max', body: { think: true } }] } },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.name).toBe('Campus LLM');
    expect(form.baseURL).toBe('https://llm.example.edu/v1');
    expect(form.apiKey).toBe('{env:CAMPUS_KEY}');
    expect(form.models[0].variants).toBe('max');

    const config = editAndSave(form);
    expect(config?.env).toEqual(['CAMPUS_KEY']);
    expect(config?.models.fast).toEqual({ modelID: 'fast', name: 'Fast', variants: [{ id: 'max', body: { think: true } }] });
=======
describe('edit form from the stored config entry', () => {
  // What OpenCode serves: no `env`, and reasoning levels it generated itself.
  const live = {
    id: 'campus-llm',
    name: 'Campus LLM (live)',
    package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: 'https://live.example.com/v1' },
    models: [{
      id: 'fast',
      name: 'Fast',
      variants: [{ id: 'low', settings: { reasoningEffort: 'low' } }, { id: 'high', settings: { reasoningEffort: 'high' } }],
    }],
  };

  const editAndSave = (form: CustomProviderFormState) => validateCustomProvider({
    form,
    t,
    existingProviderIDs: new Set(['campus-llm']),
    editingProviderID: 'campus-llm',
    allowExistingAuth: true,
  }).result?.config;

  test('keeps a stored built-in package until the user changes the protocol', () => {
    const cases: { packageName: string; protocol: CustomProviderFormState['protocol'] }[] = [
      { packageName: '@opencode/ai/providers/openai-compatible', protocol: 'openai-chat' },
      { packageName: '@opencode/ai/providers/openai-compatible/responses', protocol: 'openai-responses' },
      { packageName: '@opencode/ai/providers/openai-compatible-responses', protocol: 'openai-responses' },
      { packageName: '@opencode/ai/providers/openai', protocol: 'openai-responses' },
      { packageName: '@opencode/ai/providers/openai/chat', protocol: 'openai-chat' },
      { packageName: '@opencode/ai/providers/openai/responses', protocol: 'openai-responses' },
      { packageName: '@opencode/ai/providers/anthropic', protocol: 'anthropic-messages' },
      { packageName: '@opencode/ai/providers/anthropic-compatible', protocol: 'anthropic-messages' },
    ];
    for (const { packageName, protocol } of cases) {
      const stored = storedProviderEntrySchema.parse({
        name: 'Campus LLM',
        package: packageName,
        settings: { baseURL: 'https://llm.example.edu/v1' },
        models: { fast: { name: 'Fast' } },
      });
      const form = providerToEditFormState(live, stored);
      expect(form.protocol).toBe(protocol);
      expect(editAndSave({ ...form, name: 'Renamed' })?.package).toBe(packageName);

      const changedProtocol = protocol === 'openai-chat' ? 'anthropic-messages' : 'openai-chat';
      expect(editAndSave({ ...form, protocol: changedProtocol })?.package).toBe(
        changedProtocol === 'anthropic-messages' ? 'aisdk:@ai-sdk/anthropic' : 'aisdk:@ai-sdk/openai-compatible',
      );
    }
  });

  test('keeps env and writes back only the levels the user stored', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      package: 'aisdk:@ai-sdk/openai-compatible',
      env: ['CAMPUS_KEY'],
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { fast: { modelID: 'fast', name: 'Fast', variants: [{ id: 'max', body: { think: true } }] } },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.name).toBe('Campus LLM');
    expect(form.baseURL).toBe('https://llm.example.edu/v1');
    expect(form.apiKey).toBe('{env:CAMPUS_KEY}');
    expect(form.models[0].variants).toBe('max');

    const config = editAndSave(form);
    expect(config?.env).toEqual(['CAMPUS_KEY']);
    expect(config?.models.fast).toEqual({ modelID: 'fast', name: 'Fast', variants: [{ id: 'max', body: { think: true } }] });
>>>>>>> upstream/main
  });
  expect(embedding.nativeKind).toBe('embedding');
  expect(embedding.modalities).toEqual(['text', 'embedding']);

<<<<<<< HEAD
  const speech = createModelRow({
    modelId: 'voice', provider: 'campus', name: 'Voice', modalities: ['text', 'audio'],
    contextWindow: 8192, maxOutputTokens: 1024, reasoningEffortSupported: false,
    reasoningOptions: [], variants: [], pricing: null,
||||||| bc50ba56aa
  test('keeps saved limits and capabilities through an edit', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { vision: {
        name: 'Vision',
        limit: { context: 200000, output: 8192 },
        capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
      } },
    });
    const config = editAndSave(providerToEditFormState(live, stored));
    expect(config?.models.vision?.limit).toEqual({ context: 200000, output: 8192 });
    expect(config?.models.vision?.capabilities).toEqual({ tools: true, input: ['text', 'image'], output: ['text'] });
  });

  test('a saved model type loads and saves as it is, image or any other', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: {
        flare: { name: 'Flare', type: 'image' },
        judge: { name: 'Judge', type: 'decision' },
        fast: { name: 'Fast' },
      },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.models.map((model) => [model.id, model.type])).toEqual([['flare', 'image'], ['judge', 'decision'], ['fast', undefined]]);
    const models = editAndSave(form)?.models;
    expect(models?.flare.type).toBe('image');
    expect(models?.judge.type).toBe('decision');
    expect(models?.fast?.type).toBeUndefined();
  });

  test('a stored model without levels saves without the generated ones', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { fast: { name: 'Fast' } },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.protocol).toBe('openai-chat');
    expect(form.models[0].variants).toBe('');
    // An empty list: the server drops the key, so no levels are written.
    expect(editAndSave(form)?.models.fast.variants).toEqual([]);
  });

  test('falls back to live fields the entry leaves out, never to live levels', () => {
    const form = providerToEditFormState(live, storedProviderEntrySchema.parse({ env: ['CAMPUS_KEY'] }));

    expect(form.name).toBe('Campus LLM (live)');
    expect(form.baseURL).toBe('https://live.example.com/v1');
    expect(form.models.map((model) => [model.id, model.variants, model.savedVariants])).toEqual([['fast', '', undefined]]);
    expect(editAndSave(form)?.models.fast).toEqual({ modelID: 'fast', name: 'Fast' });
  });

  test('without a stored entry the live levels stay out of the save', () => {
    const form = providerToEditFormState(live, null);
    expect(editAndSave(form)?.models.fast).toEqual({ modelID: 'fast', name: 'Fast' });
=======
  test('keeps saved limits and capabilities through an edit', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { vision: {
        name: 'Vision',
        limit: { context: 200000, output: 8192 },
        capabilities: { tools: true, input: ['text', 'image'], output: ['text'] },
      } },
    });
    const config = editAndSave(providerToEditFormState(live, stored));
    expect(config?.models.vision?.limit).toEqual({ context: 200000, output: 8192 });
    expect(config?.models.vision?.capabilities).toEqual({ tools: true, input: ['text', 'image'], output: ['text'] });
  });

  test('a saved model type loads and saves as it is, image or any other', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: {
        flare: { name: 'Flare', type: 'image' },
        judge: { name: 'Judge', type: 'decision' },
        fast: { name: 'Fast' },
      },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.models.map((model) => [model.id, model.type])).toEqual([['flare', 'image'], ['judge', 'decision'], ['fast', undefined]]);
    const models = editAndSave(form)?.models;
    expect(models?.flare.type).toBe('image');
    expect(models?.judge.type).toBe('decision');
    expect(models?.fast?.type).toBeUndefined();
  });

  test('a stored model without levels saves without the generated ones', () => {
    const stored = storedProviderEntrySchema.parse({
      name: 'Campus LLM',
      settings: { baseURL: 'https://llm.example.edu/v1' },
      models: { fast: { name: 'Fast' } },
    });
    const form = providerToEditFormState(live, stored);

    expect(form.protocol).toBe('openai-chat');
    expect(form.models[0].variants).toBe('');
    // An empty list: the server drops the key, so no levels are written.
    expect(editAndSave(form)?.models.fast.variants).toEqual([]);
  });

  test('falls back to live fields the entry leaves out, never to live levels', () => {
    const form = providerToEditFormState(live, storedProviderEntrySchema.parse({ env: ['CAMPUS_KEY'] }));

    expect(form.name).toBe('Campus LLM (live)');
    expect(form.baseURL).toBe('https://live.example.com/v1');
    expect(form.models.map((model) => [model.id, model.variants, model.savedVariants])).toEqual([['fast', '', undefined]]);
    expect(editAndSave(form)?.models.fast).toEqual({ modelID: 'fast', name: 'Fast' });
  });

  test('without a stored entry the live levels stay out of the save', () => {
    const form = providerToEditFormState(live, null);
    expect(editAndSave(form)?.package).toBe('aisdk:@ai-sdk/openai-compatible');
    expect(editAndSave(form)?.models.fast).toEqual({ modelID: 'fast', name: 'Fast' });
>>>>>>> upstream/main
  });
  // OMP publishes audio only for a tts/stt runner, so the modality identifies
  // the kind and the row keeps offering the audio chip.
  expect(speech.nativeKind).toBe('tts');
  expect(speech.modalities).toEqual(['text', 'audio']);
});

test('validation rejects a taken provider id only when creating', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '1024';
  form.models[0]!.maxOutputTokens = '512';

  expect(validateCustomProviderForm(form, new Set(['campus']), false, translate).fields.providerId)
    .toBe('settings.providers.page.custom.error.providerID.exists');
  expect(validateCustomProviderForm(form, new Set(['campus']), true, translate).fields.providerId)
    .toBeUndefined();
});

// ── Model-info auto-fill and the discovery dialog ──────────────────────────

const catalog = (overrides: Partial<ModelCatalogInfo> = {}): ModelCatalogInfo => ({
  source: 'omp-catalog',
  input: ['text'],
  contextWindow: 200000,
  maxTokens: 32000,
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
  reasoning: true,
  toolsSupported: true,
  family: 'claude',
  ...overrides,
});

test('auto-fill writes only empty fields and never a value the user typed', () => {
  const row = createModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6' });
  row.contextWindow = '4096';
  const typed = markModelFieldTyped(row, 'contextWindow');

  const fields = autoFillFields(typed, catalog({ input: ['text', 'image'] }));
  expect(fields).not.toContain('contextWindow');
  expect(fields).toEqual(expect.arrayContaining(['maxOutputTokens', 'modalities', 'toolsSupported', 'reasoning', 'pricing']));

  const { models } = applyModelCatalogInfo([typed], new Map([['claude-opus-4-6', catalog()]]));
  expect(models[0]!.contextWindow).toBe('4096');
  expect(models[0]!.maxOutputTokens).toBe('32000');
  expect(models[0]!.filledFrom.contextWindow).toBeUndefined();
  expect(models[0]!.filledFrom.maxOutputTokens).toBe('omp-catalog');
  expect(models[0]!.family).toBe('claude');
});

test('a filled value may be refilled, and the label follows the later source', () => {
  const row = createModelRow({ modelId: 'mystery-model', name: 'Mystery' });
  const first = applyModelCatalogInfo([row], new Map([['mystery-model', catalog({ source: 'omp-catalog' })]]));
  const second = applyModelCatalogInfo(first.models, new Map([['mystery-model', catalog({ source: 'openrouter', maxTokens: 64000 })]]));
  expect(second.models[0]!.maxOutputTokens).toBe('64000');
  expect(second.models[0]!.filledFrom.maxOutputTokens).toBe('openrouter');
});

test('stale ids are the form rows the fresh discovery list no longer carries', () => {
  const kept = createModelRow({ modelId: 'kept', name: 'Kept' });
  const gone = createModelRow({ modelId: 'gone', name: 'Gone' });
  const blank = createModelRow();
  expect(staleModelIds([kept, gone, blank], [{ modelId: 'kept' }])).toEqual(['gone']);
});

test('add-all offers exactly the discovered ids the form does not hold', () => {
  const existing = createModelRow({ modelId: 'b', name: 'B' });
  expect(idsToAdd([existing], [
    { modelId: 'a' },
    { modelId: 'b' },
    { modelId: 'a' },
  ])).toEqual(['a']);
});

test('a discovered row is prefilled from its catalog without marking the values as typed', () => {
  const row = createDiscoveredModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6', catalog: catalog() });
  expect(row.contextWindow).toBe('200000');
  expect(row.filledFrom.contextWindow).toBe('omp-catalog');
  // A later catalog read may still correct these values.
  expect(autoFillFields(row, catalog({ maxTokens: 64000 }))).toContain('maxOutputTokens');
});

test('filter chips count every kind, and a chip whose count is zero still exists', () => {
  const rows = discoveryRows(
    [
      { modelId: 'text-model', name: 'Text', catalog: catalog({ input: ['text'] }) },
      { modelId: 'vision-model', name: 'Vision', catalog: catalog({ input: ['text', 'image'] }) },
    ],
    [createModelRow({ modelId: 'stale-model', name: 'Stale' })],
  );
  const counts = discoveryFilterCounts(rows);
  expect(counts).toMatchObject({ all: 3, stale: 1, text: 3, image: 1, embedding: 0, audio: 0 });
  expect(discoveryFilterValues).toEqual(['all', 'stale', 'text', 'image', 'embedding', 'audio']);
  expect(matchesDiscoveryFilter(rows[0]!, 'image')).toBe(false);
  expect(matchesDiscoveryFilter(rows[1]!, 'image')).toBe(true);
  expect(matchesDiscoveryFilter(rows[2]!, 'stale')).toBe(true);
});

test('family grouping only happens when every visible row names a family', () => {
  const familyRows = discoveryRows([
    { modelId: 'a', name: 'A', catalog: catalog({ family: 'claude', input: ['text'] }) },
    { modelId: 'b', name: 'B', catalog: catalog({ family: 'claude', input: ['text'] }) },
  ], []);
  expect(groupDiscoveryRows(familyRows).grouped).toBe(true);

  const mixed = discoveryRows([
    { modelId: 'a', name: 'A', catalog: catalog({ family: 'claude', input: ['text'] }) },
    { modelId: 'b', name: 'B', catalog: catalog({ input: ['text'], family: undefined }) },
  ], []);
  expect(groupDiscoveryRows(mixed).grouped).toBe(false);
});

test('the OpenRouter step asks only for ids the OMP catalog did not answer', () => {
  const known = createModelRow({ modelId: 'known', name: 'Known' });
  const unknown = createModelRow({ modelId: 'unknown', name: 'Unknown' });
  const answers = new Map([['known', catalog()]]);
  expect(idsMissingCatalog([known, unknown], answers)).toEqual(['unknown']);
});

test('an enterprise refusal is reported even when no catalog answered any id', () => {
  expect(autoFillNoticeFor({ lookup: 'enterprise', answered: 0, filled: 0, unresolved: ['a', 'b'] })).toBe('enterprise');
  expect(autoFillNoticeFor({ lookup: 'failed', answered: 0, filled: 0, unresolved: [] })).toBe('failed');
});

test('the notice tells no-data, nothing-to-fill and partial apart', () => {
  expect(autoFillNoticeFor({ lookup: null, answered: 0, filled: 0, unresolved: ['a'] })).toBe('none');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 0, unresolved: [] })).toBe('nothing');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 1, unresolved: ['b'] })).toBe('partial');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 1, unresolved: [] })).toBeNull();
});

test('catalog inputs are written text first regardless of the source order', () => {
  expect(catalogInputs(['image', 'text'])).toEqual(['text', 'image']);
  const row = createModelRow({ modelId: 'vision-model', name: 'Vision' });
  const { models } = applyModelCatalogInfo([row], new Map([['vision-model', catalog({ input: ['image', 'text'] })]]));
  expect(models[0]!.modalities).toEqual(['text', 'image']);
});

test('a family-only answer fills nothing', () => {
  const row = createModelRow({ modelId: 'plain', name: 'Plain', contextWindow: 1, maxOutputTokens: 1, });
  const typedAll = ['contextWindow', 'maxOutputTokens', 'modalities', 'toolsSupported', 'reasoning', 'pricing'] as const;
  let current = row;
  for (const field of typedAll) current = markModelFieldTyped(current, field);
  const { filled, models } = applyModelCatalogInfo([current], new Map([['plain', catalog({ family: 'claude' })]]));
  expect(filled).toBe(0);
  expect(models[0]!.family).toBeUndefined();
});

test('a discovered row with no catalog and no form row still counts as text', () => {
  const rows = discoveryRows([{ modelId: 'bare', name: 'Bare' }], []);
  expect(matchesDiscoveryFilter(rows[0]!, 'text')).toBe(true);
  expect(discoveryFilterCounts(rows).text).toBe(1);
});

test('auto-fill ids are distinct model ids in form order', () => {
  const models = [createModelRow({ modelId: ' a ', name: 'A' }), createModelRow({ modelId: 'b', name: 'B' }), createModelRow({ modelId: 'a', name: 'A again' })];
  expect(autoFillIds(models)).toEqual(['a', 'b']);
});

test('validation names the output limit and header problems specifically', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '4096';
  form.models[0]!.maxOutputTokens = '8192';
  expect(validateCustomProviderForm(form, new Set(), false, translate).models[0]!.maxOutputTokens)
    .toBe('settings.providers.page.custom.error.maxOutputExceedsContext');

  form.models[0]!.maxOutputTokens = '512';
  form.headers[0]!.name = 'bad header';
  form.headers[0]!.value = 'x';
  expect(validateCustomProviderForm(form, new Set(), false, translate).headers[0]!.name)
    .toBe('settings.providers.page.custom.error.headerName.format');
});

test('discovered ids compare trimmed against form rows', () => {
  const row = createModelRow({ modelId: 'kept', name: 'Kept' });
  expect(staleModelIds([row], [{ modelId: ' kept ' }])).toEqual([]);
  expect(idsToAdd([row], [{ modelId: ' kept ' }, { modelId: ' new ' }])).toEqual(['new']);
  expect(discoveryRows([{ modelId: ' kept ', name: 'Kept' }], [row])[0]!.formRow).toBe(row);
});

test('a real-path fill reports exactly the ids no source answered', () => {
  // Six models in the form: the OMP catalog knows three, OpenRouter one more,
  // and two stay unknown — those two are what the notice must list.
  const ids = ['known-a', 'known-b', 'known-c', 'openrouter-d', 'unknown-e', 'unknown-f'];
  const answers = new Map<string, ModelCatalogInfo>([
    ['known-a', catalog()],
    ['known-b', catalog()],
    ['known-c', catalog()],
    ['openrouter-d', catalog({ source: 'openrouter' })],
  ]);
  // The first 200 of the catalog's misses go to the Host route, so with a
  // short list every id reaches the unresolved set.
  const candidates = unresolvedAutoFillIds(ids, answers);
  expect(candidates).toEqual(['unknown-e', 'unknown-f']);
  expect(autoFillNoticeFor({ lookup: null, answered: answers.size, filled: 3, unresolved: candidates })).toBe('partial');

  // A deduped list: the same id twice in the form is reported once.
  expect(unresolvedAutoFillIds(['ghost', 'ghost', 'known-a'], answers)).toEqual(['ghost']);
});

test('ids a source cap kept out of the request are reported as unresolved', () => {
  const answers = new Map([['asked', catalog()]]);
  const overCap = ['beyond-cap-1', 'beyond-cap-2'];
  const unresolved = unresolvedAutoFillIds(['asked', ...overCap], answers);
  expect(unresolved).toEqual(['beyond-cap-1', 'beyond-cap-2']);
  expect(autoFillNoticeFor({ lookup: null, answered: 1, filled: 1, unresolved })).toBe('partial');
});

test('typing into a filled field retires its source label', () => {
  const row = createModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6' });
  const filled = applyModelCatalogInfo([row], new Map([['claude-opus-4-6', catalog()]])).models[0]!;
  expect(filled.filledFrom.contextWindow).toBe('omp-catalog');

  const typed = markModelFieldTyped(filled, 'contextWindow');
  expect(typed.typed.has('contextWindow')).toBe(true);
  expect(typed.filledFrom.contextWindow).toBeUndefined();
  // The other fields keep their provenance.
  expect(typed.filledFrom.maxOutputTokens).toBe('omp-catalog');
  // Clearing the limit keeps it typed, so auto-fill leaves it empty.
  expect(autoFillFields({ ...typed, contextWindow: '' }, catalog())).not.toContain('contextWindow');
});

test('add-all takes a padded discovered id and adds it trimmed', () => {
  const discovered = [
    { modelId: ' model-a ', name: 'A' },
    { modelId: 'model-b', name: 'B' },
  ];
  const addable = idsToAdd([], discovered);
  expect(addable).toEqual(['model-a', 'model-b']);

  // What the form's add path does with those ids.
  const wanted = new Set(addable);
  const added = discovered
    .map((model) => ({ ...model, modelId: model.modelId.trim() }))
    .filter((model) => wanted.has(model.modelId));
  expect(added.map((model) => model.modelId)).toEqual(['model-a', 'model-b']);
  expect(added.map((model) => createDiscoveredModelRow(model).modelId)).toEqual(['model-a', 'model-b']);
});

test('unknown ids outrank "nothing to fill" on a repeat or prefilled fill', () => {
  // A discovery already prefilled the catalogued rows, so this fill writes
  // nothing — while two models still have no limits from any source.
  expect(autoFillNoticeFor({ lookup: null, answered: 4, filled: 0, unresolved: ['x'] })).toBe('partial');
  // Nothing was written and nothing is unknown: that is the "nothing" case.
  expect(autoFillNoticeFor({ lookup: null, answered: 4, filled: 0, unresolved: [] })).toBe('nothing');
  // No source answered at all still says so, with or without ids left.
  expect(autoFillNoticeFor({ lookup: null, answered: 0, filled: 0, unresolved: ['x'] })).toBe('none');
});

test('the partial notice names at most ten unknown ids and counts the rest', () => {
  const ids = Array.from({ length: 13 }, (_, index) => `unknown-${index + 1}`);
  const capped = autoFillNoticeIds(ids);
  expect(capped.shown).toHaveLength(10);
  expect(capped.shown[9]).toBe('unknown-10');
  expect(capped.hidden).toBe(3);

  expect(autoFillNoticeIds(['a', 'b'])).toEqual({ shown: ['a', 'b'], hidden: 0 });
  expect(autoFillNoticeIds([])).toEqual({ shown: [], hidden: 0 });
});

test('the capped id list hands its remainder to a translated sentence', () => {
  const more = (models: string, count: number) => `${models} and ${count} more`;
  expect(formatAutoFillNoticeModels(['a', 'b'], more)).toBe('a, b');
  expect(formatAutoFillNoticeModels([], more)).toBe('');
  const ids = Array.from({ length: 13 }, (_, index) => `m${index + 1}`);
  expect(formatAutoFillNoticeModels(ids, more)).toBe(`${ids.slice(0, 10).join(', ')} and 3 more`);
});
