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
  });
});
