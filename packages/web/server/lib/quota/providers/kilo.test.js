import { describe, expect, it } from 'vitest';
import { fetchQuota, isConfigured } from './kilo.js';

const credential = { type: 'api_key', key: 'test-token' };
const readOpencodeConfig = () => ({});

describe('Kilo Code quota provider', () => {
  it('builds credits_balance from the documented balance payload', async () => {
    let requests = 0;
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async (url, options) => {
      requests += 1;
      expect(url).toBe('https://api.kilo.ai/api/profile/balance');
      expect(options.method).toBe('GET');
      const headers = new Headers(options.headers);
      expect(headers.get('Authorization')).toBe('Bearer test-token');
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('x-kilocode-organizationid')).toBeNull();
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ balance: 12.5 });
    } });

    expect(requests).toBe(1);
    expect(result.ok).toBe(true);
    expect(result.providerId).toBe('kilo');
    expect(result.configured).toBe(true);
    expect(result.usage.windows.credits_balance.valueLabel).toBe('$12.50');
    expect(result.usage.windows.credits_balance.usedPercent).toBeNull();
    expect(result.usage.windows.credits_balance.windowSeconds).toBeNull();
    expect(result.usage.windows.credits_balance.resetAt).toBeNull();
    expect(JSON.stringify(result)).not.toContain('test-token');
  });

  it.each([
    [0, '$0.00'],
    ['0', '$0.00'],
    [100, '$100.00'],
    ['3.5', '$3.50']
  ])('accepts finite balance %s', async (balance, label) => {
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async () => Response.json({ balance }) });

    expect(result.ok).toBe(true);
    expect(result.usage.windows.credits_balance.valueLabel).toBe(label);
  });

  it.each([
    {}, null, [], { balance: '' }, { balance: ' \t ' }, { balance: 'NaN' },
    { balance: 'Infinity' }, { balance: null }, { balance: true }, { balance: [] },
    { balance: {} }
  ])('rejects invalid payload %j instead of showing zero', async (payload) => {
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async () => Response.json(payload) });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.error).toBe('No quota data in response');
    expect(result.usage).toBeNull();
  });

  it.each([
    { type: 'api_key', key: 'test-token' },
    { type: 'oauth', access: 'test-token', refresh: 'refresh', expires: Date.now() + 3600000 },
  ])('uses a validated credential for the documented request', async (auth) => {
    expect(isConfigured(auth)).toBe(true);
    let requests = 0;
    const result = await fetchQuota({ credential: auth, readOpencodeConfig,
    fetchImpl: async (_url, options) => {
      requests += 1;
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
      return Response.json({ balance: 1 });
    } });

    expect(requests).toBe(1);
    expect(result.ok).toBe(true);
  });

  it.each([{}, { type: 'api_key', key: '' }, { type: 'api_key', key: '  ' }, { type: 'api_key', key: 42 }, { kilo: { key: 'test-token' } }])(
    'does not request usage without a valid credential',
    async (auth) => {
      expect(isConfigured(auth)).toBe(false);
      let requests = 0;
      const result = await fetchQuota({ credential: auth, readOpencodeConfig,
      fetchImpl: async () => {
        requests += 1;
        return Response.json({ balance: 1 });
      } });

      expect(requests).toBe(0);
      expect(result.ok).toBe(false);
      expect(result.configured).toBe(false);
      expect(result.error).toBe('Not configured');
    },
  );

  it('does not invent an organization for the selected native API key', async () => {
    const result = await fetchQuota({ credential: { type: 'api_key', key: 'test-token' },
    fetchImpl: async (_url, options) => {
      expect(new Headers(options.headers).get('x-kilocode-organizationid')).toBeNull();
      return Response.json({ balance: 4 });
    } });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('org-123');
  });

  it('uses exact native OAuth without inventing account metadata', async () => {
    const result = await fetchQuota({ credential: { type: 'oauth', access: 'test-token', refresh: 'refresh', expires: Date.now() + 3600000 },
    fetchImpl: async (_url, options) => {
      expect(new Headers(options.headers).get('x-kilocode-organizationid')).toBeNull();
      return Response.json({ balance: 4 });
    } });

    expect(result.ok).toBe(true);
  });

  it('does not recover an organization from legacy provider options', async () => {
    const result = await fetchQuota({ credential, readOpencodeConfig: () => { throw new Error('Legacy config must not be read'); },
    fetchImpl: async (_url, options) => {
      expect(new Headers(options.headers).get('x-kilocode-organizationid')).toBeNull();
      return Response.json({ balance: 4 });
    } });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain('config-org');
  });

  it.each([
    [401, 'Session expired — please re-authenticate with Kilo Code'],
    [403, 'Session expired — please re-authenticate with Kilo Code'],
    [429, 'API error: 429'],
    [500, 'API error: 500']
  ])('reports HTTP %s as a failure', async (status, error) => {
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async () => new Response(null, { status }) });

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.error).toBe(error);
    expect(result.usage).toBeNull();
  });

  it('reports invalid JSON as a parse failure', async () => {
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async () => new Response('{') });
    expect(result.error).toBe('Invalid response from provider');
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.usage).toBeNull();
  });

  it.each([
    [new DOMException('Timed out', 'TimeoutError'), 'Request timed out'],
    [new Error('Network unavailable test-token'), 'Request failed']
  ])('reports request failure', async (failure, message) => {
    const result = await fetchQuota({ credential, readOpencodeConfig,
    fetchImpl: async () => { throw failure; } });
    expect(result.error).toBe(message);
    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.usage).toBeNull();
  });
});
