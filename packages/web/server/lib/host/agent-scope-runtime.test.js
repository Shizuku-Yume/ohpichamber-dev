import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from './session-state.js';
import { createHostAgentScopeRuntime } from './agent-scope-runtime.js';
import { createSettingsNormalizationRuntime } from './settings-normalization-runtime.js';
import { createProjectDirectoryRuntime } from './project-directory-runtime.js';
import { getWorktrees } from '../git/service.js';

const fixtures = [];
const normalization = createSettingsNormalizationRuntime({
  os, path, processLike: process, realpathSync: fs.realpathSync, readdirSync: fs.readdirSync,
});
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-scope-authority-'));
  const projectDirectory = path.join(root, 'project');
  const agentDirectory = path.join(root, 'agent');
  const settingsFile = path.join(root, 'settings.json');
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
    getWorktrees, agentDirectory,
  });
  await runtime.initialize();
  return { root, projectDirectory, agentDirectory, settingsFile, owner, runtime, saveProjects };
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
});
