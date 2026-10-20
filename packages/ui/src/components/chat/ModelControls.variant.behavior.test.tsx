import React, { act } from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Agent, Message, Model, Provider, Session, Workspace } from '@openchamber/agent-contract';
import { CanonicalClient } from '@/api/canonicalClient';
import { ThemeSystemContext, type ThemeContextValue } from '@/contexts/theme-system-context';
import { getThemeById } from '@/lib/theme/themes';
import { I18nProvider } from '@/lib/i18n';
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID } from '@/lib/routing/autoModel';
import { useRoutingStore } from '@/stores/useRoutingStore';
import { selectCatalogLoadedForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useContextStore } from '@/stores/contextStore';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider } from '@/sync/sync-context';
import { getSyncChildStores } from '@/sync/sync-refs';

// Base UI and React DOM detect browser support when imported.
class TestIntersectionObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}
const importWindow = new Window();
Object.defineProperty(globalThis, 'window', { value: importWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', { value: importWindow.document, configurable: true, writable: true });
Object.assign(globalThis, {
  navigator: importWindow.navigator, Node: importWindow.Node, Element: importWindow.Element, HTMLElement: importWindow.HTMLElement,
  HTMLInputElement: importWindow.HTMLInputElement, HTMLIFrameElement: importWindow.HTMLIFrameElement,
  HTMLAnchorElement: importWindow.HTMLAnchorElement, HTMLButtonElement: importWindow.HTMLButtonElement,
  customElements: importWindow.customElements, CSSStyleSheet: importWindow.CSSStyleSheet,
  MutationObserver: importWindow.MutationObserver, ResizeObserver: importWindow.ResizeObserver, IntersectionObserver: TestIntersectionObserver,
  PointerEvent: importWindow.PointerEvent, MouseEvent: importWindow.MouseEvent, KeyboardEvent: importWindow.KeyboardEvent,
  Event: importWindow.Event, localStorage: importWindow.localStorage,
  getComputedStyle: importWindow.getComputedStyle.bind(importWindow),
  requestAnimationFrame: importWindow.requestAnimationFrame.bind(importWindow),
  cancelAnimationFrame: importWindow.cancelAnimationFrame.bind(importWindow), IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import('react-dom/client');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { ModelControls } = await import('./ModelControls');
const DIRECTORY = '/workspace/project';
const PROVIDER_ID = 'openai';
const MODEL_ID = 'gpt-5.5';
const AGENT_ID = 'profile-build-17';
const SESSION_ID = 'ses_restore';
const model: Model = {
  modelId: MODEL_ID, provider: PROVIDER_ID, name: MODEL_ID, modalities: ['text'],
  contextWindow: 128_000, maxOutputTokens: 16_384, reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
    { reasoningEffort: 'high', label: 'High', budgetTokens: null },
  ],
  variants: [
    { variant: 'low', label: 'Low', reasoningEffort: 'low' },
    { variant: 'high', label: 'High', reasoningEffort: 'high' },
  ],
  pricing: null,
};
const provider: Provider & { models: Model[] } = {
  providerId: PROVIDER_ID, name: PROVIDER_ID, endpoint: null, protocol: null,
  authMethods: [], auth: { status: 'missing' }, models: [model],
};
const agent: Agent = {
  agentId: AGENT_ID, name: 'Build', description: 'Build native projects',
  model: null, allowedTools: ['read', 'custom-native-tool'], permissionPresetId: 'workspace-review',
};
const planAgent: Agent = { ...agent, agentId: 'profile-plan-29', name: 'Plan' };
const reviewAgent: Agent = { ...agent, agentId: 'profile-review-31', name: 'Review' };
const session: Session = {
  sessionId: SESSION_ID, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: SESSION_ID,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};
const reply = (messageId: string): Message => ({
  messageId, sessionId: SESSION_ID, turnId: messageId, role: 'assistant', createdAt: 1,
  providerId: PROVIDER_ID, modelId: MODEL_ID,
  parts: [{ type: 'text', partId: `part-${messageId}`, content: 'Reply' }],
});

type DomHarness = { win: Window; container: HTMLElement; restore: () => void };
const installDom = (): DomHarness => {
  const win = importWindow;
  const container = document.createElement('div');
  document.body.replaceChildren(container);
  return { win, container, restore: () => { container.remove(); } };
};
const client = new CanonicalClient();
const bootstrap = spyOn(client, 'resolveWorkspace').mockImplementation(() => Promise.withResolvers<Workspace>().promise);
const projects = spyOn(client, 'listProjects').mockResolvedValue({ items: [], errors: {} });
const workspaces = spyOn(client, 'listWorkspaces').mockResolvedValue({ items: [], errors: {} });
afterAll(() => { bootstrap.mockRestore(); projects.mockRestore(); workspaces.mockRestore(); });

const theme = getThemeById('openchamber-dark');
if (!theme) throw new Error('Expected built-in theme');
const themeContext: ThemeContextValue = {
  currentTheme: theme, availableThemes: [theme], customThemeIds: [], customThemesLoading: false,
  isSystemPreference: false, themeMode: 'dark', lightThemeId: 'openchamber-light', darkThemeId: 'openchamber-dark',
  setTheme: () => undefined, setSystemPreference: () => undefined, setThemeMode: () => undefined,
  setLightThemePreference: () => undefined, setDarkThemePreference: () => undefined,
  reloadCustomThemes: async () => undefined, importTheme: async () => theme, deleteImportedTheme: async () => undefined,
};

const setRoster = (agents: Agent[], revision = '1') => useAgentsStore.setState({
  agentsByDirectory: { [DIRECTORY]: agents }, revisionsByDirectory: { [DIRECTORY]: revision }, errorsByDirectory: {},
});
const savedVariant = () => useSelectionStore.getState().getAgentModelVariantForSession(SESSION_ID, AGENT_ID, PROVIDER_ID, MODEL_ID);
const saveVariant = (variant: string | null | undefined) => useSelectionStore.getState()
  .saveAgentModelVariantForSession(SESSION_ID, AGENT_ID, PROVIDER_ID, MODEL_ID, variant);

// A native profile has no sampling default: effort is inherited from model/settings
// or explicitly remembered for this session's profile/model combination.
describe('ModelControls native selection and effort restore', () => {
  let dom: DomHarness;
  let root: Root;
  let restoreAgentsLoad: () => void;
  const configInitial = useConfigStore.getState();
  const agentsInitial = useAgentsStore.getState();
  const selectionInitial = useSelectionStore.getState();
  const sessionInitial = useSessionUIStore.getState();
  const uiInitial = useUIStore.getState();
  const directoryInitial = useDirectoryStore.getState();
  const contextInitial = useContextStore.getState();
  const projectsInitial = useProjectsStore.getState();
  const routingInitial = useRoutingStore.getState();

  const render = async (props: React.ComponentProps<typeof ModelControls> = {}) => {
    await act(async () => root.render(
      <SyncProvider client={client} directory={DIRECTORY}>
        <ThemeSystemContext.Provider value={themeContext}>
          <I18nProvider><TooltipProvider><ModelControls {...props} /></TooltipProvider></I18nProvider>
        </ThemeSystemContext.Provider>
      </SyncProvider>,
    ));
  };
  const label = (kind: 'agent' | 'variant') => dom.container.querySelector(`.model-controls__${kind}-label`)?.textContent?.trim();
  const trigger = (kind: 'agent' | 'model' | 'variant') => {
    const entry = dom.container.querySelector<HTMLElement>(`.model-controls__${kind}-trigger`);
    if (!entry) throw new Error(`Missing ${kind} trigger`);
    return entry;
  };
  const button = (name: string) => {
    const entry = [...document.querySelectorAll<HTMLElement>('button, [role="menuitem"], [role="option"]')]
      .find((item) => !item.matches('.model-controls__model-trigger, .model-controls__agent-trigger, .model-controls__variant-trigger')
        && (item.textContent?.trim().toLocaleLowerCase().includes(name.toLocaleLowerCase()) || item.getAttribute('aria-label') === name
          || [...item.querySelectorAll('span')].some((span) => span.textContent?.trim().toLocaleLowerCase() === name.toLocaleLowerCase())));
    if (!entry) throw new Error(`Missing button: ${name}; body=${document.body.innerHTML.slice(-3000)}`);
    return entry;
  };
  const stage = async (messages: Message[]) => act(async () => {
    const store = getSyncChildStores().getChild(DIRECTORY);
    if (!store) throw new Error('Expected mounted directory store');
    store.setState({ session: [session], message: { [SESSION_ID]: messages } });
  });

  beforeEach(() => {
    dom = installDom();
    root = createRoot(dom.container);
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useDirectoryStore.setState({ currentDirectory: DIRECTORY });
    useSessionUIStore.setState({ currentSessionId: SESSION_ID, currentSessionDirectory: DIRECTORY });
    useSessionUIStore.setState({ worktreeMetadata: new Map([['btw-pending:ses_restore', { path: DIRECTORY, projectDirectory: DIRECTORY, branch: 'main', label: 'Project' }]]) });
    useSelectionStore.setState({
      sessionModelSelections: new Map([[SESSION_ID, { providerId: PROVIDER_ID, modelId: MODEL_ID }]]),
      sessionAgentSelections: new Map([[SESSION_ID, AGENT_ID]]), sessionFollowedAgents: new Map(),
      sessionFollowedModels: new Map(), sessionAgentModelSelections: new Map(), agentModelVariantSelections: new Map(),
    });
    useUIStore.setState({ isMobile: false, isModelSelectorOpen: false, favoriteAgents: [], hiddenModels: [], shortcutOverrides: {}, routingFeatureAvailable: false });
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [provider], providersLoaded: true, currentProviderId: PROVIDER_ID, currentModelId: MODEL_ID,
      directoryScoped: { [DIRECTORY]: { providers: [provider], providersLoaded: true, currentProviderId: PROVIDER_ID, currentModelId: MODEL_ID, currentVariant: undefined, currentVariantSelection: { override: undefined, inherited: undefined }, currentAgentName: AGENT_ID, selectedProviderId: PROVIDER_ID, agentModelSelections: {}, defaultProviders: {}, selectionSource: 'auto', agentSelectionSource: 'auto' } },
      currentAgentName: AGENT_ID, currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined }, settingsDefaultVariant: undefined,
      settingsDefaultAgent: undefined, settingsDefaultModel: undefined, agentModelSelections: {}, defaultProviders: {},
      selectionSource: 'auto', agentSelectionSource: 'auto', lastDisconnectReason: null,
    });
    setRoster([agent, planAgent, reviewAgent]);
    const load = spyOn(useAgentsStore.getState(), 'loadAgents').mockResolvedValue(true);
    restoreAgentsLoad = () => load.mockRestore();
    useRoutingStore.setState({ available: false, autoReady: false });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restoreAgentsLoad();
    useConfigStore.setState(configInitial, true);
    useAgentsStore.setState(agentsInitial, true);
    useSelectionStore.setState(selectionInitial, true);
    useSessionUIStore.setState(sessionInitial, true);
    useUIStore.setState(uiInitial, true);
    useDirectoryStore.setState(directoryInitial, true);
    useContextStore.setState(contextInitial, true);
    useProjectsStore.setState(projectsInitial, true);
    useRoutingStore.setState(routingInitial, true);
    dom.restore();
  });

  test('native identity selects by ID while the roster and current selection display names', async () => {
    useUIStore.setState({ isMobile: true });
    await render();
    expect(label('agent')).toBe('Build');
    await act(async () => trigger('agent').click());
    await act(async () => button('Plan').click());
    expect(useConfigStore.getState().currentAgentName).toBe(planAgent.agentId);
    expect(useSelectionStore.getState().getSessionAgentSelection(SESSION_ID)).toBe(planAgent.agentId);
    expect(label('agent')).toBe('Plan');
  });

  test('favoriting a native profile stores its ID rather than its display name', async () => {
    useUIStore.setState({ isMobile: true });
    await render();
    await act(async () => trigger('agent').click());
    const favorite = document.querySelector<HTMLButtonElement>('button[aria-pressed="false"]');
    if (!favorite) throw new Error('Expected native agent favorite toggle');
    await act(async () => favorite.click());
    expect(useUIStore.getState().favoriteAgents).toEqual([AGENT_ID]);
    expect(useConfigStore.getState().currentAgentName).toBe(AGENT_ID);
  });

  test('native details show complete tool availability and preset without permission allow/deny claims', async () => {
    useUIStore.setState({ isMobile: true });
    await render();
    await act(async () => {
      const agentTrigger = trigger('agent');
      const touchStart = agentTrigger.ownerDocument.createEvent('Event');
      touchStart.initEvent('touchstart', true, false);
      agentTrigger.dispatchEvent(touchStart);
      const delay = Promise.withResolvers<void>();
      setTimeout(delay.resolve, 550);
      await delay.promise;
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('read, custom-native-tool');
    expect(text).toContain('workspace-review');
    expect(text).toContain('Build native projects');
    expect(text).not.toContain('Allow');
    expect(text).not.toContain('Deny');
  });

  for (const mobile of [false, true]) {
    test(`successful empty native roster is not permanent Loading (${mobile ? 'mobile' : 'desktop'})`, async () => {
      useUIStore.setState({ isMobile: mobile });
      useSessionUIStore.setState({ currentSessionId: null });
      useConfigStore.setState({ currentAgentName: undefined });
      useAgentsStore.setState({ agentsByDirectory: {}, revisionsByDirectory: {}, errorsByDirectory: {} });
      await render();
      expect(label('agent')).toContain('Loading');
      await act(async () => setRoster([], 'empty-revision'));
      expect(label('agent')?.toLowerCase()).toContain('select agent');
      expect(label('agent')).not.toContain('Loading');
    });

    test(`failed native roster shows Unavailable instead of successful empty (${mobile ? 'mobile' : 'desktop'})`, async () => {
      useUIStore.setState({ isMobile: mobile });
      useSessionUIStore.setState({ currentSessionId: null });
      useConfigStore.setState({ currentAgentName: undefined });
      useAgentsStore.setState({ agentsByDirectory: {}, revisionsByDirectory: {}, errorsByDirectory: { [DIRECTORY]: 'SERVICE_UNAVAILABLE' } });
      await render();
      expect(label('agent')).toContain('Unavailable');
      expect(label('agent')?.toLowerCase()).not.toContain('select agent');
      await act(async () => setRoster([agent]));
      await act(async () => useConfigStore.setState({ currentAgentName: AGENT_ID }));
      expect(label('agent')).toBe('Build');
    });
  }

  test('agents are usable while model discovery is still loading', async () => {
    useUIStore.setState({ isMobile: true });
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ providers: [], providersLoaded: false, currentProviderId: '', currentModelId: '' });
    await render();
    expect(trigger('agent').hasAttribute('disabled')).toBe(false);
    expect(trigger('model').hasAttribute('disabled')).toBe(true);
    expect(trigger('model').textContent).toContain('Loading');
    expect(label('agent')).toBe('Build');
  });

  test('a roster from another directory cannot resolve this directory agent', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useAgentsStore.setState({ agentsByDirectory: { '/other': [agent] }, revisionsByDirectory: { '/other': '1' }, errorsByDirectory: {} });
    await render();
    expect(label('agent')).toBe(AGENT_ID);
    await act(async () => setRoster([{ ...agent, name: 'Project builder' }]));
    expect(label('agent')).toBe('Project builder');
  });

  test('a draft inherits its settings effort, not a retired agent sampling field', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ currentVariant: 'high', settingsDefaultVariant: 'high', currentVariantSelection: { override: undefined, inherited: 'high' } });
    useConfigStore.getState().setCurrentVariantOverride(undefined, 'high');
    setRoster([{ ...agent, model: { providerId: PROVIDER_ID, modelId: MODEL_ID } }]);
    await render();
    expect(label('variant')).toBe('high');
  });

  test('native pinned provider/model binding preserves a valid manual effort', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    setRoster([{ ...agent, model: { providerId: PROVIDER_ID, modelId: MODEL_ID } }]);
    useConfigStore.setState({ currentVariant: 'high', currentVariantSelection: { override: 'high', inherited: 'low' }, selectionSource: 'manual' });
    await render();
    await act(async () => useConfigStore.getState().setAgent(AGENT_ID));
    const state = useConfigStore.getState();
    expect([state.currentProviderId, state.currentModelId]).toEqual([PROVIDER_ID, MODEL_ID]);
    expect(state.currentVariantSelection.override).toBe('high');
    expect(state.currentVariant).toBe('high');
  });

  test('picking a native profile applies its pinned provider/model rather than its label', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    const pinnedModel = { ...model, modelId: 'pinned-model' };
    const pinnedProvider = { ...provider, providerId: 'pinned-provider', models: [{ ...pinnedModel, provider: 'pinned-provider' }] };
    useConfigStore.setState({ providers: [provider, pinnedProvider] });
    setRoster([agent, { ...planAgent, model: { providerId: 'pinned-provider', modelId: 'pinned-model' } }]);
    useUIStore.setState({ isMobile: true });
    await render();
    await act(async () => trigger('agent').click());
    await act(async () => button('Plan').click());
    const state = useConfigStore.getState();
    expect(state.currentAgentName).toBe(planAgent.agentId);
    expect([state.currentProviderId, state.currentModelId]).toEqual(['pinned-provider', 'pinned-model']);
  });

  test('a draft keeps its chosen effort through a provider discovery gap', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ providers: [], providersLoaded: false, currentVariant: 'high', settingsDefaultVariant: 'low', currentVariantSelection: { override: 'high', inherited: 'low' } });
    await render();
    expect(useConfigStore.getState().currentVariant).toBe('high');
    await act(async () => useConfigStore.setState({ providers: [provider], providersLoaded: true }));
    expect(useConfigStore.getState().currentModelId).toBe(MODEL_ID);
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
  });

  test('a draft keeps its picked effort while the automatic model is unresolved', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ providers: [], providersLoaded: false, currentProviderId: '', currentModelId: '', currentVariant: 'high', currentVariantSelection: { override: 'high', inherited: undefined } });
    await render();
    await act(async () => useConfigStore.setState({ providers: [provider], providersLoaded: true, currentProviderId: PROVIDER_ID, currentModelId: MODEL_ID }));
    expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
    expect(useConfigStore.getState().currentVariant).toBe('high');
  });

  test('a project draft inherits its own effort instead of the global default', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ currentVariant: 'high', settingsDefaultVariant: 'low', currentVariantSelection: { override: undefined, inherited: 'high' } });
    await render();
    expect(useConfigStore.getState().currentVariant).toBe('high');
    expect(useConfigStore.getState().currentVariantSelection.override).toBeUndefined();
  });

  test('history without effort records no choice instead of explicit Default', async () => {
    await render();
    await stage([reply('msg-history')]);
    expect(savedVariant()).toBeUndefined();
    expect(useConfigStore.getState().currentVariantSelection.override).toBeUndefined();
  });

  for (const variant of [null, 'high'] as const) {
    test(`history echo preserves remembered manual effort ${variant ?? 'Default'}`, async () => {
      saveVariant(variant);
      useConfigStore.setState({ selectionSource: 'manual', settingsDefaultVariant: 'low', currentVariant: variant ?? undefined, currentVariantSelection: { override: variant, inherited: 'low' } });
      await render();
      await stage([reply('msg-echo')]);
      expect(savedVariant()).toBe(variant);
      expect(useConfigStore.getState().currentVariantSelection.override).toBe(variant);
      expect(useConfigStore.getState().currentVariant).toBe(variant ?? undefined);
    });
  }

  for (const ready of [true, false]) {
    test(`saved Auto survives history when routing is ${ready ? 'ready' : 'still loading'}`, async () => {
      const auto = { providerId: AUTO_PROVIDER_ID, modelId: AUTO_MODEL_ID };
      useSelectionStore.setState({ sessionModelSelections: new Map([[SESSION_ID, auto]]), sessionAgentModelSelections: new Map([[SESSION_ID, new Map([[AGENT_ID, auto]])]]) });
      useUIStore.setState({ routingFeatureAvailable: true });
      useRoutingStore.setState({ available: ready, autoReady: ready, loaded: ready });
      await render();
      await stage([reply('msg-auto')]);
      expect(useSelectionStore.getState().getSessionModelSelection(SESSION_ID)).toEqual(auto);
      if (ready) expect([useConfigStore.getState().currentProviderId, useConfigStore.getState().currentModelId]).toEqual([AUTO_PROVIDER_ID, AUTO_MODEL_ID]);
    });
  }

  test('live agent change does not reapply persisted session model hydration', async () => {
    const getModel = spyOn(useSelectionStore.getState(), 'getSessionModelSelection');
    try {
      await render();
      await stage([]);
      const hydratedCalls = getModel.mock.calls.length;
      await act(async () => useConfigStore.setState({ currentAgentName: planAgent.agentId }));
      expect(getModel.mock.calls.length).toBe(hydratedCalls);
      expect(useConfigStore.getState().currentAgentName).toBe(planAgent.agentId);
    } finally { getModel.mockRestore(); }
  });

  for (const [mobile, variant] of [[false, 'low'], [true, null]] as const) {
    test(`controlled selection remains independent (${mobile ? 'mobile' : 'desktop'}, ${variant ?? 'Default'})`, async () => {
      const controlledId = 'btw-pending:ses_restore';
      useUIStore.setState({ isMobile: mobile });
      useConfigStore.setState({ currentProviderId: 'main-provider', currentModelId: 'main-model', currentVariant: 'high', currentVariantSelection: { override: 'high', inherited: 'low' } });
      const saveModel = spyOn(useSelectionStore.getState(), 'saveSessionModelSelection');
      const saveEffort = spyOn(useSelectionStore.getState(), 'saveAgentModelVariantForSession');
      const openTrigger = async (kind: 'model' | 'variant') => {
        await act(async () => {
          const entry = trigger(kind);
          const view = entry.ownerDocument.defaultView;
          if (!view) throw new Error('Expected a browser window for the model picker');
          if (useUIStore.getState().isMobile) {
            entry.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true }));
          } else {
            entry.focus();
            entry.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true }));
          }
          await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
          await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
        });
      };
      try {
        await render({ sessionId: controlledId, selection: { model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, agent: planAgent.agentId, variant } });
        expect(useSessionUIStore.getState().getDirectoryForSession(controlledId)).toBe(DIRECTORY);
        expect([useConfigStore.getState().activeDirectoryKey, useConfigStore.getState().providersLoaded, useConfigStore.getState().providers.map((item) => item.providerId)]).toEqual([DIRECTORY, true, [PROVIDER_ID]]);
        expect(selectCatalogLoadedForDirectory(useConfigStore.getState(), 'models', DIRECTORY)).toBe(true);
        expect(dom.container.querySelector('.model-controls__agent-label')).toBeNull();
        expect(label('variant')).toBe(variant ?? 'Default');
        expect(saveModel.mock.calls).toEqual([]);
        expect(saveEffort.mock.calls).toEqual([]);
        await openTrigger('model');
        await act(async () => button(MODEL_ID).click());
        expect(saveModel.mock.calls.at(-1)).toEqual([controlledId, PROVIDER_ID, MODEL_ID]);
        expect(useSelectionStore.getState().getAgentModelForSession(controlledId, planAgent.agentId))
          .toEqual({ providerId: PROVIDER_ID, modelId: MODEL_ID });
        await openTrigger('variant');
        await act(async () => button('Default').click());
        expect(saveEffort.mock.calls.at(-1)).toEqual([controlledId, planAgent.agentId, PROVIDER_ID, MODEL_ID, null]);
        const state = useConfigStore.getState();
        expect([state.currentProviderId, state.currentModelId, state.currentAgentName, state.currentVariant]).toEqual(['main-provider', 'main-model', AGENT_ID, 'high']);
      } finally { saveModel.mockRestore(); saveEffort.mockRestore(); }
    });
  }
});
