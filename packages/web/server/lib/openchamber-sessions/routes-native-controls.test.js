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
  const native = { workspaceId: source.workspaceId, pending: null, commitFailure: false, loseCommitResponse: false, prepareFailure: false, active: false, calls: [] };
  const runtime = (sessionId = 'public-root') => ({ sessionId, rootSessionId: 'public-root', ...(sessionId === 'public-child' ? { parentSessionId: 'public-root' } : {}),
    projectId: source.projectId, workspaceId: native.workspaceId, displayPath: '.', createdAt: 1700000000000, updatedAt: 1700000000001,
    epoch: 'epoch-native', headSequence: '0', runtimeStatus: native.active ? 'running' : 'idle', activeRunId: native.active ? 'active-run' : null });
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
    if (pathname.endsWith('/branch')) return Response.json({ sessionId: 'public-root', branch: { branchId: body.branchId, branchVersion: String(BigInt(body.branchVersion) + 1n), leafMessageId: null, ...(body.action === 'revert' ? { revert: { messageId: body.messageId } } : {}) }, draft: null });
    if (pathname.startsWith('/api/agent/v1/sessions/')) return Response.json(runtime(decodeURIComponent(pathname.split('/').at(-1))));
    throw new Error(`Unexpected private request ${pathname}`);
  };
  const makeService = () => createOpenChamberSessionService({
    service: { request }, agentScopeStore: store, resolveHostRelocationScope: (id) => store.getSession(id),
    resolveSessionScope: (id) => store.getSession(id), resolveHostSessionScope: (id) => store.getSession(id),
    resolveWorkspaceScope: (id) => store.getWorkspace(id), registerSessionScope: async () => true,
    resolveAttachments: async () => [], capturePrompt: async (_scope, prompt) => prompt, beforeDispatch: async () => {}, onPromptAccepted: async () => {},
    archiveStore: owner.archiveStore, sessionMetadataStore: owner.sessionMetadataStore,
  });
  return { owner, store, source, destination, native, makeService };
};

describe('Host native session control saga', () => {
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
});
