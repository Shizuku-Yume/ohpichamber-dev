import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from '../host/canonical-routes.js';
import { createAgentServiceSupervisor } from '../host/agent-service-supervisor.js';
import { createSelectedCredentialHandoff } from '../host/private-credential.js';
import { createTunnelAuth } from '../host/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../host/core-routes.js';

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
let servicePhase;
let requests;
let requestService;
let projectCatalog;
let workspaceCatalog;
let resolveScope;
let localRegistrations;

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
    resolveWorkspaceDirectory: async directory => directory === '/workspace' ? { workspaceId: 'workspace_1', projectId: 'project_1', name: 'Workspace', displayPath: '/workspace' } : null,
    resolveSessionScope: async id => id === 'session_1' ? resolveScope('workspace_1') : null,
    resolveHostSessionScope: async id => id === 'session_1' ? resolveScope('workspace_1') : null,
    listProjects: async () => projectCatalog,
    listWorkspaces: async () => workspaceCatalog,
    resolveCredentialHandoff: createSelectedCredentialHandoff({ service, resolveWorkspaceScope: async id => resolveScope(id) }),
    queueRoutes: router => { localRegistrations.queue++; router.get('/sessions/:sessionId/queue', (_req, res) => res.sendStatus(204)); },
    sessionRoutes: router => { localRegistrations.session++; router.get('/:sessionId/history', (_req, res) => res.sendStatus(204)); },
    attachmentRoutes: router => { localRegistrations.attachment++; router.get('/:attachmentId', (_req, res) => res.sendStatus(204)); },
  });
  composed.use('/api', auth.requireAuth);
  composed.get('/api/private-retained-route', (_req, res) => res.json({ private: true }));
  return composed;
}
beforeEach(async () => {
  localRegistrations = { queue: 0, session: 0, attachment: 0 };
  privateDir = fs.mkdtempSync(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises: fs.promises, path, crypto, storePath: path.join(privateDir, 'clients.json') });
  const created = await clients.createClient({ label: 'test client' });
  token = created.token;
  clientId = created.client.id;
  auth = createUiAuth({ password: 'canonical-route-test', clientAuthController: clients });
  tunnel = createTunnelAuth();
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
  it('protects native search with real client authentication, origin, workspace and strict-body boundaries', async () => {
    servicePhase = 'ready';
    const endpoint = '/api/agent/v1/workspaces/workspace_1/web-search';
    assertProblem(await request(app).get(endpoint), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).set('Origin', 'null').send({ expectedRevision: '0', enabled: true }), 403, 'INVALID_ORIGIN');
    assertProblem(await request(app).get('/api/agent/v1/workspaces/foreign/web-search').set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', credentials: { exa: 'SECRET' } }), 400, 'INVALID_REQUEST');
    assertProblem(await request(app).put(`${endpoint}/credentials/exa`).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', providerId: 'kagi', apiKey: 'SECRET' }), 400, 'INVALID_REQUEST');
    expect(requests).toHaveLength(0);
  });

  it('blocks credential entry in enterprise mode but permits configuration and credential removal', async () => {
    servicePhase = 'ready';
    policyEnabled = true;
    const endpoint = '/api/agent/v1/workspaces/workspace_1/web-search';
    assertProblem(await request(app).put(`${endpoint}/credentials/exa`).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', providerId: 'exa', apiKey: 'SECRET' }), 403, 'enterprise_mode');
    expect(requests).toHaveLength(0);
    requestService = async () => Response.json({ type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'Worker unavailable', retryable: true }, { status: 503 });
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', enabled: false }), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await request(app).delete(`${endpoint}/credentials/openai%2Fgpt-5`).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', providerId: 'openai/gpt-5' }), 503, 'SERVICE_UNAVAILABLE');
    expect(requests).toHaveLength(2);
  });

  it('rejects secret-bearing and foreign-workspace search responses rather than exposing them', async () => {
    servicePhase = 'ready';
    const endpoint = '/api/agent/v1/workspaces/workspace_1/web-search';
    const state = { workspaceId: 'workspace_1', revision: '0', enabled: true, selectedProviderId: null, fallbackProviderIds: [], timeoutSeconds: 60, providers: [] };
    requestService = async () => Response.json({ ...state, key: 'SECRET' });
    const leaked = await request(app).get(endpoint).set('Authorization', `Bearer ${token}`);
    assertProblem(leaked, 503, 'SERVICE_UNAVAILABLE');
    expect(JSON.stringify(leaked.body)).not.toContain('SECRET');
    requestService = async () => Response.json({ state: { ...state, workspaceId: 'foreign' }, status: 'applied', persistence: 'persisted', workers: [] });
    assertProblem(await request(app).put(endpoint).set('Authorization', `Bearer ${token}`).send({ expectedRevision: '0', enabled: false }), 503, 'SERVICE_UNAVAILABLE');
  });

  it('authenticates every native provider management route before forwarding', async () => {
    servicePhase = 'ready';
    for (const [method, suffix, body] of [
      ['get', 'oauth-methods'], ['post', 'discover', { endpoint: 'https://provider.invalid/v1', protocol: 'responses' }],
      ['get', 'native/accounts'], ['post', 'native/accounts', { action: 'select', credentialRef: 'opaque', expectedRevision: '0' }],
      ['post', 'native/oauth', { action: 'start', expectedRevision: '0' }], ['get', 'native/config'],
    ]) {
      let call = request(app)[method](`/api/agent/v1/workspaces/workspace_1/providers/${suffix}`);
      if (body) call = call.send(body);
      assertProblem(await call, 401, 'UNAUTHORIZED');
    }
    expect(requests).toHaveLength(0);
  });
  it('gates OAuth entry actions at use time but permits cancellation, polling and existing account changes', async () => {
    servicePhase = 'ready';
    const identity = { flowId: 'flow', generation: 'generation' };
    const oauth = '/api/agent/v1/workspaces/workspace_1/providers/login-method/oauth';
    requestService = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.credentialRef) return Response.json({ revision: '1', providerId: 'stored-provider', accounts: [] });
      return Response.json({ ...identity, providerId: 'stored-provider', revision: '0', status: body.action === 'cancel' ? 'cancelled' : 'pending', manualInput: false });
    };
    policyEnabled = true;
    for (const body of [{ action: 'start', expectedRevision: '0' }, { action: 'input', ...identity, input: 'private-input' }, { action: 'commit', ...identity, expectedRevision: '0' }]) {
      const response = await request(app).post(oauth).set('Authorization', `Bearer ${token}`).send(body);
      assertProblem(response, 403, 'enterprise_mode');
      expect(response.text).not.toContain('private-input');
    }
    assertProblem(await request(app).post('/api/agent/v1/workspaces/workspace_1/providers/discover').set('Authorization', `Bearer ${token}`)
      .send({ endpoint: 'https://provider.invalid/v1', protocol: 'responses' }), 403, 'enterprise_mode');
    expect(requests).toHaveLength(0);
    for (const action of ['status', 'cancel']) await request(app).post(oauth).set('Authorization', `Bearer ${token}`).send({ action, ...identity }).expect(200);
    for (const action of ['select', 'remove', 'label']) await request(app).post('/api/agent/v1/workspaces/workspace_1/providers/stored-provider/accounts')
      .set('Authorization', `Bearer ${token}`).send({ action, expectedRevision: '0', credentialRef: 'opaque', ...(action === 'label' ? { label: 'Work' } : {}) }).expect(200);
    policyEnabled = false;
    await request(app).post(oauth).set('Authorization', `Bearer ${token}`).send({ action: 'start', expectedRevision: '0' }).expect(200);
    expect(requests).toHaveLength(6);
  });
  it('authorizes workspace MCP Settings independently of session admission and rejects foreign workspace access', async () => {
    servicePhase = 'ready';
    const configuration = { workspaceId: 'workspace_1', persistedRevision: '0', config: { servers: [] } };
    requestService = async () => Response.json(configuration);
    const endpoint = '/api/agent/v1/workspaces/workspace_1/mcp/config';
    assertProblem(await request(app).get(endpoint), 401, 'UNAUTHORIZED');
    expect(requests).toHaveLength(0);
    const response = await request(app).get(endpoint).set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual(configuration);
    assertProblem(await request(app).get('/api/agent/v1/workspaces/workspace_foreign/mcp/config').set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    expect(requests).toHaveLength(1);
  });
  it('keeps policy-authorized MCP secret and OAuth operations available in enterprise mode', async () => {
    servicePhase = 'ready';
    policyEnabled = true;
    const endpoint = '/api/agent/v1/workspaces/workspace_1/mcp/servers/server_1';
    requestService = async () => Response.json({ workspaceId: 'workspace_1', serverId: 'server_1', persistedRevision: '0', credentialRef: 'credential_1' });
    const response = await request(app).put(`${endpoint}/credentials`).set('Authorization', `Bearer ${token}`).send({ persistedRevision: '0', value: 'private-value' }).expect(200);
    expect(JSON.stringify(response.body)).not.toContain('private-value');
    expect(requests).toHaveLength(1);
    requestService = async () => Response.json({ serverId: 'server_1', worker: { rootSessionId: 'session_1', workspaceId: 'workspace_1', workerGeneration: 'generation_1' }, persistedRevision: '0', status: 'unauthenticated', authenticated: false });
    await request(app).post(`${endpoint}/oauth`).set('Authorization', `Bearer ${token}`).send({ action: 'disconnect', persistedRevision: '0', workerGeneration: 'generation_1' }).expect(200);
    expect(requests).toHaveLength(2);
  });

  it('preserves native MCP connection failure and rejects secret-bearing private responses', async () => {
    servicePhase = 'ready';
    const endpoint = '/api/agent/v1/workspaces/workspace_1/mcp/servers/server_1';
    const failed = { workspaceId: 'workspace_1', serverId: 'server_1', persistedRevision: '1', status: 'failed', error: { code: 'MCP_APPLY_FAILED', detail: 'Connection failed', retryable: true } };
    requestService = async () => Response.json(failed);
    const response = await request(app).post(`${endpoint}/test`).set('Authorization', `Bearer ${token}`).send({ persistedRevision: '1' }).expect(200);
    expect(response.body).toEqual(failed);
    requestService = async () => Response.json({ workspaceId: 'workspace_1', serverId: 'server_1', persistedRevision: '1', credentialRef: 'credential_1', value: 'private-value' });
    const refused = await request(app).put(`${endpoint}/credentials`).set('Authorization', `Bearer ${token}`).send({ persistedRevision: '1', value: 'private-value' });
    assertProblem(refused, 503, 'SERVICE_UNAVAILABLE');
    expect(JSON.stringify(refused.body)).not.toContain('private-value');
  });

  it('registers local owners once and mounts their relative routes behind authentication before native forwarding', async () => {
    expect(localRegistrations).toEqual({ queue: 1, session: 1, attachment: 1 });
    const paths = ['/api/agent/v1/sessions/session_1/queue', '/api/agent/v1/sessions/session_1/history', '/api/agent/v1/attachments/attachment_1'];
    for (const path of paths) {
      assertProblem(await request(app).get(path), 401, 'UNAUTHORIZED');
      await request(app).get(path).set('Authorization', `Bearer ${token}`).expect(204);
    }
    expect(localRegistrations).toEqual({ queue: 1, session: 1, attachment: 1 });
    expect(requests).toHaveLength(0);
  });
  it('forwards historical usage only through Host-authorized canonical scopes and rejects path-shaped queries', async () => {
    servicePhase = 'ready';
    const stats = { range: { from: 1, to: 2 }, sessions: 0, subagents: 0, prompts: 0, steps: 0,
      tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0,
      tools: { mode: 'none' }, activeDays: 0, streak: 0, activity: [], models: [], partial: false };
    requestService = async (url, init) => {
      expect(url).toBe('/internal/usage');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body).toEqual({ query: { from: 1, to: 2, timezone: 'UTC', workspaceId: 'workspace_1' }, authorizedScopes: [{ workspaceId: 'workspace_1', projectId: 'project_1' }] });
      expect(JSON.stringify(body)).not.toContain(privateDir);
      return Response.json(stats);
    };
    await request(app).get('/api/agent/v1/usage?from=1&to=2&timezone=UTC&workspaceId=workspace_1')
      .set('Authorization', `Bearer ${token}`).expect(200, stats);
    assertProblem(await request(app).get('/api/agent/v1/usage?from=1&to=2&timezone=UTC&workspaceId=workspace_foreign')
      .set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/usage?from=1&to=2&timezone=UTC&path=~%2F.omp%2Fstats.db')
      .set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toHaveLength(1);
  });
  it('loads tool usage through the separate canonical operation without accepting arbitrary filesystem scopes', async () => {
    servicePhase = 'ready';
    const tools = { totals: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 }, usage: [], partial: false };
    requestService = async (url, init) => {
      expect(url).toBe('/internal/usage/tools');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body).query.projectId).toBe('project_1');
      return Response.json(tools);
    };
    await request(app).get('/api/agent/v1/usage/tools?to=2&timezone=UTC&projectId=project_1')
      .set('Authorization', `Bearer ${token}`).expect(200, tools);
    assertProblem(await request(app).get('/api/agent/v1/usage/tools?to=2&timezone=UTC&projectId=%2Ftmp%2Fstats.db')
      .set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
  });
  it('queries real cold workers using only registered roots and children in the authorized global/project inventory', async () => {
    const state = path.join(privateDir, 'agent-state');
    const sessionDirectory = path.join(privateDir, 'sessions');
    const agentDirectory = path.join(privateDir, 'agent');
    fs.mkdirSync(state, { recursive: true });
    fs.mkdirSync(sessionDirectory);
    fs.mkdirSync(agentDirectory);
    const timestamp = Date.parse('2026-10-18T12:00:00Z');
    const files = {};
    const transcript = (name, input) => {
      const file = path.join(sessionDirectory, `${name}.jsonl`);
      files[name] = file;
      const userId = `${input.toString(16).padStart(6, '0')}01`;
      const assistantId = `${input.toString(16).padStart(6, '0')}02`;
      const rows = [
        { type: 'session', version: 3, id: `native-${name}`, cwd: privateDir, timestamp: new Date(timestamp).toISOString() },
        { type: 'message', id: userId, parentId: null, timestamp: new Date(timestamp).toISOString(), message: { role: 'user', content: 'Question', timestamp } },
        { type: 'message', id: assistantId, parentId: userId, timestamp: new Date(timestamp).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'Answer' }], api: 'openai-completions', provider: 'fixture', model: 'fixture', stopReason: 'stop', timestamp,
          usage: { input, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: input + 1, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } },
      ];
      fs.writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
      return file;
    };
    const reference = (id, workspaceId, projectId, input) => ({ rootSessionId: id, workspaceId, projectId, cwd: privateDir, agentDirectory,
      agentDirectoryId: 'usage-agent', sessionsDirectory: sessionDirectory, sessionFile: transcript(id, input), displayPath: '.', createdAt: timestamp, updatedAt: timestamp });
    const references = {
      first: reference('first', 'workspace_1', 'project_1', 10), second: reference('second', 'workspace_2', 'project_1', 20),
      foreign: reference('foreign', 'workspace_foreign', 'project_foreign', 900),
    };
    transcript('unregistered', 800);
    const childFile = transcript('native-child', 30);
    fs.writeFileSync(path.join(state, 'session-references.json'), JSON.stringify({ references, relocations: {}, subagents: {
      first: [{ subagentId: 'subagent_1', parentSessionId: 'first', childSessionId: 'canonical_child', rootSessionId: 'first',
        workspaceId: 'workspace_1', projectId: 'project_1', role: 'fixture', status: 'completed', sessionFile: childFile }],
    } }));
    const service = createAgentServiceSupervisor({ entrypoint: new URL('../../../../agent-service/src/index.ts', import.meta.url).pathname,
      dataDir: privateDir, env: { HOME: privateDir, XDG_CONFIG_HOME: path.join(privateDir, 'config'), XDG_DATA_HOME: path.join(privateDir, 'data') }, startupTimeoutMs: 30_000 });
    try {
      await service.start();
      for (const [workspaceId, projectId] of [['workspace_1', 'project_1'], ['workspace_2', 'project_1'], ['workspace_foreign', 'project_foreign']]) {
        const registered = await service.request(`/internal/workspaces/${workspaceId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, cwd: privateDir, agentDirectory, agentDirectoryId: 'usage-agent', env: { HOME: privateDir } }) });
        expect(registered.status).toBe(201);
      }
      servicePhase = 'ready';
      workspaceCatalog.items.push({ workspaceId: 'workspace_2', projectId: 'project_1', name: 'Second', displayPath: '.' });
      projectCatalog.items[0].workspaceIds.push('workspace_2');
      resolveScope = async workspaceId => ['workspace_1', 'workspace_2'].includes(workspaceId)
        ? { workspaceId, projectId: 'project_1', cwd: privateDir, agentDirectory, agentDirectoryId: 'usage-agent' } : null;
      requestService = (url, init) => service.request(url, init);
      const query = { from: timestamp - 1, to: timestamp + 1, timezone: 'UTC' };
      const usage = (suffix = '', values = {}) => request(app).get(`/api/agent/v1/usage${suffix}`).query({ ...query, ...values }).set('Authorization', `Bearer ${token}`);
      const all = await usage().expect(200);
      expect(all.body).toMatchObject({ sessions: 2, subagents: 1, prompts: 2, steps: 2, tokens: { input: 60, output: 3, total: 63, reasoning: null }, tools: { mode: 'none' }, partial: false });
      const project = await usage('', { projectId: 'project_1' }).expect(200);
      expect(project.body).toEqual(all.body);
      const workspace = await usage('', { workspaceId: 'workspace_1' }).expect(200);
      expect(workspace.body).toMatchObject({ sessions: 1, subagents: 1, tokens: { input: 40 } });
      const tools = await usage('/tools', { projectId: 'project_1' }).expect(200);
      expect(tools.body).toEqual({ totals: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 }, usage: [], partial: false });
      assertProblem(await usage('', { workspaceId: 'workspace_foreign' }), 403, 'UNAUTHORIZED');
      assertProblem(await usage('', { projectId: 'project_foreign' }), 403, 'UNAUTHORIZED');
      for (const values of [{ path: '~/.omp/stats.db' }, { sessionFile: files.foreign }, { projectId: files.foreign }, { directory: privateDir }, { timezone: 'not/a-timezone' }]) {
        const rejected = await usage('', values);
        assertProblem(rejected, 400, 'INVALID_REQUEST');
        expect(rejected.text).not.toContain(privateDir);
      }
      const rejectedScope = await service.request('/internal/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { ...query, workspaceId: 'workspace_foreign' }, authorizedScopes: [{ workspaceId: 'workspace_1', projectId: 'project_1' }] }) });
      expect(rejectedScope.status).toBe(403);
      const rejectedPath = await service.request('/internal/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: { ...query, path: '~/.omp/stats.db' }, authorizedScopes: [{ workspaceId: 'workspace_1', projectId: 'project_1' }] }) });
      expect(rejectedPath.status).toBe(400);
      expect(await rejectedPath.text()).not.toContain('~/.omp/stats.db');
      fs.writeFileSync(files.second, 'malformed\n');
      const partial = await usage().expect(200);
      expect(partial.body).toMatchObject({ sessions: 1, subagents: 1, tokens: { input: 40 }, partial: true, errors: { second: 'USAGE_SESSION_CORRUPT' } });
      assertProblem(await usage('', { workspaceId: 'workspace_2' }), 503, 'SERVICE_UNAVAILABLE');
      expect(partial.text).not.toContain(privateDir);
      const workers = await service.request('/internal/workers');
      expect((await workers.json()).workers.map(worker => worker.kind)).toEqual(['usage']);
      workspaceCatalog.errors = { workspace_2: 'WORKSPACE_UNAVAILABLE' };
      assertProblem(await usage(), 503, 'SERVICE_UNAVAILABLE');
    } finally { await service.stop(); }
  }, 90_000);
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
    expect(caps.body.capabilities).toMatchObject({ streaming: true, followUpQueue: true, credentialHandoff: true, documentExtraction: false });
    expect(caps.body.capabilities.subagents).toBe(false);
    expect(caps.body.capabilities.attachments).toBeUndefined();
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
  it('preserves credential scope refusal without exposing resolver details or treating it as an outage', async () => {
    servicePhase = 'ready';
    for (const [status, code] of [[403, 'UNAUTHORIZED'], [400, 'INVALID_REQUEST']]) {
      resolveScope = async () => { throw Object.assign(new Error(`${privateDir} private-marker`), { status, code }); };
      const response = await pairedPreflight();
      assertProblem(response, status, code);
      expect(response.text).not.toContain(privateDir);
      expect(response.text).not.toContain('private-marker');
    }
    resolveScope = async () => { throw new Error(`${privateDir} private-marker`); };
    const unavailable = await pairedPreflight();
    assertProblem(unavailable, 503, 'SERVICE_UNAVAILABLE');
    expect(unavailable.text).not.toContain('private-marker');
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
