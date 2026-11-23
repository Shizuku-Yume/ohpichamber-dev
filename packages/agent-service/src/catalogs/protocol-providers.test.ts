import { expect, test } from 'bun:test';
import { CatalogOperationSchema, CatalogResultSchema } from './protocol.ts';

const identity = { flowId: 'flow', generation: 'worker-generation' };
test('private provider protocol preserves separate OAuth start and explicit commit operations', () => {
  const start = { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'start', expectedRevision: '9007199254740993' } };
  const commit = { type: 'catalog.provider.oauth', providerId: 'login-method', request: { action: 'commit', ...identity, expectedRevision: '9007199254740993' } };
  expect(CatalogOperationSchema.parse(start)).toEqual(start);
  expect(CatalogOperationSchema.parse(commit)).toEqual(commit);
  expect(CatalogOperationSchema.safeParse({ ...commit, request: { action: 'commit', expectedRevision: '0', flowId: identity.flowId } }).success).toBe(false);
});

test('public provider flow and account result envelopes reject token and private storage fields', () => {
  const flow = { type: 'catalog.provider.oauth', result: { ...identity, providerId: 'stored-provider', revision: '0', status: 'ready', manualInput: false } };
  expect(CatalogResultSchema.safeParse(flow).success).toBe(true);
  for (const field of ['accessToken', 'refreshToken', 'credentials', 'agentDirectory']) {
    expect(CatalogResultSchema.safeParse({ ...flow, result: { ...flow.result, [field]: 'private-marker' } }).success).toBe(false);
  }
  const account = { credentialRef: 'opaque', method: 'oauth', active: true, disabled: false };
  const accounts = { type: 'catalog.provider.accounts', result: { providerId: 'stored-provider', revision: '0', accounts: [account] } };
  expect(CatalogResultSchema.safeParse(accounts).success).toBe(true);
  expect(CatalogResultSchema.safeParse({ ...accounts, result: { ...accounts.result, accounts: [{ ...account, storageId: 'private-row' }] } }).success).toBe(false);
});

test('selection reads and results have a separate strict envelope', () => {
  expect(CatalogOperationSchema.parse({ type: 'catalog.provider.account-selection.read', providerId: 'stored-provider' }).type)
    .toBe('catalog.provider.account-selection.read');
  expect(CatalogResultSchema.parse({ type: 'catalog.provider.account-selection', result: {
    revision: '0', providerId: 'stored-provider', selectionMode: 'automatic', pinnedCredentialRef: null, selectionOverriddenBy: null,
  } }).type).toBe('catalog.provider.account-selection');
});

test('provider discovery rejects malformed endpoint credentials and header injection', () => {
  const request = { endpoint: 'https://provider.invalid/v1', protocol: 'responses' };
  expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request }).success).toBe(true);
  for (const endpoint of ['https://user:secret@provider.invalid/v1', 'https://provider.invalid/v1#secret', 'file:///private/models']) {
    expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request: { ...request, endpoint } }).success).toBe(false);
  }
  // Azure-style base URLs carry their api-version in a query string.
  expect(CatalogOperationSchema.safeParse({
    type: 'catalog.provider.models.discover',
    request: { ...request, endpoint: 'https://x.openai.azure.com/openai/v1?api-version=2024-10-21' },
  }).success).toBe(true);
  expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request: { ...request, headers: { Authorization: 'Bearer secret\r\nX-Injected: value' } } }).success).toBe(false);
});

test('provider enrichment stays a local catalog request without connection details', () => {
  const request = { providerId: 'stored-provider', models: [{ modelId: 'claude-opus-4-6' }] };
  expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.enrich', request }).success).toBe(true);
  for (const extra of [{ endpoint: 'https://provider.invalid/v1' }, { apiKey: 'secret' }, { headers: { Authorization: 'secret' } }]) {
    expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.enrich', request: { ...request, ...extra } }).success).toBe(false);
  }
  const result = { type: 'catalog.provider.models.enriched', result: { models: [{ modelId: 'claude-opus-4-6', catalog: {
    source: 'omp-catalog', input: ['text'], contextWindow: 200000, maxTokens: 64000,
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, reasoning: true,
  } }, { modelId: 'unknown-model' }] } };
  expect(CatalogResultSchema.parse(result)).toEqual(result);
  expect(CatalogResultSchema.safeParse({ ...result, result: { models: [{ modelId: 'unknown-model', headers: { Authorization: 'secret' } }] } }).success).toBe(false);
});
