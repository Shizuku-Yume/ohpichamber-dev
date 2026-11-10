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

<<<<<<< HEAD
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
=======
const configState: ConfigState = {
  providers: [],
  modelsMetadata: new Map<string, never>(),
  setProvider: () => undefined,
  setModel: () => undefined,
  setAgent: () => undefined,
  setCurrentVariant: () => undefined,
  setCurrentVariantOverride: () => undefined,
  setSettingsDefaultModel: () => undefined,
  setSettingsDefaultVariant: () => undefined,
  setSettingsDefaultAgent: () => undefined,
  selectionSource: 'auto',
  agentSelectionSource: 'auto',
  agents: [],
  currentAgentName: undefined,
};

const settingsState = {
  showDeletionDialog: false,
  setShowDeletionDialog: () => undefined,
};

const selectionState = {
  getSessionModelSelection: () => undefined,
  getSessionAgentSelection: () => undefined,
};

const sessionState = { currentSessionId: null } satisfies { currentSessionId: string | null };
let savedSettings: DesktopSettings | null = null;
const updateCalls: Array<Partial<DesktopSettings>> = [];

mock.module('@/stores/useConfigStore', () => ({
  useConfigStore: <T,>(selector: (state: ConfigState) => T): T => selector(configState),
}));
mock.module('@/stores/useUIStore', () => ({
  useUIStore: <T,>(selector: (state: typeof settingsState) => T): T => selector(settingsState),
}));
mock.module('@/sync/selection-store', () => ({
  useSelectionStore: <T,>(selector: (state: typeof selectionState) => T): T => selector(selectionState),
}));
mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: <T,>(selector: (state: typeof sessionState) => T): T => selector(sessionState),
}));
mock.module('@/stores/useDirectoryStore', () => ({
  useDirectoryStore: <T,>(selector: (state: { currentDirectory: string }) => T): T =>
    selector({ currentDirectory: '/test/project' }),
}));
const runtimeFetchCalls: string[] = [];
const runtimeFetchModule = await import('@/lib/runtime-fetch');
mock.module('@/lib/runtime-fetch', () => ({
  ...runtimeFetchModule,
  runtimeFetch: async (url: string) => {
    runtimeFetchCalls.push(url);
    return new Response(JSON.stringify({ authenticatedProviders: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
}));
const persistenceModule = await import('@/lib/persistence');
mock.module('@/lib/persistence', () => ({
  ...persistenceModule,
  loadDesktopSettings: async () => savedSettings,
  updateDesktopSettings: async (changes: Partial<DesktopSettings>) => {
    updateCalls.push(changes);
    return { ok: true };
  },
  reportSettingsSaveState: () => {},
}));
const opencodeModule = await import('@/lib/opencode/client');
mock.module('@/lib/opencode/client', () => ({
  ...opencodeModule,
  opencodeClient: { getConfig: async () => ({ warming: false }) },
}));
mock.module('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  getCurrentIntlLocale: () => 'en-US',
}));
mock.module('@/components/chat/mobileControlsUtils', () => ({
  isPrimaryMode: (mode: string | undefined) => mode === 'primary',
}));
mock.module('@/components/sections/agents/ModelSelector', () => ({
  ModelSelector: ({
    providerId,
    modelId,
    onChange,
  }: {
    providerId: string;
    modelId: string;
    onChange: (providerId: string, modelId: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange(providerId, modelId === 'small' ? 'other' : modelId)}
    >
      {providerId}/{modelId}
    </button>
  ),
}));
mock.module('@/components/sections/commands/AgentSelector', () => ({
  AgentSelector: () => <button type="button">agent</button>,
}));
mock.module('@/components/sections/shared/SettingsInfoHint', () => ({
  SettingsInfoHint: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
// The permission row reads the routing and UI stores; it has no bearing on the defaults under test.
mock.module('@/components/sections/openchamber/PermissionDefaultModeField', () => ({
  PermissionDefaultModeField: () => null,
}));
mock.module('@/components/sections/shared/SettingsSection', () => ({
  SettingsSection: ({ description, children }: { description?: React.ReactNode; children: React.ReactNode }) => (
    <section>{description}{children}</section>
  ),
  SettingsFieldRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsCheckboxRow: ({ children, label }: { children?: React.ReactNode; label?: React.ReactNode }) => (
    <div>{label}{children}</div>
  ),
  SETTINGS_CUSTOM_TRIGGER_CLASS: '',
  SETTINGS_HELPER_CLASS: '',
  SETTINGS_SELECT_ROW_TRIGGER_CLASS: '',
  SETTINGS_OPTION_STACK_CLASS: '',
  SettingsChipGroup: () => null,
}));
mock.module('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <div data-select-value={value} data-select-disabled={disabled ? 'true' : undefined}>
      {children}
      <button type="button" onClick={() => onValueChange?.('medium')}>select-medium</button>
      <button type="button" onClick={() => onValueChange?.('__default__')}>select-default</button>
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
>>>>>>> bc50ba56a

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
