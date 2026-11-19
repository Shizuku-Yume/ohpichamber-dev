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

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-images-auth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');

afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const generateEndpoint = '/api/agent/v1/workspaces/workspace_1/images/generate';
const configEndpoint = '/api/agent/v1/workspaces/workspace_1/images/config';

const validGeneratePayload = {
  workspaceId: 'workspace_1',
  selection: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
  prompt: 'A sunset over the mountains',
  aspectRatio: '16:9',
  imageSize: '2K',
};

const serviceGenerateResult = {
  model: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
  images: [{
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    mimeType: 'image/png',
  }],
};

const validConfigPayload = {
  expectedRevision: '0',
  model: {
    modelId: 'flux-schnell',
    provider: 'replicate',
    name: 'Flux Schnell',
    enabled: true,
  },
};

const serviceConfigResult = {
  revision: '1',
  selection: { providerId: 'replicate', modelId: 'flux-schnell' },
  model: validConfigPayload.model,
};

let directory;
let app;
let auth;
let clients;
let token;
let requests;
let resolveCalls;
let servicePhase;
let enterpriseModeEnabled;

beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'images test client' });
  token = created.token;
  auth = createUiAuth({ password: 'images-route-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  requests = [];
  resolveCalls = [];
  servicePhase = 'ready';
  enterpriseModeEnabled = false;

  app = express();
  registerCommonRequestMiddleware(app, { express });
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: servicePhase }),
      request: async (url, init) => {
        requests.push({ url, init });
        if (url.includes('/images/config')) return Response.json(serviceConfigResult);
        return Response.json(serviceGenerateResult);
      },
    },
    uiAuthController: auth,
    tunnelAuthController: createTunnelAuth(),
    isRequestOriginAllowed: security.isRequestOriginAllowed,
    enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify({ enterpriseMode: enterpriseModeEnabled }) },
    resolveWorkspaceScope: async (workspaceId) => {
      resolveCalls.push(workspaceId);
      return workspaceId === 'workspace_1'
        ? { workspaceId, projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: path.join(directory, 'agent') }
        : null;
    },
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => { throw new Error('Images routes must not require session admission'); },
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Images must not read credentials'); },
    queueRoutes: () => { },
    sessionRoutes: () => { },
    attachmentRoutes: () => { },
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

describe('canonical OMP images Host boundary', () => {
  it('authorizes POST images/generate, validates request/response schemas, and forwards to Agent Service', async () => {
    const res = await request(app)
      .post(generateEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send(validGeneratePayload)
      .expect(200);

    expect(res.body).toEqual(serviceGenerateResult);
    expect(resolveCalls).toEqual(['workspace_1']);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/agent/v1/workspaces/workspace_1/images/generate');
    expect(requests[0].init.method).toBe('POST');
    expect(JSON.parse(requests[0].init.body)).toEqual(validGeneratePayload);
  });

  it('refuses unauthenticated image generation requests with 401 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post(generateEndpoint)
      .send(validGeneratePayload);

    assertProblem(res, 401, 'UNAUTHORIZED');
    expect(requests).toHaveLength(0);
  });

  it('refuses image generation for unauthorized workspace with 403 UNAUTHORIZED', async () => {
    const res = await request(app)
      .post('/api/agent/v1/workspaces/workspace_foreign/images/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validGeneratePayload, workspaceId: 'workspace_foreign' });

    assertProblem(res, 403, 'UNAUTHORIZED');
    expect(requests).toHaveLength(0);
  });

  it('refuses invalid request schema with 400 INVALID_REQUEST', async () => {
    const res = await request(app)
      .post(generateEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ workspaceId: 'workspace_1', prompt: '' }); // missing selection

    assertProblem(res, 400, 'INVALID_REQUEST');
    expect(requests).toHaveLength(0);
  });

  it('refuses image generation in enterprise mode with 403 enterprise_mode', async () => {
    enterpriseModeEnabled = true;

    const res = await request(app)
      .post(generateEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send(validGeneratePayload);

    assertProblem(res, 403, 'enterprise_mode');
    expect(requests).toHaveLength(0);
  });

  it('authorizes PUT images/config and forwards to Agent Service', async () => {
    const res = await request(app)
      .put(configEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send(validConfigPayload)
      .expect(200);

    expect(res.body).toEqual(serviceConfigResult);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/agent/v1/workspaces/workspace_1/images/config');
    expect(requests[0].init.method).toBe('PUT');
  });

  it('refuses PUT images/config in enterprise mode with 403 enterprise_mode', async () => {
    enterpriseModeEnabled = true;

    const res = await request(app)
      .put(configEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send(validConfigPayload);

    assertProblem(res, 403, 'enterprise_mode');
    expect(requests).toHaveLength(0);
  });

  it('returns 404 NOT_IMPLEMENTED for unknown image routes', async () => {
    const res = await request(app)
      .get('/api/agent/v1/workspaces/workspace_1/images/unknown')
      .set('Authorization', `Bearer ${token}`);

    assertProblem(res, 404, 'NOT_IMPLEMENTED');
  });
});
