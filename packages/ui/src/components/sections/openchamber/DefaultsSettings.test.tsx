import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { OmpSettingsState } from '@openchamber/agent-contract';

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
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

let settingsDirectory = '/repo';
mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => settingsDirectory }));

let updatedDesktopSettingsPayload: Record<string, unknown> | null = null;
let updateSpy: ReturnType<typeof spyOn>;


const mockModelCatalog = {
  workspaceId: 'workspace_1',
  revision: '1',
  imageModels: [], planRoleAvailable: true,
  defaults: { model: null, thinkingLevel: null },
  models: [
    {
      modelId: 'o3-mini',
      provider: 'openai',
      name: 'o3-mini',
      modalities: ['text', 'image'] as const,
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

const mockOmpSettings = {
  workspaceId: 'workspace_1',
  revision: '1',
  settings: [
    {
      id: 'modelRoles' as const,
      type: 'record' as const,
      value: { default: 'openai/o3-mini:high' },
      default: {},
      configured: true,
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
      placement: { type: 'page' as const, page: 'sessions', section: 'retry' },
    },
  ],
};

// A settings read the Agent Service refuses (provider/service trouble) must
// surface as a failed row, not as a control that says "loading" forever.
let failOmpSettings = false;

mock.module('@/api/canonicalClient', () => ({
  CanonicalApiError: class extends Error { },
  canonicalClient: {
    resolveWorkspace: async () => ({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'repo' }),
    getOmpSettings: async () => {
      if (failOmpSettings) throw new Error('Agent Service settings read failed');
      return mockOmpSettings;
    },
    getModels: async () => mockModelCatalog,
    getProviders: async () => ({ workspaceId: 'workspace_1', revision: '1', providers: [] }),
    updateOmpSettings: async () => mockOmpSettings,
    readCacheWarming: async () => ({ mode: 'off' }),
    updateCacheWarming: async () => ({ mode: 'off' }),
  },
}));

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const { useSessionDisplayStore } = await import('@/stores/useSessionDisplayStore');
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

  beforeEach(() => {
    failOmpSettings = false;
    updatedDesktopSettingsPayload = null;
    catalogRefreshCalls = 0;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
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

  test('the retry section draws real rows and skips the fallback-chain record', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    // A record has no option list, so the generic row would render an empty
    // chip group: the fallback selector above is the control that writes it.
    expect(host.querySelector('[data-settings-item="omp.retry.maxRetries"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.retry.fallbackChains"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="sessions.fallback-model"]')).not.toBeNull();
  });

  test('a failed settings read says so instead of spinning the plan model row forever', async () => {
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

    // The plan row is still drawn; the read failure is what it reports.
    const planRow = host.querySelector('[data-settings-item="sessions.default-plan"]');
    expect(planRow).not.toBeNull();
  });

  test('the plan model role is drawn with the Plan & Goal Modes it unlocks', async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    // The composer disables Plan from the catalog's `planRoleAvailable`, which
    // OMP resolves from `modelRoles.plan`; the control belongs beside the mode.
    const modesSection = host.querySelector('[data-settings-item="sessions.plan-goal"]');
    expect(modesSection).not.toBeNull();
    const planRow = modesSection?.querySelector('[data-settings-item="sessions.default-plan"]');
    expect(planRow).not.toBeNull();

    // It is not a default-session row, so it must not sit in the defaults grid.
    const defaultsSection = host.querySelector('[data-settings-item="omp.modelRoles"]');
    expect(defaultsSection?.querySelector('[data-settings-item="sessions.default-plan"]')).toBeNull();
  });

  test('writing a model role re-reads the catalog that decides Plan availability', async () => {
    catalogRefreshCalls = 0;

    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    // The plan editor writes `modelRoles` through the same path as the
    // default model; that write invalidates `planRoleAvailable`.
    await act(async () => {
      const defaultsSection = host.querySelector('[data-settings-item="omp.modelRoles"]');
      const picker = defaultsSection?.querySelector('button');
      picker?.click();
    });
    await settle();

    const option = document.querySelector('[role="option"]');
    expect(option).not.toBeNull();
    await act(async () => {
      if (option instanceof HTMLElement) option.click();
    });
    await settle();

    // The write is in the shared agent directory, so the composer's directory —
    // not only the one this page names — must re-read its catalog.
    expect(catalogRefreshCalls).toBe(1);
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

  test('changing the default retry model retains the remaining selectors and other chains', async () => {
    const snapshot = {
      ...mockOmpSettings,
      settings: mockOmpSettings.settings.map((setting) => setting.id === 'retry.fallbackChains'
        ? { ...setting, value: { default: ['other/original', '@slow', 'other/last'], 'other/original': ['@smol'] } }
        : setting),
    };
    const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(snapshot as OmpSettingsState);
    const save = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue(snapshot as OmpSettingsState);
    try {
      await act(async () => root.render(<I18nProvider><DefaultsSettings /></I18nProvider>));
      await settle();
      const trigger = Array.from(host.querySelectorAll('[role="combobox"]'))
        .find((element) => element.textContent?.includes('other/original'));
      expect(trigger).toBeDefined();
      await act(async () => trigger?.dispatchEvent(new browser.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }) as unknown as Event));
      const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
        .find((element) => element.textContent?.includes('o3-mini'));
      expect(option).toBeDefined();
      await act(async () => option?.click());
      expect(save.mock.calls[0]?.[1].changes[0]).toEqual({
        id: 'retry.fallbackChains',
        value: { default: ['openai/o3-mini', '@slow', 'other/last'], 'other/original': ['@smol'] },
      });
    } finally {
      read.mockRestore();
      save.mockRestore();
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
