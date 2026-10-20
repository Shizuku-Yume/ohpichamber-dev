import { afterEach, expect, spyOn, test } from 'bun:test';
import * as transport from '../lib/runtime-fetch';
import { CanonicalClient } from './canonicalClient';

const client = new CanonicalClient();
let restoreFetch: (() => void) | undefined;
afterEach(() => { restoreFetch?.(); restoreFetch = undefined; });
function respond(payload: unknown) {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  const fetchSpy = spyOn(transport, 'runtimeFetch').mockImplementation(async (path, init = {}) => {
    calls.push({ path: String(path), init });
    return Response.json(payload);
  });
  restoreFetch = () => fetchSpy.mockRestore();
  return calls;
}
const identity = { flowId: 'flow', generation: 'worker-generation' };
const flow = { ...identity, providerId: 'stored-provider', revision: '9007199254740993', status: 'ready', manualInput: false };


for (const field of ['flowId', 'generation'] as const) test(`OAuth status rejects mismatched ${field}`, async () => {
  respond({ ...flow, [field]: 'other' });
  await expect(client.providerOAuth('workspace', 'login-method', { action: 'status', ...identity })).rejects.toThrow();
});

test('OAuth start requires unchanged starting revision', async () => {
  respond({ ...flow, revision: '9007199254740994' });
  await expect(client.providerOAuth('workspace', 'login-method', { action: 'start', expectedRevision: flow.revision })).rejects.toThrow();
});


test('account reads reject foreign provider and secret-bearing payloads', async () => {
  respond({ revision: '0', providerId: 'other', accounts: [] });
  await expect(client.providerAccounts('workspace', 'stored-provider')).rejects.toThrow();
  restoreFetch?.();
  respond({ revision: '0', providerId: 'stored-provider', accounts: [], token: 'private' });
  await expect(client.providerAccounts('workspace', 'stored-provider')).rejects.toThrow();
});


test('discovery rejects credential-bearing endpoints before transport', () => {
  const calls = respond({ models: [] });
  expect(() => client.discoverProviderModels('workspace', {
    endpoint: 'https://user:secret@provider.invalid/v1', protocol: 'responses',
  })).toThrow();
  expect(calls).toHaveLength(0);
});
