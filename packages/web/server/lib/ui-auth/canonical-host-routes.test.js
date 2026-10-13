import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from '../host/canonical-routes.js';
import { createSelectedCredentialHandoff } from '../host/private-credential.js';
import { createTunnelAuth } from '../host/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { configureOpenCodeCredentials } from '../opencode/auth.js';
import { registerCommonRequestMiddleware } from '../opencode/core-routes.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpichamber-canonical-host-'));
const originalDataDir = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('./ui-auth.js');
afterAll(() => {
  if (originalDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDir;
  fs.rmSync(root, { recursive: true, force: true });
});
const intent = (selections = [{ providerId: 'custom-proxy', source: 'stored-credential', credentialType: 'key' }]) => ({
  intent: 'credential-handoff', consent: true, workspaceId: 'workspace_1', selections,
});
const assertProblem = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, code, type: `urn:ohpichamber:problem:${code}` });
  expect(response.body.error).toBeUndefined();
  expect(response.body.message).toBeUndefined();
};
const responseRecorder = () => {
  const headers = new Map();
  return { setHeader: (name, value) => headers.set(name.toLowerCase(), value), headers };
};
const capabilities = { version: '1.0.0', engine: 'omp', capabilities: {
  streaming: true, casApprovals: true, midTurnSteering: false, followUpQueue: false, subagents: false,
  attachments: false, models: true, providers: true, agents: true, mcp: true, skills: true, statelessCompletion: true, shells: true,
} };
let auth;
let clients;
let tunnel;
let app;
let token;
let clientId;
let policyEnabled;
let privateDir;
let credentialReads;
let servicePhase;
let requests;
let requestService;
let projectCatalog;
let workspaceCatalog;
let resolveScope;

function createApp() {
  const originSecurity = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  const composed = express();
  registerCommonRequestMiddleware(composed, { express });
  composed.get('/auth/session', auth.handleSessionStatus);
  const service = {
    getState: () => ({ phase: servicePhase, pid: 123, port: 456 }),
    request: async (url, init = {}) => { requests.push({ url, init }); return requestService(url, init); },
  };
  registerCanonicalHostRoutes(composed, {
    express, service, uiAuthController: auth, tunnelAuthController: tunnel,
    isRequestOriginAllowed: originSecurity.isRequestOriginAllowed,
    enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify({ enterpriseMode: policyEnabled }) },
    resolveWorkspaceScope: async id => resolveScope(id),
    resolveSessionScope: async id => id === 'session_1' ? resolveScope('workspace_1') : null,
    listProjects: async () => projectCatalog,
    listWorkspaces: async () => workspaceCatalog,
    resolveCredentialHandoff: createSelectedCredentialHandoff({ service, resolveWorkspaceScope: async id => resolveScope(id) }),
    queueRoutes: express.Router(), sessionRoutes: express.Router(), attachmentRoutes: express.Router(),
  });
  composed.use('/api', auth.requireAuth);
  composed.get('/api/private-retained-route', (_req, res) => res.json({ private: true }));
  return composed;
}
beforeEach(async () => {
  privateDir = fs.mkdtempSync(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises: fs.promises, path, crypto, storePath: path.join(privateDir, 'clients.json') });
  const created = await clients.createClient({ label: 'test client' });
  token = created.token;
  clientId = created.client.id;
  auth = createUiAuth({ password: 'canonical-route-test', clientAuthController: clients });
  tunnel = createTunnelAuth();
  credentialReads = 0;
  configureOpenCodeCredentials({
    list: async () => { credentialReads++; throw new Error('Legacy secret source must not be read'); },
    listEnvironmentKeys: async () => { credentialReads++; throw new Error('Legacy environment must not be read'); },
  });
  policyEnabled = false;
  servicePhase = 'failed';
  requests = [];
  requestService = async url => {
    if (url === '/api/agent/v1/ready') return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
    if (url === '/api/agent/v1/capabilities') return Response.json(capabilities);
    if (url === '/api/agent/v1/workspaces/workspace_1/models') return Response.json({ workspaceId: 'workspace_1', revision: '0', models: [] });
    throw new Error('Unexpected private service request');
  };
  projectCatalog = { items: [{ projectId: 'project_1', name: 'Project', workspaceIds: ['workspace_1'], displayPath: '.' }], errors: {} };
  workspaceCatalog = { items: [{ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace', displayPath: '.' }], errors: {} };
  resolveScope = async id => id === 'workspace_1' ? {
    workspaceId: id, projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: privateDir,
    agentDirectory: path.join(privateDir, 'agent'), label: 'Private label', rootSessionId: 'session_1', hostPrivateExtra: true,
  } : null;
  app = createApp();
});
afterEach(() => {
  auth.dispose();
  configureOpenCodeCredentials(null);
  expect(credentialReads).toBe(0);
  fs.rmSync(privateDir, { recursive: true, force: true });
});
const pairedPreflight = (body = intent()) => request(app).post('/api/agent/v1/credentials/preflight').set('Authorization', `Bearer ${token}`).send(body);
async function loginCookie() {
  const res = responseRecorder();
  await auth.handleSessionCreate({ headers: { host: 'localhost:3000' }, body: { password: 'canonical-route-test' }, socket: { remoteAddress: '127.0.0.1' } }, {
    ...res, status() { return this; }, json() { return this; },
  });
  return String(res.headers.get('set-cookie')).split(';', 1)[0];
}

describe('canonical Host authenticated real-service boundary', () => {
  it('keeps Host liveness separate from actual service readiness and capabilities', async () => {
    const health = await request(app).get('/api/agent/v1/health');
    expect(health.body).toEqual({ status: 'ok', engine: 'omp', agent: { status: 'failed', ready: false } });
    expect(health.headers['set-cookie']).toBeUndefined();
    assertProblem(await request(app).get('/api/agent/v1/ready'), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await request(app).get('/api/agent/v1/capabilities'), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    expect(requests).toHaveLength(0);
    await request(app).get('/api/private-retained-route').expect(401);
    servicePhase = 'ready';
    await request(app).get('/api/agent/v1/ready').expect(200, { ready: true, engine: 'omp', version: '1.0.0' });
    const caps = await request(app).get('/api/agent/v1/capabilities').set('Authorization', `Bearer ${token}`).expect(200);
    expect(caps.body.capabilities).toMatchObject({ streaming: true, followUpQueue: true, credentialHandoff: true });
    expect(caps.body.capabilities.subagents).toBe(false);
    expect(JSON.stringify(caps.body)).not.toContain(privateDir);
    expect(JSON.stringify(caps.body)).not.toContain(token);
  });
  it('rejects internal, URL and revoked pairing credentials', async () => {
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('X-Internal-Secret', 'private-service-secret'), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get(`/api/agent/v1/capabilities?oc_client_token=${token}`), 401, 'UNAUTHORIZED');
    await clients.revokeClient(clientId);
    assertProblem(await pairedPreflight(), 401, 'UNAUTHORIZED');
  });
  it('uses actual signed passwordless cookies but does not authenticate unsigned cookies', async () => {
    auth.dispose();
    auth = createUiAuth({ clientAuthController: clients });
    app = createApp();
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Cookie', 'oc_ui_session=anonymous'), 401, 'UNAUTHORIZED');
    const bootstrap = await request(app).get('/auth/session').set('Host', 'localhost:3000');
    expect(bootstrap.body).toEqual({ authenticated: true, disabled: true });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'localhost:3000').set('Cookie', cookie), 503, 'SERVICE_UNAVAILABLE');
    auth.dispose();
    auth = createUiAuth({ password: 'canonical-route-test', clientAuthController: clients });
    app = createApp();
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'localhost:3000').set('Cookie', cookie), 401, 'UNAUTHORIZED');
  });
  it('requires cookie/tunnel mutation Origins and allows only verified bearer clients to omit Origin', async () => {
    const cookie = await loginCookie();
    const send = origin => request(app).post('/api/agent/v1/credentials/preflight')
      .set('Host', 'localhost:3000').set('Cookie', cookie).set('Origin', origin).send(intent());
    assertProblem(await send('http://localhost:3000'), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await send('https://untrusted.example'), 403, 'INVALID_ORIGIN');
    assertProblem(await send('null'), 403, 'INVALID_ORIGIN');
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight').set('Host', 'localhost:3000').set('Cookie', cookie).send(intent()), 403, 'INVALID_ORIGIN');
    assertProblem(await pairedPreflight(), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await pairedPreflight().set('Origin', 'null'), 403, 'INVALID_ORIGIN');
    for (const origin of ['openchamber-ui://app', 'capacitor://localhost', 'https://localhost'])
      assertProblem(await pairedPreflight().set('Origin', origin), 503, 'SERVICE_UNAVAILABLE');
    tunnel.setActiveTunnel({ tunnelId: 'test-tunnel', publicUrl: 'https://tunnel.example' });
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'tunnel.example').set('Authorization', `Bearer ${token}`), 401, 'UNAUTHORIZED');
    const issued = tunnel.issueBootstrapToken({ ttlMs: 60_000 });
    const res = responseRecorder();
    tunnel.exchangeBootstrapToken({ req: { headers: { host: 'tunnel.example' }, socket: { remoteAddress: '127.0.0.1' } }, res, token: issued.token, sessionTtlMs: 60_000 });
    const tunnelCookie = String(res.headers.get('set-cookie')).split(';', 1)[0];
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight').set('Host', 'tunnel.example').set('Cookie', tunnelCookie).send(intent()), 403, 'INVALID_ORIGIN');
  });
  it('parses explicit consent and refuses absolute file paths, extra secrets and oversized bodies', async () => {
    servicePhase = 'ready';
    const invalidBodies = [{ ...intent(), consent: false }, { ...intent(), selections: [] }, { ...intent(), intent: 'import-all' },
      { ...intent(), secret: 'private-marker' }, intent([{ providerId: '/private/auth.json', source: 'stored-credential', credentialType: 'key' }]),
      intent([{ ...intent().selections[0], key: 'private-marker' }]),
      intent([{ providerId: 'custom-proxy', source: 'selected-file', credentialType: 'key', file: { path: '/private/auth.json' } }])];
    for (const body of invalidBodies) {
      const response = await pairedPreflight(body);
      assertProblem(response, 400, 'INVALID_REQUEST');
      expect(response.text).not.toContain('private-marker');
      expect(response.text).not.toContain('/private/auth.json');
    }
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight').set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json').send('{"secret":"private-marker"'), 400, 'INVALID_REQUEST');
    assertProblem(await pairedPreflight({ secret: 'x'.repeat(270_000) }), 413, 'PAYLOAD_TOO_LARGE');
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight').set('Authorization', `Bearer ${token}`).type('form').send({ consent: true }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });
  it('refuses service absence before selected-secret access and reads enterprise policy at use time', async () => {
    const before = fs.readdirSync(privateDir).sort();
    assertProblem(await pairedPreflight(), 503, 'SERVICE_UNAVAILABLE');
    expect(requests).toHaveLength(0);
    expect(fs.readdirSync(privateDir).sort()).toEqual(before);
    policyEnabled = true;
    assertProblem(await pairedPreflight(), 403, 'enterprise_mode');
    servicePhase = 'ready';
    assertProblem(await pairedPreflight(), 403, 'enterprise_mode');
    policyEnabled = false;
    const response = await pairedPreflight(intent([
      { providerId: 'custom-proxy', source: 'stored-credential', credentialType: 'key' },
      { providerId: 'openai-codex', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'opencode', source: 'stored-credential', credentialType: 'oauth' },
    ])).expect(207);
    expect(response.body.results.map(({ status, code }) => [status, code])).toEqual([
      ['unavailable', 'SELECTED_SOURCE_UNAVAILABLE'], ['re-auth-required', 'OAUTH_REAUTH_REQUIRED'], ['unsupported', 'CONSOLE_CREDENTIAL_UNSUPPORTED'],
    ]);
    expect(requests).toHaveLength(0);
  });
  it('admits known ready operations before parsing provider secrets and never parses unknown routes', async () => {
    const malformedCredential = () => request(app)
      .put('/api/agent/v1/workspaces/workspace_1/providers/custom-proxy/credential')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json')
      .send('{"credential":"private-marker"');
    assertProblem(await malformedCredential(), 503, 'SERVICE_UNAVAILABLE');
    servicePhase = 'ready';
    policyEnabled = true;
    assertProblem(await malformedCredential(), 403, 'enterprise_mode');
    policyEnabled = false;
    const invalid = await malformedCredential();
    assertProblem(invalid, 400, 'INVALID_REQUEST');
    expect(invalid.text).not.toContain('private-marker');
    assertProblem(await request(app).post('/api/agent/v1/internal/credentials')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json')
      .send('{"credential":"private-marker"'), 404, 'NOT_IMPLEMENTED');
    expect(requests).toHaveLength(0);
  });
  it('awaits and repacks Host scopes, never forwards caller private headers or unknown routes', async () => {
    servicePhase = 'ready';
    const models = await request(app).get('/api/agent/v1/workspaces/workspace_1/models').set('Authorization', `Bearer ${token}`)
      .set('X-Internal-Secret', 'caller-secret').set('X-OpenCode-Directory', privateDir).expect(200);
    expect(models.body).toEqual({ workspaceId: 'workspace_1', revision: '0', models: [] });
    expect(requests[0].init.headers).toEqual({ Accept: 'application/json' });
    expect(requests[0].url).toBe('/api/agent/v1/workspaces/workspace_1/models');
    assertProblem(await request(app).get('/api/agent/v1/internal/workers').set('Authorization', `Bearer ${token}`), 404, 'NOT_IMPLEMENTED');
    assertProblem(await request(app).get('/api/agent/v1/workspaces/sibling/models').set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/workspaces/workspace_1/models?cwd=/private').set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toHaveLength(1);
  });
  it('distinguishes authoritative catalog failure from empty success and rejects private DTO fields', async () => {
    workspaceCatalog = { items: [{ workspaceId: 'workspace_1', projectId: 'project_1', name: 'Private', displayPath: privateDir }], errors: {} };
    const denied = await request(app).get('/api/agent/v1/workspaces').set('Authorization', `Bearer ${token}`);
    assertProblem(denied, 503, 'SERVICE_UNAVAILABLE');
    expect(denied.text).not.toContain(privateDir);
    workspaceCatalog = { items: [], errors: { workspace_1: 'WORKSPACE_UNAVAILABLE' } };
    await request(app).get('/api/agent/v1/workspaces').set('Authorization', `Bearer ${token}`).expect(200, workspaceCatalog);
    servicePhase = 'ready';
    requestService = async () => Response.json({ workspaceId: 'workspace_1', revision: '0', models: [], cwd: privateDir });
    assertProblem(await request(app).get('/api/agent/v1/workspaces/workspace_1/models').set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
  });
  it('streams ordered SSE bytes and cancels the private request when the authenticated client disconnects', async () => {
    servicePhase = 'ready';
    let markCancelled;
    const cancelled = new Promise(resolve => { markCancelled = resolve; });
    const event = { type: 'session.status', sessionId: 'session_1', epoch: 'epoch_1', sequence: '1',
      timestamp: 1, runtimeStatus: 'idle', activeRunId: null };
    const wire = `id: epoch_1:1\nevent: session.status\ndata: ${JSON.stringify(event)}\n\n`;
    requestService = async (url, init) => {
      expect(url).toBe('/api/agent/v1/sessions/session_1/events?cursor=epoch_1%3A0');
      expect(init.headers).toEqual({ Accept: 'text/event-stream', 'Last-Event-ID': 'epoch_1:0' });
      init.signal.addEventListener('abort', () => markCancelled(), { once: true });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(wire)); } }),
        { headers: { 'Content-Type': 'text/event-stream' } });
    };
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const controller = new AbortController();
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agent/v1/sessions/session_1/events?cursor=epoch_1%3A0`, {
        headers: { Authorization: `Bearer ${token}`, 'Last-Event-ID': 'epoch_1:0' }, signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');
      const reader = response.body.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toBe(wire);
      controller.abort();
      await Promise.race([cancelled, new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Private stream was not cancelled')), 1_000))]);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
