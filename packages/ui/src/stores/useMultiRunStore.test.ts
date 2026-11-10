import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as git from '@/lib/gitApi';
import * as runtime from '@/lib/runtime-switch';
import * as worktreeCreate from '@/lib/worktrees/worktreeCreate';
import * as worktreeBootstrap from '@/lib/worktrees/worktreeBootstrap';
import * as worktreeStatus from '@/lib/worktrees/worktreeStatus';
import * as config from '@/lib/openchamberConfig';
import * as sessionActions from '@/sync/session-actions';
import { useProjectsStore } from './useProjectsStore';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';
import { getMultiRunMembership } from '@/lib/multirun/identity';
import { resetWorkspaceDirectories, resolveWorkspaceDirectory } from './globalSessions';
import { dispatchRunPrompt, registerMultiRunSession, useMultiRunStore } from './useMultiRunStore';
import * as messageLoader from '@/sync/session-message-loader';
import * as syncRefs from '@/sync/sync-refs';
import { ChildStoreManager } from '@/sync/child-store';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
beforeEach(() => {
  useMultiRunStore.getState().resetForRuntimeSwitch();
  useProjectsStore.setState({ activeProjectId: 'project', projects: [{ id: 'project', path: '/repo', label: 'repo' }] });
  resetWorkspaceDirectories();
  useGlobalSessionsStore.getState().applySnapshot([], []);
});

function fixture(input: { rejectFirst?: boolean; isolate?: boolean; wait?: boolean; switchAfterCreate?: boolean; failFirstDispatch?: boolean; startFolder?: string } = {}) {
  let runtimeKey = 'multirun-owner-test';
  let count = 0;
  const metadata = new Map<string, SessionMetadata>();
  const deleted: string[] = [];
  const published: Session[] = [];
  const dispatched: Parameters<typeof sessionActions.sendMessage>[0][] = [];
  let onDispatch = () => {};
  const order: string[] = [];
  const worktrees: Parameters<typeof worktreeCreate.createWorktreeWithDefaults>[1][] = [];
  spies.push(spyOn(runtime, 'getRuntimeKey').mockImplementation(() => runtimeKey));
  const manager = new ChildStoreManager();
  const loader = new messageLoader.SessionMessageLoader(manager, { client: canonicalClient, runtimeKey });
  const observed: string[] = [];
  spies.push(spyOn(syncRefs, 'getSyncChildStores').mockReturnValue(manager));
  spies.push(spyOn(messageLoader, 'getImperativeSessionMessageLoader').mockReturnValue(loader));
  spies.push(spyOn(loader, 'ensure').mockImplementation(async (target) => { observed.push(target.sessionId); }));
  spies.push(spyOn(loader, 'getSnapshot').mockReturnValue({ ...messageLoader.EMPTY_SESSION_MESSAGE_LOAD_STATE, status: 'ready', resolved: true }));
  spies.push(spyOn(git, 'checkIsGitRepository').mockResolvedValue(Boolean(input.isolate)));
  spies.push(spyOn(git, 'resolveGitRepositoryPrefix').mockResolvedValue(input.startFolder ?? ''));
  spies.push(spyOn(git, 'validateWorktreeDirectory').mockResolvedValue({ valid: true, insideWorktreeRoot: true, resolvedWorktreeRoot: null, resolvedCwd: null }));
  spies.push(spyOn(worktreeStatus, 'getRootBranch').mockResolvedValue('main'));
  spies.push(spyOn(worktreeCreate, 'resolveRootTrackingRemote').mockResolvedValue(null));
  spies.push(spyOn(config, 'getWorktreeSetupWaitEnabled').mockResolvedValue(Boolean(input.wait)));
  spies.push(spyOn(worktreeBootstrap, 'waitForWorktreeBootstrap').mockImplementation(async (directory) => { order.push(`wait:${directory}`); }));
  // The start directory probe: the checkout holds the project's folder in the tests that ask for one.
  spies.push(spyOn(worktreeBootstrap, 'waitForWorktreeGitReady').mockResolvedValue());
  spies.push(spyOn(worktreeCreate, 'createWorktreeWithDefaults').mockImplementation(async (_project, args) => {
    worktrees.push(args);
    return { name: args.preferredName ?? 'lane', path: `/worktrees/${worktrees.length}`, branch: 'lane', label: 'lane', projectDirectory: '/repo' };
  }));
  spies.push(spyOn(useGlobalSessionsStore.getState(), 'upsertSession').mockImplementation((session) => { published.push(session); }));
  spies.push(spyOn(sessionActions, 'sendMessage').mockImplementation(async (request) => {
    expect(observed).toContain(request.sessionId);
    dispatched.push(request);
    if (input.failFirstDispatch && dispatched.length === 1) throw new Error('Lane failed');
    onDispatch();
    return null;
  }));
  spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    projectId: 'project', workspaceId: directory === '/repo' ? 'workspace' : `workspace_${directory.split('/').at(-1)}`, name: 'repo',
  })));
  spies.push(spyOn(canonicalClient, 'createSession').mockImplementation(async (request) => {
    const sessionId = `lane_${++count}`;
    order.push(`create:${request.workspaceId}`);
    metadata.set(sessionId, request.metadata ?? {});
    const session: Session = {
      sessionId, rootSessionId: sessionId, projectId: request.projectId, workspaceId: request.workspaceId, displayPath: '.',
      createdAt: count, updatedAt: count, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
      metadata: request.metadata ?? null, metadataRevision: request.metadata ? '1' : '0', archiveRevision: '0',
    };
    expect(getMultiRunMembership(session)).toBeNull();
    if (input.switchAfterCreate) { runtimeKey = 'other-runtime'; useMultiRunStore.getState().resetForRuntimeSwitch(); }
    return { session };
  }));
  spies.push(spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(async (sessionId, patch) => {
    if (input.rejectFirst && sessionId === 'lane_1') throw new Error('Membership failed');
    const previous = metadata.get(sessionId);
    const updated: SessionMetadata = { ...previous, openchamber: { ...previous?.openchamber, multirun: patch.changes.openchamber?.multirun ?? undefined } };
    metadata.set(sessionId, updated);
    return { sessionId, metadata: updated, revision: '2' };
  }));
  spies.push(spyOn(canonicalClient, 'deleteSession').mockImplementation(async (sessionId) => {
    deleted.push(sessionId); return { sessionId, deletedSessionIds: [sessionId] };
  }));
  const waitForDispatch = async (expected: number): Promise<void> => {
    if (dispatched.length >= expected) return;
    const { promise, resolve } = Promise.withResolvers<void>();
    onDispatch = () => { if (dispatched.length >= expected) resolve(); };
    await promise;
  };
  return { deleted, published, dispatched, order, worktrees, waitForDispatch, observed, manager, loader };
}

const laneInput = () => ({ runtimeKey: runtime.getRuntimeKey(), assertCurrent: () => {}, sessionId: 'lane', workspaceId: 'workspace', directory: '/repo', prompt: '/review "two words"\n tail  ', providerId: 'captured', modelId: 'model', variant: 'high', reasoningEffort: 'medium' });

describe('lane native expansion delivery', () => {
  for (const kind of ['command', 'template', 'text'] as const) test(`uses one authoritative ${kind} expansion`, async () => {
    const api = fixture();
    const input = laneInput();
    const requests: Request[] = [];
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = new Request(new URL(url instanceof Request ? url.url : String(url), 'http://test'), init);
      requests.push(request);
      expect(new URL(request.url).pathname).toBe('/api/agent/v1/workspaces/workspace/commands/expand-text');
      expect(await request.json()).toEqual({ text: input.prompt });
      return Response.json(kind === 'text' ? { kind, content: input.prompt } : { kind, content: '/already expanded\n', modelSelection: { providerId: 'bound', modelId: 'bound-model' }, agentId: 'bound-agent' });
    }));
    await dispatchRunPrompt(input);
    expect(requests).toHaveLength(1);
    expect(api.dispatched[0].request).toMatchObject({ input: { text: kind === 'text' ? input.prompt : '/already expanded\n' }, options: { providerId: kind === 'text' ? 'captured' : 'bound', modelId: kind === 'text' ? 'model' : 'bound-model', agentId: null, variant: 'high', reasoningEffort: 'medium' } });
  });
  test('expansion failure never dispatches original text', async () => {
    const api = fixture();
    spies.push(spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 })));
    await expect(dispatchRunPrompt(laneInput())).rejects.toThrow();
    expect(api.dispatched).toEqual([]);
  });
  test('late expansion cannot dispatch after its captured owner changes', async () => {
    const api = fixture();
    let current = true;
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async () => { current = false; return Response.json({ kind: 'command', content: 'Expanded' }); }));
    await expect(dispatchRunPrompt({ ...laneInput(), assertCurrent: () => { if (!current) throw new Error('owner changed'); } })).rejects.toThrow('owner changed');
    expect(api.dispatched).toEqual([]);
  });
});

const models = [
  { providerId: 'provider-a', modelId: 'vendor/a', variant: 'high', reasoningEffort: 'high' },
  { providerId: 'provider-b', modelId: 'vendor/b' },
];

describe('canonical multi-run store', () => {
  test('publishes only ID-bound native records and keeps each captured selection', async () => {
    const api = fixture();
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', isolateRuns: false, groups: [{ prompt: 'question', models }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toEqual(['lane_1', 'lane_2']);
    expect(api.published.map((session) => getMultiRunMembership(session)?.sessionID)).toEqual(['lane_1', 'lane_2']);
    expect(resolveWorkspaceDirectory(api.published[0].workspaceId)).toBe('/repo');
    expect(api.dispatched.map(({ request }) => request.options)).toEqual([
      { providerId: 'provider-a', modelId: 'vendor/a', variant: 'high', reasoningEffort: 'high', agentId: null },
      { providerId: 'provider-b', modelId: 'vendor/b', variant: null, reasoningEffort: null, agentId: null },
    ]);
    expect(api.observed).toEqual(['lane_1', 'lane_2']);
  });
  test('binding failure deletes only that undispatched lane and preserves successful siblings', async () => {
    const api = fixture({ rejectFirst: true });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', isolateRuns: false, groups: [{ prompt: 'question', models }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toEqual(['lane_2']);
    expect(result?.failedCount).toBe(1);
    expect(api.deleted).toEqual(['lane_1']);
    expect(api.dispatched.map((request) => request.sessionId)).toEqual(['lane_2']);
  });
  test('dispatch failure is isolated from its siblings', async () => {
    const api = fixture({ failFirstDispatch: true });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toHaveLength(2);
    expect(api.dispatched.map((request) => request.sessionId)).toEqual(['lane_1', 'lane_2']);
    expect(api.deleted).toEqual([]);
  });
  test('runtime change prevents publication, dispatch and cleanup in another runtime', async () => {
    const api = fixture({ switchAfterCreate: true });
    expect(await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models }] })).toBeNull();
    expect(api.published).toEqual([]);
    expect(api.dispatched).toEqual([]);
    expect(api.deleted).toEqual([]);
    expect(useMultiRunStore.getState().isLoading).toBe(false);
  });
  for (const wait of [false, true]) test(`retains isolated worktree setup ordering, wait=${wait}`, async () => {
    const api = fixture({ isolate: true, wait });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: [models[0]] }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toEqual(['lane_1']);
    expect(api.worktrees[0].returnAfterDirectoryCreated).toBe(true);
    expect(api.order).toEqual(wait ? ['wait:/worktrees/1', 'create:workspace_1'] : ['create:workspace_1']);
    expect(resolveWorkspaceDirectory(api.published[0].workspaceId)).toBe('/worktrees/1');
  });
  test('a lane of a project on a repository folder starts in that folder of its worktree', async () => {
    const api = fixture({ isolate: true, startFolder: 'ai' });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: [models[0]] }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(resolveWorkspaceDirectory(api.published[0].workspaceId)).toBe('/worktrees/1/ai');
  });
  test('no artificial five-model cap', async () => {
    const api = fixture();
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: Array.from({ length: 6 }, () => models[0]) }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toHaveLength(6);
    expect(api.dispatched).toHaveLength(6);
  });
  test('registration rejects a mismatched workspace directory', () => {
    const api = fixture();
    const unowned: Session = { sessionId: 'unowned', rootSessionId: 'unowned', projectId: 'project', workspaceId: 'unknown', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0' };
    expect(() => registerMultiRunSession(unowned, '/other')).toThrow('directory changed');
    expect(api.published).toEqual([]);
  });
  test('metadata publication preserves advanced native runtime and rejects older revisions', async () => {
    const api = fixture();
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', isolateRuns: false, groups: [{ prompt: 'question', models: [models[0]] }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    const stale = api.published[0];
    const live = { ...stale, headSequence: '10', runtimeStatus: 'running' as const, activeRunId: 'active', metadataRevision: '2' };
    const child = api.manager.ensureChild('/repo', { bootstrap: false });
    child.setState({ session: [live], sessionRevision: 40, sessionEventRevision: { [live.sessionId]: 40 } });
    useGlobalSessionsStore.setState({ entityById: new Map([[live.sessionId, live]]) });
    const metadata = { ...live.metadata, notes: 'mutation' };
    registerMultiRunSession(stale, '/repo', { sessionId: live.sessionId, metadata, revision: '3' });
    expect(child.getState().session[0]).toMatchObject({ headSequence: '10', runtimeStatus: 'running', activeRunId: 'active', metadata, metadataRevision: '3' });
    expect(child.getState().sessionEventRevision?.[live.sessionId] ?? 0).toBeGreaterThan(40);
    expect(api.published.at(-1)).toMatchObject({ headSequence: '10', runtimeStatus: 'running', metadataRevision: '3' });
    registerMultiRunSession(stale, '/repo', { sessionId: live.sessionId, metadata: null, revision: '1' });
    expect(child.getState().session[0]).toMatchObject({ headSequence: '10', runtimeStatus: 'running', metadata, metadataRevision: '3' });
  });
  test('isolated launcher re-admits shared and variant files into each lane workspace', async () => {
    const api = fixture({ isolate: true });
    const shared = { attachmentId: 'shared', name: 'shared.txt', mediaType: 'text/plain', size: 3, uri: 'attachment://shared' };
    const variant = { attachmentId: 'variant', name: 'variant.txt', mediaType: 'text/plain', size: 3, uri: 'attachment://variant' };
    const read = spyOn(canonicalClient, 'readAttachment').mockResolvedValue(new Blob(['abc']));
    const upload = spyOn(canonicalClient, 'uploadAttachment').mockImplementation(async (workspaceId, metadata) => ({
      ...metadata, attachmentId: `${workspaceId}-${metadata.name}`, uri: `attachment://${workspaceId}-${metadata.name}`, createdAt: 1,
    }));
    spies.push(read, upload);
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', attachmentWorkspaceId: 'source-workspace', files: [shared], groups: [{ prompt: 'question', files: [variant], models }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(read.mock.calls.every(([workspaceId]) => workspaceId === 'source-workspace')).toBe(true);
    expect(api.dispatched.map(({ request }) => request.input.attachments.map((file) => file.attachmentId))).toEqual([
      ['workspace_1-shared.txt', 'workspace_1-variant.txt'],
      ['workspace_2-shared.txt', 'workspace_2-variant.txt'],
    ]);
    expect(upload).toHaveBeenCalledTimes(4);
  });
});
