import { describe, expect, it, vi } from 'vitest';
import { fetchQuotaForProvider, listConfiguredQuotaProviders } from './index.js';

const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'cline-pass', credentialRef: 'credential_1' };
describe('selected quota dispatcher', () => {
  it('lists public selections without secret resolution', async () => {
    expect(await listConfiguredQuotaProviders({ selections: [{ providerId: 'deepseek' }, { providerId: 'not-supported' }] })).toEqual(['deepseek']);
  });
  it('lists one logical product for multiple explicit native owners and rejects inherited registry keys', async () => {
    expect(await listConfiguredQuotaProviders({ selections: [
      { quotaProviderId: 'google', providerId: 'google-gemini-cli' },
      { quotaProviderId: 'google', providerId: 'google-antigravity' },
      { providerId: 'constructor' }, { providerId: 'github-copilot' },
      { quotaProviderId: 'github-copilot-addon', providerId: 'github-copilot' },
    ] })).toEqual(['google', 'github-copilot', 'github-copilot-addon']);
  });
  it('passes only the exact selected ownership and quota purpose to the resolver', async () => {
    const resolveCredential = vi.fn(async () => ({ type: 'api_key', key: 'selected-key' }));
    const result = await fetchQuotaForProvider('cline-pass', { ...selection, resolveCredential, fetchImpl: async (_url, options) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer selected-key');
      return Response.json({ data: { limits: [{ type: 'weekly', percentUsed: 9 }] } });
    } });
    expect(resolveCredential).toHaveBeenCalledWith({ ...selection, providerId: 'cline-pass', purpose: 'quota' });
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('selected-key');
  });
  it('never fetches or falls back when the selected resolver fails', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchQuotaForProvider('cline-pass', { ...selection, resolveCredential: async () => { throw new Error('Selected credential unavailable'); }, fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('resolves the selected native descriptor without quota-provider alias lookup', async () => {
    const resolveCredential = vi.fn(async () => ({ type: 'oauth', access: 'selected-access', refresh: 'selected-refresh', expires: Date.now() + 3600000 }));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    try {
      await fetchQuotaForProvider('codex', { ...selection, providerId: 'openai-codex', resolveCredential });
      expect(resolveCredential).toHaveBeenCalledWith({ ...selection, providerId: 'openai-codex', purpose: 'quota' });
    } finally { vi.unstubAllGlobals(); }
  });

  it.each(['claude', 'cline-pass', 'codex', 'cursor', 'deepinfra', 'deepseek', 'exe-dev', 'google', 'hyper', 'zai-coding-plan', 'zhipuai-coding-plan', 'kimi-for-coding', 'openrouter', 'nano-gpt', 'github-copilot', 'github-copilot-addon', 'minimax-coding-plan', 'minimax-cn-coding-plan', 'ollama-cloud', 'wafer', 'opencode-go', 'neuralwatt', 'kilo', 'zenmux', 'xai'])('never projects thrown upstream secrets for %s', async (providerId) => {
    const credential = { type: 'oauth', access: 'selected-access', refresh: 'selected-refresh', expires: Date.now() + 3600000 };
    const original = structuredClone(credential);
    const fail = async () => { throw new Error('selected-access selected-refresh'); };
    vi.stubGlobal('fetch', vi.fn(fail));
    try {
      const result = await fetchQuotaForProvider(providerId, { ...selection, providerId, resolveCredential: async () => credential, fetchImpl: fail });
      expect(result.ok).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(/selected-access|selected-refresh/);
      expect(credential).toEqual(original);
    } finally { vi.unstubAllGlobals(); }
  });

  it('never projects resolver errors that echo credential material', async () => {
    const result = await fetchQuotaForProvider('cline-pass', { ...selection, resolveCredential: async () => { throw new Error('private-key-material'); } });
    expect(JSON.stringify(result)).not.toContain('private-key-material');
  });
  it('fails closed instead of inferring a native provider from the quota route', async () => {
    const resolveCredential = vi.fn();
    const result = await fetchQuotaForProvider('codex', { ...selection, providerId: undefined, resolveCredential });
    expect(result.ok).toBe(false);
    expect(resolveCredential).not.toHaveBeenCalled();
  });
});
