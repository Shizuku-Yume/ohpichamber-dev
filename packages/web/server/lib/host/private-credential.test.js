import { describe, expect, it } from 'bun:test';
import { createSelectedCredentialResolver, createSelectedCredentialHandoff } from './private-credential.js';

const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'proxy', credentialRef: 'credential_1', purpose: 'routing' };
const scope = { workspaceId: 'workspace_1', projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: '/private/workspace', agentDirectory: '/private/agent', label: 'Host only' };

describe('selected private credential boundary', () => {
  it('requires the production service and resolver constructor dependencies', () => {
    expect(() => createSelectedCredentialResolver({ service: {}, resolveWorkspaceScope: async () => scope })).toThrow(TypeError);
    expect(() => createSelectedCredentialHandoff({ service: { request() {}, getState() {} } })).toThrow(TypeError);
  });
  it('checks readiness and exact selected owner before sending any private secret request', async () => {
    let requests = 0;
    let phase = 'failed';
    const service = { getState: () => ({ phase }), request: async () => { requests++; throw new Error('Should not read'); } };
    const resolve = createSelectedCredentialResolver({ service, resolveWorkspaceScope: async () => scope });
    await expect(resolve(selection)).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    phase = 'ready';
    await expect(resolve({ ...selection, agentDirectoryId: 'sibling' })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    await expect(resolve({ ...selection, purpose: 'browser' })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(requests).toBe(0);
  });
  it('returns only the exact native selected OAuth record with actual SDK metadata and no invented conversion', async () => {
    const credential = { type: 'oauth', access: 'access-token', refresh: 'refresh-token', expires: 12345,
      accountId: 'account_1', enterpriseUrl: 'https://company.example', projectId: 'project-native', inferenceRegion: 'eu' };
    const requests = [];
    const service = { getState: () => ({ phase: 'ready' }), request: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      return Response.json({ ...selection, credential });
    } };
    const resolve = createSelectedCredentialResolver({ service, resolveWorkspaceScope: async () => scope });
    expect(await resolve(selection)).toEqual(credential);
    expect(requests).toEqual([{ url: '/internal/workspaces/workspace_1/credentials/resolve', body: selection }]);
    expect(requests[0].body.cwd).toBeUndefined();
  });
  it('refuses mismatched private responses and sanitizes secret-bearing failures', async () => {
    let result = { ...selection, credentialRef: 'sibling-ref', credential: { type: 'api_key', key: 'private-marker' } };
    const service = { getState: () => ({ phase: 'ready' }), request: async () => Response.json(result) };
    const resolve = createSelectedCredentialResolver({ service, resolveWorkspaceScope: async () => scope });
    await expect(resolve(selection)).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    service.request = async () => { throw new Error('/private/auth.sqlite private-marker'); };
    let failure;
    try { await resolve(selection); } catch (error) { failure = error; }
    expect(failure.code).toBe('SERVICE_UNAVAILABLE');
    expect(failure.message).not.toContain('private-marker');
    expect(failure.message).not.toContain('/private');
  });
  it('keeps handoff distinct, reports provider-specific limits without enumerating or reading legacy secrets', async () => {
    let requests = 0;
    const service = { getState: () => ({ phase: 'ready' }), request: async () => { requests++; throw new Error('No secret read permitted'); } };
    const handoff = createSelectedCredentialHandoff({ service, resolveWorkspaceScope: async () => scope });
    const result = await handoff({ intent: 'credential-handoff', consent: true, workspaceId: 'workspace_1', selections: [
      { providerId: 'proxy', source: 'stored-credential', credentialType: 'key' },
      { providerId: 'opencode', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'openai-codex', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'unknown-oauth', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'openai', source: 'stored-credential', credentialType: 'key' },
    ] });
    expect(result.results.map(({ status, code }) => [status, code])).toEqual([
      ['unavailable', 'SELECTED_SOURCE_UNAVAILABLE'], ['unsupported', 'CONSOLE_CREDENTIAL_UNSUPPORTED'],
      ['re-auth-required', 'OAUTH_REAUTH_REQUIRED'], ['unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED'],
      ['unavailable', 'PROVIDER_CONVERSION_UNVERIFIED'],
    ]);
    expect(requests).toBe(0);
  });
  it('selects only the explicit file and its provider at the owning CAS revision, preserving independent partial failures', async () => {
    const paths = [];
    const service = { getState: () => ({ phase: 'ready' }), request: async (url, init) => {
      paths.push(url);
      if (url.endsWith('/providers')) return Response.json({ workspaceId: 'workspace_1', revision: '7', providers: [] });
      const body = JSON.parse(init.body);
      expect(body).toMatchObject({ workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', expectedRevision: '7' });
      expect(body.selection.file).toEqual({ format: 'opencode-auth-entry', content: '{"type":"api","key":"selected-key"}' });
      return Response.json({ workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', revision: '7',
        outcome: { providerId: 'proxy', source: 'selected-file', credentialType: 'key', status: 'unavailable', code: 'PROVIDER_UNAVAILABLE' } });
    } };
    const handoff = createSelectedCredentialHandoff({ service, resolveWorkspaceScope: async () => scope });
    const result = await handoff({ intent: 'credential-handoff', consent: true, workspaceId: 'workspace_1', selections: [
      { providerId: 'proxy', source: 'selected-file', credentialType: 'key', file: { format: 'opencode-auth-entry', content: '{"type":"api","key":"selected-key"}' } },
      { providerId: 'other', source: 'external-environment', credentialType: 'key' },
    ] });
    expect(paths).toEqual(['/api/agent/v1/workspaces/workspace_1/providers', '/internal/workspaces/workspace_1/credentials/handoff']);
    expect(result.results.map(result => result.status)).toEqual(['unavailable', 'unavailable']);
    expect(JSON.stringify(result)).not.toContain('selected-key');
  });
});
