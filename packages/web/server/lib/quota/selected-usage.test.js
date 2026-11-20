import { describe, expect, it } from 'vitest';
import { createCatalogCredentialSelections } from '../host/private-credential.js';
import { createUsageReadAction } from '../openchamber-control/usage-read.js';
import { createSelectedUsageQuota } from './selected-usage.js';

const scope = { workspaceId: 'workspace-1', projectId: 'project-1', agentDirectoryId: 'agent-1', cwd: '/repo', agentDirectory: '/repo/.omp' };
const provider = { providerId: 'anthropic', name: 'Anthropic', protocol: 'messages', endpoint: 'https://provider.example', authMethods: ['oauth'], auth: { status: 'configured', method: 'oauth', source: 'stored-credential', credentialRef: 'selected-1' } };

const fixture = ({ providers = [provider], fail = false } = {}) => {
  const selections = [];
  const paths = [];
  const quota = {
    listUsagePageProviders: () => [{ providerId: 'claude', providerName: 'Claude' }],
    buildUnconfiguredQuotaResult: (providerId) => ({ providerId, providerName: 'Claude', ok: false, configured: false, usage: null, fetchedAt: 1 }),
    listConfiguredQuotaProviders: async ({ selections = [] } = {}) => selections.map((selection) => selection.quotaProviderId),
    fetchQuotaForProvider: async (id, options) => {
      selections.push({ id, ...options });
      await options.resolveCredential({ workspaceId: options.workspaceId, agentDirectoryId: options.agentDirectoryId, providerId: options.providerId, credentialRef: options.credentialRef, purpose: 'quota' });
      return { providerId: id, providerName: 'Claude', ok: true, configured: true, usage: null, fetchedAt: 1, accountLabel: 'private-account' };
    },
  };
  const owners = createCatalogCredentialSelections({
    service: { getState: () => ({ phase: 'ready' }), request: async (pathname) => {
      paths.push(pathname);
      return fail ? Response.json({}, { status: 503 }) : Response.json({ workspaceId: scope.workspaceId, revision: '1', providers });
    } },
    resolveWorkspaceScope: async (id) => id === scope.workspaceId ? scope : null,
    getQuotaProviders: async () => quota,
  });
  const resolved = [];
  const load = createSelectedUsageQuota({ ...owners, loadQuota: async () => quota, resolveCredential: async (selection) => { resolved.push(selection); return { type: 'oauth', access: 'fixture' }; } });
  const read = createUsageReadAction({ readSettings: async () => ({ agentUsageToolEnabled: true }), loadQuota: () => load(scope) });
  return { read, load, selections, paths, resolved };
};

describe('selected native usage quota', () => {
  it('maps the scoped native catalog and resolves only its selected credential for quota', async () => {
    const { read, selections, paths, resolved } = fixture();
    const result = await read({});
    expect(result.providers).toHaveLength(1);
    expect(result.providers[0]).toMatchObject({ providerId: 'claude', ok: true });
    expect(result.providers[0]).not.toHaveProperty('accountLabel');
    expect(selections[0]).toMatchObject({ id: 'claude', workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId, providerId: 'anthropic', credentialRef: 'selected-1' });
    expect(resolved).toEqual([{ workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId, providerId: 'anthropic', credentialRef: 'selected-1', purpose: 'quota' }]);
    expect(paths.every((pathname) => pathname === '/api/agent/v1/workspaces/workspace-1/providers')).toBe(true);
  });

  it('keeps an authoritative empty catalog empty without resolving credentials', async () => {
    const { read, resolved } = fixture({ providers: [] });
    expect(await read({})).toEqual({ providers: [], notConfigured: ['claude'] });
    expect(resolved).toEqual([]);
  });

  it('reports a failed catalog, missing selection and mismatched directory without using fallback credentials', async () => {
    const failed = fixture({ fail: true });
    expect(await failed.read({})).toMatchObject({ listError: expect.any(String), providers: [{ providerId: 'claude', ok: false }] });
    expect(failed.resolved).toEqual([]);
    const missing = fixture({ providers: [] });
    expect(await missing.read({ providerId: 'claude' })).toMatchObject({ providers: [{ ok: false, configured: false }] });
    expect(missing.resolved).toEqual([]);
    const other = fixture();
    const quota = await other.load({ ...scope, agentDirectoryId: 'sibling' });
    await expect(quota.listConfiguredQuotaProviders()).rejects.toMatchObject({ status: 403 });
    expect(other.resolved).toEqual([]);
  });
});
