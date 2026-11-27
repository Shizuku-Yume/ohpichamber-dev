import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { ensureChatsRootDirectory, CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { hostFilesystem } from '@/lib/host-filesystem';
import { clearWorktreeRemoval, markWorktreeRemoving } from '@/lib/worktrees/worktreeRemovalState';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import { ChildStoreManager } from './child-store';
import { setSyncRefs } from './sync-refs';
import { AmbiguousSendAdoptedError, setActionRefs, setOptimisticRefs } from './session-actions';
import { useSessionWorktreeStore } from './session-worktree-store';
import { routeMessage, useSessionUIStore } from './session-ui-store';
import { resetSendReconciliationForTests, setSendReconciliationTestClock } from './send-reconciliation';
import { ROOT_SELECTION_AGENT, useSelectionStore } from './selection-store';
import { buildComposerContext, buildOutgoingMessage, queuedContextToParts } from '@/components/chat/composer/submit/buildOutgoingMessage';
import { deferred, nativeSnapshot } from './session-message-loader-test-fixtures';

const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
const originalFetch = globalThis.fetch;
const originalConfig = useConfigStore.getState();
const originalSkills = useSkillsStore.getState();
const originalCommands = useCommandsStore.getState();
const originalProjects = useProjectsStore.getState();
const originalDirectory = useDirectoryStore.getState();
let manager;
let restorers = [];
let resolvedDirectories = [];
let runCalls = [];
let runtimeNumber = 0;

const hostSession = (sessionId, workspaceId = 'workspace-a') => ({
  ...nativeSnapshot(sessionId, []).session,
  workspaceId,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
});
const runAck = (sessionId) => ({ run: { runId: 'run-a', sessionId, status: 'running', createdAt: 1 } });
const stub = (owner, method, implementation) => {
  const spy = spyOn(owner, method).mockImplementation(implementation);
  restorers.push(() => spy.mockRestore());
  return spy;
};
const send = (content = 'hello', options = {}, variant, agent = 'build') =>
  useSessionUIStore.getState().sendMessage(
    content, 'provider-a', 'model-a', agent, undefined, undefined, undefined, variant, 'normal', options,
  );
const route = (overrides = {}) => routeMessage({
  sessionId: 'session-a', directory: '/repo', content: 'hello',
  providerID: 'provider-a', modelID: 'model-a', ...overrides,
});
const seedCanonicalSession = () => {
  manager.ensureChild('/repo', { bootstrap: false });
  manager.children.get('/repo').setState({ session: [hostSession('session-a')] });
};
const fakeFileResources = ({ expand, fallback } = {}) => {
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const match = /^\/api\/agent\/v1\/workspaces\/([^/]+)\/commands\/expand-text$/.exec(path);
    if (!match) {
      if (path.startsWith('/api/agent/')) throw new Error(`Unexpected canonical request ${request.method} ${path}`);
      return fallback ? fallback(request) : Response.json({ text: '', signature: '' });
    }
    const workspaceId = decodeURIComponent(match[1]);
    const body = await request.json();
    requests.push({ workspaceId, method: request.method, body });
    return expand ? expand({ workspaceId, body }) : Response.json({ kind: 'text', content: body.text });
  };
  return requests;
};


beforeEach(async () => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://ui-native.test', runtimeKey: `ui-native-${++runtimeNumber}` });
  setSendReconciliationTestClock((() => {
    let virtualNow = 0
    return {
      pollDelays: [1, 2, 4],
      steadyDelay: 5,
      retentionMs: 60_000,
      sleep: async (ms) => { virtualNow += ms },
      now: () => virtualNow,
    }
  })());
  stub(hostFilesystem, 'getFilesystemHomeInfo', async () => ({
    home: '/Users/tester',
    chatsRoot: '/Users/tester/.config/ohpichamber/chats',
    canonicalChatsRoot: '/Users/tester/.config/ohpichamber/chats',
    canonicalLegacyChatsRoot: '/Users/tester/.config/opencode/chats',
  }));
  await ensureChatsRootDirectory();
  manager = new ChildStoreManager();
  setSyncRefs(manager, '/repo');
  setActionRefs(manager, () => '/repo');
  resetWorkspaceDirectories();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSessionWorktreeStore.setState({ attachments: new Map() });
  useSessionGoalArmStore.getState().setArmed(false, null);
  useSkillsStore.setState({ skills: [], skillsByDirectory: {} });
  useCommandsStore.setState({ commands: [], commandsByDirectory: {} });
  useProjectsStore.setState({ projects: [], activeProjectId: null });
  useConfigStore.setState({
    isConnected: true, hasEverConnected: true, activateDirectory: async () => { },
    currentProviderId: 'provider-a', currentModelId: 'model-a', currentAgentName: 'build',
    currentVariant: undefined, currentVariantSelection: { override: undefined, inherited: undefined },
  });
  useDirectoryStore.setState({ currentDirectory: '/repo', homeDirectory: '/Users/tester', isHomeReady: true });
  useSessionUIStore.setState({
    currentSessionId: 'session-a', currentSessionDirectory: '/repo', materializedDraftSessionId: null,
    newSessionDraft: { draftId: 1, open: false, directoryOverride: null, parentID: null },
    availableWorktreesByProject: new Map(), availableWorktrees: [], worktreeMetadata: new Map(),
    abortPromptSessionId: null, abortPromptExpiresAt: null, sessionAbortFlags: new Map(), error: null,
  });
  resolvedDirectories = [];
  runCalls = [];
  fakeFileResources();
  stub(hostFilesystem, 'getDirectoryAvailability', async () => 'available');
  stub(canonicalClient, 'resolveWorkspace', async (directory) => {
    resolvedDirectories.push(directory);
    return { workspaceId: `workspace-${resolvedDirectories.length}`, projectId: 'project-a', name: 'Workspace' };
  });
  stub(canonicalClient, 'createRun', async (sessionId, request, commandId) => {
    runCalls.push({ sessionId, request, commandId });
    return runAck(sessionId);
  });
  stub(canonicalClient, 'getSkillsCatalog', async scope => ({
    runtimeStatus: 'ready', persistedSources: { workspace: '1', agent: '1' }, appliedSources: { workspace: '1', agent: '1' },
    catalogRevision: '1', worker: { rootSessionId: scope.rootSessionId, workspaceId: scope.workspaceId, workerGeneration: 'worker-a' },
    agentDirectoryId: 'agent-dir', skills: [{ skillId: 'skill-review', name: 'review', description: '', scope: 'workspace' }],
  }));
  stub(canonicalClient, 'expandSkill', async (scope, input) => ({
    worker: { rootSessionId: scope.rootSessionId, workspaceId: scope.workspaceId, workerGeneration: input.workerGeneration },
    skillId: input.skillId, catalogRevision: input.catalogRevision, message: `Expanded ${input.skillId} ${input.arguments}`.trim(),
  }));
});

afterEach(() => {
  resetSendReconciliationForTests();
  manager.disposeAll();
  setOptimisticRefs(() => { }, () => { }, () => { });
  for (const restore of restorers.splice(0).reverse()) restore();
  globalThis.fetch = originalFetch;
  useSkillsStore.setState(originalSkills);
  useCommandsStore.setState(originalCommands);
  useSessionGoalArmStore.getState().setArmed(false, null);
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  resetWorkspaceDirectories();
  useConfigStore.setState(originalConfig);
  useProjectsStore.setState(originalProjects);
  useDirectoryStore.setState(originalDirectory);
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
});

describe('authoritative worktree routing', () => {
  const attachment = {
    worktreeRoot: '/repo/worktrees/feat-a', cwd: '/repo/worktrees/feat-a/src', branch: 'feat-a',
    headState: 'branch', worktreeStatus: 'ready', worktreeSource: 'existing', legacy: false, degraded: false,
  };
  test('routes a selected session through its valid attached cwd', () => {
    useSessionWorktreeStore.getState().setAttachment('attached', attachment);
    useSessionUIStore.getState().setCurrentSession('attached');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(attachment.cwd);
    expect(useSessionUIStore.getState().getDirectoryForSession('attached')).toBe(attachment.cwd);
  });
  test('uses the worktree root when its attached cwd is degraded', () => {
    useSessionWorktreeStore.getState().setAttachment('attached', { ...attachment, cwd: '/tmp/outside', degraded: true });
    useSessionUIStore.getState().setCurrentSession('attached');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(attachment.worktreeRoot);
  });
  test('keeps a known missing-worktree selection in its native workspace scope', () => {
    const session = hostSession('missing', 'workspace-missing');
    registerWorkspaceDirectory(session.workspaceId, '/repo/.worktrees/gone');
    useGlobalSessionsStore.getState().upsertSession(session);
    const probe = stub(hostFilesystem, 'getDirectoryAvailability', async () => 'missing');
    useSessionUIStore.getState().setCurrentSession(session.sessionId);
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/repo/.worktrees/gone');
    expect(probe).not.toHaveBeenCalled();
    expect(useGlobalSessionsStore.getState().entityById.get(session.sessionId)).toEqual(session);
  });
});


describe('draft materialization transition identity', () => {
  beforeEach(() => {
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      materializedDraftSessionId: null,
      newSessionDraft: { open: true, target: 'project', directoryOverride: '/projects/alpha' },
    });
  });

  test('marks and consumes only the submitted draft session', () => {
    useSessionUIStore.getState().setCurrentSession(
      'session-created',
      '/projects/alpha',
      'submitted-draft',
    );

    expect(useSessionUIStore.getState().materializedDraftSessionId).toBe('session-created');

    useSessionUIStore.getState().clearMaterializedDraftSession('another-session');
    expect(useSessionUIStore.getState().materializedDraftSessionId).toBe('session-created');

    useSessionUIStore.getState().clearMaterializedDraftSession('session-created');
    expect(useSessionUIStore.getState().materializedDraftSessionId).toBeNull();
  });

  test('clears the marker when navigating from a draft to an existing session', () => {
    useSessionUIStore.getState().setCurrentSession(
      'session-created',
      '/projects/alpha',
      'submitted-draft',
    );
    useSessionUIStore.setState({
      newSessionDraft: { open: true, target: 'project', directoryOverride: '/projects/alpha' },
    });
    useSessionUIStore.getState().setCurrentSession('session-existing', '/projects/alpha');

    expect(useSessionUIStore.getState().materializedDraftSessionId).toBeNull();
  });
});

describe('worker-owned slash expansion', () => {
  test('uses worker output verbatim instead of interpreting repeated argument references', async () => {
    const content = 'Run LIN-123 --draft. Verify LIN-123 --draft.\nLiteral $ARGUMENTS remains worker-owned.';
    const requests = fakeFileResources({
      expand: () => Response.json({ kind: 'command', content }),
    });
    await route({ content: '/issue--to-pr LIN-123 --draft' });
    expect(requests[0].body).toEqual({ text: '/issue--to-pr LIN-123 --draft' });
    expect(runCalls[0].request.input.text).toBe(content);
  });

  test.each(['command', 'template'])('keeps a matched %s authoritative even when worker content is unchanged', async kind => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-review', name: 'review', description: '', content: 'Review instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    const content = '/review auth';
    const requests = fakeFileResources({ expand: () => Response.json({ kind, content }) });
    expect(await route({ content })).toBe('command');
    expect(requests).toEqual([{ workspaceId: 'workspace-1', method: 'POST', body: { text: content } }]);
    expect(runCalls[0].request.input).toEqual({ text: content, attachments: [], context: [] });
  });

  test('keeps an unknown invocation when the worker returns it unchanged', async () => {
    const requests = fakeFileResources();
    expect(await route({ content: '/issue--to-pr LIN-123' })).toBe('prompt');
    expect(requests[0].body).toEqual({ text: '/issue--to-pr LIN-123' });
    expect(runCalls[0].request.input.text).toBe('/issue--to-pr LIN-123');
  });

  test('forwards tabs and newlines without interpreting native invocation delimiters', async () => {
    const requests = fakeFileResources();
    for (const content of ['/inspect\tauth', '/inspect\nauth', '/inspect\tauth more']) {
      expect(await route({ content })).toBe('prompt');
    }
    expect(requests.map(request => request.body)).toEqual([
      { text: '/inspect\tauth' }, { text: '/inspect\nauth' }, { text: '/inspect\tauth more' },
    ]);
    expect(runCalls.map(call => call.request.input.text)).toEqual(['/inspect\tauth', '/inspect\nauth', '/inspect\tauth more']);
  });

  test('preserves quoted positional, implicit, newline and trailing arguments for the worker', async () => {
    const requests = fakeFileResources({
      expand: ({ body }) => Response.json({ kind: 'command', content: body.text.startsWith('/move ') ? 'Move src old to dist extra' : 'Review the requested scope.\n\nauth module' }),
    });
    await route({ content: '/move "src old" dist extra' });
    await route({ content: '/review  auth module\n next line  ' });
    expect(requests.filter(request => request.method === 'POST').map(request => request.body)).toEqual([
      { text: '/move "src old" dist extra' },
      { text: '/review  auth module\n next line  ' },
    ]);
    expect(runCalls.map(call => call.request.input.text)).toEqual(['Move src old to dist extra', 'Review the requested scope.\n\nauth module']);
  });

  test('expands a native prompt template and carries its model and agent bindings', async () => {
    const requests = fakeFileResources({
      expand: () => Response.json({ kind: 'template', content: 'Native release notes', modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' }, agentId: 'release-agent' }),
    });
    expect(await route({ content: '/release/notes "v2 beta"\n --draft  ', agent: 'build', variant: 'high', reasoningEffort: 'medium', commandId: 'submit-template' })).toBe('command');
    expect(requests).toEqual([{
      workspaceId: 'workspace-1', method: 'POST', body: { text: '/release/notes "v2 beta"\n --draft  ' },
    }]);
    expect(runCalls).toEqual([{
      sessionId: 'session-a', commandId: 'submit-template',
      request: {
        input: { text: 'Native release notes', attachments: [], context: [] },
        options: { providerId: 'bound-provider', modelId: 'bound-model', agentId: 'release-agent', variant: 'high', reasoningEffort: 'medium' },
      },
    }]);
  });

  test('delivers already expanded queued slash text without re-expanding or changing captured options', async () => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-next', name: 'next', description: '', content: 'New instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    const requests = fakeFileResources({ expand: () => { throw new Error('Queued text must not be expanded twice'); } });
    const sending = route({
      content: '/next', fileResourcesExpanded: true,
      providerID: 'captured-provider', modelID: 'captured-model', agent: 'captured-agent',
      variant: 'high', reasoningEffort: 'medium', commandId: 'queued-submit',
    });
    useConfigStore.setState({ currentProviderId: 'other-provider', currentModelId: 'other-model', currentAgentName: 'other-agent' });
    useSessionUIStore.setState({ currentSessionId: 'session-b', currentSessionDirectory: '/elsewhere' });
    expect(await sending).toBe('prompt');
    expect(requests).toEqual([]);
    expect(runCalls).toEqual([{
      sessionId: 'session-a', commandId: 'queued-submit',
      request: {
        input: { text: '/next', attachments: [], context: [] },
        options: { providerId: 'captured-provider', modelId: 'captured-model', agentId: 'captured-agent', variant: 'high', reasoningEffort: 'medium' },
      },
    }]);
  });

  test('an expanded queued slash skill does not re-expand its skill mention', async () => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-next', name: 'next', description: '', content: 'New instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    fakeFileResources({ expand: () => { throw new Error('Queued text must not be expanded twice'); } });
    const skillSpy = spyOn(canonicalClient, 'expandSkill').mockImplementation(() => { throw new Error('Queued skill must not be re-expanded'); });
    restorers.push(() => skillSpy.mockRestore());
    // Queue-time capture already expanded `/next` and kept the verbatim text;
    // its instruction rides in the captured context. Re-expansion would double it.
    const result = await route({
      content: '/next do the thing', fileResourcesExpanded: true,
      additionalParts: [{ text: 'New instructions', synthetic: false }],
    });
    expect(result).toBe('prompt');
    expect(skillSpy).not.toHaveBeenCalled();
    expect(runCalls).toEqual([{
      // session-actions.sendMessage mints the correlation id per logical send
      // (it is the idempotency key); the exact UUID is opaque to this test.
      sessionId: 'session-a', commandId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
      request: {
        input: { text: '/next do the thing', attachments: [], context: [{ kind: 'instruction', text: 'New instructions' }] },
        options: { providerId: 'provider-a', modelId: 'model-a', agentId: null, variant: null, reasoningEffort: null },
      },
    }]);
  });

  test('awaits command expansion while preserving the submitted session and execution options', async () => {
    const pending = deferred();
    const started = deferred();
    const requests = fakeFileResources({
      expand: () => { started.resolve(); return pending.promise; },
    });
    const sending = route({ content: '/inspect', agent: 'build', variant: 'high', reasoningEffort: 'medium', commandId: 'submit-command' });
    await started.promise;
    expect(runCalls).toEqual([]);
    useSessionUIStore.setState({ currentSessionId: 'session-b', currentSessionDirectory: '/elsewhere' });
    useConfigStore.setState({ currentProviderId: 'other-provider', currentModelId: 'other-model', currentAgentName: 'other-agent' });
    pending.resolve(Response.json({ kind: 'command', content: 'Native inspection', modelSelection: { providerId: 'command-provider', modelId: 'command-model' }, agentId: 'command-agent' }));
    expect(await sending).toBe('command');
    expect(requests[0].body).toEqual({ text: '/inspect' });
    expect(runCalls).toEqual([{
      sessionId: 'session-a', commandId: 'submit-command',
      request: {
        input: { text: 'Native inspection', attachments: [], context: [] },
        options: { providerId: 'command-provider', modelId: 'command-model', agentId: 'command-agent', variant: 'high', reasoningEffort: 'medium' },
      },
    }]);
  });

  test('propagates worker expansion errors without admitting an unexpanded prompt', async () => {
    const problem = {
      type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Worker unavailable', status: 503,
      detail: 'Native file expansion failed', code: 'SERVICE_UNAVAILABLE', retryable: true,
    };
    const requests = fakeFileResources({
      expand: () => Response.json(problem, { status: 503 }),
    });
    await expect(route({ content: '/inspect auth' })).rejects.toMatchObject({ message: problem.detail, problem });
    expect(requests[0].body).toEqual({ text: '/inspect auth' });
    expect(runCalls).toEqual([]);
  });

  test('does not fall back to raw text when a native prompt template expansion fails', async () => {
    const requests = fakeFileResources({
      expand: () => new Response(null, { status: 503 }),
    });
    await expect(route({ content: '/release staging' })).rejects.toMatchObject({
      problem: { code: 'SERVICE_UNAVAILABLE', status: 503, retryable: true },
    });
    expect(requests[0].body).toEqual({ text: '/release staging' });
    expect(runCalls).toEqual([]);
  });

  test('rejects worker output completed after a runtime switch', async () => {
    const pending = deferred();
    const started = deferred();
    fakeFileResources({
      expand: () => { started.resolve(); return pending.promise; },
    });
    const sending = route({ content: '/inspect auth' });
    await started.promise;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other-native' });
    pending.resolve(Response.json({ kind: 'command', content: 'Obsolete worker output' }));
    await expect(sending).rejects.toBeInstanceOf(Error);
    expect(runCalls).toEqual([]);
  });
});

describe('runtime worktree topology', () => {
  test('restores independent in-memory maps across A -> B -> A', () => {
    const topologyA = new Map([['/repo', [{ path: '/repo/a', branch: 'a' }]]]);
    const topologyB = new Map([['/repo', [{ path: '/repo/b', branch: 'b' }]]]);

    useSessionUIStore.setState({ availableWorktreesByProject: topologyA, availableWorktrees: topologyA.get('/repo') });
    useSessionUIStore.getState().prepareForRuntimeSwitch('runtime-a');
    useSessionUIStore.setState({ availableWorktreesByProject: topologyB, availableWorktrees: topologyB.get('/repo') });
    useSessionUIStore.getState().prepareForRuntimeSwitch('runtime-b');

    useSessionUIStore.getState().restoreForRuntimeSwitch('runtime-a');
    expect(useSessionUIStore.getState().availableWorktreesByProject.get('/repo')?.[0]?.path).toBe('/repo/a');

    useSessionUIStore.getState().restoreForRuntimeSwitch('runtime-b');
    expect(useSessionUIStore.getState().availableWorktreesByProject.get('/repo')?.[0]?.path).toBe('/repo/b');
  });
});

describe('working directory across a runtime switch', () => {
  const workOn = (directory) => {
    useDirectoryStore.setState({ currentDirectory: directory, homeDirectory: '/Users/me', isHomeReady: true });
    hostFilesystem.setDirectory(directory);
  };
  const switchRuntime = (from, to) => {
    useSessionUIStore.getState().prepareForRuntimeSwitch(from);
    useSessionUIStore.getState().restoreForRuntimeSwitch(to, from);
  };
  const UNKNOWN = { currentDirectory: '/', homeDirectory: '/', isHomeReady: false };

  test('a directory used on one host is not carried into a host that remembers nothing', () => {
    workOn('/Users/me/switch-a');
    switchRuntime('host:switch-a', 'host:switch-b');

    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);
    expect(hostFilesystem.getDirectory()).toBeUndefined();

    // Leaving the second host before it named its home records nothing for it,
    // and the first host gets its own directory back.
    switchRuntime('host:switch-b', 'host:switch-a');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/Users/me/switch-a');

    switchRuntime('host:switch-a', 'host:switch-b');
    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);
  });

  test('a host whose home lookup failed still keeps and returns its own directory', () => {
    workOn('/home/f/project');
    switchRuntime('host:switch-f', 'host:switch-g');
    switchRuntime('host:switch-g', 'host:switch-f');
    // Back on the first host, which no longer answers: the directory is
    // restored, the home is not known.
    useDirectoryStore.setState({ homeDirectory: '/', isHomeReady: false });
    expect(useDirectoryStore.getState().currentDirectory).toBe('/home/f/project');

    switchRuntime('host:switch-f', 'host:switch-h');
    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);
    expect(hostFilesystem.getDirectory()).toBeUndefined();

    switchRuntime('host:switch-h', 'host:switch-f');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/home/f/project');
  });

  test('a disconnect in between does not carry the directory to the next host', () => {
    workOn('/Users/me/switch-c');
    switchRuntime('host:switch-c', 'mobile-disconnected');
    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);

    switchRuntime('mobile-disconnected', 'host:switch-d');
    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);

    // Reconnecting to the host that was dropped brings its directory back.
    switchRuntime('host:switch-d', 'mobile-disconnected');
    switchRuntime('mobile-disconnected', 'host:switch-c');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/Users/me/switch-c');
  });

  test('the directory this window started with stays for the first host it connects to', () => {
    // A cold launch that connects through a switch: no host was left behind.
    workOn('/Users/me/boot-directory');
    switchRuntime('mobile-disconnected', 'host:switch-e');

    expect(useDirectoryStore.getState()).toMatchObject({ currentDirectory: '/Users/me/boot-directory', isHomeReady: true });
  });

  test('a credential change on the same host leaves the directory alone', () => {
    workOn('/Users/me/same-host');
    switchRuntime('host:switch-i', 'host:switch-i');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/Users/me/same-host');

    useDirectoryStore.setState(UNKNOWN);
    switchRuntime('host:switch-j', 'host:switch-j');
    expect(useDirectoryStore.getState()).toMatchObject(UNKNOWN);
  });
});

// Host directory probe coverage retained for Task 16 boundary extraction.
describe('openNewSessionDraft project binding', () => {
  const projectA = { id: 'proj-a', path: '/projects/alpha', label: 'Alpha' };
  const projectB = { id: 'proj-b', path: '/projects/beta', label: 'Beta' };

  const DRAFT_TARGET_KEY = 'oc.chatInput.lastDraftTarget';

  beforeEach(() => {
    getDeferredSafeStorage().removeItem(DRAFT_TARGET_KEY);
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: { open: false, directoryOverride: null, parentID: null },
      availableWorktreesByProject: new Map(),
    });
    useProjectsStore.setState({
      projects: [projectA, projectB],
      activeProjectId: projectA.id,
    });
    useDirectoryStore.getState().setDirectory(projectB.path, { showOverlay: false });
  });

  afterEach(() => {
    getDeferredSafeStorage().removeItem(DRAFT_TARGET_KEY);
  });

  test('defaults an implicit draft to Chat when active project differs', () => {
    useSessionUIStore.getState().openNewSessionDraft();
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.open).toBe(true);
    expect(draft.target).toBe('chat');
    expect(draft.selectedProjectId).toBeNull();
    expect(draft.directoryOverride).toBeNull();
  });

  test('paints a project default before discovery and does not undo a later manual choice', async () => {
    const original = useConfigStore.getState();
    let finishActivation;
    const activation = new Promise((resolve) => { finishActivation = resolve; });
    useConfigStore.setState({
      activateDirectory: () => activation,
      providers: [], agents: [], settingsDefaultsLoaded: false,
      settingsDefaultModel: 'global/model', isConnected: false,
    });
    useProjectsStore.setState({ projects: [{ ...projectA, defaultModel: 'project/model', defaultVariant: 'high' }, projectB] });
    try {
      useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectA.id });
      expect(useConfigStore.getState().currentProviderId).toBe('project');
      expect(useConfigStore.getState().currentModelId).toBe('model');
      expect(useConfigStore.getState().currentVariant).toBe('high');
      useConfigStore.setState({ currentProviderId: 'manual', currentModelId: 'chosen', selectionSource: 'manual' });
      finishActivation();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useConfigStore.getState().currentProviderId).toBe('manual');
      expect(useConfigStore.getState().currentModelId).toBe('chosen');
    } finally {
      finishActivation();
      useConfigStore.setState(original);
    }
  });

  test('paints the Chats default on a chat draft before discovery, and the project default on a project draft', () => {
    const original = useConfigStore.getState();
    useConfigStore.setState({
      activateDirectory: () => new Promise(() => { }),
      providers: [], agents: [], settingsDefaultsLoaded: false, isConnected: false,
      settingsDefaultModel: 'global/model', settingsDefaultAgent: 'build',
      chatsDefaultModel: 'chat/model', chatsDefaultVariant: 'high', chatsDefaultAgent: 'plan',
    });
    useProjectsStore.setState({ projects: [{ ...projectA, defaultModel: 'project/model' }, projectB] });
    try {
      useSessionUIStore.getState().openNewSessionDraft({ target: 'chat' });
      expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'chat', currentModelId: 'model', currentVariant: 'high', currentAgentName: undefined });
      useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectA.id });
      expect(useConfigStore.getState().currentProviderId).toBe('project');
      useSessionUIStore.getState().openNewSessionDraft({ target: 'chat' });
      expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'chat', currentModelId: 'model' });
    } finally {
      useConfigStore.setState(original);
    }
  });

  test('an old draft activation cannot replace a newer draft default', async () => {
    const original = useConfigStore.getState();
    let finishActivation;
    const activation = new Promise((resolve) => { finishActivation = resolve; });
    useConfigStore.setState({ activateDirectory: () => activation, providers: [], agents: [], isConnected: false });
    useProjectsStore.setState({
      projects: [
        { ...projectA, defaultModel: 'alpha/model' },
        { ...projectB, defaultModel: 'beta/model' },
      ]
    });
    try {
      useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectA.id });
      useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectB.id });
      expect(useConfigStore.getState().currentProviderId).toBe('beta');
      finishActivation();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useConfigStore.getState().currentProviderId).toBe('beta');
    } finally {
      finishActivation();
      useConfigStore.setState(original);
    }
  });

  test('defaults an implicit draft to Chat when current directory is unmatched', () => {
    useDirectoryStore.getState().setDirectory('/external/worktree', { showOverlay: false });

    useSessionUIStore.getState().openNewSessionDraft();
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.open).toBe(true);
    expect(draft.selectedProjectId).toBeNull();
    expect(draft.target).toBe('chat');
    expect(draft.directoryOverride).toBeNull();
  });

  test('respects an explicit Chat target over a recorded project target', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );

    useSessionUIStore.getState().openNewSessionDraft({ target: 'chat' });
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('chat');
    expect(draft.selectedProjectId).toBeNull();
    expect(draft.directoryOverride).toBeNull();
  });

  test('prefers a live directory that matches a project over the recorded project target', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );
    useDirectoryStore.getState().setDirectory(projectB.path, { showOverlay: false });

    useSessionUIStore.getState().openNewSessionDraft();
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBe(projectB.id);
    expect(draft.directoryOverride).toBe(projectB.path);
  });

  test('keeps an unmatched live directory as Chat and leaves the recorded project target untouched', async () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );
    useDirectoryStore.getState().setDirectory('/external/worktree', { showOverlay: false });

    useSessionUIStore.getState().openNewSessionDraft();
    await Bun.sleep(0);

    const draft = useSessionUIStore.getState().newSessionDraft;
    expect(draft.target).toBe('chat');
    expect(draft.selectedProjectId).toBeNull();
    expect(draft.directoryOverride).toBeNull();
    expect(JSON.parse(getDeferredSafeStorage().getItem(DRAFT_TARGET_KEY))).toEqual({
      projectId: projectA.id,
      directory: projectA.path,
      target: 'project',
    });
  });

  test('keeps a Chat draft directory and target after delayed stale-directory recovery', async () => {
    const originalActivateDirectory = useConfigStore.getState().activateDirectory;
    const activatedDirectories = [];
    useDirectoryStore.getState().setDirectory('/external/worktree', { showOverlay: false });
    useConfigStore.setState({
      activateDirectory: async (directory) => {
        activatedDirectories.push(directory ?? null);
      },
    });

    try {
      useSessionUIStore.getState().openNewSessionDraft({ target: 'chat' });
      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'chat',
        selectedProjectId: null,
        directoryOverride: null,
      });

      activatedDirectories.length = 0;
      await Bun.sleep(0);

      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'chat',
        selectedProjectId: null,
        directoryOverride: null,
      });
      expect(JSON.parse(getDeferredSafeStorage().getItem(DRAFT_TARGET_KEY))).toEqual({
        projectId: null,
        directory: null,
        target: 'chat',
      });
      expect(activatedDirectories).toEqual([]);
    } finally {
      useConfigStore.setState({ activateDirectory: originalActivateDirectory });
    }
  });

  test('keeps a Chat draft that replaces a project draft while stale-directory recovery is pending', async () => {
    const originalGetDirectoryAvailability = hostFilesystem.getDirectoryAvailability;
    const originalActivateDirectory = useConfigStore.getState().activateDirectory;
    const availabilityCalls = [];
    const availabilityResolvers = [];
    useConfigStore.setState({ activateDirectory: async () => { } });
    hostFilesystem.getDirectoryAvailability = (directory) => {
      availabilityCalls.push(directory);
      return new Promise((resolve) => {
        availabilityResolvers.push(resolve);
      });
    };

    try {
      useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/external/worktree' });
      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'project',
        directoryOverride: '/external/worktree',
      });
      expect(availabilityCalls).toEqual(['/external/worktree']);

      // The draft flips to Chat while the availability probe is still pending,
      // keeping the live directory recovery is probing. The earlier directory
      // re-checks still match it, so only the post-await target re-check can
      // stop recovery from rewriting this Chat draft as a repaired project.
      const replacedDraft = useSessionUIStore.getState().newSessionDraft;
      useSessionUIStore.setState({
        newSessionDraft: {
          ...replacedDraft,
          draftId: replacedDraft.draftId + 1,
          target: 'chat',
          selectedProjectId: CHAT_DRAFT_PROJECT_ID,
        },
      });
      const persistedTargetBeforeResolution = getDeferredSafeStorage().getItem(DRAFT_TARGET_KEY);

      availabilityResolvers[0]('missing');
      await Bun.sleep(0);

      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'chat',
        selectedProjectId: CHAT_DRAFT_PROJECT_ID,
        directoryOverride: '/external/worktree',
      });
      expect(getDeferredSafeStorage().getItem(DRAFT_TARGET_KEY)).toBe(persistedTargetBeforeResolution);
    } finally {
      hostFilesystem.getDirectoryAvailability = originalGetDirectoryAvailability;
      useConfigStore.setState({ activateDirectory: originalActivateDirectory });
    }
  });

  test('restores the recorded project target when no live directory is set', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );
    useDirectoryStore.setState({ currentDirectory: '' });

    useSessionUIStore.getState().openNewSessionDraft();
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBe(projectA.id);
    expect(draft.directoryOverride).toBe(projectA.path);
  });

  test('repairs a stale persisted project directory through recovery', async () => {
    const originalGetDirectoryAvailability = hostFilesystem.getDirectoryAvailability;
    const originalActivateDirectory = useConfigStore.getState().activateDirectory;
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: '/deleted/worktree', target: 'project' }),
    );
    useDirectoryStore.setState({ currentDirectory: '' });
    useConfigStore.setState({ activateDirectory: async () => { } });
    hostFilesystem.getDirectoryAvailability = async () => 'missing';

    try {
      useSessionUIStore.getState().openNewSessionDraft();
      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'project',
        selectedProjectId: projectA.id,
        directoryOverride: '/deleted/worktree',
      });

      await Bun.sleep(0);

      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'project',
        selectedProjectId: projectA.id,
        directoryOverride: projectA.path,
      });
    } finally {
      hostFilesystem.getDirectoryAvailability = originalGetDirectoryAvailability;
      useConfigStore.setState({ activateDirectory: originalActivateDirectory });
    }
  });

  test('keeps an unmatched live directory when it differs from the recorded project target', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );
    useDirectoryStore.getState().setDirectory('/external/worktree', { showOverlay: false });

    useSessionUIStore.getState().openNewSessionDraft({ automatic: true });
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBeNull();
    expect(draft.directoryOverride).toBe('/external/worktree');
  });

  test('preserves the recorded project for an undiscovered worktree across consecutive cold draft opens', () => {
    const worktree = '/external/linked-worktree';
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: worktree, target: 'project' }),
    );
    useDirectoryStore.setState({ currentDirectory: worktree });

    for (let launch = 0; launch < 2; launch += 1) {
      useSessionUIStore.setState({ availableWorktreesByProject: new Map() });
      useSessionUIStore.getState().openNewSessionDraft({ automatic: true });
      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({
        target: 'project',
        selectedProjectId: projectA.id,
        directoryOverride: worktree,
      });
      useSessionUIStore.getState().closeNewSessionDraft();
    }
  });

  test('respects explicit directoryOverride over active project', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );

    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/projects/beta/src' });
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.open).toBe(true);
    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBe(projectB.id);
    expect(draft.directoryOverride).toBe('/projects/beta/src');
  });

  test('respects explicit selectedProjectId over active project', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectA.id, directory: projectA.path, target: 'project' }),
    );

    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectB.id });
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.open).toBe(true);
    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBe(projectB.id);
    expect(draft.directoryOverride).toBe(projectB.path);
  });

  test('reopens an implicit draft on the project the target selector was last set to', () => {
    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectB.id });
    useSessionUIStore.getState().closeNewSessionDraft();
    // A chat session leaves its managed scratch directory current; the project
    // to reopen on can only come from the recorded target.
    useDirectoryStore.getState().setDirectory(
      '/Users/tester/.config/ohpichamber/chats/ses_chat',
      { showOverlay: false },
    );

    useSessionUIStore.getState().openNewSessionDraft();
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('project');
    expect(draft.selectedProjectId).toBe(projectB.id);
    expect(draft.directoryOverride).toBe(projectB.path);
  });

  test('setNewSessionDraftTarget records Chat, so the next implicit draft opens on Chat', () => {
    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: projectB.id });
    useSessionUIStore.getState().setNewSessionDraftTarget({ projectId: CHAT_DRAFT_PROJECT_ID });
    useSessionUIStore.getState().closeNewSessionDraft();

    useSessionUIStore.getState().openNewSessionDraft();

    expect(useSessionUIStore.getState().newSessionDraft.target).toBe('chat');
  });

  test('keeps the Chat default for a record written before the target was stored', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectB.id, directory: projectB.path }),
    );

    useSessionUIStore.getState().openNewSessionDraft();

    expect(useSessionUIStore.getState().newSessionDraft.target).toBe('chat');
  });

  test('a chat scratch directory forwarded as override opens a chat draft', () => {
    // "New session in the current directory" callers forward the current
    // session's directory even when that session is a chat; its scratch
    // directory names no project.
    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: '/Users/tester/.config/ohpichamber/chats/ses_chat',
    });
    const draft = useSessionUIStore.getState().newSessionDraft;

    expect(draft.target).toBe('chat');
    expect(draft.directoryOverride).toBeNull();
  });

  test('a chat scratch override opens Chat even when the recorded target is a project', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: projectB.id, directory: projectB.path, target: 'project' }),
    );

    useSessionUIStore.getState().openNewSessionDraft({
      directoryOverride: '/Users/tester/.config/ohpichamber/chats/ses_chat',
    });

    expect(useSessionUIStore.getState().newSessionDraft.target).toBe('chat');
  });

  test('falls back to Chat when the last project target no longer exists', () => {
    getDeferredSafeStorage().setItem(
      DRAFT_TARGET_KEY,
      JSON.stringify({ projectId: 'proj-removed', directory: '/projects/removed', target: 'project' }),
    );

    useSessionUIStore.getState().openNewSessionDraft();

    expect(useSessionUIStore.getState().newSessionDraft.target).toBe('chat');
  });
});

describe('createSession draft lifecycle', () => {
  let originalCreateSession;
  let originalGetDirectoryAvailability;
  let originalProjects;
  let originalActiveProjectId;
  let originalDirectoryState;
  let originalClientDirectory;
  let originalLastDirectory;

  beforeEach(() => {
    originalCreateSession = canonicalClient.createSession;
    originalGetDirectoryAvailability = hostFilesystem.getDirectoryAvailability;
    originalProjects = useProjectsStore.getState().projects;
    originalActiveProjectId = useProjectsStore.getState().activeProjectId;
    originalDirectoryState = useDirectoryStore.getState();
    originalClientDirectory = hostFilesystem.getDirectory();
    originalLastDirectory = getDeferredSafeStorage().getItem('lastDirectory');
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: { open: true, directoryOverride: '/projects/alpha', parentID: null, title: 'Draft title' },
    });
  });

  afterEach(() => {
    canonicalClient.createSession = originalCreateSession;
    hostFilesystem.getDirectoryAvailability = originalGetDirectoryAvailability;
    useProjectsStore.setState({ projects: originalProjects, activeProjectId: originalActiveProjectId });
    useDirectoryStore.setState(originalDirectoryState, true);
    hostFilesystem.setDirectory(originalClientDirectory ?? undefined);
    if (originalLastDirectory === null) {
      getDeferredSafeStorage().removeItem('lastDirectory');
    } else {
      getDeferredSafeStorage().setItem('lastDirectory', originalLastDirectory);
    }
  });

  test('keeps the draft open when session creation fails', async () => {
    canonicalClient.createSession = async () => {
      throw new Error('offline');
    };

    const session = await useSessionUIStore.getState().createSession('Draft title', '/projects/alpha');

    expect(session).toBeNull();
    expect(useSessionUIStore.getState().newSessionDraft.open).toBe(true);
    expect(useSessionUIStore.getState().newSessionDraft.title).toBe('Draft title');
  });

  test('rewrites an implicit new-chat draft to the active project before the session is created', async () => {
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useDirectoryStore.getState().setDirectory('/private/deleted-worktree', { showOverlay: false });
    hostFilesystem.getDirectoryAvailability = async () => 'missing';

    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/deleted-worktree' });
    await Bun.sleep(0);

    expect(useSessionUIStore.getState().newSessionDraft.directoryOverride).toBe('/projects/main');
    expect(useSessionUIStore.getState().newSessionDraft.selectedProjectId).toBe('project-main');
    expect(getDeferredSafeStorage().getItem('lastDirectory')).toBe('/private/deleted-worktree');
  });

  test('falls back to the current active project when a regular new-chat directory is missing', async () => {
    const createSessionCalls = [];
    useProjectsStore.setState({
      projects: [
        { id: 'project-draft', path: '/projects/draft', label: 'Draft' },
        { id: 'project-active', path: '/projects/active', label: 'Active' },
      ],
      activeProjectId: 'project-active',
    });
    useDirectoryStore.getState().setDirectory('/private/deleted-worktree', { showOverlay: false });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/deleted-worktree' });
    hostFilesystem.getDirectoryAvailability = async () => 'missing';
    canonicalClient.createSession = async (request) => {
      createSessionCalls.push(resolvedDirectories.at(-1));
      return { session: hostSession('session-fallback', request.workspaceId) };
    };

    await useSessionUIStore.getState().createSession('Draft title', '/private/deleted-worktree');

    expect(createSessionCalls).toEqual(['/projects/active']);
    expect(useDirectoryStore.getState().currentDirectory).toBe('/projects/active');
    expect(getDeferredSafeStorage().getItem('lastDirectory')).toBe('/projects/active');
  });

  test('keeps an explicitly pinned worktree directory unchanged', async () => {
    const createSessionCalls = [];
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/deleted-worktree', preserveDirectoryOverride: true });
    expect(useSessionUIStore.getState().newSessionDraft.preserveDirectoryOverride).toBe(true);
    hostFilesystem.getDirectoryAvailability = async () => 'missing';
    canonicalClient.createSession = async (request) => {
      createSessionCalls.push(resolvedDirectories.at(-1));
      return { session: hostSession('session-pinned', request.workspaceId) };
    };

    await useSessionUIStore.getState().createSession('Draft title', '/private/deleted-worktree');

    expect(createSessionCalls).toEqual(['/private/deleted-worktree']);
  });

  test('keeps a ChatInput-style current-directory draft recoverable when that path is missing', async () => {
    const createSessionCalls = [];
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useDirectoryStore.getState().setDirectory('/private/deleted-worktree', { showOverlay: false });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/deleted-worktree' });
    expect(useSessionUIStore.getState().newSessionDraft.preserveDirectoryOverride).not.toBe(true);
    hostFilesystem.getDirectoryAvailability = async () => 'missing';
    canonicalClient.createSession = async (request) => {
      createSessionCalls.push(resolvedDirectories.at(-1));
      return { session: hostSession('session-chat-input', request.workspaceId) };
    };

    await useSessionUIStore.getState().createSession('Draft title', '/private/deleted-worktree');

    expect(createSessionCalls).toEqual(['/projects/main']);
  });

  test('keeps the stale directory when its availability cannot be confirmed', async () => {
    const createSessionCalls = [];
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useDirectoryStore.getState().setDirectory('/private/unavailable-worktree', { showOverlay: false });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/unavailable-worktree' });
    hostFilesystem.getDirectoryAvailability = async () => 'unknown';
    canonicalClient.createSession = async (request) => {
      createSessionCalls.push(resolvedDirectories.at(-1));
      return { session: hostSession('session-unavailable', request.workspaceId) };
    };

    await useSessionUIStore.getState().createSession('Draft title', '/private/unavailable-worktree');

    expect(createSessionCalls).toEqual(['/private/unavailable-worktree']);
    expect(useDirectoryStore.getState().currentDirectory).toBe('/private/unavailable-worktree');
  });

  test('still creates against the active project when the draft is rewritten during the create probe', async () => {
    const createSessionCalls = [];
    const availabilityResolvers = [];
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useDirectoryStore.getState().setDirectory('/private/deleted-worktree', { showOverlay: false });
    hostFilesystem.getDirectoryAvailability = () => new Promise((resolve) => {
      availabilityResolvers.push(resolve);
    });
    canonicalClient.createSession = async (request) => {
      createSessionCalls.push(resolvedDirectories.at(-1));
      return { session: hostSession('session-race', request.workspaceId) };
    };

    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/private/deleted-worktree' });
    const createPromise = useSessionUIStore.getState().createSession('Draft title', '/private/deleted-worktree');
    expect(availabilityResolvers.length).toBe(2);

    availabilityResolvers[0]('missing');
    await Bun.sleep(0);
    expect(useSessionUIStore.getState().newSessionDraft.directoryOverride).toBe('/projects/main');

    availabilityResolvers[1]('missing');
    const session = await createPromise;

    expect(session).not.toBeNull();
    expect(createSessionCalls).toEqual(['/projects/main']);
  });

  test('does not persist a fallback when session creation fails', async () => {
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    useDirectoryStore.getState().setDirectory('/private/deleted-worktree', { showOverlay: false });
    useSessionUIStore.getState().openNewSessionDraft();
    hostFilesystem.getDirectoryAvailability = async () => 'missing';
    canonicalClient.createSession = async () => {
      throw new Error('offline');
    };

    const session = await useSessionUIStore.getState().createSession('Draft title', '/private/deleted-worktree');

    expect(session).toBeNull();
    expect(useDirectoryStore.getState().currentDirectory).toBe('/private/deleted-worktree');
    expect(getDeferredSafeStorage().getItem('lastDirectory')).toBe('/private/deleted-worktree');
  });
});


describe('native prompt routing', () => {
  test('sends captured execution options as a canonical PromptRequest', async () => {
    await route({ agent: 'build', variant: 'high', reasoningEffort: 'medium', agentMentionName: 'reviewer', commandId: 'submit-a' });
    expect(runCalls).toEqual([{
      sessionId: 'session-a', commandId: 'submit-a',
      request: {
        input: { text: 'hello', attachments: [], context: [], agentMention: { agentId: 'reviewer' } },
        options: { providerId: 'provider-a', modelId: 'model-a', agentId: 'build', variant: 'high', reasoningEffort: 'medium' },
      },
    }]);
  });
  test('keeps concurrent sends attached to their session identities', async () => {
    await Promise.all([
      route({ sessionId: 'session-a', directory: '/alpha', content: 'alpha' }),
      route({ sessionId: 'session-b', directory: '/beta', content: 'beta' }),
    ]);
    expect(runCalls.map(({ sessionId, request }) => [sessionId, request.input.text])).toEqual([
      ['session-a', 'alpha'], ['session-b', 'beta'],
    ]);
  });
  test('starts a native foreground shell rather than admitting a prompt', async () => {
    const shell = stub(canonicalClient, 'startShell', async (sessionId, request) => ({
      jobId: 'job-a', sessionId, workspaceId: 'workspace-a', projectId: 'project-a', epoch: 'epoch-a',
      workerGeneration: 'worker-a', ...request, startedAt: 1, outputCursor: '0', status: 'running',
    }));
    expect(await route({ inputMode: 'shell', content: 'pwd', commandId: 'shell-submit' })).toBe('shell');
    expect(shell).toHaveBeenCalledWith('session-a', { command: 'pwd', background: false }, 'shell-submit');
    expect(runCalls).toEqual([]);
  });
  test('uses native steering and follow-up without starting another run', async () => {
    const steering = stub(canonicalClient, 'steer', async (sessionId) => ({ sessionId, runId: 'run-a', acceptedAt: 1 }));
    const followUp = stub(canonicalClient, 'followUp', async (sessionId) => ({ sessionId, followUpId: 'follow-up-a', acceptedAt: 1 }));
    await route({ delivery: 'steer', commandId: 'steer-submit' });
    await route({ delivery: 'follow-up', commandId: 'follow-up-submit' });
    expect(steering.mock.calls[0][0]).toBe('session-a');
    expect(steering.mock.calls[0][2]).toBe('steer-submit');
    expect(followUp.mock.calls[0][0]).toBe('session-a');
    expect(followUp.mock.calls[0][2]).toBe('follow-up-submit');
    expect(runCalls).toEqual([]);
  });
  test('resolves commands from the addressed workspace rather than a stale directory cache', async () => {
    useCommandsStore.setState({
      commandsByDirectory: {
        '/repo': [{ commandId: 'root-inspect', name: 'inspect', description: '', content: 'Stale root $ARGUMENTS', scope: 'workspace', source: 'workspace', editable: true }],
        '/repo/worktree': [{ commandId: 'worktree-inspect', name: 'inspect', description: '', content: 'Stale worktree $ARGUMENTS', scope: 'workspace', source: 'workspace', editable: true }],
      }
    });
    const requests = fakeFileResources({
      expand: () => Response.json({ kind: 'command', content: 'Worktree auth' }),
    });
    expect(await route({ directory: '/repo/worktree', content: '/inspect auth' })).toBe('command');
    expect(resolvedDirectories).toEqual(['/repo/worktree']);
    expect(requests[0]).toEqual({ workspaceId: 'workspace-1', method: 'POST', body: { text: '/inspect auth' } });
    expect(runCalls[0].request.input.text).toBe('Worktree auth');
  });
  test('keeps worker-expanded text authoritative over a same-name skill', async () => {
    const requests = fakeFileResources({
      expand: () => Response.json({ kind: 'command', content: 'Review auth' }),
    });
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-inspect', name: 'inspect', description: '', content: 'Inspect instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    expect(await route({ content: '/inspect auth' })).toBe('command');
    expect(requests).toHaveLength(1);
    expect(runCalls[0].request.input.text).toBe('Review auth');
    expect(runCalls[0].request.input.context).toEqual([]);
  });
  test('expands a cached skill through the canonical catalog with arguments', async () => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-review', name: 'review', description: '', content: 'Review instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    expect(await route({ content: '/review auth', skills: { names: [] } })).toBe('prompt');
    expect(runCalls[0].request.input).toMatchObject({
      text: '/review auth', context: [{ kind: 'instruction', text: 'Expanded skill-review auth' }],
    });
  });
  test('deduplicates inline canonical skill names', async () => {
    seedCanonicalSession();
    const expansion = stub(canonicalClient, 'expandSkill', async (scope, input) => ({
      worker: { rootSessionId: scope.rootSessionId, workspaceId: scope.workspaceId, workerGeneration: input.workerGeneration },
      skillId: input.skillId, catalogRevision: input.catalogRevision, message: 'Expanded once',
    }));
    await route({ content: '$review', skills: { names: ['review', 'review'] } });
    expect(expansion).toHaveBeenCalledTimes(1);
    expect(runCalls[0].request.input.context).toEqual([{ kind: 'instruction', text: 'Expanded once' }]);
  });
  test('does not dispatch when canonical skill expansion fails', async () => {
    seedCanonicalSession();
    const failure = new Error('catalog conflict');
    stub(canonicalClient, 'getSkillsCatalog', async () => { throw failure; });
    await expect(route({ content: '$review', skills: { names: ['review'] } })).rejects.toBe(failure);
    expect(runCalls).toEqual([]);
  });
  test('a binary file and an over-5 MB text file both reach the canonical attachment payload', async () => {
    seedCanonicalSession();
    // Both are now attachable; the old content-type and per-file size refusals
    // are gone and the worker decides inline vs `read` handoff instead.
    const binaryBytes = new Uint8Array([0, 1, 2, 255]);
    const oversizedText = new Uint8Array(6 * 1024 * 1024).fill(0x61);
    const attachments = [
      {
        id: 'binary', file: new File([binaryBytes], 'archive.bin', { type: 'application/octet-stream' }),
        dataUrl: 'data:application/octet-stream;base64,AAEC/w==', mimeType: 'application/octet-stream',
        filename: 'archive.bin', size: binaryBytes.length, source: 'local',
      },
      {
        id: 'oversized', file: new File([oversizedText], 'huge.txt', { type: 'text/plain' }),
        dataUrl: 'data:text/plain;base64,', mimeType: 'text/plain',
        filename: 'huge.txt', size: oversizedText.length, source: 'local',
      },
    ];
    const uploaded = [];
    stub(canonicalClient, 'uploadAttachment', async (workspaceId, metadata) => {
      uploaded.push({ workspaceId, metadata });
      return { ...metadata, attachmentId: `att-${metadata.name}`, uri: `attachment://att-${metadata.name}`, createdAt: 1 };
    });
    await useSessionUIStore.getState().sendMessage(
      'Inspect these files', 'provider-a', 'model-a', 'build', attachments,
    );
    expect(uploaded.map(entry => entry.metadata)).toEqual([
      { name: 'archive.bin', mediaType: 'application/octet-stream', size: binaryBytes.length },
      { name: 'huge.txt', mediaType: 'text/plain', size: oversizedText.length },
    ]);
    // The canonical prompt carries opaque attachment identities only: no local
    // or Host absolute path may appear in any field.
    expect(runCalls[0].request.input.attachments).toEqual([
      { attachmentId: 'att-archive.bin', name: 'archive.bin', mediaType: 'application/octet-stream', size: binaryBytes.length, uri: 'attachment://att-archive.bin' },
      { attachmentId: 'att-huge.txt', name: 'huge.txt', mediaType: 'text/plain', size: oversizedText.length, uri: 'attachment://att-huge.txt' },
    ]);
    expect(JSON.stringify(runCalls[0].request)).not.toContain('data:');
    expect(JSON.stringify(runCalls[0].request)).not.toContain('/repo');
  });

  test('keeps attachments, quoted context and synthetic instructions on command prompts', async () => {
    seedCanonicalSession();
    fakeFileResources({ expand: () => Response.json({ kind: 'command', content: 'Inspect auth' }) });
    const primary = { attachmentId: 'image-a', uri: 'attachment://image-a', name: 'image.png', mediaType: 'image/png', size: 12 };
    const quoted = { attachmentId: 'quote-a', uri: 'attachment://quote-a', name: 'source.txt', mediaType: 'text/plain', size: 5 };
    const metadata = { openchamberContext: { kind: 'file-quote', fileLabel: 'source.txt', quote: 'Selected code', text: 'Review this selection' } };
    await route({
      content: '/inspect auth', files: [primary],
      additionalParts: [
        { text: 'Selected code', metadata, files: [quoted] },
        { text: 'Be concise', synthetic: true }, { text: '   ' },
      ],
      skills: { names: ['review'] },
    });
    expect(runCalls[0].request.input).toEqual({
      text: 'Inspect auth', attachments: [primary, quoted], context: [
        { kind: 'context', text: 'Selected code', metadata },
        { kind: 'synthetic', text: 'Be concise' }, { kind: 'instruction', text: 'Expanded skill-review' },
      ],
    });
  });
  test('preserves direct and queued composer session mentions in canonical prompt context', async () => {
    seedCanonicalSession();
    const mention = { kind: 'session', sessionId: 'target', title: 'Target', contextText: 'Read target' };
    const input = { inlineComments: [], syntheticTexts: [], references: [mention] };
    const deps = { parseAgentMention: (text) => ({ text }), extractFileMentions: (text) => ({ text, attachments: [] }), sanitizeAttachments: (files) => files ?? [], collectSkillNames: () => [] };
    const direct = buildOutgoingMessage({ ...input, queued: [], composerText: 'ohpichamber://session/target', composerAttachments: [] }, deps);
    const queued = queuedContextToParts(buildComposerContext(input, null));
    for (const additionalParts of [direct.additionalParts, queued]) {
      await route({ additionalParts });
      expect(runCalls.at(-1).request.input.context).toContainEqual({ kind: 'context', text: 'Read target', metadata: { openchamberContext: expect.objectContaining({ kind: 'session', sessionId: 'target', title: 'Target' }) } });
    }
  });
  test('rejects a captured stale runtime before dispatch', async () => {
    await expect(route({ runtimeKey: 'different-runtime' })).rejects.toBeInstanceOf(Error);
    expect(runCalls).toEqual([]);
  });
  test('does not issue skill expansion after A-B-A during catalog lookup', async () => {
    seedCanonicalSession();
    const key = getRuntimeKey(); const base = getRuntimeApiBaseUrl(); const catalog = deferred();
    const read = stub(canonicalClient, 'getSkillsCatalog', () => catalog.promise);
    const expand = stub(canonicalClient, 'expandSkill', async () => { throw new Error('must not expand'); });
    const sending = route({ skills: { names: ['review'] } });
    await Promise.resolve(); await Promise.resolve();
    expect(read).toHaveBeenCalled();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other-native' });
    switchRuntimeEndpoint({ apiBaseUrl: base, runtimeKey: key });
    catalog.resolve({ skills: [{ skillId: 'review', name: 'review' }], worker: { workerGeneration: 'generation' }, catalogRevision: '1' });
    await expect(sending).rejects.toThrow('runtime changed');
    expect(expand).not.toHaveBeenCalled(); expect(runCalls).toEqual([]);
  });
  test('rejects a run acknowledgement for another session', async () => {
    canonicalClient.createRun = async () => runAck('foreign-session');
    await expect(route()).rejects.toBeInstanceOf(Error);
  });
});

describe('native UI submit lifecycle', () => {
  test('uses the target captured before active selection changes', async () => {
    await send('captured', { target: { runtimeKey: getRuntimeKey(), sessionId: 'captured-session', directory: '/alpha' } });
    expect(runCalls[0].sessionId).toBe('captured-session');
    expect(runCalls[0].request.input.text).toBe('captured');
    expect(useSessionUIStore.getState().currentSessionId).toBe('session-a');
  });
  test('keeps draft admission and prompt selection captured across a project switch', async () => {
    useProjectsStore.setState({
      projects: [
        { id: 'project-alpha', path: '/alpha', label: 'Alpha' },
        { id: 'project-beta', path: '/beta', label: 'Beta' },
      ], activeProjectId: 'project-alpha'
    });
    useSessionUIStore.setState({
      currentSessionId: null, currentSessionDirectory: null,
      newSessionDraft: { draftId: 42, open: true, target: 'project', selectedProjectId: 'project-alpha', directoryOverride: '/alpha', preserveDirectoryOverride: true },
    });
    const admission = deferred();
    const started = deferred();
    let captured;
    stub(canonicalClient, 'createSession', async request => { captured = request; started.resolve(); return admission.promise; });
    const sending = send('draft message', { reasoningEffort: 'medium' }, 'high');
    await started.promise;
    useProjectsStore.setState({ activeProjectId: 'project-beta' });
    useSessionUIStore.setState({
      currentSessionId: 'existing-beta', currentSessionDirectory: '/beta',
      newSessionDraft: { draftId: 43, open: false, directoryOverride: null },
    });
    admission.resolve({ session: hostSession('materialized-alpha', captured.workspaceId) });
    await sending;
    expect(resolvedDirectories).toEqual(['/alpha']);
    expect(captured.options).toEqual({ providerId: 'provider-a', modelId: 'model-a', agentId: 'build', variant: 'high', reasoningEffort: 'medium' });
    expect(runCalls[0].sessionId).toBe('materialized-alpha');
    expect(runCalls[0].request.options).toEqual(captured.options);
    expect(useSessionUIStore.getState().currentSessionId).toBe('existing-beta');
  });
  test('records a root chat effort under the root key and keeps explicit off', async () => {
    await send('root effort', { reasoningEffort: 'high' }, undefined, null);
    expect(useSelectionStore.getState().getAgentModelReasoningEffortForSession(
      'session-a', ROOT_SELECTION_AGENT, 'provider-a', 'model-a',
    )).toBe('high');
    await send('root off', { reasoningEffort: 'off' }, undefined, null);
    expect(useSelectionStore.getState().getAgentModelReasoningEffortForSession(
      'session-a', ROOT_SELECTION_AGENT, 'provider-a', 'model-a',
    )).toBe('off');
  });
  test('a verbatim null agent reaches the wire as agentId null even when a current agent is configured', async () => {
    useSelectionStore.getState().saveSessionAgentSelection('session-a', 'scout');
    await send('send-now root', {}, undefined, null);
    expect(runCalls[0].request.options.agentId).toBeNull();
    expect('agentId' in runCalls[0].request.options).toBe(true);
  });
  test('an undefined agent still inherits the session agent selection', async () => {
    useSelectionStore.getState().saveSessionAgentSelection('session-a', 'scout');
    await useSessionUIStore.getState().sendMessage('inherited', 'provider-a', 'model-a', undefined);
    expect(runCalls[0].request.options.agentId).toBe('scout');
  });
  test('a failed draft admission preserves the draft and never dispatches a prompt', async () => {
    const draft = { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true };
    useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: draft });
    stub(canonicalClient, 'createSession', async () => { throw new Error('offline'); });
    await expect(send()).rejects.toBeInstanceOf(Error);
    expect(useSessionUIStore.getState().newSessionDraft).toEqual(draft);
    expect(runCalls).toEqual([]);
  });
  test('an adopted ambiguous draft send does not restore the draft shell', async () => {
    setOptimisticRefs(() => { }, () => { }, () => { });
    const draft = { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true };
    useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: draft });
    stub(canonicalClient, 'createSession', async () => ({ session: hostSession('materialized-chat-session', 'workspace-a') }));
    const dispatch = deferred();
    const dispatched = deferred();
    stub(canonicalClient, 'createRun', async () => { dispatched.resolve(); return dispatch.promise; });
    stub(canonicalClient, 'getPromptReceipt', async (queriedSession, queriedCorrelation) => ({
      status: 'unknown', correlationId: queriedCorrelation, sessionId: queriedSession,
    }));

    const sending = send('uncertain draft prompt');
    await dispatched.promise;

    // The session materialized and the draft shell closed; the user then
    // navigates back to a fresh no-selection view before the answer is lost.
    expect(useSessionUIStore.getState().currentSessionId).toBe('materialized-chat-session');
    useSessionUIStore.setState({ currentSessionId: null });

    dispatch.reject(new TypeError('Failed to fetch'));
    await expect(sending).rejects.toBeInstanceOf(AmbiguousSendAdoptedError);

    // The materialized session and its adopted echo are the visible truth:
    // the closed draft shell must not come back.
    expect(useSessionUIStore.getState().newSessionDraft.open).toBe(false);
  });

  test('a new chat renders the user bubble before POST /sessions resolves', async () => {
    const optimisticMessages = new Map();
    setOptimisticRefs(
      (input) => {
        const list = optimisticMessages.get(input.sessionId) ?? [];
        list.push(input.message);
        optimisticMessages.set(input.sessionId, list);
      },
      (input) => {
        const list = optimisticMessages.get(input.sessionId) ?? [];
        optimisticMessages.set(input.sessionId, list.filter(m => m.messageId !== input.messageId));
      },
    );

    const draft = { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true };
    useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: draft });

    const admission = deferred();
    const started = deferred();
    let captured;
    stub(canonicalClient, 'createSession', async request => {
      captured = request;
      started.resolve();
      return admission.promise;
    });

    const sending = send('optimistic echo prompt');
    await started.promise;

    // Verify: Before POST /sessions resolves, the temporary user bubble is already rendered
    const temporarySessionId = useSessionUIStore.getState().currentSessionId;
    expect(temporarySessionId).toBe('draft_42');
    const pendingEcho = optimisticMessages.get('draft_42');
    expect(pendingEcho).toHaveLength(1);
    expect(pendingEcho[0].parts[0].content).toBe('optimistic echo prompt');

    // Settle session creation (POST /sessions resolves)
    admission.resolve({ session: hostSession('materialized-chat-session', captured.workspaceId) });
    await sending;

    // Verify: The optimistic bubble is carried over to the created session
    expect(useSessionUIStore.getState().currentSessionId).toBe('materialized-chat-session');
    const carried = optimisticMessages.get('materialized-chat-session');
    expect(carried).toHaveLength(1);
    expect(carried[0].parts[0].content).toBe('optimistic echo prompt');
  });

  test('a failed draft send does not override navigation that happened later', async () => {
    const draft = { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true };
    useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: draft });

    const admission = deferred();
    const started = deferred();
    stub(canonicalClient, 'createSession', async () => {
      started.resolve();
      return admission.promise;
    });

    const sending = send('will fail');
    await started.promise;

    // While POST /sessions is in flight, the user navigates to another session and opens a newer draft
    useSessionUIStore.setState({
      currentSessionId: 'newer-selected-session',
      currentSessionDirectory: '/beta',
      newSessionDraft: { draftId: 99, open: false, directoryOverride: '/beta' },
    });

    // Now creation fails
    admission.reject(new Error('offline failure'));
    await expect(sending).rejects.toBeInstanceOf(Error);

    // Verify: The newer navigation is NOT overridden by the failed send of draft 42
    expect(useSessionUIStore.getState().currentSessionId).toBe('newer-selected-session');
    expect(useSessionUIStore.getState().newSessionDraft.draftId).toBe(99);
  });
  test('a draft creation completed on an obsolete runtime never admits its prompt', async () => {
    const admission = deferred();
    const started = deferred();
    let captured;
    useSessionUIStore.setState({
      currentSessionId: null,
      newSessionDraft: { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true },
    });
    stub(canonicalClient, 'createSession', async request => { captured = request; started.resolve(); return admission.promise; });
    const sending = send();
    await started.promise;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://new-host.test', runtimeKey: 'new-host' });
    useSessionUIStore.setState({ currentSessionId: 'new-host-session', currentSessionDirectory: '/new-host' });
    admission.resolve({ session: hostSession('obsolete-created', captured.workspaceId) });
    await expect(sending).rejects.toBeInstanceOf(Error);
    expect(runCalls).toEqual([]);
    expect(useSessionUIStore.getState().currentSessionId).toBe('new-host-session');
    expect(useGlobalSessionsStore.getState().entityById.has('obsolete-created')).toBe(false);
  });
  test('a stale captured target cannot delete or archive sessions', async () => {
    const remove = stub(canonicalClient, 'deleteSession', async sessionId => ({ sessionId, deletedSessionIds: [sessionId] }));
    const archive = stub(canonicalClient, 'archiveSessions', async () => ({ archived: [], failedIds: [] }));
    const restore = stub(canonicalClient, 'unarchiveSessions', async () => ({ restored: [], failedIds: [] }));
    const options = { expectedRuntimeKey: 'different-runtime' };
    expect(await useSessionUIStore.getState().deleteSession('session-x', options)).toBe(false);
    expect(await useSessionUIStore.getState().deleteSessions(['session-x', 'session-y'], options)).toEqual({ deletedIds: [], failedIds: ['session-x', 'session-y'] });
    expect(await useSessionUIStore.getState().archiveSessions(['session-x', 'session-y'], options)).toEqual({ archivedIds: [], failedIds: ['session-x', 'session-y'] });
    expect(await useSessionUIStore.getState().unarchiveSessions(['session-x', 'session-y'], options)).toEqual({ restoredIds: [], failedIds: ['session-x', 'session-y'] });
    expect(remove).not.toHaveBeenCalled();
    expect(archive).not.toHaveBeenCalled();
    expect(restore).not.toHaveBeenCalled();
  });
});

describe('submit-time effort recording', () => {
  const readRecord = () => useSelectionStore.getState().getAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a');
  afterEach(() => useSelectionStore.getState().saveAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a', undefined));
  test('keeps an explicit Default instead of replacing it with inherited effort', async () => {
    useSelectionStore.getState().saveAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a', null);
    useConfigStore.setState({ currentVariantSelection: { override: null, inherited: 'high' } });
    await send();
    expect(readRecord()).toBeNull();
  });
  test('records a chosen effort and sends it in the canonical options', async () => {
    useConfigStore.setState({ currentVariantSelection: { override: 'high', inherited: 'high' } });
    await send('hello', {}, 'high');
    expect(readRecord()).toBe('high');
    expect(runCalls[0].request.options.variant).toBe('high');
  });
  test('does not turn an inherited effort into a manual choice', async () => {
    useConfigStore.setState({ currentVariant: 'high', currentVariantSelection: { override: undefined, inherited: 'high' } });
    await send('hello', {}, 'high');
    expect(readRecord()).toBeUndefined();
  });
});

describe('armed canonical goal submission', () => {
  test('creates a goal from submitted text without sending a prompt', async () => {
    seedCanonicalSession();
    const createGoal = stub(canonicalClient, 'goal', async (sessionId, input) => ({ type: 'goal', mode: { kind: 'goal', status: 'active', objective: input.objective, tokenBudget: input.tokenBudget, tokensUsed: 0 } }));
    useSessionGoalArmStore.getState().setArmed(true, null, true);
    await send('Ship the feature');
    expect(createGoal).toHaveBeenCalledWith('session-a', { op: 'create', objective: 'Ship the feature', tokenBudget: null });
    expect(runCalls).toEqual([]);
  });
  test('creates an OMP goal before sending the armed goal prompt', async () => {
    seedCanonicalSession();
    const createGoal = stub(canonicalClient, 'goal', async (sessionId, input) => ({ type: 'goal', mode: { kind: 'goal', status: 'active', objective: input.objective, tokenBudget: input.tokenBudget, tokensUsed: 0 } }));
    useSessionGoalArmStore.getState().setArmed(true, 'Implement the plan');
    await send('Implement the plan now');
    expect(createGoal).toHaveBeenCalledWith('session-a', { op: 'create', objective: 'Implement the plan', tokenBudget: null });
    expect(runCalls).toHaveLength(1);
    expect(runCalls[0].request.input.context ?? []).toEqual([]);
  });
  test('uses the configured default token budget for an armed goal', async () => {
    seedCanonicalSession();
    const state = useUIStore.getState();
    const createGoal = stub(canonicalClient, 'goal', async (sessionId, input) => ({ type: 'goal', mode: { kind: 'goal', status: 'active', objective: input.objective, tokenBudget: input.tokenBudget, tokensUsed: 0 } }));
    useUIStore.setState({ sessionGoalDefaultBudgetEnabled: true, sessionGoalDefaultBudget: 12000 });
    try {
      useSessionGoalArmStore.getState().setArmed(true, 'Finish the work');
      await send('Finish the work');
      expect(createGoal).toHaveBeenCalledWith('session-a', { op: 'create', objective: 'Finish the work', tokenBudget: 12000 });
    } finally {
      useUIStore.setState({ sessionGoalDefaultBudgetEnabled: state.sessionGoalDefaultBudgetEnabled, sessionGoalDefaultBudget: state.sessionGoalDefaultBudget });
    }
  });

  test('a captured arm token budget overrides the configured default', async () => {
    seedCanonicalSession();
    const state = useUIStore.getState();
    const createGoal = stub(canonicalClient, 'goal', async (sessionId, input) => ({ type: 'goal', mode: { kind: 'goal', status: 'active', objective: input.objective, tokenBudget: input.tokenBudget, tokensUsed: 0 } }));
    useUIStore.setState({ sessionGoalDefaultBudgetEnabled: true, sessionGoalDefaultBudget: 12000 });
    try {
      useSessionGoalArmStore.getState().setArmed(true, 'Finish the work', false, 4000);
      await send('Finish the work');
      expect(createGoal).toHaveBeenCalledWith('session-a', { op: 'create', objective: 'Finish the work', tokenBudget: 4000 });
    } finally {
      useUIStore.setState({ sessionGoalDefaultBudgetEnabled: state.sessionGoalDefaultBudgetEnabled, sessionGoalDefaultBudget: state.sessionGoalDefaultBudget });
    }
  });

  test('does not write goal metadata or dispatch after A-B-A during objective file write', async () => {
    seedCanonicalSession();
    const session = hostSession('session-a'); useGlobalSessionsStore.getState().upsertSession(session);
    const gate = deferred(); const started = deferred(); const key = getRuntimeKey(); const base = getRuntimeApiBaseUrl();
    const patch = stub(canonicalClient, 'patchSessionMetadata', async () => { throw new Error('unexpected patch'); });
    const createGoal = stub(canonicalClient, 'goal', async (sessionId, input) => {
      started.resolve();
      await gate.promise;
      return { type: 'goal', mode: { kind: 'goal', status: 'active', objective: input.objective, tokenBudget: null, tokensUsed: 0 } };
    });
    useSessionGoalArmStore.getState().setArmed(true, 'Goal objective');
    const sending = send('goal'); await started.promise;
    switchRuntimeEndpoint({ apiBaseUrl: 'https://other.test', runtimeKey: 'other-native' });
    switchRuntimeEndpoint({ apiBaseUrl: base, runtimeKey: key });
    gate.resolve();
    await expect(sending).rejects.toThrow(/runtime changed/i); expect(patch).not.toHaveBeenCalled(); expect(runCalls).toEqual([]);
  });
});

describe('canonical slash skill routing', () => {
  test('routes a native command without a cached command or OpenCode discovery', async () => {
    fakeFileResources({ expand: () => Response.json({ kind: 'command', content: 'Deploy staging' }) });
    expect(await route({ content: '/deploy staging' })).toBe('command');
    expect(runCalls[0].request.input.text).toBe('Deploy staging');
  });
  test('routes a cached skill through canonical expansion', async () => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-review', name: 'review', description: '', content: 'Review instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    expect(await route({ content: '/review auth', skills: { names: [] } })).toBe('prompt');
    expect(runCalls[0].request.input.context).toEqual([{ kind: 'instruction', text: 'Expanded skill-review auth' }]);
  });
  test('preserves unknown slash text and attached context', async () => {
    await route({ content: '/unknown auth', additionalParts: [{ text: 'Quoted selection', synthetic: true }] });
    expect(runCalls[0].request.input).toMatchObject({
      text: '/unknown auth', context: [{ kind: 'synthetic', text: 'Quoted selection' }],
    });
  });
  test('does not dispatch when canonical skill expansion fails', async () => {
    seedCanonicalSession();
    useSkillsStore.setState({ skillsByDirectory: { '/repo': [{ skillId: 'skill-review', name: 'review', description: '', content: 'Review instructions', scope: 'workspace', readOnly: false, source: 'project' }] } });
    const failure = new Error('skill catalog unavailable');
    stub(canonicalClient, 'getSkillsCatalog', async () => { throw failure; });
    await expect(route({ content: '/review auth' })).rejects.toBe(failure);
    expect(runCalls).toEqual([]);
  });
});

describe('defaultSessionMode in new session draft', () => {
  test('initializes new draft with defaultSessionMode from useUIStore', () => {
    const { useUIStore } = require('@/stores/useUIStore');
    useUIStore.setState({ defaultSessionMode: 'plan' });
    useSessionUIStore.getState().openNewSessionDraft();
    expect(useSessionUIStore.getState().newSessionDraft.mode).toBe('plan');

    useUIStore.setState({ defaultSessionMode: 'vibe' });
    useSessionUIStore.getState().openNewSessionDraft();
    expect(useSessionUIStore.getState().newSessionDraft.mode).toBe('vibe');

    useUIStore.setState({ defaultSessionMode: 'goal' });
    useSessionUIStore.getState().openNewSessionDraft();
    expect(useSessionUIStore.getState().newSessionDraft.mode).toBe('goal');
    expect(useSessionUIStore.getState().newSessionDraft.goalObjective).toEqual({ objective: '', tokenBudget: null });

    useUIStore.setState({ defaultSessionMode: 'main' });
    useSessionUIStore.getState().openNewSessionDraft();
    expect(useSessionUIStore.getState().newSessionDraft.mode).toBeUndefined();
  });

  test('explicit options.mode overrides defaultSessionMode', () => {
    const { useUIStore } = require('@/stores/useUIStore');
    useUIStore.setState({ defaultSessionMode: 'plan' });
    useSessionUIStore.getState().openNewSessionDraft({ mode: 'vibe' });
    expect(useSessionUIStore.getState().newSessionDraft.mode).toBe('vibe');
  });
});

describe('speculative session preparation in draft lifecycle', () => {
  test('openNewSessionDraft triggers prepareSession for directory', async () => {
    const prepareCalls = [];
    stub(canonicalClient, 'prepareSession', async (payload) => {
      prepareCalls.push(payload);
      return { ok: true, sessionId: 'ses-prep-1' };
    });
    useDirectoryStore.setState({ currentDirectory: '/repo' });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/repo' });
    await new Promise(r => setTimeout(r, 20));
    expect(prepareCalls).toHaveLength(1);
    expect(prepareCalls[0]).toMatchObject({ projectId: 'project-a' });
  });

  test('closeNewSessionDraft triggers discardPreparedSession', async () => {
    const discardCalls = [];
    stub(canonicalClient, 'discardPreparedSession', async (payload) => {
      discardCalls.push(payload);
      return { ok: true };
    });
    useDirectoryStore.setState({ currentDirectory: '/repo' });
    useSessionUIStore.getState().openNewSessionDraft({ directoryOverride: '/repo' });
    await Promise.resolve();
    useSessionUIStore.getState().closeNewSessionDraft();
    await new Promise(r => setTimeout(r, 20));
    expect(discardCalls).toHaveLength(1);
    expect(discardCalls[0]).toMatchObject({ workspaceId: expect.any(String) });
  });

  test('an automatic draft in a removing worktree does not prepare a worker', async () => {
    const prepare = stub(canonicalClient, 'prepareSession', async () => ({ ok: true, sessionId: 'ses-prep-1' }));
    const checkout = 'C:/repo/feature';
    const directory = checkout + '/src';
    markWorktreeRemoving(checkout);
    try {
      useDirectoryStore.setState({ currentDirectory: directory });
      useSessionUIStore.getState().openNewSessionDraft({ automatic: true, directoryOverride: directory });
      await Bun.sleep(0);
      expect(useSessionUIStore.getState().newSessionDraft).toMatchObject({ open: true, directoryOverride: directory });
      expect(prepare).not.toHaveBeenCalled();
    } finally {
      clearWorktreeRemoval(checkout);
    }
  });
});
