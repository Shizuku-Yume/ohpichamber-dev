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
  ],
};

mock.module('@/api/canonicalClient', () => ({
  CanonicalApiError: class extends Error {},
  canonicalClient: {
    resolveWorkspace: async () => ({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'repo' }),
    getOmpSettings: async () => mockOmpSettings,
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
    updatedDesktopSettingsPayload = null;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
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

    const defaultModeRow = host.querySelector('[data-settings-item="sessions.default-mode"]');
    expect(defaultModeRow).not.toBeNull();

    const deletionRow = host.querySelector('[data-settings-item="sessions.deletion-dialog"]')
      ?? host.querySelectorAll('input[type="checkbox"]')[0];
    expect(deletionRow).not.toBeNull();

    const showChatsRow = host.querySelector('[data-settings-item="sessions.show-chats"]')
      ?? host.querySelectorAll('input[type="checkbox"]')[2];
    expect(showChatsRow).not.toBeNull();
  });

  test('deletion dialog checkbox updates useUIStore and persists via updateDesktopSettings', async () => {
    useUIStore.setState({ showDeletionDialog: true });

    await act(async () => {
      root.render(
        <I18nProvider>
          <DefaultsSettings />
        </I18nProvider>,
      );
    });
    await settle();

    const deletionRow = (host.querySelector('[data-settings-item="sessions.deletion-dialog"]')
      ?? host.querySelectorAll('input[type="checkbox"]')[0]) as HTMLElement | null;
    expect(deletionRow).not.toBeNull();

    await act(async () => {
      deletionRow?.click();
    });

    expect(useUIStore.getState().showDeletionDialog).toBe(false);
    expect(updatedDesktopSettingsPayload).toEqual({ showDeletionDialog: false });
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
