import { describe, expect, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Agent, Model, Provider } from '@openchamber/agent-contract';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';
import { getDefaultTheme } from '@/lib/theme/themes';
import { I18nProvider } from '@/lib/i18n';

describe('issue #3036 stale persisted models', () => {
  test('changes the agent only after its persisted model is accepted', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}));
    const dom = new Window({ url: 'http://localhost' });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({
      window: dom, document: dom.document, navigator: dom.navigator,
      localStorage: dom.localStorage, Event: dom.Event, CustomEvent: dom.CustomEvent,
      Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLIFrameElement: dom.HTMLIFrameElement, Node: dom.Node,
      MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
      getComputedStyle: dom.getComputedStyle.bind(dom),
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
      cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const { ModelControls } = await import('../ModelControls');
    const { SyncProvider } = await import('@/sync/sync-context');
    const { useConfigStore } = await import('@/stores/useConfigStore');
    const { useAgentsStore } = await import('@/stores/useAgentsStore');
    const { useSelectionStore } = await import('@/sync/selection-store');
    const { useSessionUIStore } = await import('@/sync/session-ui-store');
    const { useContextStore } = await import('@/stores/contextStore');
    const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
    const { createWebAPIs } = await import('../../../../../web/src/api/index');
    const configBefore = useConfigStore.getState();
    const agentsBefore = useAgentsStore.getState();
    const selectionsBefore = useSelectionStore.getState();
    const sessionBefore = useSessionUIStore.getState();
    const contextBefore = useContextStore.getState();
    const directoryBefore = useDirectoryStore.getState();
    const sessionId = 'ses_stale_model';
    const agents: Agent[] = ['plan', 'review', 'build'].map((name) => ({
      agentId: name, name, description: '', model: null, allowedTools: null,
    }));
    const currentModel: Model = {
      modelId: 'current', name: 'Current', provider: 'provider', modalities: ['text'],
      contextWindow: 200000, maxOutputTokens: 8192, reasoningEffortSupported: false,
      reasoningOptions: [], variants: [], pricing: null, status: 'active', enabled: true,
    };
    const restoredModel: Model = { ...currentModel, modelId: 'removed', name: 'Restored' };
    const provider: Provider & { models: Model[] } = {
      providerId: 'provider', name: 'Provider', endpoint: null, protocol: null, authMethods: ['api-key'],
      auth: { status: 'configured', credentialRef: 'fixture', method: 'api-key', source: 'stored-credential' }, models: [currentModel],
    };
    const theme = getDefaultTheme(false);
    const themeContext: ThemeContextValue = {
      currentTheme: theme, availableThemes: [theme], customThemeIds: [], customThemesLoading: false,
      reloadCustomThemes: async () => {}, importTheme: async () => theme, deleteImportedTheme: async () => {},
      setTheme: () => {}, isSystemPreference: false, setSystemPreference: () => {},
      themeMode: 'light', setThemeMode: () => {}, lightThemeId: theme.metadata.id, darkThemeId: theme.metadata.id,
      setLightThemePreference: () => {}, setDarkThemePreference: () => {},
    };
    const scope = {
      providers: [provider], models: [currentModel], providersLoaded: true,
      currentProviderId: provider.providerId, currentModelId: currentModel.modelId,
      currentAgentName: 'build', selectedProviderId: provider.providerId,
      agentModelSelections: {}, defaultProviders: {},
    };
    try {
      useDirectoryStore.setState({ currentDirectory: '/workspace' });
      useAgentsStore.setState({ agents, agentsByDirectory: { '/workspace': agents }, revisionsByDirectory: { '/workspace': '1' }, errorsByDirectory: {} });
      useConfigStore.setState({
        ...scope, activeDirectoryKey: '/workspace', settingsDefaultsLoaded: true,
        directoryScoped: { '/workspace': scope },
      });
      useSessionUIStore.setState({ currentSessionId: sessionId });
      useContextStore.setState({ hasHydrated: true });
      useSelectionStore.setState({
        sessionAgentSelections: new Map(), sessionModelSelections: new Map(),
        sessionAgentModelSelections: new Map([[sessionId, new Map([
          ['plan', { providerId: provider.providerId, modelId: restoredModel.modelId }],
          ['review', { providerId: provider.providerId, modelId: 'also-removed' }],
        ])]]),
      });
      await act(async () => root.render(React.createElement(I18nProvider, null,
        React.createElement(ThemeSystemContext.Provider, { value: themeContext },
          React.createElement(RuntimeAPIContext.Provider, { value: createWebAPIs() },
            React.createElement(SyncProvider, { directory: '/workspace', children: React.createElement(ModelControls) }),
          ),
        ),
      )));

      expect(useConfigStore.getState().currentAgentName).toBe('build');
      expect(useConfigStore.getState().currentModelId).toBe(currentModel.modelId);
      await act(async () => {
        const providers = [{ ...provider, models: [currentModel, restoredModel] }];
        useConfigStore.setState((state) => ({ providers, models: [currentModel, restoredModel], directoryScoped: {
          ...state.directoryScoped, '/workspace': { ...state.directoryScoped['/workspace'], providers, models: [currentModel, restoredModel] },
        } }));
      });
      expect(useConfigStore.getState().currentAgentName).toBe('plan');
      expect(useConfigStore.getState().currentModelId).toBe(restoredModel.modelId);
      expect(useSelectionStore.getState().getSessionAgentSelection(sessionId)).toBe('plan');
      expect(host.textContent).toContain(restoredModel.name);
    } finally {
      await act(async () => root.unmount());
      useConfigStore.setState(configBefore, true);
      useAgentsStore.setState(agentsBefore, true);
      useSelectionStore.setState(selectionsBefore, true);
      useSessionUIStore.setState(sessionBefore, true);
      useContextStore.setState(contextBefore, true);
      useDirectoryStore.setState(directoryBefore, true);
      await dom.happyDOM.close();
      fetchSpy.mockRestore();
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    }
  });
});
