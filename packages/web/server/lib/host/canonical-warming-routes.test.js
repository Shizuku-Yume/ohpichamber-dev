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
let resolveSessionCalls;
let resolveSessionScopeImpl;
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
  resolveSessionCalls = [];
  resolveSessionScopeImpl = async () => { throw new Error('Workspace warming must not require session admission'); };
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
    resolveSessionScope: async sessionId => {
      resolveSessionCalls.push(sessionId);
      return resolveSessionScopeImpl(sessionId);
    },
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Warming must not read credentials'); },
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

describe('canonical session cache warming Host boundary', () => {
  const sessionEndpoint = '/api/agent/v1/sessions/session_1/cache-warming';
  const sessionState = {
    sessionId: 'session_1',
    workspaceId: 'workspace_1',
    revision: '0',
    mode: null,
    workspaceMode: 'off',
    effectiveMode: 'off',
  };
  const sessionAppliedIdle = {
    persisted: { ...sessionState, revision: '1', mode: 'idle', effectiveMode: 'idle' },
    status: 'no-active-worker',
    worker: null,
  };
  const sessionAppliedReset = {
    persisted: { ...sessionState, revision: '2', mode: null, effectiveMode: 'off' },
    status: 'applied',
    worker: {
      worker: { workspaceId: 'workspace_1', rootSessionId: 'session_1', workerGeneration: 'generation_1' },
      outcome: 'applied',
      mode: 'off',
    },
  };

  beforeEach(() => {
    resolveSessionScopeImpl = async sessionId => {
      if (sessionId === 'session_1') {
        return {
          sessionId: 'session_1',
          rootSessionId: 'session_1',
          workspaceId: 'workspace_1',
          projectId: 'project_1',
          agentDirectoryId: 'agent_1',
          cwd: directory,
          agentDirectory: path.join(directory, 'agent'),
        };
      }
      if (sessionId === 'child_1') {
        return {
          sessionId: 'child_1',
          rootSessionId: 'root_1',
          workspaceId: 'workspace_1',
          projectId: 'project_1',
          agentDirectoryId: 'agent_1',
          cwd: directory,
          agentDirectory: path.join(directory, 'agent'),
        };
      }
      return null;
    };
  });

  it('authorizes GET and cold/live PUT via resolveSessionScope without reopening cold workers or leaking tokens', async () => {
    requestService = async (_url, init) => {
      if (init.method === 'GET') return Response.json(sessionState);
      const parsed = JSON.parse(init.body);
      return Response.json(parsed.mode === null ? sessionAppliedReset : sessionAppliedIdle);
    };

    const read = await request(app).get(sessionEndpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(read.body).toEqual(sessionState);
    expect(read.headers['cache-control']).toBe('no-store');

    const setIdle = { expectedRevision: '0', mode: 'idle' };
    const writeIdle = await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send(setIdle).expect(200);
    expect(writeIdle.body).toEqual(sessionAppliedIdle);

    const resetNull = { expectedRevision: '1', mode: null };
    const writeNull = await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send(resetNull).expect(200);
    expect(writeNull.body).toEqual(sessionAppliedReset);

    expect(resolveSessionCalls).toEqual(['session_1', 'session_1', 'session_1']);
    expect(requests.map(entry => ({ url: entry.url, method: entry.init.method, body: entry.init.body }))).toEqual([
      { url: sessionEndpoint, method: 'GET', body: undefined },
      { url: sessionEndpoint, method: 'PUT', body: JSON.stringify(setIdle) },
      { url: sessionEndpoint, method: 'PUT', body: JSON.stringify(resetNull) },
    ]);
    expect(requests.some(entry => entry.url.includes('/reopen'))).toBe(false);
    expect(JSON.stringify(requests)).not.toContain(token);
  });

  it('accepts child session forwarding when response sessionId matches scope.rootSessionId', async () => {
    const childEndpoint = '/api/agent/v1/sessions/child_1/cache-warming';
    const rootState = { ...sessionState, sessionId: 'root_1' };
    const rootApplied = {
      persisted: { ...rootState, revision: '1', mode: 'streaming', effectiveMode: 'streaming' },
      status: 'applied',
      worker: {
        worker: { workspaceId: 'workspace_1', rootSessionId: 'root_1', workerGeneration: 'generation_1' },
        outcome: 'applied',
        mode: 'streaming',
      },
    };
    requestService = async (_url, init) => Response.json(init.method === 'PUT' ? rootApplied : rootState);

    await request(app).get(childEndpoint).set('Authorization', `Bearer ${token}`).expect(200, rootState);
    await request(app).put(childEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', mode: 'streaming' }).expect(200, rootApplied);
    expect(resolveSessionCalls).toEqual(['child_1', 'child_1']);
  });

  it('refuses unauthenticated and unauthorized session requests before forwarding', async () => {
    assertProblem(await request(app).get(sessionEndpoint), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).put(sessionEndpoint).send({ expectedRevision: '0', mode: 'idle' }), 401, 'UNAUTHORIZED');
    expect(resolveSessionCalls).toEqual([]);

    const foreign = '/api/agent/v1/sessions/session_foreign/cache-warming';
    assertProblem(await request(app).get(foreign).set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).put(foreign).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', mode: 'off' }), 403, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
  });

  it('rejects invalid request bodies, query params, and non-JSON media without forwarding', async () => {
    for (const body of [
      {},
      { mode: 'idle' },
      { expectedRevision: '0' },
      { expectedRevision: '0', mode: 'on' },
      { expectedRevision: 0, mode: 'idle' },
      { expectedRevision: '0', mode: 'idle', extra: true },
    ]) {
      assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send(body), 400, 'INVALID_REQUEST');
    }
    assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).type('text').send('idle'), 415, 'UNSUPPORTED_MEDIA_TYPE');
    assertProblem(await request(app).get(`${sessionEndpoint}?sessionId=session_foreign`).set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toEqual([]);
  });

  it('rejects malformed or cross-workspace / cross-session private responses', async () => {
    requestService = async () => Response.json({ ...sessionState, secret: 'private' });
    assertProblem(await request(app).get(sessionEndpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({ ...sessionState, workspaceId: 'workspace_foreign' });
    assertProblem(await request(app).get(sessionEndpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({ ...sessionState, sessionId: 'session_foreign' });
    assertProblem(await request(app).get(sessionEndpoint).set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({ ...sessionAppliedIdle, persisted: { ...sessionAppliedIdle.persisted, workspaceId: 'workspace_foreign' } });
    assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', mode: 'idle' }), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({ ...sessionAppliedIdle, persisted: { ...sessionAppliedIdle.persisted, sessionId: 'session_foreign' } });
    assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', mode: 'idle' }), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({
      ...sessionAppliedReset,
      worker: { ...sessionAppliedReset.worker, worker: { ...sessionAppliedReset.worker.worker, workspaceId: 'workspace_foreign' } },
    });
    assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '1', mode: null }), 503, 'SERVICE_UNAVAILABLE');

    requestService = async () => Response.json({
      ...sessionAppliedReset,
      worker: { ...sessionAppliedReset.worker, worker: { ...sessionAppliedReset.worker.worker, rootSessionId: 'session_foreign' } },
    });
    assertProblem(await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '1', mode: null }), 503, 'SERVICE_UNAVAILABLE');
  });

  it('preserves 409 CATALOG_CONFLICT problem document from the private service', async () => {
    const conflict = {
      type: 'urn:ohpichamber:problem:CATALOG_CONFLICT',
      title: 'Catalog conflict',
      status: 409,
      code: 'CATALOG_CONFLICT',
      detail: 'The session warming revision changed.',
      retryable: false,
    };
    requestService = async () => Response.json(conflict, { status: 409 });
    const response = await request(app).put(sessionEndpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', mode: 'idle' });
    assertProblem(response, 409, 'CATALOG_CONFLICT');
    expect(response.body).toEqual(conflict);
    expect(requests).toHaveLength(1);
  });
});
