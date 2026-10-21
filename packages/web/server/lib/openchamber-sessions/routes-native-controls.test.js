import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from '../host/session-state.js';
import { createOpenChamberSessionService } from './routes.js';

const fixtures = [];
afterEach(async () => {
  while (fixtures.length) {
    const { owner, root } = fixtures.pop();
    await owner.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// These tests exercise the Host saga against real SQLite ownership. Native SDK
// tree persistence and worker relocation are covered by registry-native.test.ts.
const fixture = async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'host-native-controls-'));
  const cwd = path.join(root, 'project');
  const destinationCwd = path.join(cwd, 'worktree');
  const agentDirectory = path.join(root, 'agent');
  fs.mkdirSync(destinationCwd, { recursive: true });
  fs.mkdirSync(agentDirectory);
  const owner = createHostSessionState({ dataDir: path.join(root, 'host') });
  fixtures.push({ owner, root });
  const store = owner.agentScopeStore;
  const source = await store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: cwd, workspaceDirectory: cwd, agentDirectory, name: 'Project' });
  const destination = await store.ensureWorkspace({ hostProjectId: 'project', projectDirectory: cwd, workspaceDirectory: destinationCwd, agentDirectory, name: 'Project' });
  for (const sessionId of ['public-root', 'public-child']) await store.bindSession({ sessionId, rootSessionId: 'public-root', workspaceId: source.workspaceId });
  const native = { workspaceId: source.workspaceId, pending: null, commitFailure: false, loseCommitResponse: false, prepareFailure: false, abortFailure: false, active: false, calls: [] };
  const runtime = (sessionId = 'public-root') => {
    const session = { sessionId, rootSessionId: 'public-root',
      projectId: source.projectId, workspaceId: native.workspaceId, displayPath: '.', createdAt: 1700000000000, updatedAt: 1700000000001,
      epoch: 'epoch-native', headSequence: '0', runtimeStatus: native.active ? 'running' : 'idle', activeRunId: native.active ? 'active-run' : null };
    if (sessionId === 'public-child') session.parentSessionId = 'public-root';
    return session;
  };
  const request = async (pathname, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    native.calls.push({ pathname, body });
    if (pathname.endsWith('/relocation')) return Response.json({ relocation: native.pending });
    if (pathname.endsWith('/relocation/prepare')) {
      if (native.prepareFailure) return Response.json({ type: 'urn:ohpichamber:problem:RUN_ACTIVE', title: 'Busy', status: 409, code: 'RUN_ACTIVE', detail: 'Session run is active', retryable: false }, { status: 409 });
      native.pending = { transactionId: body.transactionId, sourceWorkspaceId: body.sourceWorkspaceId, destinationWorkspaceId: body.destination.workspaceId };
      native.workspaceId = body.destination.workspaceId;
      return Response.json({ transactionId: body.transactionId, session: runtime() });
    }
    if (pathname.endsWith('/relocation/finalize')) {
      if (!native.pending || native.pending.transactionId !== body.transactionId) throw new Error('Unexpected native transaction');
      if (body.action === 'commit' && native.commitFailure) throw new Error('Native commit publication failed');
      if (body.action === 'rollback') native.workspaceId = native.pending.sourceWorkspaceId;
      native.pending = null;
      if (body.action === 'commit' && native.loseCommitResponse) { native.loseCommitResponse = false; throw new Error('Commit response was lost'); }
      return Response.json({ session: runtime() });
    }
    if (pathname.endsWith('/reopen')) return Response.json(runtime());
    if (pathname.includes('/native-entry/')) return Response.json({ entryId: decodeURIComponent(pathname.split('/').at(-1)) });
    if (pathname.endsWith('/fork')) return Response.json({ sessionId: 'forked-child', rootSessionId: 'forked-child', sessionFile: '/tmp/forked-child.jsonl', sourceSessionId: 'public-root', entryId: 'message-7', mode: 'selected' }, { status: 201 });
    if (pathname.endsWith('/branch')) {
      const branch = { branchId: body.branchId, branchVersion: String(BigInt(body.branchVersion) + 1n), leafMessageId: null };
      if (body.action === 'revert') branch.revert = { messageId: body.messageId };
      return Response.json({ sessionId: 'public-root', branch, draft: null });
    }
    if (pathname.endsWith('/abort')) {
      if (native.abortFailure) return Response.json({ type: 'urn:ohpichamber:problem:RUN_NOT_FOUND', title: 'Run not found', status: 404, code: 'RUN_NOT_FOUND', detail: 'Run not found', retryable: false }, { status: 404 });
      return Response.json({ run: { runId: decodeURIComponent(pathname.split('/').at(-2)), sessionId: 'public-root', status: 'cancelled', createdAt: 1700000000000, finishedAt: 1700000000002 } });
    }
    if (pathname === '/api/agent/v1/sessions/forked-child') return Response.json({ ...runtime('forked-child'), rootSessionId: 'forked-child' });
    if (pathname.startsWith('/api/agent/v1/sessions/')) return Response.json(runtime(decodeURIComponent(pathname.split('/').at(-1))));
    throw new Error(`Unexpected private request ${pathname}`);
  };
  const registrations = [];
  const makeService = () => createOpenChamberSessionService({
    service: { request }, agentScopeStore: store, resolveHostRelocationScope: (id) => store.getSession(id),
    resolveSessionScope: (id) => store.getSession(id), resolveHostSessionScope: (id) => store.getSession(id),
    resolveWorkspaceScope: (id) => store.getWorkspace(id), registerSessionScope: async (session) => { registrations.push(session.sessionId); return true; },
    resolveAttachments: async () => [], capturePrompt: async (_scope, prompt) => prompt, beforeDispatch: async () => {}, onPromptAccepted: async () => {},
    directCommandAdmissionStore: owner.directCommandAdmissionStore,
    archiveStore: owner.archiveStore, sessionMetadataStore: owner.sessionMetadataStore,
  });
  return { owner, root, store, source, destination, native, makeService, registrations };
};

describe('Host native session control saga', () => {
  it('refuses native mutations for deleted-space sessions before dispatch', async () => {
    const { root, store, destination, native, makeService } = await fixture();
    const spaceId = 'a1b2c3d4e5f6';
    const archiveDirectory = path.join(root, 'archive', spaceId);
    fs.mkdirSync(archiveDirectory, { recursive: true });
    const workspace = await store.ensureWorkspace({
      hostProjectId: `archive_${spaceId}`,
      projectId: `archive_${spaceId}`,
      workspaceId: `archive_${spaceId}`,
      projectDirectory: archiveDirectory,
      workspaceDirectory: archiveDirectory,
      agentDirectory: path.join(root, 'agent'),
      name: 'Deleted space archive',
    });
    const sessionId = 'deleted-space-session';
    await store.bindSession({ sessionId, rootSessionId: sessionId, workspaceId: workspace.workspaceId });
    const service = makeService();
    const mutations = [
      () => service.send(sessionId, {}),
      () => service.steer(sessionId, {}),
      () => service.followUp(sessionId, {}),
      () => service.fork(sessionId, {}),
      () => service.selectBranch(sessionId, { action: 'restore', branchId: 'branch-owner', branchVersion: '3' }),
      () => service.relocate(sessionId, { workspaceId: destination.workspaceId }),
      () => service.control(sessionId, { type: 'abort', runId: 'run-1' }),
    ];

    for (const mutate of mutations) {
      await expect(mutate()).rejects.toMatchObject({ statusCode: 409, code: 'SESSION_READ_ONLY' });
    }
    expect(native.calls).toEqual([]);
  });
  it('returns the settled abort run unchanged and preserves native run-not-found and non-abort refusal', async () => {
    const { native, makeService } = await fixture();
    const service = makeService();
    await expect(service.control('public-root', { type: 'abort', runId: 'active-run' }))
      .resolves.toMatchObject({ run: { runId: 'active-run', status: 'cancelled' } });
    native.abortFailure = true;
    await expect(service.control('public-root', { type: 'abort', runId: 'active-run' }))
      .rejects.toMatchObject({ statusCode: 404, code: 'RUN_NOT_FOUND' });
    await expect(service.control('public-root', { type: 'restart', runId: 'active-run' }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(native.calls.filter((call) => call.pathname.endsWith('/abort'))).toHaveLength(2);
  });
  it('publishes all admitted family identities at the destination and retains Host metadata and archive revisions', async () => {
    const { owner, store, destination, makeService } = await fixture();
    await owner.sessionMetadataStore.setSessionMetadata('public-child', { title: 'Retained child' });
    await owner.archiveStore.archive(['public-child'], 1700000000000);
    const metadata = await owner.sessionMetadataStore.getState('public-child');
    const archive = await owner.archiveStore.getState('public-child');
    const result = await makeService().relocate('public-root', { workspaceId: destination.workspaceId });
    expect(result.sessions.map((session) => session.sessionId)).toEqual(['public-child', 'public-root']);
    expect(result.sessions.every((session) => session.workspaceId === destination.workspaceId)).toBe(true);
    expect(result.sessions[0]).toMatchObject({ metadata: metadata.metadata, metadataRevision: metadata.revision, archiveRevision: archive.revision, archivedAt: archive.archivedAt });
    await expect(store.getRelocation('public-root')).resolves.toBeNull();
  });

  it('restores source ownership when native finalization fails with a matching pending intent', async () => {
    const { store, source, destination, native, makeService } = await fixture();
    native.commitFailure = true;
    await expect(makeService().relocate('public-root', { workspaceId: destination.workspaceId })).rejects.toThrow('Native commit publication failed');
    expect((await store.listSessionFamily('public-root')).every((member) => member.workspaceId === source.workspaceId)).toBe(true);
    expect(native.workspaceId).toBe(source.workspaceId);
    expect(native.pending).toBeNull();
    await expect(store.getRelocation('public-root')).resolves.toBeNull();
  });

  it('reconciles a lost successful commit response without rebinding the family to its old source', async () => {
    const { store, destination, native, makeService } = await fixture();
    native.loseCommitResponse = true;
    await expect(makeService().relocate('public-root', { workspaceId: destination.workspaceId })).resolves.toMatchObject({ sessions: expect.arrayContaining([expect.objectContaining({ sessionId: 'public-root', workspaceId: destination.workspaceId })]) });
    expect((await store.listSessionFamily('public-root')).every((member) => member.workspaceId === destination.workspaceId)).toBe(true);
    expect(native.calls.filter((call) => call.body?.action === 'rollback')).toHaveLength(0);
    await expect(store.getRelocation('public-root')).resolves.toBeNull();
  });

  it('clears a Host-only intent after active-run rejection without altering the source runtime', async () => {
    const { store, source, destination, native, makeService } = await fixture();
    native.prepareFailure = true;
    native.active = true;
    await expect(makeService().relocate('public-root', { workspaceId: destination.workspaceId })).rejects.toMatchObject({ code: 'RUN_ACTIVE', statusCode: 409 });
    await expect(store.getRelocation('public-root')).resolves.toBeNull();
    expect(native.workspaceId).toBe(source.workspaceId);
    expect(native.active).toBe(true);
  });

  it('recovers a durable destination intent before normal branch commands after Host restart', async () => {
    const { store, source, destination, native, makeService } = await fixture();
    const intent = { rootSessionId: 'public-root', transactionId: 'interrupted-relocation', sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
    await store.createRelocation(intent);
    await store.rebindSessionFamily(intent);
    native.pending = { transactionId: intent.transactionId, sourceWorkspaceId: intent.sourceWorkspaceId, destinationWorkspaceId: intent.destinationWorkspaceId };
    native.workspaceId = destination.workspaceId;
    await expect(makeService().selectBranch('public-root', { action: 'restore', branchId: 'branch-owner', branchVersion: '3' })).resolves.toMatchObject({ branch: { branchVersion: '4' } });
    expect(native.calls.findIndex((call) => call.pathname.endsWith('/relocation/finalize'))).toBeLessThan(native.calls.findIndex((call) => call.pathname.endsWith('/branch')));
    await expect(store.getRelocation('public-root')).resolves.toBeNull();
  });
  it('reopens the authorized source, forks the selected message, and registers the returned child scope', async () => {
    const { native, makeService, registrations, source } = await fixture();
    const service = makeService();
    const result = await service.fork('public-root', { messageId: 'message-7', mode: 'selected' });
    expect(result.session).toMatchObject({ sessionId: 'forked-child', rootSessionId: 'forked-child', projectId: source.projectId, workspaceId: native.workspaceId });
    expect(native.calls.map((call) => call.pathname)).toEqual([
      '/internal/sessions/public-root/reopen',
      '/internal/sessions/public-root/native-entry/message-7',
      '/internal/sessions/public-root/fork',
      '/api/agent/v1/sessions/forked-child',
    ]);
    expect(native.calls.at(-2).body).toEqual({ sourceSessionId: 'public-root', entryId: 'message-7', mode: 'selected' });
    expect(registrations).toEqual(['forked-child']);
  });
});
