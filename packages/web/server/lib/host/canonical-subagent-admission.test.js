import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { registerCanonicalHostRoutes } from './canonical-routes.js';

const scope = {
  workspaceId: 'workspace-1', projectId: 'project-1', agentDirectoryId: 'agent-directory-1',
  cwd: '/tmp/workspace', agentDirectory: '/tmp/agent',
};
const token = 'Bearer fixture-client';

// A session the caller may address, plus a retired id the Agent Service no
// longer holds (a `/btw` Promote to Branch or a worktree archive) and a session
// another workspace owns. The route may only ever refuse these; the difference
// under test is how it names the refusal.
const admitted = new Set(['child-session']);
const retired = new Set(['retired-child', 'retired-root']);

const fixture = (overrides = {}) => {
  const queries = [];
  const app = express();
  registerCanonicalHostRoutes(app, {
    express,
    service: {
      getState: () => ({ phase: 'ready' }),
      request: async (target) => {
        queries.push(target);
        // The identity probe: 404 is how the Agent Service reports an id that
        // no reference, entry or native record answers for.
        if (retired.has(target.split('/').at(-1))) {
          return new Response(JSON.stringify({
            type: 'urn:ohpichamber:problem:SESSION_NOT_FOUND', title: 'Request refused', status: 404,
            code: 'SESSION_NOT_FOUND', detail: 'Session not found', retryable: false,
          }), { status: 404, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      },
    },
    uiAuthController: { resolveAuthContext: async () => ({ type: 'client' }) },
    tunnelAuthController: { classifyRequestScope: () => 'local', getTunnelSessionFromRequest: () => null },
    isRequestOriginAllowed: () => true,
    enterprisePolicyOptions: {},
    resolveWorkspaceScope: async () => scope,
    resolveWorkspaceDirectory: async () => null,
    resolveSessionScope: async (sessionId) => (admitted.has(sessionId) ? { ...scope, rootSessionId: sessionId } : null),
    resolveHostSessionScope: async (sessionId) => (admitted.has(sessionId) ? { ...scope, rootSessionId: sessionId } : null),
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
  return { app, queries };
};

const assertProblem = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toContain('application/problem+json');
  expect(response.body).toMatchObject({ status, code, type: `urn:ohpichamber:problem:${code}` });
};

describe('canonical subagent admission', () => {
  it('serves an authorized child session', async () => {
    const { app } = fixture();
    const response = await request(app).get('/api/agent/v1/subagents?sessionId=child-session').set('Authorization', token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('answers a retired child with its own gone condition, never "not authorized"', async () => {
    const { app } = fixture();
    // Before this, every unresolved id answered 403 "The selected session is
    // not authorized", so a caller asking about the child it had just promoted
    // through `/btw` or archived could not tell a retired identity from a
    // foreign one, and the UI reported an authorization failure for its own
    // session.
    assertProblem(await request(app).get('/api/agent/v1/subagents?sessionId=retired-child').set('Authorization', token), 404, 'SESSION_NOT_FOUND');
  });

  it('still refuses a session another workspace owns', async () => {
    const { app } = fixture();
    // The identity lookup answers 200 for a session that exists in some other
    // workspace: the refusal must stay an authorization failure, exactly as it
    // was, and the probe must not be able to admit it.
    assertProblem(await request(app).get('/api/agent/v1/subagents?sessionId=foreign-session').set('Authorization', token), 403, 'UNAUTHORIZED');
  });

  it('does not probe identity for a served session', async () => {
    const { app, queries } = fixture();
    await request(app).get('/api/agent/v1/subagents?sessionId=child-session').set('Authorization', token).expect(200);
    // The success path costs exactly one service call, the subagent list itself:
    // an identity probe on every request would double the traffic of the route.
    expect(queries).toEqual(['/api/agent/v1/subagents?sessionId=child-session']);
  });
});
