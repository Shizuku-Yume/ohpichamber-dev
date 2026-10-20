import { afterAll, describe, expect, it } from 'bun:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { registerAuthAndAccessRoutes } from './core-routes.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';

// The packaged desktop shell bootstraps its local credential with a
// cookie-less POST to this route before any renderer request runs. These cases
// drive the real route, the real UI auth controller, and the real client store
// so the Electron helper's contract is verified against the owning server
// behavior instead of a hand-written echo.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-client-bootstrap-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');

afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await fs.rm(root, { recursive: true, force: true });
});

let caseNumber = 0;

const createHarness = async ({ password, requireClientAuth = false } = {}) => {
  caseNumber += 1;
  const directory = path.join(root, `case-${caseNumber}`);
  await fs.mkdir(directory, { recursive: true });
  const clients = createRemoteClientAuthRuntime({
    fsPromises: fs,
    path,
    crypto,
    storePath: path.join(directory, 'clients.json'),
  });
  const uiAuthController = createUiAuth({
    password,
    requireClientAuth,
    clientAuthController: clients,
    readSettingsFromDiskMigrated: async () => ({}),
  });
  const app = express();
  registerAuthAndAccessRoutes(app, {
    express,
    uiAuthController,
    remoteClientAuthRuntime: clients,
    clientPairingRuntime: {},
    readSettingsFromDiskMigrated: async () => ({}),
    tunnelAuthController: {
      classifyRequestScope: () => 'local',
      getTunnelSessionFromRequest: () => null,
      clearTunnelSessionCookie: () => {},
      exchangeBootstrapToken: async () => null,
    },
  });
  return { app, clients, uiAuthController, directory };
};

const mintDesktopClient = (app) => request(app)
  .post('/api/client-auth/clients')
  .set('Accept', 'application/json')
  .send({ label: 'OpenChamber Desktop', clientKind: 'desktop-local', dedupeKey: 'desktop-local' });

describe('desktop client bootstrap against the real Host auth boundary', () => {
  it('issues a desktop-local bearer for a passwordless Host and that bearer authenticates later requests', async () => {
    const { app, directory } = await createHarness();

    const created = await mintDesktopClient(app).expect(201);
    expect(created.headers['cache-control']).toBe('no-store');
    expect(created.body.token).toMatch(/^oc_client_[A-Za-z0-9_-]{43}$/);
    expect(created.body.client.clientKind).toBe('desktop-local');

    const listed = await request(app)
      .get('/api/client-auth/clients')
      .set('Authorization', `Bearer ${created.body.token}`)
      .expect(200);
    expect(listed.body.clients).toHaveLength(1);
    expect(listed.body.clients[0]).toMatchObject({ label: 'OpenChamber Desktop', clientKind: 'desktop-local' });

    const store = JSON.parse(await fs.readFile(path.join(directory, 'clients.json'), 'utf8'));
    expect(store.clients).toHaveLength(1);
    expect(store.clients[0].tokenHash).not.toBe(created.body.token);
  });

  it('refuses the cookie-less bootstrap when the Host requires client authentication', async () => {
    const { app, directory } = await createHarness({ requireClientAuth: true });

    const denied = await mintDesktopClient(app).expect(401);
    expect(denied.body).toMatchObject({ error: 'UI session authentication required', locked: true });

    const session = await request(app)
      .get('/auth/session')
      .set('Accept', 'application/json')
      .expect(401);
    expect(session.body).toMatchObject({ authenticated: false, clientAuthRequired: true });
    await expect(fs.stat(path.join(directory, 'clients.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses the cookie-less bootstrap on a password-protected Host', async () => {
    const { app } = await createHarness({ password: 'correct horse battery staple' });

    await mintDesktopClient(app).expect(401);
  });

  it('lets only a desktop-local client mint further clients', async () => {
    const { app, clients } = await createHarness();
    const mobile = await clients.createClient({ label: 'Phone', clientKind: 'mobile', dedupeKey: 'mobile:1' });

    const denied = await request(app)
      .post('/api/client-auth/clients')
      .set('Accept', 'application/json')
      .set('Authorization', `Bearer ${mobile.token}`)
      .send({ label: 'Another desktop', clientKind: 'desktop-local', dedupeKey: 'desktop-local' })
      .expect(403);
    expect(denied.body.error).toBe('Client tokens cannot create remote clients');
  });
});
