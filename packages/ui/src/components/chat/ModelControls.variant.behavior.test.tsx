import React, { act } from 'react';
import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { installSessionSnapshot } from '@/sync/event-reducer';
import type { Agent, Message, Model, Provider, Session, Workspace } from '@openchamber/agent-contract';
import type { MobileControlsPanel } from './mobileControlsUtils';
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
  observe(): void { }
  disconnect(): void { }
  unobserve(): void { }
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
const { MobileModelButton } = await import('./MobileModelButton');
const { MobileEffortButton } = await import('./MobileEffortButton');
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
// The configured OMP catalog shape: real effort levels, no route variants.
const effortOnlyModel: Model = { ...model, variants: [] };
const effortOnlyProvider: Provider & { models: Model[] } = { ...provider, models: [effortOnlyModel] };
const agent: Agent = {
  agentId: AGENT_ID, name: 'Build', description: 'Build native projects',
  model: null, allowedTools: ['read', 'custom-native-tool'],
};
const planAgent: Agent = { ...agent, agentId: 'profile-plan-29', name: 'Plan' };
const reviewAgent: Agent = { ...agent, agentId: 'profile-review-31', name: 'Review' };
const session: Session = {
  sessionId: SESSION_ID, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: SESSION_ID,
  createdAt: 0, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
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
  const label = (kind: 'agent' | 'variant' | 'effort') => dom.container.querySelector(`.model-controls__${kind}-label`)?.textContent?.trim();
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
      directoryScoped: { [DIRECTORY]: { providers: [provider], models: [], providersLoaded: true, currentProviderId: PROVIDER_ID, currentModelId: MODEL_ID, currentVariant: undefined, currentVariantSelection: { override: undefined, inherited: undefined }, currentAgentName: AGENT_ID, selectedProviderId: PROVIDER_ID, agentModelSelections: {}, defaultProviders: {}, selectionSource: 'auto', agentSelectionSource: 'auto' } },
      currentAgentName: AGENT_ID, currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined },
      settingsDefaultModel: undefined, agentModelSelections: {}, defaultProviders: {},
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

  test('does not render root-agent controls when an unavailable profile is present', async () => {
    const unavailableProfile = { ...agent, allowedTools: ['missing_tool'] };
    setRoster([unavailableProfile]);
    await render();
    expect(dom.container.querySelector('.model-controls__agent-trigger')).toBeNull();
    expect(dom.container.textContent).not.toContain('Build');
  });
  test('a draft shows OMP\'s configured thinking level instead of Off', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ currentVariant: undefined, settingsDefaultReasoningEffort: 'high', currentReasoningEffort: undefined });
    setRoster([{ ...agent, model: { providerId: PROVIDER_ID, modelId: MODEL_ID } }]);
    await render();
    expect(label('effort')).toBe('High');
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


  test('a draft keeps its chosen effort through a provider discovery gap', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ providers: [], providersLoaded: false, currentVariant: 'high', currentVariantSelection: { override: 'high', inherited: 'low' } });
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
    useConfigStore.setState({ currentVariant: 'high', currentVariantSelection: { override: undefined, inherited: 'high' } });
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
      useConfigStore.setState({ selectionSource: 'manual', currentVariant: variant ?? undefined, currentVariantSelection: { override: variant, inherited: 'low' } });
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
        expect(label('variant')).toBe(variant ? variant.charAt(0).toUpperCase() + variant.slice(1) : 'Default');
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

  test('long-pressing the phone effort button opens the level sheet and a pick applies', async () => {
    useUIStore.setState({ isMobile: true });
    useSessionUIStore.setState({ currentSessionId: SESSION_ID });
    useConfigStore.setState({
      providers: [effortOnlyProvider], providersLoaded: true,
      currentProviderId: PROVIDER_ID, currentModelId: MODEL_ID,
      currentReasoningEffort: 'medium', currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined },
    });
    const LongPressComposer = () => {
      const [panel, setPanel] = React.useState<MobileControlsPanel>(null);
      return (
        <>
          <MobileEffortButton
            onCycleThinking={() => undefined}
            onOpenThinking={() => setPanel('effort')}
          />
          <ModelControls mobilePanel={panel} onMobilePanelChange={setPanel} />
        </>
      );
    };
    await act(async () => root.render(
      <SyncProvider client={client} directory={DIRECTORY}>
        <ThemeSystemContext.Provider value={themeContext}>
          <I18nProvider><TooltipProvider><LongPressComposer /></TooltipProvider></I18nProvider>
        </ThemeSystemContext.Provider>
      </SyncProvider>,
    ));

    const effortButton = dom.container.querySelector('button[aria-label^="Thinking"]');
    if (!effortButton) throw new Error('Missing the phone effort button');
    const view = effortButton.ownerDocument.defaultView;
    if (!view) throw new Error('Expected a browser window for the phone effort button');
    await act(async () => {
      effortButton.dispatchEvent(new view.PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }));
      await new Promise<void>((resolve) => view.setTimeout(resolve, 550));
      effortButton.dispatchEvent(new view.PointerEvent('pointerup', { pointerType: 'touch', bubbles: true }));
    });

    // The sheet lists the model's real levels, not the empty legacy route list.
    const sheet = document.body.querySelector('[role="dialog"][aria-label="Effort"]');
    if (!sheet) throw new Error('The long press opened no effort sheet');
    const rows = [...sheet.querySelectorAll('button')]
      .map((entry) => entry.textContent?.trim())
      .filter((label): label is string => Boolean(label));
    expect(rows).toEqual(['Off', 'Low', 'High']);

    // The lift's swipe guard swallows a click within 400 ms of the pointerup;
    // a person reads the sheet and taps well after that.
    await act(async () => {
      await new Promise<void>((resolve) => view.setTimeout(resolve, 450));
      const high = [...sheet.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === 'High');
      if (!high) throw new Error('Missing the High level row');
      high.click();
      await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
    });
    // The pick lands where the tap path lands it: the draft's configured level.
    expect(useConfigStore.getState().currentReasoningEffort).toBe('high');
    // The sheet closed and the composer now reads that level.
    expect(document.body.querySelector('[role="dialog"][aria-label="Effort"]')).toBeNull();
    expect(dom.container.querySelector('button[aria-label^="Thinking"]')?.getAttribute('aria-label')).toBe('Thinking: High');
  });
});

describe('ModelControls active-run and draft-promotion model label', () => {
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

  const CHAT_DIR = '/workspace/chats/chat-new-1';
  const RUN_PROVIDER = 'cliproxy';
  const RUN_MODEL = 'devin-swe-2';
  const STALE_MODEL = 'gemini-3.5-flash-lite';
  const NEW_SESSION_ID = 'ses_promoted_1';

  const runModel: Model = {
    ...model, modelId: RUN_MODEL, provider: RUN_PROVIDER, name: 'Devin SWE 2',
  };
  const staleModel: Model = {
    ...model, modelId: STALE_MODEL, provider: RUN_PROVIDER, name: 'Gemini 3.5 Flash Lite',
  };
  const multiProvider: Provider & { models: Model[] } = {
    ...provider, providerId: RUN_PROVIDER, name: RUN_PROVIDER, models: [staleModel, runModel],
  };

  const modelLabelText = () => dom.container.querySelector('.model-controls__model-label')?.textContent?.trim();

  const renderControls = async (directory = DIRECTORY) => {
    await act(async () => root.render(
      <SyncProvider client={client} directory={directory}>
        <ThemeSystemContext.Provider value={themeContext}>
          <I18nProvider>
            <TooltipProvider>
              <ModelControls />
              <MobileModelButton onOpenModel={() => undefined} />
            </TooltipProvider>
          </I18nProvider>
        </ThemeSystemContext.Provider>
      </SyncProvider>,
    ));
  };

  beforeEach(() => {
    dom = installDom();
    root = createRoot(dom.container);
    useProjectsStore.setState({
      projects: [
        { id: 'project', path: DIRECTORY },
        { id: 'chat-ws', path: CHAT_DIR },
      ],
      activeProjectId: 'project',
    });
    useDirectoryStore.setState({ currentDirectory: DIRECTORY });
    useSessionUIStore.setState({
      currentSessionId: null,
      currentSessionDirectory: null,
      materializedDraftSessionId: null,
      newSessionDraft: {
        ...useSessionUIStore.getState().newSessionDraft,
        open: true,
        target: 'chat',
        directoryOverride: null,
      },
    });
    useSelectionStore.setState({
      sessionModelSelections: new Map(),
      sessionAgentSelections: new Map(),
      sessionFollowedAgents: new Map(),
      sessionFollowedModels: new Map(),
      sessionAgentModelSelections: new Map(),
      agentModelVariantSelections: new Map(),
    });
    useUIStore.setState({ isMobile: false, isModelSelectorOpen: false, favoriteAgents: [], hiddenModels: [], shortcutOverrides: {}, routingFeatureAvailable: false });
    useAgentsStore.setState({
      agentsByDirectory: { [DIRECTORY]: [agent] },
      revisionsByDirectory: { [DIRECTORY]: '1' },
      errorsByDirectory: {},
    });
    const load = spyOn(useAgentsStore.getState(), 'loadAgents').mockResolvedValue(true);
    restoreAgentsLoad = () => load.mockRestore();
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [multiProvider],
      providersLoaded: true,
      currentProviderId: RUN_PROVIDER,
      currentModelId: RUN_MODEL,
      currentAgentName: AGENT_ID,
      currentVariant: undefined,
      currentVariantSelection: { override: undefined, inherited: undefined },
      settingsDefaultModel: `${RUN_PROVIDER}/${STALE_MODEL}`,
      settingsDefaultsLoaded: true,
      agentModelSelections: {},
      defaultProviders: {},
      selectionSource: 'manual',
      agentSelectionSource: 'auto',
      lastDisconnectReason: null,
      directoryScoped: {
        [DIRECTORY]: {
          providers: [multiProvider],
          models: [staleModel, runModel],
          providersLoaded: true,
          currentProviderId: RUN_PROVIDER,
          currentModelId: RUN_MODEL,
          currentVariant: undefined,
          currentVariantSelection: { override: undefined, inherited: undefined },
          currentAgentName: AGENT_ID,
          selectedProviderId: RUN_PROVIDER,
          agentModelSelections: {},
          defaultProviders: {},
          selectionSource: 'manual',
          agentSelectionSource: 'auto',
        },
      },
    });
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

  test('ordinary draft selection outside a run uses the draft config selection', async () => {
    await renderControls(DIRECTORY);
    expect(modelLabelText()).toBe('Devin SWE 2');
    await act(async () => {
      useConfigStore.getState().setModel(STALE_MODEL);
    });
    expect(modelLabelText()).toBe('Gemini 3.5 Flash Lite');
  });

  test('streaming run after draft promotion shows the authoritative run model while agents load or config falls back, then keeps it after completion', async () => {
    await renderControls(CHAT_DIR);
    expect(modelLabelText()).toBe('Devin SWE 2');

    // Promote draft -> new session in a new chat directory whose agents catalog is not loaded yet,
    // while directory activation / provider load puts the stale default model into useConfigStore.
    await act(async () => {
      useSelectionStore.getState().saveSessionModelSelection(NEW_SESSION_ID, RUN_PROVIDER, RUN_MODEL);
      useSessionUIStore.setState({
        currentSessionId: NEW_SESSION_ID,
        currentSessionDirectory: CHAT_DIR,
        materializedDraftSessionId: NEW_SESSION_ID,
        newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false },
      });
      useConfigStore.setState({
        activeDirectoryKey: CHAT_DIR,
        providers: [multiProvider],
        providersLoaded: true,
        currentProviderId: RUN_PROVIDER,
        currentModelId: STALE_MODEL,
        selectionSource: 'auto',
      });
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID,
          projectId: 'project',
          workspaceId: 'workspace-chat',
          displayPath: '.',
          rootSessionId: NEW_SESSION_ID,
          createdAt: 1,
          updatedAt: 2,
          epoch: 'epoch-1',
          headSequence: '1',
          runtimeStatus: 'running',
          activeRunId: 'run-1',
          mode: { kind: 'main' },
        },
        cursor: 'epoch-1:1',
        activeRun: { runId: 'run-1', sessionId: NEW_SESSION_ID, status: 'running', origin: 'host', createdAt: 2 },
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-1' },
        window: {
          firstTurnId: 'turn-1', lastTurnId: 'turn-1',
          firstMessageId: 'msg-user-1', lastMessageId: 'msg-assistant-1', hasEarlier: false,
        },
        turns: [{
          turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1',
          status: 'running', userMessageId: 'msg-user-1', assistantMessageIds: ['msg-assistant-1'], startedAt: 2,
        }],
        messages: [
          {
            messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user',
            createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }],
          },
          {
            messageId: 'msg-assistant-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'assistant',
            createdAt: 3, providerId: RUN_PROVIDER, modelId: RUN_MODEL, parts: [],
          },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    // Mid-stream: both desktop and mobile labels must show Devin SWE 2, never Gemini 3.5 Flash Lite.
    expect(modelLabelText()).toBe('Devin SWE 2');
    expect(dom.container.querySelector('button[title]')?.getAttribute('title')).toBe('Devin Swe 2');
    expect(dom.container.textContent).not.toContain('Gemini 3.5 Flash Lite');
    // Completion: assistant part arrives and run settles to idle.
    await act(async () => {
      useAgentsStore.setState({
        agentsByDirectory: { [DIRECTORY]: [agent], [CHAT_DIR]: [agent] },
        revisionsByDirectory: { [DIRECTORY]: '1', [CHAT_DIR]: '1' },
      });
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID,
          projectId: 'project',
          workspaceId: 'workspace-chat',
          displayPath: '.',
          rootSessionId: NEW_SESSION_ID,
          createdAt: 1,
          updatedAt: 4,
          epoch: 'epoch-1',
          headSequence: '2',
          runtimeStatus: 'idle',
          activeRunId: null,
          mode: { kind: 'main' },
        },
        cursor: 'epoch-1:2',
        activeRun: null,
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-assistant-1' },
        window: {
          firstTurnId: 'turn-1', lastTurnId: 'turn-1',
          firstMessageId: 'msg-user-1', lastMessageId: 'msg-assistant-1', hasEarlier: false,
        },
        turns: [{
          turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1',
          status: 'completed', userMessageId: 'msg-user-1', assistantMessageIds: ['msg-assistant-1'], startedAt: 2, finishedAt: 4,
        }],
        messages: [
          {
            messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user',
            createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }],
          },
          {
            messageId: 'msg-assistant-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'assistant',
            createdAt: 3, providerId: RUN_PROVIDER, modelId: RUN_MODEL,
            parts: [{ type: 'text', partId: 'p-a1', content: 'done' }],
          },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    expect(modelLabelText()).toBe('Devin SWE 2');
  });

  test('interrupted first run before assistant output keeps the session run model instead of snapping back to stale default', async () => {
    useAgentsStore.setState({
      agentsByDirectory: { [DIRECTORY]: [agent], [CHAT_DIR]: [agent] },
      revisionsByDirectory: { [DIRECTORY]: '1', [CHAT_DIR]: '1' },
    });
    await renderControls(CHAT_DIR);

    // Promote draft: setCurrentSession runs before saveSessionModelSelection and while config switches to stale default.
    await act(async () => {
      useSessionUIStore.setState({
        currentSessionId: NEW_SESSION_ID,
        currentSessionDirectory: CHAT_DIR,
        materializedDraftSessionId: NEW_SESSION_ID,
        newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false },
      });
      useConfigStore.setState({
        activeDirectoryKey: CHAT_DIR,
        providers: [multiProvider],
        providersLoaded: true,
        currentProviderId: RUN_PROVIDER,
        currentModelId: STALE_MODEL,
        selectionSource: 'auto',
      });
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState({ message: { [NEW_SESSION_ID]: [] } });
    });

    // Save selection and start active run (before any assistant message exists).
    await act(async () => {
      useSelectionStore.getState().saveSessionModelSelection(NEW_SESSION_ID, RUN_PROVIDER, RUN_MODEL);
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID,
          projectId: 'project',
          workspaceId: 'workspace-chat',
          displayPath: '.',
          rootSessionId: NEW_SESSION_ID,
          createdAt: 1,
          updatedAt: 2,
          epoch: 'epoch-1',
          headSequence: '1',
          runtimeStatus: 'running',
          activeRunId: 'run-abort',
          mode: { kind: 'main' },
        },
        cursor: 'epoch-1:1',
        activeRun: { runId: 'run-abort', sessionId: NEW_SESSION_ID, status: 'running', origin: 'host', createdAt: 2 },
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-1' },
        window: {
          firstTurnId: 'turn-1', lastTurnId: 'turn-1',
          firstMessageId: 'msg-user-1', lastMessageId: 'msg-user-1', hasEarlier: false,
        },
        turns: [{
          turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-abort',
          status: 'running', userMessageId: 'msg-user-1', assistantMessageIds: [], startedAt: 2,
        }],
        messages: [
          {
            messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user',
            createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }],
          },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });
    expect(modelLabelText()).toBe('Devin SWE 2');

    // Interrupt / cancel the run before any assistant reply was emitted.
    await act(async () => {
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID,
          projectId: 'project',
          workspaceId: 'workspace-chat',
          displayPath: '.',
          rootSessionId: NEW_SESSION_ID,
          createdAt: 1,
          updatedAt: 3,
          epoch: 'epoch-1',
          headSequence: '2',
          runtimeStatus: 'idle',
          activeRunId: null,
          mode: { kind: 'main' },
        },
        cursor: 'epoch-1:2',
        activeRun: null,
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-1' },
        window: {
          firstTurnId: 'turn-1', lastTurnId: 'turn-1',
          firstMessageId: 'msg-user-1', lastMessageId: 'msg-user-1', hasEarlier: false,
        },
        turns: [{
          turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-abort',
          status: 'cancelled', userMessageId: 'msg-user-1', assistantMessageIds: [], startedAt: 2, finishedAt: 3,
        }],
        messages: [
          {
            messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user',
            createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }],
          },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    expect(modelLabelText()).toBe('Devin SWE 2');
    expect(dom.container.textContent).not.toContain('Gemini 3.5 Flash Lite');
  });

  test('turn-2 active run shows turn-2 selection instead of turn-1 assistant reply model', async () => {
    useAgentsStore.setState({
      agentsByDirectory: { [DIRECTORY]: [agent], [CHAT_DIR]: [agent] },
      revisionsByDirectory: { [DIRECTORY]: '1', [CHAT_DIR]: '1' },
    });
    await renderControls(CHAT_DIR);

    await act(async () => {
      useSelectionStore.getState().saveSessionModelSelection(NEW_SESSION_ID, RUN_PROVIDER, RUN_MODEL);
      useSessionUIStore.setState({
        currentSessionId: NEW_SESSION_ID,
        currentSessionDirectory: CHAT_DIR,
        newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false },
      });
      useConfigStore.setState({
        activeDirectoryKey: CHAT_DIR,
        providers: [multiProvider],
        providersLoaded: true,
        currentProviderId: RUN_PROVIDER,
        currentModelId: STALE_MODEL,
        selectionSource: 'auto',
      });
      const store = getSyncChildStores().getChild(CHAT_DIR);
      if (!store) throw new Error('Expected mounted directory store');
      store.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID,
          projectId: 'project',
          workspaceId: 'workspace-chat',
          displayPath: '.',
          rootSessionId: NEW_SESSION_ID,
          createdAt: 1,
          updatedAt: 5,
          epoch: 'epoch-1',
          headSequence: '3',
          runtimeStatus: 'running',
          activeRunId: 'run-2',
          mode: { kind: 'main' },
        },
        cursor: 'epoch-1:3',
        activeRun: { runId: 'run-2', sessionId: NEW_SESSION_ID, status: 'running', origin: 'host', createdAt: 5 },
        selection: { model: { providerId: RUN_PROVIDER, modelId: STALE_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-2' },
        window: {
          firstTurnId: 'turn-1', lastTurnId: 'turn-2',
          firstMessageId: 'msg-user-1', lastMessageId: 'msg-user-2', hasEarlier: false,
        },
        turns: [
          {
            turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1',
            status: 'completed', userMessageId: 'msg-user-1', assistantMessageIds: ['msg-assistant-1'], startedAt: 2, finishedAt: 4,
          },
          {
            turnId: 'turn-2', sessionId: NEW_SESSION_ID, runId: 'run-2',
            status: 'running', userMessageId: 'msg-user-2', assistantMessageIds: [], startedAt: 5,
          },
        ],
        messages: [
          {
            messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user',
            createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'turn 1' }],
          },
          {
            messageId: 'msg-assistant-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'assistant',
            createdAt: 3, providerId: RUN_PROVIDER, modelId: STALE_MODEL,
            parts: [{ type: 'text', partId: 'p-a1', content: 'reply 1' }],
          },
          {
            messageId: 'msg-user-2', sessionId: NEW_SESSION_ID, turnId: 'turn-2', role: 'user',
            createdAt: 5, parts: [{ type: 'text', partId: 'p-u2', content: 'turn 2' }],
          },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    expect(modelLabelText()).toBe('Devin SWE 2');
    expect(dom.container.textContent).not.toContain('Gemini 3.5 Flash Lite');
  });

  test('draft promotion via setCurrentSession and activateDirectory keeps the run model in config store', async () => {
    useConfigStore.setState({ isConnected: false });
    await renderControls(DIRECTORY);
    expect(modelLabelText()).toBe('Devin SWE 2');

    await act(async () => {
      useSelectionStore.getState().saveSessionModelSelection(NEW_SESSION_ID, RUN_PROVIDER, RUN_MODEL);
      useSessionUIStore.getState().setCurrentSession(NEW_SESSION_ID, CHAT_DIR, 'submitted-draft');
      await useConfigStore.getState().activateDirectory(CHAT_DIR);
    });

    expect([useConfigStore.getState().currentProviderId, useConfigStore.getState().currentModelId]).toEqual([RUN_PROVIDER, RUN_MODEL]);
    expect(modelLabelText()).toBe('Devin SWE 2');
  });

  test('post-run completion after optimistic draft promotion never falls back to agents[0] pinned model', async () => {
    const HAIKU_MODEL = 'claude-haiku-5-5';
    const haikuModel: Model = {
      ...model, modelId: HAIKU_MODEL, provider: RUN_PROVIDER, name: 'Claude Haiku 5.5',
    };
    const providerWithHaiku: Provider & { models: Model[] } = {
      ...multiProvider, models: [staleModel, runModel, haikuModel],
    };
    const scoutAgent: Agent = {
      agentId: 'scout', name: 'Scout', description: 'Scout',
      model: { providerId: RUN_PROVIDER, modelId: HAIKU_MODEL }, allowedTools: null,
    };

    useAgentsStore.setState({
      agentsByDirectory: { [DIRECTORY]: [scoutAgent], [CHAT_DIR]: [scoutAgent] },
      revisionsByDirectory: { [DIRECTORY]: '1', [CHAT_DIR]: '1' },
    });
    useConfigStore.setState({
      activeDirectoryKey: DIRECTORY,
      providers: [providerWithHaiku],
      providersLoaded: true,
      currentProviderId: RUN_PROVIDER,
      currentModelId: RUN_MODEL,
      currentAgentName: undefined,
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
      directoryScoped: {
        [DIRECTORY]: {
          providers: [providerWithHaiku],
          models: [staleModel, runModel, haikuModel],
          providersLoaded: true,
          currentProviderId: RUN_PROVIDER,
          currentModelId: RUN_MODEL,
          currentVariant: undefined,
          currentVariantSelection: { override: undefined, inherited: undefined },
          currentAgentName: undefined,
          selectedProviderId: RUN_PROVIDER,
          agentModelSelections: {},
          defaultProviders: {},
          selectionSource: 'auto',
          agentSelectionSource: 'auto',
        },
      },
    });
    await renderControls(DIRECTORY);
    expect(modelLabelText()).toBe('Devin SWE 2');

    // Step 1: sendMessage sets temporaryDraftSessionId ('draft_1') and optimistic user message while POST /sessions is in flight.
    await act(async () => {
      const dirStore = getSyncChildStores().getChild(DIRECTORY);
      if (!dirStore) throw new Error('Expected mounted directory store');
      dirStore.setState({
        message: {
          draft_1: [{
            messageId: 'msg-draft-1', sessionId: 'draft_1', turnId: 'turn-draft-1', role: 'user',
            createdAt: 1, parts: [{ type: 'text', partId: 'p-d1', content: 'hi' }],
          }],
        },
      });
      useSessionUIStore.setState({
        currentSessionId: 'draft_1',
        currentSessionDirectory: DIRECTORY,
        materializedDraftSessionId: null,
        newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false },
      });
    });

    // Step 2: createSessionWithDraftLifecycle saves session model and promotes to NEW_SESSION_ID in CHAT_DIR; Turn 1 runs.
    await act(async () => {
      useSelectionStore.getState().saveSessionModelSelection(NEW_SESSION_ID, RUN_PROVIDER, RUN_MODEL);
      useSessionUIStore.setState({
        currentSessionId: NEW_SESSION_ID,
        currentSessionDirectory: CHAT_DIR,
        materializedDraftSessionId: NEW_SESSION_ID,
      });
      useConfigStore.setState({
        activeDirectoryKey: CHAT_DIR,
        providers: [providerWithHaiku],
        providersLoaded: true,
        currentProviderId: RUN_PROVIDER,
        currentModelId: RUN_MODEL,
        currentAgentName: undefined,
        selectionSource: 'manual',
        agentSelectionSource: 'auto',
      });
      const chatStore = getSyncChildStores().ensureChild(CHAT_DIR, { bootstrap: false });
      chatStore.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID, projectId: 'project', workspaceId: 'workspace-chat', displayPath: '.', rootSessionId: NEW_SESSION_ID,
          createdAt: 1, updatedAt: 2, epoch: 'epoch-1', headSequence: '1', runtimeStatus: 'running', activeRunId: 'run-1', mode: { kind: 'main' },
        },
        cursor: 'epoch-1:1',
        activeRun: { runId: 'run-1', sessionId: NEW_SESSION_ID, status: 'running', origin: 'host', createdAt: 2 },
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-1' },
        window: { firstTurnId: 'turn-1', lastTurnId: 'turn-1', firstMessageId: 'msg-user-1', lastMessageId: 'msg-assistant-1', hasEarlier: false },
        turns: [{ turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1', status: 'running', userMessageId: 'msg-user-1', assistantMessageIds: ['msg-assistant-1'], startedAt: 2 }],
        messages: [
          { messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user', createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }] },
          { messageId: 'msg-assistant-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'assistant', createdAt: 3, providerId: RUN_PROVIDER, modelId: RUN_MODEL, parts: [] },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });
    expect(modelLabelText()).toBe('Devin SWE 2');

    // Step 3: Turn 1 completes; label and next-run config model must remain Devin SWE 2, never switch to Claude Haiku 5.5.
    await act(async () => {
      const chatStore = getSyncChildStores().getChild(CHAT_DIR);
      if (!chatStore) throw new Error('Expected mounted chat directory store');
      chatStore.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID, projectId: 'project', workspaceId: 'workspace-chat', displayPath: '.', rootSessionId: NEW_SESSION_ID,
          createdAt: 1, updatedAt: 4, epoch: 'epoch-1', headSequence: '2', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
        },
        cursor: 'epoch-1:2',
        activeRun: null,
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-assistant-1' },
        window: { firstTurnId: 'turn-1', lastTurnId: 'turn-1', firstMessageId: 'msg-user-1', lastMessageId: 'msg-assistant-1', hasEarlier: false },
        turns: [{ turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1', status: 'completed', userMessageId: 'msg-user-1', assistantMessageIds: ['msg-assistant-1'], startedAt: 2, finishedAt: 4 }],
        messages: [
          { messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user', createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }] },
          { messageId: 'msg-assistant-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'assistant', createdAt: 3, providerId: RUN_PROVIDER, modelId: RUN_MODEL, parts: [{ type: 'text', partId: 'p-a1', content: 'ACK' }] },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    expect(modelLabelText()).toBe('Devin SWE 2');
    expect([useConfigStore.getState().currentProviderId, useConfigStore.getState().currentModelId]).toEqual([RUN_PROVIDER, RUN_MODEL]);
    expect(useConfigStore.getState().currentAgentName).toBeUndefined();
  });

  test('session with known snapshot selection never falls back to agents[0] pinned model when selection store is empty', async () => {
    const HAIKU_MODEL = 'claude-haiku-5-5';
    const haikuModel: Model = {
      ...model, modelId: HAIKU_MODEL, provider: RUN_PROVIDER, name: 'Claude Haiku 5.5',
    };
    const providerWithHaiku: Provider & { models: Model[] } = {
      ...multiProvider, models: [staleModel, runModel, haikuModel],
    };
    const scoutAgent: Agent = {
      agentId: 'scout', name: 'Scout', description: 'Scout',
      model: { providerId: RUN_PROVIDER, modelId: HAIKU_MODEL }, allowedTools: null,
    };

    useAgentsStore.setState({
      agentsByDirectory: { [CHAT_DIR]: [scoutAgent] },
      revisionsByDirectory: { [CHAT_DIR]: '1' },
    });
    useConfigStore.setState({
      activeDirectoryKey: CHAT_DIR,
      providers: [providerWithHaiku],
      providersLoaded: true,
      currentProviderId: RUN_PROVIDER,
      currentModelId: RUN_MODEL,
      currentAgentName: undefined,
      selectionSource: 'auto',
      agentSelectionSource: 'auto',
    });
    useSessionUIStore.setState({
      currentSessionId: NEW_SESSION_ID,
      currentSessionDirectory: CHAT_DIR,
      materializedDraftSessionId: null,
      newSessionDraft: { ...useSessionUIStore.getState().newSessionDraft, open: false },
    });
    await renderControls(CHAT_DIR);

    await act(async () => {
      const chatStore = getSyncChildStores().ensureChild(CHAT_DIR, { bootstrap: false });
      chatStore.setState((prev) => installSessionSnapshot(prev, {
        session: {
          sessionId: NEW_SESSION_ID, projectId: 'project', workspaceId: 'workspace-chat', displayPath: '.', rootSessionId: NEW_SESSION_ID,
          createdAt: 1, updatedAt: 4, epoch: 'epoch-1', headSequence: '2', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
        },
        cursor: 'epoch-1:2',
        activeRun: null,
        selection: { model: { providerId: RUN_PROVIDER, modelId: RUN_MODEL }, thinkingLevel: null },
        branch: { branchId: 'main', branchVersion: '1', leafMessageId: 'msg-user-1' },
        window: { firstTurnId: 'turn-1', lastTurnId: 'turn-1', firstMessageId: 'msg-user-1', lastMessageId: 'msg-user-1', hasEarlier: false },
        turns: [{ turnId: 'turn-1', sessionId: NEW_SESSION_ID, runId: 'run-1', status: 'cancelled', userMessageId: 'msg-user-1', assistantMessageIds: [], startedAt: 2, finishedAt: 4 }],
        messages: [
          { messageId: 'msg-user-1', sessionId: NEW_SESSION_ID, turnId: 'turn-1', role: 'user', createdAt: 2, parts: [{ type: 'text', partId: 'p-u1', content: 'hi' }] },
        ],
        approvals: [],
        questions: [],
        requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
      }));
    });

    expect(modelLabelText()).toBe('Devin SWE 2');
    expect([useConfigStore.getState().currentProviderId, useConfigStore.getState().currentModelId]).toEqual([RUN_PROVIDER, RUN_MODEL]);
  });
});
