import { describe, expect, it } from 'bun:test';
import express from 'express';
import request from 'supertest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';

const scope = {
  workspaceId: 'ws_one', projectId: 'pro_one', agentDirectoryId: 'agent_dir',
  cwd: '/tmp/workspace', agentDirectory: '/tmp/agent',
};
const identity = { jobId: 'job_one', sessionId: 'ses_one', epoch: 'epoch_one', workerGeneration: 'gen_one' };
const running = {
  ...identity, workspaceId: 'ws_one', projectId: 'pro_one', command: 'echo hi', background: true,
  startedAt: 1, outputCursor: '0', status: 'running',
};
const stopped = { ...running, status: 'ended', endedAt: 2, termination: { reason: 'stopped', exitCode: null } };
const snapshot = {
  scope: { kind: 'session', sessionId: 'ses_one' }, epoch: 'epoch_one', revision: '1',
  running: [running], ended: [], recovery: { priorEpochs: 'invalidated' },
};
const output = {
  job: identity, requestedCursor: '0', startCursor: '0', cursor: '2', skippedBytes: '0', output: 'ok', ended: false,
};
const payloadFor = (target, method) => {
  if (target.includes('/output?')) return output;
  if (target.endsWith('/stop')) return { job: stopped };
  if (target.endsWith('/shell/jobs')) return method === 'POST' ? running : snapshot;
  return running;
};

const fixture = (overrides = {}) => {
  const calls = [];
  const sessionScopes = [];
  const hostScopes = [];
  const app = express();
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: 'ready' }),
      request: async (target, init) => {
        calls.push(target);
        return new Response(JSON.stringify(payloadFor(target, init?.method)), {
          status: 200, headers: { 'content-type': 'application/json' },
        });
      },
    },
    uiAuthController: { resolveAuthContext: async () => ({ type: 'client' }) },
    tunnelAuthController: { classifyRequestScope: () => 'local', getTunnelSessionFromRequest: () => null },
    isRequestOriginAllowed: () => true,
    enterprisePolicyOptions: {},
    resolveWorkspaceScope: async () => scope,
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async (sessionId) => { sessionScopes.push(sessionId); return scope; },
    resolveHostSessionScope: async (sessionId) => {
      hostScopes.push(sessionId);
      return sessionId === identity.sessionId ? scope : null;
    },
    listProjects: async () => ({ items: [], errors: {} }),
    listWorkspaces: async () => ({ items: [], errors: {} }),
    resolveCredentialHandoff: async () => { throw new Error('Unexpected credential handoff'); },
    queueRoutes: (router) => router,
    sessionRoutes: (router) => router,
    attachmentRoutes: (router) => router,
    skillFileOwner: {},
    getSkillRepositoryDependencies: () => ({}),
    ...overrides,
  });
  return { app, calls, sessionScopes, hostScopes };
};
const authorized = (call) => call.set('Authorization', 'Bearer fixture-client');

describe('canonical shell observation admission', () => {
  it('reads shell output through the authorized Host session scope', async () => {
    const { app, calls, sessionScopes, hostScopes } = fixture();
    const response = await authorized(request(app).get(
      '/api/agent/v1/sessions/ses_one/shell/jobs/job_one/output?epoch=epoch_one&workerGeneration=gen_one&cursor=0&tailBytes=100',
    ));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(output);
    expect(hostScopes).toEqual(['ses_one']);
    expect(sessionScopes).toEqual([]);
    expect(calls).toEqual([
      '/api/agent/v1/sessions/ses_one/shell/jobs/job_one/output?epoch=epoch_one&workerGeneration=gen_one&cursor=0&tailBytes=100',
    ]);
  });

  it('stops a shell through the authorized Host session scope', async () => {
    const { app, sessionScopes, hostScopes } = fixture();
    const response = await authorized(request(app).post('/api/agent/v1/sessions/ses_one/shell/jobs/job_one/stop'))
      .send({ job: identity });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ job: stopped });
    expect(hostScopes).toEqual(['ses_one']);
    expect(sessionScopes).toEqual([]);
  });

  it('lists session shells and validates each job without workspace admission', async () => {
    const { app, sessionScopes, hostScopes } = fixture();
    const response = await authorized(request(app).get('/api/agent/v1/sessions/ses_one/shell/jobs'));
    expect(response.status).toBe(200);
    expect(response.body).toEqual(snapshot);
    expect(hostScopes).toEqual(['ses_one', 'ses_one']);
    expect(sessionScopes).toEqual([]);
  });

  it('keeps shell start on the admitting session resolver', async () => {
    const { app, sessionScopes, hostScopes } = fixture();
    const response = await authorized(request(app).post('/api/agent/v1/sessions/ses_one/shell/jobs'))
      .send({ command: 'echo hi', background: false });
    expect(response.status).toBe(200);
    expect(response.body).toEqual(running);
    expect(sessionScopes).toEqual(['ses_one']);
    expect(hostScopes).toEqual([]);
  });

  it('fails closed when the observation session is not authorized', async () => {
    const { app, calls } = fixture({
      resolveHostSessionScope: async () => null,
    });
    const response = await authorized(request(app).get(
      '/api/agent/v1/sessions/ses_foreign/shell/jobs/job_one/output?epoch=epoch_one&workerGeneration=gen_one&cursor=0&tailBytes=100',
    ));
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('UNAUTHORIZED');
    expect(calls).toEqual([]);
  });
});
