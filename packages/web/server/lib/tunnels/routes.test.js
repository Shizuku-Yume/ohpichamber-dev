import { describe, expect, it } from 'bun:test';
import { createTunnelRoutesRuntime } from './routes.js';
import { TunnelServiceError, normalizeOptionalPath, normalizeTunnelProvider } from './types.js';

describe('public tunnel password requirement', () => {
  const createRuntime = (hasUiPassword) => {
    let starts = 0;
    const runtime = createTunnelRoutesRuntime({
      hasUiPassword,
      tunnelService: {
        start: async () => {
          starts += 1;
          return { provider: 'cloudflare', publicUrl: 'https://example.com', activeMode: 'quick' };
        },
      },
      TUNNEL_PROVIDER_CLOUDFLARE: 'cloudflare',
      TUNNEL_MODE_MANAGED_REMOTE: 'managed-remote',
    });
    return { runtime, getStarts: () => starts };
  };

  it('rejects an unauthenticated runtime before starting any provider', async () => {
    const { runtime, getStarts } = createRuntime(false);
    await expect(runtime.startTunnelWithNormalizedRequest({ provider: 'cloudflare', mode: 'quick' }))
      .rejects.toThrow('A UI password is required');
    expect(getStarts()).toBe(0);
  });

  it('rejects the HTTP start route without disturbing an existing tunnel', async () => {
    const { runtime, getStarts } = createRuntime(false);
    const routes = new Map();
    const app = {
      get: (path, handler) => routes.set(`GET ${path}`, handler),
      post: (path, handler) => routes.set(`POST ${path}`, handler),
      put: (path, handler) => routes.set(`PUT ${path}`, handler),
    };
    runtime.registerRoutes(app);
    let status = 200;
    let body;
    const response = {
      status(code) { status = code; return this; },
      json(payload) { body = payload; return this; },
    };
    await routes.get('POST /api/openchamber/tunnel/start')({ body: {} }, response);
    expect(status).toBe(403);
    expect(body.code).toBe('ui_password_required');
    expect(getStarts()).toBe(0);
  });

  it('refuses every tunnel in enterprise mode, password or not', async () => {
    process.env.OPENCHAMBER_ENTERPRISE_MODE = '1';
    try {
      const { runtime, getStarts } = createRuntime(true);
      await expect(runtime.startTunnelWithNormalizedRequest({ provider: 'cloudflare', mode: 'quick' }))
        .rejects.toThrow('enterprise mode');
      const routes = new Map();
      runtime.registerRoutes({
        get: (path, handler) => routes.set(`GET ${path}`, handler),
        post: (path, handler) => routes.set(`POST ${path}`, handler),
        put: (path, handler) => routes.set(`PUT ${path}`, handler),
      });
      let status = 200;
      let body;
      await routes.get('POST /api/openchamber/tunnel/start')({ body: {} }, {
        status(code) { status = code; return this; },
        json(payload) { body = payload; return this; },
      });
      expect(status).toBe(403);
      expect(body.code).toBe('enterprise_mode');
      expect(getStarts()).toBe(0);
    } finally {
      delete process.env.OPENCHAMBER_ENTERPRISE_MODE;
    }
  });

  it('allows a password-protected runtime to start a tunnel', async () => {
    const { runtime, getStarts } = createRuntime(true);
    const result = await runtime.startTunnelWithNormalizedRequest({ provider: 'cloudflare', mode: 'quick' });
    expect(result.publicUrl).toBe('https://example.com');
    expect(getStarts()).toBe(1);
  });
});

describe('tunnel doctor required fields', () => {
  it('retains truthiness checks for inherited dictionary members', async () => {
    const routes = new Map();
    const provider = {
      capabilities: {
        provider: 'cloudflare',
        modes: [{ key: 'quick', requires: ['constructor', 'toString', 'hostname', 'token', 'configPath'] }],
      },
    };
    const runtime = createTunnelRoutesRuntime({
      URL,
      TunnelServiceError,
      TUNNEL_PROVIDER_CLOUDFLARE: 'cloudflare',
      tunnelProviderRegistry: { get: () => provider },
      tunnelService: { checkAvailability: async () => ({ available: true }) },
      readSettingsFromDiskMigrated: async () => ({}),
      readManagedRemoteTunnelConfigFromDisk: async () => ({ tunnels: [] }),
      normalizeTunnelProvider,
      normalizeOptionalPath,
      normalizeManagedRemoteTunnelHostname: () => undefined,
      resolveManagedRemoteTunnelToken: async () => '',
      getRuntimeManagedRemoteTunnelHostname: () => undefined,
      getRuntimeManagedRemoteTunnelToken: () => '',
    });
    runtime.registerRoutes({
      get: (path, handler) => routes.set(`GET ${path}`, handler),
      post: (path, handler) => routes.set(`POST ${path}`, handler),
      put: (path, handler) => routes.set(`PUT ${path}`, handler),
    });
    let result;
    await routes.get('GET /api/openchamber/tunnel/doctor')(
      { query: { provider: 'cloudflare' }, body: {} },
      { json: (body) => { result = body; } },
    );
    const checks = result.modes[0].checks;
    expect(checks.find((check) => check.id === 'requirement_constructor').status).toBe('pass');
    expect(checks.find((check) => check.id === 'requirement_toString').status).toBe('pass');
    expect(checks.find((check) => check.id === 'requirement_hostname').status).toBe('fail');
    expect(checks.find((check) => check.id === 'requirement_token').status).toBe('fail');
    expect(checks.find((check) => check.id === 'requirement_configPath').status).toBe('fail');
  });
});

describe('tunnel status managed token presence', () => {
  const statusResponse = async ({ token, settings = {}, readSettingsError } = {}) => {
    const routes = new Map();
    const runtime = createTunnelRoutesRuntime({
      readSettingsFromDiskMigrated: async () => {
        if (readSettingsError) throw readSettingsError;
        return settings;
      },
      readManagedRemoteTunnelConfigFromDisk: async () => ({ tunnels: [] }),
      normalizeTunnelMode: () => 'quick',
      normalizeManagedRemoteTunnelHostname: () => null,
      normalizeTunnelBootstrapTtlMs: () => 60_000,
      normalizeTunnelSessionTtlMs: () => 60_000,
      normalizeTunnelProvider,
      getRuntimeManagedRemoteTunnelToken: () => token,
      getActivePort: () => 3000,
      tunnelAuthController: {
        listTunnelSessions: () => [],
        getActiveTunnelMode: () => null,
      },
      tunnelService: {
        resolveActiveProvider: () => null,
        getPublicUrl: () => null,
      },
    });
    runtime.registerRoutes({
      get: (path, handler) => routes.set(`GET ${path}`, handler),
      post: (path, handler) => routes.set(`POST ${path}`, handler),
      put: (path, handler) => routes.set(`PUT ${path}`, handler),
    });
    let status = 200;
    let body;
    await routes.get('GET /api/openchamber/tunnel/status')({}, {
      status(code) { status = code; return this; },
      json(payload) { body = payload; return this; },
    });
    return { status, body };
  };

  it.each([undefined, null, ''])('accepts an empty runtime token (%s)', async (token) => {
    const { status, body } = await statusResponse({ token });
    expect(status).toBe(200);
    expect(body).toMatchObject({ active: false, hasManagedRemoteTunnelToken: false });
  });

  it('reports a configured runtime token without returning it', async () => {
    const { status, body } = await statusResponse({ token: 'configured-runtime-token' });
    expect(status).toBe(200);
    expect(body.hasManagedRemoteTunnelToken).toBe(true);
    expect(JSON.stringify(body)).not.toContain('configured-runtime-token');
  });

  it('reports a stored token when the runtime has no token', async () => {
    const { status, body } = await statusResponse({ settings: { managedRemoteTunnelToken: 'stored-token' } });
    expect(status).toBe(200);
    expect(body.hasManagedRemoteTunnelToken).toBe(true);
    expect(JSON.stringify(body)).not.toContain('stored-token');
  });

  it('does not turn a settings read failure into an empty status', async () => {
    const { status, body } = await statusResponse({ readSettingsError: new Error('unreadable settings') });
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Failed to get tunnel status' });
  });
});
