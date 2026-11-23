import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const credential = vi.fn();


import { fetchQuota as fetchSelectedQuota, isConfigured, resetClaudeQuotaCache } from './index.js';
const fetchQuota = () => fetchSelectedQuota({ credential: credential() });

const CREDENTIAL = {
  type: 'oauth',
  access: 'access-a',
  refresh: 'refresh-a',
  expires: Date.now() + 3_600_000,
};

const PAYLOAD = {
  limits: [
    { kind: 'session', percent: 5, resets_at: '2026-08-14T19:10:00Z', scope: null },
    { kind: 'weekly_all', percent: 4, resets_at: '2026-08-20T15:00:00Z', scope: null },
  ],
};

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
});

const realTimeout = AbortSignal.timeout.bind(AbortSignal);
const hangingFetch = () => vi.fn((_url, init) => new Promise((_resolve, reject) => {
  init.signal.addEventListener('abort', () => reject(init.signal.reason));
}));

const errorResponse = (status, headers = {}) => ({
  ok: false,
  status,
  headers: new Headers(headers),
  json: async () => ({}),
});

beforeEach(() => {
  resetClaudeQuotaCache();
  credential.mockReturnValue(CREDENTIAL);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Claude quota provider', () => {
  it('reports not configured when no credential source has a token', async () => {
    credential.mockReturnValue(null);

    expect(isConfigured({})).toBe(false);
    const result = await fetchQuota();
    expect(result.configured).toBe(false);
    expect(result.ok).toBe(false);
    expect(result.usage).toBeNull();
  });

  it('returns quota windows without inventing native plan metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(PAYLOAD)));

    const result = await fetchQuota();

    expect(result.ok).toBe(true);
    expect(result.planLabel).toBeUndefined();
    expect(result.usage.windows['5h'].usedPercent).toBe(5);
  });

  it('coalesces concurrent refreshes into one Anthropic request', async () => {
    let resolveResponse;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => {
      resolveResponse = resolve;
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = fetchQuota();
    const second = fetchQuota();
    resolveResponse(jsonResponse(PAYLOAD));

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResult.ok).toBe(true);
    expect(secondResult.ok).toBe(true);
  });

  it('keeps serving the last good values while Anthropic rate limits', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(PAYLOAD))
      .mockResolvedValueOnce(errorResponse(429, { 'retry-after': '120' }));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuota();
    const rateLimited = await fetchQuota();

    expect(rateLimited.ok).toBe(true);
    expect(rateLimited.usage.windows['5h'].usedPercent).toBe(5);
  });

  it('does not call Anthropic again while the rate-limit cooldown is active', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(PAYLOAD))
      .mockResolvedValueOnce(errorResponse(429));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuota();
    await fetchQuota();
    await fetchQuota();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks Anthropic again on the next refresh after Retry-After: 0', async () => {
    const fresh = { limits: [{ kind: 'session', percent: 40, resets_at: '2026-08-14T19:10:00Z', scope: null }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(PAYLOAD))
      .mockResolvedValueOnce(errorResponse(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(fresh));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuota();
    const rateLimited = await fetchQuota();
    const next = await fetchQuota();

    expect(rateLimited.usage.windows['5h'].usedPercent).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(next.usage.windows['5h'].usedPercent).toBe(40);
  });

  it('never shows one account cached values after the credential changes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(PAYLOAD))
      .mockResolvedValueOnce(errorResponse(429));
    vi.stubGlobal('fetch', fetchMock);

    await fetchQuota();
    credential.mockReturnValue({ ...CREDENTIAL, access: 'access-b', refresh: 'refresh-b' });
    const afterSwitch = await fetchQuota();

    expect(afterSwitch.ok).toBe(false);
    expect(afterSwitch.usage).toBeNull();
  });

  it('explains an expired session instead of reporting a bare 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(401)));

    const result = await fetchQuota();

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.error).toContain('Claude Code');
  });

  it('tells a token without usage access apart from an expired session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errorResponse(403)));

    const result = await fetchQuota();

    expect(result.ok).toBe(false);
    expect(result.configured).toBe(true);
    expect(result.error).not.toContain('expired');
    expect(result.error).toContain('claude setup-token');
  });

  it('surfaces a network failure instead of an empty successful result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));

    const result = await fetchQuota();

    expect(result.ok).toBe(false);
    expect(result.usage).toBeNull();
    expect(result.error).toBe('Request failed');
  });
  it('gives up on a usage request Anthropic never answers, and the next refresh asks again', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
    const fetchMock = hangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    try {
      const result = await fetchQuota();

      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(result.ok).toBe(false);
      expect(result.configured).toBe(true);
      expect(result.error).toBe('Request timed out');

      await fetchQuota();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      timeout.mockRestore();
    }
  });
});
