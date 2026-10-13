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
  it('returns no private error content when scope resolution fails', async () => {
    const response = await request(createApp({ resolveQuotaSelection: async () => { throw new Error('private-secret'); } })).get('/api/quota/deepseek');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private-secret');
  });
  it('requires selected scope callbacks at construction', () => {
    expect(() => registerQuotaRoutes(express(), {})).toThrow('selected workspace');
  });
});
