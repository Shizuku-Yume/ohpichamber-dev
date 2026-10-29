import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { DesktopSettings } from '@/lib/desktop';
import type { Agent } from '@openchamber/agent-contract';

type ProviderState = {
  id: string;
  models: Array<{ id: string; variants?: Record<string, boolean> }>;
};
const canonicalProviderCalls: string[] = [];
const canonicalProviders = [{ providerId: 'sidecar', name: 'Sidecar', endpoint: null, protocol: null, authMethods: ['api-key'], auth: { status: 'configured', credentialRef: 'cred', method: 'api-key', source: 'stored-credential' } }];

type ConfigState = {
  providers: ProviderState[];
  modelsMetadata: Map<string, never>;
  setProvider: () => void;
  setModel: () => void;
  setAgent: () => void;
  setCurrentVariant: () => void;
  setCurrentVariantOverride: () => void;
  setSettingsDefaultModel: () => void;
  setSettingsDefaultVariant: () => void;
  setSettingsDefaultAgent: () => void;
  selectionSource: 'auto';
  agentSelectionSource: 'auto';
  currentAgentName: string | undefined;
};

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
  currentAgentName: undefined,
};

const agents: Agent[] = [];
const agentState: { agentsByDirectory: Record<string, Agent[]> } = { agentsByDirectory: {} };

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

mock.module('@/stores/useAgentsStore', () => ({
  selectAgentsForDirectory: (state: typeof agentState, directory?: string | null) => state.agentsByDirectory[directory ?? '__default__'] ?? agents,
  useAgentsStore: <T,>(selector: (state: typeof agentState) => T): T => selector(agentState),
}));
mock.module('@/stores/useConfigStore', () => ({
  useConfigStore: <T,>(selector: (state: ConfigState) => T): T => selector(configState),
}));
mock.module('@/stores/useUIStore', () => ({
  useUIStore: <T,>(selector: (state: typeof settingsState) => T): T => selector(settingsState),
}));
mock.module('@/stores/useSessionDisplayStore', () => ({
  useSessionDisplayStore: <T,>(selector: (state: typeof settingsState) => T): T => selector(settingsState),
}));
mock.module('@/sync/selection-store', () => ({
  useSelectionStore: <T,>(selector: (state: typeof selectionState) => T): T => selector(selectionState),
}));
mock.module('@/sync/session-ui-store', () => ({
  useSessionUIStore: <T,>(selector: (state: typeof sessionState) => T): T => selector(sessionState),
}));
// Capture the real module before replacing it so non-client exports
// (CanonicalApiError) survive for SessionWarmingCheckbox.
const canonicalClientModule = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...canonicalClientModule,
  canonicalClient: {
    resolveWorkspace: async (directory: string) => ({ workspaceId: `workspace:${directory}`, projectId: 'project', name: 'Project' }),
    getProviders: async (workspaceId: string) => {
      canonicalProviderCalls.push(workspaceId);
      return { workspaceId, revision: '1', providers: canonicalProviders };
    },
    readCacheWarming: async (workspaceId: string) => ({ workspaceId, revision: '1', mode: 'off' }),
  },
}));
mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/settings/project' }));
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
mock.module('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
mock.module('@/components/sections/agents/ModelSelector', () => ({
  ModelSelector: () => <button type="button">model</button>,
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
  SettingsSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SettingsFieldRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsCheckboxRow: ({ children, label }: { children?: React.ReactNode; label?: React.ReactNode }) => (
    <div>{label}{children}</div>
  ),
  SettingsChipGroup: ({ options }: { options?: Array<{ label: React.ReactNode }> }) => (
    <div>{options?.map((option, index) => <span key={index}>{option.label}</span>)}</div>
  ),
  SettingsInset: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SettingsGroupTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  SETTINGS_CUSTOM_TRIGGER_CLASS: '',
  SETTINGS_SELECT_ROW_TRIGGER_CLASS: '',
  SETTINGS_OPTION_STACK_CLASS: '',
  SETTINGS_FIELDS_STACK_CLASS: '',
  SETTINGS_HELPER_CLASS: '',
}));
mock.module('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const { DefaultsSettings } = await import('./DefaultsSettings');

describe('DefaultsSettings', () => {
  let windowInstance: Window;
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    savedSettings = {
      defaultModel: 'sidecar/model',
      defaultVariant: 'high',
    };
    canonicalProviderCalls.length = 0;
    updateCalls.length = 0;
    configState.providers = [{ id: 'sidecar', models: [{ id: 'model', variants: { high: true } }] }];
    windowInstance = new Window({ url: 'http://localhost/' });
    // SAFETY: the test installs a happy-dom Window for the component and restores the original global afterward.
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      Node: windowInstance.Node,
      Element: windowInstance.Element,
      HTMLElement: windowInstance.HTMLElement,
      Event: windowInstance.Event,
      MouseEvent: windowInstance.MouseEvent,
      MutationObserver: windowInstance.MutationObserver,
      getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
      requestAnimationFrame: windowInstance.requestAnimationFrame.bind(windowInstance),
      cancelAnimationFrame: windowInstance.cancelAnimationFrame.bind(windowInstance),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  test('retains a saved model variant while the model disappears and returns', async () => {
    await act(async () => {
      root.render(<DefaultsSettings />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(canonicalProviderCalls).toEqual(['workspace:/settings/project']);

    configState.providers = [];
    await act(async () => {
      root.render(<DefaultsSettings />);
      await Promise.resolve();
    });

    expect(host.textContent).toContain('High');
    expect(updateCalls).toEqual([]);

    configState.providers = [{ id: 'sidecar', models: [{ id: 'model', variants: { high: true } }] }];
    await act(async () => {
      root.render(<DefaultsSettings />);
      await Promise.resolve();
    });

    expect(host.textContent).toContain('sidecar/model');
    expect(host.textContent).toContain('High');
    expect(updateCalls).toEqual([]);
  });
});
