import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from '../host/canonical-routes.js';
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
  intent: 'credential-handoff', consent: true, selections,
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

let auth;
let clients;
let tunnel;
let app;
let token;
let clientId;
let policyEnabled;
let privateDir;
let credentialReads;

const createApp = () => {
  const originSecurity = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  const composed = express();
  registerCommonRequestMiddleware(composed, { express });
  composed.get('/auth/session', auth.handleSessionStatus);
  registerCanonicalHostRoutes(composed, {
    express, uiAuthController: auth, tunnelAuthController: tunnel,
    isRequestOriginAllowed: originSecurity.isRequestOriginAllowed,
    enterprisePolicyOptions: {
      env: {},
      readFile: () => JSON.stringify({ enterpriseMode: policyEnabled }),
    },
  });
  composed.use('/api', auth.requireAuth);
  composed.get('/api/private-retained-route', (_req, res) => res.json({ private: true }));
  return composed;
};

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
    list: async () => { credentialReads++; throw new Error('Secret source must not be read'); },
    listEnvironmentKeys: async () => { credentialReads++; throw new Error('Secret environment must not be read'); },
  });
  policyEnabled = false;
  app = createApp();
});
afterEach(() => {
  auth.dispose();
  configureOpenCodeCredentials(null);
  expect(credentialReads).toBe(0);
  fs.rmSync(privateDir, { recursive: true, force: true });
});
const pairedPreflight = (body = intent()) => request(app).post('/api/agent/v1/credentials/preflight')
  .set('Authorization', `Bearer ${token}`).send(body);

const loginCookie = async () => {
  const res = responseRecorder();
  // The actual password login issues a signed, port-scoped cookie.
  await auth.handleSessionCreate({ headers: { host: 'localhost:3000' }, body: { password: 'canonical-route-test' }, socket: { remoteAddress: '127.0.0.1' } }, {
    ...res, status() { return this; }, json() { return this; },
  });
  return String(res.headers.get('set-cookie')).split(';', 1)[0];
};

describe('canonical Host status and credential refusal', () => {
  it('keeps status public and the agent unavailable without weakening other API auth', async () => {
    const health = await request(app).get('/api/agent/v1/health');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', engine: 'omp', agent: { status: 'unavailable', ready: false } });
    expect(health.headers['set-cookie']).toBeUndefined();
    assertProblem(await request(app).get('/api/agent/v1/ready'), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await request(app).get('/api/agent/v1/capabilities'), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/models'), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/models').set('Authorization', `Bearer ${token}`), 503, 'SERVICE_UNAVAILABLE');
    await request(app).get('/api/private-retained-route').expect(401);
    const caps = await request(app).get('/api/agent/v1/capabilities').set('Authorization', `Bearer ${token}`);
    expect(caps.status).toBe(200);
    expect(caps.body.agent).toEqual({ status: 'unavailable', ready: false });
    expect(Object.values(caps.body.capabilities).every((value) => value === false)).toBe(true);
    expect(caps.body.limits).toBeUndefined();
    expect(JSON.stringify([health.body, caps.body])).not.toContain(privateDir);
    expect(JSON.stringify(caps.body)).not.toContain(token);
  });

  it('rejects internal secrets, URL credentials and revoked pairing credentials as external auth', async () => {
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('X-Internal-Secret', 'private-service-secret'), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get(`/api/agent/v1/capabilities?oc_client_token=${token}`), 401, 'UNAUTHORIZED');
    await clients.revokeClient(clientId);
    assertProblem(await pairedPreflight(), 401, 'UNAUTHORIZED');
  });

  it('bootstraps default passwordless Web without trusting unsigned cookies or promoting tokens', async () => {
    auth.dispose();
    auth = createUiAuth({ clientAuthController: clients });
    app = createApp();
    const unsigned = await request(app).get('/api/agent/v1/capabilities').set('Cookie', 'oc_ui_session=anonymous');
    assertProblem(unsigned, 401, 'UNAUTHORIZED');
    expect(unsigned.headers['set-cookie']).toBeUndefined();
    const bootstrap = await request(app).get('/auth/session').set('Host', 'localhost:3000');
    expect(bootstrap.body).toEqual({ authenticated: true, disabled: true });
    const cookie = bootstrap.headers['set-cookie'][0].split(';', 1)[0];
    await request(app).get('/api/agent/v1/capabilities').set('Host', 'localhost:3000').set('Cookie', cookie).expect(200);
    assertProblem(await pairedPreflight(), 503, 'SERVICE_UNAVAILABLE');
    auth.dispose();
    auth = createUiAuth({ password: 'canonical-route-test', clientAuthController: clients });
    app = createApp();
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'localhost:3000').set('Cookie', cookie), 401, 'UNAUTHORIZED');
  });

  it('enforces cookie mutation origins and refuses opaque Guest origins', async () => {
    const cookie = await loginCookie();
    const send = (origin) => request(app).post('/api/agent/v1/credentials/preflight')
      .set('Host', 'localhost:3000').set('Cookie', cookie).set('Origin', origin).send(intent());
    assertProblem(await send('http://localhost:3000'), 503, 'SERVICE_UNAVAILABLE');
    assertProblem(await send('https://untrusted.example'), 403, 'INVALID_ORIGIN');
    assertProblem(await send('null'), 403, 'INVALID_ORIGIN');
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight')
      .set('Host', 'localhost:3000').set('Cookie', cookie).send(intent()), 403, 'INVALID_ORIGIN');
    for (const origin of ['openchamber-ui://app', 'capacitor://localhost', 'https://localhost']) {
      assertProblem(await pairedPreflight().set('Origin', origin), 503, 'SERVICE_UNAVAILABLE');
    }
  });

  it('keeps tunnel authority distinct from cookies and paired tokens', async () => {
    tunnel.setActiveTunnel({ tunnelId: 'test-tunnel', publicUrl: 'https://tunnel.example' });
    const cookie = await loginCookie();
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'tunnel.example').set('Cookie', cookie), 401, 'UNAUTHORIZED');
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Host', 'tunnel.example').set('Authorization', `Bearer ${token}`), 401, 'UNAUTHORIZED');
    const issued = tunnel.issueBootstrapToken({ ttlMs: 60_000 });
    const res = responseRecorder();
    const result = tunnel.exchangeBootstrapToken({ req: { headers: { host: 'tunnel.example' }, socket: { remoteAddress: '127.0.0.1' } }, res, token: issued.token, sessionTtlMs: 60_000 });
    expect(result.ok).toBe(true);
    const tunnelCookie = String(res.headers.get('set-cookie')).split(';', 1)[0];
    const caps = await request(app).get('/api/agent/v1/capabilities').set('Host', 'tunnel.example').set('Cookie', tunnelCookie);
    expect(caps.status).toBe(200);
    tunnel.clearActiveTunnel();
    assertProblem(await request(app).get('/api/agent/v1/capabilities').set('Cookie', tunnelCookie), 401, 'UNAUTHORIZED');
  });

  it('requires explicit consent, bounded selections and nonsecret strict input', async () => {
    const missing = intent();
    delete missing.consent;
    const invalidBodies = [missing, { ...intent(), consent: false }, { ...intent(), selections: [] },
      { ...intent(), intent: 'import-all' }, { ...intent(), secret: 'private-marker' },
      intent([{ providerId: '/private/auth.json', source: 'stored-credential', credentialType: 'key' }]),
      intent([{ ...intent().selections[0], key: 'private-marker' }]),
      intent(Array.from({ length: 17 }, (_, index) => ({ providerId: `provider-${index}`, source: 'stored-credential', credentialType: 'key' })))];
    for (const body of invalidBodies) {
      const response = await pairedPreflight(body);
      assertProblem(response, 400, 'INVALID_REQUEST');
      expect(response.text).not.toContain('private-marker');
      expect(response.text).not.toContain('/private/auth.json');
    }
  });

  it('refuses absent service without fetching, staging or claiming imported', async () => {
    const before = fs.readdirSync(privateDir).sort();
    const response = await pairedPreflight(intent([
      { providerId: 'custom-proxy', source: 'stored-credential', credentialType: 'key' },
      { providerId: 'anthropic', source: 'stored-credential', credentialType: 'key' },
      { providerId: 'openai-codex', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'opencode', source: 'stored-credential', credentialType: 'oauth' },
      { providerId: 'google', source: 'external-environment', credentialType: 'key' },
      { providerId: 'google', source: 'managed-environment', credentialType: 'oauth' },
    ]));
    assertProblem(response, 503, 'SERVICE_UNAVAILABLE');
    expect(response.body.details.results.map(({ status, code }) => [status, code])).toEqual([
      ['unavailable', 'AGENT_SERVICE_UNAVAILABLE'], ['unavailable', 'PROVIDER_CONVERSION_UNVERIFIED'],
      ['re-auth-required', 'OAUTH_REAUTH_REQUIRED'], ['unsupported', 'CONSOLE_CREDENTIAL_UNSUPPORTED'],
      ['unavailable', 'LEGACY_ENVIRONMENT_UNAVAILABLE'],
      ['unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED'],
    ]);
    expect(response.body.details.results.some(({ status }) => status === 'imported')).toBe(false);
    expect(credentialReads).toBe(0);
    expect(fs.readdirSync(privateDir).sort()).toEqual(before);
  });

  it('reads enterprise provider-entry policy at use time', async () => {
    assertProblem(await pairedPreflight(), 503, 'SERVICE_UNAVAILABLE');
    policyEnabled = true;
    assertProblem(await pairedPreflight(), 403, 'enterprise_mode');
    policyEnabled = false;
    assertProblem(await pairedPreflight(), 503, 'SERVICE_UNAVAILABLE');
  });

  it('sanitizes malformed and oversized bodies into Problem Details', async () => {
    const send = (body) => request(app).post('/api/agent/v1/credentials/preflight')
      .set('Authorization', `Bearer ${token}`).set('Content-Type', 'application/json').send(body);
    const malformed = await send('{"secret":"private-marker"');
    assertProblem(malformed, 400, 'INVALID_REQUEST');
    expect(malformed.text).not.toContain('private-marker');
    assertProblem(await send(JSON.stringify({ secret: 'x'.repeat(17_000) })), 413, 'PAYLOAD_TOO_LARGE');
    assertProblem(await request(app).post('/api/agent/v1/credentials/preflight').set('Authorization', `Bearer ${token}`).type('form').send({ consent: true }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  });
});
