import { describe, expect, it, vi } from 'vitest';
import { fetchQuotaForProvider, listConfiguredQuotaProviders, listUsagePageProviders } from './index.js';

// `deepseek` keeps a Host scraper, so the selected-credential contract is
// tested through it. `claude` is native-backed: its tests assert the native
// report path instead of secret resolution.
const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'deepseek', credentialRef: 'credential_1' };

const nativeReport = ({ provider = 'anthropic', limits = [] }) => ({
  provider,
  fetchedAt: Date.now(),
  limits,
});

const usageLimit = ({ id = 'anthropic:5h', label = '5 Hour', durationMs = 5 * 60 * 60 * 1000, usedFraction = 0.42, modelId, tier }) => {
  const scope = { provider: 'anthropic' };
  if (modelId) scope.modelId = modelId;
  if (tier) scope.tier = tier;
  return {
    id,
    label,
    scope,
    window: { id: '5h', label: '5 Hour', durationMs },
    amount: { usedFraction, unit: 'percent' },
  };
};

const readNativeReportsReturning = (reports) => vi.fn(async () => ({ reports, error: null }));

describe('selected quota dispatcher', () => {
  it('lists public selections without secret resolution', async () => {
    expect(await listConfiguredQuotaProviders({ selections: [{ providerId: 'deepseek' }, { providerId: 'cursor' }, { providerId: 'not-supported' }] })).toEqual(['deepseek', 'cursor']);
  });
  it('lists one logical product for multiple explicit native owners and rejects inherited registry keys', async () => {
    expect(await listConfiguredQuotaProviders({
      selections: [
        { quotaProviderId: 'google', providerId: 'google-gemini-cli' },
        { quotaProviderId: 'google', providerId: 'google-antigravity' },
        { providerId: 'constructor' }, { providerId: 'github-copilot' },
        { quotaProviderId: 'github-copilot-addon', providerId: 'github-copilot' },
      ]
    })).toEqual(['google', 'github-copilot', 'github-copilot-addon']);
  });
  it('passes only the exact selected ownership and quota purpose to the resolver', async () => {
    const resolveCredential = vi.fn(async () => ({ type: 'api_key', key: 'selected-key' }));
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer selected-key');
      return Response.json({ balance_infos: [{ currency: 'USD', total_balance: 5 }] });
    }));
    try {
      const result = await fetchQuotaForProvider('deepseek', { ...selection, resolveCredential });
      expect(resolveCredential).toHaveBeenCalledWith({ ...selection, providerId: 'deepseek', purpose: 'quota' });
      expect(result.ok).toBe(true);
      expect(JSON.stringify(result)).not.toContain('selected-key');
    } finally { vi.unstubAllGlobals(); }
  });
  it('treats a missing selected credential as unconfigured without an error', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchQuotaForProvider('deepseek', {
      ...selection, resolveCredential: async () => {
        throw Object.assign(new Error('no stored record'), { code: 'CREDENTIAL_UNAVAILABLE' });
      }, fetchImpl
    });
    expect(result).toMatchObject({ ok: false, configured: false, usage: null });
    expect(result.error).toBeUndefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('keeps a configured provider credential-resolution failure visible', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchQuotaForProvider('deepseek', {
      ...selection, resolveCredential: async () => {
        throw Object.assign(new Error('agent service down'), { code: 'SERVICE_UNAVAILABLE' });
      }, fetchImpl
    });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'Selected credential unavailable' });
    expect(JSON.stringify(result)).not.toContain('agent service down');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('never fetches or falls back when the selected resolver fails', async () => {
    const fetchImpl = vi.fn();
    const result = await fetchQuotaForProvider('deepseek', { ...selection, resolveCredential: async () => { throw new Error('Selected credential unavailable'); }, fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'Selected credential unavailable' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['claude', 'cline-pass', 'codex', 'cursor', 'deepinfra', 'deepseek', 'exe-dev', 'google', 'hyper', 'zai-coding-plan', 'zhipuai-coding-plan', 'kimi-for-coding', 'openrouter', 'nano-gpt', 'github-copilot', 'github-copilot-addon', 'minimax-coding-plan', 'minimax-cn-coding-plan', 'ollama-cloud', 'wafer', 'neuralwatt', 'kilo', 'zenmux', 'xai'])('never projects thrown upstream secrets for %s', async (providerId) => {
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
    const result = await fetchQuotaForProvider('deepseek', { ...selection, resolveCredential: async () => { throw new Error('private-key-material'); } });
    expect(JSON.stringify(result)).not.toContain('private-key-material');
  });
});

describe('native-backed quota providers', () => {
  it('answers a covered provider from the native usage report without resolving the secret', async () => {
    const resolveCredential = vi.fn();
    const readNativeReports = readNativeReportsReturning([nativeReport({ limits: [usageLimit({})] })]);
    const result = await fetchQuotaForProvider('claude', {
      workspaceId: 'workspace_1', providerId: 'anthropic', resolveCredential, readNativeReports,
    });
    expect(resolveCredential).not.toHaveBeenCalled();
    expect(readNativeReports).toHaveBeenCalledWith({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result).toMatchObject({ providerId: 'claude', providerName: 'Claude', ok: true, configured: true });
    expect(result.usage.windows['5h']).toMatchObject({ usedPercent: 42, windowSeconds: 5 * 60 * 60 });
  });

  it('keeps a native read failure visible as a configured failure', async () => {
    const result = await fetchQuotaForProvider('codex', {
      workspaceId: 'workspace_1', providerId: 'openai-codex',
      resolveCredential: vi.fn(),
      readNativeReports: async () => ({ reports: null, error: 'The Agent Service is not ready' }),
    });
    expect(result).toMatchObject({ providerId: 'codex', ok: false, configured: true });
    expect(result.error).toBe('The Agent Service is not ready');
  });

  it('fails closed when no native reader is wired instead of falling back to a scraper', async () => {
    const resolveCredential = vi.fn();
    vi.stubGlobal('fetch', vi.fn());
    try {
      const result = await fetchQuotaForProvider('claude', { workspaceId: 'workspace_1', providerId: 'anthropic', resolveCredential });
      expect(result.ok).toBe(false);
      expect(result.configured).toBe(true);
      expect(resolveCredential).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });

  it('projects model-scoped native limits into per-model usage', async () => {
    const result = await fetchQuotaForProvider('claude', {
      workspaceId: 'workspace_1', providerId: 'anthropic',
      resolveCredential: vi.fn(),
      readNativeReports: readNativeReportsReturning([nativeReport({
        limits: [
          usageLimit({}),
          usageLimit({ id: 'anthropic:7d:sonnet', label: '7 Day', durationMs: 7 * 24 * 60 * 60 * 1000, usedFraction: 0.1, modelId: 'claude-sonnet-4-5' }),
        ],
      })]),
    });
    expect(result.ok).toBe(true);
    expect(result.usage.models['claude-sonnet-4-5'].windows.weekly.usedPercent).toBeCloseTo(10);
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(42);
  });

  it('reports an empty native answer as a configured failure rather than unconfigured', async () => {
    const result = await fetchQuotaForProvider('xai', {
      workspaceId: 'workspace_1', providerId: 'xai-oauth',
      resolveCredential: vi.fn(),
      readNativeReports: readNativeReportsReturning([]),
    });
    expect(result).toMatchObject({ providerId: 'xai', ok: false, configured: true });
  });
});

// The registered provider list is the coverage contract: removing a scraper
// must never remove the provider from the list clients see. Native-backed and
// scraper-backed providers share one registry. `github-copilot-addon` is a
// configured-list entry that the Usage page excludes from its cards.
describe('quota provider coverage', () => {
  it('lists exactly the providers registered before the native cutover, minus the dead antigravity id', () => {
    expect(listUsagePageProviders().map(({ providerId }) => providerId).sort()).toEqual([
      'claude', 'cline-pass', 'codex', 'cursor', 'deepinfra', 'deepseek', 'exe-dev', 'google', 'hyper',
      'zai-coding-plan', 'zhipuai-coding-plan', 'kimi-for-coding', 'openrouter', 'nano-gpt', 'github-copilot',
      'minimax-coding-plan', 'minimax-cn-coding-plan', 'ollama-cloud', 'wafer', 'neuralwatt', 'kilo', 'zenmux',
      'xai', 'mistral',
    ].sort());
  });

  it('keeps every covered provider listed, backed by the native report', async () => {
    const covered = {
      claude: 'anthropic',
      codex: 'openai-codex',
      'github-copilot': 'github-copilot',
      'github-copilot-addon': 'github-copilot',
      cursor: 'cursor',
      xai: 'xai-oauth',
      'cline-pass': 'cline-pass',
      hyper: 'charm-hyper',
      'zai-coding-plan': 'zai',
      'minimax-coding-plan': 'minimax-code',
    };
    for (const [logicalId, nativeProvider] of Object.entries(covered)) {
      const readNativeReports = vi.fn(async () => ({ reports: [], error: null }));
      await fetchQuotaForProvider(logicalId, {
        workspaceId: 'workspace_1', providerId: nativeProvider, resolveCredential: vi.fn(), readNativeReports,
      });
      expect(readNativeReports).toHaveBeenCalledWith({ workspaceId: 'workspace_1', nativeProviders: [nativeProvider] });
    }
  });
});

describe('z.ai gift reset discovery through the native-backed provider', () => {
  const zaiSelection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'zai', credentialRef: 'credential_1' };

  const zaiReport = () => nativeReport({
    provider: 'zai',
    limits: [{
      id: 'zai:tokens:5h',
      label: '5 Hour',
      scope: { provider: 'zai' },
      window: { id: '5h', label: '5 Hour', durationMs: 5 * 60 * 60 * 1000 },
      amount: { used: 100, limit: 1000, unit: 'tokens' },
    }],
  });

  it('merges a discovered gift reset onto the matching five-hour window', async () => {
    const expireTime = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const expireText = `${expireTime.getUTCFullYear()}-${pad(expireTime.getUTCMonth() + 1)}-${pad(expireTime.getUTCDate())} ${pad(expireTime.getUTCHours())}:${pad(expireTime.getUTCMinutes())}:${pad(expireTime.getUTCSeconds())}`;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      success: true,
      data: { fiveHourResets: [{ available: true, recordId: 462029, expireTime: expireText }], weekResets: [] },
    })));
    try {
      const result = await fetchQuotaForProvider('zai-coding-plan', {
        ...zaiSelection,
        resolveCredential: vi.fn(async () => ({ type: 'api_key', key: 'zai-key' })),
        readNativeReports: readNativeReportsReturning([zaiReport()]),
      });
      expect(result.ok).toBe(true);
      const window = result.usage.windows['5h'];
      expect(window.giftReset).toMatchObject({ recordId: 462029 });
      expect(window.giftReset.expireAt).toBeGreaterThan(Date.now());
    } finally { vi.unstubAllGlobals(); }
  });

  it('leaves the quota answer intact when the gift list read fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    try {
      const result = await fetchQuotaForProvider('zai-coding-plan', {
        ...zaiSelection,
        resolveCredential: vi.fn(async () => ({ type: 'api_key', key: 'zai-key' })),
        readNativeReports: readNativeReportsReturning([zaiReport()]),
      });
      expect(result.ok).toBe(true);
      expect(result.usage.windows['5h'].giftReset).toBeUndefined();
      expect(result.usage.windows['5h'].valueLabel).toBe('100 / 1,000 tokens');
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not query the gift list for non-zai native providers', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await fetchQuotaForProvider('claude', {
        workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'anthropic', credentialRef: 'credential_1',
        resolveCredential: vi.fn(async () => ({ type: 'oauth', access: 'token' })),
        readNativeReports: readNativeReportsReturning([nativeReport({ limits: [usageLimit({})] })]),
      });
      expect(result.ok).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});
