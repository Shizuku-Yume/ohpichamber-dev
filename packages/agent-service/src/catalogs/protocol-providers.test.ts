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

test('provider discovery rejects malformed endpoint credentials and header injection', () => {
  const request = { endpoint: 'https://provider.invalid/v1', protocol: 'responses' };
  expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request }).success).toBe(true);
  for (const endpoint of ['https://user:secret@provider.invalid/v1', 'https://provider.invalid/v1?token=secret', 'file:///private/models']) {
    expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request: { ...request, endpoint } }).success).toBe(false);
  }
  expect(CatalogOperationSchema.safeParse({ type: 'catalog.provider.models.discover', request: { ...request, headers: { Authorization: 'Bearer secret\r\nX-Injected: value' } } }).success).toBe(false);
});
