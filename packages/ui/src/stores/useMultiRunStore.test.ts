<<<<<<< HEAD
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
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { z } from 'zod';
import type { Metadata, Session } from '@/lib/opencode/model';
=======
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { Metadata } from '@/lib/opencode/model';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { ChildStoreManager } from '@/sync/child-store';
import { SessionMessageLoader } from '@/sync/session-message-loader';
import { setSyncRefs } from '@/sync/sync-refs';
import { setActionRefs, setOptimisticRefs } from '@/sync/session-actions';
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
const upsertedSessions: Session[] = [];
const registeredDirectories: Array<{ sessionID: string; directory: string }> = [];
const ensureChildCalls: Array<{ directory: string; bootstrap?: boolean }> = [];
const worktreeMetadataCalls: Array<{ sessionId: string; path: string }> = [];
const worktreeCreateCalls: Array<{ project: { id?: string; path: string }; args: Record<string, unknown>; options: unknown }> = [];
const worktreeBootstrapWaitCalls: string[] = [];
const operationOrder: string[] = [];
const dispatchedSessionIds: string[] = [];
const deletedSessionIds: string[] = [];
type DispatchedPart = { text: string; synthetic?: boolean };
const dispatchedParts = new Map<string, DispatchedPart[] | undefined>();
const goalWrites: Array<{ sessionId: string; directory: string; objective: string; tokenBudget: number | null }> = [];
const clearedGoals: string[] = [];
let rejectGoalFor: string | null = null;
let rejectPromptFor: string | null = null;
let createdCount = 0;
let rejectNextMembership = false;
let onCreate = () => {};
let isGitRepository = false;
let waitForWorktreeSetup = false;
const createWorktreeWithDefaultsMock = mock((project: { id?: string; path: string }, args: Record<string, unknown>, options: unknown) => {
  worktreeCreateCalls.push({ project, args, options });
  return Promise.resolve({
    source: 'sdk',
    name: 'fix-thing',
    path: '/repo-worktrees/fix-thing',
    projectDirectory: '/repo',
    branch: 'fix-thing',
    label: 'fix-thing',
    worktreeRoot: '/repo-worktrees/fix-thing',
    worktreeStatus: 'pending',
    headState: 'branch',
    worktreeSource: 'created-for-session',
  });
});
const childState = {
  session: [] as Session[],
  sessionTotal: 0,
  limit: 5,
};
const recordSchema = z.record(z.string(), z.json());

/** The RFC 7386 merge the OpenChamber metadata route performs server-side. */
const mergePatch = (current: Metadata, patch: Metadata): Metadata => {
  const base: Metadata = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) { delete base[key]; continue; }
    const nested = recordSchema.safeParse(value);
    if (!nested.success) { base[key] = value; continue; }
    const previous = recordSchema.safeParse(base[key]);
    base[key] = mergePatch(previous.success ? previous.data : {}, nested.data);
  }
  return base;
};
=======
const environment = directoryEnvironment({ home: '/home/test', lastDirectory: '/repo', fakeTimers: false });
const recordSchema = z.record(z.string(), z.json());
const mergePatch = (current: Metadata, patch: Metadata): Metadata => {
  const base: Metadata = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) { delete base[key]; continue; }
    const nested = recordSchema.safeParse(value);
    if (!nested.success) { base[key] = value; continue; }
    const previous = recordSchema.safeParse(base[key]);
    base[key] = mergePatch(previous.success ? previous.data : {}, nested.data);
  }
  return base;
};
const makeSession = (id: string, title: string, directory: string, metadata: Metadata) => ({
  id, projectID: 'p', title, location: { directory }, metadata,
  cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
});
const sessions = new Map<string, ReturnType<typeof makeSession>>();
const objectiveFiles = new Map<string, string>();
const registeredDirectories: Array<{ sessionID: string; directory: string }> = [];
const worktreeCreates: Array<{ directory: string | null; body: Metadata }> = [];
const operationOrder: string[] = [];
const dispatchedSessionIds: string[] = [];
const deletedSessionIds: string[] = [];
const dispatchedParts = new Map<string, Array<{ text: string; synthetic: boolean }>>();
const goalWrites: Array<{ sessionId: string; directory: string; objective: string; tokenBudget: number | null }> = [];
const clearedGoals: string[] = [];
let rejectGoalFor: string | null = null;
let rejectPromptFor: string | null = null;
let createdCount = 0;
let rejectNextMembership = false;
let onCreate = () => {};
let isGitRepository = false;
let waitForWorktreeSetup = false;
let bootstrapReady = false;
let releaseBootstrap = () => {};
let bootstrapGate = Promise.resolve();
let markBootstrapStarted = () => {};
let bootstrapStarted = Promise.resolve();
const readyBootstrap = { status: 'ready', phase: 'setup-ready', error: null, updatedAt: 1 };
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
const storedMetadata = new Map<string, Metadata>();
type FakeRuntimeClient = { runtime: string };
const sdkClient = { runtime: 'multirun.test' };
let activeClient: FakeRuntimeClient = sdkClient;

const fakeOpencodeClient = {
  getSdkClient: () => activeClient,
  createSession: async (params: { title?: string; metadata?: Metadata }, directory?: string | null): Promise<Session> => {
    const dir = directory ?? '/repo';
    operationOrder.push(`createSession:${dir}`);
    createdCount += 1;
    const id = createdCount === 1 ? 'ses_multirun' : `ses_multirun_${createdCount}`;
    storedMetadata.set(id, params.metadata ?? {});
    onCreate();
    return {
      id, projectID: 'p', title: params.title ?? '', directory: dir,
      cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 }, metadata: params.metadata,
    };
  },
  deleteSession: async (id: string) => {
    deletedSessionIds.push(id);
    storedMetadata.delete(id);
    return true;
  },
};

mock.module('@/lib/sessionGoalActions', () => ({
  sessionGoalIntro: (tokenBudget: number | null) => `goal intro, budget ${tokenBudget}`,
  clearSessionGoal: async (sessionId: string) => { clearedGoals.push(sessionId); },
  setSessionGoal: async (sessionId: string, directory: string, input: { objective: string; tokenBudget: number | null }) => {
    if (rejectGoalFor === sessionId) throw new Error('goal write failed');
    operationOrder.push(`goal:${sessionId}`);
    goalWrites.push({ sessionId, directory, ...input });
  },
}));

mock.module('@/sync/session-ui-store', () => ({
  resolveGoalObjective: (content: string) => content,
  routeMessage: async ({ sessionId, additionalParts }: { sessionId: string; additionalParts?: DispatchedPart[] }) => {
    if (rejectPromptFor === sessionId) throw new Error('prompt rejected');
    operationOrder.push(`prompt:${sessionId}`);
    dispatchedSessionIds.push(sessionId);
    dispatchedParts.set(sessionId, additionalParts);
  },
  useSessionUIStore: {
    getState: () => ({
      markSessionAsOpenChamberCreated: mock(() => undefined),
      setWorktreeMetadata: (sessionId: string, metadata: { path: string }) => {
        worktreeMetadataCalls.push({ sessionId, path: metadata.path });
      },
    }),
  },
}));

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: fakeOpencodeClient,
}));

mock.module('@/lib/sessionKnowledgeApi', () => ({
  syncSessionKnowledge: async () => undefined,
}));

mock.module('@/sync/session-archive-batch', () => ({
  requestSessionMetadataUpdate: async (sessionID: string, patch: Metadata) => {
    if (rejectNextMembership) {
      rejectNextMembership = false;
      return { outcome: 'unavailable' as const, reason: 'membership write failed' };
    }
    const metadata = mergePatch(storedMetadata.get(sessionID) ?? {}, patch);
    storedMetadata.set(sessionID, metadata);
    return { outcome: 'updated' as const, metadata };
  },
}));

mock.module('@/lib/gitApi', () => ({
  checkIsGitRepository: mock(() => Promise.resolve(isGitRepository)),
  resolveGitRepositoryPrefix: mock(() => Promise.resolve('')),
  validateWorktreeDirectory: mock(() => Promise.resolve({ valid: true, insideWorktreeRoot: true, resolvedWorktreeRoot: null, resolvedCwd: null })),
}));

mock.module('@/lib/worktrees/worktreeCreate', () => ({
  createWorktreeWithDefaults: createWorktreeWithDefaultsMock,
  resolveRootTrackingRemote: mock(() => Promise.resolve(null)),
}));

mock.module('@/lib/worktrees/worktreeBootstrap', () => ({
  waitForWorktreeBootstrap: (directory: string) => {
    worktreeBootstrapWaitCalls.push(directory);
    operationOrder.push(`wait:${directory}`);
    return Promise.resolve();
  },
  waitForWorktreeGitReady: () => Promise.resolve(),
}));

mock.module('@/lib/worktrees/worktreeStatus', () => ({
  getRootBranch: mock(() => Promise.resolve('main')),
}));

mock.module('@/lib/openchamberConfig', () => ({
  getWorktreeSetupWaitEnabled: mock(() => Promise.resolve(waitForWorktreeSetup)),
  saveWorktreeSetupCommands: mock(() => Promise.resolve()),
}));

mock.module('./useDirectoryStore', () => ({
  useDirectoryStore: {
    getState: () => ({ currentDirectory: '/repo' }),
  },
}));

mock.module('./useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      activeProjectId: 'project-1',
      projects: [{ id: 'project-1', path: '/repo' }],
    }),
  },
}));

mock.module('./useSnippetsStore', () => ({
  useSnippetsStore: {
    getState: () => ({
      expandText: (value: string) => Promise.resolve(value),
    }),
  },
}));

mock.module('./useGlobalSessionsStore', () => ({
  useGlobalSessionsStore: {
    getState: () => ({
      upsertSession: (session: Session) => {
        upsertedSessions.push(session);
      },
    }),
  },
}));

mock.module('@/sync/sync-refs', () => ({
  getSyncSessionDirectory: () => null,
  registerSessionDirectory: (sessionID: string, directory: string) => {
    registeredDirectories.push({ sessionID, directory });
  },
  getSyncChildStores: () => ({
    ensureChild: (directory: string, options?: { bootstrap?: boolean }) => {
      ensureChildCalls.push({ directory, bootstrap: options?.bootstrap });
      return {
        setState: (updater: typeof childState | ((state: typeof childState) => Partial<typeof childState> | typeof childState)) => {
          const patch = typeof updater === 'function' ? updater(childState) : updater;
          if (patch !== childState) {
            Object.assign(childState, patch);
          }
        },
      };
    },
  }),
}));

const { useMultiRunStore } = await import('./useMultiRunStore');

describe('useMultiRunStore', () => {
  beforeEach(() => {
    upsertedSessions.length = 0;
    registeredDirectories.length = 0;
    ensureChildCalls.length = 0;
    worktreeMetadataCalls.length = 0;
    worktreeCreateCalls.length = 0;
    worktreeBootstrapWaitCalls.length = 0;
    operationOrder.length = 0;
    dispatchedSessionIds.length = 0;
    deletedSessionIds.length = 0;
    dispatchedParts.clear();
    goalWrites.length = 0;
    clearedGoals.length = 0;
    rejectGoalFor = null;
    rejectPromptFor = null;
    createdCount = 0;
    rejectNextMembership = false;
    activeClient = sdkClient;
    storedMetadata.clear();
    onCreate = () => {};
    isGitRepository = false;
    waitForWorktreeSetup = false;
    childState.session = [];
    childState.sessionTotal = 0;
    childState.limit = 5;
    useMultiRunStore.setState({ isLoading: false, error: null });
  });

  test('registers created sessions without waiting for a sidebar refresh', async () => {
    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Fix thing',
      isolateRuns: false,
      groups: [{
        prompt: 'Fix it',
        models: [{ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' }],
      }],
    });

    expect(result?.sessionIds).toEqual(['ses_multirun']);
    expect(upsertedSessions.map((session) => session.id)).toEqual(['ses_multirun']);
    expect(registeredDirectories).toEqual([{ sessionID: 'ses_multirun', directory: '/repo' }]);
    expect(ensureChildCalls).toEqual([{ directory: '/repo', bootstrap: false }]);
    expect(childState.session.map((session) => session.id)).toEqual(['ses_multirun']);
  });

  test('membership failure does not dispatch that session or discard a successful sibling', async () => {
    rejectNextMembership = true;
    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'same name', isolateRuns: false,
      groups: [{ prompt: 'question', models: [
        { providerID: 'openrouter', modelID: 'vendor/fail' },
        { providerID: 'openrouter', modelID: 'vendor/success' },
      ] }],
    });
    // Dispatch runs in the background after createMultiRun resolves.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result?.sessionIds).toEqual(['ses_multirun_2']);
=======
environment.respond(async (url, init) => {
  const body = init?.body ? recordSchema.parse(JSON.parse(String(init.body))) : {};
  if (url.pathname === '/api/session' && init?.method === 'POST') {
    const input = z.object({
      title: z.string(), metadata: recordSchema, location: z.object({ directory: z.string() }).optional(),
    }).parse(body);
    const createDirectory = input.location?.directory ?? '/opencode-server';
    const id = ++createdCount === 1 ? 'ses_multirun' : `ses_multirun_${createdCount}`;
    const session = makeSession(id, input.title, createDirectory, input.metadata);
    sessions.set(id, session);
    operationOrder.push(`createSession:${createDirectory}`);
    onCreate();
    return Response.json({ data: session });
  }
  const metadataRoute = url.pathname.match(/^\/api\/openchamber\/sessions\/([^/]+)\/metadata$/);
  if (metadataRoute) {
    const sessionId = metadataRoute[1];
    if (rejectNextMembership) {
      rejectNextMembership = false;
      return Response.json({ error: 'membership write failed' }, { status: 503 });
    }
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    const patch = recordSchema.parse(body.patch);
    const namespace = recordSchema.safeParse(patch.openchamber);
    const goal = namespace.success ? namespace.data.goal : undefined;
    if (goal === null) clearedGoals.push(sessionId);
    if (goal && typeof goal === 'object') {
      if (rejectGoalFor === sessionId) return Response.json({ error: 'goal write failed' }, { status: 503 });
      const input = z.object({ tokenBudget: z.number().nullable() }).parse(goal);
      goalWrites.push({ sessionId, directory: session.location.directory, objective: objectiveFiles.get(sessionId) ?? '', tokenBudget: input.tokenBudget });
      operationOrder.push(`goal:${sessionId}`);
    }
    session.metadata = mergePatch(session.metadata, patch);
    return Response.json({ metadata: session.metadata });
  }
  const objectiveRoute = url.pathname.match(/^\/api\/goals\/objective\/([^/]+)$/);
  if (objectiveRoute) {
    if (init?.method === 'PUT') objectiveFiles.set(objectiveRoute[1], z.string().parse(body.content));
    else objectiveFiles.delete(objectiveRoute[1]);
    return Response.json({});
  }
  const sessionRoute = url.pathname.match(/^\/api\/session\/([^/]+)(?:\/([^/]+))?$/);
  if (sessionRoute) {
    const [, sessionId, action] = sessionRoute;
    if (!action && init?.method === 'DELETE') {
      deletedSessionIds.push(sessionId);
      sessions.delete(sessionId);
      return new Response(null, { status: 204 });
    }
    if (!action) return Response.json({ data: sessions.get(sessionId) });
    if (action === 'prompt') {
      if (rejectPromptFor === sessionId) return Response.json({ _tag: 'InvalidRequestError', message: 'prompt rejected' }, { status: 400 });
      operationOrder.push(`prompt:${sessionId}`);
      dispatchedSessionIds.push(sessionId);
      return Response.json({ data: {} });
    }
    if (action === 'synthetic') {
      const parts = dispatchedParts.get(sessionId) ?? [];
      parts.push({ text: z.string().parse(body.text), synthetic: true });
      dispatchedParts.set(sessionId, parts);
      return Response.json({ data: {} });
    }
    if (action === 'model') return new Response(null, { status: 204 });
    if (action === 'interrupt') return Response.json({ interrupted: true });
  }
  if (url.pathname === '/api/git/projects' || url.pathname === '/api/git/project-worktrees') {
    const directories = z.array(z.string()).parse(body.directories);
    return Response.json({ projects: directories.map((path) => ({ directory: path, isGitRepository, root: '/repo', worktrees: [] })) });
  }
  if (url.pathname === '/api/git/status') return Response.json({ isClean: true, current: 'main', tracking: null, ahead: 0, behind: 0, files: [] });
  if (url.pathname === '/api/git/branches') return Response.json({ current: 'main', all: ['main'], branches: { main: { name: 'main', current: true } } });
  if (url.pathname === '/api/git/toplevel') return Response.json({ root: '/repo', prefix: '' });
  if (url.pathname === '/api/git/worktrees' && init?.method === 'POST') {
    worktreeCreates.push({ directory: url.searchParams.get('directory'), body });
    return Response.json({ name: 'fix-thing', branch: 'fix-thing', path: '/repo-worktrees/fix-thing', bootstrapStatus: { status: 'pending', phase: 'directory-created', error: null, updatedAt: 1 } });
  }
  if (url.pathname === '/api/git/worktrees/bootstrap-status') {
    operationOrder.push(`wait:${url.searchParams.get('directory')}`);
    markBootstrapStarted();
    await bootstrapGate;
    bootstrapReady = true;
    return Response.json(readyBootstrap);
  }
  if (/^\/api\/projects\/[^/]+\/config$/.test(url.pathname)) return Response.json({
    trust: { hash: null, trusted: true }, setupWorktree: [], setupWorktreeWait: waitForWorktreeSetup,
    projectActions: [], projectActionsPrimaryId: null, draftStarters: [],
    shared: { status: 'missing', path: '.openchamber/project.json', setupWorktree: [], setupWorktreeWait: null, projectActions: [], draftStarters: [], plansDir: null },
    personal: { setupWorktree: [], setupWorktreeWait: null, setupWorktreeMode: 'append', projectActions: [], projectActionsPrimaryId: null, draftStarters: [], hiddenSharedActionIds: [], sharedTrust: null },
  });
  if (url.pathname === '/api/session-knowledge/sync') return Response.json({});
  if (url.pathname === '/api/config/snippets') return Response.json({ snippets: [] });
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/home/test', chatsRoot: '/home/test/chats' });
  if (url.pathname === '/api/fs/directory-stats') return Response.json({ results: [{ path: '/repo', isDirectory: true }] });
  if (url.pathname === '/api/location' || url.pathname === '/api/session') return Response.json({}, { status: 401 });
  throw new Error(`Unexpected request: ${url}`);
});

const { opencodeClient } = await import('@/lib/opencode/client');
const { useProjectsStore } = await import('./useProjectsStore');
const { useConfigStore } = await import('./useConfigStore');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useGlobalSessionsStore } = await import('./useGlobalSessionsStore');
const { useMultiRunStore } = await import('./useMultiRunStore');
let childStores = new ChildStoreManager();
let loader = new SessionMessageLoader(childStores, { sdk: opencodeClient, runtimeKey: getRuntimeKey() });
let testRuntime = 0;
const upsertedSessions = () => useGlobalSessionsStore.getState().activeSessions;
const run = (isolateRuns = false, count = 1) => useMultiRunStore.getState().createMultiRun({
  name: 'Fix thing', isolateRuns,
  groups: [{ prompt: 'Fix it', models: Array.from({ length: count }, (_, index) => ({ providerID: 'p', modelID: `model-${index}` })) }],
});
const goalRun = {
  name: 'Goal run', isolateRuns: false, goal: { tokenBudget: 1000 },
  groups: [
    { prompt: 'Variant A', models: [{ providerID: 'p', modelID: 'one' }] },
    { prompt: 'Variant B', models: [{ providerID: 'p', modelID: 'two' }] },
  ],
};
const settleDispatch = async () => {
  for (let step = 0; step < 10; step += 1) await environment.settle();
};
beforeEach(async () => {
  loader.dispose();
  childStores.disposeAll();
  switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test', runtimeKey: `multirun-test-${++testRuntime}` });
  opencodeClient.reconnectToRuntimeBaseUrl();
  await environment.settle();
  useProjectsStore.setState({ activeProjectId: 'project-1', projects: [{ id: 'project-1', path: '/repo' }] });
  opencodeClient.setDirectory('/repo');
  useConfigStore.setState({ isConnected: true });
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSessionUIStore.setState({ worktreeMetadata: new Map(), availableWorktreesByProject: new Map(), availableWorktrees: [] });
  childStores = new ChildStoreManager();
  setSyncRefs(opencodeClient.getSdkClient(), childStores, '/repo', (sessionID, directory) => registeredDirectories.push({ sessionID, directory }));
  setActionRefs(childStores, () => '/repo');
  loader = new SessionMessageLoader(childStores, { sdk: opencodeClient, runtimeKey: getRuntimeKey() });
  setOptimisticRefs(
    (input) => loader.optimisticAdd({ ...input, directory: input.directory || '/repo' }),
    (input) => loader.optimisticRemove({ ...input, directory: input.directory || '/repo' }),
    (input) => loader.optimisticConfirm({ ...input, directory: input.directory || '/repo' }),
  );
  registeredDirectories.length = worktreeCreates.length = operationOrder.length = dispatchedSessionIds.length = deletedSessionIds.length = goalWrites.length = clearedGoals.length = 0;
  dispatchedParts.clear();
  sessions.clear();
  objectiveFiles.clear();
  rejectGoalFor = rejectPromptFor = null;
  createdCount = 0;
  rejectNextMembership = isGitRepository = waitForWorktreeSetup = bootstrapReady = false;
  onCreate = () => {};
  bootstrapGate = new Promise<void>((resolve) => { releaseBootstrap = resolve; });
  bootstrapStarted = new Promise<void>((resolve) => { markBootstrapStarted = resolve; });
  useMultiRunStore.setState({ isLoading: false, error: null });
});
afterEach(async () => {
  releaseBootstrap();
  await settleDispatch();
});
environment.cleanup(() => { loader.dispose(); childStores.disposeAll(); });

describe('useMultiRunStore', () => {
  test('registers created sessions without waiting for a sidebar refresh', async () => {
    expect((await run())?.sessionIds).toEqual(['ses_multirun']);
    expect(upsertedSessions().map((session) => session.id)).toEqual(['ses_multirun']);
    expect(registeredDirectories).toEqual([{ sessionID: 'ses_multirun', directory: '/repo' }]);
    expect([...childStores.children.keys()]).toEqual(['/repo']);
    expect(childStores.getState('/repo')?.session.map((session) => session.id)).toEqual(['ses_multirun']);
  });
  test('membership failure does not dispatch that session or discard a successful sibling', async () => {
    rejectNextMembership = true;
    const result = await run(false, 2);
    await settleDispatch();
    expect(result?.sessionIds).toEqual(['ses_multirun_2']);
>>>>>>> upstream/main
    expect(result?.failedCount).toBe(1);
<<<<<<< HEAD
    expect(api.deleted).toEqual(['lane_1']);
    expect(api.dispatched.map((request) => request.sessionId)).toEqual(['lane_2']);
||||||| bc50ba56aa
    expect(deletedSessionIds).toEqual(['ses_multirun']);
    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
    expect(upsertedSessions.map((session) => session.id)).toEqual(['ses_multirun_2']);
=======
    expect(deletedSessionIds).toEqual(['ses_multirun']);
    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
    expect(upsertedSessions().map((session) => session.id)).toEqual(['ses_multirun_2']);
>>>>>>> upstream/main
  });
<<<<<<< HEAD
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
||||||| bc50ba56aa

  test('changing runtime while creating stops dispatch and registration', async () => {
    onCreate = () => {
      activeClient = { runtime: 'other-runtime.test' };
      useMultiRunStore.getState().resetForRuntimeSwitch();
    };
    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'runtime', isolateRuns: false,
      groups: [{ prompt: 'question', models: [{ providerID: 'openrouter', modelID: 'vendor/model' }] }],
    });
    expect(result).toBeNull();
    expect(dispatchedSessionIds).toEqual([]);
    expect(upsertedSessions).toEqual([]);
    expect(deletedSessionIds).toEqual([]);
=======
  test('changing runtime while creating stops dispatch and registration', async () => {
    onCreate = () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other' });
      opencodeClient.reconnectToRuntimeBaseUrl();
      useMultiRunStore.getState().resetForRuntimeSwitch();
    };
    expect(await run()).toBeNull();
    expect(dispatchedSessionIds).toEqual([]);
    expect(upsertedSessions()).toEqual([]);
    expect(deletedSessionIds).toEqual([]);
>>>>>>> upstream/main
    expect(useMultiRunStore.getState().isLoading).toBe(false);
  });
<<<<<<< HEAD
  for (const wait of [false, true]) test(`retains isolated worktree setup ordering, wait=${wait}`, async () => {
    const api = fixture({ isolate: true, wait });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: [models[0]] }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toEqual(['lane_1']);
    expect(api.worktrees[0].returnAfterDirectoryCreated).toBe(true);
    expect(api.order).toEqual(wait ? ['wait:/worktrees/1', 'create:workspace_1'] : ['create:workspace_1']);
    expect(resolveWorkspaceDirectory(api.published[0].workspaceId)).toBe('/worktrees/1');
||||||| bc50ba56aa

  test('uses fast background worktree creation for isolated runs', async () => {
    isGitRepository = true;

    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Fix thing',
      isolateRuns: true,
      groups: [{
        prompt: 'Fix it',
        models: [{ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' }],
      }],
    });

    expect(result?.sessionIds).toEqual(['ses_multirun']);
    expect(worktreeCreateCalls.length).toBe(1);
    expect(worktreeCreateCalls[0]?.project).toEqual({ id: 'project-1', path: '/repo' });
    expect(worktreeCreateCalls[0]?.args.returnAfterDirectoryCreated).toBe(true);
    expect(worktreeCreateCalls[0]?.options).toEqual({ resolvedRootTrackingRemote: null });
    expect(worktreeBootstrapWaitCalls).toEqual([]);
    expect(operationOrder).toEqual(['createSession:/repo-worktrees/fix-thing']);
    expect(registeredDirectories).toEqual([{ sessionID: 'ses_multirun', directory: '/repo-worktrees/fix-thing' }]);
    expect(worktreeMetadataCalls).toEqual([{ sessionId: 'ses_multirun', path: '/repo-worktrees/fix-thing' }]);
=======
  test('uses fast background worktree creation for isolated runs', async () => {
    isGitRepository = true;
    expect((await run(true))?.sessionIds).toEqual(['ses_multirun']);
    expect(worktreeCreates).toHaveLength(1);
    expect(worktreeCreates[0]?.directory).toBe('/repo');
    expect(worktreeCreates[0]?.body.returnAfterDirectoryCreated).toBe(true);
    expect(worktreeCreates[0]?.body.setUpstream).toBeUndefined();
    expect(bootstrapReady).toBe(false);
    expect(upsertedSessions()[0]?.directory).toBe('/repo-worktrees/fix-thing');
    expect(registeredDirectories).toEqual([{ sessionID: 'ses_multirun', directory: '/repo-worktrees/fix-thing' }]);
    expect(useSessionUIStore.getState().worktreeMetadata.get('ses_multirun')?.path).toBe('/repo-worktrees/fix-thing');
>>>>>>> upstream/main
  });
<<<<<<< HEAD
  test('a lane of a project on a repository folder starts in that folder of its worktree', async () => {
    const api = fixture({ isolate: true, startFolder: 'ai' });
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: [models[0]] }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(resolveWorkspaceDirectory(api.published[0].workspaceId)).toBe('/worktrees/1/ai');
||||||| bc50ba56aa

  test('waits for isolated worktree bootstrap when setup wait is enabled', async () => {
    isGitRepository = true;
    waitForWorktreeSetup = true;

    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Fix thing',
      isolateRuns: true,
      groups: [{
        prompt: 'Fix it',
        models: [{ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' }],
      }],
    });

    expect(result?.sessionIds).toEqual(['ses_multirun']);
    expect(worktreeBootstrapWaitCalls).toEqual(['/repo-worktrees/fix-thing']);
    expect(operationOrder).toEqual([
      'wait:/repo-worktrees/fix-thing',
      'createSession:/repo-worktrees/fix-thing',
    ]);
=======
  test('waits for isolated worktree bootstrap when setup wait is enabled', async () => {
    isGitRepository = waitForWorktreeSetup = true;
    const creating = run(true);
    await bootstrapStarted;
    try {
      await settleDispatch();
      expect(createdCount).toBe(0);
      expect(useMultiRunStore.getState().isLoading).toBe(true);
    } finally {
      releaseBootstrap();
    }
    expect((await creating)?.sessionIds).toEqual(['ses_multirun']);
    expect(bootstrapReady).toBe(true);
    expect(operationOrder.indexOf('wait:/repo-worktrees/fix-thing')).toBeLessThan(operationOrder.indexOf('createSession:/repo-worktrees/fix-thing'));
>>>>>>> upstream/main
  });
<<<<<<< HEAD
  test('no artificial five-model cap', async () => {
    const api = fixture();
    const result = await useMultiRunStore.getState().createMultiRun({ name: 'run', groups: [{ prompt: 'question', models: Array.from({ length: 6 }, () => models[0]) }] });
    await api.waitForDispatch(result?.sessionIds.length ?? 0);
    expect(result?.sessionIds).toHaveLength(6);
    expect(api.dispatched).toHaveLength(6);
||||||| bc50ba56aa

  test('accepts more than 5 models per group without a "maximum 5 models" error', async () => {
    const models = Array.from({ length: 6 }, (_, i) => ({
      providerID: 'anthropic',
      modelID: `claude-sonnet-4-5-${i}`,
    }));

    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Many models',
      isolateRuns: false,
      groups: [{ prompt: 'Fix it', models }],
    });

    expect(useMultiRunStore.getState().error).toBeNull();
    expect(result?.sessionIds).toHaveLength(6);
=======
  test('accepts more than 5 models per group without a "maximum 5 models" error', async () => {
    expect((await run(false, 6))?.sessionIds).toHaveLength(6);
    expect(useMultiRunStore.getState().error).toBeNull();
>>>>>>> upstream/main
  });
<<<<<<< HEAD
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
||||||| bc50ba56aa

  test('accepts more than 5 models on the isolated (per-worktree) dispatch path', async () => {
    isGitRepository = true;

    const models = Array.from({ length: 6 }, (_, i) => ({
      providerID: 'anthropic',
      modelID: `claude-sonnet-4-5-${i}`,
    }));

    const result = await useMultiRunStore.getState().createMultiRun({
      name: 'Many models',
      isolateRuns: true,
      groups: [{ prompt: 'Fix it', models }],
    });

    expect(useMultiRunStore.getState().error).toBeNull();
    expect(result?.sessionIds).toHaveLength(6);
    expect(worktreeCreateCalls.length).toBe(6);
  });

  const settleDispatch = () => new Promise((resolve) => setTimeout(resolve, 0));
  const goalRun = {
    name: 'Goal run',
    isolateRuns: false,
    goal: { tokenBudget: 1000 },
    groups: [
      { prompt: 'Variant A', models: [{ providerID: 'p', modelID: 'one' }] },
      { prompt: 'Variant B', models: [{ providerID: 'p', modelID: 'two' }] },
    ],
  };

  test('each lane gets its own goal, from its own prompt, before that prompt leaves', async () => {
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();

    expect(goalWrites).toEqual([
      { sessionId: 'ses_multirun', directory: '/repo', objective: 'Variant A', tokenBudget: 1000 },
      { sessionId: 'ses_multirun_2', directory: '/repo', objective: 'Variant B', tokenBudget: 1000 },
=======
  test('accepts more than 5 models on the isolated (per-worktree) dispatch path', async () => {
    isGitRepository = true;
    expect((await run(true, 6))?.sessionIds).toHaveLength(6);
    expect(useMultiRunStore.getState().error).toBeNull();
    expect(worktreeCreates).toHaveLength(6);
  });
  test('each lane gets its own goal, from its own prompt, before that prompt leaves', async () => {
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();
    expect(goalWrites).toEqual([
      { sessionId: 'ses_multirun', directory: '/repo', objective: 'Variant A', tokenBudget: 1000 },
      { sessionId: 'ses_multirun_2', directory: '/repo', objective: 'Variant B', tokenBudget: 1000 },
>>>>>>> upstream/main
    ]);
<<<<<<< HEAD
    expect(upload).toHaveBeenCalledTimes(4);
||||||| bc50ba56aa
    for (const sessionId of ['ses_multirun', 'ses_multirun_2']) {
      expect(operationOrder.indexOf(`goal:${sessionId}`)).toBeLessThan(operationOrder.indexOf(`prompt:${sessionId}`));
      expect(dispatchedParts.get(sessionId)).toEqual([{ text: 'goal intro, budget 1000', synthetic: true }]);
    }
  });

  test('a lane whose goal cannot be written is not sent, its sibling still runs', async () => {
    rejectGoalFor = 'ses_multirun';
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();

    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
  });

  test('a rejected prompt takes its goal back, so the lane does not stay working', async () => {
    rejectPromptFor = 'ses_multirun';
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();

    expect(clearedGoals).toEqual(['ses_multirun']);
    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
  });

  test('a run without a goal writes none', async () => {
    await useMultiRunStore.getState().createMultiRun({ ...goalRun, goal: undefined });
    await settleDispatch();

    expect(goalWrites).toEqual([]);
    expect(dispatchedParts.get('ses_multirun')).toBeUndefined();
=======
    for (const sessionId of ['ses_multirun', 'ses_multirun_2']) {
      expect(operationOrder.indexOf(`goal:${sessionId}`)).toBeLessThan(operationOrder.indexOf(`prompt:${sessionId}`));
      expect(dispatchedParts.get(sessionId)).toHaveLength(1);
      expect(dispatchedParts.get(sessionId)?.[0]?.text).toContain('A token budget of 1000 tokens');
      expect(dispatchedParts.get(sessionId)?.[0]?.synthetic).toBe(true);
    }
  });
  test('a lane whose goal cannot be written is not sent, its sibling still runs', async () => {
    rejectGoalFor = 'ses_multirun';
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();
    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
  });
  test('a rejected prompt takes its goal back, so the lane does not stay working', async () => {
    rejectPromptFor = 'ses_multirun';
    await useMultiRunStore.getState().createMultiRun(goalRun);
    await settleDispatch();
    expect(clearedGoals).toEqual(['ses_multirun']);
    expect(dispatchedSessionIds).toEqual(['ses_multirun_2']);
  });
  test('a run without a goal writes none', async () => {
    await useMultiRunStore.getState().createMultiRun({ ...goalRun, goal: undefined });
    await settleDispatch();
    expect(goalWrites).toEqual([]);
    expect(dispatchedParts.get('ses_multirun')).toBeUndefined();
>>>>>>> upstream/main
  });
});
