import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from '../host/session-state.js';
import { snapshot } from '../event-stream/canonical-test-fixtures.js';
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
  const native = { workspaceId: source.workspaceId, pending: null, commitFailure: false, loseCommitResponse: false, prepareFailure: false, abortFailure: false, active: false, calls: [], readSignals: [], compactResult: { type: 'compact', compactionId: 'compact-id', tokensBefore: 9000, completedAt: 1700000000002 } };
  const runtime = (sessionId = 'public-root') => {
    const session = {
      sessionId, rootSessionId: 'public-root',
      projectId: source.projectId, workspaceId: native.workspaceId, displayPath: '.', createdAt: 1700000000000, updatedAt: 1700000000001,
      mode: { kind: 'main' },
      epoch: 'epoch-native', headSequence: '0', runtimeStatus: native.active ? 'running' : 'idle', activeRunId: native.active ? 'active-run' : null
    };
    if (sessionId === 'public-child') session.parentSessionId = 'public-root';
    return session;
  };
  const request = async (pathname, init = {}) => {
    if (init.signal) {
      native.readSignals.push({ pathname, signal: init.signal });
      init.signal.throwIfAborted();
    }
    const body = init.body ? JSON.parse(init.body) : null;
    native.calls.push({ pathname, body });
    if (native.pause?.pathname === pathname) { native.pause.entered(); await native.pause.wait; }
    if (native.refusePath === pathname) return Response.json({ type: 'urn:ohpichamber:problem:COMMAND_IN_FLIGHT', title: 'Busy', status: 409, code: 'COMMAND_IN_FLIGHT', detail: 'Admission refused', retryable: false }, { status: 409 });
    if (native.failPath === pathname) throw new Error('Native reply was lost');
    if (native.unavailablePath === pathname) return Response.json({ type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'The worker failed to initialize', retryable: false }, { status: 503 });
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
    if (pathname.startsWith('/api/agent/v1/sessions?')) return Response.json({ items: native.listed ?? [], errors: native.listErrors ?? [] });
    if (pathname === '/internal/sessions') return Response.json({ ...runtime(body.rootSessionId), rootSessionId: body.rootSessionId });
    if (pathname === '/api/agent/v1/sessions/public-root/snapshot') return Response.json(snapshot([], [], runtime()));
    if (pathname.endsWith('/reopen')) return Response.json(runtime());
    if (pathname === '/api/agent/v1/sessions/public-root' && init.method === 'DELETE')
      return Response.json({ sessionId: 'public-root', deletedSessionIds: ['public-root'] });
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
    if (pathname.endsWith('/control')) {
      if (body.type === 'btw.branch') return Response.json({ type: 'btw.branch', sessionId: 'btw-branched-root', rootSessionId: 'btw-branched-root', sessionFile: '/tmp/btw-branched-root.jsonl', branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: null } });
      if (body.type === 'mode.set') return Response.json({ type: 'mode.set', mode: body.mode === 'main' ? { kind: 'main' } : body.mode === 'vibe' ? { kind: 'vibe' } : { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' } });
      if (body.type === 'goal') return Response.json({ type: 'goal', mode: body.op === 'drop' ? { kind: 'main' } : { kind: 'goal', status: body.op === 'pause' ? 'paused' : 'active', objective: body.objective || 'Finish the task', tokenBudget: body.tokenBudget ?? null, tokensUsed: 0 } });
      return Response.json(native.compactResult);
    }
    if (pathname === '/api/agent/v1/sessions/forked-child') return Response.json({ ...runtime('forked-child'), rootSessionId: 'forked-child' });
    if (pathname.endsWith('/snapshot')) {
      const sessionId = decodeURIComponent(pathname.split('/').at(-2));
      return Response.json(snapshot([], [], { ...runtime(sessionId), rootSessionId: sessionId }));
    }
    if (pathname.startsWith('/api/agent/v1/sessions/')) return Response.json(runtime(decodeURIComponent(pathname.split('/').at(-1))));
    throw new Error(`Unexpected private request ${pathname}`);
  };
  const registrations = [];
  const makeService = (state = owner) => createOpenChamberSessionService({
    service: { request }, agentScopeStore: state.agentScopeStore, resolveHostRelocationScope: (id) => state.agentScopeStore.getSession(id),
    resolveSessionScope: (id) => state.agentScopeStore.getSession(id), resolveHostSessionScope: (id) => state.agentScopeStore.getSession(id),
    resolveWorkspaceScope: async (id) => { const scope = await state.agentScopeStore.getWorkspace(id); return scope && { ...scope, displayPath: '.' }; }, registerSessionScope: async (session) => { registrations.push(session.sessionId); return true; },
    listWorkspaceScopes: async () => ({ items: [{ workspaceId: source.workspaceId }], errors: {} }),
    resolveAttachments: async () => [], capturePrompt: async (_scope, prompt) => prompt, beforeDispatch: async () => { }, onPromptAccepted: async () => { },
    directCommandAdmissionStore: state.directCommandAdmissionStore,
    archiveStore: state.archiveStore, sessionMetadataStore: state.sessionMetadataStore,
  });
  return { owner, root, store, source, destination, native, makeService, registrations };
};

describe('Host native session control saga', () => {
  it('forwards read cancellation and keeps aborted global inventory non-authoritative', async () => {
    const { native, makeService, source } = await fixture();
    const service = makeService();
    const controller = new AbortController();
    await service.open('public-root', { signal: controller.signal });
    expect(await service.list(undefined, { signal: controller.signal })).toEqual({ items: [], errors: {} });
    expect(native.readSignals).toContainEqual({ pathname: '/api/agent/v1/sessions/public-root/snapshot', signal: controller.signal });
    expect(native.readSignals).toContainEqual({ pathname: `/api/agent/v1/sessions?workspaceId=${encodeURIComponent(source.workspaceId)}`, signal: controller.signal });
    controller.abort();
    await expect(service.open('public-root', { signal: controller.signal })).rejects.toThrow();
    const inventory = await service.list(undefined, { signal: controller.signal });
    expect(inventory.errors[source.workspaceId]).toBe('SERVICE_UNAVAILABLE');
  });

  it('forwards authorized mode transitions without storing mode in the Host', async () => {
    const { native, makeService } = await fixture();
    const service = makeService();
    expect(await service.control('public-root', { type: 'mode.set', mode: 'plan' })).toEqual({
      type: 'mode.set', mode: { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' },
    });
    expect(native.calls).toContainEqual({ pathname: '/api/agent/v1/sessions/public-root/control', body: { type: 'mode.set', mode: 'plan' } });
    expect(await service.control('public-root', { type: 'mode.set', mode: 'main' })).toEqual({ type: 'mode.set', mode: { kind: 'main' } });
    expect(await service.control('public-root', { type: 'mode.set', mode: 'vibe' })).toEqual({ type: 'mode.set', mode: { kind: 'vibe' } });
    expect(native.calls).toContainEqual({ pathname: '/api/agent/v1/sessions/public-root/control', body: { type: 'mode.set', mode: 'vibe' } });
  });
  it('forwards authorized goal lifecycle commands and rejects empty objectives before native dispatch', async () => {
    const { native, makeService } = await fixture();
    const service = makeService();
    const create = { type: 'goal', op: 'create', objective: 'Finish the task', tokenBudget: 5000 };
    await expect(service.control('public-root', create)).resolves.toMatchObject({ type: 'goal', mode: { kind: 'goal', objective: create.objective, tokenBudget: 5000 } });
    expect(native.calls.at(-1)).toEqual({ pathname: '/api/agent/v1/sessions/public-root/control', body: create });
    await expect(service.control('public-root', { type: 'goal', op: 'pause' })).resolves.toMatchObject({ mode: { kind: 'goal', status: 'paused' } });
    await expect(service.control('public-root', { type: 'goal', op: 'resume' })).resolves.toMatchObject({ mode: { kind: 'goal', status: 'active' } });
    await expect(service.control('public-root', { type: 'goal', op: 'drop' })).resolves.toEqual({ type: 'goal', mode: { kind: 'main' } });
    const count = native.calls.length;
    await expect(service.control('public-root', { type: 'goal', op: 'create', objective: '  ' })).rejects.toMatchObject({ statusCode: 400 });
    expect(native.calls).toHaveLength(count);
    await expect(service.control('missing-session', create)).rejects.toMatchObject({ statusCode: 404 });
  });
  it('moves the Host binding with the identity a /btw branch mints', async () => {
    const { owner, store, native, makeService } = await fixture();
    const service = makeService();
    const issue = { id: 'owner/repo#1', title: 'Issue', url: 'https://github.com/owner/repo/issues/1', kind: 'issue', number: 1, linkedAt: 1 };
    await service.setSessionLinks('public-root', { entries: [issue], linked: true });
    const saved = await service.getMetadata('public-root');
    expect(saved.metadata).toMatchObject({ openchamber: { linked_issues: [issue] } });
    const ack = await service.control('public-root', { type: 'btw.branch', recordId: 'btw-record-1' });
    expect(ack).toMatchObject({ type: 'btw.branch', sessionId: 'btw-branched-root' });
    expect(native.calls.at(-1)).toEqual({ pathname: '/api/agent/v1/sessions/public-root/control', body: { type: 'btw.branch', recordId: 'btw-record-1' } });
    // The transcript moved to the minted id: every root-addressed read must
    // resolve against it, and the pre-branch id must no longer name a session.
    await expect(store.getSession('btw-branched-root')).resolves.toMatchObject({ sessionId: 'btw-branched-root', rootSessionId: 'btw-branched-root' });
    await expect(store.getSession('public-root')).resolves.toBeNull();
    await expect(service.open('btw-branched-root')).resolves.toMatchObject({ session: { sessionId: 'btw-branched-root' } });
    await expect(service.open('public-root')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.getMetadata('btw-branched-root')).resolves.toEqual({ ...saved, sessionId: 'btw-branched-root' });
    await expect(owner.sessionMetadataStore.getState('public-root')).resolves.toBeNull();
  });

  it.each([
    ['public-root', 'btw-branched-root'],
    ['another-root', 'another-root'],
    [null, null],
  ])('rekeys only a multi-run membership owned by the promoted root (%s)', async (ownerId, expectedId) => {
    const { makeService } = await fixture();
    const service = makeService();
    const multirun = {
      version: 1, sessionID: ownerId, group: { kind: 'id', id: '957a6bd0-bf88-4497-9add-da381ed07ca5' },
      groupSlug: 'comparison', providerID: 'provider', modelID: 'model', role: 'run',
    };
    const saved = await service.setMetadata('public-root', { changes: { openchamber: { multirun } } });
    await service.control('public-root', { type: 'btw.branch', recordId: 'btw-record-1' });
    const expectedMembership = expectedId === null ? saved.metadata.openchamber.multirun : { ...multirun, sessionID: expectedId };
    await expect(service.getMetadata('btw-branched-root')).resolves.toEqual({
      sessionId: 'btw-branched-root', revision: saved.revision,
      metadata: { openchamber: { multirun: expectedMembership } },
    });
  });

  it('releases an admission on a known pre-dispatch refusal', async () => {
    const { store, source, native, makeService } = await fixture();
    native.refusePath = '/internal/sessions/public-root/reopen';
    await expect(makeService().control('public-root', { type: 'mode.set', mode: 'plan' })).rejects.toMatchObject({ statusCode: 409, code: 'COMMAND_IN_FLIGHT' });
    const input = { hostProjectId: 'project', archiveId: 'refused-reopen', archiveRef: 'refs/openchamber/archive/refused-reopen', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: source.workspaceId, claimId: 'claim', claimGeneration: `host_${process.pid}_fixture`, branchName: 'branch', branchOid: null };
    await expect(store.createWorktreeArchive(input)).resolves.toMatchObject({ archiveId: 'refused-reopen' });
    expect(native.calls.filter(({ pathname }) => pathname === native.refusePath)).toHaveLength(1);
  });
  it('keeps a fork admission reserved through the native reply and Host registration', async () => {
    const { store, source, native, makeService } = await fixture();
    let entered;
    let resume;
    const dispatched = new Promise((resolve) => { entered = resolve; });
    const wait = new Promise((resolve) => { resume = resolve; });
    native.pause = { pathname: '/internal/sessions/public-root/fork', entered, wait };
    const service = makeService();
    const fork = service.fork('public-root', { mode: 'selected', messageId: 'message-7' });
    await dispatched;
    const input = { hostProjectId: 'project', archiveId: 'fork-race', archiveRef: 'refs/openchamber/archive/fork-race', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: source.workspaceId, claimId: 'claim', claimGeneration: `host_${process.pid}_fixture`, branchName: 'branch', branchOid: null };
    await expect(store.createWorktreeArchive(input)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    resume();
    await expect(fork).resolves.toMatchObject({ session: { sessionId: 'forked-child' } });
    await store.createWorktreeArchive(input);
    const before = native.calls.length;
    await expect(service.fork('public-root', { mode: 'selected', messageId: 'message-7' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    expect(native.calls.length).toBe(before);
  });
  it('retains an uncertain fork admission across Host restart', async () => {
    const { owner, root, store, source, native, makeService } = await fixture();
    native.failPath = '/internal/sessions/public-root/fork';
    await expect(makeService().fork('public-root', { mode: 'selected', messageId: 'message-7' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT', retryable: false });
    await expect(makeService().fork('public-root', { mode: 'selected', messageId: 'message-7' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures[fixtures.length - 1].owner = reopened;
    await expect(reopened.agentScopeStore.createWorktreeArchive({ hostProjectId: 'project', archiveId: 'uncertain-fork', archiveRef: 'refs/openchamber/archive/uncertain-fork', snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: source.workspaceId, claimId: 'claim', claimGeneration: `host_${process.pid}_fixture`, branchName: 'branch', branchOid: null })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
  });
  it.each([false, true])('settles a create admission an earlier Host process left once the native listing proves its outcome (root listed: %s)', async (rootListed) => {
    const { owner, root, source, native, makeService, registrations } = await fixture();
    const create = (service) => service.create({ projectId: source.projectId, workspaceId: source.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } });
    native.failPath = '/internal/sessions';
    await expect(create(makeService())).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT', retryable: false });
    const strandedRoot = native.calls.find(({ pathname }) => pathname === '/internal/sessions').body.rootSessionId;
    await expect(create(makeService())).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures[fixtures.length - 1].owner = reopened;
    native.failPath = null;
    native.listErrors = [{ sessionId: 'unreadable', code: 'SESSION_RESTORE_FAILED' }];
    await expect(create(makeService(reopened))).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    native.listErrors = [];
    native.listed = !rootListed ? [] : [{ sessionId: strandedRoot, rootSessionId: strandedRoot, projectId: source.projectId, workspaceId: source.workspaceId, displayPath: '.', createdAt: 1700000000000, updatedAt: 1700000000001, mode: { kind: 'main' }, epoch: 'epoch-native', headSequence: '0', runtimeStatus: 'idle', activeRunId: null }];
    await expect(create(makeService(reopened))).resolves.toBeDefined();
    expect(registrations.includes(strandedRoot)).toBe(rootListed);
    await expect(reopened.agentScopeStore.listPriorSessionAdmissions(source.workspaceId)).resolves.toEqual([]);
  });
  it.each([false, true])('settles a create the Agent Service answered with a failure before the next admission in the same Host process (root listed: %s)', async (rootListed) => {
    const { source, native, makeService, registrations, owner } = await fixture();
    const service = makeService();
    const create = () => service.create({ projectId: source.projectId, workspaceId: source.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } });
    native.unavailablePath = '/internal/sessions';
    await expect(create()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT', retryable: false });
    const strandedRoot = native.calls.find(({ pathname }) => pathname === '/internal/sessions').body.rootSessionId;
    native.unavailablePath = null;
    native.listErrors = [{ sessionId: 'unreadable', code: 'SESSION_RESTORE_FAILED' }];
    await expect(create()).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    native.listErrors = [];
    native.listed = !rootListed ? [] : [{ sessionId: strandedRoot, rootSessionId: strandedRoot, projectId: source.projectId, workspaceId: source.workspaceId, displayPath: '.', createdAt: 1700000000000, updatedAt: 1700000000001, mode: { kind: 'main' }, epoch: 'epoch-native', headSequence: '0', runtimeStatus: 'idle', activeRunId: null }];
    await expect(create()).resolves.toBeDefined();
    expect(registrations.includes(strandedRoot)).toBe(rootListed);
    await expect(owner.agentScopeStore.listPriorSessionAdmissions(source.workspaceId)).resolves.toEqual([]);
  });
  it('keeps an uncertain fork admission fenced after Host restart', async () => {
    const { owner, root, native, makeService } = await fixture();
    native.failPath = '/internal/sessions/public-root/fork';
    await expect(makeService().fork('public-root', { mode: 'selected', messageId: 'message-7' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT', retryable: false });
    await owner.close();
    const reopened = createHostSessionState({ dataDir: path.join(root, 'host') });
    fixtures[fixtures.length - 1].owner = reopened;
    native.failPath = null;
    await expect(makeService(reopened).fork('public-root', { mode: 'selected', messageId: 'message-7' })).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
  });
  it.each(['create', 'reopen'])('reserves %s until native admission settles', async (operation) => {
    const { store, source, native, makeService } = await fixture();
    let entered;
    let resume;
    const dispatched = new Promise((resolve) => { entered = resolve; });
    const wait = new Promise((resolve) => { resume = resolve; });
    native.pause = { pathname: operation === 'create' ? '/internal/sessions' : '/internal/sessions/public-root/reopen', entered, wait };
    const service = makeService();
    const trigger = () => (operation === 'create'
      ? service.create({ projectId: source.projectId, workspaceId: source.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } })
      : service.control('public-root', { type: 'mode.set', mode: 'plan' }));
    const pending = trigger();
    await dispatched;
    const input = { hostProjectId: 'project', archiveId: `${operation}-race`, archiveRef: `refs/openchamber/archive/${operation}-race`, snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: source.workspaceId, claimId: 'claim', claimGeneration: `host_${process.pid}_fixture`, branchName: 'branch', branchOid: null };
    await expect(store.createWorktreeArchive(input)).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    resume();
    await pending;
    await store.createWorktreeArchive(input);
    const before = native.calls.length;
    const blocked = trigger();
    await expect(blocked).rejects.toMatchObject({ code: 'COMMAND_IN_FLIGHT' });
    expect(native.calls.length).toBe(before);
  });
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
      () => service.control(sessionId, { type: 'mode.set', mode: 'plan' }),
      () => service.control(sessionId, { type: 'goal', op: 'create', objective: 'Not writable' }),
    ];

    for (const mutate of mutations) {
      await expect(mutate()).rejects.toMatchObject({ statusCode: 409, code: 'SESSION_READ_ONLY' });
    }
    expect(native.calls).toEqual([]);
  });
  it('refuses prompt delivery for a removed checkout before any reopen or dispatch', async () => {
    const { store, native, makeService } = await fixture();
    const service = makeService();
    const prompt = { input: { text: 'After removal', attachments: [], context: [] }, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } };
    const getSession = store.getSession;
    store.getSession = async (id) => ({ ...await getSession(id), checkoutRemoved: true });
    for (const mutate of [
      () => service.send('public-root', prompt),
      () => service.steer('public-root', { request: prompt }),
      () => service.followUp('public-root', { request: prompt }),
    ]) {
      await expect(mutate()).rejects.toMatchObject({ statusCode: 409, code: 'SESSION_READ_ONLY' });
    }
    expect(native.calls).toEqual([]);
  });
  it('forwards compact through the authorized session control endpoint and preserves optional instructions', async () => {
    const { native, makeService } = await fixture();
    const service = makeService();
    await expect(service.control('public-root', { type: 'compact', instructions: 'Keep the decisions.' })).resolves.toEqual(native.compactResult);
    expect(native.calls.at(-1)).toMatchObject({ pathname: '/api/agent/v1/sessions/public-root/control', body: { type: 'compact', instructions: 'Keep the decisions.' } });
    await expect(service.control('missing-session', { type: 'compact' })).rejects.toMatchObject({ statusCode: 404 });
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
    await owner.sessionMetadataStore.setSessionMetadata('public-child', { notes: 'Retained child' });
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
  it('reopens a cold root before non-abort control but not before abort or delete', async () => {
    const { native, makeService } = await fixture();
    const service = makeService();
    await service.control('public-root', { type: 'mode.set', mode: 'plan' });
    expect(native.calls.map(call => call.pathname)).toEqual([
      '/internal/sessions/public-root/reopen',
      '/api/agent/v1/sessions/public-root/control',
    ]);
    native.calls.length = 0;
    await service.control('public-root', { type: 'abort', runId: 'active-run' });
    expect(native.calls.map(call => call.pathname)).toEqual([
      '/api/agent/v1/sessions/public-root/runs/active-run/abort',
    ]);
    native.calls.length = 0;
    // Delete must not reopen: the Agent Service flushes a live worker itself
    // and drops a cold root's transcript without booting one.
    expect(await service.delete('public-root')).toEqual({ sessionId: 'public-root', deletedSessionIds: ['public-root'] });
    expect(native.calls.map(call => call.pathname)).toEqual([
      '/api/agent/v1/sessions/public-root',
    ]);
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
