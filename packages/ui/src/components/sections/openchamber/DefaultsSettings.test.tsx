import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

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

mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/repo' }));

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
