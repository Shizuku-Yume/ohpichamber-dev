import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createRoutingRuntime } from './runtime.js';
import { createRoutingStore, resolveEffectiveConfig } from './store.js';
import { registerRoutingRoutes } from './routes.js';

const SCOPE = { projectId: 'project_a', workspaceId: 'workspace_a', agentDirectoryId: 'agent_a', cwd: '/repo' };
const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

// Exercise the actual Host routes and runtime over durable settings and native
// catalog/credential inputs. No mocked routing methods or legacy proxy exist.
const createApp = async ({ enterprise = false, credentials = {} } = {}) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'routing-http-'));
  directories.push(dataDir);
  const store = createRoutingStore({ dataDir });
  const state = { enterprise, credentials, providerError: null, credentialError: null, answers: { probe: { choice: 'blue', confidence: 0.98 } } };
  const resolved = [];
  const sent = [];
  const runtime = createRoutingRuntime({
    dataDir, store,
    enterpriseMode: () => state.enterprise,
    readPinnedEndpoint: () => null,
    resolveSessionScope: async (sessionId) => sessionId === 's1' ? SCOPE : null,
    resolveWorkspaceScope: async (workspaceId) => workspaceId === SCOPE.workspaceId ? SCOPE : null,
    service: { request: async (resource) => {
      if (resource !== `/api/agent/v1/workspaces/${SCOPE.workspaceId}/providers`) throw new Error(`Unexpected native request: ${resource}`);
      if (state.providerError) return Response.json({ detail: state.providerError.message, code: 'SERVICE_UNAVAILABLE' }, { status: 503 });
      return Response.json({ workspaceId: SCOPE.workspaceId, revision: '1', providers: Object.keys(state.credentials).map((providerId) => ({
        providerId, name: providerId, endpoint: null, protocol: null, authMethods: ['api-key'],
        auth: { status: 'configured', method: 'api-key', source: 'stored-credential', credentialRef: `cred_${providerId}` },
      })) });
    } },
    resolveCredential: async (selection) => {
      resolved.push(selection);
      if (state.credentialError) throw state.credentialError;
      return state.credentials[selection.providerId];
    },
    fetchImpl: async (url, init) => {
      sent.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return Response.json({ answers: state.answers });
    },
  });
  const app = express();
  registerRoutingRoutes(app, runtime);
  return { app, runtime, state, store, resolved, sent };
};

const config = () => ({ ...resolveEffectiveConfig(null), enabled: true,
  fallback: { model: { providerID: 'anthropic', modelID: 'claude-sonnet-5' }, variant: 'medium' },
});

describe('canonical routing settings HTTP boundary', () => {
  it('persists configuration and provider choices and exposes only secret presence', async () => {
    const { app, store } = await createApp();
    await request(app).put('/api/routing').send({ config: config() }).expect(200);
    await request(app).put('/api/routing/token').send({ token: 'ts-secret' }).expect(200);
    const saved = await request(app).get('/api/routing').expect(200);
    expect(saved.body).toMatchObject({ autoReady: true, tokenPresent: true, config: config(), classification: { selected: 'typesafe', effective: 'typesafe' } });
    expect(JSON.stringify(saved.body)).not.toContain('ts-secret');
    expect(await store.readToken()).toBe('ts-secret');
    await request(app).put('/api/routing/classifier').send({ source: 'off' }).expect(200);
    expect((await request(app).get('/api/routing')).body).toMatchObject({ autoReady: false, classification: { selected: 'off', effective: null } });
    await request(app).delete('/api/routing/token').expect(200);
    expect((await request(app).get('/api/routing')).body.tokenPresent).toBe(false);
    expect(await store.readToken()).toBeNull();
  });

  it('rejects invalid mutations without changing the saved configuration or provider', async () => {
    const { app } = await createApp();
    await request(app).put('/api/routing').send({ config: config() }).expect(200);
    await request(app).put('/api/routing/classifier').send({ source: 'off' }).expect(200);
    await request(app).put('/api/routing').send({ config: { ...config(), minConfidence: 2 } }).expect(400);
    await request(app).put('/api/routing/classifier').send({ source: 'unknown' }).expect(400);
    const read = await request(app).get('/api/routing').expect(200);
    expect(read.body.config).toEqual(config());
    expect(read.body.classification.selected).toBe('off');
  });

  it('saves custom endpoints, preserves omitted keys, tests drafts without persisting them, and clears', async () => {
    const { app, store, sent } = await createApp();
    const saved = { url: 'https://jev.example/decision', model: 'jev-saved', key: 'custom-secret' };
    await request(app).put('/api/routing/classifier/custom').send(saved).expect(200);
    await request(app).put('/api/routing/classifier/custom').send({ url: saved.url, model: 'jev-updated' }).expect(200);
    const described = await request(app).get('/api/routing').expect(200);
    expect(described.body).toMatchObject({ customEndpoint: { url: saved.url, model: 'jev-updated', keyPresent: true }, classification: { effective: 'custom' } });
    expect(JSON.stringify(described.body)).not.toContain('custom-secret');
    const draft = await request(app).post('/api/routing/classifier/test').send({ custom: { url: 'https://draft.example/decision', model: 'jev-draft' } }).expect(200);
    expect(draft.body).toMatchObject({ ok: true, source: 'custom', model: 'jev-draft' });
    expect(sent.at(-1)).toMatchObject({ url: 'https://draft.example/decision', headers: { authorization: 'Bearer custom-secret' }, body: { model: 'jev-draft' } });
    expect(await store.readCustomEndpoint()).toEqual({ ...saved, model: 'jev-updated' });
    await request(app).delete('/api/routing/classifier/custom').expect(200);
    expect((await request(app).get('/api/routing')).body.customEndpoint).toBeNull();
  });

  it('describes workspace catalog presence without reading secrets and probes only the selected provider', async () => {
    const { app, resolved, sent } = await createApp({ credentials: {
      openrouter: { type: 'api_key', key: 'selected-secret' }, 'vercel-ai-gateway': { type: 'api_key', key: 'other-secret' },
    } });
    await request(app).put('/api/routing/classifier').send({ source: 'openrouter' }).expect(200);
    const read = await request(app).get(`/api/routing?workspaceId=${SCOPE.workspaceId}`).expect(200);
    expect(read.body.classification.effective).toBe('openrouter');
    expect(resolved).toEqual([]);
    expect(JSON.stringify(read.body)).not.toMatch(/selected-secret|other-secret/);
    await request(app).post(`/api/routing/classifier/test?workspaceId=${SCOPE.workspaceId}`).send({}).expect(200);
    expect(resolved).toEqual([{ workspaceId: SCOPE.workspaceId, agentDirectoryId: SCOPE.agentDirectoryId, providerId: 'openrouter', credentialRef: 'cred_openrouter', purpose: 'routing' }]);
    expect(sent.at(-1).headers.authorization).toBe('Bearer selected-secret');
  });

  it('preserves service and scope errors instead of returning successful empty availability', async () => {
    const { app, state, sent } = await createApp({ credentials: { openrouter: { type: 'api_key', key: 'secret' } } });
    await request(app).put('/api/routing/classifier').send({ source: 'openrouter' }).expect(200);
    await request(app).get('/api/routing?workspaceId=workspace_other').expect(403);
    state.providerError = new Error('provider catalog unavailable');
    await request(app).get(`/api/routing?workspaceId=${SCOPE.workspaceId}`).expect(503);
    state.providerError = null;
    state.credentialError = Object.assign(new Error('credential owner unavailable'), { status: 503 });
    const failed = await request(app).post(`/api/routing/classifier/test?workspaceId=${SCOPE.workspaceId}`).send({}).expect(503);
    expect(failed.body.error).toBe('credential owner unavailable');
    expect(sent).toEqual([]);
  });

  it('enforces enterprise policy at execution and entry time while retaining the saved source', async () => {
    const { app, state, store, resolved, sent } = await createApp();
    await request(app).put('/api/routing/token').send({ token: 'saved-secret' }).expect(200);
    state.enterprise = true;
    await request(app).put('/api/routing/token').send({ token: 'replacement' }).expect(403);
    await request(app).put('/api/routing/classifier').send({ source: 'openrouter' }).expect(403);
    await request(app).put('/api/routing/classifier/custom').send({ url: 'https://outside.example/decision', model: 'm' }).expect(403);
    await request(app).post('/api/routing/classifier/test').send({ custom: { url: 'https://outside.example/decision', model: 'm' } }).expect(403);
    const probe = await request(app).post('/api/routing/classifier/test').send({}).expect(200);
    expect(probe.body).toEqual({ ok: false, reason: 'unavailable' });
    expect(await store.readClassifierSource()).toBe('typesafe');
    expect(resolved).toEqual([]);
    expect(sent).toEqual([]);
  });
});
