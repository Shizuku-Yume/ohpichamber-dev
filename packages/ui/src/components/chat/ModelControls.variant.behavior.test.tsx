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
<<<<<<< HEAD
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
=======
import type { ModelMetadata } from '@/types';
>>>>>>> bc50ba56a

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
<<<<<<< HEAD
const provider: Provider & { models: Model[] } = {
  providerId: PROVIDER_ID, name: PROVIDER_ID, endpoint: null, protocol: null,
  authMethods: [], auth: { status: 'missing' }, models: [model],
};
const agent: Agent = {
  agentId: AGENT_ID, name: 'Build', description: 'Build native projects',
  model: null, allowedTools: ['read', 'custom-native-tool'], permissionPresetId: 'workspace-review',
=======
const provider = { id: PROVIDER_ID, name: PROVIDER_ID, models: [model] };
const agent = { id: AGENT, name: AGENT, displayName: 'Build', mode: 'primary' as const, hidden: false, request: { settings: {}, headers: {}, body: {} }, permissions: [] };
/** v2 pins an agent's model, and its effort, in one model reference. */
type TestAgent = typeof agent & { model?: { providerID: string; id: string; variant?: string } };
const planAgent: TestAgent = { ...agent, id: 'plan', name: 'plan', displayName: 'Plan' };
const reviewAgent: TestAgent = { ...agent, id: 'review', name: 'review', displayName: 'Review' };

let latestUserChoice: UserModelChoice | null = null;
/** Catalogs of folders other than the active one, keyed by folder. */
/** A test variant carries no settings. */
type EmptyVariant = { readonly settings?: never };
type FolderCatalog = {
  providers: Array<{ id: string; name: string; models: Array<{ id: string; name: string; providerID: string; variants: { low?: EmptyVariant; high?: EmptyVariant; max?: EmptyVariant } }> }>;
  agents: TestAgent[];
  loaded: boolean;
};
let folderCatalogs = new Map<string, FolderCatalog>();
/** Every folder a catalog load was asked for, as `resource:folder`. */
const catalogLoads: string[] = [];
/** Models and agents another directory's catalog lists, for the display fallback. */
type KnownElsewhere = { models: typeof model[]; agents: TestAgent[] };
const nothingKnownElsewhere = (): KnownElsewhere => ({ models: [], agents: [] });
let knownElsewhere = nothingKnownElsewhere();
let forcePreserveManualOverride: boolean | null = null;

/** Every effort written for the session, in order, including `undefined`. */
const variantWrites: VariantChoice[] = [];
/** Every `(override, inherited)` pair pushed into the config store. */
const overrideWrites: Array<{ override: VariantChoice; inherited: VariantChoice }> = [];
/** Every model remembered as the last chat pick. */
const lastSelectedWrites: string[] = [];
const pendingModelWrites: string[] = [];

type ConfigState = {
  providers: typeof provider[];
  agents: TestAgent[];
  providersLoaded: boolean;
  agentsLoaded: boolean;
  settingsDefaultsLoaded: boolean;
  modelsMetadata: Record<string, never>;
  currentProviderId: string;
  currentModelId: string;
  currentVariant: string | undefined;
  currentVariantSelection: { override: VariantChoice; inherited: VariantChoice };
  currentAgentName: string | undefined;
  settingsDefaultModel: string | undefined;
  settingsDefaultVariant: string | undefined;
  settingsDefaultAgent: string | undefined;
  selectionSource: 'auto' | 'manual';
  setProvider: (providerId: string) => void;
  setSelectedProvider: (providerId: string) => void;
  setModel: (modelId: string) => void;
  setAgent: (agentName: string, options?: { keepModel?: boolean }) => void;
  setCurrentVariant: (variant: string | undefined) => void;
  setCurrentVariantOverride: (override: VariantChoice, inherited: VariantChoice) => void;
  getCurrentProvider: () => typeof provider | undefined;
  getCurrentAgent: () => TestAgent;
  getVisibleAgents: () => TestAgent[];
  getCurrentModelVariants: () => string[];
  getDefaultVariantForModel: (providerId: string, modelId: string) => string | undefined;
  getModelMetadata: () => ModelMetadata | undefined;
  loadProviders: (options: { directory?: string | null }) => Promise<void>;
  loadAgents: (options: { directory?: string | null }) => Promise<boolean>;
};

const useConfigStore = create<ConfigState>((set, get) => ({
  providers: [provider],
  agents: [agent],
  providersLoaded: true,
  agentsLoaded: true,
  settingsDefaultsLoaded: true,
  modelsMetadata: {},
  currentProviderId: PROVIDER_ID,
  currentModelId: MODEL_ID,
  currentVariant: undefined,
  currentVariantSelection: { override: undefined, inherited: undefined },
  currentAgentName: AGENT,
  settingsDefaultModel: undefined,
  settingsDefaultVariant: undefined,
  settingsDefaultAgent: undefined,
  selectionSource: 'auto',
  setProvider: (providerId) => set({ currentProviderId: providerId }),
  setSelectedProvider: () => undefined,
  // Like the real store, a change of model drops the effort picked for the last one.
  setModel: (modelId) => set((state) => (state.currentModelId === modelId
    ? state
    : { currentModelId: modelId, currentVariant: undefined, currentVariantSelection: { override: undefined, inherited: undefined } })),
  // Like the real store, picking an agent also records it for the open session.
  setAgent: (agentName) => {
    set({ currentAgentName: agentName });
    const sessionId = useSessionUIStore.getState().currentSessionId;
    if (sessionId) useSelectionStore.getState().saveSessionAgentSelection(sessionId, agentName);
  },
  // Mirrors the real store, including its no-op guard: without that guard an
  // unchanged write returns a fresh state object every render and the
  // component's variant effects never settle.
  setCurrentVariant: (variant) => {
    useConfigStore.getState().setCurrentVariantOverride(undefined, variant);
  },
  setCurrentVariantOverride: (override, inherited) => {
    set((state) => {
      const currentVariant = override === null ? undefined : (override ?? inherited) ?? undefined;
      if (
        state.currentVariant === currentVariant
        && state.currentVariantSelection.override === override
        && state.currentVariantSelection.inherited === inherited
      ) {
        return state;
      }
      overrideWrites.push({ override, inherited });
      return { currentVariant, currentVariantSelection: { override, inherited } };
    });
  },
  getCurrentProvider: () => get().providers.find((entry) => entry.id === get().currentProviderId),
  getCurrentAgent: () => get().agents.find((entry) => entry.name === get().currentAgentName) ?? agent,
  getVisibleAgents: () => get().agents,
  getCurrentModelVariants: () => Object.keys(model.variants),
  // The real store also reads the project default; these tests run without a project.
  getDefaultVariantForModel: (providerId, modelId) => (
    get().settingsDefaultModel === `${providerId}/${modelId}` ? get().settingsDefaultVariant : undefined
  ),
  getModelMetadata: () => undefined,
  loadProviders: async ({ directory }) => { catalogLoads.push(`models:${directory}`); },
  loadAgents: async ({ directory }) => { catalogLoads.push(`agents:${directory}`); return true; },
}));

type SelectionState = {
  savedVariant: VariantChoice;
  sessionAgentSelections: Map<string, string>;
  sessionFollowedAgents: Map<string, string>;
  sessionFollowedModels: Map<string, string>;
  getSessionModelSelection: () => { providerId: string; modelId: string } | null;
  getSessionAgentSelection: (sessionId: string) => string | null;
  followSessionAgent: (sessionId: string, agent: string) => boolean;
  isSessionModelSwitched: (sessionId: string, model: string) => boolean;
  markSessionModelFollowed: (sessionId: string, model: string) => void;
  getAgentModelForSession: (sessionId: string, agentName: string) => { providerId: string; modelId: string } | null;
  getAgentModelVariantForSession: () => VariantChoice;
  saveSessionModelSelection: (sessionId: string, providerId: string, modelId: string) => void;
  pickSessionModel: (sessionId: string, providerId: string, modelId: string) => void;
  saveSessionAgentSelection: (sessionId: string, agentName: string) => void;
  pickSessionAgent: (sessionId: string, agentName: string) => void;
  saveAgentModelForSession: (sessionId: string, agentName: string, providerId: string, modelId: string) => void;
  saveAgentModelVariantForSession: (
    sessionId: string,
    agentName: string,
    providerId: string,
    modelId: string,
    variant: VariantChoice,
  ) => void;
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
type DomHarness = { win: Window; container: HTMLElement; restore: () => void };
const installDom = (): DomHarness => {
  const win = importWindow;
=======
const useSelectionStore = create<SelectionState>((set, get) => ({
  savedVariant: undefined,
  sessionAgentSelections: new Map([[SESSION_ID, AGENT]]),
  sessionFollowedAgents: new Map(),
  sessionFollowedModels: new Map(),
  getSessionModelSelection: () => ({ providerId: PROVIDER_ID, modelId: MODEL_ID }),
  getSessionAgentSelection: (sessionId) => get().sessionAgentSelections.get(sessionId) ?? null,
  // The real transition: only a record agent not followed yet moves the pick.
  followSessionAgent: (sessionId, agentName) => {
    if (get().sessionFollowedAgents.get(sessionId) === agentName) return false;
    set((state) => ({
      sessionFollowedAgents: new Map(state.sessionFollowedAgents).set(sessionId, agentName),
      sessionAgentSelections: new Map(state.sessionAgentSelections).set(sessionId, agentName),
    }));
    return true;
  },
  isSessionModelSwitched: (sessionId, modelKey) => {
    const followed = get().sessionFollowedModels.get(sessionId);
    return followed !== undefined && followed !== modelKey;
  },
  markSessionModelFollowed: (sessionId, modelKey) => set((state) => ({
    sessionFollowedModels: new Map(state.sessionFollowedModels).set(sessionId, modelKey),
  })),
  getAgentModelForSession: () => ({ providerId: PROVIDER_ID, modelId: MODEL_ID }),
  getAgentModelVariantForSession: () => get().savedVariant,
  saveSessionModelSelection: () => undefined,
  pickSessionModel: (sessionId, providerId, modelId) => { pendingModelWrites.push(`${sessionId}:${providerId}/${modelId}`); },
  saveSessionAgentSelection: (sessionId, agentName) => set((state) => ({
    sessionAgentSelections: new Map(state.sessionAgentSelections).set(sessionId, agentName),
  })),
  pickSessionAgent: (sessionId, agentName) => set((state) => ({
    sessionAgentSelections: new Map(state.sessionAgentSelections).set(sessionId, agentName),
  })),
  saveAgentModelForSession: () => undefined,
  saveAgentModelVariantForSession: (_sessionId, _agentName, _providerId, _modelId, variant) => {
    variantWrites.push(variant);
    set({ savedVariant: variant });
  },
}));

type SessionUIState = { currentSessionId: string | null; getDirectoryForSession: () => string };
const useSessionUIStore = create<SessionUIState>(() => ({
  currentSessionId: SESSION_ID,
  getDirectoryForSession: () => '/workspace/project',
}));

type UIStoreMock = {
  isMobile: boolean;
  isModelSelectorOpen: boolean;
  hiddenModels: Array<{ providerID: string; modelID: string }>;
  favoriteAgents: string[];
  toggleFavoriteAgent: (agentName: string) => void;
  providerOrder: string[];
  shortcutOverrides: Record<string, string>;
  isFavoriteModel: (providerID: string, modelID: string) => boolean;
  toggleFavoriteModel: (providerID: string, modelID: string) => void;
  reorderFavoriteModel: (providerID: string, modelID: string, targetIndex: number) => void;
  setProviderOrder: (order: string[]) => void;
  setModelSelectorOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setSettingsPage: (page: string) => void;
  addRecentAgent: (agentName: string) => void;
  addRecentModel: (providerID: string, modelID: string) => void;
  setLastSelectedModel: (providerID: string, modelID: string) => void;
  addRecentEffort: (providerID: string, modelID: string, variant: string | undefined) => void;
  lastUsedEfforts: Record<string, string | null>;
  rememberLastUsedEffort: (providerID: string, modelID: string, variant: string | null) => void;
};

const useUIStore = create<UIStoreMock>((set) => ({
  isMobile: false,
  isModelSelectorOpen: false,
  hiddenModels: [],
  favoriteAgents: [],
  toggleFavoriteAgent: () => undefined,
  providerOrder: [],
  shortcutOverrides: {},
  isFavoriteModel: () => false,
  toggleFavoriteModel: () => undefined,
  reorderFavoriteModel: () => undefined,
  setProviderOrder: () => undefined,
  setModelSelectorOpen: () => undefined,
  setSettingsDialogOpen: () => undefined,
  setSettingsPage: () => undefined,
  addRecentAgent: () => undefined,
  addRecentModel: () => undefined,
  setLastSelectedModel: (providerID: string, modelID: string) => { lastSelectedWrites.push(`${providerID}/${modelID}`); },
  addRecentEffort: () => undefined,
  lastUsedEfforts: {} as Record<string, string | null>,
  rememberLastUsedEffort: (providerID: string, modelID: string, variant: string | null) => set((state) => ({
    lastUsedEfforts: { ...state.lastUsedEfforts, [`${providerID}/${modelID}`]: variant },
  })),
}));

const passthrough = ({ children }: React.PropsWithChildren) => <div>{children}</div>;

// Captured by value before the module is replaced: reading it back off the
// namespace afterwards would resolve to the replacement and recurse.
const {
  areModelChoicesEqual,
  extractSessionRecordModelChoice,
  shouldPreserveManualModelOverride: realShouldPreserveManualModelOverride,
} = await import('@/lib/messages/userModelChoice');

mock.module('@/lib/messages/userModelChoice', () => ({
  areModelChoicesEqual,
  extractSessionRecordModelChoice,
  findLatestUserModelChoice: () => latestUserChoice,
  // The real guard, unless a test opts out: whether it fires decides which
  // restore branch runs, and the branch that erased a recorded Default is the
  // one it declines to protect.
  shouldPreserveManualModelOverride: (args: Parameters<typeof realShouldPreserveManualModelOverride>[0]) => (
    forcePreserveManualOverride ?? realShouldPreserveManualModelOverride(args)
  ),
}));

mock.module('@/stores/useConfigStore', () => ({
  useConfigStore,
  isStaleAutoSelection: () => false,
  selectCatalogLoadedForDirectory: (state: ConfigState, resource: 'models' | 'agents', directory?: string | null) => (directory == null
    ? (resource === 'models' ? state.providersLoaded : state.agentsLoaded)
    : folderCatalogs.get(directory)?.loaded ?? false),
  selectConfigAgentsForDirectory: (state: ConfigState, directory?: string | null) => (directory == null
    ? state.agents
    : folderCatalogs.get(directory)?.agents ?? []),
  selectProvidersForDirectory: (state: ConfigState, directory?: string | null) => (directory == null
    ? state.providers
    : folderCatalogs.get(directory)?.providers ?? []),
  // The active catalog first, then what other directories' catalogs know.
  selectKnownCatalogModel: (state: ConfigState, providerId: string, modelId: string) =>
    state.providers.find((provider) => provider.id === providerId)?.models.find((entry) => entry.id === modelId)
      ?? knownElsewhere.models.find((entry) => entry.providerID === providerId && entry.id === modelId),
  selectKnownAgent: (state: ConfigState, name: string) =>
    state.agents.find((agent) => agent.name === name) ?? knownElsewhere.agents.find((agent) => agent.name === name),
}));
mock.module('@/sync/selection-store', () => ({ useSelectionStore }));
mock.module('@/sync/session-ui-store', () => ({ useSessionUIStore }));
mock.module('@/stores/useUIStore', () => ({ useUIStore }));
mock.module('@/stores/contextStore', () => ({
  useContextStore: <T,>(selector: (state: { hasHydrated: boolean }) => T): T => selector({ hasHydrated: true }),
}));

// The session record the composer restores its selection from; a test sets
// it to drive the "open a historical session" path.
type SessionRecord = { id: string; agent?: string; model?: { providerID: string; id: string; variant?: string } };
const useSessionRecordStore = create<{ record: SessionRecord | undefined }>(() => ({ record: undefined }));
const setSessionRecord = (record: SessionRecord | undefined) => useSessionRecordStore.setState({ record });
mock.module('@/sync/sync-context', () => ({
  useSessionMessagesSelector: <T,>(_sessionID: string, _directory: string | undefined, select: (messages: [], state: { part: Record<string, never> }) => T): T => (
    select([], { part: {} })
  ),
  useSessionRenderable: () => true,
  useSessionSelector: <T,>(_sessionID: string | undefined, _directory: string | undefined, select: (session: SessionRecord | undefined) => T): T => {
    const record = useSessionRecordStore((state) => state.record);
    return React.useMemo(() => select(record), [record, select]);
  },
}));
mock.module('@/sync/use-sync', () => ({ useSync: () => ({ sessions: [] }) }));

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, open }: React.PropsWithChildren<{ open?: boolean }>) => <div data-menu-open={open}>{children}</div>,
  DropdownMenuContent: passthrough,
  DropdownMenuItem: ({ children, onSelect }: React.PropsWithChildren<{ onSelect?: () => void }>) => (
    <button onClick={onSelect}>{children}</button>
  ),
  DropdownMenuLabel: passthrough,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: passthrough,
  DropdownMenuSub: passthrough,
  DropdownMenuSubContent: passthrough,
  DropdownMenuSubTrigger: passthrough,
}));
mock.module('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
mock.module('@/components/ui/MobileOverlayPanel', () => ({
  MobileOverlayPanel: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null,
}));
mock.module('@/components/ui/ProviderLogo', () => ({ ProviderLogo: () => null }));
mock.module('@/components/ui/ScrollableOverlay', () => ({ ScrollableOverlay: passthrough }));
mock.module('@/components/ui/tooltip', () => ({
  Tooltip: passthrough,
  TooltipContent: passthrough,
  TooltipTrigger: passthrough,
}));
mock.module('@/components/icon/Icon', () => ({ Icon: () => null }));
mock.module('@/components/model-picker/ModelPickerList', () => ({
  ModelPickerList: ({ onSelect, onActiveKeyDown }: React.ComponentProps<typeof import('@/components/model-picker/ModelPickerList').ModelPickerList>) => (
    <div
      data-testid="model-picker-host"
      onKeyDown={(event) => onActiveKeyDown?.(event, { providerID: PROVIDER_ID, modelID: MODEL_ID, model })}
    >
      <button onClick={() => onSelect({ providerID: PROVIDER_ID, modelID: MODEL_ID, model })}>{MODEL_ID}</button>
    </div>
  ),
  ModelPickerCardBody: () => null,
}));
mock.module('@/hooks/useRuntimeAPIs', () => ({ useIsVSCodeRuntime: () => false }));
mock.module('@/hooks/useModelLists', () => ({ useModelLists: () => ({ favoriteModelsList: [], recentModelsList: [] }) }));
mock.module('@/hooks/useIsTextTruncated', () => ({ useIsTextTruncated: () => false }));
mock.module('@/lib/device', () => ({ useDeviceInfo: () => ({ isTouch: false }) }));
mock.module('@/lib/startupTrace', () => ({ markStartupTrace: () => undefined }));

const { ModelControls } = await import('./ModelControls');
const { ChatColumnSessionContext } = await import('./chatColumnSession');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const enDict = useI18nStore.getState().dictionary;
const { dict: zhCnDict } = await import('@/lib/i18n/messages/zh-CN');

const DOM_GLOBAL_NAMES = [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLIFrameElement',
  'localStorage',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

const frameTimers = new Map<number, ReturnType<Window['setTimeout']>>();
let nextFrameHandle = 1;

const installDom = () => {
  const happyWindow = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const values = {
    window: happyWindow,
    document: happyWindow.document,
    navigator: happyWindow.navigator,
    Node: happyWindow.Node,
    Element: happyWindow.Element,
    HTMLElement: happyWindow.HTMLElement,
    HTMLIFrameElement: happyWindow.HTMLIFrameElement,
    localStorage: happyWindow.localStorage,
    // The component focuses the composer through rAF on several paths.
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      const handle = nextFrameHandle++;
      frameTimers.set(handle, happyWindow.setTimeout(() => {
        frameTimers.delete(handle);
        callback(0);
      }, 0));
      return handle;
    },
    cancelAnimationFrame: (handle: number) => {
      const timer = frameTimers.get(handle);
      if (timer === undefined) return;
      frameTimers.delete(handle);
      happyWindow.clearTimeout(timer);
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const name of DOM_GLOBAL_NAMES) {
    Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  }

>>>>>>> bc50ba56a
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

<<<<<<< HEAD
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
=======
const renderModelControls = async (
  props: React.ComponentProps<typeof ModelControls> = {},
  column: { sessionId: string; directory: string } | null = null,
) => {
  const dom = installDom();
  const root = createRoot(dom.container);
  const theme = getThemeById('openchamber-dark');
  if (!theme) throw new Error('Expected built-in theme');
  const themeContext: ThemeContextValue = {
    currentTheme: theme, availableThemes: [theme], customThemeIds: [], customThemesLoading: false,
    isSystemPreference: false, themeMode: 'dark', lightThemeId: 'openchamber-light', darkThemeId: 'openchamber-dark',
    setTheme: () => undefined, setSystemPreference: () => undefined, setThemeMode: () => undefined,
    setLightThemePreference: () => undefined, setDarkThemePreference: () => undefined,
    reloadCustomThemes: async () => undefined, importTheme: async () => theme, deleteImportedTheme: async () => undefined,
  };
  await act(async () => root.render(
    <ThemeSystemContext.Provider value={themeContext}>
      <I18nProvider>
        <ChatColumnSessionContext.Provider value={column}>
          <ModelControls {...props} />
        </ChatColumnSessionContext.Provider>
      </I18nProvider>
    </ThemeSystemContext.Provider>,
  ));
  return {
    dom,
    cleanup: async () => {
      await act(async () => root.unmount());
      dom.restore();
    },
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
    dom = installDom();
    root = createRoot(dom.container);
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useDirectoryStore.setState({ currentDirectory: DIRECTORY });
    useSessionUIStore.setState({ currentSessionId: SESSION_ID, currentSessionDirectory: DIRECTORY });
    useSessionUIStore.setState({ worktreeMetadata: new Map([['btw-pending:ses_restore', { path: DIRECTORY, projectDirectory: DIRECTORY, branch: 'main', label: 'Project' }]]) });
=======
    variantWrites.length = 0;
    overrideWrites.length = 0;
    lastSelectedWrites.length = 0;
    pendingModelWrites.length = 0;
    latestUserChoice = null;
    knownElsewhere = nothingKnownElsewhere();
    setSessionRecord(undefined);
    forcePreserveManualOverride = null;
    useSessionUIStore.setState({ currentSessionId: SESSION_ID });
    useUIStore.setState({ isMobile: false, isModelSelectorOpen: false, lastUsedEfforts: {} });
>>>>>>> bc50ba56a
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
      currentVariantSelection: { override: undefined, inherited: undefined },
<<<<<<< HEAD
      settingsDefaultAgent: undefined, settingsDefaultModel: undefined, agentModelSelections: {}, defaultProviders: {},
      selectionSource: 'auto', agentSelectionSource: 'auto', lastDisconnectReason: null,
=======
      settingsDefaultModel: undefined,
      settingsDefaultVariant: undefined,
      selectionSource: 'auto',
      getModelMetadata: () => undefined,
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
  test('native pinned provider/model binding preserves a valid manual effort', async () => {
=======
  test('restores the concrete effort the session history carries', async () => {
    latestUserChoice = { id: 'msg-1', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID, variant: 'low' };
    useUIStore.setState({ isModelSelectorOpen: true });

    const { dom, cleanup } = await renderModelControls();
    try {
      expect(dom.container.querySelector('.model-controls__model-trigger')?.closest('[data-menu-open]')?.getAttribute('data-menu-open')).toBe('true');
      expect(variantWrites).toContain('low');
      expect(variantWrites).not.toContain(null);
      // Opening a session is not a pick: the next new session must not inherit its model.
      expect(lastSelectedWrites).toEqual([]);
      expect(pendingModelWrites).toEqual([]);
      expect(useSelectionStore.getState().savedVariant).toBe('low');
      expect(useConfigStore.getState().currentVariantSelection.override).toBe('low');
    } finally {
      await cleanup();
    }
  });

  test('restores the effort the session record carries, before any transcript is loaded', async () => {
    // OpenCode 2 keeps model, variant and agent on the session itself; a
    // historical session opens on that selection even when its messages
    // are not in memory yet and the last reply says nothing.
    setSessionRecord({ id: SESSION_ID, agent: AGENT, model: { providerID: PROVIDER_ID, id: MODEL_ID, variant: 'high' } });
    latestUserChoice = null;

    const { cleanup } = await renderModelControls();
    try {
      expect(variantWrites).toContain('high');
      expect(useSelectionStore.getState().savedVariant).toBe('high');
      expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
      expect(lastSelectedWrites).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test('the session record outranks an older reply in the transcript', async () => {
    setSessionRecord({ id: SESSION_ID, agent: AGENT, model: { providerID: PROVIDER_ID, id: MODEL_ID, variant: 'high' } });
    latestUserChoice = { id: 'msg-1', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID, variant: 'low' };

    const { cleanup } = await renderModelControls();
    try {
      expect(useSelectionStore.getState().savedVariant).toBe('high');
      expect(variantWrites).not.toContain('low');
    } finally {
      await cleanup();
    }
  });

  test('a draft keeps its chosen model and effort through a provider discovery gap', async () => {
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
  test('history without effort records no choice instead of explicit Default', async () => {
    await render();
    await stage([reply('msg-history')]);
    expect(savedVariant()).toBeUndefined();
    expect(useConfigStore.getState().currentVariantSelection.override).toBeUndefined();
=======
  const OTHER_MODEL_ID = 'gpt-other';
  const twoModelProvider = { ...provider, models: [model, { ...model, id: OTHER_MODEL_ID, name: OTHER_MODEL_ID }] };

  test('a draft starts on the level its model was last sent with', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useUIStore.setState({ lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' } });

    const { dom, cleanup } = await renderModelControls();
    try {
      expect(useConfigStore.getState().currentVariant).toBe('high');
      expect(useConfigStore.getState().currentVariantSelection).toEqual({
        override: undefined,
        inherited: 'high',
      });
      // The tooltip names it as remembered, not as the model's configured default.
      expect(dom.container.textContent).toContain('last used with this model');
    } finally {
      await cleanup();
    }
  });

  test('a configured level wins over the remembered level', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({
      settingsDefaultModel: `${PROVIDER_ID}/${MODEL_ID}`,
      settingsDefaultVariant: 'low',
    });
    useUIStore.setState({ lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' } });

    const { dom, cleanup } = await renderModelControls();
    try {
      expect(useConfigStore.getState().currentVariant).toBe('low');
      expect(dom.container.textContent).toContain("this model's default");
      expect(dom.container.textContent).not.toContain('last used with this model');
    } finally {
      await cleanup();
    }
  });

  test('an explicit Default remembered for a model is kept as a choice', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useUIStore.setState({ lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: null } });

    const { dom, cleanup } = await renderModelControls();
    try {
      expect(useConfigStore.getState().currentVariant).toBeUndefined();
      expect(useConfigStore.getState().currentVariantSelection).toEqual({
        override: undefined,
        inherited: null,
      });
      expect(dom.container.querySelector('.model-controls__variant-label')?.textContent?.trim()).toBe('Default');
    } finally {
      await cleanup();
    }
  });

  test('a remembered level the model no longer offers is ignored', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useUIStore.setState({ lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'removed' } });

    const { cleanup } = await renderModelControls();
    try {
      expect(useConfigStore.getState().currentVariant).toBeUndefined();
      // Not an explicit Default the user never picked.
      expect(useConfigStore.getState().currentVariantSelection).toEqual({
        override: undefined,
        inherited: undefined,
      });
    } finally {
      await cleanup();
    }
  });

  test('[issue-4601] a remembered level does not follow the user to another model', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ providers: [twoModelProvider] });
    useUIStore.setState({ lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' } });

    const { dom, cleanup } = await renderModelControls();
    try {
      expect(useConfigStore.getState().currentVariant).toBe('high');

      await act(async () => { useConfigStore.getState().setModel(OTHER_MODEL_ID); });
      expect(useConfigStore.getState().currentVariant).toBeUndefined();
      expect(useConfigStore.getState().currentVariantSelection).toEqual({
        override: undefined,
        inherited: undefined,
      });
      expect(dom.container.querySelector('.model-controls__variant-label')?.textContent?.trim()).toBe('Default');
    } finally {
      await cleanup();
    }
  });

  test('choosing a level in the picker remembers it without a send', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ currentVariantSelection: { override: undefined, inherited: undefined } });

    const { dom, cleanup } = await renderModelControls();
    try {
      await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__variant-trigger')?.click());
      const highButton = Array.from(dom.container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'High');
      await act(async () => highButton?.click());

      expect(useConfigStore.getState().currentVariantSelection.override).toBe('high');
      expect(useUIStore.getState().lastUsedEfforts).toEqual({ [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' });
    } finally {
      await cleanup();
    }
  });

  test('choosing Default in the picker remembers it as a real choice', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({ currentVariantSelection: { override: undefined, inherited: undefined } });

    const { dom, cleanup } = await renderModelControls();
    try {
      await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__variant-trigger')?.click());
      const defaultButton = Array.from(dom.container.querySelectorAll('button'))
        .filter((button) => button.textContent?.trim() === 'Default')
        .at(-1);
      await act(async () => defaultButton?.click());

      expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
      expect(useUIStore.getState().lastUsedEfforts).toEqual({ [`${PROVIDER_ID}/${MODEL_ID}`]: null });
    } finally {
      await cleanup();
    }
  });

  test('arrow keys in the model picker remember the adjusted level before a model is chosen', async () => {
    useUIStore.setState({ isModelSelectorOpen: true });

    const { dom, cleanup } = await renderModelControls();
    try {
      const host = dom.container.querySelector('[data-testid="model-picker-host"]');
      await act(async () => {
        host?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });

      // Default -> low on the row's own line, remembered for that model.
      expect(useUIStore.getState().lastUsedEfforts).toEqual({ [`${PROVIDER_ID}/${MODEL_ID}`]: 'low' });
      // The row is still adjusting its pending level; no session choice was
      // written for the model.
      expect(variantWrites).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test('[issue-4601] the settings effort applies on the settings model only', async () => {
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({
      providers: [twoModelProvider],
      settingsDefaultModel: `${PROVIDER_ID}/${MODEL_ID}`,
      settingsDefaultVariant: 'high',
    });
    const { dom, cleanup } = await renderModelControls();
    try {
      const label = () => dom.container.querySelector('.model-controls__variant-label');
      expect(useConfigStore.getState().currentVariant).toBe('high');
      expect(label()?.textContent?.trim()).toBe('High');

      await act(async () => { useConfigStore.getState().setModel(OTHER_MODEL_ID); });
      expect(useConfigStore.getState().currentVariant).toBe(undefined);
      expect(label()?.textContent?.trim()).toBe('Default');

      await act(async () => { useConfigStore.getState().setModel(MODEL_ID); });
      expect(useConfigStore.getState().currentVariant).toBe('high');
    } finally {
      await cleanup();
    }
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
  }
=======
    const { dom, cleanup } = await renderModelControls();
    try {
      const label = () => dom.container.querySelector('.model-controls__variant-label');

      await act(async () => { useConfigStore.getState().setModel(OTHER_MODEL_ID); });
      expect(useConfigStore.getState().currentVariant).toBe(undefined);
      expect(useConfigStore.getState().currentVariantSelection.override).toBe(undefined);
      expect(label()?.textContent?.trim()).toBe('Default');
    } finally {
      await cleanup();
    }
  });
>>>>>>> bc50ba56a

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
<<<<<<< HEAD
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
=======
        expect(dom.container.querySelector('.model-controls__model-trigger')?.textContent?.toLowerCase()).toContain(MODEL_ID);
        expect(dom.container.querySelector('.model-controls__agent-label')?.textContent).toBe('Build');
      } finally {
        await cleanup();
      }
    });
  }

  test('enables the agent picker before providers and distinguishes a completed empty catalog', async () => {
    useUIStore.setState({ isMobile: true });
    useSessionUIStore.setState({ currentSessionId: null });
    useConfigStore.setState({
      providers: [], providersLoaded: false, agents: [agent], agentsLoaded: true,
      currentProviderId: '', currentModelId: '', currentAgentName: AGENT,
    });
    const { dom, cleanup } = await renderModelControls();
    try {
      expect(dom.container.querySelector('.model-controls__agent-trigger')?.hasAttribute('disabled')).toBe(false);
      expect(dom.container.querySelector('.model-controls__model-trigger')?.hasAttribute('disabled')).toBe(true);
      expect(dom.container.querySelector('.model-controls__model-trigger')?.textContent).toContain('Loading');
      await act(async () => {
        useConfigStore.setState({ providersLoaded: true, agents: [], currentAgentName: undefined });
      });
      expect(dom.container.querySelector('.model-controls__model-trigger')?.textContent?.toLowerCase()).toContain('select model');
      expect(dom.container.querySelector('.model-controls__agent-label')?.textContent?.toLowerCase()).toContain('select agent');
    } finally {
      await cleanup();
    }
  });

  test('history without an effort records no choice instead of an explicit Default', async () => {
    latestUserChoice = { id: 'msg-2', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID };

    const { cleanup } = await renderModelControls();
    try {
      expect(variantWrites).not.toContain(null);
      expect(useSelectionStore.getState().savedVariant).toBe(undefined);
      expect(useConfigStore.getState().currentVariantSelection.override).toBe(undefined);
    } finally {
      await cleanup();
    }
  });

  test('does not reapply persisted session selections after a live agent change', async () => {
    const selections = useSelectionStore.getState();
    const getSessionModel = spyOn(selections, 'getSessionModelSelection');
    const { cleanup } = await renderModelControls();
    try {
      const callsAfterHydration = getSessionModel.mock.calls.length;

      await act(async () => useConfigStore.getState().setAgent('plan'));

      expect(getSessionModel.mock.calls.length).toBe(callsAfterHydration);
      expect(useConfigStore.getState().currentAgentName).toBe('plan');
    } finally {
      getSessionModel.mockRestore();
      await cleanup();
      // The pick wrote a new state object that still carries the spy.
      useSelectionStore.setState(selections);
    }
  });

  test('the echo of a Default send does not erase the recorded Default', async () => {
    // The reported repro. The send under "Default" carried no effort, so the
    // message it echoes back carries none either, and its model matches the one
    // the send saved — which is exactly when the manual-override guard declines
    // to protect the selection and the history branch runs.
    latestUserChoice = { id: 'msg-echo', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID };
    useSelectionStore.setState({ savedVariant: null });
    useConfigStore.setState({
      selectionSource: 'manual',
      settingsDefaultVariant: 'low',
      currentVariantSelection: { override: null, inherited: 'low' },
    });

    const { cleanup } = await renderModelControls();
    try {
      expect(useSelectionStore.getState().savedVariant).toBeNull();
      expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
      expect(useConfigStore.getState().currentVariant).toBe(undefined);
    } finally {
      await cleanup();
    }
  });

  test('a preserved manual override keeps a recorded explicit Default', async () => {
    latestUserChoice = { id: 'msg-3', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID, variant: 'high' };
    forcePreserveManualOverride = true;
    useSelectionStore.setState({ savedVariant: null });
    useConfigStore.setState({ selectionSource: 'manual' });

    const { cleanup } = await renderModelControls();
    try {
      expect(useSelectionStore.getState().savedVariant).toBeNull();
      expect(useConfigStore.getState().currentVariantSelection.override).toBeNull();
    } finally {
      await cleanup();
    }
  });

  for (const [isMobile, variant, variantLabel] of [
    [false, 'low', 'Low'], [true, null, 'Default'],
  ] as const) {
    test(`controlled BTW selection stays independent (mobile: ${isMobile}, effort: ${variant})`, async () => {
      const btwSessionId = 'btw-pending:ses_restore';
      latestUserChoice = { id: 'msg-main', agent: AGENT, providerID: PROVIDER_ID, modelID: MODEL_ID, variant: 'high' };
      useUIStore.setState({ isMobile, isModelSelectorOpen: true });
      useConfigStore.setState({
        currentProviderId: 'main-provider', currentModelId: 'main-model',
        currentVariant: 'low', currentVariantSelection: { override: undefined, inherited: 'low' },
      });
      const selections = useSelectionStore.getState();
      const saveModel = spyOn(selections, 'saveSessionModelSelection');
      const saveAgentModel = spyOn(selections, 'saveAgentModelForSession');
      const saveVariant = spyOn(selections, 'saveAgentModelVariantForSession');
      const { dom, cleanup } = await renderModelControls({
        sessionId: btwSessionId,
        selection: { model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, agent: 'plan', variant },
        rememberVariantPicks: false,
      });
      try {
        expect(overrideWrites).toEqual([]);
        expect(variantWrites).toEqual([]);
        expect(saveModel.mock.calls).toEqual([]);
        expect(dom.container.querySelector('.model-controls__agent-label')?.textContent).toBe('Plan');
        expect(dom.container.querySelector('.model-controls__variant-label')?.textContent?.trim()).toBe(variantLabel);
        if (!isMobile) {
          expect(dom.container.querySelector('.model-controls__model-trigger')?.closest('[data-menu-open]')?.getAttribute('data-menu-open')).toBe('false');
        }

        await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__model-trigger')?.click());
        const modelButton = Array.from(dom.container.querySelectorAll<HTMLButtonElement>('button:not(.model-controls__model-trigger)')).find((button) => button.textContent?.trim() === MODEL_ID);
        await act(async () => modelButton?.click());
        expect(pendingModelWrites).toContain(`${btwSessionId}:${PROVIDER_ID}/${MODEL_ID}`);
        expect(saveModel.mock.calls.at(-1)).toEqual([btwSessionId, PROVIDER_ID, MODEL_ID]);
        expect(saveAgentModel.mock.calls.at(-1)).toEqual([btwSessionId, 'plan', PROVIDER_ID, MODEL_ID]);

        await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__variant-trigger')?.click());
        // On mobile the trigger itself reads "Default" too; the last one is the
        // panel entry that actually picks it.
        const defaultButton = Array.from(dom.container.querySelectorAll('button'))
          .filter((button) => button.textContent?.trim() === 'Default')
          .at(-1);
        await act(async () => defaultButton?.click());
        expect(saveVariant.mock.calls.at(-1)).toEqual([btwSessionId, 'plan', PROVIDER_ID, MODEL_ID, null]);
        // A BTW picker sees the model's memory but never rewrites it.
        expect(useUIStore.getState().lastUsedEfforts).toEqual({});
        const config = useConfigStore.getState();
        expect([config.currentProviderId, config.currentModelId, config.currentAgentName, config.currentVariant])
          .toEqual(['main-provider', 'main-model', AGENT, 'low']);
        expect(overrideWrites).toEqual([]);
      } finally {
        await cleanup();
        for (const write of [saveModel, saveAgentModel, saveVariant]) write.mockRestore();
        useSelectionStore.setState(selections);
      }
    });
  }

  // The BTW composer offers the agent picker, so a side question can start on
  // another agent without collapsing the panel first (#6333).
  for (const isMobile of [false, true]) {
    test(`a controlled agent pick stays on its own session (mobile: ${isMobile})`, async () => {
      const btwSessionId = 'btw-pending:ses_restore';
      useUIStore.setState({ isMobile });
      useConfigStore.setState({ agents: [agent, planAgent] });
      const { dom, cleanup } = await renderModelControls({
        sessionId: btwSessionId,
        selection: { model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, agent: AGENT, variant: 'low' },
        rememberVariantPicks: false,
      });
      const buttonsReading = (label: string) => Array
        .from(dom.container.querySelectorAll<HTMLButtonElement>('button'))
        .filter((button) => button.textContent?.trim() === label);
      try {
        expect(dom.container.querySelector('.model-controls__agent-label')?.textContent).toBe('Build');
        // Mobile reaches the agents through the bottom sheet the chip opens.
        if (isMobile) {
          expect(buttonsReading('Plan')).toHaveLength(0);
          await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__agent-trigger')?.click());
        }
        expect(buttonsReading('Plan')).toHaveLength(1);
        await act(async () => buttonsReading('Plan')[0]?.click());

        expect(useSelectionStore.getState().sessionAgentSelections.get(btwSessionId)).toBe('plan');
        // The picked agent is the fork's alone: the main chat keeps its own.
        expect(useSelectionStore.getState().sessionAgentSelections.get(SESSION_ID)).toBe(AGENT);
        expect(useConfigStore.getState().currentAgentName).toBe(AGENT);
        // Effort is remembered per agent, so the level the composer carries
        // follows the pick instead of falling back to the model's own.
        expect(variantWrites).toEqual(['low']);
        // The sheet answers the pick by closing.
        if (isMobile) expect(buttonsReading('Plan')).toHaveLength(0);
      } finally {
        await cleanup();
      }
    });
  }

  test('a controlled agent pick leaves an unchosen effort unchosen', async () => {
    const btwSessionId = 'btw-pending:ses_restore';
    useConfigStore.setState({ agents: [agent, planAgent] });
    const { dom, cleanup } = await renderModelControls({
      sessionId: btwSessionId,
      selection: { model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, agent: AGENT, variant: undefined },
      rememberVariantPicks: false,
    });
    try {
      const planRow = Array.from(dom.container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === 'Plan');
      await act(async () => planRow?.click());
      expect(useSelectionStore.getState().sessionAgentSelections.get(btwSessionId)).toBe('plan');
      // Nothing was chosen, so the new agent inherits instead of latching Default.
      expect(variantWrites).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  for (const isMobile of [false, true]) {
    test(`reselecting the controlled model preserves Default (mobile: ${isMobile})`, async () => {
      useUIStore.setState({ isMobile, lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' } });
      const saveVariant = spyOn(useSelectionStore.getState(), 'saveAgentModelVariantForSession');
      const { dom, cleanup } = await renderModelControls({
        sessionId: 'pinned-default',
        selection: { model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, agent: 'plan', variant: null },
      });
      try {
        await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__model-trigger')?.click());
        const modelButton = Array.from(dom.container.querySelectorAll<HTMLButtonElement>('button:not(.model-controls__model-trigger)'))
          .find((button) => button.textContent?.trim() === MODEL_ID);
        expect(modelButton).toBeDefined();
        await act(async () => modelButton?.click());
        expect(saveVariant.mock.calls.at(-1)).toEqual(['pinned-default', 'plan', PROVIDER_ID, MODEL_ID, null]);
      } finally {
        await cleanup();
        saveVariant.mockRestore();
      }
    });

    test(`a controlled model pick applies its remembered effort without rewriting it (mobile: ${isMobile})`, async () => {
      useUIStore.setState({ isMobile, lastUsedEfforts: { [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' } });
      useConfigStore.setState({ providers: [twoModelProvider] });
      const saveVariant = spyOn(useSelectionStore.getState(), 'saveAgentModelVariantForSession');
      const { dom, cleanup } = await renderModelControls({
        sessionId: 'btw-pending:ses_restore',
        selection: { model: { providerId: PROVIDER_ID, modelId: OTHER_MODEL_ID }, agent: 'plan', variant: 'low' },
        rememberVariantPicks: false,
      });
      try {
        await act(async () => dom.container.querySelector<HTMLButtonElement>('.model-controls__model-trigger')?.click());
        const modelButton = Array.from(dom.container.querySelectorAll<HTMLButtonElement>('button:not(.model-controls__model-trigger)'))
          .find((button) => button.textContent?.trim() === MODEL_ID);
        expect(modelButton).toBeDefined();
        await act(async () => modelButton?.click());

        expect(saveVariant.mock.calls.at(-1)).toEqual(['btw-pending:ses_restore', 'plan', PROVIDER_ID, MODEL_ID, 'high']);
        expect(useUIStore.getState().lastUsedEfforts).toEqual({ [`${PROVIDER_ID}/${MODEL_ID}`]: 'high' });
      } finally {
        await cleanup();
        saveVariant.mockRestore();
      }
    });
  }

  describe('following the session agent', () => {
    const OTHER_MODEL_ID = 'gpt-other';
    const recordOn = (agentName: string) => ({
      id: SESSION_ID, agent: agentName, model: { providerID: PROVIDER_ID, id: MODEL_ID, variant: 'high' },
    });
    const agentLabel = (container: HTMLElement) => container.querySelector('.model-controls__agent-label')?.textContent;
    /** The picker writes both stores, like `handleAgentChange`. */
    const pickAgent = (agentName: string) => useConfigStore.getState().setAgent(agentName);
    const switchSession = (sessionId: string) => act(async () => useSessionUIStore.setState({ currentSessionId: sessionId }));

    beforeEach(() => {
      useConfigStore.setState({ agents: [agent, planAgent, reviewAgent] });
    });

    test('a switch another client or a plugin made moves the picker, and keeps the session model', async () => {
      setSessionRecord(recordOn(AGENT));
      const selections = useSelectionStore.getState();
      // What the session last ran on with Plan is not what it runs on now.
      const getAgentModel = spyOn(selections, 'getAgentModelForSession');
      getAgentModel.mockImplementation((_sessionId: string, agentName: string) => (
        agentName === 'plan' ? { providerId: PROVIDER_ID, modelId: OTHER_MODEL_ID } : { providerId: PROVIDER_ID, modelId: MODEL_ID }
      ));
      useConfigStore.setState({ providers: [{ ...provider, models: [model, { ...model, id: OTHER_MODEL_ID, name: OTHER_MODEL_ID }] }] });
      const { dom, cleanup } = await renderModelControls();
      try {
        expect(agentLabel(dom.container)).toBe('Build');

        await act(async () => setSessionRecord(recordOn('plan')));
        // The agent-change effect waits 50ms before it applies a remembered model.
        await act(async () => new Promise((resolve) => setTimeout(resolve, 80)));

        expect(agentLabel(dom.container)).toBe('Plan');
        expect(useConfigStore.getState().currentAgentName).toBe('plan');
        expect(useSelectionStore.getState().getSessionAgentSelection(SESSION_ID)).toBe('plan');
        expect(useConfigStore.getState().currentModelId).toBe(MODEL_ID);
      } finally {
        getAgentModel.mockRestore();
        await cleanup();
      }
    });

    test('a pick made after the session record survives reopening the session', async () => {
      setSessionRecord(recordOn(AGENT));
      const { dom, cleanup } = await renderModelControls();
      try {
        await act(async () => pickAgent('plan'));
        await switchSession('ses_other');
        await switchSession(SESSION_ID);

        expect(agentLabel(dom.container)).toBe('Plan');
        expect(useConfigStore.getState().currentAgentName).toBe('plan');
      } finally {
        await cleanup();
      }
    });

    test('the agent sent comes back to the session agent shown when the app-wide one drifts', async () => {
      setSessionRecord(recordOn(AGENT));
      const { dom, cleanup } = await renderModelControls();
      try {
        // Another session or folder moved the app-wide agent; this session
        // still holds Build, and the label shows Build.
        await act(async () => useConfigStore.setState({ currentAgentName: 'plan' }));

        expect(agentLabel(dom.container)).toBe('Build');
        expect(useConfigStore.getState().currentAgentName).toBe(AGENT);
      } finally {
        await cleanup();
      }
    });

    test('a newer switch wins over a pick that was not sent', async () => {
      setSessionRecord(recordOn(AGENT));
      const { dom, cleanup } = await renderModelControls();
      try {
        await act(async () => pickAgent('plan'));
        await act(async () => setSessionRecord(recordOn('review')));

        expect(agentLabel(dom.container)).toBe('Review');
        expect(useConfigStore.getState().currentAgentName).toBe('review');
      } finally {
        await cleanup();
      }
    });

    test('the picker follows a switch while a manual model choice is kept', async () => {
      setSessionRecord(recordOn(AGENT));
      forcePreserveManualOverride = true;
      useConfigStore.setState({ selectionSource: 'manual' });
      const { dom, cleanup } = await renderModelControls();
      try {
        await act(async () => setSessionRecord(recordOn('plan')));

        expect(agentLabel(dom.container)).toBe('Plan');
        expect(useConfigStore.getState().currentAgentName).toBe('plan');
      } finally {
        await cleanup();
      }
    });

    const THIRD_MODEL_ID = 'gpt-third';
    const recordWith = (modelId: string, agentName = AGENT) => ({
      id: SESSION_ID, agent: agentName, model: { providerID: PROVIDER_ID, id: modelId },
    });
    const withModels = () => useConfigStore.setState({
      providers: [{ ...provider, models: [model, ...[OTHER_MODEL_ID, THIRD_MODEL_ID].map((id) => ({ ...model, id, name: id }))] }],
    });

    test('a model switch made elsewhere wins over a model picked here, an unchanged record does not', async () => {
      withModels();
      // The picker holds a model the session has not been sent with yet.
      useConfigStore.setState({ selectionSource: 'manual' });
      setSessionRecord(recordWith(OTHER_MODEL_ID));
      const { cleanup } = await renderModelControls();
      try {
        expect(useConfigStore.getState().currentModelId).toBe(MODEL_ID);

        await act(async () => setSessionRecord(recordWith(THIRD_MODEL_ID)));
        expect(useConfigStore.getState().currentModelId).toBe(THIRD_MODEL_ID);
        // A switch made elsewhere is not this person's pick.
        expect(lastSelectedWrites).toEqual([]);
      } finally {
        await cleanup();
      }
    });

    for (const change of ['agent', 'model'] as const) {
      test(`Auto stays on screen when the session switches ${change}`, async () => {
        withModels();
        const selections = useSelectionStore.getState();
        const auto = { providerId: AUTO_PROVIDER_ID, modelId: AUTO_MODEL_ID };
        const spies = [spyOn(selections, 'getSessionModelSelection'), spyOn(selections, 'getAgentModelForSession')];
        for (const spy of spies) spy.mockReturnValue(auto);
        const saveModel = spyOn(selections, 'saveSessionModelSelection');
        useRoutingStore.setState({ available: true, autoReady: true });
        useConfigStore.setState({ currentProviderId: AUTO_PROVIDER_ID, currentModelId: AUTO_MODEL_ID });
        setSessionRecord(recordWith(OTHER_MODEL_ID));
        const { cleanup } = await renderModelControls();
        try {
          await act(async () => setSessionRecord(change === 'agent'
            ? recordWith(OTHER_MODEL_ID, 'plan')
            // The router moving the session to another model each turn.
            : recordWith(THIRD_MODEL_ID)));
          await act(async () => new Promise((resolve) => setTimeout(resolve, 80)));

          const { currentProviderId, currentModelId, currentAgentName } = useConfigStore.getState();
          expect([currentProviderId, currentModelId]).toEqual([AUTO_PROVIDER_ID, AUTO_MODEL_ID]);
          expect(saveModel.mock.calls.some(([, providerId, modelId]) => !isAutoModel(providerId, modelId))).toBe(false);
          // Auto hides the agent picker; the agent still follows for sends.
          if (change === 'agent') expect(currentAgentName).toBe('plan');
        } finally {
          await cleanup();
          for (const spy of [...spies, saveModel]) spy.mockRestore();
          useSelectionStore.setState(selections);
          useRoutingStore.setState({ available: false, autoReady: false });
        }
      });
    }
  });

  const metadataValues = (container: ParentNode, label: string) => [...container.querySelectorAll('span')]
    .filter((node) => node.textContent === label)
    .map((node) => node.nextElementSibling?.textContent ?? '');

  describe('knowledge month display', () => {
    const setKnowledgeMetadata = (knowledge: string | undefined) => {
      useConfigStore.setState({
        getModelMetadata: () => ({ id: MODEL_ID, providerId: PROVIDER_ID, knowledge }),
      });
    };

    beforeEach(() => {
      useI18nStore.setState({ locale: 'en', dictionary: enDict, loadingLocale: null });
    });

    for (const { knowledge, expected } of [
      { knowledge: '2025-08', expected: 'Aug 2025' },
      { knowledge: '2025-01', expected: 'Jan 2025' },
      { knowledge: undefined, expected: '—' },
      { knowledge: '', expected: '—' },
      { knowledge: '2026-04-30', expected: '2026-04-30' },
      { knowledge: 'unknown', expected: 'unknown' },
    ]) {
      test(`preserves the knowledge value for ${knowledge ?? 'a missing cutoff'}`, async () => {
        setKnowledgeMetadata(knowledge);
        const { dom, cleanup } = await renderModelControls();
        try {
          expect(metadataValues(dom.container, 'Knowledge')).toEqual([expected]);
        } finally {
          await cleanup();
        }
      });
    }

    test('keeps the knowledge month when the mounted locale changes', async () => {
      setKnowledgeMetadata('2025-08');
      const previousLocale = useI18nStore.getState();
      const { dom, cleanup } = await renderModelControls();
      try {
        expect(metadataValues(dom.container, 'Knowledge')).toEqual(['Aug 2025']);
        await act(async () => {
          useI18nStore.setState({ locale: 'zh-CN', dictionary: zhCnDict, loadingLocale: null });
        });
        expect(metadataValues(dom.container, zhCnDict['chat.modelControls.knowledge'])).toEqual(['2025年8月']);
      } finally {
        await cleanup();
        useI18nStore.setState(previousLocale);
      }
    });

    test('keeps the knowledge month and UTC release day in mobile long-press details', async () => {
      useUIStore.setState({ isMobile: true });
      useConfigStore.setState({
        getModelMetadata: () => ({
          id: MODEL_ID,
          providerId: PROVIDER_ID,
          knowledge: '2025-08',
          release_date: '2026-09-29',
        }),
      });
      const { dom, cleanup } = await renderModelControls();
      const trigger = dom.container.querySelector('.model-controls__model-trigger');
      const dispatchTouch = (type: 'touchstart' | 'touchend') => {
        const view = trigger?.ownerDocument?.defaultView;
        if (!trigger || !view) throw new Error('Expected model trigger');
        trigger.dispatchEvent(new view.Event(type, { bubbles: true }));
      };
      try {
        expect(metadataValues(dom.container, 'Knowledge')).toEqual(['Aug 2025']);
        expect(metadataValues(dom.container, 'Release')).toEqual(['Sep 29, 2026']);
        await act(async () => {
          dispatchTouch('touchstart');
          await new Promise((resolve) => setTimeout(resolve, 500));
        });
        expect(metadataValues(dom.container, 'Knowledge')).toEqual(['Aug 2025', 'Aug 2025']);
        expect(metadataValues(dom.container, 'Release')).toEqual(['Sep 29, 2026', 'Sep 29, 2026']);
      } finally {
        if (trigger) dispatchTouch('touchend');
        await cleanup();
      }
    });
  });

  describe('release date display', () => {
    const setReleaseMetadata = (releaseDate: string | undefined) => {
      useConfigStore.setState({
        getModelMetadata: () => ({
          id: MODEL_ID,
          providerId: PROVIDER_ID,
          name: MODEL_ID,
          release_date: releaseDate,
        }),
      });
    };

    beforeEach(() => {
      useI18nStore.setState({ locale: 'en', dictionary: enDict, loadingLocale: null });
    });

    test('shows a date-only release on its UTC day and follows the mounted locale', async () => {
      setReleaseMetadata('2026-09-29');
      const { dom, cleanup } = await renderModelControls();
      try {
        expect(metadataValues(dom.container, 'Release')).toEqual(['Sep 29, 2026']);
        await act(async () => {
          useI18nStore.setState({ locale: 'zh-CN', dictionary: zhCnDict, loadingLocale: null });
        });
        expect(metadataValues(dom.container, '发布时间')).toEqual(['2026年9月29日']);
      } finally {
        await cleanup();
        useI18nStore.setState({ locale: 'en', dictionary: enDict, loadingLocale: null });
      }
    });

    const fallbackCases = [
      { release: undefined, expected: '—' },
      { release: 'not-a-date', expected: 'not-a-date' },
    ];
    for (const { release, expected } of fallbackCases) {
      test(`keeps the release fallback for ${release ?? 'a missing date'}`, async () => {
        setReleaseMetadata(release);
        const { dom, cleanup } = await renderModelControls();
        try {
          expect(metadataValues(dom.container, 'Release')).toEqual([expected]);
        } finally {
          await cleanup();
        }
      });
    }

    test('keeps a full release timestamp on the local calendar day', async () => {
      const timestamp = '2026-09-29T23:30:00.000Z';
      const expectedTimestamp = new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      }).format(new Date(timestamp));
      setReleaseMetadata(timestamp);
      const { dom, cleanup } = await renderModelControls();
      try {
        expect(metadataValues(dom.container, 'Release')).toEqual([expectedTimestamp]);
      } finally {
        await cleanup();
      }
    });
  });
});

describe('ModelControls in a pinned column', () => {
  const PINNED_FOLDER = '/repo/pinned';
  const pinnedModel = { ...model, id: 'pinned-model', name: 'Pinned Model', providerID: 'pinned' };
  const pinnedProvider = { id: 'pinned', name: 'pinned', models: [pinnedModel] };
  const stockAgent: TestAgent = { ...agent, id: 'stock', name: 'stock', displayName: 'Stock' };
  const pinnedSelection = { agent: AGENT, model: { providerId: 'pinned', modelId: 'pinned-model' }, variant: undefined };
  const column = { sessionId: 'ses_pinned', directory: PINNED_FOLDER };

  beforeEach(() => {
    catalogLoads.length = 0;
    knownElsewhere = nothingKnownElsewhere();
    setSessionRecord(undefined);
    useSelectionStore.setState({ savedVariant: undefined, sessionAgentSelections: new Map() });
    useUIStore.setState({ isMobile: false, isModelSelectorOpen: false, lastUsedEfforts: {} });
    useConfigStore.setState({ providers: [provider], agents: [agent], providersLoaded: true, agentsLoaded: true });
    folderCatalogs = new Map([[PINNED_FOLDER, { providers: [pinnedProvider], agents: [agent, stockAgent], loaded: true }]]);
  });

  // The main chat's folder lacks `stock` and the pinned model; the pinned
  // chat's folder has both, and its picker lists that folder's catalog (#5522).
  test('lists the agents and models of its own session folder', async () => {
    const { dom, cleanup } = await renderModelControls({ selection: pinnedSelection, sessionId: 'ses_pinned' }, column);
    try {
      expect(dom.container.textContent).toContain('Stock');
      expect(dom.container.querySelector('.model-controls__model-trigger')?.textContent).toContain('Pinned Model');
      expect(catalogLoads).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  test('is ready when its own folder is, whatever the main folder does', async () => {
    useConfigStore.setState({ providers: [], agents: [], providersLoaded: false, agentsLoaded: false });
    const { dom, cleanup } = await renderModelControls({ selection: pinnedSelection, sessionId: 'ses_pinned' }, column);
    try {
      expect(dom.container.querySelector('.model-controls__model-trigger')?.textContent).toContain('Pinned Model');
      expect(dom.container.textContent).toContain('Stock');
      expect(dom.container.textContent).not.toContain('Loading');
    } finally {
      await cleanup();
    }
  });

  test('arrow keys cycle the efforts its own folder gives the model', async () => {
    // Same provider and model id in both folders, with other efforts in the pinned one.
    const pinnedVariantModel = { ...model, variants: { max: {} } };
    folderCatalogs = new Map([[PINNED_FOLDER, { providers: [{ ...provider, models: [pinnedVariantModel] }], agents: [agent], loaded: true }]]);
    const { dom, cleanup } = await renderModelControls({
      selection: { agent: AGENT, model: { providerId: PROVIDER_ID, modelId: MODEL_ID }, variant: undefined },
      sessionId: 'ses_pinned',
    }, column);
    try {
      const host = dom.container.querySelector('[data-testid="model-picker-host"]');
      await act(async () => {
        host?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      expect(useUIStore.getState().lastUsedEfforts).toEqual({ [`${PROVIDER_ID}/${MODEL_ID}`]: 'max' });
    } finally {
      await cleanup();
    }
  });

  // BTW's model shortcut opens its own picker, never the main chat's (#6403).
  test('opens the picker its composer opens, and only that one', async () => {
    useUIStore.setState({ isModelSelectorOpen: true });
    const isOpen = (dom: { container: Element }) => dom.container.querySelector('.model-controls__model-trigger')?.closest('[data-menu-open]')?.getAttribute('data-menu-open');
    const closed = await renderModelControls({ selection: pinnedSelection, sessionId: 'ses_btw', modelSelectorOpen: false, onModelSelectorOpenChange: () => undefined }, column);
    try {
      expect(isOpen(closed.dom)).toBe('false');
    } finally {
      await closed.cleanup();
    }
    useUIStore.setState({ isModelSelectorOpen: false });
    const open = await renderModelControls({ selection: pinnedSelection, sessionId: 'ses_btw', modelSelectorOpen: true, onModelSelectorOpenChange: () => undefined }, column);
    try {
      expect(isOpen(open.dom)).toBe('true');
    } finally {
      await open.cleanup();
    }
  });

  // A pinned chat's agent pick carries the level its composer is on, as a
  // BTW pick does, instead of the new agent falling back to another level.
  test('an agent pick carries the effort the pinned composer is on', async () => {
    // The store copies a spy into every later state, so restore the function
    // on the live state: `mockRestore` reaches only the object spied on.
    const saveOriginal = useSelectionStore.getState().saveAgentModelVariantForSession;
    const saveVariant = spyOn(useSelectionStore.getState(), 'saveAgentModelVariantForSession');
    const callsBefore = saveVariant.mock.calls.length;
    const { dom, cleanup } = await renderModelControls({ selection: { ...pinnedSelection, variant: 'high' }, sessionId: 'ses_pinned' }, column);
    try {
      const stockRow = Array.from(dom.container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.trim() === 'Stock');
      await act(async () => stockRow?.click());
      expect(useSelectionStore.getState().sessionAgentSelections.get('ses_pinned')).toBe('stock');
      expect(saveVariant.mock.calls.slice(callsBefore)).toEqual([['ses_pinned', 'stock', 'pinned', 'pinned-model', 'high']]);
      // The main chat's agent stays its own.
      expect(useConfigStore.getState().currentAgentName).toBe(AGENT);
    } finally {
      useSelectionStore.setState({ saveAgentModelVariantForSession: saveOriginal });
      await cleanup();
    }
  });

  test('the main chat keeps the active folder catalog', async () => {
    const { dom, cleanup } = await renderModelControls();
    try {
      expect(dom.container.textContent).not.toContain('Stock');
    } finally {
      await cleanup();
    }
  });

  test('loads the pinned folder catalog when it has not loaded', async () => {
    folderCatalogs = new Map([[PINNED_FOLDER, { providers: [], agents: [], loaded: false }]]);
    const { cleanup } = await renderModelControls({ selection: pinnedSelection, sessionId: 'ses_pinned' }, column);
    try {
      expect(catalogLoads).toEqual([`models:${PINNED_FOLDER}`, `agents:${PINNED_FOLDER}`]);
    } finally {
      await cleanup();
    }
  });
>>>>>>> bc50ba56a
});
