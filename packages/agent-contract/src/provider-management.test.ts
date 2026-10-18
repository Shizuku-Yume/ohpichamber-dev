import { expect, test } from 'bun:test';
import {
  ProviderAccountSchema, ProviderAccountsSchema, ProviderAccountMutationRequestSchema,
  ProviderOAuthMethodsSchema, ProviderOAuthRequestSchema, ProviderOAuthResultSchema,
  ProviderModelDiscoveryRequestSchema, ProviderModelDiscoveryResultSchema,
  ProviderHeaderWriteSchema, ProviderConfigurationReadSchema,
} from './provider-management.ts';

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
  for (const endpoint of ['file:///private/models', 'javascript:alert(1)', 'ftp://127.0.0.1/models', 'https://user:secret@example.test/v1', 'https://example.test/v1?api_key=secret', 'https://example.test/v1#secret']) {
    expect(ProviderModelDiscoveryRequestSchema.safeParse({ ...discovery, endpoint }).success).toBe(false);
  }
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
  const read = { revision: '7', configuration, headerNames: ['Authorization', 'X-Local'], models: [] };
  expect(ProviderConfigurationReadSchema.parse(read)).toEqual(read);
  for (const extra of [{ headers: { Authorization: 'Bearer secret' } }, { apiKey: 'secret' }, { credential: { key: 'secret' } }]) {
    expect(ProviderConfigurationReadSchema.safeParse({ ...read, ...extra }).success).toBe(false);
    expect(ProviderConfigurationReadSchema.safeParse({ ...read, configuration: { ...configuration, ...extra } }).success).toBe(false);
  }
});
