import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { createTunnelAuth } from './tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../opencode/core-routes.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-warming-auth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');
afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const endpoint = '/api/agent/v1/workspaces/workspace_1/cache-warming';
const state = { workspaceId: 'workspace_1', revision: '7', mode: 'idle' };
const applied = {
  persisted: { ...state, revision: '8', mode: 'streaming' }, status: 'partial', workers: [
    { worker: { workspaceId: 'workspace_1', rootSessionId: 'session_1', workerGeneration: 'generation_1' }, outcome: 'applied', mode: 'streaming' },
    { worker: { workspaceId: 'workspace_1', rootSessionId: 'session_2', workerGeneration: 'generation_2' }, outcome: 'failed', mode: 'streaming', error: { code: 'SERVICE_UNAVAILABLE', detail: 'Worker unavailable', retryable: true } },
  ],
};
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

// Reuse the canonical Host auth harness owners: real paired clients, UI auth,
// tunnel classification, origin policy, request middleware, and Express routes.
beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'warming test client' });
  token = created.token;
  clientId = created.client.id;
  auth = createUiAuth({ password: 'warming-route-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  requests = [];
  resolveCalls = [];
  servicePhase = 'ready';
  policyEnabled = false;
  requestService = async (_url, init) => Response.json(init.method === 'PUT' ? applied : state);
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
    resolveSessionScope: async () => { throw new Error('Workspace warming must not require session admission'); },
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Warming must not read credentials'); },
    queueRoutes: () => {}, sessionRoutes: () => {}, attachmentRoutes: () => {},
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

describe('canonical workspace cache warming Host boundary', () => {
  it('authorizes GET without a session and forwards strict PUT with the ordinary paired-client boundary', async () => {
    const read = await request(app).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(read.body).toEqual(state);
    expect(read.headers['cache-control']).toBe('no-store');
    const update = { expectedRevision: '7', mode: 'streaming' };
    const write = await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send(update).expect(200);
    expect(write.body).toEqual(applied);
    expect(resolveCalls).toEqual(['workspace_1', 'workspace_1']);
    expect(requests.map(entry => ({ url: entry.url, method: entry.init.method, body: entry.init.body }))).toEqual([
      { url: endpoint, method: 'GET', body: undefined },
      { url: endpoint, method: 'PUT', body: JSON.stringify(update) },
    ]);
    expect(JSON.stringify(requests)).not.toContain(token);
  });

  it('refuses unauthenticated GET and PUT before scope lookup or private forwarding', async () => {
    assertProblem(await request(app).get(endpoint), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).put(endpoint).send({ expectedRevision: '7', mode: 'off' }), 401, 'UNAUTHORIZED');
    expect(resolveCalls).toEqual([]);
    expect(requests).toEqual([]);
  });

  it('refuses unauthorized workspaces for both reads and writes without forwarding', async () => {
    const foreign = '/api/agent/v1/workspaces/workspace_foreign/cache-warming';
    assertProblem(await request(app).get(foreign).set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).put(foreign).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'off' }), 403, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
  });

  it('rejects strict invalid updates, unknown fields, queries and non-JSON media without forwarding', async () => {
    for (const body of [
      {}, { mode: 'idle' }, { expectedRevision: '7' },
      { expectedRevision: 7, mode: 'idle' }, { expectedRevision: '-1', mode: 'idle' },
      { expectedRevision: '7', mode: 'background' },
      { expectedRevision: '7', mode: 'idle', workspaceId: 'workspace_foreign' },
      { expectedRevision: '7', mode: 'idle', extra: true },
    ]) {
      assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send(body), 400, 'INVALID_REQUEST');
    }
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).type('text').send('idle'), 415, 'UNSUPPORTED_MEDIA_TYPE');
    assertProblem(await request(app).get(`${endpoint}?workspaceId=workspace_foreign`).set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toEqual([]);
  });

  it('requires ordinary origin authorization and rejects URL credentials and revoked pairing', async () => {
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).set('Origin', 'https://untrusted.example').send({ expectedRevision: '7', mode: 'idle' }), 403, 'INVALID_ORIGIN');
    assertProblem(await request(app).get(`${endpoint}?oc_client_token=${token}`), 401, 'UNAUTHORIZED');
    await clients.revokeClient(clientId);
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 401, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
  });

  it('keeps warming available in enterprise mode and refuses service-unready operations', async () => {
    policyEnabled = true;
    await request(app).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200, state);
    await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'streaming' }).expect(200, applied);
    servicePhase = 'failed';
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'idle' }), 503, 'SERVICE_UNAVAILABLE');
    expect(requests).toHaveLength(2);
  });

  it('rejects malformed private warming responses rather than exposing unvalidated state', async () => {
    requestService = async () => Response.json({ ...state, secret: 'private-value' });
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    requestService = async () => Response.json({ ...applied, status: 'applied', workers: [{ ...applied.workers[0], error: { code: 'SERVICE_UNAVAILABLE', detail: 'unexpected', retryable: true } }] });
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'streaming' }), 503, 'SERVICE_UNAVAILABLE');
  });

  it('rejects private state or worker observations from another workspace', async () => {
    requestService = async () => Response.json({ ...state, workspaceId: 'workspace_foreign' });
    assertProblem(await request(app).get(endpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    requestService = async () => Response.json({ ...applied, persisted: { ...applied.persisted, workspaceId: 'workspace_foreign' } });
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'streaming' }), 503, 'SERVICE_UNAVAILABLE');
    requestService = async () => Response.json({ ...applied, workers: [{ ...applied.workers[0], worker: { ...applied.workers[0].worker, workspaceId: 'workspace_foreign' } }] });
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '7', mode: 'streaming' }), 503, 'SERVICE_UNAVAILABLE');
  });

  it('preserves a stale revision conflict from the private service', async () => {
    const problem = { type: 'urn:ohpichamber:problem:CATALOG_CONFLICT', title: 'Catalog conflict', status: 409, code: 'CATALOG_CONFLICT', detail: 'The warming revision changed.', retryable: false };
    requestService = async () => Response.json(problem, { status: 409 });
    const response = await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '6', mode: 'off' });
    assertProblem(response, 409, 'CATALOG_CONFLICT');
    expect(response.body).toEqual(problem);
    expect(requests).toHaveLength(1);
  });
});
