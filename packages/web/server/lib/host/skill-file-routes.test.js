import { afterEach, describe, expect, it } from 'vitest';
import express from 'express';
import { once } from 'node:events';
import { registerSkillFileRoutes } from './skill-file-routes.js';

const scope = { workspaceId: 'workspace_test', projectId: 'project_test', cwd: '/tmp', agentDirectory: '/tmp', agentDirectoryId: 'agent_test' };
const servers = [];

afterEach(async () => {
  for (const server of servers.splice(0)) {
    const stopped = Promise.withResolvers();
    server.close(error => error ? stopped.reject(error) : stopped.resolve());
    server.closeAllConnections();
    await stopped.promise;
  }
});

async function routes(owner) {
  const app = express();
  const router = express.Router();
  registerSkillFileRoutes(router, { express, owner, resolveWorkspaceScope: async workspaceId => workspaceId === scope.workspaceId ? scope : null });
  app.use('/api/agent/v1', router);
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}/api/agent/v1/workspaces/workspace_test/skills/files`;
}

describe('Skill file route body boundary', () => {
  it('parses JSON apply and write bodies before owner mutation', async () => {
    const calls = [];
    const owner = {
      async apply(_scope, selection, revision) {
        calls.push(['apply', selection, revision]);
        return { kind: 'skills', status: 'no-active-workers', scope: { kind: 'workspace', workspaceId: scope.workspaceId }, sourceRevision: '1', workers: [] };
      },
      async mutate(_scope, selection, revision, skillId, operation) {
        calls.push(['mutate', selection, revision, skillId, operation]);
        return { workspaceId: scope.workspaceId, scope: selection, skillId, sourceRevision: '1', files: [] };
      },
    };
    const base = await routes(owner);
    const applied = await fetch(`${base}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'workspace', expectedSourceRevision: '0' }) });
    expect(applied.status).toBe(200);
    const written = await fetch(`${base}/review/SKILL.md`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'workspace', expectedSourceRevision: '1', content: '---\nname: review\n---\nBody' }) });
    expect(written.status).toBe(200);
    expect(calls).toEqual([
      ['apply', 'workspace', '0'],
      ['mutate', 'workspace', '1', 'review', { kind: 'write', target: 'review/SKILL.md', content: '---\nname: review\n---\nBody' }],
    ]);
  });
});
