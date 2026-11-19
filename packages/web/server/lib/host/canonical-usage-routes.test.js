import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../server-frame/core-routes.js';
import * as fsPromises from 'node:fs/promises';

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-usage-auth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');
afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const selectedScope = {
  workspaceId: 'workspace_1', projectId: 'project_1', agentDirectoryId: 'agent_1',
  cwd: path.join(root, 'workspace'), agentDirectory: path.join(root, 'agent'),
};
let directory;
let app;
let auth;
let clients;
let token;
let requests;
let resolveCalls;
let workspaceQueries;
let workspaceErrors;
let servicePhase;
let requestService;

beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'usage test client' });
  token = created.token;
  auth = createUiAuth({ password: 'usage-route-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  requests = [];
  resolveCalls = [];
  workspaceQueries = [];
  workspaceErrors = {};
  servicePhase = 'ready';
  requestService = async (url, init) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    if (url === '/internal/usage/tools') return Response.json({ totals: { calls: 0, succeeded: 0, failed: 0, unfinished: 0 }, usage: [], partial: false });
    return Response.json({
      range: { from: body.query.from ?? body.query.to - 1, to: body.query.to }, sessions: 0, subagents: 0, prompts: 0, steps: 0,
      tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0, tools: { mode: 'none' },
      activeDays: 0, streak: 0, activity: [], models: [], partial: false,
    });
  };
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
    resolveWorkspaceScope: async workspaceId => {
      resolveCalls.push(workspaceId);
      return workspaceId === selectedScope.workspaceId ? selectedScope : null;
    },
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => null,
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [{ projectId: selectedScope.projectId, name: 'Project', workspaceIds: [selectedScope.workspaceId] }], errors: {} }),
    listWorkspaces: async projectId => {
      workspaceQueries.push(projectId);
      return { items: projectId === undefined || projectId === selectedScope.projectId
        ? [{ workspaceId: selectedScope.workspaceId, projectId: selectedScope.projectId, name: 'Project' }] : [], errors: workspaceErrors };
    },
    resolveCredentialHandoff: async () => { throw new Error('Usage must not read credentials'); },
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

const windowQuery = `from=1772869200000&to=1773129600000&timezone=America%2FNew_York`;

describe('canonical historical usage Host authorization', () => {
  it('forwards only Host-resolved canonical workspace scopes to cold usage service routes', async () => {
    const stats = await request(app).get(`/api/agent/v1/usage?${windowQuery}&workspaceId=${selectedScope.workspaceId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(stats.body).toMatchObject({ partial: false, range: { from: 1772869200000, to: 1773129600000 }, tokens: { reasoning: null } });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/internal/usage');
    expect(requests[0].init.method).toBe('POST');
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      query: { from: 1772869200000, to: 1773129600000, timezone: 'America/New_York', workspaceId: selectedScope.workspaceId },
      authorizedScopes: [{ workspaceId: selectedScope.workspaceId, projectId: selectedScope.projectId }],
    });

    const tools = await request(app).get(`/api/agent/v1/usage/tools?${windowQuery}&projectId=${selectedScope.projectId}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(tools.body).toMatchObject({ totals: { calls: 0 }, usage: [], partial: false });
    expect(requests[1].url).toBe('/internal/usage/tools');
    expect(JSON.parse(String(requests[1].init.body)).authorizedScopes).toEqual([{ workspaceId: selectedScope.workspaceId, projectId: selectedScope.projectId }]);
    expect(workspaceQueries).toEqual([selectedScope.projectId]);
  });

  it('refuses unauthenticated and unauthorized workspace queries before private forwarding', async () => {
    assertProblem(await request(app).get(`/api/agent/v1/usage?${windowQuery}`), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get(`/api/agent/v1/usage?${windowQuery}&workspaceId=workspace_foreign`).set('Authorization', `Bearer ${token}`), 403, 'UNAUTHORIZED');
    expect(requests).toEqual([]);
    expect(resolveCalls).toEqual(['workspace_foreign']);
  });

  it('rejects arbitrary filesystem paths, global stats database selectors, and invalid timezone filters', async () => {
    const cases = [
      `/api/agent/v1/usage?${windowQuery}&projectId=%2Ftmp%2Fsession.jsonl`,
      `/api/agent/v1/usage?to=1773129600000&timezone=UTC&projectId=~%2F.omp%2Fstats.db`,
      `/api/agent/v1/usage?to=1773129600000&timezone=Invalid%2FZone`,
    ];
    for (const candidate of cases) assertProblem(await request(app).get(candidate).set('Authorization', `Bearer ${token}`), 400, 'INVALID_REQUEST');
    expect(requests).toEqual([]);
  });

  it('defaults omitted end bounds and fails closed when Host workspace inventory is incomplete', async () => {
    const response = await request(app).get('/api/agent/v1/usage?timezone=UTC').set('Authorization', `Bearer ${token}`).expect(200);
    const forwarded = JSON.parse(String(requests[0].init.body));
    expect(forwarded.query.to).toBeGreaterThan(0);
    expect(forwarded.authorizedScopes).toEqual([{ workspaceId: selectedScope.workspaceId, projectId: selectedScope.projectId }]);
    expect(response.body.range.to).toBe(forwarded.query.to);

    requests.length = 0;
    workspaceErrors = { [selectedScope.workspaceId]: 'SESSION_RESTORE_FAILED' };
    assertProblem(await request(app).get('/api/agent/v1/usage?timezone=UTC').set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    expect(requests).toEqual([]);
  });
});
