import { describe, expect, it, vi } from 'vitest';
import { fetchOpenCodeGoUsage, fetchQuota, isConfigured, parseOpenCodeGoUsage } from './opencode-go.js';

const credential = { type: 'api_key', key: 'selected-key' };
const resetsAt = '2026-10-01T00:00:00.000Z';
const payload = { usage: { rolling: { percent: 25, resetsAt }, weekly: { percent: 40, resetsAt }, monthly: { percent: 60, resetsAt } } };

describe('selected native OpenCode Go quota', () => {
  it('parses every API-key window with numeric resets', () => {
    const windows = parseOpenCodeGoUsage(payload);
    expect(Object.keys(windows)).toEqual(['5h', 'weekly', 'monthly']);
    expect(windows['5h'].usedPercent).toBe(25);
    expect(windows.weekly.usedPercent).toBe(40);
    expect(windows.monthly.usedPercent).toBe(60);
    for (const window of Object.values(windows)) expect(window.resetAt).toBe(Date.parse(resetsAt));
  });
  it('preserves valid siblings when another window is malformed', () => {
    const windows = parseOpenCodeGoUsage({ usage: { rolling: { percent: 25, resetsAt: 'invalid' }, weekly: { percent: 40, resetsAt }, monthly: { percent: 60, resetsAt: null } } });
    expect(Object.keys(windows)).toEqual(['weekly']);
    expect(windows.weekly.resetAt).toBe(Date.parse(resetsAt));
    expect(parseOpenCodeGoUsage(null)).toEqual({});
  });
  it('requests the fixed Go endpoint with the selected key in headers only', async () => {
    const fetchImpl = vi.fn(async (_url, options) => {
      expect(options.headers.Authorization).toBe('Bearer selected-key');
      expect(options.headers.Cookie).toBeUndefined();
      expect(options.signal).toBeInstanceOf(AbortSignal);
      return Response.json(payload);
    });
    const result = await fetchQuota({ credential, fetchImpl });
    expect(result.ok).toBe(true);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://opencode.ai/zen/go/v1/usage');
    expect(JSON.stringify(result)).not.toContain('selected-key');
  });
  it.each([null, {}, { 'opencode-go': { key: 'legacy-key' } }])('does not search an absent or legacy credential map %j', async (credential) => {
    const fetchImpl = vi.fn();
    expect(isConfigured(credential)).toBe(false);
    expect((await fetchQuota({ credential, fetchImpl })).configured).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('reports native OAuth unsupported without inventing Console ownership fields', async () => {
    const oauth = { type: 'oauth', access: 'selected-access', refresh: 'selected-refresh', expires: Date.now() + 3600000 };
    const fetchImpl = vi.fn();
    const result = await fetchQuota({ credential: oauth, fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'Selected native OAuth credential is unsupported for OpenCode Go quota' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(/selected-access|selected-refresh/);
  });
  it.each([401, 502])('never projects failure response text for HTTP %s', async (status) => {
    const result = await fetchQuota({ credential, fetchImpl: async () => new Response('selected-key', { status }) });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'Request failed' });
    expect(JSON.stringify(result)).not.toContain('selected-key');
  });
  it('never projects exception text that echoes a key', async () => {
    const result = await fetchQuota({ credential, fetchImpl: async () => { throw new Error('selected-key'); } });
    expect(result.error).toBe('Request failed');
  });
  it('normalizes authentication failures without response body text', async () => {
    await expect(fetchOpenCodeGoUsage('selected-key', async () => new Response('selected-key', { status: 403 }))).rejects.toThrow('OpenCode Go authentication failed');
  });
});
