import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import { Window } from 'happy-dom';
import type { Agent, AgentCatalog, AgentMutationResult } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import type { CanonicalClient } from '@/api/canonicalClient';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});

// Import-time system-info probes are unrelated to the canonical agent contract.
const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }));
// Store imports read browser storage during module initialization; install happy-dom first.
const { useAgentsStore, invalidateAgentsLoadCache, selectAgentsForDirectory, selectAgentCatalogStatus } = await import('@/stores/useAgentsStore');
const { useProjectsStore } = await import('./useProjectsStore');
const { useConfigStore } = await import('./useConfigStore');
const DIRECTORY = '/workspace/project';
<<<<<<< HEAD
const OTHER_DIRECTORY = '/workspace/other';
const WORKSPACE = 'project-workspace';
const OTHER_WORKSPACE = 'other-workspace';
const agent = (name: string, agentId = name): Agent => ({
  agentId, name, description: `Profile for ${name}`, model: { providerId: 'provider', modelId: 'model' },
  allowedTools: ['read', 'edit'], systemPromptOverride: 'Stored instructions',
||||||| bc50ba56aa

type ListedAgent = {
  id: string;
  name: string;
  displayName: string;
  mode: string;
  hidden: boolean;
  request: { settings: Record<string, never>; headers: Record<string, never>; body: Record<string, never> };
  permissions: unknown[];
};

let listedAgents: ListedAgent[] = [];
// While set, a list request answers with the list as it was when the request
// arrived, but only once the gate opens: a slow read that predates a change.
let listGate: Promise<void> | null = null;
let listRequests = 0;
let agentConfigResponses = new Map<string, unknown>();
const consumedConfigLookups: string[] = [];

const pathnameOf = (url: string): string => {
  try {
    return new URL(url, 'http://localhost/').pathname;
  } catch {
    return url;
  }
};

const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const path = pathnameOf(url);
  if (path.startsWith('/api/config/agents/')) {
    const name = decodeURIComponent(path.slice('/api/config/agents/'.length));
    const payload = agentConfigResponses.get(name);
    if (payload === undefined) {
      return Response.json({ error: 'no mocked config-entity response' }, { status: 404 });
    }
    consumedConfigLookups.push(name);
    return Response.json(payload);
  }
  // The SDK's agent list request. The config-entity route above already
  // consumed its own path prefix, so the remaining /agent hit is the list.
  if (path === '/agent' || path.endsWith('/agent')) {
    listRequests += 1;
    const snapshot = listedAgents;
    if (listGate) await listGate;
    return Response.json({ data: snapshot });
  }
  // The store import chain probes location and sessions for system info;
  // well-shaped empty answers keep that background probing quiet.
  if (path.includes('/location')) {
    return Response.json({ directory: DIRECTORY, project: { directory: DIRECTORY } });
  }
  if (path.includes('/session')) {
    return Response.json({ data: [], pagination: {} });
  }
  return Response.json({ data: [] });
});

const { useAgentsStore, invalidateAgentsLoadCache, isAgentBuiltIn } = await import('@/stores/useAgentsStore');

const sdkAgent = (name: string, mode: 'primary' | 'subagent'): ListedAgent => ({
  id: name,
  name,
  displayName: name,
  mode,
  hidden: false,
  request: { settings: {}, headers: {}, body: {} },
  permissions: [],
=======

type ListedAgent = {
  id: string;
  name: string;
  displayName: string;
  mode: string;
  hidden: boolean;
  request: { settings: Record<string, never>; headers: Record<string, never>; body: Record<string, never> };
  permissions: unknown[];
};

let listedAgents: ListedAgent[] = [];
// While set, a list request answers with the list as it was when the request
// arrived, but only once the gate opens: a slow read that predates a change.
let listGate: Promise<void> | null = null;
let listRequests = 0;
let agentConfigResponses = new Map<string, unknown>();
const consumedConfigLookups: string[] = [];

const pathnameOf = (url: string): string => {
  try {
    return new URL(url, 'http://localhost/').pathname;
  } catch {
    return url;
  }
};

const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  const url = String(input instanceof Request ? input.url : input);
  const path = pathnameOf(url);
  if (path.startsWith('/api/config/agents/')) {
    const name = decodeURIComponent(path.slice('/api/config/agents/'.length));
    const payload = agentConfigResponses.get(name);
    if (payload === undefined) {
      return Response.json({ error: 'no mocked config-entity response' }, { status: 404 });
    }
    consumedConfigLookups.push(name);
    return Response.json(payload);
  }
  // The SDK's agent list request. The config-entity route above already
  // consumed its own path prefix, so the remaining /agent hit is the list.
  if (path === '/agent' || path.endsWith('/agent')) {
    listRequests += 1;
    const snapshot = listedAgents;
    if (listGate) await listGate;
    return Response.json({ data: snapshot });
  }
  // The store import chain probes location and sessions for system info;
  // well-shaped empty answers keep that background probing quiet.
  if (path.includes('/location')) {
    return Response.json({ directory: DIRECTORY, project: { directory: DIRECTORY } });
  }
  if (path.includes('/session')) {
    return Response.json({ data: [], pagination: {} });
  }
  return Response.json({ data: [] });
});

const { useAgentsStore, invalidateAgentsLoadCache, invalidateAllAgentsLoadCaches, isAgentBuiltIn } = await import('@/stores/useAgentsStore');

const sdkAgent = (name: string, mode: 'primary' | 'subagent'): ListedAgent => ({
  id: name,
  name,
  displayName: name,
  mode,
  hidden: false,
  request: { settings: {}, headers: {}, body: {} },
  permissions: [],
>>>>>>> upstream/main
});
const catalog = (agents: Agent[], revision = '1', workspaceId = WORKSPACE): AgentCatalog => ({ workspaceId, revision, agents });
const deferred = <T>() => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
};
let resolveWorkspace: Mock<CanonicalClient['resolveWorkspace']>;
let getAgents: Mock<CanonicalClient['getAgents']>;
let createAgent: Mock<CanonicalClient['createAgent']>;
let updateAgent: Mock<CanonicalClient['updateAgent']>;
let deleteAgent: Mock<CanonicalClient['deleteAgent']>;
let checkReady: Mock<CanonicalClient['checkReady']>;

beforeEach(() => {
  fetchSpy.mockReset().mockResolvedValue(Response.json({ data: [] }));
  checkReady = spyOn(canonicalClient, 'checkReady').mockResolvedValue(true);
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY }], activeProjectId: 'project' });
  useAgentsStore.getState().resetForRuntimeSwitch();
  useAgentsStore.setState({ selectedAgentName: null });
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === OTHER_DIRECTORY ? OTHER_WORKSPACE : WORKSPACE, projectId: 'project', name: directory,
  }));
  getAgents = spyOn(canonicalClient, 'getAgents').mockImplementation(async (workspaceId) => catalog([], '1', workspaceId));
  createAgent = spyOn(canonicalClient, 'createAgent').mockImplementation(async (_workspaceId, input) => ({
    revision: '2', agentId: input.agent.agentId, agent: input.agent,
  }));
  updateAgent = spyOn(canonicalClient, 'updateAgent').mockImplementation(async (_workspaceId, input) => ({
    revision: '3', agentId: input.agent.agentId, agent: input.agent,
  }));
  deleteAgent = spyOn(canonicalClient, 'deleteAgent').mockImplementation(async (_workspaceId, input) => ({
    revision: '4', agentId: input.agentId, agent: null,
  }));
});

afterEach(() => {
  checkReady.mockRestore();
  resolveWorkspace.mockRestore(); getAgents.mockRestore();
  createAgent.mockRestore(); updateAgent.mockRestore(); deleteAgent.mockRestore();
});
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });

const agents = (directory = DIRECTORY): Agent[] => selectAgentsForDirectory(useAgentsStore.getState(), directory);
const transient = () => new CanonicalApiError({
  type: 'urn:test:unavailable', title: 'Agent Service unavailable', status: 503,
  detail: 'Agent Service is starting', code: 'SERVICE_UNAVAILABLE', retryable: true,
});
const nonRetryable = (message: string) => new CanonicalApiError({
  type: 'urn:ohpichamber:problem:INVALID_REQUEST', title: 'Rejected', status: 400,
  detail: message, code: 'INVALID_REQUEST', retryable: false,
});
const settleProjectDirectory = async () => {
  // The projects store hydrates asynchronously in the browser test harness;
  // wait for that write so the recovery directory guard has a stable owner.
  await new Promise((resolve) => setTimeout(resolve, 350));
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY }], activeProjectId: 'project' });
};
const waitFor = async (predicate: () => boolean, timeoutMs = 3000) => {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) await new Promise((resolve) => setTimeout(resolve, 25));
};

describe('native agent catalogs', () => {
  test('readiness is directory-scoped and a successful empty catalog is ready', async () => {
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('loading');
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(true);
    expect(agents()).toEqual([]);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('ready');
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), OTHER_DIRECTORY)).toBe('loading');
    useAgentsStore.getState().resetForRuntimeSwitch();
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('loading');
  });

  test('a failed refresh is unavailable even with retained data, and recovery clears it', async () => {
    getAgents.mockResolvedValue(catalog([agent('retained')], '1'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    invalidateAgentsLoadCache(DIRECTORY);
    getAgents.mockRejectedValueOnce(nonRetryable('Service unavailable'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(agents()).toEqual([agent('retained')]);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), OTHER_DIRECTORY)).toBe('loading');
    getAgents.mockResolvedValue(catalog([], '2'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(true);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('ready');
    expect(agents()).toEqual([]);
  });

  test('resolves the directory and retains complete native profiles and revision', async () => {
    const profiles = [agent('build', 'stable-build-id'), agent('deploy')];
    getAgents.mockResolvedValue(catalog(profiles, '17'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(true);
    expect(resolveWorkspace).toHaveBeenCalledWith(DIRECTORY);
    expect(getAgents).toHaveBeenCalledWith(WORKSPACE);
    expect(agents()).toEqual(profiles);
    expect(useAgentsStore.getState().agents).toEqual(profiles);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('17');
    expect(useAgentsStore.getState().getAgentByName('build', DIRECTORY)).toEqual(profiles[0]);
    expect(useAgentsStore.getState().getAgentByName('stable-build-id', DIRECTORY)).toBeUndefined();
    expect(fetchSpy.mock.calls.some(([input]) => String(input instanceof Request ? input.url : input).includes('/api/config/agents/'))).toBe(false);
  });

  test('successful empty catalogs replace prior data and are cached', async () => {
    getAgents.mockResolvedValueOnce(catalog([agent('old')])).mockResolvedValue(catalog([], '2'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    invalidateAgentsLoadCache(DIRECTORY);
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(true);
    expect(agents()).toEqual([]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    expect(getAgents).toHaveBeenCalledTimes(2);
  });

  test('failed catalog reads preserve data and revision, then recover', async () => {
    const previous = agent('previous');
    getAgents.mockResolvedValue(catalog([previous], '7'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    invalidateAgentsLoadCache(DIRECTORY);
    getAgents.mockRejectedValueOnce(nonRetryable('Catalog unavailable'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    expect(agents()).toEqual([previous]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('7');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBe('Catalog unavailable');
    expect(useAgentsStore.getState().isLoading).toBe(false);
    getAgents.mockResolvedValue(catalog([agent('recovered')], '8'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(true);
    expect(agents()).toEqual([agent('recovered')]);
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBeFalsy();
  });

  test('workspace resolution failure does not request or replace a catalog', async () => {
    resolveWorkspace.mockRejectedValue(nonRetryable('Unknown workspace'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    expect(getAgents).not.toHaveBeenCalled();
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBeUndefined();
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBe('Unknown workspace');
  });

  test('an older catalog revision cannot overwrite a newer accepted profile', async () => {
    getAgents.mockResolvedValue(catalog([agent('new')], '10'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    invalidateAgentsLoadCache(DIRECTORY);
    getAgents.mockResolvedValue(catalog([agent('old')], '9'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    expect(agents()).toEqual([agent('new')]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('10');
  });
});

describe('native agent CRUD', () => {
  test('creates, updates by stable identity, and deletes using acknowledged revisions', async () => {
    const profile = agent('deploy', 'stable-id');
    expect(await useAgentsStore.getState().createAgent(profile, DIRECTORY)).toEqual({ ok: true, revision: '2' });
    expect(createAgent).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '1', agent: profile });
    expect(agents()).toEqual([profile]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
    useAgentsStore.getState().setSelectedAgent(profile.name);
    const renamed = { ...profile, name: 'release', allowedTools: ['read'], systemPromptOverride: 'New instructions' };
    expect(await useAgentsStore.getState().updateAgent(renamed, DIRECTORY)).toEqual({ ok: true, revision: '3' });
    expect(updateAgent).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '2', agent: renamed });
    expect(agents()).toEqual([renamed]);
    expect(useAgentsStore.getState().selectedAgentName).toBe('release');
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('3');
    expect(await useAgentsStore.getState().deleteAgent(profile.agentId, DIRECTORY)).toEqual({ ok: true, revision: '4' });
    expect(deleteAgent).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '3', agentId: 'stable-id' });
    expect(agents()).toEqual([]);
    expect(useAgentsStore.getState().selectedAgentName).toBeNull();
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('4');
    expect(getAgents).toHaveBeenCalledTimes(1);
  });

  test('publishes the server profile rather than the submitted draft', async () => {
    const draft = agent('draft');
    const saved = { ...draft, description: 'Server-confirmed description' };
    createAgent.mockResolvedValue({ revision: '5', agentId: draft.agentId, agent: saved });
    await useAgentsStore.getState().createAgent(draft, DIRECTORY);
    expect(agents()).toEqual([saved]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('5');
  });

  test('forwards explicit update and delete revisions instead of the cached revision', async () => {
    getAgents.mockResolvedValue(catalog([agent('profile')], '12'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    updateAgent.mockResolvedValue({ revision: '13', agentId: 'profile', agent: agent('profile') });
    await useAgentsStore.getState().updateAgent(agent('profile'), DIRECTORY, '8');
    expect(updateAgent).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '8', agent: agent('profile') });
    deleteAgent.mockResolvedValue({ revision: '14', agentId: 'profile', agent: null });
    await useAgentsStore.getState().deleteAgent('profile', DIRECTORY, '9');
    expect(deleteAgent).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '9', agentId: 'profile' });
  });

  test('failed writes preserve the catalog, revision, and selection without optimistic changes', async () => {
    const previous = agent('profile');
    getAgents.mockResolvedValue(catalog([previous], '7'));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    useAgentsStore.getState().setSelectedAgent(previous.name);
    createAgent.mockRejectedValue(new Error('Create rejected'));
    updateAgent.mockRejectedValue(new Error('Revision conflict'));
    deleteAgent.mockRejectedValue(new Error('Delete rejected'));
    expect(await useAgentsStore.getState().createAgent(agent('new'), DIRECTORY)).toEqual({ ok: false, error: 'Create rejected' });
    expect(await useAgentsStore.getState().updateAgent({ ...previous, name: 'renamed' }, DIRECTORY)).toEqual({ ok: false, error: 'Revision conflict' });
    expect(await useAgentsStore.getState().deleteAgent(previous.agentId, DIRECTORY)).toEqual({ ok: false, error: 'Delete rejected' });
    expect(agents()).toEqual([previous]);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('7');
    expect(useAgentsStore.getState().selectedAgentName).toBe('profile');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBe('Delete rejected');
  });

  test('failed initial catalog lookup prevents writes with an invented revision', async () => {
    getAgents.mockRejectedValue(nonRetryable('Catalog unavailable'));
    expect(await useAgentsStore.getState().createAgent(agent('new'), DIRECTORY)).toEqual({ ok: false, error: 'Catalog unavailable' });
    expect(createAgent).not.toHaveBeenCalled();
  });

  test('Settings CRUD stays scoped and does not replace the ambient mirror or selection', async () => {
    getAgents.mockImplementation(async (workspaceId) => catalog([agent(workspaceId === WORKSPACE ? 'ambient' : 'settings')], '1', workspaceId));
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    await useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    useAgentsStore.getState().setSelectedAgent('ambient');
    const profile = agent('settings-new');
    await useAgentsStore.getState().createAgent(profile, OTHER_DIRECTORY);
    expect(createAgent).toHaveBeenCalledWith(OTHER_WORKSPACE, { expectedRevision: '1', agent: profile });
    expect(agents(OTHER_DIRECTORY)).toEqual([agent('settings'), profile]);
    expect(useAgentsStore.getState().agents).toEqual([agent('ambient')]);
    expect(useAgentsStore.getState().selectedAgentName).toBe('ambient');
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('1');
    expect(useAgentsStore.getState().revisionsByDirectory[OTHER_DIRECTORY]).toBe('2');
  });

  test('runtime reset prevents an old mutation acknowledgement from publishing', async () => {
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    const response = deferred<AgentMutationResult>();
    const started = deferred<void>();
    createAgent.mockImplementation(async () => { started.resolve(); return response.promise; });
    const pending = useAgentsStore.getState().createAgent(agent('old-runtime'), DIRECTORY);
    await started.promise;
    useAgentsStore.getState().resetForRuntimeSwitch();
    response.resolve({ revision: '2', agentId: 'old-runtime', agent: agent('old-runtime') });
    expect(await pending).toMatchObject({ ok: false });
    expect(agents()).toEqual([]);
    expect(useAgentsStore.getState().revisionsByDirectory).toEqual({});
    expect(useAgentsStore.getState().errorsByDirectory).toEqual({});
  });
});

describe('native agent load generations', () => {
  test('a load after invalidation reads again instead of joining an older snapshot', async () => {
    const response = deferred<AgentCatalog>();
    const started = deferred<void>();
    getAgents.mockImplementationOnce(async () => { started.resolve(); return response.promise; })
      .mockResolvedValue(catalog([agent('build')], '2'));
    const first = useAgentsStore.getState().loadAgents(DIRECTORY);
    await started.promise;
    invalidateAgentsLoadCache(DIRECTORY);
    const second = useAgentsStore.getState().loadAgents(DIRECTORY);
    response.resolve(catalog([agent('build'), agent('deploy')]));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(getAgents).toHaveBeenCalledTimes(2);
    expect(agents()).toEqual([agent('build')]);
  });

  test('a load without invalidation joins the read already in flight', async () => {
    const response = deferred<AgentCatalog>();
    const started = deferred<void>();
    getAgents.mockImplementation(async () => { started.resolve(); return response.promise; });
    const first = useAgentsStore.getState().loadAgents(DIRECTORY);
    await started.promise;
    const second = useAgentsStore.getState().loadAgents(DIRECTORY);
    response.resolve(catalog([agent('build')]));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(getAgents).toHaveBeenCalledTimes(1);
    expect(agents()).toEqual([agent('build')]);
  });
});


describe('agent catalog startup recovery', () => {
  test('retries a transient startup failure once the Agent Service is ready', async () => {
    await settleProjectDirectory();
    getAgents.mockRejectedValueOnce(transient()).mockResolvedValue(catalog([agent('recovered')], '2'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');

    await waitFor(() => selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY) === 'ready');
    expect(agents()).toEqual([agent('recovered')]);
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBeFalsy();
    expect(checkReady).toHaveBeenCalled();
    expect(getAgents).toHaveBeenCalledTimes(2);
  });

  test('keeps the real error visible after the bounded recovery attempts fail', async () => {
    await settleProjectDirectory();
    getAgents.mockRejectedValue(transient());
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    await waitFor(() => getAgents.mock.calls.length >= 4, 4000);
    expect(getAgents).toHaveBeenCalledTimes(4);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toContain('Agent Service is starting');
  });

  test('a directory switch cancels recovery before the old directory is retried', async () => {
    await settleProjectDirectory();
    const readiness = deferred<boolean>();
    checkReady.mockReturnValue(readiness.promise);
    getAgents.mockRejectedValueOnce(transient());
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);

    useProjectsStore.setState({
      projects: [{ id: 'project', path: DIRECTORY }, { id: 'other', path: OTHER_DIRECTORY }],
      activeProjectId: 'other',
    });
    readiness.resolve(true);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(getAgents).toHaveBeenCalledTimes(1);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), OTHER_DIRECTORY)).toBe('loading');
  });

  test('a non-retryable ProblemDetails stays visible without retrying', async () => {
    await settleProjectDirectory();
    getAgents.mockRejectedValue(nonRetryable('Forbidden'));
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(getAgents).toHaveBeenCalledTimes(1);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toContain('Forbidden');
  });

  test('a connected transition rearms recovery after the first bounded run exhausted', async () => {
    await settleProjectDirectory();
    useConfigStore.setState({ isInitialized: true, connectionPhase: 'connected' });
    getAgents.mockRejectedValue(transient());
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);
    await waitFor(() => getAgents.mock.calls.length >= 4, 4000);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');

    getAgents.mockResolvedValue(catalog([agent('reconnected')], '5'));
    useConfigStore.setState({ connectionPhase: 'reconnecting' });
    useConfigStore.setState({ isInitialized: true, connectionPhase: 'connected' });

    await waitFor(() => selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY) === 'ready');
    expect(agents()).toEqual([agent('reconnected')]);
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBeFalsy();
  });

  test('a runtime reset during the readiness wait prevents the old catalog from publishing', async () => {
    await settleProjectDirectory();
    const readiness = deferred<boolean>();
    checkReady.mockReturnValue(readiness.promise);
    getAgents.mockRejectedValueOnce(transient());
    expect(await useAgentsStore.getState().loadAgents(DIRECTORY)).toBe(false);

    useAgentsStore.getState().resetForRuntimeSwitch();
    readiness.resolve(true);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(getAgents).toHaveBeenCalledTimes(1);
    expect(agents()).toEqual([]);
  });

  test('a configuration reload retires agent reads and the waiter reads the replacement', async () => {
    listedAgents = [sdkAgent('old-agent', 'primary')];
    let openGate = () => {};
    listGate = new Promise((resolve) => { openGate = resolve; });

    const staleLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await waitUntil(() => listRequests === 1);
    listedAgents = [sdkAgent('new-agent', 'primary')];
    invalidateAllAgentsLoadCaches();
    listGate = null;
    openGate();

    expect(await staleLoad).toBe(true);
    expect(listRequests).toBe(2);
    expect(agentNames()).toEqual(['new-agent']);
  });

  test('a caller that joined a read before a configuration reload gets the replacement list', async () => {
    listedAgents = [sdkAgent('old-agent', 'primary')];
    let openGate = () => {};
    listGate = new Promise((resolve) => { openGate = resolve; });

    const ownerLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    const joinedLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await waitUntil(() => listRequests === 1);
    listedAgents = [sdkAgent('new-agent', 'primary')];
    invalidateAllAgentsLoadCaches();
    listGate = null;
    openGate();

    expect(await ownerLoad).toBe(true);
    expect(await joinedLoad).toBe(true);
    expect(listRequests).toBe(2);
    expect(agentNames()).toEqual(['new-agent']);
  });
});
