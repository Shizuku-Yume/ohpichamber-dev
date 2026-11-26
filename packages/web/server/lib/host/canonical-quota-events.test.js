import { afterAll, afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { quotaProviderIdsForNativeProvider } from './private-credential.js';
import { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { createRemoteClientAuthRuntime } from '../client-auth/remote-clients.js';
import { createRequestSecurityRuntime } from '../security/request-security.js';
import { registerCommonRequestMiddleware } from '../server-frame/core-routes.js';

const root = await mkdtemp(path.join(os.tmpdir(), 'canonical-quota-events-'));
const originalDataDirectory = process.env.OPENCHAMBER_DATA_DIR;
process.env.OPENCHAMBER_DATA_DIR = root;
const { createUiAuth } = await import('../ui-auth/ui-auth.js');
afterAll(async () => {
  if (originalDataDirectory === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDirectory;
  await rm(root, { recursive: true, force: true });
});

const configuredAuth = {
  status: 'configured',
  credentialRef: 'credential_1',
  method: 'api-key',
  source: 'stored-credential',
};
const providerRow = {
  providerId: 'anthropic',
  name: 'Anthropic',
  endpoint: null,
  protocol: 'messages',
  authMethods: ['api-key', 'oauth'],
  auth: configuredAuth,
};
const oauthBase = {
  flowId: 'flow_1', generation: 'generation_1', providerId: 'anthropic', revision: '2',
  manualInput: false,
};

let directory;
let app;
let auth;
let token;
let mutations;
let responder;

beforeEach(async () => {
  directory = await mkdtemp(path.join(root, 'case-'));
  const clients = createRemoteClientAuthRuntime({ fsPromises, path, crypto, storePath: path.join(directory, 'clients.json') });
  const created = await clients.createClient({ label: 'quota events test client' });
  token = created.token;
  auth = createUiAuth({ password: 'quota-events-test', clientAuthController: clients });
  const security = createRequestSecurityRuntime({ readSettingsFromDiskMigrated: async () => ({}) });
  mutations = [];
  responder = async () => Response.json({ revision: '2', providerId: 'anthropic', auth: configuredAuth });
  app = express();
  registerCommonRequestMiddleware(app, { express });
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: 'ready' }),
      request: async (url, init) => responder(url, init),
    },
    uiAuthController: auth,
    tunnelAuthController: createTunnelAuth(),
    isRequestOriginAllowed: security.isRequestOriginAllowed,
    resolveWorkspaceScope: async workspaceId => (workspaceId === 'workspace_1'
      ? { workspaceId, projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: path.join(directory, 'agent') }
      : null),
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async () => null,
    resolveHostSessionScope: async () => null,
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('No credential handoff in this fixture'); },
    queueRoutes: () => { }, sessionRoutes: () => { }, attachmentRoutes: () => { },
    onProviderConfigurationMutation: (event) => { mutations.push(event); },
  });
});
afterEach(async () => {
  auth.dispose();
  await rm(directory, { recursive: true, force: true });
});

const authed = (req) => req.set('Authorization', `Bearer ${token}`);

describe('canonical provider mutations announce quota provider changes', () => {
  it('announces the mutated provider after a committed credential write', async () => {
    const response = await authed(request(app)
      .put('/api/agent/v1/workspaces/workspace_1/providers/anthropic/credential'))
      .send({ expectedRevision: '1', providerId: 'anthropic', credential: { method: 'api-key', apiKey: 'sk-test-key' } })
      .expect(200);
    expect(response.body.providerId).toBe('anthropic');
    expect(mutations).toEqual([{ providerId: 'anthropic' }]);
  });

  it('announces the mutated provider after a committed credential delete', async () => {
    responder = async () => Response.json({ revision: '3', providerId: 'anthropic', auth: { status: 'missing' } });
    await authed(request(app)
      .delete('/api/agent/v1/workspaces/workspace_1/providers/anthropic/credential/credential_1'))
      .send({ expectedRevision: '2', providerId: 'anthropic', credentialRef: 'credential_1' })
      .expect(200);
    expect(mutations).toEqual([{ providerId: 'anthropic' }]);
  });

  it('announces after a committed account mutation and provider config write', async () => {
    responder = async (url) => {
      if (url.includes('/accounts')) return Response.json({ revision: '2', providerId: 'openrouter', accounts: [] });
      return Response.json({ revision: '2', providerId: 'openrouter', provider: { ...providerRow, providerId: 'openrouter', protocol: 'chat-completions' } });
    };
    await authed(request(app)
      .post('/api/agent/v1/workspaces/workspace_1/providers/openrouter/accounts'))
      .send({ action: 'automatic', expectedRevision: '1' })
      .expect(200);
    await authed(request(app)
      .put('/api/agent/v1/workspaces/workspace_1/providers/openrouter/config'))
      .send({ expectedRevision: '1', configuration: { providerId: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', protocol: 'chat-completions', credentialRef: null } })
      .expect(200);
    expect(mutations).toEqual([{ providerId: 'openrouter' }, { providerId: 'openrouter' }]);
  });

  it('announces after a committed provider deletion', async () => {
    responder = async () => Response.json({ revision: '2', providerId: 'deepseek', provider: null });
    await authed(request(app)
      .delete('/api/agent/v1/workspaces/workspace_1/providers/deepseek'))
      .send({ expectedRevision: '1', providerId: 'deepseek' })
      .expect(200);
    expect(mutations).toEqual([{ providerId: 'deepseek' }]);
  });

  it('announces an authenticated OAuth flow but never a pending, failed or cancelled one', async () => {
    responder = async () => Response.json({ ...oauthBase, status: 'authenticated' });
    await authed(request(app)
      .post('/api/agent/v1/workspaces/workspace_1/providers/anthropic/oauth'))
      .send({ action: 'commit', flowId: 'flow_1', generation: 'generation_1', expectedRevision: '1' })
      .expect(200);
    expect(mutations).toEqual([{ providerId: 'anthropic' }]);

    for (const status of ['pending', 'failed', 'cancelled']) {
      mutations = [];
      responder = async () => {
        const body = { ...oauthBase, status };
        if (status === 'pending') body.authorizationUrl = 'https://example.invalid/authorize';
        if (status === 'failed') body.error = 'OAUTH_FAILED';
        return Response.json(body);
      };
      await authed(request(app)
        .post('/api/agent/v1/workspaces/workspace_1/providers/anthropic/oauth'))
        .send({ action: 'input', flowId: 'flow_1', generation: 'generation_1', input: 'code' })
        .expect(200);
      expect(mutations).toEqual([]);
    }
  });

  it('announces nothing when the write fails upstream or is rejected', async () => {
    responder = async () => Response.json({ type: 'urn:ohpichamber:problem:CATALOG_CONFLICT', title: 'Refused', status: 409, code: 'CATALOG_CONFLICT', detail: 'stale revision', retryable: false }, { status: 409 });
    await authed(request(app)
      .put('/api/agent/v1/workspaces/workspace_1/providers/anthropic/credential'))
      .send({ expectedRevision: '1', providerId: 'anthropic', credential: { method: 'api-key', apiKey: 'sk-test-key' } })
      .expect(409);
    responder = async () => { throw new Error('service down'); };
    await authed(request(app)
      .put('/api/agent/v1/workspaces/workspace_1/providers/anthropic/credential'))
      .send({ expectedRevision: '1', providerId: 'anthropic', credential: { method: 'api-key', apiKey: 'sk-test-key' } });
    expect(mutations).toEqual([]);
  });

  it('announces nothing for reads or non-quota mutations', async () => {
    responder = async () => Response.json({ revision: '2', providerId: 'anthropic', accounts: [] });
    await authed(request(app).get('/api/agent/v1/workspaces/workspace_1/providers/anthropic/accounts')).expect(200);
    expect(mutations).toEqual([]);
  });

  it('a throwing mutation listener never turns the committed write into a failure', async () => {
    const throwingApp = express();
    registerCommonRequestMiddleware(throwingApp, { express });
    registerCanonicalHostRoutes(throwingApp, {
      express,
      service: { getState: () => ({ phase: 'ready' }), request: async () => Response.json({ revision: '2', providerId: 'anthropic', auth: configuredAuth }) },
      uiAuthController: auth,
      tunnelAuthController: createTunnelAuth(),
      isRequestOriginAllowed: () => true,
      resolveWorkspaceScope: async () => ({ workspaceId: 'workspace_1', projectId: 'project_1', agentDirectoryId: 'agent_1', cwd: directory, agentDirectory: directory }),
      resolveWorkspaceDirectory: async () => null,
      resolveSessionScope: async () => null,
      resolveHostSessionScope: async () => null,
      listProjects: async () => ({ items: [], errors: {} }),
      listWorkspaces: async () => ({ items: [], errors: {} }),
      resolveCredentialHandoff: async () => { throw new Error('none'); },
      queueRoutes: () => { }, sessionRoutes: () => { }, attachmentRoutes: () => { },
      onProviderConfigurationMutation: () => { throw new Error('listener exploded'); },
    });
    const response = await authed(request(throwingApp)
      .put('/api/agent/v1/workspaces/workspace_1/providers/anthropic/credential'))
      .send({ expectedRevision: '1', providerId: 'anthropic', credential: { method: 'api-key', apiKey: 'sk-test-key' } })
      .expect(200);
    expect(response.body.providerId).toBe('anthropic');
  });
});

describe('quotaProviderIdsForNativeProvider', () => {
  it('maps relation-covered native ids to their logical quota ids plus the direct candidate', () => {
    expect(quotaProviderIdsForNativeProvider('anthropic')).toEqual(['claude', 'anthropic']);
    expect(quotaProviderIdsForNativeProvider('zai')).toEqual(['zai-coding-plan', 'zai']);
    expect(quotaProviderIdsForNativeProvider('github-copilot')).toEqual(['github-copilot-addon', 'github-copilot']);
  });

  it('passes direct logical ids through unchanged', () => {
    expect(quotaProviderIdsForNativeProvider('openrouter')).toEqual(['openrouter']);
    expect(quotaProviderIdsForNativeProvider('deepseek')).toEqual(['deepseek']);
    expect(quotaProviderIdsForNativeProvider('cursor')).toEqual(['cursor']);
  });
});
