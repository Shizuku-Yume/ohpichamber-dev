import { flushDeferredStorage } from './utils/safeStorage';
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Agent } from '@openchamber/agent-contract';
import type { DesktopSettings } from '@/lib/desktop';
import { getRuntimeKey, subscribeRuntimeEndpointChanged, switchRuntimeEndpoint } from '@/lib/runtime-switch';

const DIRECTORY = '/workspace/project';
const OTHER_DIRECTORY = '/workspace/other';
const STORAGE_KEY = 'config-store';
type TestAgent = Agent;

let storage = new Map<string, string>();
let liveProviderId = 'live';
let liveProviderIdsByDirectory = new Map<string, string>();
let liveProviderVariants: string[] | undefined;
let getProvidersCalls = 0;
let getAgentsCalls = 0;
let liveAgents: TestAgent[] = [];
let getAgentsImpl: ((directory?: string | null) => Promise<TestAgent[]>) | null = null;
let getProvidersForConfigImpl: ((directory?: string | null) => Promise<TestProviderResponse>) | null = null;
let resolvedWorkspaceDirectories: string[] = [];
let persistedOpenChamberSettings: DesktopSettings | null = {};
let settingsLoadCalls = 0;
let checkReadyImpl = async () => true;
let loadSettingsImpl: (() => Promise<DesktopSettings | null>) | null = null;
let projectsState: {
  activeProjectId: string | null;
  projects: Array<{ id: string; path: string; label: string; defaultAgent?: string }>;
} = {
  activeProjectId: 'project',
  projects: [
    { id: 'project', path: DIRECTORY, label: 'Project' },
    { id: 'other', path: OTHER_DIRECTORY, label: 'Other' },
  ],
};

const makeStorage = (): Storage => ({
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
}) as Storage;
const seedConfig = (value: string) => {
  flushDeferredStorage();
  storage.set(STORAGE_KEY, value);
};
const persistedConfig = () => {
  flushDeferredStorage();
  return storage.get(STORAGE_KEY) ?? '{}';
};

const writePersistedConfig = (value: string) => {
  flushDeferredStorage();
  storage.set(STORAGE_KEY, value);
};

const model = (providerId: string, modelId: string, variantIds?: string[]) => ({
  modelId,
  provider: providerId,
  name: modelId,
  modalities: ['text' as const],
  contextWindow: 1000,
  maxOutputTokens: 100,
  reasoningEffortSupported: false,
  reasoningOptions: [],
  variants: (variantIds ?? []).map((variant) => ({ variant, label: variant, reasoningEffort: null })),
  toolsSupported: true,
  enabled: true,
  status: 'active' as const,
  pricing: null,
});

const providerInfo = (providerId: string) => ({
  providerId,
  name: providerId,
  endpoint: null,
  protocol: null,
  authMethods: [],
  auth: { status: 'missing' as const },
});

/** A provider as the store keeps it: canonical catalog models grouped under it. */
const provider = (providerId: string, modelId = `${providerId}-model`, variantIds?: string[]) => ({
  ...providerInfo(providerId),
  models: [model(providerId, modelId, variantIds)],
});

/** A whole canonical catalog answer: two flat lists. */
const providerResponse = (
  providerId: string,
  modelId = `${providerId}-model`,
  variantIds?: string[],
  defaults: { model: { providerId: string; modelId: string } | null; thinkingLevel: string | null } = { model: null, thinkingLevel: null },
) => ({
  providers: [providerInfo(providerId)],
  models: [model(providerId, modelId, variantIds)],
  defaults,
});

let canonicalResponsePromises = new Map<string, Promise<TestProviderResponse>>();
const canonicalResponseFor = (workspaceId: string): Promise<TestProviderResponse> => {
  const existing = canonicalResponsePromises.get(workspaceId);
  if (existing) return existing;
  const directory = workspaceId.slice('workspace:'.length);
  const response = getProvidersForConfigImpl
    ? getProvidersForConfigImpl(directory)
    : Promise.resolve(providerResponse(liveProviderIdsByDirectory.get(directory) ?? liveProviderId, `${liveProviderIdsByDirectory.get(directory) ?? liveProviderId}-model`, liveProviderVariants));
  canonicalResponsePromises.set(workspaceId, response);
  return response;
};
type TestProviderResponse = {
  providers: ReturnType<typeof providerInfo>[];
  models: ReturnType<typeof model>[];
  defaults?: { model: { providerId: string; modelId: string } | null; thinkingLevel: string | null };
};

const testAgent = (agentId: string, options: Partial<Agent> = {}): Agent => ({
  agentId, name: agentId, description: '', model: null, allowedTools: [], ...options,
});

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const settle = async () => {
  for (let step = 0; step < 40; step += 1) await Promise.resolve();
};

let directoryAvailability: 'available' | 'missing' | 'unknown' = 'available';

mock.module('@/lib/host-filesystem', () => ({
  hostFilesystem: {
    setDirectory: mock(() => undefined),
    getDirectory: mock(() => DIRECTORY),
    getFilesystemHome: async () => '/workspace',
    getSystemInfo: async () => ({ homeDirectory: '/workspace' }),
    getDirectoryAvailability: mock(async () => directoryAvailability),
  },
}));

class TestCanonicalApiError extends Error {
  readonly problem: { status: number };
  constructor(problem: { status: number; detail?: string }) {
    super(problem.detail ?? 'Canonical API error');
    this.name = 'CanonicalApiError';
    this.problem = problem;
  }
}

mock.module('@/api/canonicalClient', () => ({
  CanonicalApiError: TestCanonicalApiError,
  canonicalClient: {
    checkReady: mock(() => checkReadyImpl()),
    resolveWorkspace: mock(async (directory: string) => {
      resolvedWorkspaceDirectories.push(directory);
      return { workspaceId: `workspace:${directory}`, projectId: 'project', name: 'Workspace' };
    }),
    getProviders: mock(async (workspaceId: string) => {
      getProvidersCalls += 1;
      const response = await canonicalResponseFor(workspaceId);
      return {
        workspaceId,
        revision: '0',
        providers: response.providers,
      };
    }),
    getAgents: mock(async (workspaceId: string) => {
      getAgentsCalls += 1;
      const directory = workspaceId.slice('workspace:'.length);
      const agents = getAgentsImpl ? await getAgentsImpl(directory) : liveAgents;
      return { workspaceId, revision: String(getAgentsCalls), agents };
    }),
    getModels: mock(async (workspaceId: string) => {
      getProvidersCalls += 1;
      const responsePromise = canonicalResponseFor(workspaceId);
      canonicalResponsePromises.delete(workspaceId);
      const response = await responsePromise;
      return {
        workspaceId,
        revision: '0',
        models: response.models,
        defaults: response.defaults ?? { model: null, thinkingLevel: null },
      };
    }),
  },
}));

mock.module('@/contexts/runtimeAPIRegistry', () => ({
  getRegisteredRuntimeAPIs: mock(() => null),
}));

const runtimeFetchModule = await import('@/lib/runtime-fetch');
mock.module('@/lib/runtime-fetch', () => ({
  ...runtimeFetchModule,
  runtimeFetch: mock(async () => new Response(JSON.stringify({}), {
    headers: { 'Content-Type': 'application/json' },
  })),
}));

mock.module('@/lib/persistence', () => ({
  invalidateSettingsCache: mock(() => undefined),
  updateDesktopSettings: mock(async () => ({ ok: true })),
  reportSettingsSaveState: () => undefined,
  // The store reads the shared document through this; an empty document
  // keeps every OpenChamber default unset, like the settings route used to.
  loadDesktopSettings: mock(async () => {
    settingsLoadCalls += 1;
    return loadSettingsImpl ? loadSettingsImpl() : persistedOpenChamberSettings;
  }),
}));

mock.module('@/lib/startupTrace', () => ({
  markStartupTrace: mock(() => undefined),
  measureStartupTrace: mock(async (_name: string, callback: () => Promise<unknown>) => callback()),
}));

// Runtime-generation guards subscribe at module load. Use real event delivery
// so A -> B -> A exercises the lifecycle, not just unequal runtime strings.
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: Object.assign(new EventTarget(), { location: new URL('https://config-tests.example') }),
});
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: makeStorage() });
Object.defineProperty(window, 'localStorage', { configurable: true, value: makeStorage() });
const { useProjectsStore } = await import('./useProjectsStore');
const { emitConfigChange } = await import('@/lib/configSync');
const { invalidateSettingsCache } = await import('@/lib/persistence');

const {
  useConfigStore,
  selectCatalogLoadedForDirectory,
  selectKnownCatalogModel,
  selectProvidersForDirectory,
  invalidateOpenChamberDefaultsCache,
} = await import('./useConfigStore');
const { invalidateConfigCatalogsForReload } = await import('./config/catalogLifecycle');
const { useSelectionStore } = await import('@/sync/selection-store');
const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useRoutingStore } = await import('@/stores/useRoutingStore');
const { useUIStore } = await import('@/stores/useUIStore');
let testRuntime = 0;

test('configuration subscriptions stay singleton when setup is called again', async () => {
  const { subscribeConfigRuntimeChanges, subscribeConfigStoreChanges } = await import('./config/subscriptions');
  const { configRuntime } = await import('./config/runtime');
  const { useDirectoryStore } = await import('./useDirectoryStore');
  const configSync = await import('@/lib/configSync');
  const subscriptions = [
    spyOn(configSync, 'subscribeToConfigChanges'),
    spyOn(useDirectoryStore, 'subscribe'),
    spyOn(useRoutingStore, 'subscribe'),
    spyOn(useUIStore, 'subscribe'),
    spyOn(useConfigStore, 'subscribe'),
  ];
  try {
    const registrationCounts = subscriptions.map((subscription) => subscription.mock.calls.length);
    subscribeConfigStoreChanges();
    subscribeConfigStoreChanges();
    for (const [index, subscription] of subscriptions.entries()) {
      expect(subscription.mock.calls.length).toBe(registrationCounts[index]);
    }
  } finally {
    for (const subscription of subscriptions) subscription.mockRestore();
  }
  subscribeConfigRuntimeChanges();
  subscribeConfigRuntimeChanges();
  const generation = configRuntime.generation;
  switchRuntimeEndpoint({ apiBaseUrl: 'https://singleton.example', runtimeKey: 'singleton' });
  expect(configRuntime.generation).toBe(generation + 1);
});

// Import after boundary mocks so native catalog requests use this test host.
const { useAgentsStore, selectAgentsForDirectory, selectAgentCatalogStatus, invalidateAgentsLoadCache } = await import('./useAgentsStore');

subscribeRuntimeEndpointChanged(() => useAgentsStore.getState().resetForRuntimeSwitch());

const seedAgentCatalog = (agents: Agent[], directory = DIRECTORY) => {
  useAgentsStore.setState((state) => ({
    agentsByDirectory: { ...state.agentsByDirectory, [directory]: agents },
    revisionsByDirectory: { ...state.revisionsByDirectory, [directory]: '1' },
    errorsByDirectory: { ...state.errorsByDirectory, [directory]: '' },
  }));
};

// Drive the two independent owners together, as directory bootstrap does.
const refreshComposerCatalog = async (directory = DIRECTORY): Promise<boolean> => {
  const defaults = useConfigStore.getState().loadSessionDefaults();
  invalidateAgentsLoadCache(directory);
  const loaded = await useAgentsStore.getState().loadAgents(directory);
  await defaults;
  return loaded;
};

describe('useConfigStore provider persistence', () => {
  beforeEach(async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://config-tests.example', runtimeKey: `config-test-${++testRuntime}` });
    await settle();
    flushDeferredStorage();
    invalidateSettingsCache();
    storage = new Map<string, string>();
    useAgentsStore.getState().resetForRuntimeSwitch();
    projectsState = {
      activeProjectId: 'project',
      projects: [
        { id: 'project', path: DIRECTORY, label: 'Project' },
        { id: 'other', path: OTHER_DIRECTORY, label: 'Other' },
      ],
    };
    useProjectsStore.setState(projectsState);
    canonicalResponsePromises.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: makeStorage(),
    });
    liveProviderId = 'live';
    liveProviderIdsByDirectory = new Map<string, string>();
    liveProviderVariants = undefined;
    getProvidersCalls = 0;
    canonicalResponsePromises = new Map<string, Promise<TestProviderResponse>>();
    getAgentsCalls = 0;
    resolvedWorkspaceDirectories = [];
    liveAgents = [];
    getAgentsImpl = null;
    getProvidersForConfigImpl = null;
    persistedOpenChamberSettings = {};
    settingsLoadCalls = 0;
    checkReadyImpl = async () => true;
    loadSettingsImpl = null;
    useSelectionStore.setState({
      sessionModelSelections: new Map(),
      sessionAgentSelections: new Map(),
      sessionAgentModelSelections: new Map(),
      lastUsedProvider: null,
    });
    useSessionUIStore.setState({ currentSessionId: null, availableWorktreesByProject: new Map() });
    useUIStore.setState({ hiddenModels: [], lastSelectedModel: undefined });
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      directoryScoped: {},
      providers: [],
      providersLoaded: false,
      currentReasoningEffort: undefined,

      defaultProviders: {},
      currentProviderId: '',
      currentModelId: '',
      currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined },
      selectedProviderId: '',
      currentAgentName: undefined,
      settingsDefaultModel: undefined,
      settingsDefaultReasoningEffort: undefined,

      agentModelSelections: {},

      settingsDefaultsLoaded: true,
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
      isConnected: true,
      isInitialized: false,
      lastInitFailure: null,
    });
    invalidateOpenChamberDefaultsCache();
  });

  test('provider and agent discovery gaps preserve a manual model and effort', async () => {
    useConfigStore.setState({
      currentProviderId: 'temporarily-missing',
      currentModelId: 'chosen-model',
      currentVariant: 'high',
      currentVariantSelection: { override: 'high', inherited: undefined },
      currentAgentName: 'build',
      selectionSource: 'manual',
    });
    liveAgents = [testAgent('build')];
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState().currentProviderId).toBe('temporarily-missing');
    await refreshComposerCatalog(DIRECTORY);
    expect(useConfigStore.getState().currentModelId).toBe('chosen-model');
    expect(useConfigStore.getState().currentVariant).toBe('high');
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
  });

  test('resolves the workspace and merges canonical providers with enabled models', async () => {
    getProvidersForConfigImpl = async () => ({
      providers: [providerInfo('alpha'), providerInfo('beta')],
      models: [model('alpha', 'first'), { ...model('alpha', 'disabled'), enabled: false }, model('beta', 'second')],
    });

    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });

    expect(resolvedWorkspaceDirectories).toEqual([DIRECTORY]);
    expect(useConfigStore.getState().providers.map((entry) => ({
      providerId: entry.providerId,
      models: entry.models.map((item) => item.modelId),
      canonicalAuth: entry.canonicalAuth,
    }))).toEqual([
      { providerId: 'alpha', models: ['first'], canonicalAuth: { status: 'missing' } },
      { providerId: 'beta', models: ['second'], canonicalAuth: { status: 'missing' } },
    ]);
  });

  test('worktree catalog uses its own directory and retains its manual model across switches', async () => {
    const worktree = '/workspace/project-catalog-worktree';
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map([[DIRECTORY, [{
        path: worktree,
        projectDirectory: DIRECTORY,
        branch: 'catalog',
        label: 'catalog',
      }]]]),
    });
    liveProviderIdsByDirectory.set(DIRECTORY, 'root');
    liveProviderIdsByDirectory.set(worktree, 'worktree');
    const requested: Array<string | null | undefined> = [];
    const agentRequests: Array<string | null | undefined> = [];
    getAgentsImpl = async (directory) => {
      agentRequests.push(directory);
      return [testAgent(directory === worktree ? 'worktree-agent' : 'root-agent')];
    };
    getProvidersForConfigImpl = async (directory) => {
      requested.push(directory);
      const id = liveProviderIdsByDirectory.get(directory ?? '') ?? 'unexpected';
      return providerResponse(id, `${id}-model`);
    };

    await useConfigStore.getState().activateDirectory(worktree);
    let state = useConfigStore.getState();
    expect(requested).toEqual([worktree]);
    expect(agentRequests).toEqual([worktree]);
    expect(state.activeDirectoryKey).toBe(worktree);
    expect(state.providers[0]?.models[0]?.modelId).toBe('worktree-model');
    expect(selectAgentsForDirectory(useAgentsStore.getState(), worktree)[0]?.name).toBe('worktree-agent');
    expect(state.directoryScoped[DIRECTORY]?.providers ?? []).toEqual([]);

    useConfigStore.setState({
      currentProviderId: 'worktree',
      currentModelId: 'worktree-model',
      selectionSource: 'manual',
      directoryScoped: {
        ...state.directoryScoped,
        [worktree]: {
          ...state.directoryScoped[worktree],
          currentProviderId: 'worktree',
          currentModelId: 'worktree-model',
          selectionSource: 'manual',
        },
      },
    });
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    state = useConfigStore.getState();
    expect(requested).toEqual([worktree, DIRECTORY]);
    expect(agentRequests).toEqual([worktree, DIRECTORY]);
    expect(state.providers[0]?.models[0]?.modelId).toBe('root-model');
    expect(state.directoryScoped[worktree]?.currentModelId).toBe('worktree-model');

    await useConfigStore.getState().activateDirectory(worktree);
    state = useConfigStore.getState();
    expect(state.providers[0]?.models[0]?.modelId).toBe('worktree-model');
    expect(state.currentModelId).toBe('worktree-model');
    expect(state.selectionSource).toBe('manual');
  });

  test('switching to a fresh cached directory still resolves its workspace', async () => {
    liveProviderIdsByDirectory.set(DIRECTORY, 'root');
    liveProviderIdsByDirectory.set(OTHER_DIRECTORY, 'other');

    await useConfigStore.getState().activateDirectory(OTHER_DIRECTORY);
    expect(useConfigStore.getState().workspaceId).toBe(`workspace:${OTHER_DIRECTORY}`);
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    expect(useConfigStore.getState().workspaceId).toBe(`workspace:${DIRECTORY}`);

    const resolvesBefore = resolvedWorkspaceDirectories.length;
    await useConfigStore.getState().activateDirectory(OTHER_DIRECTORY);
    expect(useConfigStore.getState().workspaceId).toBe(`workspace:${OTHER_DIRECTORY}`);
    expect(resolvedWorkspaceDirectories.slice(resolvesBefore)).toContain(OTHER_DIRECTORY);
  });

  for (const cached of [false, true]) for (const override of ['high', null]) {
    test(`manual draft model and ${override ?? 'Default'} thinking survive switching to a ${cached ? 'cached' : 'new'} worktree`, async () => {
      const worktree = '/workspace/manual-model-worktree';
      useSessionUIStore.setState({
        availableWorktreesByProject: new Map([[DIRECTORY, [{
          path: worktree,
          projectDirectory: DIRECTORY,
          branch: 'manual',
          label: 'manual',
        }]]]),
      });
      getProvidersForConfigImpl = async () => ({
        providers: [providerInfo('shared')],
        models: [model('shared', 'A', ['low']), model('shared', 'B', ['low', 'high'])],
      });

      if (cached) {
        await useConfigStore.getState().activateDirectory(worktree);
        expect(useConfigStore.getState().currentModelId).toBe('A');
        useConfigStore.getState().setCurrentVariantOverride('low', 'low');
      }
      await useConfigStore.getState().activateDirectory(DIRECTORY);
      useConfigStore.getState().setModel('B');
      useConfigStore.getState().setCurrentVariantOverride(override, 'high');
      expect(useConfigStore.getState().selectionSource).toBe('manual');

      await useConfigStore.getState().activateDirectory(worktree, { preserveManualModel: true });
      const state = useConfigStore.getState();
      expect(state.activeDirectoryKey).toBe(worktree);
      expect(state.providers[0]?.models.map((entry) => entry.modelId)).toEqual(['A', 'B']);
      expect(state.currentModelId).toBe('B');
      expect(state.selectionSource).toBe('manual');
      expect(state.directoryScoped[worktree]?.currentModelId).toBe('B');
      expect(state.currentVariant).toBe(override ?? undefined);
      expect(state.currentVariantSelection).toEqual({ override, inherited: 'high' });
      expect(state.directoryScoped[worktree]?.currentVariant).toBe(override ?? undefined);
      expect(state.directoryScoped[worktree]?.currentVariantSelection).toEqual({ override, inherited: 'high' });
    });
  }

  for (const cached of [false, true]) for (const starting of [false, true]) {
    test(`thinking picked with the automatic model survives switching to a ${cached ? 'cached' : 'new'} ${starting ? 'starting' : 'ready'} worktree`, async () => {
      const worktree = '/workspace/effort-worktree';
      const fullCatalog = providerResponse('shared', 'B', undefined, {
        model: { providerId: 'shared', modelId: 'B' }, thinkingLevel: 'low',
      });
      let worktreeStarting = false;
      getProvidersForConfigImpl = async (directory) => (
        directory === worktree && worktreeStarting
          ? providerResponse('shared', 'B')
          : fullCatalog
      );

      if (cached) await useConfigStore.getState().activateDirectory(worktree);
      await useConfigStore.getState().activateDirectory(DIRECTORY);
      expect(useConfigStore.getState()).toMatchObject({ currentModelId: 'B', selectionSource: 'auto' });
      useConfigStore.getState().setCurrentReasoningEffort('high');

      worktreeStarting = starting;
      await useConfigStore.getState().activateDirectory(worktree, { preserveManualModel: true });
      await useConfigStore.getState().loadProviders({ directory: worktree, source: 'test:effort' });

      const state = useConfigStore.getState();
      expect(state.activeDirectoryKey).toBe(worktree);
      expect(state.currentModelId).toBe('B');
      // The composer's explicit effort survives a directory switch; OMP's
      // configured default is a separate value and did not become a choice.
      expect(state.currentReasoningEffort).toBe('high');
    });
  }

  test('a picked effort is what an agent load leaves for the send', async () => {
    liveAgents = [testAgent('build')];
    getProvidersForConfigImpl = async () => providerResponse('shared', 'B', undefined, {
      model: { providerId: 'shared', modelId: 'B' }, thinkingLevel: 'low',
    });
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    expect(useConfigStore.getState()).toMatchObject({ currentModelId: 'B', currentReasoningEffort: undefined });

    useConfigStore.getState().setCurrentReasoningEffort('high');
    await refreshComposerCatalog(DIRECTORY);

    const state = useConfigStore.getState();
    expect(state.currentReasoningEffort).toBe('high');
    expect(state.settingsDefaultReasoningEffort).toBe('low');
  });

  test('a directory absent from project discovery still loads its own catalog', async () => {
    const directory = '/workspace/new-worktree';
    getProvidersForConfigImpl = async (requested) => {
      expect(requested).toBe(directory);
      return providerResponse('new', 'new-model');
    };
    await useConfigStore.getState().activateDirectory(directory);
    expect(useConfigStore.getState().activeDirectoryKey).toBe(directory);
    expect(useConfigStore.getState().providers[0]?.models[0]?.modelId).toBe('new-model');
  });

  test('worktree does not apply a parent project agent default to the composer', async () => {
    const worktree = '/workspace/project-default-worktree';
    useSessionUIStore.setState({
      availableWorktreesByProject: new Map([[DIRECTORY, [{
        path: worktree,
        projectDirectory: DIRECTORY,
        branch: 'default',
        label: 'default',
      }]]]),
    });
    projectsState.projects[0] = { ...projectsState.projects[0], defaultAgent: 'review' };
    liveAgents = [testAgent('build'), testAgent('review')];

    await useConfigStore.getState().activateDirectory(worktree);

    expect(useConfigStore.getState().activeDirectoryKey).toBe(worktree);
    expect(useConfigStore.getState().currentAgentName).toBeUndefined();
  });

  test('directory restoration retains an explicit Default effort', async () => {
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers: [provider('live')], providersLoaded: true });
    useConfigStore.getState().setCurrentVariantOverride(null, 'high');
    expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentVariantSelection).toEqual({ override: null, inherited: 'high' });
    useConfigStore.setState({ activeDirectoryKey: OTHER_DIRECTORY });
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
    expect(useConfigStore.getState().currentVariant).toBeUndefined();
  });

  test('hydrates a legacy blob with catalogs for instant paint, refreshes to live data, then writes it slim', async () => {
    seedConfig(JSON.stringify({
      state: {
        configRuntimeKey: getRuntimeKey(),
        activeDirectoryKey: DIRECTORY,
        directoryScoped: {
          [DIRECTORY]: {
            models: [],
            providers: [provider('stale')],
            agents: [testAgent('build')],
            currentProviderId: 'stale',
            currentModelId: 'stale-model',
            currentAgentName: 'build',
            selectedProviderId: 'stale',
            agentModelSelections: { build: { providerId: 'stale', modelId: 'stale-model' } },
            defaultProviders: { default: 'stale' },
          },
          [OTHER_DIRECTORY]: {
            models: [],
            providers: [provider('other-stale')],
            agents: [testAgent('review')],
            currentProviderId: 'other-stale',
            currentModelId: 'other-stale-model',
            currentAgentName: 'review',
            selectedProviderId: 'other-stale',
            agentModelSelections: {},
            defaultProviders: { default: 'other-stale' },
          },
        },
        currentProviderId: 'stale',
        currentModelId: 'stale-model',
        selectedProviderId: 'stale',
        defaultProviders: { default: 'stale' },
      },
      version: 0,
    }));

    await useConfigStore.persist.rehydrate();

    // A blob from before the slim format still carries catalogs; they are
    // hydrated as-is so the pickers paint instantly on that first cold start.
    const hydrated = useConfigStore.getState();
    expect(hydrated.providers.map((entry) => entry.providerId)).toEqual(['stale']);
    expect(hydrated.defaultProviders).toEqual({ default: 'stale' });
    expect(hydrated.directoryScoped[DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['stale']);
    expect(hydrated.directoryScoped[DIRECTORY]?.defaultProviders).toEqual({ default: 'stale' });
    expect(hydrated.directoryScoped[DIRECTORY]).not.toHaveProperty('agents');
    expect(hydrated.directoryScoped[DIRECTORY]?.currentAgentName).toBe('build');
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['other-stale']);

    liveProviderId = 'fresh';
    await hydrated.initializeApp();

    const reloaded = useConfigStore.getState();
    expect(getProvidersCalls).toBe(2);
    expect(reloaded.providers.map((entry) => entry.providerId)).toEqual(['fresh']);
    expect(reloaded.directoryScoped[DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['fresh']);
    expect(reloaded.currentProviderId).toBe('fresh');
    expect(reloaded.currentModelId).toBe('fresh-model');

    const rewritten = JSON.parse(persistedConfig());
    expect(rewritten.version).toBe(1);
    expect(rewritten.state.providers).toBeUndefined();
    expect(rewritten.state.directoryScoped[DIRECTORY].providers).toBeUndefined();
    expect(rewritten.state.directoryScoped[OTHER_DIRECTORY].agents).toBeUndefined();
    expect(rewritten.state.directoryScoped[DIRECTORY].currentModelId).toBe('fresh-model');
  });

  test('a synchronous localStorage catalog paints the picker before the live read resolves', async () => {
    const { writeLocalCatalogSnapshot } = await import('./configCatalogCache');
    writeLocalCatalogSnapshot(getRuntimeKey(), DIRECTORY, {
      providers: [{
        ...providerInfo('cached-fast'),
        models: [model('cached-fast', 'cached-fast-model')],
      }],
    });
    // The live answer stays pending until this test releases it.
    canonicalResponsePromises = new Map();
    const live = deferred<void>();
    getProvidersForConfigImpl = async (directory) => {
      await live.promise;
      return providerResponse(liveProviderIdsByDirectory.get(directory ?? '') ?? 'fresh');
    };
    // Activate from a different directory so the target has no in-memory catalog.
    useConfigStore.setState({ activeDirectoryKey: OTHER_DIRECTORY });
    const activating = useConfigStore.getState().activateDirectory(DIRECTORY);
    // Before the live request answers, the cached catalog is already on screen.
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['cached-fast']);
    expect(useConfigStore.getState().providersLoaded).toBe(true);
    live.resolve(undefined);
    await activating;
    // The authoritative answer replaces the cache.
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['fresh']);
  });

  test('a persisted selection whose directory differs from the boot directory paints from the synchronous mirror on merge', async () => {
    const { writeLocalCatalogSnapshot } = await import('./configCatalogCache');
    // The boot directory key here is DIRECTORY (host filesystem); the user left
    // in OTHER_DIRECTORY, which the slim persisted blob still names.
    writeLocalCatalogSnapshot(getRuntimeKey(), OTHER_DIRECTORY, {
      providers: [{
        ...providerInfo('cached-merged'),
        models: [model('cached-merged', 'cached-merged-model')],
      }],
    });
    writePersistedConfig(JSON.stringify({
      state: {
        configRuntimeKey: getRuntimeKey(),
        activeDirectoryKey: OTHER_DIRECTORY,
        directoryScoped: {
          [OTHER_DIRECTORY]: {
            models: [],
            currentProviderId: 'cached-merged',
            currentModelId: 'cached-merged-model',
            currentAgentName: undefined,
            selectedProviderId: 'cached-merged',
            agentModelSelections: {},
            defaultProviders: {},
          },
        },
        currentProviderId: 'cached-merged',
        currentModelId: 'cached-merged-model',
        selectedProviderId: 'cached-merged',
        defaultProviders: {},
      },
      version: 1,
    }));
    // Publishes the merged state without awaiting any live read.
    await useConfigStore.persist.rehydrate();
    const merged = useConfigStore.getState();
    expect(merged.activeDirectoryKey).toBe(OTHER_DIRECTORY);
    expect(merged.providers.map((entry) => entry.providerId)).toEqual(['cached-merged']);
    expect(merged.providersLoaded).toBe(true);
    expect(merged.directoryScoped[OTHER_DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['cached-merged']);
    expect(merged.directoryScoped[OTHER_DIRECTORY]?.providersLoaded).toBe(true);
    expect(getProvidersCalls).toBe(0);
    // A live answer still replaces the mirror.
    liveProviderId = 'fresh-merged';
    await merged.initializeApp();
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['fresh-merged']);
  });

  test('a malformed or foreign synchronous snapshot paints nothing', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        ...makeStorage(),
        getItem: (key: string) => (key.startsWith('openchamber-config-catalog:') ? '{"providers": [{"providerId": 7}]}' : (storage.get(key) ?? null)),
      },
    });
    const initializing = useConfigStore.getState().initializeApp();
    expect(useConfigStore.getState().providers).toEqual([]);
    await initializing;
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['live']);
  });

  test('an upgraded cache with keyed variants cannot break model selection', async () => {
    const inactiveLegacyDirectory = '/workspace/inactive-legacy';
    const legacyProvider = {
      ...provider('legacy', 'legacy-model'),
      models: [{ ...model('legacy', 'legacy-model'), variants: { high: {} } }],
    };
    const validProvider = provider('valid', 'valid-model', ['low']);
    seedConfig(JSON.stringify({
      state: {
        configRuntimeKey: getRuntimeKey(),
        activeDirectoryKey: DIRECTORY,
        providers: [legacyProvider],
        agents: [testAgent('build')],
        currentProviderId: 'legacy',
        currentModelId: 'legacy-model',
        currentVariant: 'high',
        settingsDefaultModel: 'legacy/legacy-model',
        directoryScoped: {
          [DIRECTORY]: {
            models: [],
            providers: [legacyProvider],
            providersLoaded: true,
            agents: [testAgent('build')],
            currentProviderId: 'legacy',
            currentModelId: 'legacy-model',
            currentVariant: 'high',
            selectedProviderId: 'legacy',
            currentAgentName: 'build',
            agentModelSelections: {},
            defaultProviders: { legacy: 'legacy-model' },
          },
          [OTHER_DIRECTORY]: {
            models: [],
            providers: [validProvider],
            agents: [],
            currentProviderId: 'valid',
            currentModelId: 'valid-model',
            selectedProviderId: 'valid',
            agentModelSelections: {},
            defaultProviders: { valid: 'valid-model' },
          },
          [inactiveLegacyDirectory]: {
            providers: [legacyProvider],
            providersLoaded: true,
            agents: [testAgent('review')],
            currentProviderId: 'legacy',
            currentModelId: 'legacy-model',
            selectedProviderId: 'legacy',
            currentAgentName: 'review',
            agentModelSelections: {},
            defaultProviders: { legacy: 'legacy-model' },
          },
        },
      },
      version: 0,
    }));

    await useConfigStore.persist.rehydrate();

    const hydrated = useConfigStore.getState();
    hydrated.applyDefaultModelAgentSelection();
    expect(hydrated.providers).toEqual([]);
    expect(hydrated.directoryScoped[DIRECTORY]?.providers).toEqual([]);
    expect(selectCatalogLoadedForDirectory(hydrated, 'models', DIRECTORY)).toBe(false);
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.providers).toEqual([validProvider]);
    expect(hydrated.directoryScoped[inactiveLegacyDirectory]?.providers).toEqual([]);
    expect(hydrated.directoryScoped[inactiveLegacyDirectory]?.providersLoaded).toBe(false);
    expect(hydrated.directoryScoped[inactiveLegacyDirectory]).not.toHaveProperty('agents');
    expect(hydrated).not.toHaveProperty('agents');
    expect(hydrated.currentProviderId).toBe('legacy');
    expect(hydrated.currentVariant).toBe('high');
    expect(useConfigStore.getState().getCurrentModelVariants()).toEqual([]);

    liveProviderId = 'legacy';
    liveProviderVariants = ['high'];
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });

    const refreshed = useConfigStore.getState();
    expect(refreshed.providersLoaded).toBe(true);
    expect(refreshed.getCurrentModelVariants()).toEqual(['high']);
    expect(refreshed.directoryScoped[OTHER_DIRECTORY]?.providers).toEqual([validProvider]);
  });

  test('provider config events refresh all known directory provider caches immediately', async () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('active-stale')],
      defaultProviders: { default: 'active-stale' },
      currentProviderId: 'active-stale',
      currentModelId: 'active-stale-model',
      selectedProviderId: 'active-stale',
      directoryScoped: {
        [DIRECTORY]: {
          models: [],
          providers: [provider('active-stale')],

          currentProviderId: 'active-stale',
          currentModelId: 'active-stale-model',
          currentAgentName: undefined,
          selectedProviderId: 'active-stale',
          agentModelSelections: {},
          defaultProviders: { default: 'active-stale' },
        },
        [OTHER_DIRECTORY]: {
          models: [],
          providers: [provider('inactive-cached')],

          currentProviderId: 'inactive-cached',
          currentModelId: 'inactive-cached-model',
          currentAgentName: undefined,
          selectedProviderId: 'inactive-cached',
          agentModelSelections: {},
          defaultProviders: { default: 'inactive-cached' },
        },
      },
    });

    liveProviderIdsByDirectory = new Map([
      [DIRECTORY, 'active-live'],
      [OTHER_DIRECTORY, 'inactive-live'],
    ]);
    emitConfigChange('providers');
    await settle();

    const state = useConfigStore.getState();
    expect(getProvidersCalls).toBe(4);
    expect(state.directoryScoped[DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['active-live']);
    expect(state.directoryScoped[OTHER_DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['inactive-live']);
    expect(state.directoryScoped[OTHER_DIRECTORY]?.defaultProviders).toEqual({});
  });

  test('provider reload preserves a valid current variant', async () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      currentProviderId: 'live',
      currentModelId: 'live-model',
      currentVariant: 'fast',
      selectedProviderId: 'live',
      directoryScoped: {},
    });

    liveProviderId = 'live';
    liveProviderVariants = ['fast', 'slow'];
    await useConfigStore.getState().loadProviders({ source: 'test:variant' });

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('live');
    expect(state.currentModelId).toBe('live-model');
    expect(state.currentVariant).toBe('fast');
  });

  test('the settings provider selection survives a refresh that no longer lists it', async () => {
    // Plugin-registered providers vanish from the list while OpenCode restarts.
    // A refresh in that window used to move the user to another provider while
    // they were reading or editing the one they picked.
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      currentProviderId: 'live',
      currentModelId: 'live-model',
      selectedProviderId: 'plugin-provider',
      directoryScoped: {},
    });

    liveProviderId = 'live';
    await useConfigStore.getState().loadProviders({ source: 'test:missing-selection' });

    const state = useConfigStore.getState();
    expect(state.providers.map((entry) => entry.providerId)).toEqual(['live']);
    expect(state.selectedProviderId).toBe('plugin-provider');
    expect(state.directoryScoped[DIRECTORY]?.selectedProviderId).toBe('plugin-provider');
  });

  test('an empty settings provider selection is filled from the refreshed list', async () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      currentProviderId: '',
      currentModelId: '',
      selectedProviderId: '',
      directoryScoped: {},
    });

    liveProviderId = 'live';
    await useConfigStore.getState().loadProviders({ source: 'test:empty-selection' });

    expect(useConfigStore.getState().selectedProviderId).toBe('live');
  });

  test('changing the chat provider leaves the settings provider selection alone', async () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('anthropic'), provider('openai')],
      currentProviderId: 'anthropic',
      currentModelId: 'anthropic-model',
      selectedProviderId: 'openai',
      directoryScoped: {},
    });

    useConfigStore.getState().setProvider('anthropic');

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('anthropic');
    expect(state.selectedProviderId).toBe('openai');
    expect(state.directoryScoped[DIRECTORY]?.selectedProviderId).toBe('openai');
  });

  test('provider reload preserves the add-provider sentinel selection', async () => {
    // The user has opened the "Add provider" form, which sets selectedProviderId
    // to the sentinel. A background provider refresh must not navigate them away
    // (and discard their unsaved input) just because the sentinel is not a real
    // provider id. See issue #1765.
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      currentProviderId: 'live',
      currentModelId: 'live-model',
      selectedProviderId: '__add_provider__',
      directoryScoped: {},
    });

    liveProviderId = 'live';
    await useConfigStore.getState().loadProviders({ source: 'test:add-provider' });

    expect(useConfigStore.getState().selectedProviderId).toBe('__add_provider__');
  });

  test('add-provider sentinel is not persisted as a stable provider selection', async () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      currentProviderId: 'live',
      currentModelId: 'live-model',
      selectedProviderId: '__add_provider__',
      directoryScoped: {
        [DIRECTORY]: {
          models: [],
          providers: [provider('live')],

          currentProviderId: 'live',
          currentModelId: 'live-model',
          currentAgentName: undefined,
          selectedProviderId: '__add_provider__',
          agentModelSelections: {},
          defaultProviders: { default: 'live' },
        },
      },
    });

    const persisted = JSON.parse(persistedConfig());
    expect(persisted.state.selectedProviderId).toBe('');
    expect(persisted.state.directoryScoped[DIRECTORY].selectedProviderId).toBe('');
  });

  test('following a session agent switch keeps Auto and the effort on screen', () => {
    useSessionUIStore.setState({ currentSessionId: 'ses_follow_agent' });
    seedAgentCatalog([testAgent('plan', { model: { providerId: 'openai', modelId: 'gpt-5.5' } })], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5', ['low', 'high'])],

      currentProviderId: 'openchamber',
      currentModelId: 'auto',
      currentVariant: 'low',
      currentVariantSelection: { override: 'low', inherited: undefined },
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan', { keepModel: true });

    const state = useConfigStore.getState();
    expect(state.currentAgentName).toBe('plan');
    expect([state.currentProviderId, state.currentModelId, state.currentVariant]).toEqual(['openchamber', 'auto', 'low']);
    expect(useSelectionStore.getState().getSessionAgentSelection('ses_follow_agent')).toBe('plan');
  });


  test('cycleCurrentVariant reaches Default, low, and medium from inherited high', () => {
    useConfigStore.setState({
      providers: [provider('openai', 'gpt-5.6-sol', ['none', 'low', 'medium', 'high', 'xhigh', 'max'])],
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.6-sol',
      currentVariant: 'high',
      currentVariantSelection: { override: undefined, inherited: 'high' },
      directoryScoped: {},
    });

    const expectedVariants = ['xhigh', 'max', undefined, 'none', 'low', 'medium', 'high'];
    for (const expectedVariant of expectedVariants) {
      expect(useConfigStore.getState().cycleCurrentVariant()).toBe(expectedVariant);
      expect(useConfigStore.getState().currentVariantSelection.override).toBe(expectedVariant ?? null);
    }

    useConfigStore.getState().setCurrentVariantOverride('max', 'high');
    expect(useConfigStore.getState().cycleCurrentVariant()).toBe(undefined);
    // Default is a choice to send no effort, not a way back to the inherited one.
    expect(useConfigStore.getState().currentVariant).toBe(undefined);
    expect(useConfigStore.getState().currentVariantSelection).toEqual({ override: null, inherited: 'high' });
  });

  test('cycleCurrentVariant toggles a single variant with Default', () => {
    useConfigStore.setState({
      providers: [provider('openai', 'single', ['high'])],
      currentProviderId: 'openai',
      currentModelId: 'single',
      currentVariant: 'high',
      currentVariantSelection: { override: null, inherited: 'high' },
      directoryScoped: {},
    });

    expect(useConfigStore.getState().cycleCurrentVariant()).toBe('high');
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
    expect(useConfigStore.getState().cycleCurrentVariant()).toBe(undefined);
    expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
    expect(useConfigStore.getState().currentVariant).toBe(undefined);
  });

  test('an unavailable explicit variant cycles back to Default', () => {
    useConfigStore.setState({
      providers: [provider('openai', 'changed', ['low', 'high'])],
      currentProviderId: 'openai',
      currentModelId: 'changed',
      currentVariant: 'removed',
      currentVariantSelection: { override: 'removed', inherited: 'low' },
      directoryScoped: {},
    });

    expect(useConfigStore.getState().cycleCurrentVariant()).toBe(undefined);
    expect(useConfigStore.getState().currentVariant).toBe(undefined);
    expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
  });

  test('setAgent keeps the session route and falls back to no route, never a global default', () => {
    const sessionId = 'ses_agent_saved_variant';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, 'plan', 'openai', 'gpt-5.5', 'low');
    seedAgentCatalog([testAgent('plan', { model: { providerId: 'openai', modelId: 'gpt-5.5' } })], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5', ['low', 'medium', 'high'])],
      settingsDefaultModel: 'openai/gpt-5.5',
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.5',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');
    expect(useConfigStore.getState().currentVariant).toBe('low');

    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, 'plan', 'openai', 'gpt-5.5', undefined);
    useConfigStore.setState({ currentVariant: undefined, directoryScoped: {} });

    useConfigStore.getState().setAgent('plan');
    expect(useConfigStore.getState().currentVariant).toBeUndefined();
  });

  test('an explicit Default route sends no variant', () => {
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5', ['low', 'high'])],
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.5',
      currentVariant: 'low',
      currentVariantSelection: { override: 'low', inherited: 'low' },
      directoryScoped: {},
    });

    useConfigStore.getState().setCurrentVariantOverride(null, 'low');

    expect(useConfigStore.getState().currentVariant).toBe(undefined);
    expect(useConfigStore.getState().currentVariantSelection).toEqual({ override: null, inherited: 'low' });
  });

  test('setAgent keeps a session Default route', () => {
    const sessionId = 'ses_agent_default_effort';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useSelectionStore.getState().saveAgentModelForSession(sessionId, 'plan', 'openai', 'gpt-5.5');
    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, 'plan', 'openai', 'gpt-5.5', null);
    seedAgentCatalog([testAgent('plan')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5', ['low', 'high'])],
      settingsDefaultModel: 'openai/gpt-5.5',
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.5',
      currentVariant: 'low',
      currentVariantSelection: { override: undefined, inherited: 'low' },
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    const state = useConfigStore.getState();
    expect(state.currentVariant).toBe(undefined);
    expect(state.currentVariantSelection).toEqual({ override: null, inherited: undefined });
    expect(state.directoryScoped[DIRECTORY]?.currentVariant).toBe(undefined);
  });

  test('setAgent reports the session route through currentVariant and the picker selection', () => {
    const sessionId = 'ses_agent_effort_in_sync';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useSelectionStore.getState().saveAgentModelForSession(sessionId, 'plan', 'openai', 'gpt-5.5');
    useSelectionStore.getState().saveAgentModelVariantForSession(sessionId, 'plan', 'openai', 'gpt-5.5', 'high');
    seedAgentCatalog([testAgent('plan')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5', ['low', 'high'])],
      settingsDefaultModel: 'openai/gpt-5.5',
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.5',
      currentVariant: 'low',
      currentVariantSelection: { override: 'low', inherited: 'low' },
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    const state = useConfigStore.getState();
    expect(state.currentVariant).toBe('high');
    expect(state.currentVariantSelection).toEqual({ override: 'high', inherited: undefined });
  });


  test('[issue-2404] setAgent keeps session model override over agent default model', () => {
    // Custom agent default is model-a; user manually overrode to model-b for this session.
    // Re-applying setAgent (e.g. after delegated subtask completion rematerializes the
    // parent) must keep model-b rather than resetting to the agent pin.
    const sessionId = 'ses_2404_model_override';
    const multiModelProvider = {
      ...provider('provider', 'model-a'),
      models: [
        provider('provider', 'model-a').models[0],
        provider('provider', 'model-b').models[0],
      ],
    };
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useSelectionStore.getState().saveSessionModelSelection(sessionId, 'provider', 'model-b');
    useSelectionStore.getState().saveAgentModelForSession(sessionId, 'custom-agent', 'provider', 'model-b');
    seedAgentCatalog([testAgent('custom-agent', { model: { providerId: 'provider', modelId: 'model-a' } })], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [multiModelProvider],

      currentProviderId: 'provider',
      currentModelId: 'model-b',
      currentAgentName: 'custom-agent',
      selectionSource: 'manual',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('custom-agent');

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('provider');
    expect(state.currentModelId).toBe('model-b');
    expect(useSelectionStore.getState().getAgentModelForSession(sessionId, 'custom-agent')).toEqual({
      providerId: 'provider',
      modelId: 'model-b',
    });
  });

  test('[issue-2404] setAgent uses agent default when no session override exists', () => {
    const sessionId = 'ses_2404_agent_default';
    const multiModelProvider = {
      ...provider('provider', 'model-a'),
      models: [
        provider('provider', 'model-a').models[0],
        provider('provider', 'model-b').models[0],
      ],
    };
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([testAgent('custom-agent', { model: { providerId: 'provider', modelId: 'model-a' } })], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [multiModelProvider],

      currentProviderId: 'provider',
      currentModelId: 'model-b',
      currentAgentName: undefined,
      selectionSource: 'auto',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('custom-agent');

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('provider');
    expect(state.currentModelId).toBe('model-a');
  });

  test('[issue-2531] setAgent keeps the manual model when switching to an agent without an override', () => {
    const sessionId = 'ses_2531_mode_switch';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([testAgent('build'), testAgent('plan')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('deepseek', 'deepseek-v4-pro'), provider('kimi', 'kimi-k3')],

      settingsDefaultModel: 'deepseek/deepseek-v4-pro',
      currentProviderId: 'kimi',
      currentModelId: 'kimi-k3',
      currentAgentName: 'build',
      selectionSource: 'manual',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    const state = useConfigStore.getState();
    expect(state.currentAgentName).toBe('plan');
    expect(state.currentProviderId).toBe('kimi');
    expect(state.currentModelId).toBe('kimi-k3');
  });

  test('[issue-2690] setAgent persists the kept manual model for the session and agent', () => {
    const sessionId = 'ses_2690_persist_kept_model';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([testAgent('build'), testAgent('plan')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('deepseek', 'deepseek-v4-pro'), provider('kimi', 'kimi-k3')],

      settingsDefaultModel: 'deepseek/deepseek-v4-pro',
      currentProviderId: 'kimi',
      currentModelId: 'kimi-k3',
      currentAgentName: 'build',
      selectionSource: 'manual',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    // Keeping the pair only in memory loses it on reload; the write is what
    // makes the choice survive.
    const selection = useSelectionStore.getState();
    expect(selection.getSessionModelSelection(sessionId)).toEqual({ providerId: 'kimi', modelId: 'kimi-k3' });
    expect(selection.getAgentModelForSession(sessionId, 'plan')).toEqual({ providerId: 'kimi', modelId: 'kimi-k3' });
  });

  test('setAgent preserves the manual model while it is absent from discovery', () => {
    const sessionId = 'ses_2690_stale_model';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([testAgent('build'), testAgent('plan')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('deepseek', 'deepseek-v4-pro')],

      settingsDefaultModel: 'deepseek/deepseek-v4-pro',
      // The provider still exists but this model was removed from it.
      currentProviderId: 'deepseek',
      currentModelId: 'retired-model',
      currentAgentName: 'build',
      selectionSource: 'manual',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('deepseek');
    expect(state.currentModelId).toBe('retired-model');
  });

  test('setAgent switching from agent with pinned model to agent without pinned model uses default model, does not leak pinned model', () => {
    const sessionId = 'ses_pinned_to_unpinned_leak';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([
      testAgent('plan'),
      testAgent('Plan - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
    ], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.6-sol'), provider('google', 'antigravity-gemini-3.8-flash')],

      settingsDefaultModel: 'openai/gpt-5.6-sol',
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.6-sol',
      currentAgentName: 'plan',
      selectionSource: 'auto',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('Plan - Gemini');
    let state = useConfigStore.getState();
    expect(state.currentAgentName).toBe('Plan - Gemini');
    expect(state.currentProviderId).toBe('google');
    expect(state.currentModelId).toBe('antigravity-gemini-3.8-flash');
    expect(state.selectionSource).toBe('auto');

    useConfigStore.getState().setAgent('plan');
    state = useConfigStore.getState();
    expect(state.currentAgentName).toBe('plan');
    expect(state.currentProviderId).toBe('openai');
    expect(state.currentModelId).toBe('gpt-5.6-sol');
    expect(state.selectionSource).toBe('auto');
    expect(useSelectionStore.getState().getAgentModelForSession(sessionId, 'plan')).toBeNull();
  });

  test('cycling through agents with and without pinned models respects each agent config after sending message', () => {
    const sessionId = 'ses_tab_cycle_all_agents';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([
      testAgent('plan'),
      testAgent('Plan - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
      testAgent('build'),
      testAgent('Build - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
    ], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [
        provider('openai', 'gpt-5.6-sol'),
        provider('google', 'antigravity-gemini-3.8-flash'),
      ],

      settingsDefaultModel: 'openai/gpt-5.6-sol',
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.6-sol',
      currentAgentName: 'plan',
      selectionSource: 'auto',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('Plan - Gemini');
    expect(useConfigStore.getState().currentAgentName).toBe('Plan - Gemini');
    expect(useConfigStore.getState().currentModelId).toBe('antigravity-gemini-3.8-flash');

    // Message reconciliation records the sent model as the live manual selection.
    useSelectionStore.getState().saveSessionModelSelection(sessionId, 'google', 'antigravity-gemini-3.8-flash');
    useSelectionStore.getState().saveAgentModelForSession(sessionId, 'Plan - Gemini', 'google', 'antigravity-gemini-3.8-flash');
    useConfigStore.setState({ selectionSource: 'manual' });

    useConfigStore.getState().setAgent('build');
    expect(useConfigStore.getState().currentAgentName).toBe('build');
    expect(useConfigStore.getState().currentModelId).toBe('gpt-5.6-sol');
    expect(useSelectionStore.getState().getAgentModelForSession(sessionId, 'build')).toBeNull();

    useConfigStore.getState().setAgent('Build - Gemini');
    expect(useConfigStore.getState().currentAgentName).toBe('Build - Gemini');
    expect(useConfigStore.getState().currentModelId).toBe('antigravity-gemini-3.8-flash');

    useConfigStore.getState().setAgent('plan');
    expect(useConfigStore.getState().currentAgentName).toBe('plan');
    expect(useConfigStore.getState().currentModelId).toBe('gpt-5.6-sol');
    expect(useSelectionStore.getState().getAgentModelForSession(sessionId, 'plan')).toBeNull();
  });

  test('a picked agent survives an agents reload, with its inherited model still inherited', async () => {
    const agentsList = [
      testAgent('build', { model: { providerId: 'openai', modelId: 'gpt-5.6-sol' } }),
      testAgent('Build - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
      testAgent('plan'),
    ];
    const providersList = [
      provider('openai', 'gpt-5.6-sol'),
      provider('google', 'antigravity-gemini-3.8-flash'),
    ];
    getAgentsImpl = async () => agentsList;
    seedAgentCatalog(agentsList, DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: providersList,

      currentProviderId: 'openai',
      currentModelId: 'gpt-5.6-sol',
      currentAgentName: 'build',
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('Build - Gemini');
    await refreshComposerCatalog(DIRECTORY);

    expect(useConfigStore.getState().currentAgentName).toBe('Build - Gemini');
    expect(useConfigStore.getState().currentModelId).toBe('antigravity-gemini-3.8-flash');
    // The pin was inherited, not chosen: a reload must not promote it.
    expect(useConfigStore.getState().selectionSource).toBe('auto');

    useConfigStore.getState().setAgent('plan');
    await refreshComposerCatalog(DIRECTORY);

    expect(useConfigStore.getState().currentAgentName).toBe('plan');
  });

  test('default selection leaves the root composer without a profile', async () => {
    const agentsList = [
      testAgent('build', { model: { providerId: 'openai', modelId: 'gpt-5.6-sol' } }),
      testAgent('Build - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
    ];
    getAgentsImpl = async () => agentsList;
    seedAgentCatalog(agentsList, DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.6-sol'), provider('google', 'antigravity-gemini-3.8-flash')],
      currentProviderId: 'openai',
      currentModelId: 'gpt-5.6-sol',
      currentAgentName: 'build',
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
      settingsDefaultsLoaded: true,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('Build - Gemini');
    useConfigStore.getState().applyDefaultModelAgentSelection();
    await refreshComposerCatalog(DIRECTORY);

    expect(useConfigStore.getState().agentSelectionSource).toBe('auto');
    expect(useConfigStore.getState().currentAgentName).toBeUndefined();
  });

  test('setAgent carries an explicit override from a pinned agent to an unpinned agent', () => {
    const sessionId = 'ses_explicit_override_from_pinned';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    seedAgentCatalog([
      testAgent('plan'),
      testAgent('Plan - Gemini', { model: { providerId: 'google', modelId: 'antigravity-gemini-3.8-flash' } }),
    ], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [
        provider('openai', 'gpt-5.6-sol'),
        provider('google', 'antigravity-gemini-3.8-flash'),
        provider('anthropic', 'claude-sonnet'),
      ],

      settingsDefaultModel: 'openai/gpt-5.6-sol',
      currentProviderId: 'anthropic',
      currentModelId: 'claude-sonnet',
      currentAgentName: 'Plan - Gemini',
      selectionSource: 'manual',
      currentVariant: undefined,
      directoryScoped: {},
    });

    useConfigStore.getState().setAgent('plan');

    expect(useConfigStore.getState().currentModelId).toBe('claude-sonnet');
    expect(useSelectionStore.getState().getAgentModelForSession(sessionId, 'plan')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet',
    });
  });


  test('catalog refreshes publish OMP\'s changed default model and thinking level', async () => {
    liveAgents = [testAgent('build')];
    liveProviderId = 'first';
    getProvidersForConfigImpl = async () => providerResponse('first', 'first-model', undefined, {
      model: { providerId: 'first', modelId: 'first-model' }, thinkingLevel: 'low',
    });

    await useConfigStore.getState().loadProviders({ directory: DIRECTORY, source: 'test:defaults-cache-first' });
    expect(useConfigStore.getState()).toMatchObject({
      settingsDefaultModel: 'first/first-model', settingsDefaultReasoningEffort: 'low',
    });

    liveProviderId = 'second';
    getProvidersForConfigImpl = async () => providerResponse('second', 'second-model', undefined, {
      model: { providerId: 'second', modelId: 'second-model' }, thinkingLevel: 'high',
    });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY, source: 'test:defaults-cache-second' });

    expect(useConfigStore.getState()).toMatchObject({
      settingsDefaultModel: 'second/second-model', settingsDefaultReasoningEffort: 'high',
    });
  });

  test("a native agent catalog failure finishes startup and stays scoped to that directory", async () => {
    getAgentsImpl = async () => { throw new Error('Native profile catalog unavailable'); };
    await useConfigStore.getState().initializeApp();
    expect(useConfigStore.getState().isInitialized).toBe(true);
    expect(useConfigStore.getState().lastInitFailure).toBeNull();
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), OTHER_DIRECTORY)).toBe('loading');
    getAgentsImpl = null;
    liveAgents = [testAgent('build')];
    await refreshComposerCatalog(DIRECTORY);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('ready');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBeFalsy();
  });

  test('an unreachable server is recorded as the startup failure', async () => {
    checkReadyImpl = async () => { throw new Error('server unreachable'); };
    await useConfigStore.getState().initializeApp();

    expect(useConfigStore.getState().isInitialized).toBe(false);
    expect(useConfigStore.getState().lastInitFailure).toEqual({ step: 'serverUnreachable', message: null });
  }, 10_000);

  test('a live server with Agent Service not ready is not reported as unreachable', async () => {
    checkReadyImpl = async () => false;
    await useConfigStore.getState().initializeApp();

    expect(useConfigStore.getState().lastInitFailure).toEqual({ step: 'agentServiceUnavailable', message: null });
  }, 10_000);

  test('startup waits for Agent Service readiness before connecting', async () => {
    let probes = 0;
    checkReadyImpl = async () => (++probes < 2 ? false : true);
    await useConfigStore.getState().checkConnection();

    expect(useConfigStore.getState().isConnected).toBe(true);
    expect(probes).toBe(2);
  }, 10_000);

  test('a project whose folder is gone does not block startup', async () => {
    getAgentsImpl = async () => {
      throw new Error('agent.list failed (500)');
    };
    directoryAvailability = 'missing';
    try {
      await useConfigStore.getState().initializeApp();
    } finally {
      directoryAvailability = 'available';
    }

    expect(useConfigStore.getState().isInitialized).toBe(true);
    expect(useConfigStore.getState().lastInitFailure).toBeNull();
  }, 10_000);

  test("native catalog failure remains distinct from successful empty startup", async () => {
    getAgentsImpl = async () => { throw new Error('Native catalog failed'); };
    await useConfigStore.getState().initializeApp();
    expect(useConfigStore.getState().isInitialized).toBe(true);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('error');
    expect(useAgentsStore.getState().errorsByDirectory[DIRECTORY]).toBe('Native catalog failed');
    getAgentsImpl = null;
    liveAgents = [];
    await refreshComposerCatalog(DIRECTORY);
    expect(selectAgentCatalogStatus(useAgentsStore.getState(), DIRECTORY)).toBe('ready');
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY)).toEqual([]);
    expect(useConfigStore.getState()).not.toHaveProperty('agents');
    expect(useConfigStore.getState()).not.toHaveProperty('agentsLoaded');
    expect(useConfigStore.getState()).not.toHaveProperty('loadAgents');
  });

  test('native agent invalidation replaces an in-flight catalog before callers complete', async () => {
    const staleAgents = deferred<TestAgent[]>();
    let calls = 0;
    getAgentsImpl = async () => {
      calls += 1;
      if (calls === 1) return staleAgents.promise;
      return [testAgent('new-agent')];
    };

    const staleLoad = refreshComposerCatalog(DIRECTORY);
    await Promise.resolve();
    expect(calls).toBe(1);

    invalidateAgentsLoadCache(DIRECTORY);
    const freshLoad = refreshComposerCatalog(DIRECTORY);
    staleAgents.resolve([testAgent('old-agent')]);

    expect(await staleLoad).toBe(true);
    expect(await freshLoad).toBe(true);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name))
      .toEqual(['new-agent']);
  });

  test('a caller that joined an agent load before invalidation gets the replacement list', async () => {
    const staleAgents = deferred<TestAgent[]>();
    let calls = 0;
    getAgentsImpl = async () => {
      calls += 1;
      if (calls === 1) return staleAgents.promise;
      return [testAgent('new-agent')];
    };

    const ownerLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    const joinedLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await Promise.resolve();
    expect(calls).toBe(1);

    invalidateAgentsLoadCache(DIRECTORY);
    staleAgents.resolve([testAgent('old-agent')]);

    expect(await ownerLoad).toBe(true);
    expect(await joinedLoad).toBe(true);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name))
      .toEqual(['new-agent']);
  });

  test('starts agent and provider requests together during cold directory activation', async () => {
    const providers = deferred<TestProviderResponse>();
    getProvidersForConfigImpl = () => providers.promise;
    liveAgents = [testAgent('build')];
    const activation = useConfigStore.getState().activateDirectory(DIRECTORY);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(getProvidersCalls).toBe(2);
      expect(getAgentsCalls).toBe(1);
    } finally {
      providers.resolve(providerResponse('live'));
      await activation;
    }
  });

  test('does not re-read settings after waiting for the provider catalog', async () => {
    const providers = deferred<TestProviderResponse>();
    getProvidersForConfigImpl = () => providers.promise;
    liveAgents = [testAgent('build')];
    const providerLoad = useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    const agentLoad = refreshComposerCatalog(DIRECTORY);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    providers.resolve(providerResponse('live'));
    await Promise.all([providerLoad, agentLoad]);
    expect(settingsLoadCalls).toBe(1);
  });

  test('loads preferences before a slow Agent Service readiness check finishes', async () => {
    const ready = deferred<boolean>();
    checkReadyImpl = () => ready.promise;
    persistedOpenChamberSettings = { zenModel: 'zen-model' };
    useConfigStore.setState({ settingsDefaultsLoaded: false });
    liveAgents = [testAgent('review')];
    const initialization = useConfigStore.getState().initializeApp();
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(settingsLoadCalls).toBe(1);
      expect(getProvidersCalls).toBe(0);
    } finally {
      ready.resolve(true);
      await initialization;
    }
  });

  test('catalog defaults reconcile with a default agent resolved while providers await', async () => {
    const pendingProviders = deferred<TestProviderResponse>();
    getProvidersForConfigImpl = async () => pendingProviders.promise;
    liveAgents = [testAgent('build'), testAgent('review')];
    persistedOpenChamberSettings = { zenModel: 'zen-model' };
    useConfigStore.setState({ providers: [], currentProviderId: '', currentModelId: '' });

    const providerLoad = useConfigStore.getState().loadProviders({ directory: DIRECTORY, source: 'test:defaults-provider-wait' });
    const agentsLoad = refreshComposerCatalog(DIRECTORY);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    pendingProviders.resolve(providerResponse('sidecar', 'new-model', undefined, {
      model: { providerId: 'sidecar', modelId: 'new-model' }, thinkingLevel: 'high',
    }));

    await Promise.all([providerLoad, agentsLoad]);

    const state = useConfigStore.getState();
    expect(state.settingsDefaultModel).toBe('sidecar/new-model');
    expect(state.settingsDefaultReasoningEffort).toBe('high');
    expect(state.currentProviderId).toBe('sidecar');
    expect(state.currentModelId).toBe('new-model');
  });

  test('does not publish runtime A defaults after switching to runtime B', async () => {
    const pendingProvidersA = deferred<TestProviderResponse>();
    let providerRequest = 0;
    getProvidersForConfigImpl = async () => {
      providerRequest += 1;
      if (providerRequest === 1) return pendingProvidersA.promise;
      return providerResponse('runtime-b', 'b-model', undefined, {
        model: { providerId: 'runtime-b', modelId: 'b-model' }, thinkingLevel: 'high',
      });
    };
    liveAgents = [testAgent('build')];

    switchRuntimeEndpoint({ apiBaseUrl: 'https://config-a.example', runtimeKey: 'config-a' });
    const providerLoadA = useConfigStore.getState().loadProviders({ directory: DIRECTORY, source: 'test:runtime-a' });
    const agentsLoadA = refreshComposerCatalog(DIRECTORY);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    switchRuntimeEndpoint({ apiBaseUrl: 'https://config-b.example', runtimeKey: 'config-b' });
    const providerLoadB = useConfigStore.getState().loadProviders({ directory: DIRECTORY, source: 'test:runtime-b' });
    const agentsLoadB = refreshComposerCatalog(DIRECTORY);
    await Promise.all([providerLoadB, agentsLoadB]);

    pendingProvidersA.resolve(providerResponse('runtime-a', 'a-model', undefined, {
      model: { providerId: 'runtime-a', modelId: 'a-model' }, thinkingLevel: 'low',
    }));
    await Promise.all([providerLoadA, agentsLoadA]);

    const state = useConfigStore.getState();
    expect(state.settingsDefaultModel).toBe('runtime-b/b-model');
    expect(state.settingsDefaultReasoningEffort).toBe('high');
    expect(state.currentProviderId).toBe('runtime-b');
    expect(state.currentModelId).toBe('b-model');
  });

  test('does not retain another runtime defaults or directory snapshots on a failed read', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://retained-a.example', runtimeKey: 'retained-a' });
    liveAgents = [testAgent('build')];
    persistedOpenChamberSettings = { zenModel: 'zen-model' };
    getProvidersForConfigImpl = async () => providerResponse('live', 'live-model', undefined, {
      model: { providerId: 'live', modelId: 'live-model' }, thinkingLevel: 'high',
    });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    await refreshComposerCatalog(DIRECTORY);
    expect(useConfigStore.getState().directoryScoped[DIRECTORY]).toBeDefined();

    switchRuntimeEndpoint({ apiBaseUrl: 'https://retained-b.example', runtimeKey: 'retained-b' });
    persistedOpenChamberSettings = null;
    expect(useConfigStore.getState().directoryScoped).toEqual({});
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    expect(useConfigStore.getState().providers).toEqual([]);
    await refreshComposerCatalog(DIRECTORY);
    expect(useConfigStore.getState().settingsDefaultModel).toBeUndefined();
  });

  test('rejects a persisted config snapshot belonging to another runtime', async () => {
    seedConfig(JSON.stringify({ state: {
      configRuntimeKey: 'some-other-instance',
      settingsDefaultModel: 'foreign/model',
      providers: [provider('foreign')],
    }, version: 0 }));
    await useConfigStore.persist.rehydrate();
    expect(useConfigStore.getState().settingsDefaultModel).toBeUndefined();
    expect(useConfigStore.getState().providers).toEqual([]);
  });

  test('an obsolete initialization cannot publish readiness or consume the new initialization', async () => {
    const pendingA = deferred<TestProviderResponse>();
    const pendingB = deferred<TestProviderResponse>();
    let calls = 0;
    getProvidersForConfigImpl = () => ++calls === 1 ? pendingA.promise : pendingB.promise;
    liveAgents = [testAgent('build')];
    switchRuntimeEndpoint({ apiBaseUrl: 'https://init-a.example', runtimeKey: 'init-a' });
    const initA = useConfigStore.getState().initializeApp();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    switchRuntimeEndpoint({ apiBaseUrl: 'https://init-b.example', runtimeKey: 'init-b' });
    const initB = useConfigStore.getState().initializeApp();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(2);
    pendingA.resolve(providerResponse('a'));
    await initA;
    expect(useConfigStore.getState().isInitialized).toBe(false);
    pendingB.resolve(providerResponse('b'));
    await initB;
    expect(useConfigStore.getState().isInitialized).toBe(true);
    expect(useConfigStore.getState().providers[0]?.providerId).toBe('b');
  });

  test('an A to B to A switch still rejects the first A completion', async () => {
    const pending = deferred<TestProviderResponse>();
    switchRuntimeEndpoint({ apiBaseUrl: 'https://roundtrip-a.example', runtimeKey: 'roundtrip-a' });
    getProvidersForConfigImpl = () => pending.promise;
    const firstA = useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    switchRuntimeEndpoint({ apiBaseUrl: 'https://roundtrip-b.example', runtimeKey: 'roundtrip-b' });
    switchRuntimeEndpoint({ apiBaseUrl: 'https://roundtrip-a.example', runtimeKey: 'roundtrip-a' });
    getProvidersForConfigImpl = async () => (providerResponse('fresh'));
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    pending.resolve(providerResponse('obsolete'));
    await firstA;
    expect(useConfigStore.getState().providers[0]?.providerId).toBe('fresh');
  });

  test('a fresh provider load reads again instead of joining an older read', async () => {
    // Opening a worktree starts a read while OpenCode has not registered its
    // plugin providers yet; `provider.updated` then asks for a fresh read.
    const stale = deferred<TestProviderResponse>();
    let calls = 0;
    getProvidersForConfigImpl = () => ++calls === 1 ? stale.promise : Promise.resolve(providerResponse('plugin'));

    const first = useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    const joined = useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    const fresh = useConfigStore.getState().loadProviders({ directory: DIRECTORY, fresh: true });
    stale.resolve(providerResponse('builtin'));
    await Promise.all([first, joined, fresh]);

    expect(calls).toBe(2);
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['plugin']);
  });

  test('a directory whose providers never loaded is read once more on its own', async () => {
    let calls = 0;
    getProvidersForConfigImpl = async () => {
      calls += 1;
      if (calls <= 3) throw new Error('instance still starting');
      return providerResponse('live');
    };

    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState().providersLoaded).toBe(false);

    const deadline = Date.now() + 5000;
    while (!useConfigStore.getState().providersLoaded && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    expect(calls).toBe(4);
    expect(useConfigStore.getState().providersLoaded).toBe(true);
    expect(useConfigStore.getState().providers.map((entry) => entry.providerId)).toEqual(['live']);
  }, 8000);

  // OpenCode answers a directory it is still starting with the providers it has
  // so far; a plugin provider registers later and is announced by an event.
  // When that event lands while another directory is active, only that one is
  // re-read, so returning must not trust the incomplete snapshot.
  const pluginCatalog = () => ({
    providers: [providerInfo('builtin'), providerInfo('plugin')],
    models: [model('builtin', 'builtin-model'), model('plugin', 'plugin-model')],
  });
  const catalogIds = () => useConfigStore.getState().providers.map((entry) => entry.providerId);
  const waitForProviders = async (ids: string[]) => {
    const deadline = Date.now() + 2000;
    while (JSON.stringify(catalogIds()) !== JSON.stringify(ids) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  test('a worktree left while its catalog was incomplete is read again on return', async () => {
    const worktree = '/workspace/starting-worktree';
    let pluginRegistered = false;
    const requested: Array<string | null | undefined> = [];
    getProvidersForConfigImpl = async (directory) => {
      requested.push(directory);
      if (directory === worktree && !pluginRegistered) return providerResponse('builtin', 'builtin-model');
      return pluginCatalog();
    };

    await useConfigStore.getState().activateDirectory(worktree);
    expect(catalogIds()).toEqual(['builtin']);
    await useConfigStore.getState().activateDirectory(DIRECTORY);

    pluginRegistered = true;
    await useConfigStore.getState().activateDirectory(worktree);
    await waitForProviders(['builtin', 'plugin']);

    expect(requested.filter((directory) => directory === worktree)).toHaveLength(2);
    expect(catalogIds()).toEqual(['builtin', 'plugin']);
  });

  test('a read that began before the catalog changed does not make the worktree fresh', async () => {
    const worktree = '/workspace/slow-worktree';
    const slowRead = deferred<TestProviderResponse>();
    let reads = 0;
    getProvidersForConfigImpl = async (directory) => {
      if (directory !== worktree) return pluginCatalog();
      reads += 1;
      return reads === 1 ? slowRead.promise : pluginCatalog();
    };

    const activation = useConfigStore.getState().activateDirectory(worktree);
    await new Promise((resolve) => setTimeout(resolve, 0));
    slowRead.resolve(providerResponse('builtin', 'builtin-model'));
    await activation;
    await useConfigStore.getState().activateDirectory(DIRECTORY);

    await useConfigStore.getState().activateDirectory(worktree);
    await waitForProviders(['builtin', 'plugin']);

    expect(reads).toBe(2);
    expect(catalogIds()).toEqual(['builtin', 'plugin']);
  });

  test('a configuration reload retires a pre-reload provider read and keeps the loaded snapshot', async () => {
    const other = OTHER_DIRECTORY;
    liveProviderIdsByDirectory.set(DIRECTORY, 'active-catalog');
    liveProviderIdsByDirectory.set(other, 'other-old');
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    await useConfigStore.getState().loadProviders({ directory: other });
    const revision = useConfigStore.getState().catalogReloadRevision;

    const slowRead = deferred<TestProviderResponse>();
    let reads = 0;
    getProvidersForConfigImpl = async () => {
      reads += 1;
      return reads === 1 ? slowRead.promise : providerResponse('other-new');
    };
    const staleLoad = useConfigStore.getState().loadProviders({ directory: other });
    await new Promise((resolve) => setTimeout(resolve, 0));

    invalidateConfigCatalogsForReload(['provider', 'agent']);
    slowRead.resolve(providerResponse('other-stale'));
    await staleLoad;

    expect(selectProvidersForDirectory(useConfigStore.getState(), other).map((entry) => entry.providerId)).toEqual(['other-old']);
    expect(useConfigStore.getState().catalogReloadRevision).toBeGreaterThan(revision);

    await useConfigStore.getState().loadProviders({ directory: other });
    expect(selectProvidersForDirectory(useConfigStore.getState(), other).map((entry) => entry.providerId)).toEqual(['other-new']);
  });

  test('a configuration reload retires an agent read that began before it', async () => {
    const slowRead = deferred<TestAgent[]>();
    let reads = 0;
    getAgentsImpl = async () => {
      reads += 1;
      return reads === 1 ? slowRead.promise : [testAgent('new-agent')];
    };
    const staleLoad = useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    invalidateConfigCatalogsForReload(['agent']);
    slowRead.resolve([testAgent('stale-agent')]);

    expect(await staleLoad).toBe(false);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), OTHER_DIRECTORY)).toEqual([]);

    await useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), OTHER_DIRECTORY).map((entry) => entry.name)).toEqual(['new-agent']);
  });

  test('a configuration reload gives a joined agent read its replacement list', async () => {
    const slowRead = deferred<TestAgent[]>();
    let reads = 0;
    getAgentsImpl = async () => {
      reads += 1;
      return reads === 1 ? slowRead.promise : [testAgent('new-agent')];
    };
    const ownerLoad = useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    const joinedLoad = useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    invalidateConfigCatalogsForReload(['agent']);
    slowRead.resolve([testAgent('stale-agent')]);

    expect(await ownerLoad).toBe(false);
    expect(await joinedLoad).toBe(true);
    expect(reads).toBe(2);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), OTHER_DIRECTORY).map((entry) => entry.name)).toEqual(['new-agent']);
  });

  test('a configuration reload followed by a runtime switch starts no replacement agent read', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'https://reload-a.example', runtimeKey: 'reload-a' });
    const slowRead = deferred<TestAgent[]>();
    let reads = 0;
    getAgentsImpl = async () => {
      reads += 1;
      return reads === 1 ? slowRead.promise : [testAgent('replacement-agent')];
    };
    const ownerLoad = useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    const joinedLoad = useAgentsStore.getState().loadAgents(OTHER_DIRECTORY);
    await new Promise((resolve) => setTimeout(resolve, 0));

    invalidateConfigCatalogsForReload(['agent']);
    switchRuntimeEndpoint({ apiBaseUrl: 'https://reload-b.example', runtimeKey: 'reload-b' });
    slowRead.resolve([testAgent('runtime-a-agent')]);

    expect(await ownerLoad).toBe(false);
    expect(await joinedLoad).toBe(false);
    expect(reads).toBe(1);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), OTHER_DIRECTORY)).toEqual([]);
  });

  test('what other catalogs know fills in for a directory still starting', async () => {
    const worktree = '/workspace/known-catalog-worktree';
    liveAgents = [testAgent('build')];
    getProvidersForConfigImpl = async (directory) => (
      directory === worktree
        ? { providers: [], models: [] }
        : pluginCatalog()
    );
    await useConfigStore.getState().activateDirectory(DIRECTORY);
    liveAgents = [];
    await useConfigStore.getState().activateDirectory(worktree);

    const state = useConfigStore.getState();
    expect(state.providers).toEqual([]);
    expect(selectKnownCatalogModel(state, 'plugin', 'plugin-model')?.name).toBe('plugin-model');
    expect(selectKnownCatalogModel(state, 'plugin', 'missing-model')).toBeUndefined();
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY)[0]?.agentId).toBe('build');
    expect(state).not.toHaveProperty('agents');
  });

  test('a directory activation stops after a runtime switch during its provider wait', async () => {
    const pending = deferred<TestProviderResponse>();
    getProvidersForConfigImpl = () => pending.promise;
    const activation = useConfigStore.getState().activateDirectory(DIRECTORY);
    switchRuntimeEndpoint({ apiBaseUrl: 'https://activation-next.example', runtimeKey: 'activation-next' });
    pending.resolve(providerResponse('obsolete'));
    await activation;
    expect(getAgentsCalls).toBe(1);
    expect(useConfigStore.getState()).not.toHaveProperty('agents');
    expect(useConfigStore.getState().providers).toEqual([]);
  });

  test('a fresh draft keeps the catalog default model through discovery before and after return', async () => {
    seedAgentCatalog([], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({
      providers: [], settingsDefaultsLoaded: false,
      settingsDefaultModel: 'sidecar/chosen', settingsDefaultReasoningEffort: 'high',
    });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'sidecar', currentModelId: 'chosen' });
    liveAgents = [testAgent('build')];
    getProvidersForConfigImpl = async () => ({ providers: [], models: [] });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    await refreshComposerCatalog(DIRECTORY);
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'sidecar', currentModelId: 'chosen' });
    getProvidersForConfigImpl = async () => providerResponse('sidecar', 'chosen', undefined, {
      model: { providerId: 'sidecar', modelId: 'chosen' }, thinkingLevel: 'high',
    });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'sidecar', currentModelId: 'chosen' });
    expect(useConfigStore.getState().getCurrentModel()?.modelId).toBe('chosen');
  });

  test('a route picked in a draft survives the settings document arriving late', async () => {
    persistedOpenChamberSettings = { zenModel: 'zen-model' };
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('sidecar', 'chosen')],

      currentProviderId: 'sidecar',
      currentModelId: 'chosen',
      currentAgentName: 'build',
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
      settingsDefaultsLoaded: false,
      directoryScoped: {},
    });

    useConfigStore.getState().setCurrentVariantOverride('low', 'high');
    await useConfigStore.getState().loadSessionDefaults();

    expect(useConfigStore.getState().currentVariant).toBe('low');
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('low');
  });

  test('does not choose Big Pickle while catalog defaults are still loading', async () => {
    useConfigStore.setState({ settingsDefaultsLoaded: false });
    getProvidersForConfigImpl = async () => ({
      providers: [providerInfo('opencode'), providerInfo('sidecar')],
      models: [model('opencode', 'big-pickle'), model('sidecar', 'chosen')],
      default: { providerID: 'opencode', id: 'big-pickle' },
    });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState().currentModelId).toBe('');
    getProvidersForConfigImpl = async () => providerResponse('sidecar', 'chosen', undefined, {
      model: { providerId: 'sidecar', modelId: 'chosen' }, thinkingLevel: 'high',
    });
    liveAgents = [testAgent('build')];
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState()).toMatchObject({ currentModelId: 'chosen', settingsDefaultReasoningEffort: 'high' });
  });

  test('a new conversation skips a model hidden in the picker when nothing is configured (#1801)', async () => {
    useUIStore.setState({ hiddenModels: [{ providerID: 'opencode', modelID: 'big-pickle' }] });
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers: [provider('opencode', 'big-pickle'), provider('deepseek', 'v4-pro')] });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'deepseek', currentModelId: 'v4-pro' });

    getProvidersForConfigImpl = async () => ({
      providers: [providerResponse('opencode', 'big-pickle').providers[0], providerResponse('deepseek', 'v4-pro').providers[0]],
      models: [providerResponse('opencode', 'big-pickle').models[0], providerResponse('deepseek', 'v4-pro').models[0]],
    });
    useConfigStore.setState({ currentProviderId: '', currentModelId: '' });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'deepseek', currentModelId: 'v4-pro' });
  });

  test('a default model the user set stays selected even when hidden in the picker', () => {
    useUIStore.setState({ hiddenModels: [{ providerID: 'opencode', modelID: 'big-pickle' }] });
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({
      providers: [provider('opencode', 'big-pickle'), provider('deepseek', 'v4-pro')],

      settingsDefaultModel: 'opencode/big-pickle',
    });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'opencode', currentModelId: 'big-pickle' });
  });

  test('a new session starts on the model last picked in a chat when nothing is configured (#1801)', async () => {
    const providers = [provider('opencode', 'big-pickle'), provider('deepseek', 'v4-pro')];
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers });
    useUIStore.getState().setLastSelectedModel('deepseek', 'v4-pro');
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'deepseek', currentModelId: 'v4-pro', selectionSource: 'auto' });

    // After a restart the catalog load lands on it too.
    getProvidersForConfigImpl = async () => ({
      providers: [providerResponse('opencode', 'big-pickle').providers[0], providerResponse('deepseek', 'v4-pro').providers[0]],
      models: [providerResponse('opencode', 'big-pickle').models[0], providerResponse('deepseek', 'v4-pro').models[0]],
    });
    useConfigStore.setState({ currentProviderId: '', currentModelId: '' });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'deepseek', currentModelId: 'v4-pro' });
  });

  test('the last chat pick survives a provider that has not registered yet', () => {
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers: [provider('opencode', 'big-pickle')] });
    useUIStore.getState().setLastSelectedModel('claude-code', 'opus');
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'claude-code', currentModelId: 'opus' });
  });

  test('anything configured outranks the last chat pick, and a hidden pick is skipped', () => {
    const providers = [provider('opencode', 'big-pickle'), provider('deepseek', 'v4-pro'), provider('anthropic', 'claude')];
    useUIStore.getState().setLastSelectedModel('deepseek', 'v4-pro');

    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers, settingsDefaultModel: 'anthropic/claude' });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState().currentModelId).toBe('claude');

    useConfigStore.setState({ settingsDefaultModel: undefined });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState().currentModelId).toBe('v4-pro');

    useUIStore.setState({ hiddenModels: [{ providerID: 'deepseek', modelID: 'v4-pro' }] });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'opencode', currentModelId: 'big-pickle' });
  });

  test('with every model hidden a new conversation still gets one', () => {
    useUIStore.setState({ hiddenModels: [{ providerID: 'opencode', modelID: 'big-pickle' }, { providerID: 'deepseek', modelID: 'v4-pro' }] });
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers: [provider('deepseek', 'v4-pro'), provider('opencode', 'big-pickle')] });
    useConfigStore.getState().applyDefaultModelAgentSelection();
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'opencode', currentModelId: 'big-pickle' });
  });

  test('a project default remains selected when only the global default is discoverable', () => {
    seedAgentCatalog([testAgent('build')], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ providers: [provider('global')], settingsDefaultModel: 'global/global-model' });
    useConfigStore.getState().applyDefaultModelAgentSelection({ projectDefaultModel: 'project/chosen', projectDefaultVariant: 'high' });
    expect(useConfigStore.getState()).toMatchObject({ currentProviderId: 'project', currentModelId: 'chosen', currentVariant: 'high' });
  });

  test('a project default carries its own thinking level', async () => {
    // The project pins a model plus the level to run it at. Before, the level
    // was dropped and only the global settings variant was ever considered —
    // and that one belongs to the global model, not this project's.
    const projectProvider = provider('anthropic', 'claude-opus-5', ['high', 'low']);
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [projectProvider],

      currentProviderId: '',
      currentModelId: '',
      currentVariant: undefined,
      settingsDefaultModel: undefined,
      selectionSource: 'auto',
      directoryScoped: {},
    });

    useConfigStore.getState().applyDefaultModelAgentSelection({
      projectDefaultModel: 'anthropic/claude-opus-5',
      projectDefaultVariant: 'high',
    });

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('anthropic');
    expect(state.currentModelId).toBe('claude-opus-5');
    expect(state.currentVariant).toBe('high');
  });

  test('a thinking level the project model does not offer is ignored', async () => {
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('anthropic', 'claude-opus-5')],

      currentProviderId: '',
      currentModelId: '',
      currentVariant: undefined,
      settingsDefaultModel: undefined,
      selectionSource: 'auto',
      directoryScoped: {},
    });

    useConfigStore.getState().applyDefaultModelAgentSelection({
      projectDefaultModel: 'anthropic/claude-opus-5',
      projectDefaultVariant: 'high',
    });

    expect(useConfigStore.getState().currentVariant).toBe(undefined);
  });

  test('manual selection survives an in-flight loadAgents refresh', async () => {
    const pendingAgents = deferred<TestAgent[]>();
    getAgentsImpl = async () => pendingAgents.promise;
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('manual'), provider('default')],

      currentProviderId: 'default',
      currentModelId: 'default-model',
      currentAgentName: 'build',
      selectedProviderId: 'default',
      selectionSource: 'auto',
      directoryScoped: {
        [DIRECTORY]: {
          models: [],
          providers: [provider('manual'), provider('default')],

          currentProviderId: 'default',
          currentModelId: 'default-model',
          currentAgentName: 'build',
          selectedProviderId: 'default',
          agentModelSelections: {},
          defaultProviders: {},
          selectionSource: 'auto',
        },
      },
    });

    const load = refreshComposerCatalog(DIRECTORY);
    useConfigStore.setState((state) => ({
      currentProviderId: 'manual',
      currentModelId: 'manual-model',
      currentAgentName: 'manual-agent',
      selectedProviderId: 'manual',
      selectionSource: 'manual',
      directoryScoped: {
        ...state.directoryScoped,
        [DIRECTORY]: {
          ...state.directoryScoped[DIRECTORY],
          currentProviderId: 'manual',
          currentModelId: 'manual-model',
          currentAgentName: 'manual-agent',
          selectedProviderId: 'manual',
          selectionSource: 'manual',
        },
      },
    }));
    pendingAgents.resolve([
      testAgent('build', { model: { providerId: 'default', modelId: 'default-model' } }),
      testAgent('manual-agent'),
    ]);
    await load;

    const state = useConfigStore.getState();
    expect(state.currentAgentName).toBe('manual-agent');
    expect(state.currentProviderId).toBe('manual');
    expect(state.currentModelId).toBe('manual-model');
    expect(state.selectionSource).toBe('manual');
  });

  test('native refresh retires earlier reads and both callers receive the replacement catalog', async () => {
    const stale = Promise.withResolvers<Agent[]>();
    const fresh = Promise.withResolvers<Agent[]>();
    const replacementStarted = Promise.withResolvers<void>();
    let calls = 0;
    getAgentsImpl = async () => {
      if (++calls === 1) return stale.promise;
      replacementStarted.resolve();
      return fresh.promise;
    };
    const startup = refreshComposerCatalog(DIRECTORY);
    const refresh = refreshComposerCatalog(DIRECTORY);
    stale.resolve([testAgent('build')]);
    await replacementStarted.promise;
    fresh.resolve([testAgent('build'), testAgent('plugin-agent')]);
    expect(await Promise.all([startup, refresh])).toEqual([true, true]);
    expect(calls).toBe(2);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((agent) => agent.agentId)).toContain('plugin-agent');
  });


  test('OMP defaults override a native agent model without closing the add-provider settings flow', async () => {
    seedAgentCatalog([
      testAgent('build', { model: { providerId: 'anthropic', modelId: 'claude' } }),
      testAgent('review', { model: { providerId: 'openai', modelId: 'gpt-5.5' } }),
    ], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('openai', 'gpt-5.5'), provider('anthropic', 'claude')],

      currentProviderId: 'anthropic',
      currentModelId: 'claude',
      currentAgentName: 'build',
      settingsDefaultModel: 'openai/gpt-5.5',
      selectedProviderId: '__add_provider__',
      selectionSource: 'auto',
      directoryScoped: {
        [DIRECTORY]: {
          models: [],
          providers: [provider('openai', 'gpt-5.5'), provider('anthropic', 'claude')],

          currentProviderId: 'anthropic',
          currentModelId: 'claude',
          currentAgentName: 'build',
          selectedProviderId: '__add_provider__',
          agentModelSelections: {},
          defaultProviders: {},
          selectionSource: 'auto',
        },
      },
    });

    persistedOpenChamberSettings = { zenModel: 'zen-model' };
    expect(await useConfigStore.getState().loadSessionDefaults()).toBe(true);

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('openai');
    expect(state.currentModelId).toBe('gpt-5.5');
    expect(state.directoryScoped[DIRECTORY]?.currentProviderId).toBe('openai');
    expect(state.directoryScoped[DIRECTORY]?.currentModelId).toBe('gpt-5.5');
    expect(state.selectedProviderId).toBe('__add_provider__');
    expect(state.directoryScoped[DIRECTORY]?.selectedProviderId).toBe('__add_provider__');
  });




  test('persisted config keeps selections but no provider or agent catalogs', () => {
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('live')],

      providersLoaded: true,

      currentProviderId: 'live',
      currentModelId: 'live-model',
      currentAgentName: 'build',
      directoryScoped: {
        [DIRECTORY]: {
          models: [],
          providersLoaded: true,

          providers: [provider('live')],

          currentProviderId: 'live',
          currentModelId: 'live-model',
          currentAgentName: 'build',
          selectedProviderId: 'live',
          agentModelSelections: { build: { providerId: 'live', modelId: 'live-model' } },
          defaultProviders: { live: 'live-model' },
        },
        [OTHER_DIRECTORY]: {
          models: [],
          providersLoaded: true,

          providers: [provider('other')],

          currentProviderId: 'other',
          currentModelId: 'other-model',
          currentAgentName: 'review',
          selectedProviderId: 'other',
          agentModelSelections: {},
          defaultProviders: { other: 'other-model' },
        },
      },
    });

    const persisted = JSON.parse(persistedConfig());
    expect(persisted.state.providers).toBeUndefined();
    expect(persisted.state.agents).toBeUndefined();
    for (const directory of [DIRECTORY, OTHER_DIRECTORY]) {
      const snapshot = persisted.state.directoryScoped[directory];
      expect(snapshot.providers).toBeUndefined();
      expect(snapshot.agents).toBeUndefined();
      expect(snapshot.providersLoaded).toBeUndefined();
      expect(snapshot.agentsLoaded).toBeUndefined();
    }
    expect(persisted.state.currentProviderId).toBe('live');
    expect(persisted.state.directoryScoped[DIRECTORY].currentAgentName).toBe('build');
    expect(persisted.state.directoryScoped[DIRECTORY].agentModelSelections).toEqual({ build: { providerId: 'live', modelId: 'live-model' } });
    expect(persisted.state.directoryScoped[OTHER_DIRECTORY].currentModelId).toBe('other-model');
    expect(persisted.state.directoryScoped[OTHER_DIRECTORY].defaultProviders).toEqual({ other: 'other-model' });
  });

  // Builds without the slim format read `snapshot.agents.find` straight away;
  // a newer version makes them skip this blob (no migrate) instead of crashing.
  test('persisted config is written as version 1', () => {
    useConfigStore.setState({ activeDirectoryKey: DIRECTORY, currentModelId: 'live-model' });

    const persisted = JSON.parse(persistedConfig());
    expect(persisted.version).toBe(1);
  });

  test('a persisted snapshot without catalogs hydrates its selections and empty catalogs', async () => {
    seedConfig(JSON.stringify({
      state: {
        configRuntimeKey: getRuntimeKey(),
        activeDirectoryKey: DIRECTORY,
        directoryScoped: {
          [DIRECTORY]: {
            models: [],
            currentProviderId: 'stale',
            currentModelId: 'stale-model',
            currentAgentName: 'build',
            selectedProviderId: 'stale',
            agentModelSelections: {},
            defaultProviders: { stale: 'stale-model' },
          },
          [OTHER_DIRECTORY]: {
            models: [],
            currentProviderId: 'other-stale',
            currentModelId: 'other-stale-model',
            currentAgentName: 'review',
            selectedProviderId: 'other-stale',
            agentModelSelections: {},
            defaultProviders: {},
          },
        },
        currentProviderId: 'stale',
        currentModelId: 'stale-model',
      },
      version: 0,
    }));

    await useConfigStore.persist.rehydrate();

    const hydrated = useConfigStore.getState();
    expect(hydrated.directoryScoped[DIRECTORY]?.providers).toEqual([]);
    expect(hydrated.directoryScoped[DIRECTORY]).not.toHaveProperty('agents');
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.providers).toEqual([]);
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.currentAgentName).toBe('review');
    expect(hydrated.directoryScoped[DIRECTORY]?.currentModelId).toBe('stale-model');
    // A snapshot without catalogs is not a legacy cache with incompatible
    // variants, so its defaults survive.
    expect(hydrated.directoryScoped[DIRECTORY]?.defaultProviders).toEqual({ stale: 'stale-model' });
    expect(hydrated.defaultProviders).toEqual({ stale: 'stale-model' });
    expect(selectCatalogLoadedForDirectory(hydrated, 'models', DIRECTORY)).toBe(false);

    liveProviderId = 'fresh';
    await hydrated.initializeApp();

    const reloaded = useConfigStore.getState();
    expect(reloaded.providers.map((entry) => entry.providerId)).toEqual(['fresh']);
    expect(reloaded.directoryScoped[DIRECTORY]?.providers.map((entry) => entry.providerId)).toEqual(['fresh']);
  });

  describe('setters write config-store only when the selection changes', () => {
    afterEach(() => {
      storage = new Map<string, string>();
    });

    class CountingMap extends Map<string, string> {
      private writes = 0;

      get configWrites() { flushDeferredStorage(); return this.writes; }
      set configWrites(value: number) { flushDeferredStorage(); this.writes = value; }

      override set(key: string, value: string) {
        if (key === STORAGE_KEY) this.writes += 1;
        return super.set(key, value);
      }
    }

    const settledSelection = () => {
      seedAgentCatalog([testAgent('build')], DIRECTORY);
      useConfigStore.setState({
        activeDirectoryKey: DIRECTORY,
        providers: [provider('live')],

        currentProviderId: 'live',
        currentModelId: 'live-model',
        currentAgentName: 'build',
        agentSelectionSource: 'manual',
        selectionSource: 'manual',
        directoryScoped: {
          [DIRECTORY]: {
            models: [],
            providers: [provider('live')],

            currentProviderId: 'live',
            currentModelId: 'live-model',
            currentAgentName: 'build',
            agentSelectionSource: 'manual',
            selectionSource: 'manual',
            selectedProviderId: 'live',
            agentModelSelections: {},
            defaultProviders: {},
          },
        },
      });
      flushDeferredStorage();
      const counting = new CountingMap(storage);
      storage = counting;
      return counting;
    };

    test('setModel with the current model', () => {
      const counting = settledSelection();
      useConfigStore.getState().setModel('live-model');
      expect(counting.configWrites).toBe(0);
    });

    test('setProvider with the current provider and model', () => {
      const counting = settledSelection();
      useConfigStore.getState().setProvider('live');
      expect(counting.configWrites).toBe(0);
    });

    test('setAgent with the current agent', () => {
      const counting = settledSelection();
      useConfigStore.getState().setAgent('build');
      expect(counting.configWrites).toBe(0);
      expect(useConfigStore.getState().currentModelId).toBe('live-model');
    });

    test("setAgent with the current native agent pinned to the current model", () => {
      const pinned = testAgent('build', { model: { providerId: 'live', modelId: 'live-model' } });
      const counting = settledSelection();
      seedAgentCatalog([pinned]);
      useConfigStore.setState((state) => ({
        selectionSource: 'auto',
        currentVariantSelection: { override: undefined, inherited: undefined },
        directoryScoped: { [DIRECTORY]: { ...state.directoryScoped[DIRECTORY], selectionSource: 'auto' } },
        models: [],
      }));
      counting.configWrites = 0;
      useConfigStore.getState().setAgent('build');
      expect(counting.configWrites).toBe(0);
      expect(useConfigStore.getState().currentModelId).toBe('live-model');
      expect(useConfigStore.getState().selectionSource).toBe('auto');
    });

    test('setModel with another model writes it', () => {
      const counting = settledSelection();
      useConfigStore.getState().setModel('other-model');
      expect(counting.configWrites).toBe(1);
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentModelId).toBe('other-model');
    });

    test('setAgent with another agent writes it', () => {
      const counting = settledSelection();
      useConfigStore.getState().setAgent('review');
      expect(counting.configWrites).toBeGreaterThan(0);
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentAgentName).toBe('review');
    });

    test('a setter writes when the active directory has no snapshot yet, and creates it', () => {
      const counting = settledSelection();
      useConfigStore.setState({ directoryScoped: {} });
      counting.configWrites = 0;
      useConfigStore.getState().setModel('live-model');
      expect(counting.configWrites).toBe(1);
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentModelId).toBe('live-model');
    });

    test('a setter writes when the snapshot disagrees with the top-level selection', () => {
      const counting = settledSelection();
      useConfigStore.setState((state) => ({
        directoryScoped: { [DIRECTORY]: { ...state.directoryScoped[DIRECTORY], currentModelId: 'old-model' } },
        models: [],
      }));
      counting.configWrites = 0;
      useConfigStore.getState().setModel('live-model');
      expect(counting.configWrites).toBe(1);
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentModelId).toBe('live-model');
    });

    test('setAgent(undefined) writes once to clear an agent, then not again', () => {
      const counting = settledSelection();
      useConfigStore.getState().setAgent(undefined);
      expect(counting.configWrites).toBe(1);
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.currentAgentName).toBeUndefined();
      expect(useConfigStore.getState().directoryScoped[DIRECTORY]?.agentSelectionSource).toBe('auto');

      counting.configWrites = 0;
      useConfigStore.getState().setAgent(undefined);
      expect(counting.configWrites).toBe(0);
    });
  });

  test('selections round-trip through storage without catalogs, which read as not loaded', async () => {
    seedAgentCatalog([testAgent('build')], DIRECTORY);
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider('live')],

      directoryScoped: {
        [DIRECTORY]: { providers: [provider('live')], models: [], currentProviderId: 'live', currentModelId: 'live-model', currentAgentName: undefined, selectedProviderId: 'live', agentModelSelections: {}, defaultProviders: {} },
        [OTHER_DIRECTORY]: { providersLoaded: true, providers: [provider('other')], models: [], currentProviderId: 'other', currentModelId: 'other-model', currentAgentName: 'review', selectedProviderId: 'other', agentModelSelections: {}, defaultProviders: {} },
      },
    });
    useConfigStore.getState().setModel('live-model');
    useConfigStore.getState().setAgent('build');
    const written = persistedConfig();
    // Clearing the store writes too, so the saved blob is put back before rehydrating.
    seedAgentCatalog([], useConfigStore.getState().activeDirectoryKey);
    useConfigStore.setState({ directoryScoped: {}, providers: [], currentModelId: '', currentAgentName: undefined });
    writePersistedConfig(written);

    useAgentsStore.getState().resetForRuntimeSwitch();
    await useConfigStore.persist.rehydrate();

    const hydrated = useConfigStore.getState();
    expect(hydrated.directoryScoped[DIRECTORY]?.currentModelId).toBe('live-model');
    expect(hydrated.directoryScoped[DIRECTORY]?.currentAgentName).toBe('build');
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.currentModelId).toBe('other-model');
    expect(hydrated.directoryScoped[OTHER_DIRECTORY]?.providers).toEqual([]);
    expect(selectCatalogLoadedForDirectory(hydrated, 'models', OTHER_DIRECTORY)).toBe(false);
    expect((selectAgentCatalogStatus(useAgentsStore.getState(), OTHER_DIRECTORY) === 'ready')).toBe(false);
  });
  test('setAgent binds a native ID to its native provider/model pair, not its display name', () => {
    seedAgentCatalog([testAgent('profile:review', { name: 'Review', model: { providerId: 'native', modelId: 'reasoner' } })]);
    useConfigStore.setState({ providers: [provider('native', 'reasoner', ['high'])], settingsDefaultModel: 'native/reasoner' });
    useConfigStore.getState().setAgent('profile:review');
    expect(useConfigStore.getState()).toMatchObject({ currentAgentName: 'profile:review', currentProviderId: 'native', currentModelId: 'reasoner' });
    expect(useConfigStore.getState()).not.toHaveProperty('agents');
  });

  test('defaults to disabled until the user enables it', () => {
    expect(useConfigStore.getState().ttsChunkedMode).toBe(false);
  });
});

describe('stale Auto selection', () => {
  const AUTO = { currentProviderId: 'openchamber', currentModelId: 'auto' };

  beforeEach(() => {
    useUIStore.setState({ routingFeatureAvailable: false });
    useRoutingStore.getState().resetForRuntime();
    useConfigStore.setState({ settingsDefaultsLoaded: true });
  });

  test('a manual Auto pick is replaced on providers load when this server has no routing', async () => {
    useConfigStore.setState({ ...AUTO, selectionSource: 'manual' });
    await useConfigStore.getState().loadProviders({ directory: DIRECTORY });
    expect(useConfigStore.getState().currentProviderId).not.toBe('openchamber');
    expect(useConfigStore.getState().currentModelId).not.toBe('auto');
  });

  test('Auto survives while routing readiness is unknown and while it is ready', async () => {
    useUIStore.setState({ routingFeatureAvailable: true });
    useConfigStore.setState({ ...AUTO, selectionSource: 'manual', providers: [provider('live')], providersLoaded: true });
    useConfigStore.getState().dropStaleAutoSelection();
    expect(useConfigStore.getState().currentModelId).toBe('auto');

    useRoutingStore.setState({ loaded: true, available: true, autoReady: true, tokenPresent: true });
    useConfigStore.getState().dropStaleAutoSelection();
    expect(useConfigStore.getState().currentModelId).toBe('auto');
  });

  test('Auto is dropped, and the session pick overwritten, once routing reports not ready', () => {
    useUIStore.setState({ routingFeatureAvailable: true });
    useRoutingStore.setState({ loaded: true, available: true, autoReady: false, tokenPresent: false });
    const sessionId = 'ses_auto';
    useSessionUIStore.setState({ currentSessionId: sessionId });
    useSelectionStore.getState().saveSessionModelSelection(sessionId, 'openchamber', 'auto');
    useConfigStore.setState({ ...AUTO, selectionSource: 'manual', providers: [provider('live')], providersLoaded: true });

    useConfigStore.getState().dropStaleAutoSelection();

    const state = useConfigStore.getState();
    expect(state.currentProviderId).toBe('live');
    expect(state.currentModelId).toBe('live-model');
    expect(state.selectionSource).toBe('auto');
    expect(useSelectionStore.getState().getSessionModelSelection(sessionId)).toEqual({ providerId: 'live', modelId: 'live-model' });
  });
});

describe('getModelMetadata limits', () => {
  test('the running OpenCode limits override the models.dev catalog', () => {
    const live = provider('openai', 'gpt-6-astra');
    live.models[0].contextWindow = 400_000;
    live.models[0].maxOutputTokens = 128_000;
    useConfigStore.setState({
      providers: [live],
      modelsMetadata: new Map([['openai/gpt-6-astra', {
        id: 'gpt-6-astra',
        providerId: 'openai',
        name: 'GPT-6 Astra',
        limit: { context: 1_050_000, output: 128_000 },
      }]]),
    });

    const metadata = useConfigStore.getState().getModelMetadata('openai', 'gpt-6-astra');
    expect(metadata?.name).toBe('GPT-6 Astra');
    expect(metadata?.limit).toEqual({ context: 400_000, output: 128_000 });
  });

});
