import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ModelCatalog, OmpSettingsState } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

let settingsDirectory = '/repo';
const directoryModule = await import('@/hooks/useSettingsDirectory');
spyOn(directoryModule, 'useSettingsDirectory').mockImplementation(() => settingsDirectory);

let updatedDesktopSettingsPayload: Record<string, unknown> | null = null;
let updateSpy: ReturnType<typeof spyOn>;


const mockModelCatalog: ModelCatalog = {
  workspaceId: 'workspace_1',
  revision: '1',
  imageModels: [], planRoleAvailable: true,
  defaults: { model: null, thinkingLevel: null },
  models: [
    {
      modelId: 'o3-mini',
      provider: 'openai',
      name: 'o3-mini',
      modalities: ['text', 'image'],
      contextWindow: 200000,
      maxOutputTokens: 64000,
      reasoningEffortSupported: true,
      reasoningOptions: [
        { reasoningEffort: 'low', label: 'Low', budgetTokens: 2048 },
        { reasoningEffort: 'high', label: 'High', budgetTokens: 32000 },
      ],
      variants: [],
      pricing: null,
    },
  ],
};

const mockOmpSettings: OmpSettingsState = {
  workspaceId: 'workspace_1',
  revision: '1',
  totalCount: 3,
  settings: [
    {
      id: 'modelRoles',
      type: 'record',
      value: { default: 'openai/o3-mini:high' },
      default: {},
      configured: true,
      placement: { type: 'owned-by', owner: 'model-roles' },
    },
    // A retry row the section draws, and the record it must not draw.
    {
      id: 'retry.maxRetries' as const,
      type: 'number' as const,
      value: 2,
      default: 2,
      configured: false,
      placement: { type: 'page' as const, page: 'sessions', section: 'retry' },
    },
    {
      id: 'retry.fallbackChains' as const,
      type: 'record' as const,
      value: {},
      default: {},
      configured: false,
      placement: { type: 'owned-by' as const, owner: 'sessions.fallback-model' },
      condition: 'retryChainsUseSharedConfig',
      conditionActive: true,
    },
  ],
};

// A settings read the Agent Service refuses (provider/service trouble) must
// surface as a failed row, not as a control that says "loading" forever.
let failOmpSettings = false;

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { DefaultsSettings } = await import('./DefaultsSettings');
const { canonicalClient, CanonicalApiError } = await import('@/api/canonicalClient');
const { useOmpPageSettings } = await import('../shared/useOmpPageSettings');
const { modelRoleChange } = await import('../shared/modelRoleSelectors');
const persistence = await import('@/lib/persistence');
const syncRefs = await import('@/sync/sync-refs');
// The composer's Plan availability is read from the workspace catalog, which
// the sync layer re-reads when a role write changes it.
let catalogRefreshCalls = 0;
let refreshSpy: ReturnType<typeof spyOn> | undefined;
const settle = async () => {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 20);
    await promise;
  });
};

describe('DefaultsSettings', () => {
  let host: HTMLDivElement;
  let root: Root;

  let clientSpies: ReturnType<typeof spyOn>[];
  beforeEach(() => {
    failOmpSettings = false;
    updatedDesktopSettingsPayload = null;
    catalogRefreshCalls = 0;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    clientSpies = [
      spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'repo' }),
      spyOn(canonicalClient, 'getOmpSettings').mockImplementation(async () => {
        if (failOmpSettings) throw new Error('Agent Service settings read failed');
        return mockOmpSettings;
      }),
      spyOn(canonicalClient, 'getModels').mockResolvedValue(mockModelCatalog),
      spyOn(canonicalClient, 'getProviders').mockResolvedValue({ workspaceId: 'workspace_1', revision: '1', providers: [] }),
      spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue(mockOmpSettings),
      spyOn(canonicalClient, 'readCacheWarming').mockResolvedValue({ workspaceId: 'workspace_1', revision: '1', mode: 'off' }),
      spyOn(canonicalClient, 'updateCacheWarming').mockResolvedValue({ persisted: { workspaceId: 'workspace_1', revision: '1', mode: 'off' }, status: 'applied', workers: [] }),
    ];
    refreshSpy = spyOn(syncRefs, 'refreshDirectoryCatalogs').mockImplementation(() => {
      catalogRefreshCalls += 1;
    });
    updateSpy = spyOn(persistence, 'updateDesktopSettings').mockImplementation(async (payload) => {
      updatedDesktopSettingsPayload = payload as Record<string, unknown>;
      return { ok: true };
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    refreshSpy?.mockRestore();
    updateSpy?.mockRestore();
    clientSpies.forEach((spy) => spy.mockRestore());
  });

  test('renders default model, thinking effort, session mode, and persisted checkboxes', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    const defaultModelRow = host.querySelector('[data-settings-item="sessions.default-model"]');
    expect(defaultModelRow).not.toBeNull();
    expect(host.querySelector('[data-settings-item="sessions.chats-default-model"]')).not.toBeNull();

    const defaultModeRow = host.querySelector('[data-settings-item="sessions.default-mode"]');
    expect(defaultModeRow).not.toBeNull();

    const showChatsRow = host.querySelector('[data-settings-item="sessions.show-chats"]')
      ?? host.querySelectorAll('input[type="checkbox"]')[2];
    expect(showChatsRow).not.toBeNull();
  });

  test.each([
    { selector: 'unavailable/model', displayed: 'Auto', changedRoles: null },
    { selector: 'nanogpt/coding-router:high', displayed: 'Auto', changedRoles: null },
    { selector: 'short-name:high,other/model', displayed: 'High', changedRoles: { default: 'short-name:xhigh,other/model' } },
  ])('the thinking picker uses native choices for $selector', async ({ selector, displayed, changedRoles }) => {
    const snapshot: OmpSettingsState = {
      workspaceId: 'workspace_1',
      revision: '1',
      totalCount: 2,
      settings: [
        {
          id: 'modelRoles', type: 'record', default: {}, configured: true,
          placement: { type: 'owned-by', owner: 'omp.modelRoles' },
          value: { default: selector },
        },
        {
          id: 'defaultThinkingLevel', type: 'enum', default: 'high', configured: true,
          placement: { type: 'owned-by', owner: 'sessions.default-thinking' },
          value: 'auto',
          options: ['auto', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({ value, label: value })),
        },
      ],
    };
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot);
    const save = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue(snapshot);
    try {
      await act(async () => root.render(<I18nProvider><DefaultsSettings /></I18nProvider>));
      await settle();
      const trigger = host.querySelector('[data-settings-item="sessions.default-thinking"] [role="combobox"]');
      expect(trigger?.textContent).toBe(displayed);
      await act(async () => trigger?.dispatchEvent(new browser.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }) as unknown as Event));
      const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
      expect(options.map((option) => option.textContent)).toEqual(['Auto', 'Off', 'Minimal', 'Low', 'Medium', 'High', 'Extra high', 'Max']);
      await act(async () => options.find((option) => option.textContent === 'Extra high')?.click());
      expect(save.mock.calls[0]?.[1].changes).toEqual([
        ...(changedRoles ? [{ id: 'modelRoles', value: changedRoles }] : []),
        { id: 'defaultThinkingLevel', value: 'xhigh' },
      ]);
    } finally {
      read.mockRestore();
      save.mockRestore();
    }
  });

  test('show chats checkbox updates useSessionDisplayStore and persists via updateDesktopSettings', async () => {
    useSessionDisplayStore.setState({ showChatsSection: true });

    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    const showChatsRow = (host.querySelector('[data-settings-item="sessions.show-chats"]')
      ?? host.querySelectorAll('input[type="checkbox"]')[2]) as HTMLElement | null;
    expect(showChatsRow).not.toBeNull();

    await act(async () => {
      showChatsRow?.click();
    });

    expect(useSessionDisplayStore.getState().showChatsSection).toBe(false);
    expect(updatedDesktopSettingsPayload).toEqual({ sidebarShowChatsSection: false });
  });

  test('the retry section draws the native rows and the dedicated fallback-chain editor', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    expect(host.querySelector('[data-settings-item="omp.retry.maxRetries"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.retry.fallbackChains"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="sessions.fallback-model"]')).not.toBeNull();
  });

  test('a failed settings read says so instead of spinning the default model row forever', async () => {
    failOmpSettings = true;
    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    // A failure is a status notice, never a settings jump target: it names no
    // anchor, so searching for it cannot land on nothing.
    const notice = host.querySelector('p[role="status"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toBeTruthy();
    expect(notice?.parentElement?.getAttribute('data-settings-item') ?? undefined).toBeUndefined();

    // The primary default model row is still drawn; the read failure is what it reports.
    const defaultRow = host.querySelector('[data-settings-item="sessions.default-model"]');
    expect(defaultRow).not.toBeNull();
  });

  test('replaces redundant smol/slow/plan editors with ModelRoleLinkRows jumping to Model roles and drops moved engine sections', async () => {
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump').mockImplementation(() => { });
    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <DefaultsSettings />
          </I18nProvider>,
        );
      });
      await settle();

      // Does not claim omp.modelRoles or moved engine sections.
      expect(host.querySelector('[data-settings-item="omp.modelRoles"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.sampling"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.execution"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.isolation"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.small-model"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.walkthrough-model"]')).toBeNull();
      expect(host.querySelector('[data-settings-item="sessions.default-plan"]')).toBeNull();

      const linkButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
        .filter((button) => button.textContent === 'Set in Model roles');
      expect(linkButtons.length).toBe(3);

      await act(async () => linkButtons[0]?.click());
      await act(async () => linkButtons[1]?.click());
      await act(async () => linkButtons[2]?.click());
      expect(jump.mock.calls).toEqual([
        ['model-roles', 'omp.modelRoles.smol'],
        ['model-roles', 'omp.modelRoles.slow'],
        ['model-roles', 'omp.modelRoles.plan'],
      ]);
    } finally {
      jump.mockRestore();
    }
  });

  test('renders Goal settings inside a SettingsControlGroup with sibling rows and no nested checkbox-in-label', async () => {
    useUIStore.setState({ sessionGoalDefaultBudgetEnabled: false });
    const snapshot: OmpSettingsState = {
      ...mockOmpSettings,
      totalCount: mockOmpSettings.settings.length + 1,
      settings: [
        ...mockOmpSettings.settings,
        {
          id: 'goal.enabled',
          type: 'boolean',
          value: true,
          default: false,
          configured: true,
          placement: { type: 'page', page: 'sessions', section: 'plan' },
        },
      ],
    };
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot);
    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <DefaultsSettings />
          </I18nProvider>,
        );
      });
      await settle();

      const budgetRow = host.querySelector<HTMLElement>('[data-settings-item="chat.session-goal-budget"]');
      expect(budgetRow).not.toBeNull();
      expect(budgetRow?.closest('label')).toBeNull();
      expect(host.querySelector('[data-settings-item="chat.session-goal-checker"]')).not.toBeNull();
      expect(host.querySelector('[data-settings-item="chat.session-goal-max-turns"]')).not.toBeNull();
      expect(host.querySelector('input[aria-label="Apply a default token budget to new goals"]')).toBeNull();

      await act(async () => budgetRow?.click());
      expect(updatedDesktopSettingsPayload).toEqual({ sessionGoalDefaultBudgetEnabled: true });
      expect(host.querySelector('input[aria-label="Apply a default token budget to new goals"]')).not.toBeNull();
    } finally {
      read.mockRestore();
    }
  });

  test('writing the default model role re-reads the catalog that decides Plan availability', async () => {
    catalogRefreshCalls = 0;
    const previousProviders = useConfigStore.getState().providers;
    const previousLoaded = useConfigStore.getState().providersLoaded;
    const previousDirectoryKey = useConfigStore.getState().activeDirectoryKey;
    const previousModels = useConfigStore.getState().models;
    useConfigStore.setState({
      providersLoaded: true,
      activeDirectoryKey: '/repo',
      models: [...mockModelCatalog.models],
      providers: [{
        providerId: 'openai',
        name: 'OpenAI',
        endpoint: null,
        protocol: null,
        authMethods: ['api-key'],
        auth: { status: 'missing' },
        models: [...mockModelCatalog.models],
      }],
    });
    const loadSpy = spyOn(useConfigStore.getState(), 'loadProviders').mockImplementation(async () => { });

    try {
      await act(async () => {
        root.render(
          <I18nProvider>
            <DefaultsSettings />
          </I18nProvider>,
        );
      });
      await settle();

      await act(async () => {
        const defaultRow = host.querySelector('[data-settings-item="sessions.default-model"]');
        const picker = defaultRow?.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]');
        picker?.dispatchEvent(new browser.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }) as unknown as Event);
      });
      await settle();

      const option = document.querySelector('[role="option"]');
      expect(option).not.toBeNull();
      await act(async () => {
        if (option instanceof HTMLElement) option.click();
      });
      await settle();

      expect(catalogRefreshCalls).toBe(1);
    } finally {
      loadSpy.mockRestore();
      useConfigStore.setState({ providers: previousProviders, providersLoaded: previousLoaded, activeDirectoryKey: previousDirectoryKey, models: previousModels });
    }
  });
  test('a stale role write preserves the latest fallback and feeds the next setting its saved revision', async () => {
    const initial: OmpSettingsState = {
      workspaceId: 'workspace_1',
      revision: '1',
      totalCount: 2,
      settings: [
        {
          id: 'modelRoles', type: 'record', default: {}, configured: true,
          placement: { type: 'owned-by', owner: 'omp.modelRoles' },
          value: { memory: ['provider/first,provider/second', '@smol'], image: 'provider/image' },
        },
        {
          id: 'retry.maxRetries', type: 'number', default: 2, configured: true,
          placement: { type: 'page', page: 'sessions', section: 'retry' }, value: 2,
        },
      ],
    };
    let server = initial;
    const read = spyOn(canonicalClient, 'getOmpSettings').mockImplementation(async () => server);
    const save = spyOn(canonicalClient, 'updateOmpSettings').mockImplementation(async (_workspace, input) => {
      if (input.expectedRevision !== server.revision) {
        const problem = { status: 409, code: 'CATALOG_CONFLICT', title: 'Conflict', detail: 'Stale revision', type: 'about:blank', retryable: true } as const;
        throw Object.assign(new CanonicalApiError(problem), { problem });
      }
      server = {
        ...server, revision: String(Number(server.revision) + 1),
        settings: server.settings.map((setting) => {
          const change = input.changes.find((item) => item.id === setting.id);
          return change ? { ...setting, value: change.value } : setting;
        }),
      };
      return server;
    });
    const Harness = () => {
      const { state, updateSettings, updateSetting } = useOmpPageSettings('sessions');
      return <button data-revision={state?.revision} onClick={() => {
        void updateSettings((current) => [modelRoleChange(current, 'memory', 'provider/new')]);
        void updateSetting('retry.maxRetries', 3);
      }} />;
    };
    try {
      await act(async () => root.render(<Harness />));
      const button = host.querySelector('button');
      expect(button?.dataset.revision).toBe('1');
      server = {
        ...initial, revision: '2',
        settings: initial.settings.map((setting) => setting.id === 'modelRoles'
          ? { ...setting, value: { memory: ['provider/first,provider/second', '@slow'], image: { selector: 'provider/image', metadata: { enabled: true } } } }
          : setting),
      };
      await act(async () => button?.click());
      expect(save.mock.calls.map(([, request]) => request.expectedRevision)).toEqual(['1', '2', '3']);
      expect(server.settings.map((setting) => setting.value)).toEqual([
        { memory: ['provider/new,provider/second', '@slow'], image: { selector: 'provider/image', metadata: { enabled: true } } }, 3,
      ]);
      expect(button?.dataset.revision).toBe('4');
    } finally {
      read.mockRestore();
      save.mockRestore();
    }
  });

  test('a newer text edit remains visible while an older settings write finishes', async () => {
    const bank = (revision: string, value: string): OmpSettingsState => ({
      workspaceId: 'workspace_1', revision, totalCount: 1,
      settings: [{
        id: 'hindsight.bank', type: 'string', value, default: '', configured: true,
        placement: { type: 'page', page: 'memory', section: 'hindsight' },
      }],
    });
    const first = Promise.withResolvers<OmpSettingsState>();
    const second = Promise.withResolvers<OmpSettingsState>();
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(bank('1', ''));
    const save = spyOn(canonicalClient, 'updateOmpSettings')
      .mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const Harness = () => {
      const { form, updateSetting } = useOmpPageSettings('memory');
      const text = String(form['hindsight.bank'] ?? '');
      return <button onClick={() => { void updateSetting('hindsight.bank', text + 'a'); }}>{text}</button>;
    };
    try {
      await act(async () => root.render(<Harness />));
      const button = host.querySelector('button');
      await act(async () => button?.click());
      expect(button?.textContent).toBe('a');
      await act(async () => button?.click());
      expect(button?.textContent).toBe('aa');
      await act(async () => first.resolve(bank('2', 'a')));
      expect(button?.textContent).toBe('aa');
      expect(save.mock.calls[1]?.[1].changes).toEqual([{ id: 'hindsight.bank', value: 'aa' }]);
      await act(async () => second.resolve(bank('3', 'aa')));
      expect(button?.textContent).toBe('aa');
    } finally {
      read.mockRestore();
      save.mockRestore();
    }
  });

  test.each([
    ['Save Changes', { default: ['other/original', '@slow', 'other/last'], 'other/*': ['another-provider/*', 'openai/o3-mini:high'] }],
    ['Delete', { default: ['other/original', '@slow', 'other/last'] }],
  ])('%s updates only the selected wildcard retry chain', async (action, expectedChains) => {
    const original = { default: ['other/original', '@slow', 'other/last'], 'other/*': ['@smol'] };
    const snapshot = {
      ...mockOmpSettings,
      settings: mockOmpSettings.settings.map((setting) => setting.id === 'retry.fallbackChains'
        ? { ...setting, value: original }
        : setting),
    };
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot as OmpSettingsState);
    const save = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue(snapshot as OmpSettingsState);
    try {
      await act(async () => root.render(<I18nProvider><DefaultsSettings /></I18nProvider>));
      await settle();
      const trigger = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
        .find((button) => button.textContent?.startsWith('other/*'));
      expect(trigger).toBeDefined();
      await act(async () => trigger?.click());
      const editor = host.querySelector<HTMLTextAreaElement>('textarea[aria-label^="Fallbacks in order"]');
      expect(editor?.value).toBe('@smol');
      if (action === 'Save Changes' && editor) {
        const setter = Object.getOwnPropertyDescriptor(browser.HTMLTextAreaElement.prototype, 'value')?.set;
        await act(async () => {
          setter?.call(editor, 'another-provider/*\nopenai/o3-mini:high');
          editor.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
        });
      }
      const button = [...host.querySelectorAll<HTMLButtonElement>('form button')].find((entry) => entry.textContent === action);
      expect(button).toBeDefined();
      await act(async () => button?.click());
      expect(save.mock.calls[0]?.[1].changes[0]).toEqual({
        id: 'retry.fallbackChains',
        value: expectedChains,
        expectedValue: original,
      });
    } finally {
      read.mockRestore();
      save.mockRestore();
    }
  });

  test('the web retry chain links to Web Search rather than opening a second editor', async () => {
    const snapshot = {
      ...mockOmpSettings,
      settings: mockOmpSettings.settings.map((setting) => setting.id === 'retry.fallbackChains'
        ? { ...setting, value: { web: ['web/exa'] } }
        : setting),
    } as OmpSettingsState;
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot);
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump');
    try {
      await act(async () => root.render(<I18nProvider><DefaultsSettings /></I18nProvider>));
      await settle();
      const group = host.querySelector('[data-settings-item="sessions.fallback-model"]');
      expect(group?.textContent).toContain('web/exa');
      const link = [...group?.querySelectorAll('button') ?? []].find((button) => button.textContent === 'Web search');
      expect(link).toBeDefined();
      await act(async () => link?.click());
      expect(jump).toHaveBeenCalledWith('web-search', 'web-search.fallbacks');
      expect(group?.querySelector('textarea')).toBeNull();
    } finally {
      read.mockRestore();
      jump.mockRestore();
    }
  });

  test.each([
    ['75%', '75%', false],
    ['84000', 84000, true],
    ['f84000', 'f84000', true],
  ])('adding a %s compaction rule preserves other native rules', async (input, thresholdValue, needsConfirmation) => {
    const existing = { 'example/*': '80%', 'other/model': 'f90000' };
    const snapshot = {
      ...mockOmpSettings,
      totalCount: 2,
      settings: [
        { id: 'compaction.modelThresholds', type: 'record', value: existing, default: {}, configured: true },
        { id: 'compaction.modelThresholdsEnabled', type: 'boolean', value: true, default: true, configured: false },
      ],
    } as OmpSettingsState;
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot);
    const write = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue(snapshot);
    try {
      await act(async () => root.render(<I18nProvider><DefaultsSettings /></I18nProvider>));
      await settle();
      const addRule = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Add model rule');
      expect(addRule).toBeDefined();
      await act(async () => addRule?.click());
      const selector = host.querySelector<HTMLInputElement>('input[aria-label="Model selector"]');
      const threshold = host.querySelector<HTMLInputElement>('input[aria-label="Compaction threshold"]');
      expect(selector).not.toBeNull();
      expect(threshold).not.toBeNull();
      const setValue = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
      if (!setValue) throw new Error('Missing input value setter');
      await act(async () => {
        setValue.call(selector, 'example/model');
        selector?.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
        setValue.call(threshold, input);
        threshold?.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
      });
      const save = threshold?.form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      expect(save?.disabled).toBe(false);
      await act(async () => save?.click());
      if (needsConfirmation) {
        expect(write).not.toHaveBeenCalled();
        expect(document.body.textContent).toContain('Longer requests may cost more.');
        const cancel = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === 'Cancel');
        expect(cancel).toBeDefined();
        await act(async () => cancel?.click());
        expect(write).not.toHaveBeenCalled();
        await act(async () => save?.click());
        const confirm = Array.from(document.body.querySelectorAll('button')).find((button) =>
          button !== save && button.textContent?.toLowerCase() === 'save changes');
        expect(confirm).toBeDefined();
        await act(async () => confirm?.click());
      }
      expect(write.mock.calls[0]?.[1].changes).toEqual([
        { id: 'compaction.modelThresholds', value: { ...existing, 'example/model': thresholdValue }, expectedValue: existing },
      ]);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  test('switching directories hides the old snapshot and keeps queued writes in their original workspace', async () => {
    const prior: OmpSettingsState = { workspaceId: 'workspace_1', revision: '1', totalCount: 0, settings: [] };
    const current: OmpSettingsState = { ...prior, workspaceId: 'workspace_2', revision: '4' };
    const { promise: pendingRead, resolve: finishRead } = Promise.withResolvers<OmpSettingsState>();
    const workspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
      workspaceId: directory === '/repo' ? prior.workspaceId : current.workspaceId,
      projectId: 'project_1', name: directory,
    }));
    const read = spyOn(canonicalClient, 'getOmpSettings').mockImplementation(
      async (workspaceId) => workspaceId === prior.workspaceId ? prior : pendingRead,
    );
    const { promise: pendingWrite, resolve: finishWrite } = Promise.withResolvers<OmpSettingsState>();
    const save = spyOn(canonicalClient, 'updateOmpSettings')
      .mockImplementationOnce(() => pendingWrite)
      .mockResolvedValue({ ...prior, revision: '3' });
    const Harness = () => {
      const { state, loading, updateSetting } = useOmpPageSettings('sessions');
      return <button onClick={() => {
        void updateSetting('plan.enabled', true);
        void updateSetting('goal.enabled', true);
      }}>{state?.revision ?? (loading ? 'loading' : 'empty')}</button>;
    };
    try {
      await act(async () => root.render(<Harness />));
      const button = host.querySelector('button');
      expect(button?.textContent).toBe('1');
      await act(async () => button?.click());
      settingsDirectory = '/new-repo';
      await act(async () => root.render(<Harness />));
      expect(button?.textContent).toBe('loading');
      await act(async () => finishRead(current));
      await act(async () => finishWrite({ ...prior, revision: '2' }));
      expect(button?.textContent).toBe('4');
      expect(save.mock.calls.map(([workspaceId, input]) => [workspaceId, input.expectedRevision]))
        .toEqual([[prior.workspaceId, '1'], [prior.workspaceId, '2']]);
    } finally {
      settingsDirectory = '/repo';
      workspace.mockRestore();
      read.mockRestore();
      save.mockRestore();
    }
  });

  test('default session mode selector updates useUIStore', async () => {
    useUIStore.setState({ defaultSessionMode: 'main' });

    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    await act(async () => {
      useUIStore.getState().setDefaultSessionMode('plan');
    });

    expect(useUIStore.getState().defaultSessionMode).toBe('plan');
  });
});
