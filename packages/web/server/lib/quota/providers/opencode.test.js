import { describe, expect, it } from 'vitest';
import { buildUnconfiguredQuotaResult } from './index.js';
import { fetchQuota, isConfigured } from './opencode.js';

describe('opencode zen quota provider', () => {
  it('is published in the provider registry so the Usage page can read it', () => {
    const result = buildUnconfiguredQuotaResult('opencode');
    expect(result).toMatchObject({ providerId: 'opencode', configured: false });
  });

  it('reports an unconfigured selection without calling the console API', async () => {
    let calls = 0;
    const fetchImpl = async () => { calls += 1; throw new Error('should not be called'); };
    const result = await fetchQuota({ credential: { type: 'api_key', key: '' }, fetchImpl });
    expect(calls).toBe(0);
    expect(result).toMatchObject({ ok: false, configured: false });
  });

  it('reads windows and models through the selected api key', async () => {
    const fetchImpl = async (url) => {
      const path = new URL(url).pathname + new URL(url).search;
      if (path.startsWith('/console/api/usage/summary')) return Response.json({ totalRequests: 2 });
      if (path.startsWith('/console/api/usage/models')) return Response.json({ items: [], pageInfo: { pageCount: 1 } });
      return Response.json({ serviceAccounts: [] });
    };
    const result = await fetchQuota({ credential: { type: 'api_key', key: 'zen-key' }, fetchImpl });
    expect(result.ok).toBe(true);
    expect(result.configured).toBe(true);
    expect(result.usage?.windows?.daily?.value).toEqual({ kind: 'requests', count: 2 });
  });

  it('treats an OAuth selection without a console organization id as configured but unreadable', async () => {
    expect(isConfigured({ type: 'oauth', access: 'token', refresh: 'r', expires: 1 })).toBe(true);
    const result = await fetchQuota({ credential: { type: 'oauth', access: 'token', refresh: 'r', expires: 1 }, fetchImpl: async () => { throw new Error('no'); } });
    expect(result).toMatchObject({ ok: false, configured: true });
  });
});
