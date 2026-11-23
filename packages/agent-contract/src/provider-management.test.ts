import { expect, test } from 'bun:test';
import {
  OMP_MODEL_APIS, OMP_PROVIDER_APIS,
  OmpModelDefinitionReadSchema, OmpModelDefinitionWriteSchema,
  OmpModelOverrideReadSchema, OmpProviderConfigReadSchema, OmpProviderConfigWriteSchema,
  ProviderAccountSchema, ProviderAccountsSchema, ProviderAccountMutationRequestSchema,
  ProviderOAuthMethodsSchema, ProviderOAuthRequestSchema, ProviderOAuthResultSchema,
  ProviderModelDiscoveryRequestSchema, ProviderModelDiscoveryResultSchema,
  ModelCatalogInfoSchema, ProviderModelEnrichRequestSchema, ProviderModelEnrichResultSchema,
  ProviderHeaderWriteSchema, ProviderConfigurationReadSchema,
} from './provider-management.ts';
import { ProviderConfigureRequestSchema } from './catalogs.ts';

const account = { credentialRef: 'credential_opaque', method: 'oauth', label: 'Work', email: 'local@example.test', accountId: 'account_local', active: true, disabled: false };
const flow = { flowId: 'flow_local', generation: 'generation_local', providerId: 'models_local', revision: '7', status: 'pending', manualInput: true, authorizationUrl: 'http://127.0.0.1:18080/authorize?state=opaque', prompt: 'Paste callback' };
const discovery = { providerId: 'models_local', endpoint: 'http://127.0.0.1:18080/v1', protocol: 'chat-completions' };

test('account contracts expose opaque references and reject native row IDs and returned credential secrets', () => {
  expect(ProviderAccountsSchema.parse({ revision: '7', providerId: 'models_local', accounts: [account] }).accounts).toEqual([account]);
  for (const credentialRef of [12, null, '']) {
    expect(ProviderAccountSchema.safeParse({ ...account, credentialRef }).success).toBe(false);
    for (const action of ['select', 'remove', 'label']) {
      expect(ProviderAccountMutationRequestSchema.safeParse({ action, expectedRevision: '7', credentialRef, ...(action === 'label' ? { label: 'Work' } : {}) }).success).toBe(false);
    }
    expect(ProviderModelDiscoveryRequestSchema.safeParse({ ...discovery, credentialRef }).success).toBe(false);
  }
  for (const extra of [{ id: 12 }, { credentialId: 12 }, { apiKey: 'secret' }, { accessToken: 'secret' }, { refreshToken: 'secret' }, { credential: { access: 'secret' } }]) {
    expect(ProviderAccountSchema.safeParse({ ...account, ...extra }).success).toBe(false);
    expect(ProviderAccountsSchema.safeParse({ revision: '7', providerId: 'models_local', accounts: [account], ...extra }).success).toBe(false);
  }
  expect(ProviderAccountMutationRequestSchema.parse({ action: 'label', expectedRevision: '7', credentialRef: account.credentialRef, label: '  Work  ' })).toMatchObject({ label: 'Work' });
  expect(ProviderAccountMutationRequestSchema.safeParse({ action: 'select', expectedRevision: 7, credentialRef: account.credentialRef }).success).toBe(false);
});

test('OAuth contracts preserve method versus storage identity and keep grants out of every result', () => {
  const methods = { methods: [{ methodId: 'device_local', providerId: 'models_local', name: 'Local device login', storeCredentialsAs: 'models_local' }] };
  expect(ProviderOAuthMethodsSchema.parse(methods)).toEqual(methods);
  expect(ProviderOAuthResultSchema.parse(flow)).toEqual(flow);
  for (const status of ['pending', 'ready', 'authenticated', 'cancelled', 'failed']) {
    for (const extra of [{ access: 'secret' }, { refresh: 'secret' }, { tokens: { access: 'secret' } }, { apiKey: 'secret' }, { accessToken: 'secret' }, { refreshToken: 'secret' }, { credentialId: 12 }, { headers: { Authorization: 'Bearer secret' } }]) {
      expect(ProviderOAuthResultSchema.safeParse({ ...flow, status, ...extra }).success).toBe(false);
    }
  }
  for (const action of ['start', 'status', 'input', 'cancel', 'commit']) {
    const request = action === 'start' ? { action, expectedRevision: '7' }
      : action === 'commit' ? { action, flowId: flow.flowId, generation: flow.generation, expectedRevision: '7' }
        : action === 'input' ? { action, flowId: flow.flowId, generation: flow.generation, input: 'local-code' }
          : { action, flowId: flow.flowId, generation: flow.generation };
    expect(ProviderOAuthRequestSchema.safeParse(request).success).toBe(true);
    expect(ProviderOAuthRequestSchema.safeParse({ ...request, accessToken: 'unexpected-secret' }).success).toBe(false);
  }
  expect(ProviderOAuthRequestSchema.safeParse({ action: 'commit', flowId: flow.flowId, expectedRevision: '7' }).success).toBe(false);
  for (const authorizationUrl of ['javascript:alert(1)', 'file:///private/token', 'https://user:secret@example.test/auth']) {
    expect(ProviderOAuthResultSchema.safeParse({ ...flow, authorizationUrl }).success).toBe(false);
  }
});

test('discovery permits intentional write-only credentials but rejects unsafe endpoints and header injection', () => {
  expect(ProviderModelDiscoveryRequestSchema.parse({ ...discovery, headers: { Authorization: 'Bearer write-only-secret', 'X-Local': 'value' }, apiKey: 'write-only-key' })).toMatchObject(discovery);
  for (const endpoint of ['file:///private/models', 'javascript:alert(1)', 'ftp://127.0.0.1/models', 'https://user:secret@example.test/v1', 'https://example.test/v1#secret']) {
    expect(ProviderModelDiscoveryRequestSchema.safeParse({ ...discovery, endpoint }).success).toBe(false);
  }
  expect(ProviderModelDiscoveryRequestSchema.parse({ ...discovery, endpoint: 'https://x.openai.azure.com/openai/v1?api-version=2024-10-21' }).endpoint)
    .toBe('https://x.openai.azure.com/openai/v1?api-version=2024-10-21');
  for (const headers of [{ 'Bad Header': 'value' }, { 'X-Test\r\nAuthorization': 'secret' }, { 'X-Test': 'value\r\nAuthorization: secret' }, { 'X-Test': 'value\nsecret' }]) {
    expect(ProviderHeaderWriteSchema.safeParse(headers).success).toBe(false);
    expect(ProviderModelDiscoveryRequestSchema.safeParse({ ...discovery, headers }).success).toBe(false);
  }
  const models = { models: [{ modelId: 'local-model', name: 'Local model', contextWindow: 8192, maxOutputTokens: 1024 }] };
  expect(ProviderModelDiscoveryResultSchema.parse(models)).toEqual(models);
  for (const extra of [{ apiKey: 'secret' }, { headers: { Authorization: 'secret' } }, { endpoint: 'https://user:secret@example.test' }]) {
    expect(ProviderModelDiscoveryResultSchema.safeParse({ ...models, ...extra }).success).toBe(false);
    expect(ProviderModelDiscoveryResultSchema.safeParse({ models: [{ ...models.models[0], ...extra }] }).success).toBe(false);
  }
});

test('configuration reads expose header names only and reject returned secret values', () => {
  const configuration = { providerId: 'models_local', name: 'Local models', endpoint: discovery.endpoint, protocol: discovery.protocol, credentialRef: account.credentialRef };
  // `imageModels` is defaulted, so a read without it parses to an empty list.
  const read = { revision: '7', configuration, headerNames: ['Authorization', 'X-Local'], models: [], imageModels: [] };
  expect(ProviderConfigurationReadSchema.parse(read)).toEqual(read);
  for (const extra of [{ headers: { Authorization: 'Bearer secret' } }, { apiKey: 'secret' }, { credential: { key: 'secret' } }]) {
    expect(ProviderConfigurationReadSchema.safeParse({ ...read, ...extra }).success).toBe(false);
    expect(ProviderConfigurationReadSchema.safeParse({ ...read, configuration: { ...configuration, ...extra } }).success).toBe(false);
  }
});

const catalog = {
  source: 'omp-catalog' as const, input: ['text' as const, 'image' as const],
  contextWindow: 200000, maxTokens: 64000,
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  reasoning: true, toolsSupported: true, family: 'opus', status: 'beta' as const,
};

test('catalog info is strict about its shape and its capability vocabulary', () => {
  expect(ModelCatalogInfoSchema.parse(catalog)).toEqual(catalog);
  expect(ModelCatalogInfoSchema.parse({ source: 'openrouter', input: ['text'], contextWindow: 8192, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, reasoning: false }))
    .toMatchObject({ source: 'openrouter', input: ['text'] });
  for (const extra of [{ pricing: {} }, { context: 1 }, { provider: 'openai' }, { apiKey: 'secret' }]) {
    expect(ModelCatalogInfoSchema.safeParse({ ...catalog, ...extra }).success).toBe(false);
  }
  for (const invalid of [
    { ...catalog, source: 'models.dev' },
    { ...catalog, input: [] },
    { ...catalog, input: ['audio'] },
    { ...catalog, contextWindow: 0 },
    { ...catalog, maxTokens: -1 },
    { ...catalog, cost: { ...catalog.cost, input: -1 } },
    { ...catalog, cost: { input: 1 } },
    { ...catalog, reasoning: 'yes' },
    { ...catalog, family: '' },
    { ...catalog, status: 'preview' },
  ]) expect(ModelCatalogInfoSchema.safeParse(invalid).success).toBe(false);
});

test('discovery results carry an optional catalog block without widening their credential surface', () => {
  const known = { modelId: 'claude-opus-4-6', name: 'Claude Opus', contextWindow: 200000, maxOutputTokens: 64000, catalog };
  const unknown = { modelId: 'local-model', name: 'Local model' };
  const models = { models: [known, unknown] };
  expect(ProviderModelDiscoveryResultSchema.parse(models)).toEqual(models);
  expect(ProviderModelDiscoveryResultSchema.parse({ models: [{ ...unknown, catalog }] })).toMatchObject({ models: [{ catalog }] });
  expect(ProviderModelDiscoveryResultSchema.safeParse({ models: [{ ...known, catalog: { ...catalog, headers: { Authorization: 'secret' } } }] }).success).toBe(false);
});

test('enrichment requests bound their model list and reject connection details', () => {
  const request = { providerId: 'models_local', models: [{ modelId: 'claude-opus-4-6' }, { modelId: '[Kiro] claude-opus-4-6' }] };
  expect(ProviderModelEnrichRequestSchema.parse(request)).toEqual(request);
  expect(ProviderModelEnrichRequestSchema.parse({ models: [{ modelId: 'gpt-5.6' }] })).toEqual({ models: [{ modelId: 'gpt-5.6' }] });
  expect(ProviderModelEnrichRequestSchema.safeParse({ models: [] }).success).toBe(false);
  expect(ProviderModelEnrichRequestSchema.safeParse({ models: Array.from({ length: 501 }, (_, index) => ({ modelId: `model-${index}` })) }).success).toBe(false);
  for (const extra of [{ endpoint: 'http://127.0.0.1/v1' }, { apiKey: 'secret' }, { headers: { Authorization: 'secret' } }, { credentialRef: 'credential_opaque' }]) {
    expect(ProviderModelEnrichRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
  }
  expect(ProviderModelEnrichRequestSchema.safeParse({ ...request, models: [{ modelId: 'ok', name: 'Extra' }] }).success).toBe(false);
});

test('enrichment results keep unknown ids as bare entries', () => {
  const result = { models: [{ modelId: 'claude-opus-4-6', catalog }, { modelId: 'unknown-model' }] };
  expect(ProviderModelEnrichResultSchema.parse(result)).toEqual(result);
  expect(ProviderModelEnrichResultSchema.safeParse({ models: [{ modelId: 'ok', name: 'Extra' }] }).success).toBe(false);
  expect(ProviderModelEnrichResultSchema.safeParse({ models: [{ modelId: 'ok', catalog: { ...catalog, source: 'openrouter', input: ['audio'] } }] }).success).toBe(false);
});
test('OMP provider and model config contracts enforce all 19.0.0 APIs, refinements, and secret redaction', () => {
  expect(OMP_PROVIDER_APIS).toHaveLength(16);
  expect(OMP_MODEL_APIS).toHaveLength(24);

  const readNative = {
    providerId: 'CLIProxyAPI',
    isBuiltIn: false,
    hasNativeEntry: true,
    baseUrl: 'https://proxy.example/v1',
    configApiKey: { configured: true as const, source: 'command' as const },
    headerNames: ['X-Gateway-Secret'],
    models: [
      {
        id: 'gpt-5.4',
        api: 'openai-codex-responses' as const,
        kind: 'chat' as const,
        baseUrl: 'https://proxy.example/codex/v1',
        preferWebsockets: true,
        compat: { supportsStore: true },
        imageCountBudget: 4,
        contextWindow: 200000,
        maxContextWindow: 1000000,
        maxTokens: 32000,
        thinking: {
          mode: 'effort' as const,
          efforts: ['low' as const, 'medium' as const, 'high' as const, 'xhigh' as const],
          defaultLevel: 'high' as const,
          supportsDisplay: true,
        },
        headerNames: ['X-Model-Secret'],
      },
    ],
    modelOverrides: {
      'gpt-5.4': {
        omitMaxOutputTokens: true,
        headerNames: ['X-Override-Secret'],
      },
    },
  };
  expect(OmpProviderConfigReadSchema.parse(readNative)).toMatchObject(readNative);

  // Raw secrets stay banned from read contracts.
  expect(OmpProviderConfigReadSchema.safeParse({ ...readNative, apiKey: 'sk-secret' }).success).toBe(false);
  expect(OmpProviderConfigReadSchema.safeParse({ ...readNative, headers: { Authorization: 'Bearer secret' } }).success).toBe(false);
  expect(OmpModelDefinitionReadSchema.safeParse({ ...readNative.models[0], headers: { Authorization: 'secret' } }).success).toBe(false);
  expect(OmpModelOverrideReadSchema.safeParse({ ...readNative.modelOverrides['gpt-5.4'], headers: { Authorization: 'secret' } }).success).toBe(false);

  // maxContextWindow >= contextWindow refinement
  expect(OmpModelDefinitionWriteSchema.safeParse({ id: 'm1', contextWindow: 128000, maxContextWindow: 64000 }).success).toBe(false);
  expect(OmpModelDefinitionWriteSchema.safeParse({ id: 'm1', contextWindow: 128000, maxContextWindow: 256000 }).success).toBe(true);

  // Discovery refinements
  expect(OmpProviderConfigWriteSchema.safeParse({
    providerId: 'p1',
    discovery: { type: 'ollama', injectV1: true },
  }).success).toBe(false);
  expect(OmpProviderConfigWriteSchema.safeParse({
    providerId: 'p1',
    discovery: { type: 'ollama', advertisedReasoning: true },
  }).success).toBe(false);
  expect(OmpProviderConfigWriteSchema.safeParse({
    providerId: 'p1',
    discovery: { type: 'openai-models-list', injectV1: true, advertisedReasoning: true },
  }).success).toBe(true);

  // ProviderConfigureRequest accepts native-only and rejects mismatched IDs or empty requests.
  expect(ProviderConfigureRequestSchema.safeParse({
    expectedRevision: '1',
    native: { providerId: 'CLIProxyAPI', baseUrl: 'https://proxy.example/v1' },
  }).success).toBe(true);
  expect(ProviderConfigureRequestSchema.safeParse({ expectedRevision: '1' }).success).toBe(false);
  expect(ProviderConfigureRequestSchema.safeParse({
    expectedRevision: '1',
    configuration: { providerId: 'p1', name: 'P1', endpoint: 'https://p1.example/v1', protocol: 'chat-completions', credentialRef: null },
    native: { providerId: 'p2' },
  }).success).toBe(false);

  // Discovery supports nativeApi without legacy protocol.
  expect(ProviderModelDiscoveryRequestSchema.safeParse({
    endpoint: 'https://proxy.example/v1',
    nativeApi: 'anthropic-messages',
  }).success).toBe(true);
  expect(ProviderModelDiscoveryRequestSchema.safeParse({
    endpoint: 'https://proxy.example/v1',
  }).success).toBe(false);
});
