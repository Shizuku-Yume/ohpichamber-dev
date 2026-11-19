import { describe, expect, it, vi } from 'vitest';
import { fetchOpenCodeGoUsage, fetchQuota, isConfigured, parseOpenCodeGoUsage } from './opencode-go.js';

const credential = { type: 'api_key', key: 'selected-key' };
const resetsAt = '2026-10-01T00:00:00.000Z';
const payload = { usage: { rolling: { percent: 25, resetsAt }, weekly: { percent: 40, resetsAt }, monthly: { percent: 60, resetsAt } } };

<<<<<<< HEAD
describe('selected native OpenCode Go quota', () => {
  it('parses every API-key window with numeric resets', () => {
    const windows = parseOpenCodeGoUsage(payload);
||||||| bc50ba56aa
import {
  fetchConsoleBillingBalance,
  fetchConsoleGoUsage,
  fetchOpenCodeGoUsage,
  fetchQuota,
  isConfigured,
  parseConsoleBillingBalance,
  parseConsoleGoUsage,
  parseOpenCodeGoUsage,
} from './opencode-go.js';

const apiKeyAuth = () => ({ 'opencode-go': { key: 'test-key' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (previousDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDirectory;
  fs.rmSync(temporaryDataDirectory, { recursive: true, force: true });
});

const CONSOLE_SERVER = 'https://opencode.ai/console';
const CONSOLE_STATUS_URL = `${CONSOLE_SERVER}/api/go/status`;
const CONSOLE_BILLING_STATUS_URL = `${CONSOLE_SERVER}/api/billing/status`;

const consoleAuth = (overrides = {}) => ({
  opencode: {
    type: 'oauth',
    access: 'console-access',
    refresh: 'console-refresh',
    expires: Date.now() + 3_600_000,
    server: CONSOLE_SERVER,
    orgID: 'org_TESTORG123',
    ...overrides,
  },
});

const consolePayload = ({ product = 'go', meters } = {}) => ({
  product,
  access: {
    meters: meters ?? {
      fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000000000', usedMicroCents: '250000000' },
      week: { resetsAt: '2026-08-19T12:00:00.000Z', limitMicroCents: '2000000000', usedMicroCents: '800000000' },
      month: { resetsAt: '2026-09-01T00:00:00.000Z', limitMicroCents: '6000000000', usedMicroCents: '3000000000' },
    },
  },
});

describe('OpenCode Go quota provider — legacy API key', () => {
  it('parses partial API usage windows', () => {
    const windows = parseOpenCodeGoUsage({ usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' }, weekly: { percent: 40, resetsAt: '2026-08-19T12:00:00.000Z' } } });
    expect(windows['5h'].usedPercent).toBe(25);
    expect(windows['5h'].resetAt).toBe(Date.parse('2026-08-12T12:00:00.000Z'));
    expect(windows.weekly.usedPercent).toBe(40);
    expect(windows.monthly).toBeUndefined();
  });

  it('returns numeric reset timestamps for all usage windows', async () => {
    const resetsAt = '2026-10-01T00:00:00.000Z';
    const windows = await fetchOpenCodeGoUsage('test-key', async () => new Response(JSON.stringify({
      usage: {
        rolling: { percent: 25, resetsAt },
        weekly: { percent: 40, resetsAt },
        monthly: { percent: 60, resetsAt },
      },
    })));
    expect(Object.keys(windows)).toEqual(['5h', 'weekly', 'monthly']);
    for (const window of Object.values(windows)) {
      expect(window.resetAt).toBe(Date.parse(resetsAt));
    }
  });

  it('preserves valid windows when another reset date is invalid', () => {
    const windows = parseOpenCodeGoUsage({ usage: {
      rolling: { percent: 25, resetsAt: 'invalid' },
      weekly: { percent: 40, resetsAt: '2026-08-19T12:00:00.000Z' },
      monthly: { percent: 60, resetsAt: null },
    } });
    expect(Object.keys(windows)).toEqual(['weekly']);
    expect(windows.weekly.resetAt).toBe(Date.parse('2026-08-19T12:00:00.000Z'));
  });

  it('does not expose credentials in authentication errors', async () => {
    await expect(fetchOpenCodeGoUsage('secret', async () => new Response('', { status: 403 }))).rejects.toThrow('authentication failed');
  });

  it('uses the Go usage API with bearer authentication', async () => {
    let request;
    const usage = await fetchOpenCodeGoUsage('secret', async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' } } }));
    });
    expect(request.url).toBe('https://opencode.ai/zen/go/v1/usage');
    expect(request.options.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer secret',
      'x-opencode-session': 'openchamber-usage',
    });
    expect(request.options.headers.Cookie).toBeUndefined();
    expect(usage['5h'].usedPercent).toBe(25);
  });

  it('reads the API key from the OpenCode auth file', async () => {
    const legacyPath = path.join(temporaryDataDirectory, 'quota', 'opencode-go.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, '{not valid json', { mode: 0o600 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth() });
    expect(result).toMatchObject({ providerId: 'opencode-go', ok: true, configured: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  // #5278: the usage API floors its percent, so 17.657% came back as 17 while
  // the Console page showed 18.
  it('reads the exact Console meters with an API key, without an organization', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload({ meters: {
      fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '43690' },
      week: { resetsAt: '2026-08-19T12:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '176570' },
      month: { resetsAt: '2026-09-01T00:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '268960' },
    } }))));
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(CONSOLE_STATUS_URL);
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(options.headers['x-org-id']).toBeUndefined();
    expect(options.redirect).toBe('error');
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(4.369);
    expect(result.usage.windows.weekly.usedPercent).toBeCloseTo(17.657);
    expect(result.usage.windows.monthly.usedPercent).toBeCloseTo(26.896);
  });

  it('falls back to the usage API when the Console status gives the key no Go meters', async () => {
    const usage = { usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' } } };
    const consoleAnswers = [
      async () => new Response('{}', { status: 403 }),
      async () => new Response(JSON.stringify(consolePayload({ product: null }))),
      async () => new Response(JSON.stringify(consolePayload({ meters: {} }))),
      async () => { throw new TypeError('fetch failed'); },
    ];
    for (const consoleAnswer of consoleAnswers) {
      const fetchImpl = vi.fn(async (url) => (url === CONSOLE_STATUS_URL ? consoleAnswer() : new Response(JSON.stringify(usage))));
      const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
      expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([CONSOLE_STATUS_URL, 'https://opencode.ai/zen/go/v1/usage']);
      expect(result.ok).toBe(true);
      expect(result.usage.windows['5h'].usedPercent).toBe(25);
    }
  });

  it('still uses the API-key path when the Console integration is not a Console sign-in', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    const result = await fetchQuota({
      readAuth: async () => ({
        ...consoleAuth({ server: 'https://example.com/console' }),
        'opencode-go': { key: 'test-key' },
      }),
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  // OpenCode binds OpenCode Go to the Console's `opencode` integration when the
  // key's workspace has Go, and Providers lists that key under OpenCode Go.
  it('reads an API key stored on the Console integration when OpenCode Go has none', async () => {
    const auth = { opencode: { type: 'api', key: 'console-key' } };
    expect(isConfigured(auth)).toBe(true);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    const result = await fetchQuota({ readAuth: async () => auth, fetchImpl });
    expect(result).toMatchObject({ providerId: 'opencode-go', ok: true, configured: true });
    expect(fetchImpl.mock.calls[0][0]).toBe(CONSOLE_STATUS_URL);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer console-key');
  });

  it('prefers the OpenCode Go key over a key on the Console integration', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' }, ...apiKeyAuth() }), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  it('reports an absent subscription when the Console key has no Go', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'error', error: { type: 'EntitlementError' } }), { status: 403 }));
    const result = await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' } }), fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'No active OpenCode Go subscription on the selected Console account' });
  });

  it('names an expired key and the sign-in that replaces it', async () => {
    const expired = { error: { type: 'authentication_error', code: 'api_key_expired', message: 'This API key has expired.' } };
    for (const auth of [apiKeyAuth(), { opencode: { type: 'api', key: 'console-key' } }]) {
      const result = await fetchQuota({ readAuth: async () => auth, fetchImpl: async () => new Response(JSON.stringify(expired), { status: 401 }) });
      expect(result).toMatchObject({ ok: false, configured: true, error: 'OpenCode Go key expired. Connect an OpenCode Console account on the OpenCode card in Providers.' });
    }
  });

  it('keeps a 401 without the expired-key code an authentication failure', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: { type: 'AuthError', message: 'Unauthorized' } }), { status: 401 });
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
    expect(result.error).toBe('OpenCode Go authentication failed');
  });

  it('reports a rejected Console key as an authentication failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const result = await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' } }), fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'OpenCode Go authentication failed' });
  });
});

describe('OpenCode Go quota provider — Console OAuth', () => {
  it('maps fiveHour, week, and month to the existing windows from decimal strings', () => {
    const windows = parseConsoleGoUsage(consolePayload());
=======
import {
  fetchConsoleBillingBalance,
  fetchConsoleGoUsage,
  fetchOpenCodeGoUsage,
  fetchQuota,
  isConfigured,
  parseConsoleBillingBalance,
  parseConsoleGoUsage,
  parseOpenCodeGoUsage,
} from './opencode-go.js';

const apiKeyAuth = () => ({ 'opencode-go': { key: 'test-key' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  if (previousDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = previousDataDirectory;
  fs.rmSync(temporaryDataDirectory, { recursive: true, force: true });
});

const CONSOLE_SERVER = 'https://opencode.ai/console';
const CONSOLE_STATUS_URL = `${CONSOLE_SERVER}/api/go/status`;
const CONSOLE_BILLING_STATUS_URL = `${CONSOLE_SERVER}/api/billing/status`;

const consoleAuth = (overrides = {}) => ({
  opencode: {
    type: 'oauth',
    access: 'console-access',
    refresh: 'console-refresh',
    expires: Date.now() + 3_600_000,
    server: CONSOLE_SERVER,
    orgID: 'org_TESTORG123',
    ...overrides,
  },
});

const consolePayload = ({ product = 'go', meters } = {}) => ({
  product,
  access: {
    meters: meters ?? {
      fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000000000', usedMicroCents: '250000000' },
      week: { resetsAt: '2026-08-19T12:00:00.000Z', limitMicroCents: '2000000000', usedMicroCents: '800000000' },
      month: { resetsAt: '2026-09-01T00:00:00.000Z', limitMicroCents: '6000000000', usedMicroCents: '3000000000' },
    },
  },
});

describe('OpenCode Go quota provider — legacy API key', () => {
  it('parses partial API usage windows', () => {
    const windows = parseOpenCodeGoUsage({ usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' }, weekly: { percent: 40, resetsAt: '2026-08-19T12:00:00.000Z' } } });
    expect(windows['5h'].usedPercent).toBe(25);
    expect(windows['5h'].resetAt).toBe(Date.parse('2026-08-12T12:00:00.000Z'));
    expect(windows.weekly.usedPercent).toBe(40);
    expect(windows.monthly).toBeUndefined();
  });

  it('returns numeric reset timestamps for all usage windows', async () => {
    const resetsAt = '2026-10-01T00:00:00.000Z';
    const windows = await fetchOpenCodeGoUsage('test-key', async () => new Response(JSON.stringify({
      usage: {
        rolling: { percent: 25, resetsAt },
        weekly: { percent: 40, resetsAt },
        monthly: { percent: 60, resetsAt },
      },
    })));
    expect(Object.keys(windows)).toEqual(['5h', 'weekly', 'monthly']);
    for (const window of Object.values(windows)) {
      expect(window.resetAt).toBe(Date.parse(resetsAt));
    }
  });

  it('preserves valid windows when another reset date is invalid', () => {
    const windows = parseOpenCodeGoUsage({ usage: {
      rolling: { percent: 25, resetsAt: 'invalid' },
      weekly: { percent: 40, resetsAt: '2026-08-19T12:00:00.000Z' },
      monthly: { percent: 60, resetsAt: null },
    } });
    expect(Object.keys(windows)).toEqual(['weekly']);
    expect(windows.weekly.resetAt).toBe(Date.parse('2026-08-19T12:00:00.000Z'));
  });

  it('uses the Go usage API with bearer authentication', async () => {
    let request;
    const usage = await fetchOpenCodeGoUsage('secret', async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' } } }));
    });
    expect(request.url).toBe('https://opencode.ai/zen/go/v1/usage');
    expect(request.options.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer secret',
      'x-opencode-session': 'openchamber-usage',
    });
    expect(request.options.headers.Cookie).toBeUndefined();
    expect(usage['5h'].usedPercent).toBe(25);
  });

  it('reads the API key from the OpenCode auth file', async () => {
    const legacyPath = path.join(temporaryDataDirectory, 'quota', 'opencode-go.json');
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, '{not valid json', { mode: 0o600 });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth() });
    expect(result).toMatchObject({ providerId: 'opencode-go', ok: true, configured: true });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
    expect(fs.existsSync(legacyPath)).toBe(false);
  });

  // #5278: the usage API floors its percent, so 17.657% came back as 17 while
  // the Console page showed 18.
  it('reads the exact Console meters with an API key, without an organization', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload({ meters: {
      fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '43690' },
      week: { resetsAt: '2026-08-19T12:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '176570' },
      month: { resetsAt: '2026-09-01T00:00:00.000Z', limitMicroCents: '1000000', usedMicroCents: '268960' },
    } }))));
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(CONSOLE_STATUS_URL);
    expect(options.headers.Authorization).toBe('Bearer test-key');
    expect(options.headers['x-org-id']).toBeUndefined();
    expect(options.redirect).toBe('error');
    expect(result.ok).toBe(true);
    expect(result.usage.windows['5h'].usedPercent).toBeCloseTo(4.369);
    expect(result.usage.windows.weekly.usedPercent).toBeCloseTo(17.657);
    expect(result.usage.windows.monthly.usedPercent).toBeCloseTo(26.896);
  });

  it('falls back to the usage API when the Console status gives the key no Go meters', async () => {
    const usage = { usage: { rolling: { percent: 25, resetsAt: '2026-08-12T12:00:00.000Z' } } };
    const consoleAnswers = [
      async () => new Response('{}', { status: 403 }),
      async () => new Response(JSON.stringify(consolePayload({ product: null }))),
      async () => new Response(JSON.stringify(consolePayload({ meters: {} }))),
      async () => { throw new TypeError('fetch failed'); },
    ];
    for (const consoleAnswer of consoleAnswers) {
      const fetchImpl = vi.fn(async (url) => (url === CONSOLE_STATUS_URL ? consoleAnswer() : new Response(JSON.stringify(usage))));
      const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
      expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([CONSOLE_STATUS_URL, 'https://opencode.ai/zen/go/v1/usage']);
      expect(result.ok).toBe(true);
      expect(result.usage.windows['5h'].usedPercent).toBe(25);
    }
  });

  it('still uses the API-key path when the Console integration is not a Console sign-in', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    const result = await fetchQuota({
      readAuth: async () => ({
        ...consoleAuth({ server: 'https://example.com/console' }),
        'opencode-go': { key: 'test-key' },
      }),
      fetchImpl,
    });
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  // OpenCode binds OpenCode Go to the Console's `opencode` integration when the
  // key's workspace has Go, and Providers lists that key under OpenCode Go.
  it('reads an API key stored on the Console integration when OpenCode Go has none', async () => {
    const auth = { opencode: { type: 'api', key: 'console-key' } };
    expect(isConfigured(auth)).toBe(true);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    const result = await fetchQuota({ readAuth: async () => auth, fetchImpl });
    expect(result).toMatchObject({ providerId: 'opencode-go', ok: true, configured: true });
    expect(fetchImpl.mock.calls[0][0]).toBe(CONSOLE_STATUS_URL);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer console-key');
  });

  it('prefers the OpenCode Go key over a key on the Console integration', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(consolePayload())));
    await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' }, ...apiKeyAuth() }), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
  });

  it('reports an absent subscription when the Console key has no Go', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'error', error: { type: 'EntitlementError' } }), { status: 403 }));
    const result = await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' } }), fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'No active OpenCode Go subscription on the selected Console account' });
  });

  it('names an expired key and the sign-in that replaces it', async () => {
    const expired = { error: { type: 'authentication_error', code: 'api_key_expired', message: 'This API key has expired.' } };
    for (const auth of [apiKeyAuth(), { opencode: { type: 'api', key: 'console-key' } }]) {
      const result = await fetchQuota({ readAuth: async () => auth, fetchImpl: async () => new Response(JSON.stringify(expired), { status: 401 }) });
      expect(result).toMatchObject({ ok: false, configured: true, error: 'OpenCode Go key expired. Connect an OpenCode Console account on the OpenCode card in Providers.' });
    }
  });

  it('keeps a 401 without the expired-key code an authentication failure', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ error: { type: 'AuthError', message: 'Unauthorized' } }), { status: 401 });
    const result = await fetchQuota({ readAuth: async () => apiKeyAuth(), fetchImpl });
    expect(result.error).toBe('OpenCode Go authentication failed');
  });

  it('reports a rejected Console key as an authentication failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 401 }));
    const result = await fetchQuota({ readAuth: async () => ({ opencode: { type: 'api', key: 'console-key' } }), fetchImpl });
    expect(result).toMatchObject({ ok: false, configured: true, error: 'OpenCode Go authentication failed' });
  });
});

describe('OpenCode Go quota provider — Console OAuth', () => {
  it('maps fiveHour, week, and month to the existing windows from decimal strings', () => {
    const windows = parseConsoleGoUsage(consolePayload());
>>>>>>> upstream/main
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
<<<<<<< HEAD
  it('normalizes authentication failures without response body text', async () => {
    await expect(fetchOpenCodeGoUsage('selected-key', async () => new Response('selected-key', { status: 403 }))).rejects.toThrow('OpenCode Go authentication failed');
||||||| bc50ba56aa

  it('reports a temporary request failure as configured', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async () => new Response('', { status: 502 }),
    });
    expect(result.configured).toBe(true);
    expect(result.error).toMatch(/HTTP 502/);
  });

  it('follows the selected account on every read instead of caching usage', async () => {
    let call = 0;
    const seen = [];
    const result = await fetchQuota({
      readAuth: async () => {
        call += 1;
        return consoleAuth({ orgID: call === 1 ? 'org_FIRST123' : 'org_SECOND123' });
      },
      fetchImpl: async (url, options) => {
        if (url === CONSOLE_STATUS_URL) seen.push(options.headers['x-org-id']);
        return new Response(JSON.stringify(consolePayload({ meters: {
          fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000', usedMicroCents: call === 1 ? '250' : '900' },
        } })));
      },
    });
    expect(seen).toEqual(['org_FIRST123']);
    expect(result.usage.windows['5h'].usedPercent).toBe(25);

    const second = await fetchQuota({
      readAuth: async () => consoleAuth({ orgID: 'org_SECOND123' }),
      fetchImpl: async () => new Response(JSON.stringify(consolePayload({ meters: {
        fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000', usedMicroCents: '900' },
      } }))),
    });
    expect(second.usage.windows['5h'].usedPercent).toBe(90);
  });

  it('parses the billing balance from micro-cents and rejects unusable amounts', () => {
    expect(parseConsoleBillingBalance({ availableMicroCents: '1200000000' })).toBe(12);
    // One cent is 1_000_000 micro-cents in the Console, so this is $12.34, never $1234.
    expect(parseConsoleBillingBalance({ availableMicroCents: '1234000000' })).toBe(12.34);
    expect(parseConsoleBillingBalance({ availableMicroCents: '0' })).toBe(0);
    expect(parseConsoleBillingBalance({ availableMicroCents: 50000000 })).toBe(0.5);
    expect(parseConsoleBillingBalance({ availableMicroCents: '-1' })).toBeNull();
    expect(parseConsoleBillingBalance({ availableMicroCents: 'not-a-number' })).toBeNull();
    expect(parseConsoleBillingBalance({})).toBeNull();
    expect(parseConsoleBillingBalance(null)).toBeNull();
  });

  it('reads the billing balance with the Console token and organization', async () => {
    let request;
    const balance = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ availableMicroCents: '1200000000' }));
      },
    );
    expect(request.url).toBe(CONSOLE_BILLING_STATUS_URL);
    expect(request.options.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer console-access',
      'x-org-id': 'org_TESTORG123',
    });
    expect(request.options.headers['x-opencode-session']).toBeUndefined();
    expect(request.options.redirect).toBe('error');
    expect(balance).toBe(12);
  });

  it('drops the credits balance when the billing read fails, without touching the meters', async () => {
    const nonOk = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => new Response('', { status: 403 }),
    );
    expect(nonOk).toBeNull();

    const malformed = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => new Response('not json', { status: 200 }),
    );
    expect(malformed).toBeNull();

    const network = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => { throw new Error('offline'); },
    );
    expect(network).toBeNull();
  });

  it('adds a credits balance row after a successful Console read', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async (url) => new Response(JSON.stringify(
        url === CONSOLE_BILLING_STATUS_URL
          ? { availableMicroCents: '1200000000' }
          : consolePayload(),
      )),
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.windows)).toEqual(['5h', 'weekly', 'monthly', 'credits_balance']);
    expect(result.usage.windows.credits_balance).toMatchObject({
      usedPercent: null,
      resetAt: null,
      valueLabel: '$12.00',
    });
  });

  it('keeps the meters when the billing balance cannot be read', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async (url) => (url === CONSOLE_BILLING_STATUS_URL
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify(consolePayload()))),
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.windows)).toEqual(['5h', 'weekly', 'monthly']);
  });

  it('does not read a billing balance on the API-key path', async () => {
    const seen = [];
    const result = await fetchQuota({
      readAuth: async () => apiKeyAuth(),
      fetchImpl: async (url) => {
        seen.push(url);
        return new Response(JSON.stringify(consolePayload()));
      },
    });
    expect(result.ok).toBe(true);
    expect(seen).toEqual([CONSOLE_STATUS_URL]);
    expect(result.usage.windows.credits_balance).toBeUndefined();
=======

  it('reads a Go product without access as an absent subscription, not a parse failure', async () => {
    // A Console Go subscription that ended (refunded or cancelled) keeps the Go
    // product in the status response and drops `access` to null (#6779).
    const ended = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async () => new Response(JSON.stringify({
        product: 'go',
        cancelAtPeriodEnd: true,
        renewalStopReason: 'cancelled_by_user',
        resumability: 'revoked',
        access: null,
        accessEndedAt: '2026-10-26T05:32:37.560Z',
      })),
    });
    expect(ended.configured).toBe(true);
    expect(ended.error).toMatch(/subscription/i);
    expect(ended.error).not.toMatch(/parsed/i);

    const withoutAccess = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async () => new Response(JSON.stringify({ product: 'go' })),
    });
    expect(withoutAccess.error).toMatch(/subscription/i);

    // An access object that is present but carries no usable meter stays a
    // malformed response: the subscription exists, the numbers do not.
    const emptyMeters = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async () => new Response(JSON.stringify({ product: 'go', access: { meters: {} } })),
    });
    expect(emptyMeters.error).toMatch(/parsed/i);
  });

  it('reports a temporary request failure as configured', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async () => new Response('', { status: 502 }),
    });
    expect(result.configured).toBe(true);
    expect(result.error).toMatch(/HTTP 502/);
  });

  it('follows the selected account on every read instead of caching usage', async () => {
    let call = 0;
    const seen = [];
    const result = await fetchQuota({
      readAuth: async () => {
        call += 1;
        return consoleAuth({ orgID: call === 1 ? 'org_FIRST123' : 'org_SECOND123' });
      },
      fetchImpl: async (url, options) => {
        if (url === CONSOLE_STATUS_URL) seen.push(options.headers['x-org-id']);
        return new Response(JSON.stringify(consolePayload({ meters: {
          fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000', usedMicroCents: call === 1 ? '250' : '900' },
        } })));
      },
    });
    expect(seen).toEqual(['org_FIRST123']);
    expect(result.usage.windows['5h'].usedPercent).toBe(25);

    const second = await fetchQuota({
      readAuth: async () => consoleAuth({ orgID: 'org_SECOND123' }),
      fetchImpl: async () => new Response(JSON.stringify(consolePayload({ meters: {
        fiveHour: { resetsAt: '2026-08-12T12:00:00.000Z', limitMicroCents: '1000', usedMicroCents: '900' },
      } }))),
    });
    expect(second.usage.windows['5h'].usedPercent).toBe(90);
  });

  it('parses the billing balance from micro-cents and rejects unusable amounts', () => {
    expect(parseConsoleBillingBalance({ availableMicroCents: '1200000000' })).toBe(12);
    // One cent is 1_000_000 micro-cents in the Console, so this is $12.34, never $1234.
    expect(parseConsoleBillingBalance({ availableMicroCents: '1234000000' })).toBe(12.34);
    expect(parseConsoleBillingBalance({ availableMicroCents: '0' })).toBe(0);
    expect(parseConsoleBillingBalance({ availableMicroCents: 50000000 })).toBe(0.5);
    expect(parseConsoleBillingBalance({ availableMicroCents: '-1' })).toBeNull();
    expect(parseConsoleBillingBalance({ availableMicroCents: 'not-a-number' })).toBeNull();
    expect(parseConsoleBillingBalance({})).toBeNull();
    expect(parseConsoleBillingBalance(null)).toBeNull();
  });

  it('reads the billing balance with the Console token and organization', async () => {
    let request;
    const balance = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async (url, options) => {
        request = { url, options };
        return new Response(JSON.stringify({ availableMicroCents: '1200000000' }));
      },
    );
    expect(request.url).toBe(CONSOLE_BILLING_STATUS_URL);
    expect(request.options.headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer console-access',
      'x-org-id': 'org_TESTORG123',
    });
    expect(request.options.headers['x-opencode-session']).toBeUndefined();
    expect(request.options.redirect).toBe('error');
    expect(balance).toBe(12);
  });

  it('drops the credits balance when the billing read fails, without touching the meters', async () => {
    const nonOk = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => new Response('', { status: 403 }),
    );
    expect(nonOk).toBeNull();

    const malformed = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => new Response('not json', { status: 200 }),
    );
    expect(malformed).toBeNull();

    const network = await fetchConsoleBillingBalance(
      { access: 'console-access', orgID: 'org_TESTORG123' },
      async () => { throw new Error('offline'); },
    );
    expect(network).toBeNull();
  });

  it('adds a credits balance row after a successful Console read', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async (url) => new Response(JSON.stringify(
        url === CONSOLE_BILLING_STATUS_URL
          ? { availableMicroCents: '1200000000' }
          : consolePayload(),
      )),
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.windows)).toEqual(['5h', 'weekly', 'monthly', 'credits_balance']);
    expect(result.usage.windows.credits_balance).toMatchObject({
      usedPercent: null,
      resetAt: null,
      valueLabel: '$12.00',
    });
  });

  it('keeps the meters when the billing balance cannot be read', async () => {
    const result = await fetchQuota({
      readAuth: async () => consoleAuth(),
      fetchImpl: async (url) => (url === CONSOLE_BILLING_STATUS_URL
        ? new Response('', { status: 500 })
        : new Response(JSON.stringify(consolePayload()))),
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.usage.windows)).toEqual(['5h', 'weekly', 'monthly']);
  });

  it('does not read a billing balance on the API-key path', async () => {
    const seen = [];
    const result = await fetchQuota({
      readAuth: async () => apiKeyAuth(),
      fetchImpl: async (url) => {
        seen.push(url);
        return new Response(JSON.stringify(consolePayload()));
      },
    });
    expect(result.ok).toBe(true);
    expect(seen).toEqual([CONSOLE_STATUS_URL]);
    expect(result.usage.windows.credits_balance).toBeUndefined();
>>>>>>> upstream/main
  });
});
