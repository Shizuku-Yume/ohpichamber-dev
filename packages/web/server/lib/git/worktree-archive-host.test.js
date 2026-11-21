import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from '../host/session-state.js';
import { createHostAgentScopeRuntime } from '../host/agent-scope-runtime.js';
import { DatabaseSync } from 'node:sqlite';
import { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import { archiveWorktree } from './service.js';
import { registerGitRoutes } from './routes.js';

const fixtures = [];
afterEach(async () => {
  while (fixtures.length) {
    const { owner, root } = fixtures.pop();
    await owner.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const pathKey = (directory) => {
  const resolved = path.resolve(directory);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};

describe('Host-owned worktree archive capture', () => {
  it.each([
    [null, null],
    ["target_workspace_id = anchor_workspace_id", null],
    ["preapply_head = 'head'", null],
    ["preapply_fingerprint = '{}'", null],
    ["expected_fingerprint = '{}'", null],
    ['apply_attempted = 1', null],
    ['restore_cas_started = 1', null],
    ['restore_cas_completed = 1', null],
    [null, 'move_intent'],
    [null, 'restored'],
  ])('preserves the pre-pin rollback boundary after release and reopen (%s, %s)', async (archiveUpdate, progress) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-recovery-fence-')));
    const owner = createHostSessionState({ dataDir: root });
    const fixture = { root, owner };
    fixtures.push(fixture);
    const store = owner.agentScopeStore;
    const scope = await store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: root, workspaceDirectory: root, agentDirectory: root, name: 'Project' });
    const safe = !archiveUpdate && !progress;
    if (!safe) await store.bindSession({ sessionId: 'session', rootSessionId: 'session', workspaceId: scope.workspaceId });
    const key = { hostProjectId: 'project', archiveId: 'archive' };
    const binding = await store.createWorktreeArchive({ ...key, archiveRef: 'refs/openchamber/archive/archive', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: scope.workspaceId, claimId: 'claim', claimGeneration: `host_${process.pid}_claim`, branchName: 'branch', branchOid: null });
    await store.setWorktreeArchivePhase(key, 'claim', binding.revision, 'restoring');
    const db = new DatabaseSync(owner.databasePath);
    if (archiveUpdate) db.exec(`UPDATE host_worktree_archives SET ${archiveUpdate}`);
    if (progress) db.prepare('UPDATE host_worktree_archive_sessions SET progress = ?').run(progress);
    db.close();
    expect(await store.releaseWorktreeArchiveClaim(key, 'wrong-claim')).toMatchObject({ phase: 'restoring', claimId: 'claim' });
    expect(await store.releaseWorktreeArchiveClaim(key, 'claim')).toMatchObject({ phase: safe ? 'archived' : 'restoring', claimId: null });
    if (safe) await expect(store.checkWorktreeScope(root)).resolves.toBeUndefined();
    else await expect(store.checkWorktreeScope(root)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await owner.close();
    fixture.owner = createHostSessionState({ dataDir: root });
    expect(await fixture.owner.agentScopeStore.getWorktreeArchive(key)).toMatchObject({ phase: safe ? 'archived' : 'restoring', claimId: null });
    if (safe) await expect(fixture.owner.agentScopeStore.checkWorktreeScope(root)).resolves.toBeUndefined();
    else await expect(fixture.owner.agentScopeStore.checkWorktreeScope(root)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
  });
  it.each([false, true])('recovers an unpinned restore without losing archived discovery (persisted: %s)', async (persisted) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archive-unpinned-')));
    const project = path.join(root, 'project');
    const agent = path.join(root, 'agent');
    const dataDir = path.join(root, 'host');
    fs.mkdirSync(project);
    fs.mkdirSync(agent);
    git(project, 'init', '-q');
    git(project, '-c', 'user.name=Archive test', '-c', 'user.email=archive@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'base');
    let owner = createHostSessionState({ dataDir });
    const fixture = { owner, root };
    fixtures.push(fixture);
    const scopes = new Map();
    const register = async (cwd) => {
      const scope = await owner.agentScopeStore.ensureWorkspace({ hostProjectId: 'project', projectDirectory: project, workspaceDirectory: cwd, agentDirectory: agent, name: 'Project' });
      scopes.set(pathKey(cwd), scope);
      return scope;
    };
    await register(project);
    let runtime;
    const createService = () => createOpenChamberSessionService({
      service: { request: async (url) => {
        const workspaceId = new URL(url, 'http://host').searchParams.get('workspaceId');
        const sessions = await Promise.all(['restore', 'control'].map((id) => owner.agentScopeStore.getSession(id)));
        return Response.json({ items: sessions.filter((session) => session?.workspaceId === workspaceId).map((session) => ({
          sessionId: session.sessionId, rootSessionId: session.rootSessionId, projectId: session.projectId,
          workspaceId, displayPath: path.basename(session.cwd), createdAt: 1700000000000, updatedAt: 1700000000000,
          epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
        })), errors: [] });
      } },
      agentScopeStore: owner.agentScopeStore, archiveStore: owner.archiveStore,
      sessionMetadataStore: owner.sessionMetadataStore,
      resolveWorkspaceDirectory: async (cwd) => scopes.get(pathKey(cwd)),
      resolveWorkspaceScope: (id) => owner.agentScopeStore.getWorkspace(id),
      listWorkspaceScopes: async () => {
        const page = await runtime.listWorkspaces();
        return { items: page.items.map(({ workspaceId }) => ({ workspaceId })), errors: page.errors };
      },
      resolveSessionScope: (id) => owner.agentScopeStore.getSession(id),
      resolveHostSessionScope: (id) => owner.agentScopeStore.getSession(id),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [], capturePrompt: async (_scope, prompt) => prompt,
      beforeDispatch: async () => {}, onPromptAccepted: async () => {},
      directCommandAdmissionStore: owner.directCommandAdmissionStore,
    });
    const service = createService();
    for (const id of ['restore', 'control']) {
      const cwd = path.join(root, id);
      git(project, 'worktree', 'add', '-q', '-b', id, cwd);
      const scope = await register(cwd);
      await owner.agentScopeStore.bindSession({ sessionId: id, rootSessionId: id, workspaceId: scope.workspaceId });
      await archiveWorktree(project, { directory: cwd, id }, {
        worktreeWorkers: { acquire: async () => {}, release: async () => {} }, archiveSessions: service,
      });
    }
    const key = { hostProjectId: 'project', archiveId: 'restore' };
    if (persisted) {
      await owner.close();
      const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
      db.prepare("UPDATE host_worktree_archives SET phase = 'restoring', revision = revision + 2 WHERE archive_id = 'restore'").run();
      db.close();
      owner = createHostSessionState({ dataDir });
      fixture.owner = owner;
    } else {
      const target = path.join(root, 'target');
      git(project, 'worktree', 'add', '-q', target, 'restore');
      await register(target);
      let reachedPreflight = false;
      const app = express();
      app.use(express.json());
      registerGitRoutes(app, { worktreeArchiveSessionService: {
        ...service,
        pinWorktreeArchiveRestore: async () => { reachedPreflight = true; throw new Error('injected pre-pin failure'); },
      } });
      const response = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: target }).send({ id: 'restore' });
      expect(response.status).toBe(500);
      expect(reachedPreflight, JSON.stringify(response.body)).toBe(true);
      git(project, 'worktree', 'remove', '--force', target);
    }
    const assertDiscoverable = async () => {
      const store = owner.agentScopeStore;
      expect(await store.getWorktreeArchive(key)).toMatchObject({ phase: 'archived', claimId: null, targetWorkspaceId: null, applyAttempted: 0 });
      runtime = createHostAgentScopeRuntime({
        store, agentDirectory: agent,
        readSettings: async () => ({ projects: [{ id: 'project', path: project, label: 'Project' }] }),
        sanitizeProjects: (projects) => projects,
        validateDirectoryPath: async (cwd) => ({ ok: true, directory: fs.realpathSync(cwd) }),
        getWorktrees: async () => [],
      });
      const discovery = await runtime.listWorkspaces();
      expect(discovery.errors).toEqual({});
      const sessions = await createService().list();
      expect(sessions.errors).toEqual({});
      expect(sessions.items.map((session) => session.sessionId).sort()).toEqual(['control', 'restore']);
      expect(sessions.items.every((session) => session.archivedAt > 0)).toBe(true);
      for (const id of ['restore', 'control']) {
        const session = await store.getSession(id);
        expect(discovery.items.map((scope) => scope.workspaceId)).toContain(session.workspaceId);
        expect(await owner.archiveStore.getState(id)).toMatchObject({ revision: '1', archivedAt: expect.any(Number) });
        await expect(store.checkWorktreeScope(session.cwd)).resolves.toBeUndefined();
      }
    };
    await assertDiscoverable();
    await owner.close();
    owner = createHostSessionState({ dataDir });
    fixture.owner = owner;
    await assertDiscoverable();
  });
  it('captures every admitted nested scope independently of a client session list and preserves earlier archive state', async () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-archive-host-')));
    const project = path.join(root, 'project');
    const checkout = path.join(root, 'checkout');
    const agent = path.join(root, 'agent');
    fs.mkdirSync(project);
    fs.mkdirSync(agent);
    git(project, 'init', '-q');
    git(project, 'config', 'core.autocrlf', 'false');
    git(project, '-c', 'user.name=Archive test', '-c', 'user.email=archive@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'base');
    git(project, 'worktree', 'add', '-q', '-b', 'archive-fixture', checkout);
    const nested = path.join(checkout, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(checkout, 'change.txt'), 'uncommitted\n');
    const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures.push({ owner, root });
    const store = owner.agentScopeStore;
    const register = (cwd) => store.ensureWorkspace({ hostProjectId: 'settings-project', projectDirectory: project, workspaceDirectory: cwd, agentDirectory: agent, name: 'Project' });
    const projectScope = await register(project);
    const checkoutScope = await register(checkout);
    const nestedScope = await register(nested);
    expect(projectScope.projectId).not.toBe('settings-project');
    for (const [id, scope] of [['root-active', checkoutScope], ['nested-active', nestedScope], ['already-archived', nestedScope], ['outside', projectScope]]) {
      await store.bindSession({ sessionId: id, rootSessionId: id, workspaceId: scope.workspaceId });
    }
    await owner.archiveStore.archive(['already-archived'], 1234);
    const deleting = await store.reserveSessionDelete('nested-active');
    await expect(store.createWorktreeArchive({
      hostProjectId: 'settings-project', archiveId: 'delete-race',
      archiveRef: 'refs/openchamber/archive/delete-race', snapshotCommit: git(project, 'rev-parse', 'HEAD'),
      anchorWorkspaceId: checkoutScope.workspaceId, claimId: 'race-claim', claimGeneration: 'fixture', branchName: 'archive-fixture', branchOid: git(project, 'rev-parse', 'HEAD')
    }))
      .rejects.toThrow('deletion is in progress');
    store.releaseSessionDelete(deleting);
    const scopes = new Map([[pathKey(project), projectScope], [pathKey(checkout), checkoutScope], [pathKey(nested), nestedScope]]);
    const service = createOpenChamberSessionService({
      service: { request: async () => { throw new Error('Native runtime must not be contacted for Host archive capture'); } },
      agentScopeStore: store,
      resolveWorkspaceDirectory: async (directory) => scopes.get(pathKey(directory)) ?? null,
      resolveWorkspaceScope: (id) => store.getWorkspace(id),
      resolveSessionScope: (id) => store.getSession(id),
      resolveHostSessionScope: (id) => store.getSession(id),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [], capturePrompt: async (_scope, prompt) => prompt,
      beforeDispatch: async () => { }, onPromptAccepted: async () => { },
      directCommandAdmissionStore: owner.directCommandAdmissionStore,
      archiveStore: owner.archiveStore, sessionMetadataStore: owner.sessionMetadataStore,
    });
    const archiveSessions = {
      ...service,
      prepareWorktreeArchiveRemoval: async (capture) => {
        await expect(store.bindSession({ sessionId: 'late-session', rootSessionId: 'late-session', workspaceId: nestedScope.workspaceId }))
          .rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
        await expect(register(nested)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
        await expect(owner.archiveStore.unarchive(['nested-active'])).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
        await expect(store.removeSessionFamily('nested-active')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
        await expect(store.createRelocation({ rootSessionId: 'nested-active', transactionId: 'move-test', sourceWorkspaceId: nestedScope.workspaceId, destinationWorkspaceId: projectScope.workspaceId }))
          .rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
        return service.prepareWorktreeArchiveRemoval(capture);
      },
    };
    const app = express();
    app.use(express.json());
    registerGitRoutes(app, {
      worktreeBootstrapStore: { remove: async () => { } },
      worktreeLeaseControl: { acquire: async () => { }, release: async () => { } },
      worktreeArchiveSessionService: archiveSessions,
    });
    const response = await request(app).post('/api/git/worktrees/archives')
      .query({ directory: project }).send({ directory: checkout, id: 'host-fixture', sessionIds: ['outside'] });
    expect(response.status).toBe(200);
    const result = response.body;
    expect(fs.existsSync(checkout)).toBe(false);
    const binding = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'host-fixture' });
    expect(binding).toMatchObject({ projectId: projectScope.projectId, anchorWorkspaceId: checkoutScope.workspaceId, phase: 'archived' });
    expect(binding.sessions.map((session) => session.sessionId)).toEqual(['already-archived', 'nested-active', 'root-active']);
    expect(result.sessionIds).toEqual([]);
    const listing = await request(app).get('/api/git/worktrees/archives').query({ directory: project });
    expect(listing.status).toBe(200);
    expect(listing.body.archives.find((archive) => archive.id === 'host-fixture')).toMatchObject({ sessionBinding: { status: 'bound' }, sessionIds: [] });
    expect(await owner.archiveStore.getState('already-archived')).toMatchObject({ archivedAt: 1234, revision: '1' });
    expect(await owner.archiveStore.isArchived('root-active')).toBe(true);
    expect(await owner.archiveStore.isArchived('nested-active')).toBe(true);
    expect(await owner.archiveStore.isArchived('outside')).toBe(false);
    const second = path.join(root, 'second-checkout');
    git(project, 'worktree', 'add', '-q', '-b', 'second-fixture', second);
    fs.writeFileSync(path.join(second, 'second.txt'), 'pending\n');
    const secondScope = await register(second);
    scopes.set(pathKey(second), secondScope);
    await store.bindSession({ sessionId: 'second-active', rootSessionId: 'second-active', workspaceId: secondScope.workspaceId });
    const failing = { ...service, prepareWorktreeArchiveRemoval: async () => { throw new Error('recheck unavailable'); } };
    await expect(archiveWorktree(project, { directory: second, id: 'recheck-failure' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: failing,
    })).rejects.toThrow('recheck unavailable');
    expect(fs.existsSync(path.join(second, 'second.txt'))).toBe(true);
    expect(await owner.archiveStore.isArchived('second-active')).toBe(false);
    expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'recheck-failure' })).toBeNull();
    expect(git(project, 'for-each-ref', '--format=%(refname)', 'refs/openchamber/archive/recheck-failure')).toBe('');
    if (process.platform !== 'win32') {
      const third = path.join(root, 'partial-checkout');
      git(project, 'worktree', 'add', '-q', '-b', 'partial-fixture', third);
      fs.writeFileSync(path.join(third, 'partial.txt'), 'pending\n');
      const thirdScope = await register(third);
      scopes.set(pathKey(third), thirdScope);
      for (const id of ['partial-active', 'partial-archived'])
        await store.bindSession({ sessionId: id, rootSessionId: id, workspaceId: thirdScope.workspaceId });
      await owner.archiveStore.archive(['partial-archived'], 2345);
      const bin = path.join(root, 'shim-bin');
      fs.mkdirSync(bin);
      const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      fs.writeFileSync(path.join(bin, 'git'), `#!/bin/sh\ncase "$*" in *"worktree"*"remove"*) for target in "$@"; do :; done; rm -f "$target/partial.txt"; exit 1 ;; esac\nexec "${realGit}" "$@"\n`, { mode: 0o755 });
      const previousPath = process.env.PATH;
      process.env.PATH = `${bin}${path.delimiter}${previousPath}`;
      try {
        await expect(archiveWorktree(project, { directory: third, id: 'partial-fixture' }, {
          worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
        })).rejects.toMatchObject({ code: 'WORKTREE_ARCHIVE_PARTIAL', status: 409 });
      } finally { process.env.PATH = previousPath; }
      expect(fs.existsSync(path.join(third, 'partial.txt'))).toBe(false);
      expect(await owner.archiveStore.isArchived('partial-active')).toBe(false);
      expect(await owner.archiveStore.getState('partial-archived')).toMatchObject({ archivedAt: 2345, revision: '1' });
      expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'partial-fixture' })).toMatchObject({ phase: 'partial', claimId: null });
      expect(git(project, 'rev-parse', '--verify', 'refs/openchamber/archive/partial-fixture')).toMatch(/^[a-f0-9]+$/);
      await expect(store.bindSession({ sessionId: 'after-partial', rootSessionId: 'after-partial', workspaceId: thirdScope.workspaceId })).resolves.toMatchObject({ sessionId: 'after-partial' });
    }
    const emptySource = path.join(root, 'restore-source');
    git(project, 'worktree', 'add', '-q', '-b', 'restore-fixture', emptySource);
    fs.writeFileSync(path.join(emptySource, '.gitignore'), 'ignored.txt\nnode_modules/\n');
    fs.symlinkSync('.gitignore', path.join(emptySource, 'ignore-link'));
    git(emptySource, 'add', '.gitignore', 'ignore-link');
    git(emptySource, '-c', 'user.name=Archive test', '-c', 'user.email=archive@example.invalid', 'commit', '-q', '-m', 'ignore setup');
    fs.writeFileSync(path.join(emptySource, 'restored.txt'), 'saved change\n');
    scopes.set(pathKey(emptySource), await register(emptySource));
    const restoreScope = scopes.get(pathKey(emptySource));
    for (const id of ['restore-active', 'restore-already-archived']) {
      await store.bindSession({ sessionId: id, rootSessionId: id, workspaceId: restoreScope.workspaceId });
    }
    await owner.archiveStore.archive(['restore-already-archived'], 1234);
    await archiveWorktree(project, { directory: emptySource, id: 'restore-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const restoreTarget = emptySource;
    git(project, 'worktree', 'add', '-q', restoreTarget, 'restore-fixture');
    scopes.set(pathKey(restoreTarget), await register(restoreTarget));
    fs.mkdirSync(path.join(restoreTarget, 'node_modules'));
    fs.writeFileSync(path.join(restoreTarget, 'node_modules', 'dep.txt'), 'module\n');
    fs.writeFileSync(path.join(restoreTarget, 'ignored.txt'), 'ignored content\n');
    const restored = await request(app).post('/api/git/worktrees/archives/restore')
      .query({ directory: restoreTarget }).send({ id: 'restore-fixture' });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect(restored.body.sessionBinding.status).toBe('bound');
    expect(await owner.archiveStore.getState('restore-active')).toMatchObject({ archivedAt: null });
    expect(await owner.archiveStore.getState('restore-already-archived')).toMatchObject({ archivedAt: 1234 });
    expect(await store.getSession('restore-active')).toMatchObject({ workspaceId: restoreScope.workspaceId, cwd: restoreTarget });
    expect(fs.readlinkSync(path.join(restoreTarget, 'ignore-link'))).toBe('.gitignore');
    expect(fs.readFileSync(path.join(restoreTarget, 'restored.txt'), 'utf8')).toBe('saved change\n');
    expect(fs.readFileSync(path.join(restoreTarget, 'ignored.txt'), 'utf8')).toBe('ignored content\n');
    expect(fs.readFileSync(path.join(restoreTarget, 'node_modules', 'dep.txt'), 'utf8')).toBe('module\n');
    expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'restore-fixture' })).toBeNull();
    const recoverySource = path.join(root, 'recovery-source');
    git(project, 'worktree', 'add', '-q', '-b', 'recovery-fixture', recoverySource);
    fs.writeFileSync(path.join(recoverySource, 'recovered.txt'), 'recovery change\n');
    scopes.set(pathKey(recoverySource), await register(recoverySource));
    await archiveWorktree(project, { directory: recoverySource, id: 'recovery-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const previousTarget = path.join(root, 'recovery-previous');
    git(project, 'worktree', 'add', '-q', previousTarget, 'recovery-fixture');
    scopes.set(pathKey(previousTarget), await register(previousTarget));
    const crashing = {
      ...service, markWorktreeArchiveRestoreAttempted: async (...args) => {
        await service.markWorktreeArchiveRestoreAttempted(...args);
        throw new Error('crash before Git apply');
      }
    };
    const crashingApp = express(); crashingApp.use(express.json());
    registerGitRoutes(crashingApp, { worktreeArchiveSessionService: crashing });
    const crash = await request(crashingApp).post('/api/git/worktrees/archives/restore').query({ directory: previousTarget }).send({ id: 'recovery-fixture' });
    expect(crash.status).toBe(500);
    const same = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: previousTarget }).send({ id: 'recovery-fixture' });
    expect(same.status).toBe(409);
    expect(fs.existsSync(path.join(previousTarget, 'recovered.txt'))).toBe(false);
    const pending = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'recovery-fixture' });
    const nextTarget = path.join(root, 'recovery-next');
    git(project, 'worktree', 'add', '-q', '--detach', nextTarget, pending.preapplyHead);
    scopes.set(pathKey(nextTarget), await register(nextTarget));
    const recovery = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: nextTarget })
      .send({ id: 'recovery-fixture', recovery: { mode: 'new_checkout', revision: pending.revision } });
    expect(recovery.status, JSON.stringify(recovery.body)).toBe(200);
    expect(fs.readFileSync(path.join(nextTarget, 'recovered.txt'), 'utf8')).toBe('recovery change\n');
    expect(fs.existsSync(path.join(previousTarget, 'recovered.txt'))).toBe(false);
    const resumeSource = path.join(root, 'resume-source');
    git(project, 'worktree', 'add', '-q', '-b', 'resume-fixture', resumeSource);
    fs.writeFileSync(path.join(resumeSource, 'resume.txt'), 'applied once\n');
    scopes.set(pathKey(resumeSource), await register(resumeSource));
    await archiveWorktree(project, { directory: resumeSource, id: 'resume-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const resumeTarget = path.join(root, 'resume-target');
    git(project, 'worktree', 'add', '-q', resumeTarget, 'resume-fixture');
    scopes.set(pathKey(resumeTarget), await register(resumeTarget));
    const afterApply = { ...service, finishWorktreeArchiveRestore: async () => { throw new Error('crash after Git apply'); } };
    const afterApplyApp = express(); afterApplyApp.use(express.json());
    registerGitRoutes(afterApplyApp, { worktreeArchiveSessionService: afterApply });
    const appliedCrash = await request(afterApplyApp).post('/api/git/worktrees/archives/restore').query({ directory: resumeTarget }).send({ id: 'resume-fixture' });
    expect(appliedCrash.status).toBe(500);
    const resumeBinding = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'resume-fixture' });
    const resumed = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: project })
      .send({ id: 'resume-fixture', recovery: { mode: 'same_target', revision: resumeBinding.revision } });
    expect(resumed.status, JSON.stringify(resumed.body)).toBe(200);
    expect(fs.readFileSync(path.join(resumeTarget, 'resume.txt'), 'utf8')).toBe('applied once\n');
    const overlapSource = path.join(root, 'overlap-source');
    git(project, 'worktree', 'add', '-q', '-b', 'overlap-fixture', overlapSource);
    scopes.set(pathKey(overlapSource), await register(overlapSource));
    await archiveWorktree(project, { directory: overlapSource, id: 'overlap-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const overlapTarget = path.join(root, 'overlap-target');
    git(project, 'worktree', 'add', '-q', overlapTarget, 'overlap-fixture');
    scopes.set(pathKey(overlapTarget), await register(overlapTarget));
    const overlapCrash = await request(afterApplyApp).post('/api/git/worktrees/archives/restore').query({ directory: overlapTarget }).send({ id: 'overlap-fixture' });
    expect(overlapCrash.status).toBe(500);
    const overlap = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'overlap-fixture' });
    expect(overlap.preapplyFingerprint).toBe(overlap.expectedFingerprint);
    const overlapRetry = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: project })
      .send({ id: 'overlap-fixture', recovery: { mode: 'same_target', revision: overlap.revision } });
    expect(overlapRetry.status).toBe(409);
    expect(overlapRetry.body.code).toBe('WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED');
    const finalSource = path.join(root, 'final-source');
    git(project, 'worktree', 'add', '-q', '-b', 'final-fixture', finalSource);
    fs.writeFileSync(path.join(finalSource, 'final.txt'), 'retained change\n');
    scopes.set(pathKey(finalSource), await register(finalSource));
    await archiveWorktree(project, { directory: finalSource, id: 'final-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const finalTarget = path.join(root, 'final-target');
    git(project, 'worktree', 'add', '-q', finalTarget, 'final-fixture');
    scopes.set(pathKey(finalTarget), await register(finalTarget));
    const beforeCleanup = { ...service, cleanupWorktreeArchiveRestore: async () => { throw new Error('crash before binding cleanup'); } };
    const cleanupApp = express(); cleanupApp.use(express.json());
    registerGitRoutes(cleanupApp, { worktreeArchiveSessionService: beforeCleanup });
    const cleanupCrash = await request(cleanupApp).post('/api/git/worktrees/archives/restore').query({ directory: finalTarget }).send({ id: 'final-fixture' });
    expect(cleanupCrash.status).toBe(500);
    const finalBinding = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'final-fixture' });
    expect(finalBinding.phase).toBe('finalizing');
    expect(git(project, 'for-each-ref', '--format=%(refname)', 'refs/openchamber/archive/final-fixture')).toBe('');
    git(project, 'update-ref', 'refs/openchamber/archive/final-fixture', finalBinding.snapshotCommit);
    const spuriousRefRes = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: finalTarget }).send({ id: 'final-fixture' });
    expect(spuriousRefRes.status).toBe(409);
    expect(spuriousRefRes.body.code).toBe('WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED');
    expect((await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'final-fixture' })).phase).toBe('finalizing');
    git(project, 'update-ref', '-d', 'refs/openchamber/archive/final-fixture');
    const recoveredCleanup = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: finalTarget }).send({ id: 'final-fixture' });
    expect(recoveredCleanup.status, JSON.stringify(recoveredCleanup.body)).toBe(200);
    expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'final-fixture' })).toBeNull();
    const retrySource = path.join(root, 'retry-source');
    git(project, 'worktree', 'add', '-q', '-b', 'retry-fixture', retrySource);
    fs.writeFileSync(path.join(retrySource, 'retry.txt'), 'retry change\n');
    scopes.set(pathKey(retrySource), await register(retrySource));
    await archiveWorktree(project, { directory: retrySource, id: 'retry-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const retryTarget = path.join(root, 'retry-target');
    git(project, 'worktree', 'add', '-q', retryTarget, 'retry-fixture');
    scopes.set(pathKey(retryTarget), await register(retryTarget));
    const beforeCas = { ...service, markWorktreeArchiveRestoreCasStarted: async () => { throw new Error('crash before cas'); } };
    const casApp = express(); casApp.use(express.json());
    registerGitRoutes(casApp, { worktreeArchiveSessionService: beforeCas });
    const casCrash = await request(casApp).post('/api/git/worktrees/archives/restore').query({ directory: retryTarget }).send({ id: 'retry-fixture' });
    expect(casCrash.status).toBe(500);
    const retryBinding = await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'retry-fixture' });
    expect(retryBinding.phase).toBe('finalizing');
    expect(retryBinding.restoreCasCompleted).toBe(0);
    expect(git(project, 'for-each-ref', '--format=%(refname)', 'refs/openchamber/archive/retry-fixture')).toBe('refs/openchamber/archive/retry-fixture');
    const realCommit = retryBinding.snapshotCommit;
    const baseCommit = git(project, 'rev-parse', 'HEAD');
    git(project, 'update-ref', 'refs/openchamber/archive/retry-fixture', baseCommit);
    const mismatchRes = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: retryTarget }).send({ id: 'retry-fixture' });
    expect(mismatchRes.status).toBe(409);
    expect(mismatchRes.body.code).toBe('WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED');
    expect((await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'retry-fixture' })).phase).toBe('finalizing');
    git(project, 'update-ref', '-d', 'refs/openchamber/archive/retry-fixture');
    const absentRes = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: retryTarget }).send({ id: 'retry-fixture' });
    expect(absentRes.status).toBe(409);
    expect(absentRes.body.code).toBe('WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED');
    expect((await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'retry-fixture' })).phase).toBe('finalizing');
    git(project, 'update-ref', 'refs/openchamber/archive/retry-fixture', realCommit);
    const retryRecovered = await request(app).post('/api/git/worktrees/archives/restore').query({ directory: retryTarget }).send({ id: 'retry-fixture' });
    expect(retryRecovered.status, JSON.stringify(retryRecovered.body)).toBe(200);
    expect(git(project, 'for-each-ref', '--format=%(refname)', 'refs/openchamber/archive/retry-fixture')).toBe('');
    expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'retry-fixture' })).toBeNull();
    const deleteSource = path.join(root, 'delete-source');
    git(project, 'worktree', 'add', '-q', '-b', 'delete-fixture', deleteSource);
    fs.writeFileSync(path.join(deleteSource, 'discarded.txt'), 'saved change\n');
    scopes.set(pathKey(deleteSource), await register(deleteSource));
    await archiveWorktree(project, { directory: deleteSource, id: 'delete-fixture' }, {
      worktreeWorkers: { acquire: async () => { }, release: async () => { } }, archiveSessions: service,
    });
    const held = path.join(root, 'delete-held');
    git(project, 'worktree', 'add', '-q', held, 'delete-fixture');
    const busy = await request(app).delete('/api/git/worktrees/archives').query({ directory: project })
      .send({ id: 'delete-fixture', deleteBranch: true });
    expect(busy.status).toBe(409);
    expect((await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'delete-fixture' })).phase).toBe('archived');
    git(project, 'worktree', 'remove', '--force', held);
    const deleted = await request(app).delete('/api/git/worktrees/archives').query({ directory: project })
      .send({ id: 'delete-fixture', deleteBranch: true });
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200);
    expect(deleted.body).toMatchObject({ branchDeleted: true, sessionBinding: { status: 'bound' } });
    expect(await store.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'delete-fixture' })).toBeNull();
    const exitedPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).trim());
    const deadClaim = await store.createWorktreeArchive({
      hostProjectId: 'settings-project', archiveId: 'restart-fence', archiveRef: 'refs/openchamber/archive/restart-fence',
      snapshotCommit: git(project, 'rev-parse', 'HEAD'), anchorWorkspaceId: secondScope.workspaceId,
      claimId: 'restart-claim', claimGeneration: `host_${exitedPid}_old`, branchName: 'second-fixture', branchOid: git(project, 'rev-parse', 'HEAD'),
    });
    await store.setWorktreeArchivePhase({ hostProjectId: 'settings-project', archiveId: 'restart-fence' }, 'restart-claim', deadClaim.revision, 'restoring');
    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures[fixtures.length - 1].owner = reopened;
    await expect(reopened.agentScopeStore.bindSession({ sessionId: 'restart-late', rootSessionId: 'restart-late', workspaceId: secondScope.workspaceId }))
      .rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(reopened.archiveStore.archive(['second-active'], 3456)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    const fenced = await reopened.agentScopeStore.getWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'restart-fence' });
    const reclaimed = await reopened.agentScopeStore.claimWorktreeArchive({ hostProjectId: 'settings-project', archiveId: 'restart-fence' },
      { claimId: 'new-claim', claimGeneration: `host_${process.pid}_new`, revision: fenced.revision, phase: 'restoring' });
    expect(reclaimed.claimId).toBe('new-claim');
    const fingerprint = { head: 'b'.repeat(40), tree: 'tree', index: 'index', unmerged: '', status: '', conflicts: false };
    await reopened.agentScopeStore.pinWorktreeRestore({ hostProjectId: 'settings-project', archiveId: 'restart-fence' }, {
      claimId: 'new-claim', revision: reclaimed.revision, targetWorkspaceId: projectScope.workspaceId,
      preapplyHead: fingerprint.head, preapplyFingerprint: fingerprint, expectedFingerprint: fingerprint,
    });
    await reopened.agentScopeStore.releaseWorktreeArchiveClaim({ hostProjectId: 'settings-project', archiveId: 'restart-fence' }, 'new-claim');
    await expect(reopened.agentScopeStore.bindSession({ sessionId: 'after-release', rootSessionId: 'after-release', workspaceId: secondScope.workspaceId }))
      .rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
  });
  it('orders source claims and restore target pins against Host scope mutations', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-admission-'));
    const project = path.join(root, 'project');
    const source = path.join(root, 'source');
    const nested = path.join(source, 'nested');
    const target = path.join(root, 'target');
    const targetNested = path.join(target, 'nested');
    const agent = path.join(root, 'agent');
    for (const directory of [project, nested, targetNested, agent]) fs.mkdirSync(directory, { recursive: true });
    const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures.push({ owner, root });
    const store = owner.agentScopeStore;
    const register = (cwd) => store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: project, workspaceDirectory: cwd, agentDirectory: agent, name: 'Project' });
    const [sourceScope, nestedScope, targetScope, targetNestedScope] = await Promise.all([source, nested, target, targetNested].map(register));
    await store.bindSession({ sessionId: 'source-root', rootSessionId: 'source-root', workspaceId: nestedScope.workspaceId });
    await store.bindSession({ sessionId: 'target-root', rootSessionId: 'target-root', workspaceId: targetNestedScope.workspaceId });
    const key = { hostProjectId: 'project', archiveId: 'fence' };
    const create = () => store.createWorktreeArchive({ ...key, archiveRef: 'refs/openchamber/archive/fence', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: sourceScope.workspaceId, claimId: 'capture', claimGeneration: `host_${process.pid}_capture`, branchName: 'branch', branchOid: null });
    const admission = await store.reserveSessionAdmission(nestedScope.workspaceId, 'create', 'new-root');
    await expect(create()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await store.releaseSessionAdmission(admission);
    let binding = await create();
    binding = await store.setWorktreeArchivePhase(key, 'capture', binding.revision, 'archived');
    binding = await store.releaseWorktreeArchiveClaim(key, 'capture');
    const deleting = await store.reserveSessionDelete('source-root');
    await expect(store.claimWorktreeArchive(key, { claimId: 'restore', claimGeneration: `host_${process.pid}_restore`, revision: binding.revision, phase: 'restoring' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    store.releaseSessionDelete(deleting);
    const move = { rootSessionId: 'source-root', transactionId: 'move', sourceWorkspaceId: nestedScope.workspaceId, destinationWorkspaceId: targetNestedScope.workspaceId };
    await store.createRelocation(move);
    await expect(store.claimWorktreeArchive(key, { claimId: 'restore', claimGeneration: `host_${process.pid}_restore`, revision: binding.revision, phase: 'restoring' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await store.clearRelocation(move);
    binding = await store.claimWorktreeArchive(key, { claimId: 'restore', claimGeneration: `host_${process.pid}_restore`, revision: binding.revision, phase: 'restoring' });
    await expect(store.reserveSessionAdmission(nestedScope.workspaceId, 'reopen', 'source-root')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(store.reserveSessionDelete('source-root')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    const targetDeletion = await store.reserveSessionDelete('target-root');
    const fp = { head: 'b'.repeat(40), tree: 'tree', index: 'index', unmerged: '', status: '', conflicts: false };
    const pin = () => store.pinWorktreeRestore(key, { claimId: 'restore', revision: binding.revision, targetWorkspaceId: targetScope.workspaceId, preapplyHead: fp.head, preapplyFingerprint: fp, expectedFingerprint: fp });
    await expect(pin()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    store.releaseSessionDelete(targetDeletion);
    const targetAdmission = await store.reserveSessionAdmission(targetNestedScope.workspaceId, 'fork', 'target-root');
    await expect(pin()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await store.releaseSessionAdmission(targetAdmission);
    const targetMove = { rootSessionId: 'target-root', transactionId: 'target-move', sourceWorkspaceId: targetNestedScope.workspaceId, destinationWorkspaceId: targetScope.workspaceId };
    await store.createRelocation(targetMove);
    await expect(pin()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await store.clearRelocation(targetMove);
    binding = await pin();
    await expect(store.reserveSessionAdmission(targetNestedScope.workspaceId, 'reopen', 'target-root')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await store.releaseWorktreeArchiveClaim(key, 'restore');
    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures[fixtures.length - 1].owner = reopened;
    await expect(reopened.agentScopeStore.reserveSessionDelete('target-root')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await expect(reopened.agentScopeStore.reserveSessionAdmission(nestedScope.workspaceId, 'create', 'other-root')).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
  });
  it('recovers a removal-pending binding only after dead-owner and removed-folder proof', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-removal-recovery-'));
    const project = path.join(root, 'project');
    const checkout = path.join(root, 'checkout');
    const agent = path.join(root, 'agent');
    for (const directory of [project, checkout, agent]) fs.mkdirSync(directory, { recursive: true });
    const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures.push({ owner, root });
    const store = owner.agentScopeStore;
    const scope = await store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: project, workspaceDirectory: checkout, agentDirectory: agent, name: 'Project' });
    const key = { hostProjectId: 'project', archiveId: 'removal-recovery' };
    const preexisting = 'preexisting-archived';
    await store.bindSession({ sessionId: preexisting, rootSessionId: preexisting, workspaceId: scope.workspaceId });
    await owner.archiveStore.archive([preexisting], 1234);
    const active = 'active-before-removal';
    await store.bindSession({ sessionId: active, rootSessionId: active, workspaceId: scope.workspaceId });
    let binding = await store.createWorktreeArchive({ ...key, archiveRef: 'refs/openchamber/archive/removal-recovery', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: scope.workspaceId, claimId: 'host_999999_dead', claimGeneration: 'host_999999_dead', branchName: 'branch', branchOid: null });
    binding = await store.archiveWorktreeSessions(key, 'host_999999_dead', 5678);
    binding = await store.setWorktreeArchivePhase(key, 'host_999999_dead', binding.revision, 'removal_pending');
    await expect(store.claimWorktreeArchive(key, { claimId: 'recovered', claimGeneration: `host_${process.pid}_recovered`, revision: binding.revision, phase: 'deleting' })).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    fs.rmSync(checkout, { recursive: true });
    const exitedPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).trim());
    const recovered = await store.claimWorktreeArchive(key, { claimId: 'recovered', claimGeneration: `host_${exitedPid}_recovered`, revision: binding.revision, phase: 'deleting' });
    expect(recovered.phase).toBe('deleting');
  });
  it('replays delete finalization intent after a restart without clearing the binding', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-delete-recovery-'));
    const project = path.join(root, 'project');
    const checkout = path.join(root, 'checkout');
    const agent = path.join(root, 'agent');
    for (const directory of [project, checkout, agent]) fs.mkdirSync(directory, { recursive: true });
    const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures.push({ owner, root });
    const store = owner.agentScopeStore;
    const scope = await store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: project, workspaceDirectory: checkout, agentDirectory: agent, name: 'Project' });
    const key = { hostProjectId: 'project', archiveId: 'delete-recovery' };
    let binding = await store.createWorktreeArchive({ ...key, archiveRef: 'refs/openchamber/archive/delete-recovery', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: scope.workspaceId, claimId: 'capture', claimGeneration: 'host_999999_dead_capture', branchName: 'branch', branchOid: null });
    binding = await store.setWorktreeArchivePhase(key, 'capture', binding.revision, 'archived');
    const exitedPid = Number(execFileSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).trim());
    const claimed = await store.claimWorktreeArchive(key, { claimId: 'delete', claimGeneration: `host_${exitedPid}_delete`, revision: binding.revision, phase: 'deleting' });
    const finalizing = await store.markWorktreeArchiveDeleteFinalizing(key, 'delete', claimed.revision, true);
    const replay = await store.claimWorktreeArchive(key, { claimId: 'replay', claimGeneration: `host_${exitedPid}_replay`, revision: finalizing.revision, phase: 'deleting' });
    expect(replay.phase).toBe('deleting');
    expect(replay.deleteBranchRequested).toBe(1);
  });
});
