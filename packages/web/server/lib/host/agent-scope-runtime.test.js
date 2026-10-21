import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from './session-state.js';
import { createHostAgentScopeRuntime } from './agent-scope-runtime.js';
import { createSettingsNormalizationRuntime } from './settings-normalization-runtime.js';
import { createProjectDirectoryRuntime } from './project-directory-runtime.js';
import { getWorktrees } from '../git/service.js';
import { registerCanonicalHostRoutes } from './canonical-routes.js';
import { SessionReferences } from '../../../../agent-service/src/sessions/references.ts';

const fixtures = [];
const normalization = createSettingsNormalizationRuntime({
  os, path, processLike: process, realpathSync: fs.realpathSync, readdirSync: fs.readdirSync,
});
const fixture = async ({ managedChats = false } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-scope-authority-'));
  const projectDirectory = path.join(root, 'project');
  const agentDirectory = path.join(root, 'agent');
  const settingsFile = path.join(root, 'settings.json');
  const managedChatsScope = managedChats ? { id: 'managed-chats', root: path.join(root, 'chats') } : undefined;
  fs.mkdirSync(projectDirectory);
  const saveProjects = (projects) => fs.writeFileSync(settingsFile, JSON.stringify({ projects }));
  saveProjects([{ id: 'host-project', path: projectDirectory, label: 'Project' }]);
  const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
  fixtures.push({ root, owner });
  const directoryRuntime = createProjectDirectoryRuntime({
    fsPromises: fs.promises, path, normalizeDirectoryPath: normalization.normalizeDirectoryPath,
    sanitizeProjects: normalization.sanitizeProjects,
  });
  const runtime = createHostAgentScopeRuntime({
    store: owner.agentScopeStore,
    readSettings: async () => JSON.parse(await fs.promises.readFile(settingsFile, 'utf8')),
    sanitizeProjects: normalization.sanitizeProjects,
    validateDirectoryPath: directoryRuntime.validateDirectoryPath,
    getWorktrees, agentDirectory, managedChatsScope,
  });
  await runtime.initialize();
  return { root, projectDirectory, agentDirectory, settingsFile, owner, runtime, saveProjects, managedChatsScope };
};
afterEach(async () => {
  while (fixtures.length) {
    const { root, owner } = fixtures.pop();
    await owner.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const admittedSession = (scope, sessionId = 'native-session') => ({
  sessionId, rootSessionId: sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId,
  displayPath: scope.displayPath, createdAt: 1700000000000, updatedAt: 1700000000000,
  epoch: 'native-epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
});

describe('configured Host scope authority', () => {
  it('resolves SQLite-backed project, worktree and managed-chat directories through the canonical public projection', async () => {
    const { root, projectDirectory, agentDirectory, owner, runtime, managedChatsScope } = await fixture({ managedChats: true });
    execFileSync('git', ['init', '-q', projectDirectory]);
    execFileSync('git', ['-C', projectDirectory, '-c', 'user.name=Scope fixture', '-c', 'user.email=scope@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'scope fixture']);
    const worktreeDirectory = path.join(root, 'linked-worktree');
    execFileSync('git', ['-C', projectDirectory, 'worktree', 'add', '-q', '-b', 'scope-fixture', worktreeDirectory]);
    const chatDirectory = path.join(managedChatsScope.root, 'chat-one');
    fs.mkdirSync(chatDirectory);
    const app = express();
    registerCanonicalHostRoutes(app, {
      express,
      service: { getState: () => ({ phase: 'stopped' }), request: async () => { throw new Error('Directory resolution must remain Host-owned'); } },
      uiAuthController: { resolveAuthContext: async () => ({ type: 'client' }) },
      tunnelAuthController: { classifyRequestScope: () => 'local', getTunnelSessionFromRequest: () => null },
      isRequestOriginAllowed: () => true,
      resolveWorkspaceDirectory: runtime.resolveWorkspaceDirectory,
      resolveWorkspaceScope: runtime.resolveWorkspaceScope,
      resolveSessionScope: runtime.resolveSessionScope,
      resolveHostSessionScope: runtime.resolveSessionScope,
      listProjects: runtime.listProjects,
      listWorkspaces: runtime.listWorkspaces,
      resolveCredentialHandoff: async () => { throw new Error('Unexpected credential handoff'); },
      queueRoutes: (router) => router,
      sessionRoutes: (router) => router,
      attachmentRoutes: (router) => router,
    });
    for (const [directory, expectedDisplayPath, expectedName] of [
      [projectDirectory, '.', 'Project'],
      [worktreeDirectory, '../linked-worktree', 'linked-worktree'],
      [chatDirectory, 'chat-one', 'chat-one'],
    ]) {
      const response = await request(app).post('/api/agent/v1/workspaces/resolve')
        .set('Authorization', 'Bearer fixture-client').send({ directory });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        workspaceId: expect.any(String), projectId: expect.any(String), name: expectedName, displayPath: expectedDisplayPath,
      });
      expect(response.text).not.toContain(root);
      const stored = await owner.agentScopeStore.getWorkspace(response.body.workspaceId);
      expect(stored).toMatchObject({ cwd: directory, agentDirectory, displayPath: null });
      await expect(runtime.resolveWorkspaceScope(response.body.workspaceId)).resolves.toMatchObject({
        cwd: directory, agentDirectory, displayPath: expectedDisplayPath,
      });
    }
  });

  it('keeps admitted chat identity across overlapping project promotion and Host restart through canonical aliases', async () => {
    const { root, projectDirectory, agentDirectory, owner, runtime, saveProjects, settingsFile, managedChatsScope } = await fixture({ managedChats: true });
    const physicalRoot = managedChatsScope.root;
    const configuredRoot = path.join(root, 'custom-chats-alias');
    fs.symlinkSync(physicalRoot, configuredRoot, 'dir');
    managedChatsScope.root = configuredRoot;
    const directory = path.join(physicalRoot, 'day', 'session-one');
    fs.mkdirSync(directory, { recursive: true });
    const alias = path.join(root, 'session-alias');
    fs.symlinkSync(directory, alias, 'dir');
    const canonical = await runtime.resolveWorkspaceDirectory(directory);
    const scope = await runtime.resolveWorkspaceScope(canonical.workspaceId);
    await runtime.registerSessionScope(admittedSession(scope, 'chat-session'));

    // Model settings promotion that already happened in an earlier Host process.
    saveProjects([
      { id: 'host-project', path: projectDirectory, label: 'Project' },
      { id: 'overlapping-project', path: alias, label: 'Explicit overlapping project' },
    ]);
    const overlap = await owner.agentScopeStore.ensureWorkspace({
      hostProjectId: 'overlapping-project', projectDirectory: directory,
      workspaceDirectory: directory, agentDirectory, name: 'Explicit overlapping project',
    });
    expect(overlap.workspaceId).not.toBe(canonical.workspaceId);
    for (const candidate of [directory, alias, path.join(configuredRoot, 'day', 'session-one')]) {
      await expect(runtime.resolveWorkspaceDirectory(candidate)).resolves.toEqual(canonical);
    }
    await expect(runtime.resolveWorkspaceDirectory(projectDirectory)).resolves.toMatchObject({ name: 'Project' });

    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures.find((entry) => entry.owner === owner).owner = reopened;
    const directoryRuntime = createProjectDirectoryRuntime({
      fsPromises: fs.promises, path, normalizeDirectoryPath: normalization.normalizeDirectoryPath,
      sanitizeProjects: normalization.sanitizeProjects,
    });
    const restarted = createHostAgentScopeRuntime({
      store: reopened.agentScopeStore,
      readSettings: async () => JSON.parse(await fs.promises.readFile(settingsFile, 'utf8')),
      sanitizeProjects: normalization.sanitizeProjects,
      validateDirectoryPath: directoryRuntime.validateDirectoryPath,
      getWorktrees, agentDirectory, managedChatsScope,
    });
    await restarted.initialize();
    for (const candidate of [directory, alias, path.join(configuredRoot, 'day', 'session-one')]) {
      await expect(restarted.resolveWorkspaceDirectory(candidate)).resolves.toEqual(canonical);
    }
    await expect(restarted.resolveSessionScope('chat-session')).resolves.toMatchObject({ workspaceId: canonical.workspaceId });
    // Canonical precedence changes resolution only, not explicit settings or durable rows.
    await expect(reopened.agentScopeStore.getWorkspace(overlap.workspaceId)).resolves.toMatchObject({ workspaceId: overlap.workspaceId });
    expect(JSON.parse(fs.readFileSync(settingsFile, 'utf8')).projects).toHaveLength(2);

    const replacementRoot = path.join(root, 'replacement-chats');
    fs.mkdirSync(replacementRoot);
    fs.unlinkSync(configuredRoot);
    fs.symlinkSync(replacementRoot, configuredRoot, 'dir');
    await expect(restarted.resolveSessionScope('chat-session')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
  });

  it('does not fall through to an overlapping project when managed admission fails', async () => {
    const { projectDirectory, agentDirectory, runtime, saveProjects, managedChatsScope } = await fixture({ managedChats: true });
    const directory = path.join(managedChatsScope.root, 'chat-one');
    fs.mkdirSync(directory);
    saveProjects([{ id: 'overlapping-project', path: directory }]);
    let projectAdmissions = 0;
    const failing = createHostAgentScopeRuntime({
      store: {
        ensureWorkspace: async ({ hostProjectId }) => {
          if (hostProjectId === managedChatsScope.id) throw new Error('managed metadata unavailable');
          projectAdmissions += 1;
          throw new Error('Unexpected project admission');
        },
      },
      readSettings: async () => ({ projects: [{ id: 'overlapping-project', path: directory }] }),
      sanitizeProjects: normalization.sanitizeProjects,
      validateDirectoryPath: async (candidate) => ({ ok: true, directory: fs.realpathSync(candidate) }),
      getWorktrees: async () => [], agentDirectory, managedChatsScope,
    });
    await expect(failing.resolveWorkspaceDirectory(directory)).rejects.toThrow('managed metadata unavailable');
    expect(projectAdmissions).toBe(0);
    // The healthy owner still admits the same chat, and unrelated paths stay unconfigured.
    await expect(runtime.resolveWorkspaceDirectory(directory)).resolves.toMatchObject({ name: 'chat-one' });
    await expect(runtime.resolveWorkspaceDirectory(projectDirectory)).resolves.toBeNull();
  });

  it('revokes persisted workspace and session access when the configured project is removed', async () => {
    const { root, projectDirectory, agentDirectory, owner, runtime, saveProjects } = await fixture();
    const projects = await runtime.listProjects();
    const scope = await runtime.resolveWorkspaceScope(projects.items[0].workspaceIds[0]);
    await runtime.registerSessionScope(admittedSession(scope));
    const unconfigured = path.join(projectDirectory, 'ordinary-directory');
    fs.mkdirSync(unconfigured);
    const unrelated = await owner.agentScopeStore.ensureWorkspace({
      hostProjectId: 'host-project', projectDirectory, workspaceDirectory: unconfigured,
      agentDirectory, name: 'Project',
    });
    await expect(runtime.resolveWorkspaceScope(unrelated.workspaceId)).resolves.toBeNull();
    const publicWorkspaces = await runtime.listWorkspaces();
    expect(publicWorkspaces.items.map((item) => item.workspaceId)).toEqual([scope.workspaceId]);
    expect(JSON.stringify({ projects, publicWorkspaces })).not.toContain(root);
    saveProjects([]);
    await expect(runtime.resolveWorkspaceScope(scope.workspaceId)).resolves.toBeNull();
    await expect(runtime.resolveSessionScope('native-session')).resolves.toBeNull();
    await expect(runtime.listProjects()).resolves.toEqual({ items: [], errors: {} });
    // Revocation does not rewrite the captured identity or erase durable metadata.
    await expect(owner.agentScopeStore.getSession('native-session')).resolves.toMatchObject({
      workspaceId: scope.workspaceId, rootSessionId: 'native-session', cwd: projectDirectory,
    });
  });

  it('admits real registered Git worktrees and excludes them after removal', async () => {
    const { root, projectDirectory, runtime } = await fixture();
    execFileSync('git', ['init', '-q', projectDirectory]);
    execFileSync('git', ['-C', projectDirectory, '-c', 'user.name=Scope fixture', '-c', 'user.email=scope@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'scope fixture']);
    const worktreeDirectory = path.join(root, 'linked-worktree');
    execFileSync('git', ['-C', projectDirectory, 'worktree', 'add', '-q', '-b', 'scope-fixture', worktreeDirectory]);
    const workspaces = await runtime.listWorkspaces();
    const linked = workspaces.items.find((item) => item.displayPath === '../linked-worktree');
    expect(linked).toMatchObject({ name: 'linked-worktree' });
    const scope = await runtime.resolveWorkspaceScope(linked.workspaceId);
    expect(scope.cwd).toBe(worktreeDirectory);
    await expect(runtime.registerSessionScope({ ...admittedSession(scope), projectId: 'foreign-project' }))
      .rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    await runtime.registerSessionScope(admittedSession(scope));
    execFileSync('git', ['-C', projectDirectory, 'worktree', 'remove', worktreeDirectory]);
    await expect(runtime.listWorkspaces()).resolves.toMatchObject({
      items: [expect.objectContaining({ displayPath: '.' })], errors: {},
    });
    await expect(runtime.resolveRelocationSourceScope('native-session')).resolves.toMatchObject({ workspaceId: scope.workspaceId, cwd: worktreeDirectory });
    await expect(runtime.resolveSessionScope('native-session')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
  });

  it('does not replace a failed settings read with authoritative empty discovery', async () => {
    const { runtime, settingsFile } = await fixture();
    const projects = await runtime.listProjects();
    fs.writeFileSync(settingsFile, '{');
    await expect(runtime.listProjects()).rejects.toBeInstanceOf(SyntaxError);
    await expect(runtime.resolveWorkspaceScope(projects.items[0].workspaceIds[0])).rejects.toBeInstanceOf(SyntaxError);
  });

  it('a retargeted configured alias cannot authorize the old captured root', async () => {
    const { root, projectDirectory, runtime, saveProjects } = await fixture();
    const alias = path.join(root, 'project-alias');
    const nextProject = path.join(root, 'next-project');
    fs.mkdirSync(nextProject);
    fs.symlinkSync(projectDirectory, alias, 'dir');
    saveProjects([{ id: 'host-project', path: alias, label: 'Project' }]);
    const original = await runtime.listProjects();
    fs.unlinkSync(alias);
    fs.symlinkSync(nextProject, alias, 'dir');
    await expect(runtime.resolveWorkspaceScope(original.items[0].workspaceIds[0])).resolves.toBeNull();
    const replacement = await runtime.listProjects();
    expect(replacement.items[0].projectId).not.toBe(original.items[0].projectId);
  });

  it('authorizes persisted root and child routes after restart and cleans child records with root deletion', async () => {
    const { root: fixtureRoot, projectDirectory, agentDirectory, owner, runtime } = await fixture();
    const projects = await runtime.listProjects();
    const scope = await runtime.resolveWorkspaceScope(projects.items[0].workspaceIds[0]);
    const root = admittedSession(scope, 'root-session');
    const child = { ...root, sessionId: 'child-session', rootSessionId: root.sessionId };
    await runtime.registerSessionScope(root);
    await runtime.registerSessionScope(child);

    const serviceState = path.join(fixtureRoot, 'service');
    const references = new SessionReferences(serviceState);
    await references.initialize();
    const childRecord = { subagentId: 'subagent-1', parentSessionId: root.sessionId, childSessionId: child.sessionId, role: 'worker', status: 'completed', rootSessionId: root.sessionId, workspaceId: scope.workspaceId, projectId: scope.projectId, sessionFile: path.join(agentDirectory, 'child.jsonl') };
    await references.putSubagent(childRecord);
    await references.close();
    const reopened = new SessionReferences(serviceState);
    await reopened.initialize();
    const persistedChild = reopened.listSubagents(root.sessionId)[0];

    const history = { sessionId: child.sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: 'message-1' }, turns: [], messages: [], nextCursor: null };
    const service = {
      getState: () => ({ phase: 'ready' }),
      request: async (url) => url.includes('/subagents')
        ? new Response(JSON.stringify(reopened.listSubagents(root.sessionId).map((record) => ({ subagentId: record.subagentId, parentSessionId: record.parentSessionId, childSessionId: record.childSessionId, role: record.role, status: record.status }))), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify(history), { status: 200, headers: { 'content-type': 'application/json' } }),
    };
    const app = express();
    registerCanonicalHostRoutes(app, {
      express, service,
      uiAuthController: { resolveAuthContext: async () => ({ type: 'client' }) },
      tunnelAuthController: { classifyRequestScope: () => 'local', getTunnelSessionFromRequest: () => null },
      isRequestOriginAllowed: () => true,
      resolveWorkspaceScope: runtime.resolveWorkspaceScope, resolveWorkspaceDirectory: runtime.resolveWorkspaceDirectory,
      resolveSessionScope: runtime.resolveSessionScope, resolveHostSessionScope: runtime.resolveSessionScope,
      listProjects: runtime.listProjects, listWorkspaces: runtime.listWorkspaces,
      resolveCredentialHandoff: async () => { throw new Error('Unexpected credential handoff'); },
      queueRoutes: (router) => router, sessionRoutes: (router) => router, attachmentRoutes: (router) => router,
    });

    expect(await request(app).get('/api/agent/v1/subagents').query({ sessionId: root.sessionId })).toMatchObject({ status: 200, body: [{ childSessionId: child.sessionId }] });
    expect(await request(app).get(`/api/agent/v1/sessions/${child.sessionId}/history`)).toMatchObject({ status: 200, body: { sessionId: child.sessionId } });
    const foreignDirectory = path.join(projectDirectory, 'foreign');
    fs.mkdirSync(foreignDirectory);
    const foreign = await owner.agentScopeStore.ensureWorkspace({ hostProjectId: 'foreign-project', projectDirectory, workspaceDirectory: foreignDirectory, agentDirectory, name: 'Foreign' });
    await owner.agentScopeStore.bindSession({ sessionId: 'foreign-child', rootSessionId: 'foreign-child', workspaceId: foreign.workspaceId });
    expect((await request(app).get('/api/agent/v1/sessions/foreign-child/history')).status).toBe(403);

    await reopened.removeSubagents(root.sessionId);
    expect(reopened.listSubagents(root.sessionId)).toEqual([]);
    expect(await request(app).get('/api/agent/v1/subagents').query({ sessionId: root.sessionId })).toMatchObject({ status: 200, body: [] });
    await reopened.close();
  });
});
