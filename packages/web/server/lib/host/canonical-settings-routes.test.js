import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../server-frame/core-routes.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-settings-auth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');
afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const endpoint = '/api/agent/v1/workspaces/workspace_1/settings';
const state = {
  workspaceId: 'workspace_1', revision: '7', totalCount: 1, settings: [{
    id: 'compaction.thresholdPercent', type: 'number', value: 50, default: -1, configured: true,
    label: 'Compaction Threshold', group: 'Compaction', tab: 'context',
    placement: { type: 'page', page: 'context', section: 'compaction' },
  }],
};
const updated = { ...state, revision: '8', settings: [{ ...state.settings[0], value: 60 }] };
let directory;
let app;
let auth;
let clients;
let token;
let clientId;
let requests;
let resolveCalls;
let requestService;
let servicePhase;
let policyEnabled;

beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'settings test client' });
  token = created.token;
  clientId = created.client.id;
  auth = createUiAuth({ password: 'settings-route-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  requests = [];
  resolveCalls = [];
  servicePhase = 'ready';
  policyEnabled = false;
  requestService = async (_url, init) => Response.json(['PUT', 'PATCH'].includes(init.method) ? updated : state);
  app = express();
  registerCommonRequestMiddleware(app, { express });
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: servicePhase }),
      request: async (url, init) => { requests.push({ url, init }); return requestService(url, init); },
    },
    uiAuthController: auth,
    tunnelAuthController: createTunnelAuth(),
    isRequestOriginAllowed: security.isRequestOriginAllowed,
    enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify({ enterpriseMode: policyEnabled }) },
    resolveWorkspaceScope: async workspaceId => {
      resolveCalls.push(workspaceId);
      return workspaceId === 'workspace_1' ? { workspaceId, projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: path.join(directory, 'agent') } : null;
    },
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => { throw new Error('Workspace settings must not require session admission'); },
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Settings must not read credentials'); },
    queueRoutes: () => { }, sessionRoutes: () => { }, attachmentRoutes: () => { },
  });
});
afterEach(async () => {
  auth.dispose();
  await rm(directory, { recursive: true, force: true });
});

function assertProblem(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, code, type: `urn:ohpichamber:problem:${code}` });
}

describe('canonical OMP settings Host boundary', () => {
  it('authorizes GET and strict PUT, forwards the exact body and never echoes the bearer', async () => {
    const read = await request(app).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(read.body).toEqual(state);
    expect(read.headers['cache-control']).toBe('no-store');
    const update = { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] };
    const write = await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send(update).expect(200);
    expect(write.body).toEqual(updated);
    expect(resolveCalls).toEqual(['workspace_1', 'workspace_1']);
    expect(requests.map(entry => ({ url: entry.url, method: entry.init.method, body: entry.init.body }))).toEqual([
      { url: endpoint, method: 'GET', body: undefined },
      { url: endpoint, method: 'PUT', body: JSON.stringify(update) },
    ]);
    expect(JSON.stringify(requests)).not.toContain(token);
  });

  it('refuses unauthenticated and foreign workspaces before forwarding', async () => {
    assertProblem(await request(app).get(endpoint), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).put(endpoint).send({ expectedRevision: '7', changes: [] }), 401, 'UNAUTHORIZED');
    const foreign = '/api/agent/v1/workspaces/workspace_foreign/settings';
    assertProblem(await request(app).get(foreign).set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).put(foreign).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', changes: [] }), 403, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
  });

  it('rejects unknown ids, duplicate changes, missing revisions, queries and non-JSON without forwarding', async () => {
    for (const body of [
      {}, { expectedRevision: '7' }, { changes: [] },
      { expectedRevision: 7, changes: [{ id: 'compaction.thresholdPercent', value: 60 }] },
      { expectedRevision: '7', changes: [] },
      { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }, { id: 'compaction.thresholdPercent', value: 70 }] },
      { expectedRevision: '7', changes: [{ id: '', value: 'https://example.test' }] },
      { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }], workspaceId: 'workspace_foreign' },
    ]) assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send(body), 400, 'INVALID_REQUEST');
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).type('text').send('60'), 415, 'UNSUPPORTED_MEDIA_TYPE');
    assertProblem(await request(app).get(`${endpoint}?workspaceId=workspace_foreign`).set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toEqual([]);
  });

  it('accepts the canonical omp/settings path and PATCH for the same workspace revision', async () => {
    const ompEndpoint = '/api/agent/v1/workspaces/workspace_1/omp/settings';
    const read = await request(app).get(ompEndpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(read.body).toEqual(state);
    const update = { expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] };
    const patched = await request(app).patch(ompEndpoint).set('Authorization', `Bearer ${token}`).send(update).expect(200);
    expect(patched.body).toEqual(updated);
    expect(requests.map(entry => ({ url: entry.url, method: entry.init.method }))).toEqual([
      { url: ompEndpoint, method: 'GET' },
      { url: ompEndpoint, method: 'PATCH' },
    ]);
    assertProblem(await request(app).get('/api/agent/v1/workspaces/workspace_foreign/omp/settings').set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).patch(ompEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', changes: [] }), 400, 'INVALID_REQUEST');
  });

  it('keeps behaviour settings available in enterprise mode and refuses service-unready operations', async () => {
    policyEnabled = true;
    await request(app).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
    servicePhase = 'starting';
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
  });

  it('requires ordinary origin authorization and rejects URL credentials', async () => {
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).set('Origin', 'https://untrusted.example').send({ expectedRevision: '7', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] }), 403, 'INVALID_ORIGIN');
    assertProblem(await request(app).get(`${endpoint}?oc_client_token=${token}`), 401, 'UNAUTHORIZED');
    await clients.revokeClient(clientId);
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 401, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
  });
});
