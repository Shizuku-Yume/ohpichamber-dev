import { describe, expect, it } from 'bun:test';
import { createSelectedCredentialResolver, createSelectedCredentialHandoff, createCatalogCredentialSelections } from './private-credential.js';

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

const quotaRegistry = () => import('../quota/providers/index.js');
const publicProvider = (providerId, { method = 'api-key', credentialRef = `credential_${providerId}`,
  endpoint = 'https://provider.example/v1', protocol = 'chat-completions', configured = true } = {}) => ({
  providerId, name: providerId, endpoint, protocol, authMethods: [method],
  auth: configured ? { status: 'configured', credentialRef, method, source: 'stored-credential' } : { status: 'missing' },
});
const catalogFixture = (providers, extra = {}) => {
  const paths = [];
  let admitted = false;
  const service = { getState: () => ({ phase: 'ready' }), request: async url => {
    expect(admitted).toBe(true);
    paths.push(url);
    return Response.json({ workspaceId: 'workspace_1', revision: '3', providers });
  } };
  const resolveWorkspaceScope = async id => { await Promise.resolve(); admitted = true; return id === scope.workspaceId ? scope : null; };
  const owners = createCatalogCredentialSelections({ service, resolveWorkspaceScope, getQuotaProviders: quotaRegistry, ...extra });
  return { ...owners, service, paths };
};
const catalogRequest = (extra = {}) => ({ query: { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', ...extra } });

describe('Host-owned public catalog credential selections', () => {
  it('requires actual service, admitted scope and quota registry owners', () => {
    expect(() => createCatalogCredentialSelections({ service: {}, resolveWorkspaceScope: async () => scope, getQuotaProviders: quotaRegistry })).toThrow(TypeError);
    expect(() => createCatalogCredentialSelections({ service: { request() {}, getState() {} }, resolveWorkspaceScope: async () => scope })).toThrow(TypeError);
  });
  it('rejects missing, conflicting and mismatched identities before any catalog or secret request', async () => {
    const owner = catalogFixture([]);
    for (const req of [{}, { query: { agentDirectoryId: 'agent_1' } }, catalogRequest({ workspaceId: ['workspace_1'] }),
      { ...catalogRequest(), body: { workspaceId: 'sibling' } }, catalogRequest({ providerId: null })]) {
      await expect(owner.listQuotaSelections(req)).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    }
    await expect(owner.listQuotaSelections(catalogRequest({ agentDirectoryId: 'sibling' }))).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    owner.service.getState = () => ({ phase: 'failed' });
    await expect(owner.listQuotaSelections(catalogRequest())).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(owner.paths).toHaveLength(0);
  });
  it('derives the mandatory consumer directory identity from the admitted Host mapping, not public discovery fields', async () => {
    const owner = catalogFixture([publicProvider('deepseek'), publicProvider('proxy')]);
    expect(await owner.resolveQuotaSelection({ query: { workspaceId: 'workspace_1' } }, 'deepseek')).toEqual({
      workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'deepseek', credentialRef: 'credential_deepseek',
    });
    expect(await owner.resolveTtsSelection({ body: { workspaceId: 'workspace_1', providerId: 'proxy' } })).toMatchObject({
      workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'proxy', credentialRef: 'credential_proxy',
    });
  });
  it('uses real quota registry relations and exact current native credential references without secret reads', async () => {
    const owner = catalogFixture([
      publicProvider('anthropic', { method: 'oauth', protocol: 'messages' }),
      publicProvider('openai-codex', { method: 'oauth', protocol: 'responses' }),
      publicProvider('github-copilot', { method: 'oauth' }),
      publicProvider('deepseek'), publicProvider('unknown-native'), publicProvider('openrouter', { configured: false }),
    ]);
    expect(await owner.resolveQuotaSelection(catalogRequest(), 'codex')).toEqual({
      workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'openai-codex', credentialRef: 'credential_openai-codex',
    });
    expect(await owner.resolveQuotaSelection(catalogRequest(), 'claude')).toMatchObject({ providerId: 'anthropic', credentialRef: 'credential_anthropic' });
    expect(await owner.resolveQuotaSelection(catalogRequest(), 'github-copilot-addon')).toMatchObject({ providerId: 'github-copilot', credentialRef: 'credential_github-copilot' });
    const selections = await owner.listQuotaSelections(catalogRequest());
    expect(selections.map(({ quotaProviderId }) => quotaProviderId)).toEqual(['claude', 'codex', 'github-copilot', 'github-copilot-addon', 'deepseek']);
    expect(owner.paths).toHaveLength(4);
    expect(owner.paths.every(url => url === '/api/agent/v1/workspaces/workspace_1/providers')).toBe(true);
    expect(JSON.stringify(selections)).not.toContain('/private');
  });
  it.each([
    ['hyper', 'charm-hyper', 'api-key'], ['zai-coding-plan', 'zai', 'api-key'],
    ['zhipuai-coding-plan', 'zhipu-coding-plan', 'api-key'], ['kimi-for-coding', 'kimi-code', 'api-key'],
    ['nano-gpt', 'nanogpt', 'api-key'], ['minimax-coding-plan', 'minimax-code', 'api-key'],
    ['minimax-cn-coding-plan', 'minimax-code-cn', 'api-key'], ['wafer', 'wafer-serverless', 'api-key'],
    ['xai', 'xai-oauth', 'oauth'], ['opencode-go', 'opencode-go', 'api-key'],
  ])('resolves logical %s to established stored native provider %s', async (logicalId, nativeId, method) => {
    const owner = catalogFixture([publicProvider(nativeId, { method })]);
    expect(await owner.resolveQuotaSelection(catalogRequest(), logicalId)).toEqual({ workspaceId: 'workspace_1',
      agentDirectoryId: 'agent_1', providerId: nativeId, credentialRef: `credential_${nativeId}` });
    expect(owner.paths).toEqual(['/api/agent/v1/workspaces/workspace_1/providers']);
  });
  it('does not treat login IDs, legacy alias bags or unrelated vendor credentials as stored native targets', async () => {
    for (const [logicalId, wrongNativeId] of [['codex', 'openai-codex-device'], ['zai-coding-plan', 'zai-coding-plan'],
      ['minimax-coding-plan', 'minimax'], ['kimi-for-coding', 'moonshot'], ['opencode-go', 'opencode'], ['xai', 'xai']]) {
      const owner = catalogFixture([publicProvider(wrongNativeId)]);
      await expect(owner.resolveQuotaSelection(catalogRequest(), logicalId)).rejects.toMatchObject({ status: 422, code: 'CREDENTIAL_UNAVAILABLE' });
    }
  });
  it('never infers the quota implementation ID is a native SDK alias or reads sibling credentials', async () => {
    const owner = catalogFixture([publicProvider('codex', { method: 'oauth' }), publicProvider('openai', { method: 'oauth' }),
      publicProvider('openai-codex', { method: 'oauth' }), publicProvider('anthropic')]);
    await expect(owner.resolveQuotaSelection(catalogRequest({ providerId: 'codex' }), 'codex')).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' });
    await expect(owner.resolveQuotaSelection(catalogRequest({ providerId: 'openai' }), 'codex')).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' });
    await expect(owner.resolveQuotaSelection(catalogRequest({ credentialRef: 'old-ref' }), 'codex')).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' });
    await expect(owner.resolveQuotaSelection(catalogRequest(), 'claude')).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' });
  });
  it('requires an explicit native provider when a logical quota product has multiple configured native owners', async () => {
    const owner = catalogFixture([publicProvider('google-gemini-cli', { method: 'oauth', protocol: 'generate-content' }),
      publicProvider('google-antigravity', { method: 'oauth', protocol: 'generate-content' })]);
    await expect(owner.resolveQuotaSelection(catalogRequest(), 'google')).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    expect(await owner.resolveQuotaSelection(catalogRequest({ providerId: 'google-antigravity' }), 'google')).toMatchObject({
      providerId: 'google-antigravity', credentialRef: 'credential_google-antigravity',
    });
  });
  it('does not convert catalog/service/registry failures into a successful empty selection list', async () => {
    const owner = catalogFixture([]);
    expect(await owner.listQuotaSelections(catalogRequest())).toEqual([]);
    owner.service.request = async () => Response.json({ workspaceId: 'sibling', revision: '0', providers: [] });
    await expect(owner.listQuotaSelections(catalogRequest())).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    owner.service.request = async () => Response.json({ workspaceId: 'workspace_1', revision: '0', providers: [], cwd: '/private/marker' });
    await expect(owner.listQuotaSelections(catalogRequest())).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    owner.service.request = async () => { throw new Error('/private/auth.sqlite private-secret'); };
    let failure;
    try { await owner.listQuotaSelections(catalogRequest()); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(failure.message).not.toContain('private-secret');
    const brokenRegistry = catalogFixture([], { getQuotaProviders: async () => { throw new Error('private-secret'); } });
    await expect(brokenRegistry.listQuotaSelections(catalogRequest())).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
  });
  it('selects TTS only by admitted native provider and catalog endpoint, never the browser endpoint', async () => {
    const owner = catalogFixture([publicProvider('proxy', { endpoint: 'https://selected.example/v1' }),
      publicProvider('openai', { endpoint: 'https://api.openai.com/v1', protocol: 'responses' }),
      publicProvider('openai-codex', { method: 'oauth', protocol: 'responses' }), publicProvider('anthropic', { protocol: 'messages' }),
      publicProvider('missing-endpoint', { endpoint: null })]);
    const req = { body: { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'proxy', baseURL: 'https://browser.example/v1' } };
    expect(await owner.resolveTtsSelection(req)).toEqual({ workspaceId: 'workspace_1', agentDirectoryId: 'agent_1',
      providerId: 'proxy', credentialRef: 'credential_proxy', baseURL: 'https://selected.example/v1' });
    expect(await owner.resolveTtsSelection(catalogRequest({ providerId: 'openai' }))).toMatchObject({ baseURL: 'https://api.openai.com/v1' });
    await expect(owner.resolveTtsSelection(catalogRequest())).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    for (const providerId of ['openai-codex', 'anthropic', 'missing-endpoint', 'sibling'])
      await expect(owner.resolveTtsSelection(catalogRequest({ providerId }))).rejects.toMatchObject({ status: 422, code: 'CREDENTIAL_UNAVAILABLE' });
    await expect(owner.resolveTtsSelection(catalogRequest({ providerId: 'proxy', credentialRef: 'old-ref' }))).rejects.toMatchObject({ code: 'CREDENTIAL_UNAVAILABLE' });
    expect(owner.paths.every(url => url === '/api/agent/v1/workspaces/workspace_1/providers')).toBe(true);
  });
});
