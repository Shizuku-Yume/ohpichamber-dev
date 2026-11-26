import { describe, expect, it, vi } from 'vitest';
import { createNativeUsageReader, nativeReportsToProviderResult, createNativeQuotaProvider, NATIVE_QUOTA_PROVIDERS } from './native.js';

const limit = ({
  id = 'anthropic:5h',
  label = '5 Hour',
  provider = 'anthropic',
  durationMs = 5 * 60 * 60 * 1000,
  resetsAt,
  usedFraction,
  used,
  total,
  remaining,
  unit = 'percent',
  modelId,
  tier,
} = {}) => {
  const scope = { provider };
  if (modelId) scope.modelId = modelId;
  if (tier) scope.tier = tier;
  const window = { id: '5h', label: '5 Hour' };
  if (durationMs !== undefined) window.durationMs = durationMs;
  if (resetsAt !== undefined) window.resetsAt = resetsAt;
  const amount = { unit };
  if (usedFraction !== undefined) amount.usedFraction = usedFraction;
  if (used !== undefined) amount.used = used;
  if (total !== undefined) amount.limit = total;
  if (remaining !== undefined) amount.remaining = remaining;
  return { id, label, scope, window, amount };
};

const report = ({ provider = 'anthropic', fetchedAt = 1700000000000, limits = [], resetCredits } = {}) => {
  const entry = { provider, fetchedAt, limits };
  if (resetCredits) entry.resetCredits = resetCredits;
  return entry;
};

const spec = { providerId: 'claude', providerName: 'Claude', nativeProviders: ['anthropic'] };

describe('nativeReportsToProviderResult', () => {
  it('converts a provider-wide fraction window into the host quota window shape', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ usedFraction: 0.42, resetsAt: 1700003600000 })] })],
      spec,
    );
    expect(result).toMatchObject({ providerId: 'claude', providerName: 'Claude', ok: true, configured: true });
    expect(result.fetchedAt).toBe(1700000000000);
    const window = result.usage.windows['5h'];
    expect(window.usedPercent).toBeCloseTo(42);
    expect(window.remainingPercent).toBeCloseTo(58);
    expect(window.windowSeconds).toBe(5 * 60 * 60);
    expect(window.resetAt).toBe(1700003600000);
  });

  it('derives the used percent from absolute amounts when no fraction is reported', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ used: 250, total: 1000, unit: 'tokens' })] })],
      spec,
    );
    const window = result.usage.windows['5h'];
    expect(window.usedPercent).toBeCloseTo(25);
    expect(window.valueLabel).toBe('250 / 1,000 tokens');
  });

  it('labels credit windows with their used and total credits', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ used: 65, total: 12000, unit: 'credits' })] })],
      spec,
    );
    expect(result.usage.windows['5h'].valueLabel).toBe('65 / 12,000 credits');
  });

  it('projects spend units into the spend value shape', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ used: 3.5, total: 10, unit: 'usd', durationMs: 30 * 24 * 60 * 60 * 1000 })] })],
      spec,
    );
    const window = result.usage.windows['30d'];
    expect(window.value).toEqual({ kind: 'spend', spent: 3.5, limit: 10 });
    expect(window.usedPercent).toBeCloseTo(35);
  });

  it('projects request units into the request count shape', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ used: 17, total: 100, unit: 'requests' })] })],
      spec,
    );
    expect(result.usage.windows['5h'].value).toEqual({ kind: 'requests', count: 17 });
  });

  it('puts model-scoped limits into per-model usage and keeps provider windows on the card', () => {
    const result = nativeReportsToProviderResult(
      [report({
        limits: [
          limit({ usedFraction: 0.5 }),
          limit({ id: 'anthropic:7d:sonnet', label: '7 Day', durationMs: 7 * 24 * 60 * 60 * 1000, usedFraction: 0.1, modelId: 'claude-sonnet-4-5' }),
        ],
      })],
      spec,
    );
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(50);
    expect(result.usage.models['claude-sonnet-4-5'].windows.weekly.usedPercent).toBeCloseTo(10);
    expect(result.usage.windows.weekly).toBeUndefined();
  });

  it('ignores reports of other providers and fails configured when none remain', () => {
    const result = nativeReportsToProviderResult(
      [report({ provider: 'openai-codex', limits: [limit({ usedFraction: 0.9 })] })],
      spec,
    );
    expect(result).toMatchObject({ ok: false, configured: true, usage: null });
    expect(result.error).toBe('No native usage report');
  });

  it('reports an empty report list as a configured failure, never as unconfigured', () => {
    const result = nativeReportsToProviderResult([], spec);
    expect(result).toMatchObject({ ok: false, configured: true, usage: null });
  });

  it('prefers reports of the selected native provider when the selection identifies one', () => {
    const result = nativeReportsToProviderResult(
      [
        report({ provider: 'github-copilot', fetchedAt: 1700000001000, limits: [limit({ provider: 'github-copilot', usedFraction: 0.3 })] }),
      ],
      { providerId: 'github-copilot', providerName: 'GitHub Copilot', nativeProviders: ['github-copilot'] },
      { selectedNativeProviderId: 'github-copilot' },
    );
    expect(result.ok).toBe(true);
    expect(result.fetchedAt).toBe(1700000001000);
  });

  it('merges several reports of one provider, the freshest report winning duplicate limit ids deterministically', () => {
    const result = nativeReportsToProviderResult(
      [
        report({ fetchedAt: 1700000000000, limits: [limit({ usedFraction: 0.2 })] }),
        report({ fetchedAt: 1700000002000, limits: [limit({ usedFraction: 0.9 }), limit({ id: 'anthropic:7d', label: '7 Day', durationMs: 7 * 24 * 60 * 60 * 1000, usedFraction: 0.4 })] }),
      ],
      spec,
    );
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(90);
    expect(result.usage.windows.weekly.usedPercent).toBeCloseTo(40);
    expect(result.fetchedAt).toBe(1700000002000);
  });

  it('keeps reset credit counts out of the window list', () => {
    const result = nativeReportsToProviderResult(
      [report({ limits: [limit({ usedFraction: 0.1 })], resetCredits: { availableCount: 3, redeemableCount: 1 } })],
      spec,
    );
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.windows)).toEqual(['5h']);
  });
});

describe('createNativeQuotaProvider', () => {
  it('fails configured without a reader or workspace instead of scraping', async () => {
    const provider = createNativeQuotaProvider(spec);
    const missing = await provider.fetchQuota({});
    expect(missing).toMatchObject({ ok: false, configured: true, error: 'Native usage reads are unavailable' });
    const noWorkspace = await provider.fetchQuota({ readNativeReports: async () => ({ reports: [], error: null }) });
    expect(noWorkspace).toMatchObject({ ok: false, configured: true, error: 'Native usage reads are unavailable' });
  });

  it('projects the reader failure as a configured failure', async () => {
    const provider = createNativeQuotaProvider(spec);
    const result = await provider.fetchQuota({
      workspaceId: 'workspace_1',
      readNativeReports: async () => ({ reports: null, error: 'The Agent Service is not ready' }),
    });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'The Agent Service is not ready' });
  });

  it('survives a throwing reader with a configured failure', async () => {
    const provider = createNativeQuotaProvider(spec);
    const result = await provider.fetchQuota({
      workspaceId: 'workspace_1',
      readNativeReports: async () => { throw new Error('boom'); },
    });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'Native usage report could not be read' });
  });

  it('passes the selected native provider id to the conversion', async () => {
    const provider = createNativeQuotaProvider({ providerId: 'xai', providerName: 'xAI', nativeProviders: ['xai-oauth'] });
    const result = await provider.fetchQuota({
      workspaceId: 'workspace_1',
      providerId: 'xai-oauth',
      readNativeReports: async () => ({
        reports: [report({ provider: 'xai-oauth', limits: [limit({ provider: 'xai-oauth', usedFraction: 0.7 })] })],
        error: null,
      }),
    });
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(70);
  });
});

describe('createNativeUsageReader', () => {
  const serviceStats = (reports) => ({
    range: { from: 1, to: 2 },
    sessions: 0, subagents: 0, prompts: 0, steps: 0,
    tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    tools: { mode: 'none' },
    activeDays: 0, streak: 0, activity: [], providers: [], models: [],
    partial: false,
    accounts: { reports, history: null },
  });

  const createService = (payload, { ok = true, status = 200 } = {}) => ({
    getState: () => ({ phase: 'ready' }),
    request: vi.fn(async () => ({ ok, status, json: async () => payload })),
  });

  const resolveWorkspaceScope = async (workspaceId) => ({ workspaceId, projectId: 'project_1', agentDirectoryId: 'agent_1' });

  it('reads the canonical report through the Agent Service with a small window and provider filter', async () => {
    const reports = [report({ limits: [limit({ usedFraction: 0.5 })] })];
    const service = createService(serviceStats(reports));
    const read = createNativeUsageReader({ service, resolveWorkspaceScope });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result.error).toBeNull();
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0].provider).toBe('anthropic');
    const [path, init] = service.request.mock.calls[0];
    expect(path).toBe('/internal/usage');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.query.providerId).toBe('anthropic');
    expect(body.query.to - body.query.from).toBeLessThanOrEqual(120000);
    expect(body.authorizedScopes).toEqual([{ workspaceId: 'workspace_1', projectId: 'project_1' }]);
  });

  it('coalesces concurrent reads of the same workspace and provider set', async () => {
    const service = createService(serviceStats([report()]));
    const read = createNativeUsageReader({ service, resolveWorkspaceScope });
    const [first, second] = await Promise.all([
      read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] }),
      read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] }),
    ]);
    expect(service.request).toHaveBeenCalledTimes(1);
    expect(first.reports).toHaveLength(1);
    expect(second.reports).toHaveLength(1);
  });

  it('fails explicitly when the Agent Service is not ready', async () => {
    const service = createService(serviceStats([]));
    service.getState = () => ({ phase: 'starting' });
    const read = createNativeUsageReader({ service, resolveWorkspaceScope });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('The Agent Service is not ready');
    expect(service.request).not.toHaveBeenCalled();
  });

  it('fails explicitly when the workspace is not authorized', async () => {
    const service = createService(serviceStats([]));
    const read = createNativeUsageReader({ service, resolveWorkspaceScope: async () => null });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('The selected workspace is not authorized');
  });

  it('treats a null accounts report as unavailable rather than empty success', async () => {
    const stats = serviceStats(null);
    stats.accounts = { reports: null, history: null };
    const service = createService(stats);
    const read = createNativeUsageReader({ service, resolveWorkspaceScope });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('Native usage reports are unavailable');
  });

  it('fails explicitly when the agent response does not match the contract', async () => {
    const service = createService({ nonsense: true });
    const read = createNativeUsageReader({ service, resolveWorkspaceScope });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['anthropic'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('The native usage report is invalid');
  });
});

describe('native provider coverage map', () => {
  it('covers exactly the providers whose scrapers were removed', () => {
    expect(Object.keys(NATIVE_QUOTA_PROVIDERS).sort()).toEqual([
      'claude', 'cline-pass', 'codex', 'cursor', 'github-copilot', 'github-copilot-addon',
      'hyper', 'minimax-coding-plan', 'xai', 'zai-coding-plan',
    ].sort());
    expect(NATIVE_QUOTA_PROVIDERS.claude.providers).toEqual(['anthropic']);
    expect(NATIVE_QUOTA_PROVIDERS.codex.providers).toEqual(['openai-codex']);
    expect(NATIVE_QUOTA_PROVIDERS.hyper.providers).toEqual(['charm-hyper']);
    expect(NATIVE_QUOTA_PROVIDERS['zai-coding-plan'].providers).toEqual(['zai']);
    expect(NATIVE_QUOTA_PROVIDERS['minimax-coding-plan'].providers).toEqual(['minimax-code']);
    expect(NATIVE_QUOTA_PROVIDERS.xai.providers).toEqual(['xai-oauth']);
  });
});

describe('window key collisions', () => {
  it('keeps same-duration windows of different units instead of overwriting them', () => {
    const result = nativeReportsToProviderResult(
      [report({
        provider: 'zai',
        limits: [
          limit({ id: 'zai:tokens:5h', provider: 'zai', used: 100, total: 1000, unit: 'tokens' }),
          limit({ id: 'zai:requests:5h', provider: 'zai', used: 5, total: 100, unit: 'requests' }),
          limit({ id: 'zai:credits:5h', provider: 'zai', used: 50, total: 500, unit: 'credits' }),
        ],
      })],
      { providerId: 'zai-coding-plan', providerName: 'z.ai', nativeProviders: ['zai'] },
    );
    expect(result.ok).toBe(true);
    const keys = Object.keys(result.usage.windows);
    expect(keys).toHaveLength(3);
    const values = Object.values(result.usage.windows).map((window) => window.valueLabel ?? window.value?.kind);
    expect(values).toEqual(expect.arrayContaining(['100 / 1,000 tokens', '50 / 500 credits']));
    expect(Object.values(result.usage.windows).some((window) => window.value?.kind === 'requests')).toBe(true);
  });

  it('uses the unit-disambiguated key only when the plain label is taken', () => {
    const result = nativeReportsToProviderResult(
      [report({
        provider: 'zai',
        limits: [
          limit({ id: 'zai:tokens:5h', provider: 'zai', used: 100, total: 1000, unit: 'tokens' }),
          limit({ id: 'zai:credits:weekly', provider: 'zai', durationMs: 7 * 24 * 60 * 60 * 1000, used: 10, total: 100, unit: 'credits' }),
        ],
      })],
      { providerId: 'zai-coding-plan', providerName: 'z.ai', nativeProviders: ['zai'] },
    );
    expect(result.usage.windows['5h'].valueLabel).toBe('100 / 1,000 tokens');
    expect(result.usage.windows.weekly.valueLabel).toBe('10 / 100 credits');
  });

  it('keeps multi-account duplicate resolution stable regardless of report order', () => {
    const older = report({ fetchedAt: 1700000000000, limits: [limit({ usedFraction: 0.2 })] });
    const newer = report({ fetchedAt: 1700000002000, limits: [limit({ usedFraction: 0.9 })] });
    const forward = nativeReportsToProviderResult([older, newer], spec);
    const reverse = nativeReportsToProviderResult([newer, older], spec);
    expect(forward.usage.windows['5h'].usedPercent).toBeCloseTo(reverse.usage.windows['5h'].usedPercent);
    expect(forward.usage.windows['5h'].usedPercent).toBeCloseTo(90);
  });
});

describe('multi-provider read failures', () => {
  const statsFor = (reports) => ({
    range: { from: 1, to: 2 },
    sessions: 0, subagents: 0, prompts: 0, steps: 0,
    tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 },
    cost: 0,
    tools: { mode: 'none' },
    activeDays: 0, streak: 0, activity: [], providers: [], models: [],
    partial: false,
    accounts: { reports, history: null },
  });

  it('surfaces a partial failure instead of flattening it into an empty answer', async () => {
    let call = 0;
    const service = {
      getState: () => ({ phase: 'ready' }),
      request: async () => {
        call += 1;
        if (call === 1) return { ok: false, status: 500, json: async () => { throw new Error('none'); } };
        return { ok: true, status: 200, json: async () => statsFor([]) };
      },
    };
    const read = createNativeUsageReader({
      service,
      resolveWorkspaceScope: async (workspaceId) => ({ workspaceId, projectId: 'project_1' }),
    });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['alpha', 'beta'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('The Agent Service answered HTTP 500');
  });

  it('fails the whole read when one provider read fails even if another returns reports', async () => {
    let call = 0;
    const service = {
      getState: () => ({ phase: 'ready' }),
      request: async () => {
        call += 1;
        if (call === 1) return { ok: true, status: 200, json: async () => statsFor([report()]) };
        return { ok: false, status: 503, json: async () => ({}) };
      },
    };
    const read = createNativeUsageReader({
      service,
      resolveWorkspaceScope: async (workspaceId) => ({ workspaceId, projectId: 'project_1' }),
    });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['alpha', 'beta'] });
    expect(result.reports).toBeNull();
    expect(result.error).toBe('The Agent Service answered HTTP 503');
  });

  it('still returns complete reads without error when every provider answers', async () => {
    const service = {
      getState: () => ({ phase: 'ready' }),
      request: async () => ({ ok: true, status: 200, json: async () => statsFor([report()]) }),
    };
    const read = createNativeUsageReader({
      service,
      resolveWorkspaceScope: async (workspaceId) => ({ workspaceId, projectId: 'project_1' }),
    });
    const result = await read({ workspaceId: 'workspace_1', nativeProviders: ['alpha', 'beta'] });
    expect(result.error).toBeNull();
    expect(result.reports).toHaveLength(2);
  });
});
