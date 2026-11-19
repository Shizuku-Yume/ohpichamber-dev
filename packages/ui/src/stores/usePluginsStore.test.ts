<<<<<<< HEAD
import { afterAll, afterEach, beforeEach, expect, spyOn, test, type Mock } from 'bun:test';
import { Window } from 'happy-dom';
import type { ExtensionInventory, PluginCatalogState, PluginMutationResult } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import type { CanonicalClient } from '@/api/canonicalClient';
||||||| bc50ba56aa
import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
=======
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
>>>>>>> upstream/main

<<<<<<< HEAD
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
||||||| bc50ba56aa
const originalFetch = globalThis.fetch;
=======
const environment = directoryEnvironment({ home: '/workspace', fakeTimers: false });
>>>>>>> upstream/main

const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }));
const { usePluginsStore } = await import('@/stores/usePluginsStore');
const { useProjectsStore } = await import('./useProjectsStore');

<<<<<<< HEAD
const DIRECTORY = '/workspace/project';
const OTHER_DIRECTORY = '/workspace/other';
const WORKSPACE = 'workspace_one';
const OTHER_WORKSPACE = 'workspace_two';

const inventory = (count: number, label = 'provider'): ExtensionInventory => ({
  providers: [{
    id: label, displayName: label, description: '', priority: 1, capabilities: ['skill'],
    enabled: count % 2 === 0, userSourceEnabled: true, foreignUserSource: false, itemCount: count,
  }],
  items: count === 0 ? [] : [{
    id: 'extension_row', kind: 'skill', name: 'release-notes', providerId: label, providerName: label,
    scope: 'user', path: '<agent>/skills/release-notes', enabled: count % 2 !== 0, shadowed: false,
    toggleable: true, triggers: [],
  }],
  warnings: [], kinds: [{ kind: 'skill', label: 'Skills' }],
});
const catalog = (revision: string, workspaceId = WORKSPACE, count = 0): PluginCatalogState => ({
  workspaceId, revision, plugins: [], marketplace: [], localExtensions: [], workers: [],
  marketplaceSources: [], availableUpdates: [], extensions: inventory(count),
});
const mutation = (revision: string, workspaceId = WORKSPACE, count = 1): PluginMutationResult => ({
  workspaceId, revision, persistence: 'committed', status: 'no-active-workers', workers: [], catalog: catalog(revision, workspaceId, count),
});

let resolveWorkspace: Mock<CanonicalClient['resolveWorkspace']>;
let listPlugins: Mock<CanonicalClient['plugins']['list']>;
let installPlugin: Mock<CanonicalClient['plugins']['install']>;
let readInventory: Mock<CanonicalClient['extensions']['inventory']>;
let toggleExtension: Mock<CanonicalClient['extensions']['toggle']>;

beforeEach(() => {
  fetchSpy.mockReset().mockResolvedValue(Response.json({ data: [] }));
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY }], activeProjectId: 'project' });
||||||| bc50ba56aa
let activeProjectPath = '/workspace/project';

const refreshAfterOpenCodeRestartMock = mock(async () => undefined);
const startConfigUpdateMock = mock(() => undefined);
const finishConfigUpdateMock = mock(() => undefined);

mock.module('@/stores/useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ path: activeProjectPath }),
    }),
  },
}));

mock.module('@/lib/opencode/client', () => ({
  OpencodeApiError: Error,
  normalizeOpencodeError: (operation: string, error: unknown) => new Error(`${operation}: ${String(error)}`),
  opencodeClient: {
    getDirectory: () => '/fallback/project',
  },
}));

mock.module('@/stores/useAgentsStore', () => ({
  refreshAfterOpenCodeRestart: refreshAfterOpenCodeRestartMock,
}));

mock.module('@/lib/configUpdate', () => ({
  startConfigUpdate: startConfigUpdateMock,
  finishConfigUpdate: finishConfigUpdateMock,
}));

// mock.module is process-global in bun: another test file (e.g.
// useCommandsStore.test.ts) may have replaced '@/lib/runtime-fetch' with its
// own stub before this file runs. Register our own mock so this suite always
// reaches its fetch double regardless of test file ordering. Delegating to
// globalThis.fetch (instead of this file's double directly) keeps later test
// files that stub global fetch working if this registration outlives us.
mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init),
}));

const { usePluginsStore } = await import('./usePluginsStore');

const entry: PluginEntry = {
  id: 'config:user:plugin-a',
  spec: 'plugin-a',
  scope: 'user',
  kind: 'config',
  parsedKind: 'npm',
};

const file: PluginFile = {
  id: 'file:user:plugin.ts',
  fileName: 'plugin.ts',
  scope: 'user',
  kind: 'file',
};

const pluginListPayload = {
  entries: [entry],
  files: [file],
};

const okMutationPayload = {
  success: true,
  requiresReload: false,
  message: 'ok',
  reloadDelayMs: 800,
  reloadFailed: false,
};

const registryOk: RegistryResult = {
  kind: 'npm-ok',
  spec: 'plugin-a',
  name: 'plugin-a',
  currentVersion: null,
  latestVersion: '1.0.0',
  versions: ['1.0.0'],
  hasUpdate: false,
};

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const fetchCalls: FetchCall[] = [];
let queuedResponses: Response[] = [];

const handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  fetchCalls.push({ input, init });
  return queuedResponses.shift() ?? jsonResponse(pluginListPayload);
};
const fetchMock = mock(handleFetch);

const queueFetchResponses = (responses: Response[]) => {
  queuedResponses = [...responses];
};

const resetStore = () => {
=======

const entry: PluginEntry = {
  id: 'config:user:plugin-a',
  spec: 'plugin-a',
  scope: 'user',
  kind: 'config',
  parsedKind: 'npm',
};

const file: PluginFile = {
  id: 'file:user:plugin.ts',
  fileName: 'plugin.ts',
  scope: 'user',
  kind: 'file',
};

const pluginListPayload = {
  entries: [entry],
  files: [file],
};

const okMutationPayload = {
  success: true,
  requiresReload: false,
  message: 'ok',
  reloadDelayMs: 800,
  reloadFailed: false,
};

const registryOk: RegistryResult = {
  kind: 'npm-ok',
  spec: 'plugin-a',
  name: 'plugin-a',
  currentVersion: null,
  latestVersion: '1.0.0',
  versions: ['1.0.0'],
  hasUpdate: false,
};

const jsonResponse = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

type FetchCall = {
  input: RequestInfo | URL;
  init?: RequestInit;
};

const fetchCalls: FetchCall[] = [];
let queuedResponses: Response[] = [];

const handleFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  fetchCalls.push({ input, init });
  return queuedResponses.shift() ?? jsonResponse(pluginListPayload);
};
const fetchMock = mock(handleFetch);
environment.respond(async (url, init) => {
  if (url.pathname.startsWith('/api/config/plugins')) return fetchMock(`${url.pathname}${url.search}`, init);
  if (url.pathname === '/api/plugin') return Response.json({ data: [] });
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/workspace', chatsRoot: '/workspace/chats' });
  if (url.pathname === '/api/location' || url.pathname === '/api/session') return Response.json({}, { status: 401 });
  throw new Error(`Unexpected request: ${url}`);
});
const { useProjectsStore } = await import('./useProjectsStore');
const { usePluginsStore } = await import('./usePluginsStore');
const selectProject = (path: string) => {
  useProjectsStore.setState({ projects: [{ id: path, path }], activeProjectId: path });
};

const queueFetchResponses = (responses: Response[]) => {
  queuedResponses = [...responses];
};

const resetStore = () => {
>>>>>>> upstream/main
  usePluginsStore.setState({
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null,
    requestedScope: null, isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null,
  });
<<<<<<< HEAD
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => ({
    workspaceId: directory === OTHER_DIRECTORY ? OTHER_WORKSPACE : WORKSPACE, projectId: 'project', name: directory,
  }));
  listPlugins = spyOn(canonicalClient.plugins, 'list').mockImplementation(async workspaceId => catalog('1', workspaceId));
  installPlugin = spyOn(canonicalClient.plugins, 'install').mockImplementation(async workspaceId => mutation('2', workspaceId));
  readInventory = spyOn(canonicalClient.extensions, 'inventory').mockImplementation(async workspaceId => ({
    workspaceId, revision: '5', extensions: inventory(2),
  }));
  toggleExtension = spyOn(canonicalClient.extensions, 'toggle').mockImplementation(async (workspaceId, input) => ({
    workspaceId, revision: String(BigInt(input.expectedRevision) + 1n), extensions: inventory(input.enabled ? 0 : 1),
  }));
});

afterEach(() => {
  resolveWorkspace.mockRestore(); listPlugins.mockRestore(); installPlugin.mockRestore();
  readInventory.mockRestore(); toggleExtension.mockRestore();
  usePluginsStore.setState({
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null,
    requestedScope: null, isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null,
||||||| bc50ba56aa
};

const registryCalls = (): FetchCall[] => fetchCalls.filter((call) => String(call.input).includes('/api/config/plugins/registry'));

const requestBody = (callIndex: number): unknown => {
  const init = fetchCalls[callIndex]?.init;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
};

const flushPluginFollowUps = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('usePluginsStore', () => {
  beforeEach(() => {
    activeProjectPath = '/workspace/project';
    resetStore();
    fetchCalls.length = 0;
    queuedResponses = [];
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('loadPlugins calls config plugins endpoint once and populates entries/files', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    const result = await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(result).toBe(true);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(usePluginsStore.getState().entries).toEqual([entry]);
    expect(usePluginsStore.getState().files).toEqual([file]);
    expect(usePluginsStore.getState().isLoading).toBe(false);
  });

  for (const status of [200, 500]) {
    test(`stale project response (${status}) cannot replace current catalog or loading state`, async () => {
      const pending = new Map<string, (response: Response) => void>();
      fetchMock.mockImplementation((input) => new Promise<Response>((resolve) => {
        pending.set(String(input), resolve);
      }));
      const finish = (directory: string, response: Response) => {
        const resolve = pending.get(`/api/config/plugins?directory=${encodeURIComponent(directory)}`);
        if (!resolve) throw new Error('Expected pending plugin request');
        resolve(response);
      };
      try {
        activeProjectPath = '/project-a';
        const first = usePluginsStore.getState().loadPlugins({ force: true });
        activeProjectPath = '/project-b';
        const second = usePluginsStore.getState().loadPlugins({ force: true });
        finish('/project-a', jsonResponse(pluginListPayload, { status }));
        expect(await first).toBe(false);
        expect(usePluginsStore.getState().isLoading).toBe(true);
        finish('/project-b', jsonResponse({ entries: [{ ...entry, spec: 'plugin-b' }], files: [] }));
        expect(await second).toBe(true);
        expect(usePluginsStore.getState().loadedDirectory).toBe('/project-b');
        expect(usePluginsStore.getState().entries[0]?.spec).toBe('plugin-b');
        expect(usePluginsStore.getState().isLoading).toBe(false);

        activeProjectPath = '/project-a';
        const late = usePluginsStore.getState().loadPlugins({ force: true });
        activeProjectPath = '/project-b';
        const current = usePluginsStore.getState().loadPlugins({ force: true });
        finish('/project-b', jsonResponse({ entries: [{ ...entry, spec: 'current-b' }], files: [] }));
        expect(await current).toBe(true);
        finish('/project-a', jsonResponse(pluginListPayload, { status }));
        expect(await late).toBe(false);
        expect(usePluginsStore.getState().loadedDirectory).toBe('/project-b');
        expect(usePluginsStore.getState().entries[0]?.spec).toBe('current-b');
        expect(usePluginsStore.getState().isLoading).toBe(false);
      } finally {
        fetchMock.mockImplementation(handleFetch);
      }
    });

  }

  test('runtime roundtrip with the same directory reloads the owning catalog within TTL', async () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const runtimeWindow = { __OPENCHAMBER_API_BASE_URL__: 'https://runtime-a.test' };
    Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: runtimeWindow });
    try {
      queueFetchResponses([jsonResponse(pluginListPayload)]);
      await usePluginsStore.getState().loadPlugins({ force: true });
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-a.test');
      runtimeWindow.__OPENCHAMBER_API_BASE_URL__ = 'https://runtime-b.test';
      queueFetchResponses([jsonResponse({ entries: [{ ...entry, spec: 'from-b' }], files: [] })]);
      await usePluginsStore.getState().loadPlugins({ force: true });
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-b.test');
      runtimeWindow.__OPENCHAMBER_API_BASE_URL__ = 'https://runtime-a.test';
      queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);
      await usePluginsStore.getState().loadPlugins();
      await flushPluginFollowUps();
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-a.test');
      expect(usePluginsStore.getState().entries).toEqual([entry]);
      expect(fetchCalls).toHaveLength(4);
    } finally {
      if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  test('second loadPlugins within TTL reuses cached store data', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    await usePluginsStore.getState().loadPlugins();
    await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(fetchCalls).toHaveLength(2);
  });

  test('force loadPlugins bypasses TTL cache', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] }), jsonResponse(pluginListPayload)]);

    await usePluginsStore.getState().loadPlugins();
    await usePluginsStore.getState().loadPlugins({ force: true });

    expect(fetchCalls).toHaveLength(3);
  });

  test('createEntry posts spec and scope in request body', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'a', scope: 'user' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('POST');
    expect(requestBody(0)).toEqual({ spec: 'a', scope: 'user' });
  });

  test('createEntry includes options when provided', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    await usePluginsStore.getState().createEntry({ spec: 'a', options: { enabled: true }, scope: 'project' });

    expect(requestBody(0)).toEqual({ spec: 'a', options: { enabled: true }, scope: 'project' });
  });

  test('updateEntry patches entry id path', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().updateEntry('entry-id', { spec: 'b' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry/entry-id?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('PATCH');
    expect(requestBody(0)).toEqual({ spec: 'b' });
  });

  test('deleteEntry deletes entry id, invalidates cache, reloads, and clears selected id', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] }), jsonResponse(okMutationPayload), jsonResponse({ entries: [], files: [file] })]);
    await usePluginsStore.getState().loadPlugins();
    usePluginsStore.getState().setSelected(entry.id);

    const result = await usePluginsStore.getState().deleteEntry(entry.id);

    expect(result.ok).toBe(true);
    expect(fetchCalls[2]?.input).toBe(`/api/config/plugins/entry/${encodeURIComponent(entry.id)}?directory=%2Fworkspace%2Fproject`);
    expect(fetchCalls[2]?.init?.method).toBe('DELETE');
    expect(fetchCalls[3]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(usePluginsStore.getState().entries).toEqual([]);
    expect(usePluginsStore.getState().selectedId).toBeNull();
  });

  test('createFile posts file name, content, and scope', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().createFile({ fileName: 'plugin.ts', content: 'export {}', scope: 'user' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/file?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('POST');
    expect(requestBody(0)).toEqual({ fileName: 'plugin.ts', content: 'export {}', scope: 'user' });
  });

  test('failed mutation returns ok false and leaves plugins unchanged', async () => {
    usePluginsStore.setState({ entries: [entry], files: [file] });
    queueFetchResponses([jsonResponse({ error: 'boom' }, { status: 500 })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'bad', scope: 'user' });

    expect(result).toEqual({ ok: false });
    expect(usePluginsStore.getState().entries).toEqual([entry]);
    expect(usePluginsStore.getState().files).toEqual([file]);
  });

  test('a spec the server refuses comes back as invalidSpec', async () => {
    queueFetchResponses([jsonResponse({ error: 'OpenCode cannot load plugin "x y"', code: 'UNLOADABLE_SPEC' }, { status: 400 })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'x y', scope: 'user' });

    expect(result).toEqual({ ok: false, invalidSpec: true });
  });

  test('getById returns entries and files by id', () => {
    usePluginsStore.setState({ entries: [entry], files: [file] });

    expect(usePluginsStore.getState().getById(entry.id)).toEqual(entry);
    expect(usePluginsStore.getState().getById(file.id)).toEqual(file);
  });

  test('readFile fetches plugin file content', async () => {
    queueFetchResponses([jsonResponse({ fileName: 'plugin.ts', scope: 'user', content: 'export {}' })]);

    const result = await usePluginsStore.getState().readFile(file.id);

    expect(fetchCalls[0]?.input).toBe(`/api/config/plugins/file/${encodeURIComponent(file.id)}?directory=%2Fworkspace%2Fproject`);
    expect(result).toEqual({ fileName: 'plugin.ts', scope: 'user', content: 'export {}' });
  });

  test('loadRegistryInfo derives specs from entries and stores registry results', async () => {
    usePluginsStore.setState({ entries: [{ ...entry, spec: 'foo@1' }] });
    queueFetchResponses([
      jsonResponse({
        results: [{ kind: 'npm-ok', spec: 'foo@1', name: 'foo', currentVersion: '1', latestVersion: '2', hasUpdate: true, versions: ['1', '2'] }],
      }),
    ]);

    await usePluginsStore.getState().loadRegistryInfo();

    expect(String(fetchCalls[0]?.input)).toContain('specs=foo%401');
    expect(usePluginsStore.getState().registryInfo['foo@1']?.kind).toBe('npm-ok');
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadRegistryInfo force adds refresh flag', async () => {
    queueFetchResponses([jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo({ specs: ['foo@1'], force: true });

    expect(String(fetchCalls[0]?.input)).toContain('refresh=true');
  });

  test('loadRegistryInfo accepts explicit comma-joined specs', async () => {
    queueFetchResponses([jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo({ specs: ['x@1', 'y@2'] });

    expect(String(fetchCalls[0]?.input)).toContain('specs=x%401,y%402');
  });

  test('loadRegistryInfo skips empty specs and clears loading flag', async () => {
    usePluginsStore.setState({ isLoadingRegistry: true });

    const result = await usePluginsStore.getState().loadRegistryInfo({ specs: [] });

    expect(result).toBe(true);
    expect(fetchCalls).toHaveLength(0);
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadRegistryInfo reports a failed request without clearing prior registry data', async () => {
    usePluginsStore.setState({ registryInfo: { [entry.spec]: registryOk } });
    queueFetchResponses([jsonResponse({ error: 'registry unavailable' }, { status: 500 })]);

    const result = await usePluginsStore.getState().loadRegistryInfo({ specs: [entry.spec] });

    expect(result).toBe(false);
    expect(usePluginsStore.getState().registryInfo).toEqual({ [entry.spec]: registryOk });
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadPlugins success triggers registry load without blocking result', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    const result = await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(result).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(registryCalls()).toHaveLength(1);
  });

  test('createEntry success refreshes registry for new spec with force', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'new-plugin@1', scope: 'user' });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(registryCalls()).toHaveLength(1);
    expect(String(registryCalls()[0]?.input)).toContain('specs=new-plugin%401');
    expect(String(registryCalls()[0]?.input)).toContain('refresh=true');
  });

  test('updateEntry success refreshes changed spec with force', async () => {
    usePluginsStore.setState({ entries: [entry] });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateEntry(entry.id, { spec: 'plugin-b@2' });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(registryCalls()).toHaveLength(1);
    expect(String(registryCalls()[0]?.input)).toContain('specs=plugin-b%402');
    expect(String(registryCalls()[0]?.input)).toContain('refresh=true');
  });

  test('updateEntry success refreshes existing spec when spec unchanged', async () => {
    usePluginsStore.setState({ entries: [entry] });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateEntry(entry.id, { options: { enabled: true } });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(String(registryCalls()[0]?.input)).toContain('specs=plugin-a');
  });

  test('deleteEntry success removes deleted spec from registryInfo', async () => {
    usePluginsStore.setState({ entries: [entry], registryInfo: { [entry.spec]: registryOk } });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse({ entries: [], files: [] })]);

    const result = await usePluginsStore.getState().deleteEntry(entry.id);

    expect(result.ok).toBe(true);
    expect(usePluginsStore.getState().registryInfo[entry.spec]).toBe(undefined);
  });

  test('updateToLatest updates npm-ok entry to latest version', async () => {
    usePluginsStore.setState({
      entries: [{ ...entry, id: 'X', spec: 'foo@1' }],
      registryInfo: {
        'foo@1': { kind: 'npm-ok', spec: 'foo@1', name: 'foo', currentVersion: '1', latestVersion: '2', versions: ['1', '2'], hasUpdate: true },
      },
    });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateToLatest('X');

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry/X?directory=%2Fworkspace%2Fproject');
    expect(requestBody(0)).toEqual({ spec: 'foo@2' });
  });

  test('updateToLatest returns ok false when hasUpdate is false', async () => {
    usePluginsStore.setState({ entries: [entry], registryInfo: { [entry.spec]: registryOk } });

    const result = await usePluginsStore.getState().updateToLatest(entry.id);

    expect(result).toEqual({ ok: false });
    expect(fetchCalls).toHaveLength(0);
  });

  test('updateToLatest returns ok false for missing package registry result', async () => {
    usePluginsStore.setState({
      entries: [entry],
      registryInfo: { [entry.spec]: { kind: 'npm-missing-package', spec: entry.spec, name: entry.spec, error: 'missing' } },
    });

    const result = await usePluginsStore.getState().updateToLatest(entry.id);

    expect(result).toEqual({ ok: false });
    expect(fetchCalls).toHaveLength(0);
  });

  test('loadRegistryInfo chunks long spec lists into multiple registry requests', async () => {
    const entries = Array.from({ length: 50 }, (_, index): PluginEntry => ({
      ...entry,
      id: `config:user:plugin-${index}`,
      spec: `plugin-${index}-${'x'.repeat(20)}@1.0.0`,
    }));
    usePluginsStore.setState({ entries });
    queueFetchResponses([jsonResponse({ results: [] }), jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo();

    expect(registryCalls()).toHaveLength(2);
=======
};

const registryCalls = (): FetchCall[] => fetchCalls.filter((call) => String(call.input).includes('/api/config/plugins/registry'));

const requestBody = (callIndex: number): unknown => {
  const init = fetchCalls[callIndex]?.init;
  return init?.body ? JSON.parse(String(init.body)) : undefined;
};

const flushPluginFollowUps = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('usePluginsStore', () => {
  beforeEach(() => {
    selectProject('/workspace/project');
    resetStore();
    fetchCalls.length = 0;
    queuedResponses = [];
  });

  test('loadPlugins calls config plugins endpoint once and populates entries/files', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    const result = await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(result).toBe(true);
    expect(fetchCalls).toHaveLength(2);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(usePluginsStore.getState().entries).toEqual([entry]);
    expect(usePluginsStore.getState().files).toEqual([file]);
    expect(usePluginsStore.getState().isLoading).toBe(false);
  });

  for (const status of [200, 500]) {
    test(`stale project response (${status}) cannot replace current catalog or loading state`, async () => {
      const pending = new Map<string, (response: Response) => void>();
      fetchMock.mockImplementation((input) => new Promise<Response>((resolve) => {
        pending.set(String(input), resolve);
      }));
      const finish = async (directory: string, response: Response) => {
        await environment.settle();
        const resolve = pending.get(`/api/config/plugins?directory=${encodeURIComponent(directory)}`);
        if (!resolve) throw new Error('Expected pending plugin request');
        resolve(response);
      };
      try {
        selectProject('/project-a');
        const first = usePluginsStore.getState().loadPlugins({ force: true });
        selectProject('/project-b');
        const second = usePluginsStore.getState().loadPlugins({ force: true });
        await finish('/project-a', jsonResponse(pluginListPayload, { status }));
        expect(await first).toBe(false);
        expect(usePluginsStore.getState().isLoading).toBe(true);
        await finish('/project-b', jsonResponse({ entries: [{ ...entry, spec: 'plugin-b' }], files: [] }));
        expect(await second).toBe(true);
        expect(usePluginsStore.getState().loadedDirectory).toBe('/project-b');
        expect(usePluginsStore.getState().entries[0]?.spec).toBe('plugin-b');
        expect(usePluginsStore.getState().isLoading).toBe(false);

        selectProject('/project-a');
        const late = usePluginsStore.getState().loadPlugins({ force: true });
        selectProject('/project-b');
        const current = usePluginsStore.getState().loadPlugins({ force: true });
        await finish('/project-b', jsonResponse({ entries: [{ ...entry, spec: 'current-b' }], files: [] }));
        expect(await current).toBe(true);
        await finish('/project-a', jsonResponse(pluginListPayload, { status }));
        expect(await late).toBe(false);
        expect(usePluginsStore.getState().loadedDirectory).toBe('/project-b');
        expect(usePluginsStore.getState().entries[0]?.spec).toBe('current-b');
        expect(usePluginsStore.getState().isLoading).toBe(false);
      } finally {
        fetchMock.mockImplementation(handleFetch);
      }
    });

  }

  test('runtime roundtrip with the same directory reloads the owning catalog within TTL', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-a.test' });
    try {
      queueFetchResponses([jsonResponse(pluginListPayload)]);
      await usePluginsStore.getState().loadPlugins({ force: true });
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-a.test');
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-b.test' });
      queueFetchResponses([jsonResponse({ entries: [{ ...entry, spec: 'from-b' }], files: [] })]);
      await usePluginsStore.getState().loadPlugins({ force: true });
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-b.test');
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-a.test' });
      queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);
      await usePluginsStore.getState().loadPlugins();
      await flushPluginFollowUps();
      expect(usePluginsStore.getState().loadedRuntimeKey).toBe('url:https://runtime-a.test');
      expect(usePluginsStore.getState().entries).toEqual([entry]);
      expect(fetchCalls).toHaveLength(4);
    } finally {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://local.test' });
    }
  });

  test('second loadPlugins within TTL reuses cached store data', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    await usePluginsStore.getState().loadPlugins();
    await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(fetchCalls).toHaveLength(2);
  });

  test('force loadPlugins bypasses TTL cache', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] }), jsonResponse(pluginListPayload)]);

    await usePluginsStore.getState().loadPlugins();
    await usePluginsStore.getState().loadPlugins({ force: true });

    expect(fetchCalls).toHaveLength(3);
  });

  test('createEntry posts spec and scope in request body', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'a', scope: 'user' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('POST');
    expect(requestBody(0)).toEqual({ spec: 'a', scope: 'user' });
  });

  test('createEntry includes options when provided', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    await usePluginsStore.getState().createEntry({ spec: 'a', options: { enabled: true }, scope: 'project' });

    expect(requestBody(0)).toEqual({ spec: 'a', options: { enabled: true }, scope: 'project' });
  });

  test('updateEntry patches entry id path', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().updateEntry('entry-id', { spec: 'b' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry/entry-id?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('PATCH');
    expect(requestBody(0)).toEqual({ spec: 'b' });
  });

  test('deleteEntry deletes entry id, invalidates cache, reloads, and clears selected id', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] }), jsonResponse(okMutationPayload), jsonResponse({ entries: [], files: [file] })]);
    await usePluginsStore.getState().loadPlugins();
    usePluginsStore.getState().setSelected(entry.id);

    const result = await usePluginsStore.getState().deleteEntry(entry.id);

    expect(result.ok).toBe(true);
    expect(fetchCalls[2]?.input).toBe(`/api/config/plugins/entry/${encodeURIComponent(entry.id)}?directory=%2Fworkspace%2Fproject`);
    expect(fetchCalls[2]?.init?.method).toBe('DELETE');
    expect(fetchCalls[3]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(usePluginsStore.getState().entries).toEqual([]);
    expect(usePluginsStore.getState().selectedId).toBeNull();
  });

  test('createFile posts file name, content, and scope', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload)]);

    const result = await usePluginsStore.getState().createFile({ fileName: 'plugin.ts', content: 'export {}', scope: 'user' });

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/file?directory=%2Fworkspace%2Fproject');
    expect(fetchCalls[0]?.init?.method).toBe('POST');
    expect(requestBody(0)).toEqual({ fileName: 'plugin.ts', content: 'export {}', scope: 'user' });
  });

  test('failed mutation returns ok false and leaves plugins unchanged', async () => {
    usePluginsStore.setState({ entries: [entry], files: [file] });
    queueFetchResponses([jsonResponse({ error: 'boom' }, { status: 500 })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'bad', scope: 'user' });

    expect(result).toEqual({ ok: false });
    expect(usePluginsStore.getState().entries).toEqual([entry]);
    expect(usePluginsStore.getState().files).toEqual([file]);
  });

  test('a spec the server refuses comes back as invalidSpec', async () => {
    queueFetchResponses([jsonResponse({ error: 'OpenCode cannot load plugin "x y"', code: 'UNLOADABLE_SPEC' }, { status: 400 })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'x y', scope: 'user' });

    expect(result).toEqual({ ok: false, invalidSpec: true });
  });

  test('getById returns entries and files by id', () => {
    usePluginsStore.setState({ entries: [entry], files: [file] });

    expect(usePluginsStore.getState().getById(entry.id)).toEqual(entry);
    expect(usePluginsStore.getState().getById(file.id)).toEqual(file);
  });

  test('readFile fetches plugin file content', async () => {
    queueFetchResponses([jsonResponse({ fileName: 'plugin.ts', scope: 'user', content: 'export {}' })]);

    const result = await usePluginsStore.getState().readFile(file.id);

    expect(fetchCalls[0]?.input).toBe(`/api/config/plugins/file/${encodeURIComponent(file.id)}?directory=%2Fworkspace%2Fproject`);
    expect(result).toEqual({ fileName: 'plugin.ts', scope: 'user', content: 'export {}' });
  });

  test('loadRegistryInfo derives specs from entries and stores registry results', async () => {
    usePluginsStore.setState({ entries: [{ ...entry, spec: 'foo@1' }] });
    queueFetchResponses([
      jsonResponse({
        results: [{ kind: 'npm-ok', spec: 'foo@1', name: 'foo', currentVersion: '1', latestVersion: '2', hasUpdate: true, versions: ['1', '2'] }],
      }),
    ]);

    await usePluginsStore.getState().loadRegistryInfo();

    expect(String(fetchCalls[0]?.input)).toContain('specs=foo%401');
    expect(usePluginsStore.getState().registryInfo['foo@1']?.kind).toBe('npm-ok');
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadRegistryInfo force adds refresh flag', async () => {
    queueFetchResponses([jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo({ specs: ['foo@1'], force: true });

    expect(String(fetchCalls[0]?.input)).toContain('refresh=true');
  });

  test('loadRegistryInfo accepts explicit comma-joined specs', async () => {
    queueFetchResponses([jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo({ specs: ['x@1', 'y@2'] });

    expect(String(fetchCalls[0]?.input)).toContain('specs=x%401,y%402');
  });

  test('loadRegistryInfo skips empty specs and clears loading flag', async () => {
    usePluginsStore.setState({ isLoadingRegistry: true });

    const result = await usePluginsStore.getState().loadRegistryInfo({ specs: [] });

    expect(result).toBe(true);
    expect(fetchCalls).toHaveLength(0);
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadRegistryInfo reports a failed request without clearing prior registry data', async () => {
    usePluginsStore.setState({ registryInfo: { [entry.spec]: registryOk } });
    queueFetchResponses([jsonResponse({ error: 'registry unavailable' }, { status: 500 })]);

    const result = await usePluginsStore.getState().loadRegistryInfo({ specs: [entry.spec] });

    expect(result).toBe(false);
    expect(usePluginsStore.getState().registryInfo).toEqual({ [entry.spec]: registryOk });
    expect(usePluginsStore.getState().isLoadingRegistry).toBe(false);
  });

  test('loadPlugins success triggers registry load without blocking result', async () => {
    queueFetchResponses([jsonResponse(pluginListPayload), jsonResponse({ results: [registryOk] })]);

    const result = await usePluginsStore.getState().loadPlugins();
    await flushPluginFollowUps();

    expect(result).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins?directory=%2Fworkspace%2Fproject');
    expect(registryCalls()).toHaveLength(1);
  });

  test('createEntry success refreshes registry for new spec with force', async () => {
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().createEntry({ spec: 'new-plugin@1', scope: 'user' });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(registryCalls()).toHaveLength(1);
    expect(String(registryCalls()[0]?.input)).toContain('specs=new-plugin%401');
    expect(String(registryCalls()[0]?.input)).toContain('refresh=true');
  });

  test('updateEntry success refreshes changed spec with force', async () => {
    usePluginsStore.setState({ entries: [entry] });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateEntry(entry.id, { spec: 'plugin-b@2' });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(registryCalls()).toHaveLength(1);
    expect(String(registryCalls()[0]?.input)).toContain('specs=plugin-b%402');
    expect(String(registryCalls()[0]?.input)).toContain('refresh=true');
  });

  test('updateEntry success refreshes existing spec when spec unchanged', async () => {
    usePluginsStore.setState({ entries: [entry] });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateEntry(entry.id, { options: { enabled: true } });
    await flushPluginFollowUps();

    expect(result.ok).toBe(true);
    expect(String(registryCalls()[0]?.input)).toContain('specs=plugin-a');
  });

  test('deleteEntry success removes deleted spec from registryInfo', async () => {
    usePluginsStore.setState({ entries: [entry], registryInfo: { [entry.spec]: registryOk } });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse({ entries: [], files: [] })]);

    const result = await usePluginsStore.getState().deleteEntry(entry.id);

    expect(result.ok).toBe(true);
    expect(usePluginsStore.getState().registryInfo[entry.spec]).toBe(undefined);
  });

  test('updateToLatest updates npm-ok entry to latest version', async () => {
    usePluginsStore.setState({
      entries: [{ ...entry, id: 'X', spec: 'foo@1' }],
      registryInfo: {
        'foo@1': { kind: 'npm-ok', spec: 'foo@1', name: 'foo', currentVersion: '1', latestVersion: '2', versions: ['1', '2'], hasUpdate: true },
      },
    });
    queueFetchResponses([jsonResponse(okMutationPayload), jsonResponse(pluginListPayload), jsonResponse({ results: [] })]);

    const result = await usePluginsStore.getState().updateToLatest('X');

    expect(result.ok).toBe(true);
    expect(fetchCalls[0]?.input).toBe('/api/config/plugins/entry/X?directory=%2Fworkspace%2Fproject');
    expect(requestBody(0)).toEqual({ spec: 'foo@2' });
  });

  test('updateToLatest returns ok false when hasUpdate is false', async () => {
    usePluginsStore.setState({ entries: [entry], registryInfo: { [entry.spec]: registryOk } });

    const result = await usePluginsStore.getState().updateToLatest(entry.id);

    expect(result).toEqual({ ok: false });
    expect(fetchCalls).toHaveLength(0);
  });

  test('updateToLatest returns ok false for missing package registry result', async () => {
    usePluginsStore.setState({
      entries: [entry],
      registryInfo: { [entry.spec]: { kind: 'npm-missing-package', spec: entry.spec, name: entry.spec, error: 'missing' } },
    });

    const result = await usePluginsStore.getState().updateToLatest(entry.id);

    expect(result).toEqual({ ok: false });
    expect(fetchCalls).toHaveLength(0);
  });

  test('loadRegistryInfo chunks long spec lists into multiple registry requests', async () => {
    const entries = Array.from({ length: 50 }, (_, index): PluginEntry => ({
      ...entry,
      id: `config:user:plugin-${index}`,
      spec: `plugin-${index}-${'x'.repeat(20)}@1.0.0`,
    }));
    usePluginsStore.setState({ entries });
    queueFetchResponses([jsonResponse({ results: [] }), jsonResponse({ results: [] })]);

    await usePluginsStore.getState().loadRegistryInfo();

    expect(registryCalls()).toHaveLength(2);
>>>>>>> upstream/main
  });
});
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });

const load = async (directory = DIRECTORY) => {
  expect(await usePluginsStore.getState().loadPlugins({ directory })).toBe(true);
};
const state = () => usePluginsStore.getState();

test('an extension switch keeps its own revision and never rewrites the plugin catalog revision', async () => {
  await load();
  expect(state().catalog?.revision).toBe('1');
  await state().toggleExtensionProvider('provider', false);
  expect(state().extensionRevision).toBe('6');
  expect(state().catalog?.revision).toBe('1');
  expect(state().extensions?.providers[0]?.enabled).toBe(false);
  // The write read the authoritative settings revision before toggling.
  expect(readInventory).toHaveBeenCalledWith(WORKSPACE);
  expect(toggleExtension).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '5', providerId: 'provider', enabled: false });
});

test('a plugin mutation after an extension switch leaves the switched inventory intact', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  const switched = state().extensions;
  const result = await state().installPlugin({ kind: 'package', spec: 'example' });
  expect(result.revision).toBe('2');
  expect(state().catalog?.revision).toBe('2');
  // The mutation's own refresh read is stale relative to the switch, so the
  // newer settings-owned snapshot wins and the plugin revision stays separate.
  expect(state().extensions).toEqual(switched);
  expect(state().extensionRevision).toBe('6');
});

test('an extension switch after a plugin mutation keeps the bumped plugin revision', async () => {
  await load();
  await state().installPlugin({ kind: 'package', spec: 'example' });
  expect(state().catalog?.revision).toBe('2');
  await state().toggleExtensionItem('provider', 'extension_row', false);
  expect(state().catalog?.revision).toBe('2');
  expect(state().extensionRevision).toBe('6');
});

test('a forced catalog reload does not resurrect a stale embedded inventory', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  const switched = state().extensions;
  // The plugin catalog still embeds the pre-switch inventory (count 0).
  expect(await state().loadPlugins({ directory: DIRECTORY, force: true })).toBe(true);
  expect(state().extensions).toEqual(switched);
  expect(state().extensionRevision).toBe('6');
});

test('a failed settings write reports the failure and leaves the inventory untouched', async () => {
  await load();
  toggleExtension.mockImplementation(async () => {
    throw new CanonicalApiError({
      type: 'urn:ohpichamber:problem:INTERNAL_ERROR', title: 'Rejected', status: 503,
      detail: 'Native extension settings could not be persisted', code: 'SERVICE_UNAVAILABLE', retryable: true,
    });
  });
  await expect(state().toggleExtensionProvider('provider', false)).rejects.toThrow(/could not be persisted/);
  // The pre-write read is the only committed state; the failed write changed nothing.
  expect(state().extensions).toEqual(inventory(2));
  expect(state().extensionRevision).toBe('5');
  expect(state().isMutating).toBe(false);
  expect(state().error).toBeNull();
});

test('switching directories clears the inventory and refuses a queued old-scope write', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  expect(state().extensions).not.toBeNull();
  await load(OTHER_DIRECTORY);
  expect(state().catalog?.workspaceId).toBe(OTHER_WORKSPACE);
  expect(state().extensions).toEqual(catalog('1', OTHER_WORKSPACE).extensions);
  expect(state().extensionRevision).toBeNull();
  // A queued write for the previous scope is refused; a fresh write targets the new one.
  await state().toggleExtensionProvider('provider', true);
  expect(toggleExtension.mock.calls.at(-1)?.[0]).toBe(OTHER_WORKSPACE);
  expect(state().extensionRevision).toBe('6');
});
