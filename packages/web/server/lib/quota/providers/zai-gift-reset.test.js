import { afterEach, describe, expect, it, vi } from 'vitest';

const credential = { type: 'api_key', key: 'test-token' };

import { useZaiGiftReset } from './zai-gift-reset.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const mockResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

describe('Z.ai gift reset activation', () => {
  it('posts the activation request with a fresh requestId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      code: 200,
      msg: 'success',
      data: 462029,
      success: true,
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(useZaiGiftReset({ recordId: 462029, resetType: 'FIVE_HOUR', credential })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.z.ai/api/biz/customer-package-reset/use');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-token');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      targetType: 'PERSONAL',
      resetType: 'FIVE_HOUR',
      recordId: 462029,
    });
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('projects only the safe business code when activation is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 400, msg: 'reset already used', success: false }),
    }));

    await expect(useZaiGiftReset({ recordId: 1, resetType: 'WEEK', credential })).rejects.toThrow('API error: 400');
  });

  it('rejects an invalid reset type before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(useZaiGiftReset({ recordId: 1, resetType: 'FOREVER', credential })).rejects.toThrow('Invalid gift reset request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects activation without a configured credential before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(useZaiGiftReset({ recordId: 1, resetType: 'WEEK', credential: null })).rejects.toThrow('Not configured');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { listZaiGiftResets, attachZaiGiftResets } from './zai-gift-reset.js';

describe('z.ai gift reset discovery', () => {
  const futureExpire = () => {
    const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  };

  it('lists available gift resets and picks the earliest expiring record per type', async () => {
    const expireTime = futureExpire();
    const fetchMock = vi.fn().mockResolvedValue(mockResponse({
      success: true,
      data: {
        fiveHourResets: [
          { available: true, recordId: 462029, expireTime },
          { available: false, recordId: 1, expireTime },
        ],
        weekResets: [{ available: true, recordId: 777, expireTime }],
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const list = await listZaiGiftResets({ credential });
    expect(list.fiveHour).toMatchObject({ recordId: 462029 });
    expect(list.weekly).toMatchObject({ recordId: 777 });
    expect(list.fiveHour.expireAt).toBeGreaterThan(Date.now());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL');
    expect(init.headers.Authorization).toBe('Bearer test-token');
  });

  it('reads no gift when the list is empty, the request fails, or the credential is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ success: true, data: { fiveHourResets: [], weekResets: [] } })));
    const empty = await listZaiGiftResets({ credential });
    expect(empty.fiveHour).toBeNull();
    expect(empty.weekly).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    expect(await listZaiGiftResets({ credential })).toBeNull();

    expect(await listZaiGiftResets({ credential: null })).toBeNull();
  });

  it('skips unavailable, expired and malformed records', async () => {
    const past = '2020-01-01 00:00:00';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      success: true,
      data: {
        fiveHourResets: [
          { available: true, recordId: 5, expireTime: past },
          { available: true, recordId: 'bad', expireTime: futureExpire() },
          { available: true, recordId: 9, expireTime: 'not a date' },
        ],
      },
    })));
    const list = await listZaiGiftResets({ credential });
    expect(list.fiveHour).toBeNull();
  });

  it('rejects fractional, zero and negative record ids in the list parse', async () => {
    const expireTime = futureExpire();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({
      success: true,
      data: {
        fiveHourResets: [
          { available: true, recordId: 1.5, expireTime },
          { available: true, recordId: 0, expireTime },
          { available: true, recordId: -5, expireTime },
        ],
      },
    })));
    const list = await listZaiGiftResets({ credential });
    expect(list.fiveHour).toBeNull();
  });

  it('rejects a fractional record id before any activation request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(useZaiGiftReset({ recordId: 1.5, resetType: 'FIVE_HOUR', credential })).rejects.toThrow('Invalid gift reset request');
    await expect(useZaiGiftReset({ recordId: 0, resetType: 'FIVE_HOUR', credential })).rejects.toThrow('Invalid gift reset request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stamps the five-hour gift on the token window deterministically regardless of insertion order', () => {
    const tokenFirst = {
      '5h': { windowSeconds: 5 * 60 * 60, valueLabel: '100 / 1,000 tokens' },
      '5h-requests': { windowSeconds: 5 * 60 * 60 },
      '5h-credits': { windowSeconds: 5 * 60 * 60, valueLabel: '50 / 500 credits' },
    };
    const tokenLast = {
      '5h-requests': { windowSeconds: 5 * 60 * 60 },
      '5h-credits': { windowSeconds: 5 * 60 * 60, valueLabel: '50 / 500 credits' },
      '5h': { windowSeconds: 5 * 60 * 60, valueLabel: '100 / 1,000 tokens' },
    };
    const gift = { fiveHour: { recordId: 1, expireAt: Date.now() + 1000 }, weekly: null };
    attachZaiGiftResets(tokenFirst, gift);
    attachZaiGiftResets(tokenLast, gift);
    expect(tokenFirst['5h'].giftReset?.recordId).toBe(1);
    expect(tokenFirst['5h-requests'].giftReset).toBeUndefined();
    expect(tokenFirst['5h-credits'].giftReset).toBeUndefined();
    expect(tokenLast['5h'].giftReset?.recordId).toBe(1);
    expect(tokenLast['5h-requests'].giftReset).toBeUndefined();
    expect(tokenLast['5h-credits'].giftReset).toBeUndefined();
  });

  it('attaches one gift per type even when several windows share the duration', () => {
    const windows = {
      '5h': { windowSeconds: 5 * 60 * 60 },
      '5h-requests': { windowSeconds: 5 * 60 * 60 },
      '5h-credits': { windowSeconds: 5 * 60 * 60 },
    };
    attachZaiGiftResets(windows, {
      fiveHour: { recordId: 1, expireAt: Date.now() + 1000 },
      weekly: null,
    });
    const stamped = Object.values(windows).filter((window) => window.giftReset !== undefined);
    expect(stamped).toHaveLength(1);
  });

  it('attaches gifts to windows by their duration', () => {
    const windows = {
      '5h': { windowSeconds: 5 * 60 * 60 },
      weekly: { windowSeconds: 7 * 24 * 60 * 60 },
      '30d': { windowSeconds: 30 * 24 * 60 * 60 },
    };
    attachZaiGiftResets(windows, {
      fiveHour: { recordId: 1, expireAt: Date.now() + 1000 },
      weekly: { recordId: 2, expireAt: Date.now() + 2000 },
    });
    expect(windows['5h'].giftReset.recordId).toBe(1);
    expect(windows.weekly.giftReset.recordId).toBe(2);
    expect(windows['30d'].giftReset).toBeUndefined();
  });
});
