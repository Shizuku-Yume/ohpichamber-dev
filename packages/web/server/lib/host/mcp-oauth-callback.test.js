import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { createMcpOAuthPendingFlows } from './mcp-oauth-callback.js';
import { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../server-frame/core-routes.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-mcp-oauth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');

afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const STATE = 'issued-state-value';
const FLOW_ID = 'flow_1';
const workspaceId = 'workspace_1';
const serverId = 'server_1';
const startEndpoint = `/api/agent/v1/workspaces/${workspaceId}/mcp/servers/${serverId}/oauth`;
const callbackEndpoint = '/api/agent/v1/mcp/oauth/callback';

const pendingResult = {
  serverId,
  worker: { rootSessionId: 'root_1', workspaceId, workerGeneration: 'generation_1' },
  persistedRevision: '3',
  status: 'pending',
  authenticated: false,
  pendingFlow: {
    flowId: FLOW_ID,
    authorizationUrl: `https://provider.example/authorize?client_id=public&state=${STATE}`,
  },
};

const authenticatedResult = {
  serverId,
  worker: pendingResult.worker,
  persistedRevision: '3',
  status: 'authenticated',
  authenticated: true,
};

let directory;
let app;
let auth;
let clients;
let token;
let requests;
let servicePhase;
let enterpriseModeEnabled;
let onProxy;

beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  token = (await clients.createClient({ label: 'mcp oauth test client' })).token;
  auth = createUiAuth({ password: 'mcp-oauth-route-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  requests = [];
  servicePhase = 'ready';
  enterpriseModeEnabled = false;
  onProxy = (url, init) => (JSON.parse(init.body).action === 'start' ? pendingResult : authenticatedResult);

  app = express();
  registerCommonRequestMiddleware(app, { express });
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: servicePhase }),
      request: async (url, init) => {
        requests.push({ url, init });
        const value = onProxy(url, init);
        return value instanceof Response ? value : Response.json(value);
      },
    },
    uiAuthController: auth,
    tunnelAuthController: createTunnelAuth(),
    isRequestOriginAllowed: security.isRequestOriginAllowed,
    enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify({ enterpriseMode: enterpriseModeEnabled }) },
    resolveWorkspaceScope: async (id) => (id === workspaceId
      ? { workspaceId, projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: path.join(directory, 'agent') }
      : null),
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => { throw new Error('MCP OAuth must not require session admission'); },
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('MCP OAuth must not read credentials'); },
    queueRoutes: () => { },
    sessionRoutes: () => { },
    attachmentRoutes: () => { },
  });
});

afterEach(async () => {
  auth.dispose();
  await rm(directory, { recursive: true, force: true });
});

const startSignIn = () => request(app)
  .post(startEndpoint)
  .set('Authorization', `Bearer ${token}`)
  .send({ action: 'start', persistedRevision: '3', workerGeneration: 'generation_1' });

describe('MCP OAuth Host callback route', () => {
  it('completes a start flow exactly once from the public callback', async () => {
    await startSignIn().expect(200);

    const completed = await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`).expect(200);
    expect(completed.headers['content-type']).toContain('text/html');
    expect(completed.text).toContain('Sign-in complete');

    const completeCall = requests.find(entry => JSON.parse(entry.init.body).action === 'complete');
    expect(completeCall.url).toBe(startEndpoint);
    const body = JSON.parse(completeCall.init.body);
    expect(body).toMatchObject({
      action: 'complete', persistedRevision: '3', workerGeneration: 'generation_1', flowId: FLOW_ID,
    });
    // The callback URL is rebuilt from what the Host knows, never from a client target.
    expect(body.callbackInput).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+${callbackEndpoint}\\?code=the-code&state=${STATE}$`));

    const replayed = await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`).expect(400);
    expect(replayed.text).toContain('already used');
    expect(requests.filter(entry => JSON.parse(entry.init.body).action === 'complete')).toHaveLength(1);
  });

  it('ignores a spoofed forwarded host from a direct client', async () => {
    await startSignIn().expect(200);

    await request(app)
      .get(`${callbackEndpoint}?code=the-code&state=${STATE}`)
      .set('X-Forwarded-Host', 'attacker.example')
      .set('X-Forwarded-Proto', 'https')
      .expect(200);

    const completeCall = requests.find(entry => JSON.parse(entry.init.body).action === 'complete');
    const body = JSON.parse(completeCall.init.body);
    // The app does not trust a direct client as a proxy, so `req.host` and
    // `req.protocol` keep the real address and the spoofed pair never lands in
    // the callback input the worker exchanges.
    expect(body.callbackInput).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+${callbackEndpoint}\\?code=the-code&state=${STATE}$`));
    expect(body.callbackInput).not.toContain('attacker.example');
  });

  it('refuses an unknown state without touching the Agent Service', async () => {
    await startSignIn().expect(200);
    requests.length = 0;

    const res = await request(app).get(`${callbackEndpoint}?code=the-code&state=not-issued`).expect(400);
    expect(res.text).toContain('invalid');
    expect(requests).toHaveLength(0);
  });

  it('does not register a pending flow whose authorization URL has no state', async () => {
    onProxy = () => ({ ...pendingResult, pendingFlow: { ...pendingResult.pendingFlow, authorizationUrl: 'https://provider.example/authorize?client_id=public' } });
    await startSignIn().expect(200);
    requests.length = 0;

    await request(app).get(`${callbackEndpoint}?code=the-code&state=`).expect(400);
    expect(requests).toHaveLength(0);
  });

  it('shows the provider error and its description, escaped', async () => {
    await startSignIn().expect(200);
    const res = await request(app)
      .get(`${callbackEndpoint}?error=access_denied&error_description=${encodeURIComponent('<b>User refused</b>')}&state=${STATE}`)
      .expect(400);
    expect(res.text).toContain('&lt;b&gt;User refused&lt;/b&gt;');
    expect(res.text).not.toContain('<b>User refused</b>');
  });

  it('reads an expired state as unknown', async () => {
    let clock = 0;
    const pendingFlows = createMcpOAuthPendingFlows({ currently: () => clock, ttlMs: 1_000 });
    const entry = pendingFlows.record({
      authorizationUrl: 'https://provider.example/authorize?state=fresh', completionPath: startEndpoint,
      workspaceId, serverId, flowId: FLOW_ID, persistedRevision: '3', workerGeneration: 'generation_1',
    });
    expect(entry).not.toBeNull();
    expect(pendingFlows.take('fresh')).not.toBeNull();
    pendingFlows.record({
      authorizationUrl: 'https://provider.example/authorize?state=fresh', completionPath: startEndpoint,
      workspaceId, serverId, flowId: FLOW_ID, persistedRevision: '3', workerGeneration: 'generation_1',
    });
    clock = 1_001;
    expect(pendingFlows.take('fresh')).toBeNull();
    expect(pendingFlows.size()).toBe(0);
  });

  it('bounds the map and drops a settled server’s states', () => {
    const pendingFlows = createMcpOAuthPendingFlows({ maxEntries: 2 });
    for (const state of ['one', 'two', 'three']) {
      pendingFlows.record({
        authorizationUrl: `https://provider.example/authorize?state=${state}`, completionPath: startEndpoint,
        workspaceId, serverId, flowId: `flow-${state}`, persistedRevision: '3', workerGeneration: 'generation_1',
      });
    }
    expect(pendingFlows.size()).toBe(2);
    expect(pendingFlows.take('one')).toBeNull();
    expect(pendingFlows.take('three')).not.toBeNull();

    pendingFlows.record({
      authorizationUrl: 'https://provider.example/authorize?state=four', completionPath: startEndpoint,
      workspaceId, serverId, flowId: 'flow-four', persistedRevision: '3', workerGeneration: 'generation_1',
    });
    pendingFlows.dropServer(workspaceId, serverId);
    expect(pendingFlows.size()).toBe(0);
  });

  it('ignores a duplicate state so a second start cannot retarget the first flow', () => {
    const pendingFlows = createMcpOAuthPendingFlows();
    const record = () => ({
      authorizationUrl: `https://provider.example/authorize?state=${STATE}`, completionPath: startEndpoint,
      workspaceId, serverId, flowId: FLOW_ID, persistedRevision: '3', workerGeneration: 'generation_1',
    });
    expect(pendingFlows.record(record())).not.toBeNull();
    expect(pendingFlows.record(record())).toBeNull();
    expect(pendingFlows.size()).toBe(1);
  });

  it('reports a failing complete as a readable page and a non-2xx status', async () => {
    await startSignIn().expect(200);
    onProxy = () => Response.json({ type: 'urn:ohpichamber:problem:INVALID_REQUEST', title: 'Request refused', status: 400, code: 'INVALID_REQUEST', detail: 'Provider rejected the token exchange.', retryable: false }, { status: 400 });
    servicePhase = 'ready';

    // A worker failure answers the Host with its own Problem Details; the page keeps the sentence.
    const res = await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`);
    expect(res.status).toBe(502);
    expect(res.text).toContain('Provider rejected the token exchange.');
    expect(res.text).not.toContain('the-code');
  });

  it('refuses the callback in enterprise mode with 403 enterprise_mode', async () => {
    enterpriseModeEnabled = true;
    await startSignIn().expect(403);
    requests.length = 0;

    const res = await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`);
    expect(res.status).toBe(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 403, code: 'enterprise_mode' });
    expect(requests).toHaveLength(0);
  });

  it('refuses starting a sign-in in enterprise mode before forwarding', async () => {
    enterpriseModeEnabled = true;
    const res = await startSignIn();
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403, code: 'enterprise_mode' });
    expect(requests).toHaveLength(0);
  });

  it('completes a session-scoped start through the session route it started on', async () => {
    const sessionEndpoint = '/api/agent/v1/sessions/session_1/mcp/servers/server_1/oauth';
    app = express();
    registerCommonRequestMiddleware(app, { express });
    registerCanonicalHostRoutes(app, {
      express,
      service: {
        getState: () => ({ phase: 'ready' }),
        request: async (url, init) => {
          requests.push({ url, init });
          return Response.json(onProxy(url, init));
        },
      },
      uiAuthController: auth,
      tunnelAuthController: createTunnelAuth(),
      isRequestOriginAllowed: (await createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) })).isRequestOriginAllowed,
      enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify({ enterpriseMode: false }) },
      resolveWorkspaceScope: async () => null,
      resolveWorkspaceDirectory: async () => null,
      resolveSessionScope: async (id) => (id === 'session_1'
        ? { sessionId: 'session_1', rootSessionId: 'session_1', projectId: 'project_1', workspaceId, agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: path.join(directory, 'agent') }
        : null),
      resolveHostSessionScope: async () => null,
      listProjects: async () => ({ items: [], errors: {} }),
      listWorkspaces: async () => ({ items: [], errors: {} }),
      resolveCredentialHandoff: async () => { throw new Error('unused'); },
      queueRoutes: () => { },
      sessionRoutes: () => { },
      attachmentRoutes: () => { },
    });

    requests.length = 0;
    await request(app)
      .post(sessionEndpoint)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'start', persistedRevision: '3', workerGeneration: 'generation_1' })
      .expect(200);
    await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`).expect(200);
    const completeCall = requests.find(entry => JSON.parse(entry.init.body).action === 'complete');
    expect(completeCall.url).toBe(sessionEndpoint);
  });

  it('refuses to complete when the Agent Service is not running', async () => {
    await startSignIn().expect(200);
    servicePhase = 'starting';
    requests.length = 0;

    const res = await request(app).get(`${callbackEndpoint}?code=the-code&state=${STATE}`);
    expect(res.status).toBe(503);
    expect(res.text).toContain('not running');
    expect(requests).toHaveLength(0);
  });
});
