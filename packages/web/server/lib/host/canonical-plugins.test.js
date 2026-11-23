import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';
import { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canonical-native-plugin-auth-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');
afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await fs.rm(root, { recursive: true, force: true });
});

let directory;
let service;
let auth;
let clients;
let app;
let token;
let clientId;
let policy;
let workspace;
let scopes;
const nativeEnvironment = (profile = '') => ({
  HOME: directory, USERPROFILE: directory, PI_CONFIG_DIR: '.omp', PI_PROFILE: profile, OMP_PROFILE: profile,
  XDG_CONFIG_HOME: path.join(directory, 'config'), XDG_DATA_HOME: path.join(directory, 'data'),
  XDG_STATE_HOME: path.join(directory, 'state'), XDG_CACHE_HOME: path.join(directory, 'cache'),
});
const endpoint = '/api/agent/v1/workspaces/plugin_workspace/plugins';

beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(root, 'case-'));
  workspace = path.join(directory, 'workspace');
  const agentDirectory = path.join(directory, 'agent');
  await fs.mkdir(workspace);
  await fs.mkdir(agentDirectory);
  clients = createRemoteClientAuthRuntime({ fsPromises: fs, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'Native plugin boundary' });
  token = created.token;
  clientId = created.client.id;
  auth = createUiAuth({ password: 'native-plugin-boundary', clientAuthController: clients });
  service = createAgentServiceSupervisor({
    bunPath: 'bun',
    entrypoint: fileURLToPath(new URL('../../../../agent-service/src/index.ts', import.meta.url)),
    dataDir: directory,
    env: nativeEnvironment(),
    startupTimeoutMs: 30_000,
  });
  await service.start();
  const registered = await service.request('/internal/workspaces/plugin_workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId: 'plugin_project', cwd: workspace, agentDirectory, agentDirectoryId: 'plugin_agent' }),
  });
  expect(registered.status).toBe(201);
  scopes = new Map([['plugin_workspace', {
    workspaceId: 'plugin_workspace', projectId: 'plugin_project',
    agentDirectoryId: 'plugin_agent', cwd: workspace, agentDirectory
  }]]);
  policy = { enterpriseMode: false };
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  app = express();
  registerCanonicalHostRoutes(app, {
    express, service, uiAuthController: auth, tunnelAuthController: createTunnelAuth(),
    isRequestOriginAllowed: security.isRequestOriginAllowed,
    enterprisePolicyOptions: { env: {}, readFile: () => JSON.stringify(policy) },
    resolveWorkspaceScope: async workspaceId => scopes.get(workspaceId) ?? null,
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => null,
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Plugin routes cannot read credentials'); },
    queueRoutes: () => { }, sessionRoutes: () => { }, attachmentRoutes: () => { },
  });
}, 45_000);
afterEach(async () => {
  auth?.dispose();
  await service?.stop();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
}, 30_000);
const authorized = req => req.set('Authorization', `Bearer ${token}`);
const problem = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, code });
};

describe('native plugin Host authorization and enterprise boundary', () => {
  it('requires real client credentials and the authorized workspace for catalog reads', async () => {
    problem(await request(app).get(endpoint), 401, 'UNAUTHORIZED');
    problem(await request(app).get(`${endpoint}?oc_client_token=${token}`), 401, 'UNAUTHORIZED');
    problem(await authorized(request(app).get('/api/agent/v1/workspaces/foreign_workspace/plugins')), 403, 'UNAUTHORIZED');
    problem(await request(app).get(`${endpoint}/lifecycle`), 401, 'UNAUTHORIZED');
    problem(await authorized(request(app).get('/api/agent/v1/workspaces/foreign_workspace/plugins/lifecycle')), 403, 'UNAUTHORIZED');
    await authorized(request(app).get(endpoint)).expect(200);
    await clients.revokeClient(clientId);
    problem(await authorized(request(app).get(endpoint)), 401, 'UNAUTHORIZED');
  }, 60_000);

  it('keeps lifecycle metadata opt-in and rejects stale configure requests and directory installs', async () => {
    const initial = (await authorized(request(app).get(endpoint)).expect(200)).body;
    const lifecycle = (await authorized(request(app).get(`${endpoint}/lifecycle`)).expect(200)).body;
    expect(lifecycle).toEqual({ workspaceId: initial.workspaceId, revision: initial.revision, projectWritable: true, plugins: [] });
    expect(initial).not.toHaveProperty('projectWritable');
    problem(await authorized(request(app).post(`${endpoint}/install`)).send({
      expectedRevision: initial.revision, source: { kind: 'local-directory', path: '.' }
    }), 400, 'INVALID_REQUEST');
    const payload = { expectedRevision: '42', target: { kind: 'package', name: 'fixture' }, settingsScope: 'workspace', enabledFeatures: [] };
    problem(await authorized(request(app).patch(`${endpoint}/fixture`)).send(payload), 409, 'CATALOG_CONFLICT');
    problem(await authorized(request(app).patch(`${endpoint}/other`)).send(payload), 400, 'INVALID_REQUEST');
    policy.enterpriseMode = true;
    expect((await authorized(request(app).get(`${endpoint}/lifecycle`)).expect(200)).body).toEqual(lifecycle);
    problem(await authorized(request(app).post(`${endpoint}/install`)).send({
      expectedRevision: initial.revision, source: { kind: 'local-directory', path: '.' }
    }), 403, 'enterprise_mode');
    expect((await authorized(request(app).get(endpoint)).expect(200)).body).toEqual(initial);
  }, 60_000);

  it('rechecks enterprise authority for every package-manager or marketplace request', async () => {
    policy.enterpriseMode = true;
    const initial = (await authorized(request(app).get(endpoint)).expect(200)).body;
    for (const operation of [
      () => authorized(request(app).post(`${endpoint}/install`)).send({ expectedRevision: '0', source: { kind: 'package', spec: 'native-boundary-never-fetch' } }),
      () => authorized(request(app).post(`${endpoint}/uninstall`)).send({ expectedRevision: '0', target: { kind: 'package', name: 'native-boundary-never-fetch' } }),
      () => authorized(request(app).post(`${endpoint}/native-boundary-never-fetch/update`)).send({ expectedRevision: '0', target: { kind: 'package', name: 'native-boundary-never-fetch' } }),
      () => authorized(request(app).get(`${endpoint}/marketplace`)),
    ]) problem(await operation(), 403, 'enterprise_mode');
    await authorized(request(app).get(endpoint)).expect(200);
    expect((await authorized(request(app).get(endpoint)).expect(200)).body).toEqual(initial);
    policy.enterpriseMode = false;
    problem(await authorized(request(app).post(`${endpoint}/install`)).send({}), 400, 'INVALID_REQUEST');
    policy.enterpriseMode = true;
    problem(await authorized(request(app).post(`${endpoint}/install`)).send({}), 403, 'enterprise_mode');
  }, 60_000);

  it('keeps local authoring available in enterprise mode and refuses writes before persistence', async () => {
    policy.enterpriseMode = true;
    const catalog = (await authorized(request(app).get(endpoint)).expect(200)).body;
    const extensionId = 'boundary.ts';
    const content = 'export default function () {}\n';
    const payload = { expectedRevision: catalog.revision, extensionId, content };
    const local = `${endpoint}/local/${extensionId}`;
    problem(await request(app).put(local).send(payload), 401, 'UNAUTHORIZED');
    problem(await authorized(request(app).put(local)).set('Origin', 'https://untrusted.example').send(payload), 403, 'INVALID_ORIGIN');
    problem(await authorized(request(app).put(local)).send({ ...payload, extensionId: 'other.ts' }), 400, 'INVALID_REQUEST');
    problem(await authorized(request(app).put(local)).send({ ...payload, expectedRevision: '-1' }), 400, 'INVALID_REQUEST');
    problem(await authorized(request(app).put(local)).send({ ...payload, cwd: '/outside' }), 400, 'INVALID_REQUEST');
    const unchanged = (await authorized(request(app).get(endpoint)).expect(200)).body;
    expect(unchanged.revision).toBe(catalog.revision);
    expect(unchanged.localExtensions).toEqual([]);
    const written = (await authorized(request(app).put(local)).send(payload).expect(200)).body;
    expect(written.persistence).toBe('committed');
    expect(written.revision).not.toBe(catalog.revision);
    expect(written.status).toBe('no-active-workers');
    expect(await fs.readFile(path.join(workspace, '.omp', 'extensions', extensionId), 'utf8')).toBe(content);
    const source = (await authorized(request(app).get(local)).expect(200)).body;
    expect(source.content).toBe(content);
    expect(source.revision).toBe(written.revision);
    const applied = (await authorized(request(app).post(`${endpoint}/apply`)).send({ expectedRevision: written.revision, strategy: 'restart-idle-sessions' }).expect(200)).body;
    expect(applied.revision).toBe(written.revision);
    expect(applied.status).toBe('no-active-workers');
    const conflict = await authorized(request(app).delete(local)).send({ expectedRevision: catalog.revision, extensionId });
    expect(conflict.status).toBe(409);
    expect(await fs.readFile(path.join(workspace, '.omp', 'extensions', extensionId), 'utf8')).toBe(content);
    await authorized(request(app).delete(local)).send({ expectedRevision: written.revision, extensionId }).expect(200);
    expect(await fs.stat(path.join(workspace, '.omp', 'extensions', extensionId)).then(() => true, error => {
      if (error.code === 'ENOENT') return false;
      throw error;
    })).toBe(false);
  }, 60_000);
});

it('shares native plugin CAS across distinct agent directories while keeping provider CAS and named profiles independent', async () => {
  // A named profile owns its agent directory (agent-service native-runtime),
  // so a workspace run under a profile registers that directory, not an
  // arbitrary one: the Host scope and the worker storage are the same place.
  const profileAgentDirectory = (profile) => path.join(directory, '.omp', 'profiles', profile, 'agent');
  const registerWorkspace = async (workspaceId, agentDirectoryId, profile = '', sharedCwd) => {
    const cwd = sharedCwd ?? path.join(directory, workspaceId);
    const agentDirectory = profile ? profileAgentDirectory(profile) : path.join(directory, agentDirectoryId);
    if (sharedCwd === undefined) await fs.mkdir(cwd);
    await fs.mkdir(agentDirectory, { recursive: true });
    const scope = { workspaceId, projectId: 'plugin_project', agentDirectoryId, cwd, agentDirectory };
    const response = await service.request(`/internal/workspaces/${workspaceId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: scope.projectId, agentDirectoryId, cwd, agentDirectory, env: nativeEnvironment(profile) }),
    });
    expect(response.status).toBe(201);
    scopes.set(workspaceId, scope);
    return scope;
  };
  const sibling = await registerWorkspace('plugin_sibling_workspace', 'plugin_sibling_agent');
  const separate = await registerWorkspace('plugin_profile_workspace', 'plugin_profile_agent', 'plugin-test-profile');
  const sharedSource = await registerWorkspace('plugin_shared_source_workspace', 'plugin_shared_source_agent', 'shared-source-profile', workspace);
  const sharedSourceBase = `/api/agent/v1/workspaces/${sharedSource.workspaceId}`;
  expect((await authorized(request(app).get(`${sharedSourceBase}/plugins`)).expect(200)).body.revision).toBe('0');
  const siblingBase = `/api/agent/v1/workspaces/${sibling.workspaceId}`;
  const profileBase = `/api/agent/v1/workspaces/${separate.workspaceId}`;
  const first = (await authorized(request(app).get(endpoint)).expect(200)).body;
  const second = (await authorized(request(app).get(`${siblingBase}/plugins`)).expect(200)).body;
  expect(first.revision).toBe('0');
  expect(second.revision).toBe('0');
  const content = 'export default function () {}\n';
  const committed = (await authorized(request(app).put(`${endpoint}/local/owner-proof.ts`))
    .send({ expectedRevision: '0', extensionId: 'owner-proof.ts', content }).expect(200)).body;
  expect(committed.revision).toBe('1');
  const siblingCatalog = (await authorized(request(app).get(`${siblingBase}/plugins`)).expect(200)).body;
  expect(siblingCatalog.revision).toBe('1');
  expect(siblingCatalog.localExtensions).toEqual([]);
  const sharedCatalog = (await authorized(request(app).get(`${sharedSourceBase}/plugins`)).expect(200)).body;
  expect(sharedCatalog.revision).toBe('1');
  expect(sharedCatalog.localExtensions).toContainEqual({ extensionId: 'owner-proof.ts', relativePath: '.omp/extensions/owner-proof.ts' });
  problem(await authorized(request(app).put(`${sharedSourceBase}/plugins/local/shared-stale-proof.ts`))
    .send({ expectedRevision: '0', extensionId: 'shared-stale-proof.ts', content }), 409, 'CATALOG_CONFLICT');
  problem(await authorized(request(app).put(`${siblingBase}/plugins/local/stale-proof.ts`))
    .send({ expectedRevision: '0', extensionId: 'stale-proof.ts', content }), 409, 'CATALOG_CONFLICT');
  expect(await fs.stat(path.join(sibling.cwd, '.omp', 'extensions', 'stale-proof.ts')).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  })).toBe(false);
  for (const base of ['/api/agent/v1/workspaces/plugin_workspace', siblingBase, profileBase, sharedSourceBase]) {
    expect((await authorized(request(app).get(`${base}/providers`)).expect(200)).body.revision).toBe('0');
  }
  const separateCatalog = (await authorized(request(app).get(`${profileBase}/plugins`)).expect(200)).body;
  expect(separateCatalog.revision).toBe('0');
  expect(separateCatalog.localExtensions).toEqual([]);
  expect((await authorized(request(app).get(endpoint)).expect(200)).body.revision).toBe('1');
}, 60_000);

it('re-registering a workspace keeps its native owner catalog and refuses a different agent directory', async () => {
  const scope = scopes.get('plugin_workspace');
  expect((await authorized(request(app).get(endpoint)).expect(200)).body.revision).toBe('0');
  await authorized(request(app).put(`${endpoint}/local/rebind-proof.ts`)).send({
    expectedRevision: '0',
    extensionId: 'rebind-proof.ts', content: 'export default function () {}\n'
  }).expect(200);

  // The same workspace re-registered with its own directory keeps the cached
  // owner and the catalog it already persisted, instead of starting over.
  const repeated = await service.request('/internal/workspaces/plugin_workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: scope.projectId, agentDirectoryId: scope.agentDirectoryId,
      cwd: scope.cwd, agentDirectory: scope.agentDirectory, env: nativeEnvironment('')
    }),
  });
  expect(repeated.status).toBe(201);
  expect((await authorized(request(app).get(endpoint)).expect(200)).body).toMatchObject({
    revision: '1',
    localExtensions: [{ extensionId: 'rebind-proof.ts', relativePath: '.omp/extensions/rebind-proof.ts' }],
  });
  expect((await authorized(request(app).get('/api/agent/v1/workspaces/plugin_workspace/providers')).expect(200)).body.revision).toBe('0');

  // A named profile owns its agent directory (agent-service native-runtime),
  // so pointing this workspace at a profile directory would relabel the
  // cached native owner: registration refuses instead of doing that quietly.
  const rebindProfileAgentDirectory = path.join(directory, '.omp', 'profiles', 'rebound-plugin-profile', 'agent');
  await fs.mkdir(rebindProfileAgentDirectory, { recursive: true });
  await expect(service.request('/internal/workspaces/plugin_workspace', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: scope.projectId, agentDirectoryId: 'plugin_profile_agent',
      cwd: scope.cwd, agentDirectory: rebindProfileAgentDirectory, env: nativeEnvironment('rebound-plugin-profile')
    }),
  })).rejects.toThrow('Host workspace scope cannot change');
}, 60_000);
