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

test('only the older Host unknown-route response disables the selection capability', async () => {
  for (const [status, code] of [[404, 'NOT_IMPLEMENTED'], [404, 'UNAUTHORIZED'], [503, 'SERVICE_UNAVAILABLE'], [403, 'UNAUTHORIZED']] as const) {
    const fetch = spyOn(transport, 'runtimeFetch').mockResolvedValue(Response.json({
      type: `urn:ohpichamber:problem:${code}`, title: 'Request refused', status, code,
      detail: code === 'NOT_IMPLEMENTED' ? 'No canonical operation matches this route.' : 'Request refused.', retryable: status >= 500,
    }, { status }));
    try {
      if (code === 'NOT_IMPLEMENTED') expect(await client.providerAccountSelection('workspace', 'stored-provider')).toBeNull();
      else await expect(client.providerAccountSelection('workspace', 'stored-provider')).rejects.toMatchObject({ problem: { status, code } });
    } finally { fetch.mockRestore(); }
  }
});

test('selection state preserves its identity and rejects malformed successful responses', async () => {
  const state = { revision: '7', providerId: 'stored-provider', selectionMode: 'pinned', pinnedCredentialRef: 'opaque', selectionOverriddenBy: null };
  respond(state);
  expect(await client.providerAccountSelection('workspace', 'stored-provider')).toEqual(state);
  restoreFetch?.();
  respond({ ...state, providerId: 'other' });
  await expect(client.providerAccountSelection('workspace', 'stored-provider')).rejects.toThrow();
});


test('discovery rejects credential-bearing endpoints before transport', () => {
  const calls = respond({ models: [] });
  expect(() => client.discoverProviderModels('workspace', {
    endpoint: 'https://user:secret@provider.invalid/v1', protocol: 'responses',
  })).toThrow();
  expect(calls).toHaveLength(0);
});
