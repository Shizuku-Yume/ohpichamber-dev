<<<<<<< HEAD
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import * as providers from './providers/index.js';
import { registerQuotaRoutes } from './routes.js';

const selection = { workspaceId: 'workspace_1', agentDirectoryId: 'agent_1', providerId: 'deepseek', credentialRef: 'credential_1' };
const createApp = (overrides = {}) => {
  const app = express();
  registerQuotaRoutes(app, {
    getQuotaProviders: async () => providers,
    resolveQuotaSelection: async () => selection,
    listQuotaSelections: async () => [{ providerId: 'deepseek' }],
    resolveCredential: async () => { throw new Error('Selected credential unavailable'); },
    ...overrides,
  });
  return app;
};
describe('selected quota routes', () => {
  it('lists only public workspace catalog selections', async () => {
    const response = await request(createApp()).get('/api/quota/providers');
    expect(response.body).toEqual({ providers: ['deepseek'] });
  });
  it('returns a normal unconfigured result when no provider credential is selected', async () => {
    const response = await request(createApp({
      resolveQuotaSelection: async () => {
        throw Object.assign(new Error('no stored credential'), { code: 'CREDENTIAL_UNAVAILABLE', status: 422 });
      },
    })).get('/api/quota/claude');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ providerId: 'claude', providerName: 'Claude', ok: false, configured: false, usage: null });
    expect(response.body.error).toBeUndefined();
  });
  it('wires the unconfigured result through the production quota module', async () => {
    const resolveUnavailable = async () => {
      throw Object.assign(new Error('no stored credential'), { code: 'CREDENTIAL_UNAVAILABLE', status: 422 });
    };
    const productionApp = createApp({
      getQuotaProviders: () => import('./index.js'),
      resolveQuotaSelection: resolveUnavailable,
    });
    const configured = await request(productionApp).get('/api/quota/claude');
    expect(configured.status).toBe(200);
    expect(configured.body).toMatchObject({ providerId: 'claude', providerName: 'Claude', ok: false, configured: false, usage: null });
    expect(configured.body.error).toBeUndefined();
    expect((await request(productionApp).get('/api/quota/not-a-quota-provider')).status).toBe(503);
  });
  it('does not turn an unsupported provider into an unconfigured success', async () => {
    const response = await request(createApp({
      resolveQuotaSelection: async () => {
        throw Object.assign(new Error('no stored credential'), { code: 'CREDENTIAL_UNAVAILABLE', status: 422 });
      },
    })).get('/api/quota/not-a-quota-provider');
    expect(response.status).toBe(503);
  });
  it('keeps a configured provider failure visible', async () => {
    const response = await request(createApp()).get('/api/quota/deepseek');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ providerId: 'deepseek', ok: false, configured: true, error: 'Selected credential unavailable' });
  });
  it('returns no private error content when scope resolution fails', async () => {
    const response = await request(createApp({ resolveQuotaSelection: async () => { throw new Error('private-secret'); } })).get('/api/quota/deepseek');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private-secret');
  });
  it('requires selected scope callbacks at construction', () => {
    expect(() => registerQuotaRoutes(express(), {})).toThrow('selected workspace');
=======
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureOpenCodeCredentials } from '../opencode/auth.js';
import { attachExtensionQuotaProvider, detachExtensionQuotaProvider } from './extension-registry.js';
import { QuotaRouteError } from './route-error.js';
import { registerQuotaRoutes } from './routes.js';

const app = (providers) => {
  const server = express();
  registerQuotaRoutes(server, { getQuotaProviders: async () => providers });
  return server;
};

describe('quota routes with extension providers', () => {
  it('lists the extensions\' providers from memory, without the quota module or OpenCode', async () => {
    attachExtensionQuotaProvider({ providerId: 'ext-teapot-usage', providerName: 'Teapot Usage', icon: 'cup', guestId: 'teapot-usage' });
    try {
      const server = express();
      const getQuotaProviders = vi.fn(async () => { throw new Error('OpenCode is not connected yet'); });
      registerQuotaRoutes(server, { getQuotaProviders });
      const response = await request(server).get('/api/quota/extensions');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ extensions: [{ id: 'ext-teapot-usage', name: 'Teapot Usage', icon: 'cup', guestId: 'teapot-usage' }] });
      expect(getQuotaProviders).not.toHaveBeenCalled();
    } finally {
      detachExtensionQuotaProvider('ext-teapot-usage');
    }
  });

  it('answers an extension\'s malformed answer with its own status and code, and anything else with 500', async () => {
    const malformed = await request(app({
      fetchQuotaForProvider: async () => { throw new QuotaRouteError(502, 'MALFORMED_PROVIDER_RESPONSE', 'Teapot Usage answered something OpenChamber cannot use: not JSON'); },
    })).get('/api/quota/ext-teapot-usage');
    expect(malformed.status).toBe(502);
    expect(malformed.body).toEqual({ code: 'MALFORMED_PROVIDER_RESPONSE', error: 'Teapot Usage answered something OpenChamber cannot use: not JSON' });

    // A built-in's error that happens to carry a status and a code stays 500: only the extension layer's branded error is answered as it is.
    const plain = await request(app({
      fetchQuotaForProvider: async () => { throw Object.assign(new Error('upstream said no'), { status: 401, code: 'UNAUTHORIZED' }); },
    })).get('/api/quota/codex');
    expect(plain.status).toBe(500);
    expect(plain.body).toEqual({ error: 'upstream said no' });
  });
});

describe('z.ai gift reset activation route', () => {
  beforeEach(() => {
    configureOpenCodeCredentials({ list: async () => [{
      id: 'test-zai', integrationID: 'zai-coding-plan', label: 'default', active: true,
      value: { type: 'key', key: 'test-token' },
    }] });
  });

  afterEach(() => {
    configureOpenCodeCredentials(null);
    vi.unstubAllGlobals();
  });

  const activate = async (body) => {
    const upstream = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, msg: 'success', data: 1, success: true }),
    });
    vi.stubGlobal('fetch', upstream);
    const response = await request(app({})).post('/api/quota/zai-coding-plan/gift-reset/use').send(body);
    return { response, upstream };
  };

  it('sends GLOBAL upstream when the record carried no grantType', async () => {
    const { response, upstream } = await activate({ recordId: 462029, resetType: 'FIVE_HOUR' });

    expect(response.status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][1].body).grantType).toBe('GLOBAL');
  });

  it('sends the record grantType upstream unchanged', async () => {
    const { response, upstream } = await activate({ recordId: 462029, resetType: 'WEEK', grantType: 'ACTIVITY' });

    expect(response.status).toBe(200);
    expect(JSON.parse(upstream.mock.calls[0][1].body).grantType).toBe('ACTIVITY');
  });

  it.each([[''], ['   '], [null], [7]])('answers 400 without calling upstream for grantType %j', async (grantType) => {
    const { response, upstream } = await activate({ recordId: 462029, resetType: 'WEEK', grantType });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_REQUEST');
    expect(upstream).not.toHaveBeenCalled();
>>>>>>> bc50ba56a
  });
});
