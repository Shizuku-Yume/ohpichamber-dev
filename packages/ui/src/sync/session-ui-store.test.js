<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { ensureChatsRootDirectory, CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { hostFilesystem } from '@/lib/host-filesystem';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
=======
import { ensureChatsRootDirectory } from '@/lib/chatDirectories';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import * as gitHttp from '@/lib/gitApiHttp';
import { opencodeClient } from '@/lib/opencode/client';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionWorktreeStore } from './session-worktree-store';
import { expandSlashCommandGoalObjective, materializeOpenDraftSession, resolveSendSelection, routeMessage, useSessionUIStore } from './session-ui-store';
import { ChildStoreManager } from './child-store';
import { setSyncRefs } from './sync-refs';
import { setActionRefs, setOptimisticRefs } from './session-actions';
>>>>>>> bc50ba56a
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSessionGoalArmStore } from '@/stores/useSessionGoalArmStore';
import { useConfigStore } from '@/stores/useConfigStore';
<<<<<<< HEAD
import { useUIStore } from '@/stores/useUIStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import { ChildStoreManager } from './child-store';
import { setSyncRefs } from './sync-refs';
import { setActionRefs } from './session-actions';
import { useSessionWorktreeStore } from './session-worktree-store';
import { routeMessage, useSessionUIStore } from './session-ui-store';
import { ROOT_SELECTION_AGENT, useSelectionStore } from './selection-store';
import { buildComposerContext, buildOutgoingMessage, queuedContextToParts } from '@/components/chat/composer/submit/buildOutgoingMessage';
import { deferred, nativeSnapshot } from './session-message-loader-test-fixtures';
=======
import { useSelectionStore } from './selection-store';
import { getRuntimeApiBaseUrl, getRuntimeKey, initializeRuntimeEndpoint, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { getDeferredSafeStorage } from '@/stores/utils/safeStorage';
import { CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import { createContextPart } from '@/lib/messages/contextParts';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { subscribeSpaceSessionProject } from './space-session-project';
>>>>>>> bc50ba56a

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
  stub(hostFilesystem, 'getFilesystemHomeInfo', async () => ({
    home: '/Users/tester',
    chatsRoot: '/Users/tester/.config/openchamber/chats',
    canonicalChatsRoot: '/Users/tester/.config/openchamber/chats',
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
    isConnected: true, hasEverConnected: true, activateDirectory: async () => {},
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
  manager.disposeAll();
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
  const projectsBefore = useProjectsStore.getState().projects;
  beforeEach(() => {
    useProjectsStore.setState({ projects: [{ id: 'alpha', path: '/projects/alpha' }] });
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      materializedDraftSessionId: null,
      newSessionDraft: { open: true, target: 'project', directoryOverride: '/projects/alpha' },
    });
  });
  afterEach(() => useProjectsStore.setState({ projects: projectsBefore }));

  test('marks and consumes only the submitted draft session', () => {
    useSessionUIStore.getState().setCurrentSession(
      'session-created',
      '/projects/alpha',
      { transition: 'submitted-draft' },
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
      { transition: 'submitted-draft' },
    );
    useSessionUIStore.setState({
      newSessionDraft: { open: true, target: 'project', directoryOverride: '/projects/alpha' },
    });
    useSessionUIStore.getState().setCurrentSession('session-existing', '/projects/alpha');

    expect(useSessionUIStore.getState().materializedDraftSessionId).toBeNull();
  });
});

<<<<<<< HEAD
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
=======
describe('routeMessage directory scoping', () => {
  test('runs sends in the provided session directory', async () => {
    // The session directory travels as an explicit request param (not via
    // client-wide directory scoping), so concurrent sends can't cross-talk.
    const calls = [];
    const originalShellSession = opencodeClient.shellSession;

    opencodeClient.shellSession = async (params) => {
      calls.push(params);
      return { info: {}, parts: [] };
    };

    try {
      await routeMessage({
        sessionId: 'session-a',
        directory: '/session/project',
        content: 'pwd',
        providerID: 'provider-a',
        modelID: 'model-a',
        inputMode: 'shell',
      });
    } finally {
      opencodeClient.shellSession = originalShellSession;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].sessionId).toBe('session-a');
    expect(calls[0].directory).toBe('/session/project');
  });

  // OpenCode records a shell command past a staged revert's boundary, where the
  // next prompt's commit deletes it (#6319).
  test('commits a staged revert before running a shell command, and only then', async () => {
    const childStores = new ChildStoreManager();
    const store = childStores.ensureChild('/session/project', { bootstrap: false });
    setActionRefs(childStores, () => '/session/project');
    const requests = [];
    let committed = () => undefined;
    const commit = spyOn(opencodeClient, 'commitRevert').mockImplementation((sessionId, directory) => new Promise((resolve) => {
      committed = () => { requests.push(['committed', sessionId, directory]); resolve(); };
    }));
    const shell = spyOn(opencodeClient, 'shellSession').mockImplementation(async (params) => { requests.push(['shell', params.sessionId]); return 'msg'; });
    const runShell = () => routeMessage({ sessionId: 'session-a', directory: '/session/project', content: 'pwd', providerID: 'provider-a', modelID: 'model-a', inputMode: 'shell' });
    try {
      store.setState({ session: [{ id: 'session-a', revert: { messageID: 'msg_reverted' } }] });
      const staged = runShell();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requests).toEqual([]);
      committed();
      await staged;
      store.setState({ session: [{ id: 'session-a' }] });
      await runShell();
    } finally {
      commit.mockRestore();
      shell.mockRestore();
      setActionRefs(new ChildStoreManager(), () => '');
    }

    expect(requests).toEqual([['committed', 'session-a', '/session/project'], ['shell', 'session-a'], ['shell', 'session-a']]);
  });
});

describe('resolveSendSelection thinking level', () => {
  const DIRECTORY = '/repo/variant';
  const MODEL = { providerID: 'openai', id: 'gpt-5.6-luna' };
  const seedSession = (model) => {
    const childStores = new ChildStoreManager();
    childStores.ensureChild(DIRECTORY, { bootstrap: false }).setState({ session: [{ id: 'ses_variant', model }] });
    setSyncRefs({}, childStores, DIRECTORY);
  };
  afterEach(() => {
    setSyncRefs({}, new ChildStoreManager(), '');
  });
  const desire = (variant) => resolveSendSelection('ses_variant', DIRECTORY, { providerID: 'openai', modelID: MODEL.id, variant });

  // An explicit Default is `null` in UI state; OpenCode rejects a null
  // variant, so it has to switch the session off its effort without one.
  test('Default on a session with an effort switches it to the model without a variant', async () => {
    seedSession({ ...MODEL, variant: 'high' });
    expect((await desire(null)).model).toEqual(MODEL);
  });

  test('Default on a session without an effort sends no switch', async () => {
    seedSession(MODEL);
    expect((await desire(null)).model).toBeUndefined();
    expect((await desire(undefined)).model).toBeUndefined();
  });

  // OpenCode records a switch without a variant as variant "default"; reading
  // that back as a difference would switch again before every prompt.
  test('Default on a session OpenCode recorded as "default" sends no switch', async () => {
    seedSession({ ...MODEL, variant: 'default' });
    expect((await desire(null)).model).toBeUndefined();
    expect((await desire(undefined)).model).toBeUndefined();
    expect((await desire('high')).model).toEqual({ ...MODEL, variant: 'high' });
  });

  test('a chosen effort switches only when it differs', async () => {
    seedSession({ ...MODEL, variant: 'high' });
    expect((await desire('high')).model).toBeUndefined();
    expect((await desire('low')).model).toEqual({ ...MODEL, variant: 'low' });
  });
});

describe('routeMessage agent the folder lacks (#5522)', () => {
  const DIRECTORY = '/repo/agent-check';
  const agent = (id) => ({ id, name: id, displayName: id, mode: 'primary' });
  let previousConfig;
  let getSession;

  beforeEach(() => {
    getSession = spyOn(opencodeClient, 'getSession').mockResolvedValue({ agent: 'stock' });
    previousConfig = useConfigStore.getState();
    const childStores = new ChildStoreManager();
    childStores.ensureChild(DIRECTORY, { bootstrap: false }).setState({
      session: [{ id: 'ses_stuck', agent: 'stock', model: { providerID: 'provider-a', id: 'model-a' } }],
    });
    setSyncRefs({}, childStores, DIRECTORY);
  });

  afterEach(() => {
    getSession.mockRestore();
    useConfigStore.setState(previousConfig, true);
    setSyncRefs({}, new ChildStoreManager(), '');
  });

  const sendCommandWith = async (catalog) => {
    useConfigStore.setState({
      activeDirectoryKey: '/elsewhere',
      directoryScoped: { [DIRECTORY]: { ...catalog, providers: [], agentModelSelections: {}, defaultProviders: {}, selectedProviderId: '', currentProviderId: '', currentModelId: '' } },
    });
    const calls = [];
    const originalListCommands = opencodeClient.listCommands;
    const originalSendCommand = opencodeClient.sendCommand;
    opencodeClient.listCommands = async () => [{ name: 'agent-check-test' }];
    opencodeClient.sendCommand = async (params) => {
      calls.push(params);
    };
    try {
      await routeMessage({
        sessionId: 'ses_stuck',
        directory: DIRECTORY,
        content: '/agent-check-test',
        providerID: 'provider-a',
        modelID: 'model-a',
        agent: 'stock',
      });
    } finally {
      opencodeClient.listCommands = originalListCommands;
      opencodeClient.sendCommand = originalSendCommand;
    }
    return calls[0];
  };

  test('a session already on an agent the loaded catalog lacks sends it for the check', async () => {
    const call = await sendCommandWith({ agents: [agent('build'), agent('plan')], agentsLoaded: true });
    expect(call.agent).toBe('stock');
  });

  test('no switch travels while the catalog lists the agent or has not loaded', async () => {
    expect((await sendCommandWith({ agents: [agent('stock')], agentsLoaded: true })).agent).toBeUndefined();
    expect((await sendCommandWith({ agents: [], agentsLoaded: false })).agent).toBeUndefined();
  });
});

describe('routeMessage inline skills', () => {
  test('the command route names inline skills in an instruction after the attached context', async () => {
    const calls = [];
    const originalListCommands = opencodeClient.listCommands;
    const originalSendCommand = opencodeClient.sendCommand;
    opencodeClient.listCommands = async () => [{ name: 'review-skills-test' }];
    opencodeClient.sendCommand = async (params) => {
      calls.push(params);
    };

    try {
      await routeMessage({
        sessionId: 'session-a',
        directory: '/session/project',
        content: '/review-skills-test with /deploy',
        providerID: 'provider-a',
        modelID: 'model-a',
        additionalParts: [{ text: 'quoted code', synthetic: true }],
        skills: { names: ['deploy'], instructionFor: (names) => `use: ${names.join(',')}` },
      });
    } finally {
      opencodeClient.listCommands = originalListCommands;
      opencodeClient.sendCommand = originalSendCommand;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0].context.map((item) => item.text)).toEqual(['quoted code', 'use: deploy']);
  });
});

describe('sendMessage captured target', () => {
  let originalSendMessage;
  let originalGetSession;
  let originalFetch;
  const calls = [];

  beforeEach(() => {
    calls.length = 0;
    const childStore = {
      getState: () => ({ session: [], message: {}, part: {}, session_status: {} }),
      setState: () => {},
    };
    const childStores = {
      children: new Map(),
      ensureChild: () => childStore,
      getChild: () => childStore,
    };
    setActionRefs(childStores, () => '/current/project');
    setOptimisticRefs(() => {}, () => {});
    useConfigStore.setState({ isConnected: true });
    useSessionUIStore.setState({
      currentSessionId: 'session-current',
      currentSessionDirectory: '/current/project',
      newSessionDraft: { open: false, directoryOverride: null, parentID: null },
    });

    originalSendMessage = opencodeClient.sendMessage;
    originalGetSession = opencodeClient.getSession;
    opencodeClient.getSession = async () => ({ agent: 'build' });
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      const url = input?.href ?? input?.url ?? String(input);
      if (url.includes('/api/config/settings')) {
        return Response.json({ responseStyleEnabled: true, responseStylePreset: 'concise' });
      }
      return Response.json({});
    };
    opencodeClient.sendMessage = async (params) => {
      calls.push(params);
      return 'msg';
    };
  });

  afterEach(() => {
    opencodeClient.sendMessage = originalSendMessage;
    opencodeClient.getSession = originalGetSession;
    globalThis.fetch = originalFetch;
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
    expect(requests.map(request => request.body)).toEqual([
      { text: '/inspect\tauth' }, { text: '/inspect\nauth' }, { text: '/inspect\tauth more' },
    ]);
    expect(runCalls.map(call => call.request.input.text)).toEqual(['/inspect\tauth', '/inspect\nauth', '/inspect\tauth more']);
=======

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('runtime changed');
    expect(calls).toHaveLength(0);
  });

  const sendWithEffort = (variant, recordEffort) => useSessionUIStore.getState().sendMessage(
    'message',
    'provider-a',
    'model-a',
    undefined,
    undefined,
    undefined,
    undefined,
    variant,
    'normal',
    {
      target: { runtimeKey: getRuntimeKey(), sessionId: 'session-captured', directory: '/captured/project' },
      recordEffort,
    },
  );

  test('records the level a composer send carried', async () => {
    useUIStore.setState({ lastUsedEfforts: {} });

    await sendWithEffort('high', true);

    expect(useUIStore.getState().lastUsedEfforts).toEqual({ 'provider-a/model-a': 'high' });
  });

  test('records an explicit Default as a real choice', async () => {
    useUIStore.setState({ lastUsedEfforts: {} });

    await sendWithEffort(null, true);

    expect(useUIStore.getState().lastUsedEfforts).toEqual({ 'provider-a/model-a': null });
  });

  test('background and queued sends leave the remembered level alone', async () => {
    useUIStore.setState({ lastUsedEfforts: { 'provider-a/model-a': 'low' } });

    await sendWithEffort('high', false);

    expect(useUIStore.getState().lastUsedEfforts).toEqual({ 'provider-a/model-a': 'low' });
  });

  test('a pending send preserves newer picker choices, including a return to the same value', async () => {
    const { rememberEffort } = await import('../lib/modelEfforts');
    for (const choices of [['high'], ['high', 'low']]) {
      rememberEffort('provider-a', 'model-a', 'low');
      let finish;
      let started;
      const pending = new Promise((resolve) => { started = resolve; });
      opencodeClient.sendMessage = () => new Promise((resolve) => {
        finish = resolve;
        started();
      });
      const sending = sendWithEffort(null, true);
      await pending;
      for (const choice of choices) rememberEffort('provider-a', 'model-a', choice);
      finish('msg');
      await sending;
      expect(useUIStore.getState().lastUsedEfforts['provider-a/model-a']).toBe(choices.at(-1));
    }
  });

  test.each([false, true])('a completed send cannot record effort after a runtime switch, round trip %s', async (roundTrip) => {
    const apiBaseUrl = getRuntimeApiBaseUrl();
    const runtimeKey = getRuntimeKey();
    useUIStore.setState({ lastUsedEfforts: { 'provider-a/model-a': 'low' } });
    let finish;
    let started;
    const pending = new Promise((resolve) => { started = resolve; });
    opencodeClient.sendMessage = () => new Promise((resolve) => {
      finish = resolve;
      started();
    });
    try {
      const sending = sendWithEffort(null, true);
      await pending;
      switchRuntimeEndpoint({ apiBaseUrl: 'https://effort-other.test', runtimeKey: 'effort-other' });
      if (roundTrip) switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
      finish('msg');
      await sending;
      expect(useUIStore.getState().lastUsedEfforts['provider-a/model-a']).toBe('low');
    } finally {
      switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
    }
  });

  test('a failed composer send preserves the last chosen level', async () => {
    useUIStore.setState({ lastUsedEfforts: { 'provider-a/model-a': 'low' } });
    opencodeClient.sendMessage = async () => { throw new Error('offline'); };

    await expect(sendWithEffort('high', true)).rejects.toThrow('offline');

    expect(useUIStore.getState().lastUsedEfforts).toEqual({ 'provider-a/model-a': 'low' });
  });

  const sendWithAgent = (agent, inputMode = 'normal') => useSessionUIStore.getState().sendMessage(
    'message',
    'provider-a',
    'model-a',
    agent,
    undefined,
    undefined,
    undefined,
    undefined,
    inputMode,
    { target: { runtimeKey: getRuntimeKey(), sessionId: 'session-captured', directory: '/captured/project' } },
  );

  test('the send that switches the session to a picked agent settles the pick; a failed one gives it back', async () => {
    const selection = useSelectionStore.getState();
    selection.clearSessionSelections('session-captured');
    selection.pickSessionAgent('session-captured', 'plan');

    opencodeClient.sendMessage = async () => { throw new Error('offline'); };
    await expect(sendWithAgent('plan')).rejects.toThrow('offline');
    expect(selection.getSessionAgentPick('session-captured')).toBe('plan');

    // Picking the session's own agent while a send is out is newer than the
    // send, so its failure does not bring the pick back.
    selection.followSessionAgent('session-captured', 'build');
    let fail;
    let out;
    const failing = new Promise((resolve) => { out = resolve; });
    opencodeClient.sendMessage = () => new Promise((_resolve, reject) => {
      fail = reject;
      out();
    });
    const failedSend = sendWithAgent('plan');
    await failing;
    selection.pickSessionAgent('session-captured', 'build');
    fail(new Error('offline'));
    await expect(failedSend).rejects.toThrow('offline');
    expect(selection.getSessionAgentPick('session-captured')).toBeNull();
    expect(selection.getSessionAgentSelection('session-captured')).toBe('build');
    selection.pickSessionAgent('session-captured', 'plan');

    opencodeClient.sendMessage = async (params) => {
      calls.push(params);
      return 'msg';
    };
    const shell = spyOn(opencodeClient, 'shellSession').mockResolvedValue(undefined);
    try {
      await sendWithAgent('plan', 'shell');
    } finally {
      shell.mockRestore();
    }
    expect(selection.getSessionAgentPick('session-captured')).toBe('plan');

    // Settled as the send leaves, so a switch another client makes while it
    // is out shows in the composer even if its events arrive merged.
    let finish;
    let started;
    const leaving = new Promise((resolve) => { started = resolve; });
    opencodeClient.sendMessage = (params) => new Promise((resolve) => {
      calls.push(params);
      finish = resolve;
      started();
    });
    const sending = sendWithAgent('plan');
    await leaving;
    expect(selection.getSessionAgentPick('session-captured')).toBeNull();
    expect(selection.followSessionAgent('session-captured', 'review')).toBe(true);
    finish('msg');
    await sending;
    expect(calls.at(-1).agent).toBe('plan');
    expect(selection.getSessionAgentSelection('session-captured')).toBe('review');
    selection.clearSessionSelections('session-captured');
  });

  test.each(['agent', 'model'])('a successful send preserves a followed %s round trip while it was out', async (field) => {
    const selection = useSelectionStore.getState();
    selection.clearSessionSelections('session-captured');
    selection.followSessionAgent('session-captured', 'build');
    selection.markSessionModelFollowed('session-captured', 'provider-a/original#');
    selection.pickSessionAgent('session-captured', 'plan');
    let finish;
    let started;
    const leaving = new Promise((resolve) => { started = resolve; });
    opencodeClient.sendMessage = () => new Promise((resolve) => {
      finish = resolve;
      started();
    });

    const sending = sendWithAgent('plan');
    await leaving;
    if (field === 'agent') {
      selection.followSessionAgent('session-captured', 'plan');
      selection.followSessionAgent('session-captured', 'build');
    } else {
      selection.markSessionModelFollowed('session-captured', 'provider-a/model-a#');
      selection.markSessionModelFollowed('session-captured', 'provider-a/original#');
    }
    finish('msg');
    await sending;

    expect(selection.getSessionAgentSelection('session-captured')).toBe(field === 'agent' ? 'build' : 'plan');
    expect(selection.isSessionModelSwitched('session-captured', field === 'model'
      ? 'provider-a/original#' : 'provider-a/model-a#')).toBe(false);
    selection.clearSessionSelections('session-captured');
  });

  test('a successful send preserves a model followed while it was out', async () => {
    const selection = useSelectionStore.getState();
    selection.clearSessionSelections('session-captured');
    selection.markSessionModelFollowed('session-captured', 'provider-a/original#');
    selection.pickSessionModel('session-captured', 'provider-a', 'model-a');
    let finish;
    let started;
    const leaving = new Promise((resolve) => { started = resolve; });
    opencodeClient.sendMessage = () => new Promise((resolve) => {
      finish = resolve;
      started();
    });

    const sending = sendWithAgent('plan');
    await leaving;
    selection.markSessionModelFollowed('session-captured', 'provider-b/external#high');
    finish('msg');
    await sending;

    expect(selection.getSessionModelPick('session-captured')).toBeNull();
    expect(selection.isSessionModelSwitched('session-captured', 'provider-b/external#high')).toBe(false);
    expect(selection.isSessionModelSwitched('session-captured', 'provider-a/model-a#')).toBe(true);
    expect(selection.getSessionAgentSelection('session-captured')).toBe('plan');
    selection.clearSessionSelections('session-captured');
  });

  test('only a successful model-carrying send consumes a live model pick', async () => {
    const selection = useSelectionStore.getState();
    selection.pickSessionModel('session-captured', 'provider-a', 'model-a');
    opencodeClient.sendMessage = async () => { throw new Error('offline'); };
    await expect(sendWithAgent('plan')).rejects.toThrow('offline');
    expect(selection.getSessionModelPick('session-captured')).toEqual({ providerId: 'provider-a', modelId: 'model-a' });
    const shell = spyOn(opencodeClient, 'shellSession').mockResolvedValue(undefined);
    try {
      await sendWithAgent('plan', 'shell');
      expect(selection.getSessionModelPick('session-captured')).not.toBeNull();
    } finally {
      shell.mockRestore();
    }
    opencodeClient.sendMessage = async () => 'msg';
    await sendWithAgent('plan');
    expect(selection.getSessionModelPick('session-captured')).toBeNull();
  });
});

describe('slash-command goal objectives', () => {
  test('expands every $ARGUMENTS reference from the authoritative command template', () => {
    expect(expandSlashCommandGoalObjective('/issue--to-pr LIN-123 --draft', [{
      name: 'issue--to-pr',
      template: 'Run the issue pipeline for $ARGUMENTS. Verify $ARGUMENTS is represented by the PR.',
    }])).toBe('Run the issue pipeline for LIN-123 --draft. Verify LIN-123 --draft is represented by the PR.');
>>>>>>> bc50ba56a
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
  test('resumes a pending start folder after A -> B -> A and rejects the old completion', async () => {
    const originalUI = useSessionUIStore.getState();
    const originalProjects = useProjectsStore.getState();
    const originalConfig = useConfigStore.getState();
    const originalDirectory = useDirectoryStore.getState();
    const originalRuntime = { apiBaseUrl: getRuntimeApiBaseUrl(), runtimeKey: getRuntimeKey() };
    const project = { id: 'runtime-folder-project', path: '/runtime-project/ai' };
    const root = '/runtime-worktree';
    const a = 'https://draft-a.test';
    const b = 'https://draft-b.test';
    const prefixResolvers = [];
    const prefixes = spyOn(gitHttp, 'resolveGitRepositoryPrefix').mockImplementation(() => new Promise((resolve) => prefixResolvers.push(resolve)));
    const validation = spyOn(gitHttp, 'validateWorktreeDirectory').mockImplementation(async (directory, worktreeRoot) => ({
      valid: true, insideWorktreeRoot: true, resolvedWorktreeRoot: worktreeRoot, resolvedCwd: directory,
    }));
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(null, { status: 404 }));
    const activated = [];
    const flush = async () => { await Bun.sleep(0); };
    try {
      initializeRuntimeEndpoint({ apiBaseUrl: a });
      useProjectsStore.setState({ projects: [project], activeProjectId: project.id });
      useDirectoryStore.setState({ currentDirectory: root, homeDirectory: '/home', isHomeReady: true });
      useConfigStore.setState({ activateDirectory: async (directory) => { activated.push(directory); } });
      useSessionUIStore.setState({
        currentSessionId: null,
        newSessionDraft: { ...originalUI.newSessionDraft, open: false },
        availableWorktreesByProject: new Map([[project.path, [{ path: root, projectDirectory: project.path, branch: 'test', label: 'test' }]]]),
      });
      useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: project.id, directoryOverride: root });
      const draftId = useSessionUIStore.getState().newSessionDraft.draftId;
      expect(useSessionUIStore.getState().newSessionDraft.worktreeStartDirectory).toEqual({ worktreeRoot: root, directory: null });
      expect(prefixResolvers).toHaveLength(1);
      useSessionUIStore.getState().prepareForRuntimeSwitch(a);
      switchRuntimeEndpoint({ apiBaseUrl: b });
      useSessionUIStore.getState().restoreForRuntimeSwitch(b, `url:${a}`);
      prefixResolvers[0]('ai');
      await flush();
      expect(activated).toEqual([]);
      useSessionUIStore.getState().prepareForRuntimeSwitch(b);
      switchRuntimeEndpoint({ apiBaseUrl: a });
      useSessionUIStore.getState().restoreForRuntimeSwitch(a, `url:${b}`);
      expect(useSessionUIStore.getState().newSessionDraft.draftId).toBe(draftId);
      expect(prefixResolvers).toHaveLength(2);
      expect(activated).toEqual([]);
      prefixResolvers[1]('ai');
      await flush();
      expect(useSessionUIStore.getState().newSessionDraft.worktreeStartDirectory).toEqual({ worktreeRoot: root, directory: `${root}/ai` });
      expect(activated).toEqual([`${root}/ai`]);
    } finally {
      for (const resolve of prefixResolvers) resolve('ai');
      await flush();
      prefixes.mockRestore();
      validation.mockRestore();
      switchRuntimeEndpoint(originalRuntime);
      fetch.mockRestore();
      useSessionUIStore.setState(originalUI);
      useProjectsStore.setState(originalProjects);
      useConfigStore.setState(originalConfig);
      useDirectoryStore.setState(originalDirectory);
    }
  });

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

  test('an old draft activation cannot replace a newer draft default', async () => {
    const original = useConfigStore.getState();
    let finishActivation;
    const activation = new Promise((resolve) => { finishActivation = resolve; });
    useConfigStore.setState({ activateDirectory: () => activation, providers: [], agents: [], isConnected: false });
    useProjectsStore.setState({ projects: [
      { ...projectA, defaultModel: 'alpha/model' },
      { ...projectB, defaultModel: 'beta/model' },
    ] });
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
    useConfigStore.setState({ activateDirectory: async () => {} });
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
    useConfigStore.setState({ activateDirectory: async () => {} });
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

  test('leaves an automatic draft on the recorded project when the live directory is unmatched', () => {
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
      '/Users/tester/.config/openchamber/chats/ses_chat',
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
      directoryOverride: '/Users/tester/.config/openchamber/chats/ses_chat',
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
      directoryOverride: '/Users/tester/.config/openchamber/chats/ses_chat',
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

  test('never moves a draft in an isolated space to the project, pinned or not', async () => {
    const createSessionCalls = [];
    const spaceDirectory = '/spaces/0123456789ab/main';
    useProjectsStore.setState({
      projects: [{ id: 'project-main', path: '/projects/main', label: 'Main' }],
      activeProjectId: 'project-main',
    });
    // The host's probe cannot see inside a space and calls its directory missing.
    opencodeClient.getDirectoryAvailability = async () => 'missing';
    opencodeClient.createSession = async (_params, directory) => {
      createSessionCalls.push(directory);
      return { id: 'session-space', directory, time: { created: 1, updated: 1 } };
    };
    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: 'project-main', directoryOverride: spaceDirectory });
    expect(useSessionUIStore.getState().newSessionDraft.preserveDirectoryOverride).toBe(true);
    useSessionUIStore.getState().setDraftPreserveDirectoryOverride(false);

    await useSessionUIStore.getState().createSession('Draft title', spaceDirectory);

    expect(createSessionCalls).toEqual([spaceDirectory]);
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


<<<<<<< HEAD
describe('native prompt routing', () => {
  test('sends captured execution options as a canonical PromptRequest', async () => {
    await route({ agent: 'build', variant: 'high', reasoningEffort: 'medium', agentMentionName: 'reviewer', commandId: 'submit-a' });
    expect(runCalls).toEqual([{
      sessionId: 'session-a', commandId: 'submit-a',
      request: {
        input: { text: 'hello', attachments: [], context: [], agentMention: { agentId: 'reviewer' } },
        options: { providerId: 'provider-a', modelId: 'model-a', agentId: 'build', variant: 'high', reasoningEffort: 'medium' },
=======
  beforeEach(() => {
    sendMessageCalls.length = 0;
    createSessionCalls.length = 0;

    const childStore = {
      getState: () => ({ session: [], message: {}, part: {}, session_status: {} }),
      setState: () => {},
    };
    const childStores = {
      children: new Map(),
      ensureChild: () => childStore,
      getChild: () => childStore,
    };
    setActionRefs(childStores, () => '/projects/alpha');
    setOptimisticRefs(() => {}, () => {});
    useConfigStore.setState({ isConnected: true });

    originalSendMessage = opencodeClient.sendMessage;
    originalCreateSession = opencodeClient.createSession;
    opencodeClient.sendMessage = async (params) => {
      sendMessageCalls.push(params);
      return 'msg';
    };
    opencodeClient.createSession = async (params, directory) => {
      createSessionCalls.push(directory);
      // A draft's first send mints the id and OpenCode creates the session under it.
      return { id: params?.id ?? 'session-materialized', directory: directory ?? '/projects/alpha', time: { created: 1, updated: 1 } };
    };
  });

  afterEach(() => {
    opencodeClient.sendMessage = originalSendMessage;
    opencodeClient.createSession = originalCreateSession;
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: { open: false, directoryOverride: null, parentID: null },
    });
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useSessionDisplayStore.setState({ singleProjectId: null });
  });

  test.each([
    { recordEffort: true, fails: false, expected: 'high' },
    { recordEffort: true, fails: true, expected: 'low' },
    { recordEffort: false, fails: false, expected: 'low' },
  ])('draft effort recording $recordEffort with send failure $fails', async ({ recordEffort, fails, expected }) => {
    useUIStore.setState({ lastUsedEfforts: { 'provider-a/model-a': 'low' } });
    const draftSnapshot = {
      draftId: `effort-${recordEffort}-${fails}`,
      open: true,
      directoryOverride: '/projects/alpha',
      parentID: null,
    };
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: draftSnapshot,
    });
    if (fails) opencodeClient.sendMessage = async () => { throw new Error('offline'); };

    const send = useSessionUIStore.getState().sendMessage(
      'message', 'provider-a', 'model-a', undefined, undefined, undefined, undefined,
      'high', 'normal', { draftSnapshot, recordEffort },
    );
    if (fails) {
      await expect(send).rejects.toThrow('offline');
    } else {
      await send;
    }

    expect(createSessionCalls).toHaveLength(1);
    expect(useUIStore.getState().lastUsedEfforts).toEqual({ 'provider-a/model-a': expected });
  });

  test.each([false, true])('a completed draft send cannot record effort after a runtime switch, round trip %s', async (roundTrip) => {
    const apiBaseUrl = getRuntimeApiBaseUrl();
    const runtimeKey = getRuntimeKey();
    const draftSnapshot = { draftId: `runtime-effort-${roundTrip}`, open: true, directoryOverride: '/projects/alpha', parentID: null };
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null, newSessionDraft: draftSnapshot });
    useUIStore.setState({ lastUsedEfforts: { 'provider-a/model-a': 'low' } });
    let finish;
    let started;
    const pending = new Promise((resolve) => { started = resolve; });
    opencodeClient.sendMessage = () => new Promise((resolve) => {
      finish = resolve;
      started();
    });
    try {
      const sending = useSessionUIStore.getState().sendMessage(
        'message', 'provider-a', 'model-a', undefined, undefined, undefined, undefined,
        'high', 'normal', { draftSnapshot, recordEffort: true },
      );
      await pending;
      switchRuntimeEndpoint({ apiBaseUrl: 'https://effort-other.test', runtimeKey: 'effort-other' });
      if (roundTrip) switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
      finish('msg');
      await sending;
      expect(useUIStore.getState().lastUsedEfforts['provider-a/model-a']).toBe('low');
    } finally {
      switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
    }
  });

  test('draft send snapshots the draft; switching to another project mid-flight still targets the materialized session', async () => {
    useProjectsStore.setState({
      projects: [
        { id: 'project-alpha', path: '/projects/alpha', label: 'Alpha' },
        { id: 'project-beta', path: '/projects/beta', label: 'Beta' },
      ],
      activeProjectId: 'project-alpha',
    });
    useSessionDisplayStore.setState({ singleProjectId: 'project-alpha' });
    const draftSnapshot = {
      open: true,
      directoryOverride: '/projects/alpha',
      parentID: null,
      title: 'Project A draft',
    };
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      newSessionDraft: draftSnapshot,
    });

    const sendPromise = useSessionUIStore.getState().sendMessage(
      'message for project A',
      'provider-a',
      'model-a',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'normal',
      { draftSnapshot },
    );

    // A sidebar switch while the send is still in flight must not reroute it.
    useSessionUIStore.getState().setCurrentSession('session-project-b', '/projects/beta');
    expect(useSessionDisplayStore.getState().singleProjectId).toBe('project-beta');

    await sendPromise;

    expect(createSessionCalls).toHaveLength(1);
    expect(createSessionCalls[0]).toBe('/projects/alpha');
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].id.startsWith('ses_')).toBe(true);
    expect(sendMessageCalls[0].directory).toBe('/projects/alpha');
    expect(useSessionDisplayStore.getState().singleProjectId).toBe('project-alpha');
  });

  test('a session opened from a chat draft in the app directory reads its own catalog again (#6283)', () => {
    const originalConfig = useConfigStore.getState();
    const originalDirectory = useDirectoryStore.getState();
    const originalProjects = useProjectsStore.getState();
    const activated = [];
    try {
      useProjectsStore.setState({ projects: [{ id: 'alpha', path: '/projects/alpha' }] });
      useDirectoryStore.setState({ currentDirectory: '/projects/alpha' });
      useConfigStore.setState({ activateDirectory: async (directory) => { activated.push(directory); } });

      useSessionUIStore.setState({ newSessionDraft: { open: false, directoryOverride: null, parentID: null } });
      useSessionUIStore.getState().setCurrentSession('session-alpha', '/projects/alpha');
      expect(useSessionUIStore.getState().currentSessionId).toBe('session-alpha');
      expect(activated).toEqual([]);

      useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: { open: true, target: 'chat', draftId: 1, directoryOverride: null, parentID: null } });
      useSessionUIStore.getState().setCurrentSession('session-alpha', '/projects/alpha');
      expect(useSessionUIStore.getState().currentSessionId).toBe('session-alpha');
      expect(activated).toEqual(['/projects/alpha']);
    } finally {
      useConfigStore.setState(originalConfig);
      useDirectoryStore.setState(originalDirectory);
      useProjectsStore.setState(originalProjects);
    }
  });

  test('existing-session send keeps the submit-time target even when selection changes', async () => {
    useSessionUIStore.setState({
      currentSessionId: 'session-project-a',
      currentSessionDirectory: '/projects/alpha',
      newSessionDraft: { open: false, directoryOverride: null, parentID: null },
    });

    const sendPromise = useSessionUIStore.getState().sendMessage(
      'message for project A',
      'provider-a',
      'model-a',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'normal',
      { target: { runtimeKey: getRuntimeKey(), sessionId: 'session-project-a', directory: '/projects/alpha' } },
    );

    useSessionUIStore.getState().setCurrentSession('session-project-b', '/projects/beta');

    await sendPromise;

    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].id).toBe('session-project-a');
    expect(sendMessageCalls[0].directory).toBe('/projects/alpha');
  });
});

describe('setCurrentSession and the one-project picker', () => {
  beforeEach(() => {
    useProjectsStore.setState({
      projects: [
        { id: 'project-alpha', path: '/projects/alpha', label: 'Alpha' },
        { id: 'project-beta', path: '/projects/beta', label: 'Beta' },
      ],
      activeProjectId: 'project-beta',
    });
    useSessionDisplayStore.setState({ singleProjectId: 'project-beta' });
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
    useDirectoryStore.setState({ currentDirectory: '/projects/alpha' });
  });

  afterEach(() => {
    useSpacesStore.getState().applyMarks([]);
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useSessionDisplayStore.setState({ singleProjectId: null });
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
  });

  test('following a session the user opened moves the picker to its project', () => {
    useSessionUIStore.getState().setCurrentSession('session-alpha', '/projects/alpha');

    expect(useSessionDisplayStore.getState().singleProjectId).toBe('project-alpha');
  });

  test('a launch restore keeps the remembered picker and still makes its project active', () => {
    useSessionUIStore.getState().setCurrentSession('session-alpha', '/projects/alpha', { keepSingleProject: true });

    expect(useProjectsStore.getState().activeProjectId).toBe('project-alpha');
    expect(useSessionDisplayStore.getState().singleProjectId).toBe('project-beta');
  });

  test.each([
    ['launch restore', true, false, 'project-beta'],
    ['user navigation', false, false, 'project-alpha'],
    ['explicitly reopening the restored session', true, true, 'project-alpha'],
  ])('late space metadata follows the picker policy after %s', (_name, keepSingleProject, reopen, expectedProject) => {
    const spaceId = 'a1b2c3d4e5f6';
    const directory = `/spaces/${spaceId}/app`;
    useSpacesStore.getState().applyMarks([]);
    useSessionUIStore.getState().setCurrentSession('session-picker-space', directory, { keepSingleProject });
    if (reopen) useSessionUIStore.getState().setCurrentSession('session-picker-space', directory);
    const unsubscribe = subscribeSpaceSessionProject(getRuntimeKey());
    try {
      useSpacesStore.getState().applyMarks([{
        id: spaceId, name: 'test-space', state: 'complete',
        projectDirectory: '/projects/alpha', directory,
      }]);
      expect(useProjectsStore.getState().activeProjectId).toBe('project-alpha');
      expect(useSessionDisplayStore.getState().singleProjectId).toBe(expectedProject);
    } finally {
      unsubscribe();
    }
  });
});

describe('routeMessage skill invocation', () => {
  // OpenCode 2.x accepts skills as prompt attachments, separately from commands.
  const sendCommandCalls = [];
  const sendMessageCalls = [];
  const liveLookupCalls = [];
  // Live, directory-scoped command discovery. Tests replace it per case.
  let liveLookup = async () => [];
  let originalSendCommand;
  let originalSendMessage;
  let originalListCommands;
  let originalLoadSkills;
  let liveSkillsLoad = async () => true;

  beforeEach(() => {
    sendCommandCalls.length = 0;
    sendMessageCalls.length = 0;
    liveLookupCalls.length = 0;
    liveLookup = async () => [];

    // Minimal optimistic + connection machinery so routeMessage can dispatch.
    const childStore = {
      getState: () => ({
        session: [],
        message: {},
        part: {},
        session_status: {},
      }),
      setState: () => {},
    };
    const childStores = {
      children: new Map(),
      ensureChild: () => childStore,
      getChild: () => childStore,
    };
    setActionRefs(childStores, () => '/skills/project');
    setOptimisticRefs(() => {}, () => {});
    useConfigStore.setState({ isConnected: true });

    // Commands and skills are resolved per directory. The commands store
    // excludes user skills, so a skill is only known to the skills store.
    useCommandsStore.setState({ commands: [], commandsByDirectory: {} });
    useSkillsStore.setState({ skills: [], skillsByDirectory: {} });

    originalSendCommand = opencodeClient.sendCommand;
    originalSendMessage = opencodeClient.sendMessage;
    originalLoadSkills = useSkillsStore.getState().loadSkills;
    liveSkillsLoad = async () => true;
    useSkillsStore.setState({ loadSkills: (directory) => liveSkillsLoad(directory) });
    originalListCommands = opencodeClient.listCommands;
    opencodeClient.listCommands = async (directory) => {
      liveLookupCalls.push(directory);
      return liveLookup(directory);
    };
    opencodeClient.sendCommand = async (params) => {
      sendCommandCalls.push(params);
      return 'msg';
    };
    opencodeClient.sendMessage = async (params) => {
      sendMessageCalls.push(params);
      return 'msg';
    };
  });

  afterEach(() => {
    opencodeClient.sendCommand = originalSendCommand;
    opencodeClient.sendMessage = originalSendMessage;
    opencodeClient.listCommands = originalListCommands;
    useSkillsStore.setState({ skills: [], skillsByDirectory: {}, loadSkills: originalLoadSkills });
    useCommandsStore.setState({ commands: [], commandsByDirectory: {} });
  });

  test('loads skills for an unloaded directory and attaches a skill found there', async () => {
    liveSkillsLoad = async (directory) => {
      useSkillsStore.setState({
        skillsByDirectory: { [directory]: [{ name: 'late-skill', path: '/skills/late-skill/SKILL.md', scope: 'project', source: 'opencode' }] },
      });
      return true;
    };

    await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/late-skill go',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(liveLookupCalls).toEqual(['/skills/project']);
    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].skills.names).toEqual(['late-skill']);
  });

  test('keeps command precedence when the live lookups find both', async () => {
    liveLookup = async () => [{ name: 'both' }];
    liveSkillsLoad = async (directory) => {
      useSkillsStore.setState({
        skillsByDirectory: { [directory]: [{ name: 'both', path: '/skills/both/SKILL.md', scope: 'project', source: 'opencode' }] },
      });
      return true;
    };

    await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/both',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(sendCommandCalls).toHaveLength(1);
    expect(sendMessageCalls).toHaveLength(0);
  });

  test('fails the send instead of sending bare text when the skills load fails', async () => {
    liveSkillsLoad = async () => false;

    await expect(routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/unknown-thing',
      providerID: 'provider-a',
      modelID: 'model-a',
    })).rejects.toThrow();
    expect(sendMessageCalls).toHaveLength(0);
  });

  test('attaches a user-installed skill without caller-provided mentions', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });

    await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toMatchObject({
      text: '/grill-with-docs',
      directory: '/skills/project',
      skills: { names: ['grill-with-docs'] },
    });
    // Without a caller builder the skill is still named if it cannot attach.
    expect(sendMessageCalls[0].skills.instructionFor(['grill-with-docs'])).toContain('$grill-with-docs');
    expect(liveLookupCalls).toEqual([]);
  });

  test('preserves trailing arguments in the skill prompt', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });

    await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs focus on auth',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].text).toBe('/grill-with-docs focus on auth');
    expect(sendMessageCalls[0].skills.names).toEqual(['grill-with-docs']);
  });

  test('merges the leading skill with inline mentions and preserves their instruction builder', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'project', source: 'agents' }] },
    });
    const instructionFor = (names) => `use: ${names.join(',')}`;
    let submissions = 0;

    const route = await routeMessage({
      runtimeKey: getRuntimeKey(),
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs and /audit',
      providerID: 'provider-a',
      modelID: 'model-a',
      delivery: 'steer',
      skills: { names: ['audit', 'grill-with-docs'], instructionFor },
      appendSubmissions: () => { submissions += 1; },
    });

    expect(route).toBe('prompt');
    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toMatchObject({
      runtimeKey: getRuntimeKey(),
      delivery: 'steer',
      skills: { names: ['grill-with-docs', 'audit'] },
    });
    expect(sendMessageCalls[0].skills.instructionFor(['audit'])).toBe('use: audit');
    expect(sendMessageCalls[0].messageId).toBeTruthy();
    expect(submissions).toBe(1);
  });

  test('prefers a cached command over a same-name skill', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'inspect', path: '/skills/inspect/SKILL.md', scope: 'project', source: 'agents' }] },
    });
    useCommandsStore.setState({
      commandsByDirectory: { '/skills/project': [{ name: 'inspect', template: 'Inspect $ARGUMENTS carefully.' }] },
    });

    const route = await routeMessage({
      sessionId: 'session-command',
      directory: '/skills/project',
      content: '/inspect auth flow',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(route).toBe('command');
    expect(sendMessageCalls).toHaveLength(0);
    expect(sendCommandCalls).toHaveLength(1);
    expect(sendCommandCalls[0]).toMatchObject({ command: 'inspect', arguments: 'auth flow' });
    expect(liveLookupCalls).toEqual([]);
  });

  test('sends a skill prompt with its quoted context', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });
    const additionalParts = [createContextPart({
      kind: 'code-comment',
      source: 'file',
      fileLabel: 'src/auth.ts',
      startLine: 4,
      endLine: 4,
      language: 'ts',
      code: 'auth();',
      text: 'check this',
    })];

    const route = await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs focus on auth',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts,
    });

    expect(route).toBe('prompt');
    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].skills.names).toEqual(['grill-with-docs']);
    expect(sendMessageCalls[0].context).toEqual([{ id: expect.stringMatching(/^msg_/), text: additionalParts[0].text, metadata: additionalParts[0].metadata }]);
  });

  describe('a command with attached context in a session with a revert', () => {
    const originalCommitRevert = opencodeClient.commitRevert;
    const commitRevertCalls = [];
    const part = () => createContextPart({
      kind: 'code-comment',
      source: 'file',
      fileLabel: 'src/auth.ts',
      startLine: 4,
      endLine: 4,
      language: 'ts',
      code: 'auth();',
      text: 'check this',
    });
    const seedSession = (session) => {
      const childStores = new ChildStoreManager();
      childStores.ensureChild('/skills/project', { bootstrap: false }).setState({ session: [session] });
      setSyncRefs({}, childStores, '/skills/project');
    };
    const sendCommandWithContext = () => routeMessage({
      sessionId: 'session-command',
      directory: '/skills/project',
      content: '/inspect auth flow',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts: [part()],
    });

    beforeEach(() => {
      commitRevertCalls.length = 0;
      opencodeClient.commitRevert = async (...args) => { commitRevertCalls.push(args); };
      useCommandsStore.setState({
        commandsByDirectory: { '/skills/project': [{ name: 'inspect', template: 'Inspect $ARGUMENTS carefully.' }] },
      });
    });

    afterEach(() => {
      opencodeClient.commitRevert = originalCommitRevert;
      setSyncRefs({}, new ChildStoreManager(), '');
    });

    test('hands sendCommand the commit of the staged revert, aimed at the session and its directory', async () => {
      seedSession({ id: 'session-command', directory: '/skills/project', revert: { messageID: 'msg_boundary' } });

      expect(await sendCommandWithContext()).toBe('command');

      await sendCommandCalls[0].commitRevert();
      expect(commitRevertCalls).toEqual([['session-command', '/skills/project']]);
    });

    test('reads the marker where the session lives when the send names another directory', async () => {
      seedSession({ id: 'session-command', directory: '/skills/project', revert: { messageID: 'msg_boundary' } });
      useCommandsStore.setState({
        commandsByDirectory: { '/skills/other': [{ name: 'inspect', template: 'Inspect $ARGUMENTS carefully.' }] },
      });

      await routeMessage({
        sessionId: 'session-command',
        directory: '/skills/other',
        content: '/inspect auth flow',
        providerID: 'provider-a',
        modelID: 'model-a',
        additionalParts: [part()],
      });

      await sendCommandCalls[0].commitRevert();
      expect(commitRevertCalls).toEqual([['session-command', '/skills/project']]);
    });

    test('hands over no commit when nothing is staged', async () => {
      seedSession({ id: 'session-command', directory: '/skills/project' });

      await sendCommandWithContext();

      expect(sendCommandCalls[0].commitRevert).toBeUndefined();
    });
  });

  test('a command with a quoted selection still runs as a command', async () => {
    // Sending "/inspect auth flow" as a prompt would skip the template OpenCode
    // 2.x expands only on the command route. The selection travels as a
    // synthetic message the client admits before the command, and any file it
    // brought rides with the command.
    useCommandsStore.setState({
      commandsByDirectory: { '/skills/project': [{ name: 'inspect', template: 'Inspect $ARGUMENTS carefully.' }] },
    });
    const contextFile = { type: 'file', mime: 'text/plain', url: 'data:text/plain,hi', filename: 'f.txt' };
    const part = createContextPart({
      kind: 'code-comment',
      source: 'file',
      fileLabel: 'src/auth.ts',
      startLine: 4,
      endLine: 4,
      language: 'ts',
      code: 'auth();',
      text: 'check this',
    });

    const route = await routeMessage({
      sessionId: 'session-command',
      directory: '/skills/project',
      content: '/inspect auth flow',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts: [{ ...part, files: [contextFile] }],
    });

    expect(route).toBe('command');
    expect(sendMessageCalls).toHaveLength(0);
    expect(sendCommandCalls).toHaveLength(1);
    expect(sendCommandCalls[0]).toMatchObject({
      id: 'session-command',
      directory: '/skills/project',
      command: 'inspect',
      arguments: 'auth flow',
      files: [contextFile],
    });
    expect(sendCommandCalls[0].context[0].metadata.openchamberContext.kind).toBe('code-comment');
  });

  test('includes attached context with the skill prompt', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });

    const route = await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs focus on auth',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts: [{ text: 'Attached context', synthetic: true }],
    });

    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].context).toEqual([{ id: expect.stringMatching(/^msg_/), text: 'Attached context', metadata: undefined }]);
    expect(route).toBe('prompt');
  });

  test('keeps primary file attachments on the skill prompt', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });
    const files = [{
      type: 'file',
      mime: 'text/plain',
      url: 'file:///projects/alpha/auth.txt',
      filename: 'auth.txt',
    }];

    const route = await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs focus on auth',
      providerID: 'provider-a',
      modelID: 'model-a',
      files,
      additionalParts: [{ text: 'Attached context', synthetic: true }],
    });

    expect(route).toBe('prompt');
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].files).toEqual(files);
    expect(sendCommandCalls).toHaveLength(0);
  });

  test('carries unmarked synthetic instructions with the skill prompt', async () => {
    useSkillsStore.setState({
      skillsByDirectory: { '/skills/project': [{ name: 'grill-with-docs', path: '/skills/grill-with-docs/SKILL.md', scope: 'user', source: 'opencode' }] },
    });
    const instructions = [{ text: 'Resolve the prepared conflict first.', synthetic: true }];

    const route = await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/grill-with-docs focus on auth',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts: instructions,
    });

    expect(route).toBe('prompt');
    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0].context[0].text).toBe(instructions[0].text);
  });

  test('an unknown slash name with context stays a prompt, context included', async () => {
    const route = await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/nothing here',
      providerID: 'provider-a',
      modelID: 'model-a',
      additionalParts: [{ text: 'quoted selection', synthetic: true }],
    });

    expect(route).toBe('prompt');
    expect(sendCommandCalls).toHaveLength(0);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toMatchObject({ text: '/nothing here', context: [{ text: 'quoted selection' }] });
  });

  test('sends an unknown slash token as a plain message after live discovery finds nothing', async () => {
    await routeMessage({
      sessionId: 'session-skill',
      directory: '/skills/project',
      content: '/not-a-real-skill',
      providerID: 'provider-a',
      modelID: 'model-a',
    });

    expect(liveLookupCalls).toEqual(['/skills/project']);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendCommandCalls).toHaveLength(0);
  });

  test('matches the command cached for the session directory without a live lookup', async () => {
    // A root project and its worktree can both define `inspect`. The command
    // must be recognised from the session's own directory; what this asserts
    // is that the match happened locally and ran as a command.
    useCommandsStore.setState({
      commandsByDirectory: {
        '/repo': [{ name: 'inspect' }],
        '/repo/worktree': [{ name: 'inspect' }],
>>>>>>> bc50ba56a
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
    useCommandsStore.setState({ commandsByDirectory: {
      '/repo': [{ commandId: 'root-inspect', name: 'inspect', description: '', content: 'Stale root $ARGUMENTS', scope: 'workspace', source: 'workspace', editable: true }],
      '/repo/worktree': [{ commandId: 'worktree-inspect', name: 'inspect', description: '', content: 'Stale worktree $ARGUMENTS', scope: 'workspace', source: 'workspace', editable: true }],
    } });
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
    const direct = buildOutgoingMessage({ ...input, queued: [], composerText: 'openchamber://session/target', composerAttachments: [] }, deps);
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
    useProjectsStore.setState({ projects: [
      { id: 'project-alpha', path: '/alpha', label: 'Alpha' },
      { id: 'project-beta', path: '/beta', label: 'Beta' },
    ], activeProjectId: 'project-alpha' });
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null,
      newSessionDraft: { draftId: 42, open: true, target: 'project', selectedProjectId: 'project-alpha', directoryOverride: '/alpha', preserveDirectoryOverride: true },
    });
    const admission = deferred();
    const started = deferred();
    let captured;
    stub(canonicalClient, 'createSession', async request => { captured = request; started.resolve(); return admission.promise; });
    const sending = send('draft message', { reasoningEffort: 'medium' }, 'high');
    await started.promise;
    useProjectsStore.setState({ activeProjectId: 'project-beta' });
    useSessionUIStore.setState({ currentSessionId: 'existing-beta', currentSessionDirectory: '/beta',
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
  test('a failed draft admission preserves the draft and never dispatches a prompt', async () => {
    const draft = { draftId: 42, open: true, target: 'project', directoryOverride: '/alpha', preserveDirectoryOverride: true };
    useSessionUIStore.setState({ currentSessionId: null, newSessionDraft: draft });
    stub(canonicalClient, 'createSession', async () => { throw new Error('offline'); });
    await expect(send()).rejects.toBeInstanceOf(Error);
    expect(useSessionUIStore.getState().newSessionDraft).toEqual(draft);
    expect(runCalls).toEqual([]);
  });
  test('a draft creation completed on an obsolete runtime never admits its prompt', async () => {
    const admission = deferred();
    const started = deferred();
    let captured;
    useSessionUIStore.setState({ currentSessionId: null,
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

<<<<<<< HEAD
describe('submit-time effort recording', () => {
  const readRecord = () => useSelectionStore.getState().getAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a');
  afterEach(() => useSelectionStore.getState().saveAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a', undefined));
  test('keeps an explicit Default instead of replacing it with inherited effort', async () => {
    useSelectionStore.getState().saveAgentModelVariantForSession('session-a', 'build', 'provider-a', 'model-a', null);
=======
describe('deleteSessions option forwarding', () => {
  let originalDeleteSession;
  let deleteSessionCalls;

  beforeEach(() => {
    deleteSessionCalls = [];
    originalDeleteSession = opencodeClient.deleteSession;
    opencodeClient.deleteSession = (sessionId) => {
      deleteSessionCalls.push(sessionId);
      return Promise.resolve(true);
    };
  });

  afterEach(() => {
    opencodeClient.deleteSession = originalDeleteSession;
  });

  // The store accepted an options object and dropped it on both the single and
  // batch delete paths. A key that cannot match the active runtime must abort
  // before any SDK call rather than deleting and erasing persisted state.
  test('honors expectedRuntimeKey on the batch delete instead of discarding options', async () => {
    const result = await useSessionUIStore.getState().deleteSessions(['session-x', 'session-y'], {
      expectedRuntimeKey: 'runtime-that-is-not-active',
    });

    expect(result).toEqual({ deletedIds: [], failedIds: ['session-x', 'session-y'] });
    expect(deleteSessionCalls).toEqual([]);
  });

  test('honors expectedRuntimeKey on the single delete instead of discarding options', async () => {
    const deleted = await useSessionUIStore.getState().deleteSession('session-x', {
      expectedRuntimeKey: 'runtime-that-is-not-active',
    });

    expect(deleted).toBe(false);
    expect(deleteSessionCalls).toEqual([]);
  });
});

describe('sendMessage effort record', () => {
  let originalSendMessage;
  let getSession;

  const SESSION = 'session-effort';
  const PROVIDER = 'provider-a';
  const MODEL = 'model-a';
  const AGENT = 'build';

  const readRecord = () => useSelectionStore
    .getState()
    .getAgentModelVariantForSession(SESSION, AGENT, PROVIDER, MODEL);

  beforeEach(() => {
    getSession = spyOn(opencodeClient, 'getSession').mockResolvedValue({ agent: AGENT });
    const childStore = {
      getState: () => ({ session: [], message: {}, part: {}, session_status: {} }),
      setState: () => {},
    };
    const childStores = {
      children: new Map(),
      ensureChild: () => childStore,
      getChild: () => childStore,
    };
    setActionRefs(childStores, () => '/current/project');
    setOptimisticRefs(() => {}, () => {});
    useConfigStore.setState({
      isConnected: true,
      currentProviderId: PROVIDER,
      currentModelId: MODEL,
      currentAgentName: AGENT,
      currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined },
    });
    useSessionUIStore.setState({
      currentSessionId: SESSION,
      currentSessionDirectory: '/current/project',
      newSessionDraft: { open: false, directoryOverride: null, parentID: null },
    });
    originalSendMessage = opencodeClient.sendMessage;
    opencodeClient.sendMessage = async () => 'msg';
  });

  afterEach(() => {
    getSession.mockRestore();
    opencodeClient.sendMessage = originalSendMessage;
    useSelectionStore.getState().saveAgentModelVariantForSession(SESSION, AGENT, PROVIDER, MODEL, undefined);
  });

  const send = (variant) => useSessionUIStore.getState().sendMessage(
    'hello', PROVIDER, MODEL, AGENT, undefined, undefined, undefined, variant, 'normal',
  );

  test('a successful send settles its captured runtime pick after a runtime switch', async () => {
    const apiBaseUrl = getRuntimeApiBaseUrl();
    const runtimeKey = getRuntimeKey();
    const selection = useSelectionStore.getState();
    selection.pickSessionModel(SESSION, PROVIDER, MODEL);
    opencodeClient.sendMessage = async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://send-other.test', runtimeKey: 'send-other' });
      selection.pickSessionModel(SESSION, PROVIDER, MODEL);
      return 'msg';
    };
    try {
      await send(undefined);
      expect(selection.getSessionModelPick(SESSION)).toEqual({ providerId: PROVIDER, modelId: MODEL });
      switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
      expect(selection.getSessionModelPick(SESSION)).toBeNull();
    } finally {
      switchRuntimeEndpoint({ apiBaseUrl, runtimeKey });
    }
  });

  test('a successful send leaves a newer pick of the same model unsent', async () => {
    const selection = useSelectionStore.getState();
    selection.pickSessionModel(SESSION, PROVIDER, MODEL);
    opencodeClient.sendMessage = async () => {
      selection.pickSessionModel(SESSION, PROVIDER, MODEL);
      return 'msg';
    };
    await send(undefined);
    expect(selection.getSessionModelPick(SESSION)).toEqual({ providerId: PROVIDER, modelId: MODEL });
    selection.clearSessionSelections(SESSION);
  });

  test('a failed send leaves its model pick unsent', async () => {
    const selection = useSelectionStore.getState();
    selection.pickSessionModel(SESSION, PROVIDER, MODEL);
    opencodeClient.sendMessage = async () => { throw new Error('send refused'); };
    await expect(send(undefined)).rejects.toThrow('send refused');
    expect(selection.getSessionModelPick(SESSION)).toEqual({ providerId: PROVIDER, modelId: MODEL });
    selection.clearSessionSelections(SESSION);
  });

  test('keeps an explicit Default across the send that follows it', async () => {
    // What the picker leaves behind: `null` recorded, and a send that carries
    // no effort because "Default" means exactly that.
    useSelectionStore.getState().saveAgentModelVariantForSession(SESSION, AGENT, PROVIDER, MODEL, null);
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======

  afterEach(() => {
    opencodeClient.getDirectoryAvailability = originalGetDirectoryAvailability;
    opencodeClient.moveSession = originalMoveSession;
    useProjectsStore.setState({ projects: originalProjects, activeProjectId: originalActiveProjectId });
    useDirectoryStore.setState(originalDirectoryState, true);
    useGlobalSessionsStore.setState(originalGlobalState, true);
    opencodeClient.setDirectory(originalClientDirectory ?? undefined);
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null, worktreeMetadata: new Map() });
  });

  test('leaves a missing worktree session in place on activation and does not probe or relocate it', async () => {
    const root = worktreeSession('root', missingWorktree);
    useGlobalSessionsStore.setState({ activeSessions: [root], archivedSessions: [] });

    useSessionUIStore.getState().setCurrentSession('root', missingWorktree);
    await settle();

    expect(probes).toEqual([]);
    expect(moves).toEqual([]);
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(missingWorktree);
    expect(useSessionUIStore.getState().getDirectoryForSession('root')).toBe(missingWorktree);
  });

  test('never probes a session that lives in its project root or in a managed chat directory', async () => {
    const chatDirectory = '/Users/tester/.config/openchamber/chats/2026-09-05/session-abc';
    useGlobalSessionsStore.setState({
      activeSessions: [worktreeSession('in-root', projectDirectory), worktreeSession('chat', chatDirectory)],
      archivedSessions: [],
    });

    useSessionUIStore.getState().setCurrentSession('in-root', projectDirectory);
    await settle();
    useSessionUIStore.getState().setCurrentSession('chat', chatDirectory);
    await settle();

    expect(probes).toEqual([]);
    expect(moves).toEqual([]);
  });
});

describe('send does not wait for session knowledge before showing the message', () => {
  let originalSendMessage;
  let originalFetch;
  let getSession;

  beforeEach(() => {
    getSession = spyOn(opencodeClient, 'getSession').mockResolvedValue({ agent: 'build' });
    originalSendMessage = opencodeClient.sendMessage;
    originalFetch = globalThis.fetch;
    useConfigStore.setState({ isConnected: true });
    useSessionGoalArmStore.getState().setArmed(false, null);
  });

  afterEach(() => {
    getSession.mockRestore();
    opencodeClient.sendMessage = originalSendMessage;
    globalThis.fetch = originalFetch;
  });

  test('inserts the user message before the knowledge write finishes, and sends the prompt after it', async () => {
    let state = { session: [], message: {}, part: {}, session_status: {} };
    const childStore = {
      getState: () => state,
      setState: (patch) => { state = { ...state, ...patch }; },
    };
    setActionRefs({ children: new Map(), ensureChild: () => childStore, getChild: () => childStore }, () => '/repo');
    const added = [];
    setOptimisticRefs((input) => { added.push(input.message); }, () => {});

    const sendCalls = [];
    opencodeClient.sendMessage = async (params) => {
      sendCalls.push(params);
      return 'msg';
    };
    let finishWrite = null;
    const writes = [];
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/api/config/settings')) {
        return Response.json({ responseStyleEnabled: true, responseStylePreset: 'concise' });
      }
      if (url.includes('/api/session-knowledge/sync')) {
        writes.push(JSON.parse(init.body));
        return new Promise((resolve) => {
          finishWrite = () => resolve(Response.json({ synced: true }));
        });
      }
      return Response.json({});
    };

    const sending = useSessionUIStore.getState().sendMessage(
      'hello',
      'provider-a',
      'model-a',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      'normal',
      { target: { runtimeKey: getRuntimeKey(), sessionId: 'session-knowledge', directory: '/repo' } },
    );
    for (let tick = 0; tick < 50 && (added.length === 0 || !finishWrite); tick += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
>>>>>>> bc50ba56a
    }
  });

<<<<<<< HEAD
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
=======
    // The bubble is already there; the prompt request waits for the write.
    expect(added.map((message) => message.role)).toEqual(['user']);
    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0])).toContain('Keep replies short.');
    expect(sendCalls).toHaveLength(0);

    finishWrite();
    await sending;

    // The knowledge lives in the session's instruction entries, never in a message.
    expect(added.map((message) => message.role)).toEqual(['user']);
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0].messageId).toBe(added[0].id);
    expect(sendCalls[0].context).toBeUndefined();
>>>>>>> bc50ba56a
  });

  test('does not send when the runtime changes during the knowledge write', async () => {
    let state = { session: [], message: {}, part: {}, session_status: {} };
    const childStore = {
      getState: () => state,
      setState: (patch) => { state = { ...state, ...patch }; },
    };
    setActionRefs({ children: new Map(), ensureChild: () => childStore, getChild: () => childStore }, () => '/repo');
    setOptimisticRefs(() => {}, () => {});

    const originalSendMessage = opencodeClient.sendMessage;
    const originalApiBaseUrl = getRuntimeApiBaseUrl();
    const originalRuntimeKey = getRuntimeKey();
    let finishKnowledge;
    const knowledgeSync = new Promise((resolve) => { finishKnowledge = resolve; });
    const sendCalls = [];
    opencodeClient.sendMessage = async (params) => {
      sendCalls.push(params);
      return 'msg';
    };

    try {
      const sending = routeMessage({
        runtimeKey: originalRuntimeKey,
        sessionId: 'session-knowledge',
        directory: '/repo',
        content: 'hello',
        providerID: 'provider-a',
        modelID: 'model-a',
        ready: knowledgeSync,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-change.invalid', runtimeKey: 'runtime-changed' });
      finishKnowledge();
      await expect(sending).rejects.toThrow('runtime changed');
      expect(sendCalls).toHaveLength(0);
    } finally {
      opencodeClient.sendMessage = originalSendMessage;
      switchRuntimeEndpoint({ apiBaseUrl: originalApiBaseUrl, runtimeKey: originalRuntimeKey });
    }
  });

  test('keeps the draft open when the runtime changes during materialisation', async () => {
    const originalCreateSession = opencodeClient.createSession;
    const originalGetSdkClient = opencodeClient.getSdkClient;
    const originalGetScopedSdkClient = opencodeClient.getScopedSdkClient;
    const originalFetch = globalThis.fetch;
    const originalApiBaseUrl = getRuntimeApiBaseUrl();
    const originalRuntimeKey = getRuntimeKey();
    const previousDraft = useSessionUIStore.getState().newSessionDraft;
    const removedSessions = [];
    switchRuntimeEndpoint({ apiBaseUrl: 'https://cleanup-owner.test', runtimeKey: originalRuntimeKey });
    opencodeClient.reconnectToRuntimeBaseUrl();
    const oldSdkClient = {};
    let currentSdkClient = oldSdkClient;
    opencodeClient.getSdkClient = () => currentSdkClient;
    opencodeClient.getScopedSdkClient = () => currentSdkClient;
    globalThis.fetch = async (input, init) => {
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (method === 'DELETE') removedSessions.push(String(input instanceof Request ? input.url : input).split('/').pop());
      return new Response(null, { status: 204 });
    };
    let finishCreate;
    opencodeClient.createSession = async () => {
      await new Promise((resolve) => { finishCreate = resolve; });
      return { id: 'session-created-on-old-runtime', directory: '/repo', metadata: {} };
    };
    useSessionUIStore.setState({
      newSessionDraft: {
        ...previousDraft,
        open: true,
        target: 'project',
        directoryOverride: '/repo',
        preserveDirectoryOverride: true,
      },
    });

    try {
      const materialising = materializeOpenDraftSession({ providerID: 'provider-a', modelID: 'model-a' }, undefined, originalRuntimeKey);
      for (let tick = 0; tick < 50 && !finishCreate; tick += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-change.invalid', runtimeKey: 'runtime-changed' });
      currentSdkClient = { session: { remove: async () => undefined } };
      finishCreate();
      await expect(materialising).rejects.toThrow('runtime changed');
      expect(useSessionUIStore.getState().newSessionDraft.open).toBe(true);
      expect(removedSessions).toEqual(['session-created-on-old-runtime']);
    } finally {
      opencodeClient.createSession = originalCreateSession;
      opencodeClient.getSdkClient = originalGetSdkClient;
      opencodeClient.getScopedSdkClient = originalGetScopedSdkClient;
      globalThis.fetch = originalFetch;
      useSessionUIStore.setState({ newSessionDraft: previousDraft });
      switchRuntimeEndpoint({ apiBaseUrl: originalApiBaseUrl, runtimeKey: originalRuntimeKey });
      opencodeClient.reconnectToRuntimeBaseUrl();
    }
  });
});

describe('setSessionDirectory and the model list', () => {
  const originalLoaded = useConfigStore.getState().providersLoaded;
  const originalProjects = useProjectsStore.getState().projects;
  const originalDirectory = useDirectoryStore.getState().currentDirectory;
  const originalClientDirectory = opencodeClient.getDirectory();

  beforeEach(() => {
    useDirectoryStore.setState({ currentDirectory: '/projects/gone' });
    useProjectsStore.setState({ projects: [{ id: 'gone', path: '/projects/gone' }, { id: 'hortai', path: '/projects/hortai' }] });
    useSessionUIStore.setState({ currentSessionId: 'session-a', currentSessionDirectory: '/projects/gone' });
  });

  afterEach(() => {
    useConfigStore.setState({ providersLoaded: originalLoaded });
    useProjectsStore.setState({ projects: originalProjects });
    useDirectoryStore.setState({ currentDirectory: originalDirectory });
    opencodeClient.setDirectory(originalClientDirectory);
    useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
  });

  test('a session that never loaded the model list takes the new folder for it', () => {
    useConfigStore.setState({ providersLoaded: false });
    useSessionUIStore.getState().setSessionDirectory('session-a', '/projects/hortai');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/projects/hortai');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/projects/hortai');
  });

  test('a loaded model list stays, and with it the model of the session', () => {
    useConfigStore.setState({ providersLoaded: true });
    useSessionUIStore.getState().setSessionDirectory('session-a', '/projects/hortai');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/projects/gone');
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/projects/hortai');
  });

  test('another session changes nothing', () => {
    useConfigStore.setState({ providersLoaded: false });
    useSessionUIStore.getState().setSessionDirectory('session-b', '/projects/hortai');
    expect(useDirectoryStore.getState().currentDirectory).toBe('/projects/gone');
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

