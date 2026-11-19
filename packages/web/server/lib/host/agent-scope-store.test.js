import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from './session-state.js';

const roots = [];
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-agent-scope-'));
  roots.push(root);
  const projectDirectory = path.join(root, 'project');
  const agentDirectory = path.join(root, 'agent');
  const otherWorkspace = path.join(projectDirectory, 'worktree');
  fs.mkdirSync(otherWorkspace, { recursive: true });
  fs.mkdirSync(agentDirectory);
  return {
    root, otherWorkspace,
    input: { hostProjectId: 'host-project', projectDirectory, workspaceDirectory: projectDirectory, agentDirectory, name: 'Project', displayPath: 'project' },
  };
};
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

describe('durable canonical Host scopes', () => {
  it('deduplicates authorized aliases and preserves immutable root bindings across Host restart', async () => {
    const { root, otherWorkspace, input } = fixture();
    const alias = path.join(root, 'alias');
    fs.symlinkSync(input.projectDirectory, alias, 'dir');
    const owner = createHostSessionState({ dataDir: root });
    const store = owner.agentScopeStore;
    const scope = await store.ensureWorkspace(input);
    const aliased = await store.ensureWorkspace({ ...input, projectDirectory: alias, workspaceDirectory: alias });
    expect(aliased).toEqual(scope);
    const sibling = await store.ensureWorkspace({ ...input, workspaceDirectory: otherWorkspace });
    const captured = await store.bindSession({ sessionId: 'root-session', rootSessionId: 'root-session', workspaceId: scope.workspaceId });
    const child = await store.bindSession({ sessionId: 'child-session', rootSessionId: 'root-session', workspaceId: scope.workspaceId });
    await expect(store.bindSession({ sessionId: 'root-session', rootSessionId: 'root-session', workspaceId: sibling.workspaceId }))
      .rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    await expect(store.bindSession({ sessionId: 'cross-workspace-child', rootSessionId: 'root-session', workspaceId: sibling.workspaceId }))
      .rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    await expect(store.bindSession({ sessionId: 'unknown-root-child', rootSessionId: 'unknown-root', workspaceId: scope.workspaceId }))
      .rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    await owner.close();

    const reopened = createHostSessionState({ dataDir: root });
    try {
      await expect(reopened.agentScopeStore.getSession('root-session')).resolves.toEqual(captured);
      await expect(reopened.agentScopeStore.getSession('child-session')).resolves.toEqual(child);
      await expect(reopened.agentScopeStore.ensureWorkspace(input)).resolves.toEqual(scope);
      await expect(reopened.agentScopeStore.getSession('cross-workspace-child')).resolves.toBeNull();
      const projects = await reopened.agentScopeStore.listProjects();
      expect(projects).toEqual({
        items: [{ projectId: scope.projectId, name: 'Project', workspaceIds: [scope.workspaceId, sibling.workspaceId].sort(), displayPath: 'project' }], errors: {},
      });
      expect(JSON.stringify(projects)).not.toContain(root);
      expect(scope.projectId).not.toBe(input.hostProjectId);
      await expect(reopened.agentScopeStore.bindSession({ sessionId: 'foreign-agent', rootSessionId: 'foreign-agent', workspaceId: scope.workspaceId, agentDirectoryId: 'other-agent-directory' }))
        .rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    } finally { await reopened.close(); }
  });

  it('keeps valid siblings visible beside corrupt scopes and rejects actual database read failure', async () => {
    const { root, otherWorkspace, input } = fixture();
    const owner = createHostSessionState({ dataDir: root });
    const database = new DatabaseSync(owner.databasePath);
    try {
      const good = await owner.agentScopeStore.ensureWorkspace(input);
      const bad = await owner.agentScopeStore.ensureWorkspace({ ...input, workspaceDirectory: otherWorkspace });
      database.prepare('UPDATE host_agent_workspaces SET agent_directory_id = ? WHERE workspace_id = ?').run('missing-directory-owner', bad.workspaceId);
      await expect(owner.agentScopeStore.getWorkspace(bad.workspaceId)).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
      await expect(owner.agentScopeStore.listWorkspaces()).resolves.toEqual({ items: [good], errors: { [bad.workspaceId]: 'METADATA_CORRUPT' } });
      await expect(owner.agentScopeStore.listProjects()).resolves.toEqual({
        items: [{ projectId: good.projectId, name: 'Project', workspaceIds: [good.workspaceId], displayPath: 'project' }],
        errors: { [bad.workspaceId]: 'METADATA_CORRUPT' },
      });
      database.exec('DROP TABLE host_agent_workspaces');
      await expect(owner.agentScopeStore.listWorkspaces()).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
      await expect(owner.agentScopeStore.getWorkspace(good.workspaceId)).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    } finally { database.close(); await owner.close(); }
  });

  it('fences new scope admissions while draining an admitted realpath capture before closing SQLite', async () => {
    const { root, input } = fixture();
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const owner = createHostSessionState({
      dataDir: root,
      fsPromises: {
        ...fs.promises,
        realpath: async (directory) => {
          if (directory === input.agentDirectory) { entered.resolve(); await release.promise; }
          return fs.promises.realpath(directory);
        },
      },
    });
    const admitted = owner.agentScopeStore.ensureWorkspace(input);
    await entered.promise;
    const closing = owner.close();
    await expect(owner.agentScopeStore.getWorkspace('later')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    release.resolve();
    const captured = await admitted;
    await closing;
    const reopened = createHostSessionState({ dataDir: root });
    try { await expect(reopened.agentScopeStore.getWorkspace(captured.workspaceId)).resolves.toEqual(captured); }
    finally { await reopened.close(); }
  });
  it('persists relocation intent and moves and rolls back the complete family across restart', async () => {
    const { root, otherWorkspace, input } = fixture();
    const owner = createHostSessionState({ dataDir: root });
    const store = owner.agentScopeStore;
    const source = await store.ensureWorkspace(input);
    const destination = await store.ensureWorkspace({ ...input, workspaceDirectory: otherWorkspace });
    await store.bindSession({ sessionId: 'root-session', rootSessionId: 'root-session', workspaceId: source.workspaceId });
    await store.bindSession({ sessionId: 'child-session', rootSessionId: 'root-session', workspaceId: source.workspaceId });
    await store.bindSession({ sessionId: 'unrelated', rootSessionId: 'unrelated', workspaceId: source.workspaceId });
    const intent = { rootSessionId: 'root-session', transactionId: 'relocation-one', sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
    await store.createRelocation(intent);
    await expect(store.rebindSessionFamily({ ...intent, transactionId: 'stale' })).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    const family = await store.rebindSessionFamily(intent);
    expect(family.map((member) => member.sessionId)).toEqual(['child-session', 'root-session']);
    expect(family.every((member) => member.workspaceId === destination.workspaceId)).toBe(true);
    await expect(store.getSession('unrelated')).resolves.toMatchObject({ workspaceId: source.workspaceId });
    await owner.close();
    const reopened = createHostSessionState({ dataDir: root });
    try {
      await expect(reopened.agentScopeStore.getRelocation('root-session')).resolves.toEqual(intent);
      await reopened.agentScopeStore.rollbackSessionFamily(intent);
      expect((await reopened.agentScopeStore.listSessionFamily('root-session')).every((member) => member.workspaceId === source.workspaceId)).toBe(true);
      await reopened.agentScopeStore.clearRelocation(intent);
      await expect(reopened.agentScopeStore.getRelocation('root-session')).resolves.toBeNull();
    } finally { await reopened.close(); }
  });

  it('moves a rekeyed branch root and its family in one write, retiring every mention of the old id', async () => {
    const { root, input } = fixture();
    const owner = createHostSessionState({ dataDir: root });
    const store = owner.agentScopeStore;
    const scope = await store.ensureWorkspace(input);
    await store.bindSession({ sessionId: 'branch-root', rootSessionId: 'branch-root', workspaceId: scope.workspaceId });
    await store.bindSession({ sessionId: 'branch-child', rootSessionId: 'branch-root', workspaceId: scope.workspaceId });
    await store.bindSession({ sessionId: 'unrelated-root', rootSessionId: 'unrelated-root', workspaceId: scope.workspaceId });
    const rebound = await store.rebindSessionRoot('branch-root', 'minted-root');
    expect(rebound).toMatchObject({ sessionId: 'minted-root', rootSessionId: 'minted-root', workspaceId: scope.workspaceId });
    expect((await store.listSessionFamily('minted-root')).map((member) => member.sessionId)).toEqual(['branch-child', 'minted-root']);
    await expect(store.listSessionFamily('branch-root')).resolves.toEqual([]);
    await expect(store.getSession('unrelated-root')).resolves.toMatchObject({ rootSessionId: 'unrelated-root' });
    // The Host scope schema has no parent column, so the branch cannot leave a
    // parent here; what it must not leave is any row still naming the retired
    // id. Scan every session column that could hold one.
    const database = new DatabaseSync(owner.databasePath);
    try {
      const mentions = database.prepare(`SELECT COUNT(*) AS count FROM host_agent_sessions
        WHERE session_id = 'branch-root' OR root_session_id = 'branch-root'`).get();
      expect(mentions.count).toBe(0);
      const columns = database.prepare('PRAGMA table_info(host_agent_sessions)').all().map((column) => column.name);
      expect(columns).not.toContain('parent_session_id');
    } finally { database.close(); await owner.close(); }
  });

  it('rejects a partial-family compare-and-set rather than moving a subset', async () => {
    const { root, otherWorkspace, input } = fixture();
    const owner = createHostSessionState({ dataDir: root });
    const store = owner.agentScopeStore;
    const source = await store.ensureWorkspace(input);
    const destination = await store.ensureWorkspace({ ...input, workspaceDirectory: otherWorkspace });
    await store.bindSession({ sessionId: 'root-session', rootSessionId: 'root-session', workspaceId: source.workspaceId });
    await store.bindSession({ sessionId: 'child-session', rootSessionId: 'root-session', workspaceId: source.workspaceId });
    const intent = { rootSessionId: 'root-session', transactionId: 'relocation-one', sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
    await store.createRelocation(intent);
    const database = new DatabaseSync(owner.databasePath);
    try {
      database.prepare('UPDATE host_agent_sessions SET workspace_id = ? WHERE session_id = ?').run(destination.workspaceId, 'child-session');
      await expect(store.rebindSessionFamily(intent)).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
      await expect(store.getSession('root-session')).resolves.toMatchObject({ workspaceId: source.workspaceId });
      await expect(store.getRelocation('root-session')).resolves.toEqual(intent);
    } finally { database.close(); await owner.close(); }
  });
});
