<<<<<<< HEAD
import { LIVE_BROWSER_TABS_MAX, LIVE_BROWSER_TABS_MIN } from '@/lib/browser/liveTabs';
/**
 * The settings registry: one table that names every OpenChamber setting, who
 * owns it (`scope`), how a value is parsed at the boundary, and where the UI
 * keeps its live copy.
 *
 * Everything else about settings derives from this table: the `DesktopSettings`
 * type, the boundary sanitizer, the per-runtime mirror, the store apply step,
 * the store-subscribing auto-save, and — through the generated JSON snapshot
 * (`settings-registry.json`, see `registry-snapshot.ts`) — the server's key list.
 * A key that is not here does not persist.
 *
 * Scopes (see `.opencode/plans/settings-scopes.md`):
 * - `instance`: a fact about the machine the server runs on. Never synced.
 * - `profile`: the person's preference. Synced to every client of the
 *   instance; a few are stored per surface kind (`perSurface`).
 * - `device`: state of this install/surface. Fields that still cross the wire
 *   today are listed here so Phase 2 can stop them deliberately; fields that
 *   only ever lived in the local store are in `LOCAL_DEVICE_KEYS`.
 */
||||||| bc50ba56aa
/**
 * The settings registry: one table that names every OpenChamber setting, who
 * owns it (`scope`), how a value is parsed at the boundary, and where the UI
 * keeps its live copy.
 *
 * Everything else about settings derives from this table: the `DesktopSettings`
 * type, the boundary sanitizer, the per-runtime mirror, the store apply step,
 * the store-subscribing auto-save, and — through the generated JSON snapshot
 * (`settings-registry.json`, see `registry-snapshot.ts`) — the server's and the
 * VS Code bridge's key lists. A key that is not here does not persist.
 *
 * Scopes (see `DOCUMENTATION.md` in this folder):
 * - `instance`: a fact about the machine the server runs on. Never synced.
 * - `profile`: the person's preference. Synced to every client of the
 *   instance; a few are stored per surface kind (`perSurface`).
 * - `device`: state of this install/surface. Fields that still cross the wire
 *   today are listed here so Phase 2 can stop them deliberately; fields that
 *   only ever lived in the local store are in `LOCAL_DEVICE_KEYS`.
 */
=======
>>>>>>> upstream/main
import type { ProjectEntry, TerminalShell } from '@/lib/api/types';
import type { DesktopWindowControlsPosition, DesktopWindowControlsStyle } from '@/lib/desktop';
import { getDirectoryShowHidden, setDirectoryShowHidden } from '@/lib/directoryShowHidden';
import { sanitizeStarterRefs, type DraftStarterRef } from '@/lib/draftStarters';
import { getFilesViewShowGitignored, setFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { isMonoFontOption, isUiFontOption, UI_FONT_WEIGHT_OPTIONS, type MonoFontOption, type UiFontOption } from '@/lib/fontOptions';
import { LOCALES } from '@/lib/i18n/runtime';
import { useI18nStore } from '@/lib/i18n/store';
import { isInputHistoryLimit, isInputHistoryScope, type InputHistoryScope } from '@/lib/inputHistoryScope';
import { normalizeMobileKeyboardMode } from '@/lib/mobileKeyboardMode';
import { hiddenSidebarSectionsSchema, sidebarPinListsSchema, sidebarSectionsSchema } from '@/lib/sidebarSections';
import { isResponseStylePreset, type ResponseStylePreset } from '@/lib/responseStyle';
import { isTerminalShell } from '@/lib/terminalShell';
import { sanitizeWorkStatusHiddenSections, sanitizeWorkStatusSectionOrder } from '@/components/chat/work-status/sections';
import { useInputHistoryStore } from '@/stores/useInputHistoryStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useUIStore, type FileEditorKeymap, type LargeTextPasteBehavior } from '@/stores/useUIStore';
<<<<<<< HEAD
||||||| bc50ba56aa
import { isSessionGoalMaxAutoTurns } from '@/lib/sessionGoalTurnLimit';
import { hiddenSidebarSectionsSchema, sidebarPinListsSchema, sidebarSectionsSchema } from '@/lib/sidebarSections';
=======
import { isSessionGoalMaxAutoTurns } from '@/lib/sessionGoalTurnLimit';
import { hiddenSidebarSectionsSchema, SIDEBAR_SESSION_BATCH_MAX, SIDEBAR_SESSION_BATCH_MIN, sidebarPinListsSchema, sidebarSectionsSchema } from '@/lib/sidebarSections';
>>>>>>> upstream/main
import { z } from 'zod';
import {
<<<<<<< HEAD
 parseActivityRenderMode,
 fromSchema,
 mapParser,
 parseBoolean,
 parseCustomProviderIcons,
 parseCustomProviderLogos,
 parseDesktopWindowControlsPosition,
 parseFiniteNumber,
 parseFollowUpBehavior,
 parseGuarded,
 parseIntegerAtLeast,
 parseIntegerInRange,
 parseLastUsedEfforts,
 parseManagedRemoteTunnelPresetTokens,
 parseManagedRemoteTunnelPresets,
 parseModelRefs,
 parseNonEmptyString,
 parseNonEmptyTrimmedString,
 parseNotificationTemplates,
 parseNullableFiniteNumber,
 parseNullableTrimmedPath,
 parseNullableTrimmedString,
 parseOneOf,
 parsePositiveInteger,
 parseProjects,
 parsePwaAppName,
 parseShortcutOverrides,
 parseSkillCatalogs,
 parseStringList,
 parseStringRecordOfStringLists,
 parseStringSet,
 parseSttProvider,
 parseTerminalShells,
 parseTextUpTo,
 parseTrimmedString,
 parseTrimmedStringUpTo,
 type ManagedRemoteTunnelPreset,
 type ModelRef,
 type NotificationTemplates,
 type SettingsParser,
 type SettingsRawDocument,
 type SkillCatalogConfig,
||||||| bc50ba56aa
  fromSchema,
  mapParser,
  parseActivityRenderMode,
  parseBoolean,
  parseCustomProviderIcons,
  parseCustomProviderLogos,
  parseDesktopWindowControlsPosition,
  parseFiniteNumber,
  parseFollowUpBehavior,
  parseGuarded,
  parseIntegerAtLeast,
  parseIntegerInRange,
  parseLastUsedEfforts,
  parseManagedRemoteTunnelPresetTokens,
  parseManagedRemoteTunnelPresets,
  parseModelRefs,
  parseNonEmptyString,
  parseNonEmptyTrimmedString,
  parseNotificationTemplates,
  parseNullableFiniteNumber,
  parseNullableTrimmedPath,
  parseNullableTrimmedString,
  parseOneOf,
  parsePositiveInteger,
  parseProjects,
  parsePwaAppName,
  parseRecentEfforts,
  parseShortcutOverrides,
  parseSkillCatalogs,
  parseStringList,
  parseStringRecordOfStringLists,
  parseStringSet,
  parseSttProvider,
  parseTerminalShells,
  parseTextUpTo,
  parseTrimmedString,
  parseTrimmedStringUpTo,
  parseUsageModelGroups,
  type ManagedRemoteTunnelPreset,
  type ModelRef,
  type NotificationTemplates,
  type SettingsParser,
  type SettingsRawDocument,
  type SkillCatalogConfig,
  type UsageModelGroups,
=======
  fromSchema,
  mapParser,
  parseActivityRenderMode,
  parseBoolean,
  parseChatWidth,
  parseCustomProviderIcons,
  parseCustomProviderLogos,
  parseDesktopWindowControlsPosition,
  parseFiniteNumber,
  parseFollowUpBehavior,
  parseGuarded,
  parseIntegerAtLeast,
  parseIntegerInRange,
  parseLastUsedEfforts,
  parseManagedRemoteTunnelPresetTokens,
  parseManagedRemoteTunnelPresets,
  parseModelRefs,
  parseNonEmptyString,
  parseNonEmptyTrimmedString,
  parseNotificationTemplates,
  parseNullableFiniteNumber,
  parseNullableTrimmedPath,
  parseNullableTrimmedString,
  parseOneOf,
  parsePositiveInteger,
  parseProjects,
  parsePwaAppName,
  parseRecentEfforts,
  parseShortcutOverrides,
  parseSkillCatalogs,
  parseStringList,
  parseStringRecordOfStringLists,
  parseStringSet,
  parseSttProvider,
  parseTerminalShells,
  parseTextUpTo,
  parseTrimmedString,
  parseTrimmedStringUpTo,
  parseUsageModelGroups,
  type ManagedRemoteTunnelPreset,
  type ModelRef,
  type NotificationTemplates,
  type SettingsParser,
  type SettingsRawDocument,
  type SkillCatalogConfig,
  type UsageModelGroups,
>>>>>>> upstream/main
} from './parsers';

type SettingsScope = 'instance' | 'profile' | 'device';
export type SettingsSurface = 'web' | 'desktop' | 'mobile';

type SettingsSiblingView = {
 readonly draftStartersCraftGoalAdded?: boolean;
 readonly draftStartersScheduleTaskAdded?: boolean;
 readonly workStatusHiddenSectionsExplicit?: boolean;
};

type SettingsUiBinding<T> = {
<<<<<<< HEAD
 read(): T | undefined;
 write(value: T, snapshot: SettingsSiblingView): void;
 /**
  * The store field this binding reads and writes, when it is one named field.
  * The effect test searches for this name: the settings key and the store field
  * can differ (`sidebarProjectDisplayMode` -> `projectDisplayMode`).
  */
 field?: string;
 /** Send changes of the backing store to the server (store-subscribing auto-save). */
 autoSave: boolean;
||||||| bc50ba56aa
  read(): T | undefined;
  write(value: T, snapshot: SettingsSiblingView): void;
  /** Send changes of the backing store to the server (store-subscribing auto-save). */
  autoSave: boolean;
=======
  read(): T | undefined;
  write(value: T, snapshot: SettingsSiblingView): void;
  autoSave: boolean;
>>>>>>> upstream/main
};

/**
 * Where a stored value is read back. The registry is the one table that
 * decides what persists, so each row also says who consumes the value —
 * otherwise a row can outlive its reader and keep writing a preference no
 * code path honours (`registry.test.ts` fails on a key with no consumer).
 *
 * - `ui`: a component reads it (directly, or through its `ui` binding).
 * - `store`: another store or action consumes it, not a rendered surface.
 * - `server`: host code reads it (routes, runtimes, notifications).
 * - `shell`: the Electron main process reads it.
 */
type SettingsEffect = 'ui' | 'store' | 'server' | 'shell';

type SettingsFieldSpec<T> = {
<<<<<<< HEAD
 scope: SettingsScope;
 /** Who consumes the stored value; see `SettingsEffect`. */
 effect: readonly SettingsEffect[];
 parse(value: unknown, raw: SettingsRawDocument): T | undefined;
 ui?: SettingsUiBinding<T>;
 /** Profile fields the owner chose to store per surface kind (change on a phone stays on phones). */
 perSurface?: true;
 /** Surfaces that have this field; absent means all. */
 surfaces?: readonly SettingsSurface[];
 /** Workspace pointers: adopted only on a bootstrap-grade sync (see `SettingsSyncedDetail`). */
 adopt?: 'bootstrap-only';
 /** Computed by the writer from other fields; never edited directly. */
 derived?: true;
 /** Accepted on write, never returned by a read. */
 secret?: true;
 /** Emitted by the server for this build/process; never accepted on a write, never persisted. */
 computed?: true;
||||||| bc50ba56aa
  scope: SettingsScope;
  parse(value: unknown, raw: SettingsRawDocument): T | undefined;
  ui?: SettingsUiBinding<T>;
  /** Profile fields the owner chose to store per surface kind (change on a phone stays on phones). */
  perSurface?: true;
  /** Surfaces that have this field; absent means all. */
  surfaces?: readonly SettingsSurface[];
  /** Workspace pointers: adopted only on a bootstrap-grade sync (see `SettingsSyncedDetail`). */
  adopt?: 'bootstrap-only';
  /** Computed by the writer from other fields; never edited directly. */
  derived?: true;
  /** Accepted on write, never returned by a read. */
  secret?: true;
  /** Emitted by the server for this build/process; never accepted on a write, never persisted. */
  computed?: true;
=======
  scope: SettingsScope;
  parse(value: unknown, raw: SettingsRawDocument): T | undefined;
  ui?: SettingsUiBinding<T>;
  perSurface?: true;
  surfaces?: readonly SettingsSurface[];
  adopt?: 'bootstrap-only';
  derived?: true;
  secret?: true;
  computed?: true;
>>>>>>> upstream/main
};

const field = <T>(spec: SettingsFieldSpec<T>): SettingsFieldSpec<T> => spec;

type UIStoreState = ReturnType<typeof useUIStore.getState>;

const uiStore = <K extends keyof UIStoreState>(
 key: K,
 write: (value: UIStoreState[K], snapshot: SettingsSiblingView) => void,
 options: { autoSave?: boolean } = {},
): SettingsUiBinding<UIStoreState[K]> => ({
 read: () => useUIStore.getState()[key],
 write,
 field: key,
 autoSave: options.autoSave ?? true,
});

const setUi = <K extends keyof UIStoreState>(key: K) => (value: UIStoreState[K]): void => {
 // SAFETY: a single-key patch built from the key it is typed by.
 useUIStore.setState({ [key]: value } as Pick<UIStoreState, K>);
};

const configStore = () => globalThis.window?.__zustand_config_store__ ?? null;

type ConfigStoreState = NonNullable<ReturnType<NonNullable<ReturnType<typeof configStore>>['getState']>>;

const configField = <K extends keyof ConfigStoreState>(
 key: K,
): SettingsUiBinding<ConfigStoreState[K]> => ({
<<<<<<< HEAD
 read: () => configStore()?.getState()[key],
 write: (value) => {
  // SAFETY: a single-key patch built from the key it is typed by.
  configStore()?.setState({ [key]: value } as Pick<ConfigStoreState, K>);
 },
 field: key,
 // The config store's own setters write these through `updateDesktopSettings`.
 autoSave: false,
||||||| bc50ba56aa
  read: () => configStore()?.getState()[key],
  write: (value) => {
    // SAFETY: a single-key patch built from the key it is typed by.
    configStore()?.setState({ [key]: value } as Pick<ConfigStoreState, K>);
  },
  // The config store's own setters write these through `updateDesktopSettings`.
  autoSave: false,
=======
  read: () => configStore()?.getState()[key],
  write: (value) => {
    // SAFETY: a single-key patch built from the key it is typed by.
    configStore()?.setState({ [key]: value } as Pick<ConfigStoreState, K>);
  },
  autoSave: false,
>>>>>>> upstream/main
});

type SessionDisplayState = ReturnType<typeof useSessionDisplayStore.getState>;

const sessionDisplayField = <K extends keyof SessionDisplayState>(
 key: K,
): SettingsUiBinding<SessionDisplayState[K]> => ({
 read: () => useSessionDisplayStore.getState()[key],
 write: (value) => {
  // SAFETY: a single-key patch built from the key it is typed by.
  useSessionDisplayStore.setState({ [key]: value } as Pick<SessionDisplayState, K>);
 },
 field: key,
 autoSave: false,
});


const parseTerminalShell: SettingsParser<TerminalShell> = parseGuarded(isTerminalShell);
const parseUiFont: SettingsParser<UiFontOption> = parseGuarded(isUiFontOption);
const parseMonoFont: SettingsParser<MonoFontOption> = parseGuarded(isMonoFontOption);
const parseInputHistoryScope: SettingsParser<InputHistoryScope> = fromSchema(z.string().refine(isInputHistoryScope));
const parseInputHistoryLimit: SettingsParser<number> = fromSchema(z.number().refine(isInputHistoryLimit));
const parseMobileKeyboardModeValue = mapParser(parseTrimmedString, (value) => normalizeMobileKeyboardMode(value, undefined));
const parseDraftStarters: SettingsParser<DraftStarterRef[]> = mapParser(fromSchema(z.array(z.unknown())), sanitizeStarterRefs);
const parseWorkStatusHiddenSections: SettingsParser<string[]> = mapParser(fromSchema(z.array(z.unknown())), (value) => sanitizeWorkStatusHiddenSections(value));
const parseLargeTextPasteBehavior: SettingsParser<LargeTextPasteBehavior> = parseOneOf(['ask', 'attach', 'inline', 'inline-double-paste']);
const parseFileEditorKeymap: SettingsParser<FileEditorKeymap> = parseOneOf(['default', 'vim']);
const parseResponseStylePreset: SettingsParser<ResponseStylePreset> = parseGuarded(isResponseStylePreset);

/**
 * The Host-owned per-session permission policy and its monotonic revision.
 * An entry is a mode, or a boolean from before the modes existed; the
 * permission runtime converts those on its first read. `settings-helpers.js`
 * builds the same shape and drops entries that are neither, so an invalid
 * entry is dropped here rather than failing the whole policy.
 */
const permissionStoredEntrySchema = z.union([z.boolean(), z.enum(['ask', 'safety', 'auto'])]);
type PermissionStoredEntry = z.infer<typeof permissionStoredEntrySchema>;
const permissionSessionsSchema = z.record(z.string(), z.unknown()).transform((entries) => {
 const sessions: Record<string, PermissionStoredEntry> = {};
 for (const [sessionId, entry] of Object.entries(entries)) {
  if (!sessionId) continue;
  const parsed = permissionStoredEntrySchema.safeParse(entry);
  if (parsed.success) sessions[sessionId] = parsed.data;
 }
 return sessions;
});
const permissionAutoAcceptSchema = z.object({
 sessions: permissionSessionsSchema.catch({}).default({}),
 revision: z.number().int().nonnegative().catch(0).default(0),
});
type PermissionAutoAcceptPolicy = z.infer<typeof permissionAutoAcceptSchema>;
const parsePermissionAutoAccept: SettingsParser<PermissionAutoAcceptPolicy> = fromSchema(permissionAutoAcceptSchema);

const withOfferedBuiltInStarters = (starters: DraftStarterRef[], snapshot: SettingsSiblingView): DraftStarterRef[] => {
 let next = starters;
 const insertAfter = (name: string, after: string) => {
  if (next.some((starter) => starter.type === 'command' && starter.name === name)) return;
  const anchor = next.findIndex((starter) => starter.type === 'command' && starter.name === after);
  const insertAt = anchor >= 0 ? anchor + 1 : next.length;
  next = [...next.slice(0, insertAt), { type: 'command', name }, ...next.slice(insertAt)];
 };
 if (snapshot.draftStartersCraftGoalAdded !== true) insertAfter('craft-goal', 'plan-feature');
 if (snapshot.draftStartersScheduleTaskAdded !== true) insertAfter('schedule-task', 'craft-goal');
 return next;
};

export const SETTINGS_REGISTRY = {
<<<<<<< HEAD
 layoutAnimations: field({ scope: 'profile', effect: ['ui'], surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('layoutAnimations', (v) => useUIStore.getState().setLayoutAnimations(v)) }),
 openLinksInBrowserPanel: field({ scope: 'profile', effect: ['ui'], surfaces: ['desktop'], parse: parseBoolean, ui: uiStore('openLinksInBrowserPanel', (v) => useUIStore.getState().setOpenLinksInBrowserPanel(v)) }),
 liveBrowserTabLimit: field({ scope: 'profile', effect: ['ui'], surfaces: ['desktop'], parse: parseIntegerInRange(LIVE_BROWSER_TABS_MIN, LIVE_BROWSER_TABS_MAX), ui: uiStore('liveBrowserTabLimit', (v) => useUIStore.getState().setLiveBrowserTabLimit(v)) }),
 openTrackerLinksOnBoard: field({ scope: 'profile', effect: ['ui'], surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('openTrackerLinksOnBoard', (v) => useUIStore.getState().setOpenTrackerLinksOnBoard(v)) }),
 worktreeArchiveOnDoneEnabled: field({ scope: 'instance', effect: ['ui'], parse: parseBoolean, ui: uiStore('worktreeArchiveOnDoneEnabled', (v) => useUIStore.getState().setWorktreeArchiveOnDoneEnabled(v)) }),
 agentKnowledgeToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentKnowledgeToolEnabled', (v) => useUIStore.getState().setAgentKnowledgeToolEnabled(v)) }),
 agentRenderToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentRenderToolEnabled', (v) => useUIStore.getState().setAgentRenderToolEnabled(v)) }),
||||||| bc50ba56aa
  // ── Theme (profile, per surface; ThemeSystemContext owns the live copy) ──
  themeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
  useSystemTheme: field({ scope: 'profile', perSurface: true, parse: parseBoolean }),
  themeVariant: field({ scope: 'profile', derived: true, parse: parseOneOf(['light', 'dark']) }),
  lightThemeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
  darkThemeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
=======
  themeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
  useSystemTheme: field({ scope: 'profile', perSurface: true, parse: parseBoolean }),
  themeVariant: field({ scope: 'profile', derived: true, parse: parseOneOf(['light', 'dark']) }),
  lightThemeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
  darkThemeId: field({ scope: 'profile', perSurface: true, parse: parseNonEmptyString }),
>>>>>>> upstream/main

<<<<<<< HEAD
 permissionDefaultMode: field({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseOneOf(['ask', 'safety', 'auto']), ui: uiStore('permissionDefaultMode', (v) => useUIStore.getState().setPermissionDefaultMode(v)) }),
 // The Host-owned per-session policy, written by the permission runtime and
 // read back by it after a restart; it travels in the settings document, the
 // client mirrors it, and no UI control edits it directly.
 permissionAutoAccept: field<PermissionAutoAcceptPolicy>({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parsePermissionAutoAccept }),
 sessionGoalChecker: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseOneOf(['classifier', 'small-model']), ui: uiStore('sessionGoalChecker', (v) => useUIStore.getState().setSessionGoalChecker(v)) }),
 sessionGoalMaxAutoTurns: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseIntegerInRange(1, 200), ui: uiStore('sessionGoalMaxAutoTurns', (v) => useUIStore.getState().setSessionGoalMaxAutoTurns(v)) }),
 planModeAllowAgents: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('planModeAllowAgents', (v) => useUIStore.getState().setPlanModeAllowAgents(v)) }),
 agentWorkflowToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentWorkflowToolEnabled', (v) => useUIStore.getState().setAgentWorkflowToolEnabled(v)) }),
 mobileReturnKeySends: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('mobileReturnKeySends', (v) => useUIStore.getState().setMobileReturnKeySends(v)) }),
||||||| bc50ba56aa
  // ── Interface language (profile; the i18n store owns the live copy and keeps
  // browser storage as the first-paint copy; the language picker writes it) ──
  locale: field({
    scope: 'profile',
    parse: parseOneOf(LOCALES),
    ui: {
      read: () => useI18nStore.getState().locale,
      write: (value) => useI18nStore.getState().setLocale(value),
      autoSave: false,
    },
  }),
=======
  locale: field({
    scope: 'profile',
    parse: parseOneOf(LOCALES),
    ui: {
      read: () => useI18nStore.getState().locale,
      write: (value) => useI18nStore.getState().setLocale(value),
      autoSave: false,
    },
  }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Theme (profile, per surface; ThemeSystemContext owns the live copy) ──
 themeId: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseNonEmptyString }),
 useSystemTheme: field({ scope: 'profile', effect: ['shell', 'ui'], perSurface: true, parse: parseBoolean }),
 themeVariant: field({ scope: 'profile', effect: ['server', 'shell', 'ui'], derived: true, parse: parseOneOf(['light', 'dark']) }),
 lightThemeId: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseNonEmptyString }),
 darkThemeId: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseNonEmptyString }),
||||||| bc50ba56aa
  // ── Workspace pointers and instance facts ──
  lastDirectory: field({ scope: 'instance', adopt: 'bootstrap-only', parse: parseNonEmptyString }),
  homeDirectory: field({ scope: 'instance', parse: parseNonEmptyString }),
  opencodeBinary: field({ scope: 'instance', parse: parseTrimmedString }),
  // Where an npm-installed server takes its updates from (Settings → About in
  // its browser page); the desktop app keeps its own `desktopUpdateChannel`.
  serverUpdateChannel: field({ scope: 'instance', surfaces: ['web'], parse: parseOneOf(['stable', 'canary']) }),
  projects: field<ProjectEntry[]>({ scope: 'instance', parse: parseProjects }),
  activeProjectId: field({ scope: 'instance', adopt: 'bootstrap-only', parse: parseNonEmptyString }),
  securityScopedBookmarks: field({ scope: 'instance', surfaces: ['desktop'], parse: parseStringList }),
  pinnedDirectories: field({ scope: 'instance', parse: parseStringSet }),
  desktopLanAccessEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopKeepAwakeEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopMinimizeToTrayEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopUpdateChannel: field({ scope: 'instance', surfaces: ['desktop'], parse: parseOneOf(['stable', 'canary']) }),
  desktopMacMenuBarEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopLinuxNativeFrame: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  // Write-only: the desktop network page learns whether one is set from
  // `hasDesktopUiPassword` and sends a value only when the user types a new
  // one (or removes it with an empty string).
  desktopUiPassword: field({ scope: 'instance', secret: true, surfaces: ['desktop'], parse: parseTrimmedString }),
  hasDesktopUiPassword: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseBoolean }),
  desktopLanAccessActive: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseBoolean }),
  desktopLanAccessBlockedReason: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseTrimmedString }),
  githubClientId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  githubScopes: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  gitlabClientId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  skillCatalogs: field<SkillCatalogConfig[]>({ scope: 'instance', parse: parseSkillCatalogs }),
  defaultGitIdentityId: field({ scope: 'instance', parse: parseTrimmedString }),
  // Per-session permission modes; booleans are policies from before the modes,
  // which the server converts on its first read.
  permissionAutoAccept: field({
    scope: 'instance',
    parse: fromSchema(z.object({
      sessions: z.record(z.string().min(1), z.union([z.boolean(), z.enum(['ask', 'safety', 'auto'])])).catch({}),
      revision: z.number().int().nonnegative().catch(0),
    })),
  }),
  // The mode the server writes onto each new top-level session. VS Code has no
  // OpenChamber server to write it.
  permissionDefaultMode: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: fromSchema(z.enum(['ask', 'safety', 'auto'])),
    ui: uiStore('permissionDefaultMode', (v) => useUIStore.getState().setPermissionDefaultMode(v)),
  }),
  // The server keeps the message search index only while this is on; VS Code
  // has no OpenChamber server to keep one.
  messageSearchEnabled: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseBoolean,
    ui: uiStore('messageSearchEnabled', (v) => useUIStore.getState().setMessageSearchEnabled(v)),
  }),
  // Agent reasoning in the same index; the server re-reads agent records when it turns on.
  messageSearchReasoningEnabled: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseBoolean,
    ui: uiStore('messageSearchReasoningEnabled', (v) => useUIStore.getState().setMessageSearchReasoningEnabled(v)),
  }),
  agentControlToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentControlToolEnabled', (v) => useUIStore.getState().setAgentControlToolEnabled(v)) }),
  agentScheduleToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentScheduleToolEnabled', (v) => useUIStore.getState().setAgentScheduleToolEnabled(v)) }),
  agentWebToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentWebToolEnabled', (v) => useUIStore.getState().setAgentWebToolEnabled(v)) }),
  // `builtin` or an installed extension id; the server falls back to `builtin` when that extension cannot serve.
  browserProvider: field({ scope: 'instance', parse: parseNonEmptyString, ui: uiStore('browserProvider', (v) => useUIStore.getState().setBrowserProvider(v)) }),
  agentNotifyToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentNotifyToolEnabled', (v) => useUIStore.getState().setAgentNotifyToolEnabled(v)) }),
  agentRenderToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentRenderToolEnabled', (v) => useUIStore.getState().setAgentRenderToolEnabled(v)) }),
  agentUsageToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentUsageToolEnabled', (v) => useUIStore.getState().setAgentUsageToolEnabled(v)) }),
  agentImageToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentImageToolEnabled', (v) => useUIStore.getState().setAgentImageToolEnabled(v)) }),
  // `provider/model` of an image model; the server checks the shape.
  agentImageModel: field({ scope: 'instance', parse: parseNonEmptyString, ui: uiStore('agentImageModel', (v) => useUIStore.getState().setAgentImageModel(v)) }),
  agentSecretToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentSecretToolEnabled', (v) => useUIStore.getState().setAgentSecretToolEnabled(v)) }),
  agentMemoryToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentMemoryToolEnabled', (v) => useUIStore.getState().setAgentMemoryToolEnabled(v)) }),
  agentKnowledgeToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentKnowledgeToolEnabled', (v) => useUIStore.getState().setAgentKnowledgeToolEnabled(v)) }),
  agentWorkflowToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentWorkflowToolEnabled', (v) => useUIStore.getState().setAgentWorkflowToolEnabled(v)) }),
  // The isolated-spaces switch. The server reads it once at start; a change takes effect at the
  // next start, which the settings row says. Never shown in VS Code (decision 16 of the design).
  isolatedSpacesEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('isolatedSpacesEnabled', (v) => useUIStore.getState().setIsolatedSpacesEnabled(v)) }),
  // The idle stop of isolated spaces (decision 11). Written and read through the spaces route,
  // which also tells the running spaces, so no store keeps a copy.
  isolatedSpacesIdleStop: field({
    scope: 'instance',
    parse: fromSchema(z.object({ enabled: z.boolean(), hours: z.number().int().min(1).max(168) }).strict()),
  }),
  // The machine of the Docker over SSH place of isolated spaces, `[user@]host[:port]` as the
  // user's own `ssh` takes it; the empty string means no such place. The server reads it when
  // the feature comes up; the "Isolated spaces" page writes it through the host's `PUT /machine`
  // route, never directly, since the host rebuilds its places on the change.
  isolatedSpacesSshHost: field({ scope: 'instance', parse: parseTrimmedStringUpTo(320) }),
  // Server-owned: it says whether this build has the feature at all.
  agentMemoryFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('agentMemoryFeatureAvailable', (v) => useUIStore.getState().setAgentMemoryFeatureAvailable(v), { autoSave: false }),
  }),
  // Server-owned: whether an OpenChamber server backs agent workflows here.
  agentWorkflowFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('agentWorkflowFeatureAvailable', (v) => useUIStore.getState().setAgentWorkflowFeatureAvailable(v), { autoSave: false }),
  }),
  // Server-owned: whether the overview page exists in this process (`OPENCHAMBER_OVERVIEW_ENABLED`).
  overviewFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('overviewFeatureAvailable', (v) => useUIStore.getState().setOverviewFeatureAvailable(v), { autoSave: false }),
  }),
  routingFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('routingFeatureAvailable', (v) => useUIStore.getState().setRoutingFeatureAvailable(v), { autoSave: false }),
  }),
  openCodeUpdateToastDismissedVersion: field({ scope: 'instance', parse: parseTrimmedStringUpTo(128) }),
  autoDeleteEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('autoDeleteEnabled', (v) => useUIStore.getState().setAutoDeleteEnabled(v)) }),
  autoDeleteAfterDays: field({ scope: 'instance', parse: parseIntegerInRange(1, 365), ui: uiStore('autoDeleteAfterDays', (v) => useUIStore.getState().setAutoDeleteAfterDays(v)) }),
  // Apply scope before action so leaving archived-only mode can restore an incoming archive choice.
  sessionRetentionOnlyArchived: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('sessionRetentionOnlyArchived', (v) => useUIStore.getState().setSessionRetentionOnlyArchived(v)) }),
  sessionRetentionIncludeInWork: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('sessionRetentionIncludeInWork', (v) => useUIStore.getState().setSessionRetentionIncludeInWork(v)) }),
  sessionRetentionAction: field({ scope: 'instance', parse: parseOneOf(['archive', 'delete']), ui: uiStore('sessionRetentionAction', (v) => useUIStore.getState().setSessionRetentionAction(v)) }),
  mergedWorktreeCleanupEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('mergedWorktreeCleanupEnabled', (v) => useUIStore.getState().setMergedWorktreeCleanupEnabled(v)) }),
  worktreeArchiveOnDoneEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('worktreeArchiveOnDoneEnabled', (v) => useUIStore.getState().setWorktreeArchiveOnDoneEnabled(v)) }),
  terminalShell: field({ scope: 'instance', parse: parseTerminalShell, ui: uiStore('terminalShell', (v) => useUIStore.getState().setTerminalShell(v)) }),
  terminalLoginShells: field({ scope: 'instance', parse: parseTerminalShells(isTerminalShell), ui: uiStore('terminalLoginShells', (v) => useUIStore.getState().setTerminalLoginShells(v)) }),
  openInAppId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  dictationEnabled: field({ scope: 'profile', parse: parseBoolean, ui: configField('dictationEnabled') }),
  dictationAutoSend: field({ scope: 'profile', parse: parseBoolean, ui: configField('dictationAutoSend') }),
  sttProvider: field({ scope: 'instance', parse: parseSttProvider, ui: configField('sttProvider') }),
  sttServerUrl: field({ scope: 'instance', parse: parseTrimmedStringUpTo(2048), ui: configField('sttServerUrl') }),
  sttEndpointPath: field({ scope: 'instance', parse: fromSchema(z.string().trim().max(1024)), ui: configField('sttEndpointPath') }),
  sttModel: field({ scope: 'instance', parse: parseTrimmedStringUpTo(256), ui: configField('sttModel') }),
  sttLocalModel: field({ scope: 'instance', parse: parseTrimmedStringUpTo(256), ui: configField('sttLocalModel') }),
  sttLanguage: field({ scope: 'profile', parse: parseTrimmedStringUpTo(64), ui: configField('sttLanguage') }),
  sttCorrectTranscript: field({ scope: 'profile', parse: parseBoolean, ui: configField('sttCorrectTranscript') }),
=======
  lastDirectory: field({ scope: 'instance', adopt: 'bootstrap-only', parse: parseNonEmptyString }),
  homeDirectory: field({ scope: 'instance', parse: parseNonEmptyString }),
  opencodeBinary: field({ scope: 'instance', parse: parseTrimmedString }),
  serverUpdateChannel: field({ scope: 'instance', surfaces: ['web'], parse: parseOneOf(['stable', 'canary']) }),
  projects: field<ProjectEntry[]>({ scope: 'instance', parse: parseProjects }),
  activeProjectId: field({ scope: 'instance', adopt: 'bootstrap-only', parse: parseNonEmptyString }),
  securityScopedBookmarks: field({ scope: 'instance', surfaces: ['desktop'], parse: parseStringList }),
  pinnedDirectories: field({ scope: 'instance', parse: parseStringSet }),
  desktopLanAccessEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopKeepAwakeEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopMinimizeToTrayEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopUpdateChannel: field({ scope: 'instance', surfaces: ['desktop'], parse: parseOneOf(['stable', 'canary']) }),
  desktopMacMenuBarEnabled: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopLinuxNativeFrame: field({ scope: 'instance', surfaces: ['desktop'], parse: parseBoolean }),
  desktopUiPassword: field({ scope: 'instance', secret: true, surfaces: ['desktop'], parse: parseTrimmedString }),
  hasDesktopUiPassword: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseBoolean }),
  desktopLanAccessActive: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseBoolean }),
  desktopLanAccessBlockedReason: field({ scope: 'instance', computed: true, surfaces: ['desktop'], parse: parseTrimmedString }),
  githubClientId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  githubScopes: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  gitlabClientId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  skillCatalogs: field<SkillCatalogConfig[]>({ scope: 'instance', parse: parseSkillCatalogs }),
  defaultGitIdentityId: field({ scope: 'instance', parse: parseTrimmedString }),
  permissionAutoAccept: field({
    scope: 'instance',
    parse: fromSchema(z.object({
      sessions: z.record(z.string().min(1), z.union([z.boolean(), z.enum(['ask', 'safety', 'auto'])])).catch({}),
      revision: z.number().int().nonnegative().catch(0),
    })),
  }),
  permissionDefaultMode: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: fromSchema(z.enum(['ask', 'safety', 'auto'])),
    ui: uiStore('permissionDefaultMode', (v) => useUIStore.getState().setPermissionDefaultMode(v)),
  }),
  messageSearchEnabled: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseBoolean,
    ui: uiStore('messageSearchEnabled', (v) => useUIStore.getState().setMessageSearchEnabled(v)),
  }),
  messageSearchReasoningEnabled: field({
    scope: 'instance',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseBoolean,
    ui: uiStore('messageSearchReasoningEnabled', (v) => useUIStore.getState().setMessageSearchReasoningEnabled(v)),
  }),
  agentControlToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentControlToolEnabled', (v) => useUIStore.getState().setAgentControlToolEnabled(v)) }),
  agentScheduleToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentScheduleToolEnabled', (v) => useUIStore.getState().setAgentScheduleToolEnabled(v)) }),
  agentWebToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentWebToolEnabled', (v) => useUIStore.getState().setAgentWebToolEnabled(v)) }),
  browserProvider: field({ scope: 'instance', parse: parseNonEmptyString, ui: uiStore('browserProvider', (v) => useUIStore.getState().setBrowserProvider(v)) }),
  agentNotifyToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentNotifyToolEnabled', (v) => useUIStore.getState().setAgentNotifyToolEnabled(v)) }),
  agentRenderToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentRenderToolEnabled', (v) => useUIStore.getState().setAgentRenderToolEnabled(v)) }),
  agentUsageToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentUsageToolEnabled', (v) => useUIStore.getState().setAgentUsageToolEnabled(v)) }),
  agentTerminalToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentTerminalToolEnabled', (v) => useUIStore.getState().setAgentTerminalToolEnabled(v)) }),
  agentImageToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentImageToolEnabled', (v) => useUIStore.getState().setAgentImageToolEnabled(v)) }),
  agentImageModel: field({ scope: 'instance', parse: parseNonEmptyString, ui: uiStore('agentImageModel', (v) => useUIStore.getState().setAgentImageModel(v)) }),
  agentSecretToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentSecretToolEnabled', (v) => useUIStore.getState().setAgentSecretToolEnabled(v)) }),
  agentMemoryToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentMemoryToolEnabled', (v) => useUIStore.getState().setAgentMemoryToolEnabled(v)) }),
  agentMemoryDreamingEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentMemoryDreamingEnabled', (v) => useUIStore.getState().setAgentMemoryDreamingEnabled(v)) }),
  agentMemoryDreamingModel: field({ scope: 'instance', parse: fromSchema(z.string()), ui: uiStore('agentMemoryDreamingModel', (v) => useUIStore.getState().setAgentMemoryDreamingModel(v)) }),
  agentMemoryDreamingVariant: field({ scope: 'instance', parse: fromSchema(z.string()), ui: uiStore('agentMemoryDreamingVariant', (v) => useUIStore.getState().setAgentMemoryDreamingVariant(v)) }),
  agentKnowledgeToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentKnowledgeToolEnabled', (v) => useUIStore.getState().setAgentKnowledgeToolEnabled(v)) }),
  agentWorkflowToolEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentWorkflowToolEnabled', (v) => useUIStore.getState().setAgentWorkflowToolEnabled(v)) }),
  agentWorkflowAutoApprove: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('agentWorkflowAutoApprove', setUi('agentWorkflowAutoApprove')) }),
  isolatedSpacesEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('isolatedSpacesEnabled', (v) => useUIStore.getState().setIsolatedSpacesEnabled(v)) }),
  isolatedSpacesIdleStop: field({
    scope: 'instance',
    parse: fromSchema(z.object({ enabled: z.boolean(), hours: z.number().int().min(1).max(168) }).strict()),
  }),
  isolatedSpacesSshHost: field({ scope: 'instance', parse: parseTrimmedStringUpTo(320) }),
  agentMemoryFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('agentMemoryFeatureAvailable', (v) => useUIStore.getState().setAgentMemoryFeatureAvailable(v), { autoSave: false }),
  }),
  agentWorkflowFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('agentWorkflowFeatureAvailable', (v) => useUIStore.getState().setAgentWorkflowFeatureAvailable(v), { autoSave: false }),
  }),
  overviewFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('overviewFeatureAvailable', (v) => useUIStore.getState().setOverviewFeatureAvailable(v), { autoSave: false }),
  }),
  routingFeatureAvailable: field({
    scope: 'instance',
    computed: true,
    parse: parseBoolean,
    ui: uiStore('routingFeatureAvailable', (v) => useUIStore.getState().setRoutingFeatureAvailable(v), { autoSave: false }),
  }),
  openCodeUpdateToastDismissedVersion: field({ scope: 'instance', parse: parseTrimmedStringUpTo(128) }),
  autoDeleteEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('autoDeleteEnabled', (v) => useUIStore.getState().setAutoDeleteEnabled(v)) }),
  autoDeleteAfterDays: field({ scope: 'instance', parse: parseIntegerInRange(1, 365), ui: uiStore('autoDeleteAfterDays', (v) => useUIStore.getState().setAutoDeleteAfterDays(v)) }),
  sessionRetentionOnlyArchived: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('sessionRetentionOnlyArchived', (v) => useUIStore.getState().setSessionRetentionOnlyArchived(v)) }),
  sessionRetentionIncludeInWork: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('sessionRetentionIncludeInWork', (v) => useUIStore.getState().setSessionRetentionIncludeInWork(v)) }),
  sessionRetentionAction: field({ scope: 'instance', parse: parseOneOf(['archive', 'delete']), ui: uiStore('sessionRetentionAction', (v) => useUIStore.getState().setSessionRetentionAction(v)) }),
  mergedWorktreeCleanupEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('mergedWorktreeCleanupEnabled', (v) => useUIStore.getState().setMergedWorktreeCleanupEnabled(v)) }),
  worktreeArchiveOnDoneEnabled: field({ scope: 'instance', parse: parseBoolean, ui: uiStore('worktreeArchiveOnDoneEnabled', (v) => useUIStore.getState().setWorktreeArchiveOnDoneEnabled(v)) }),
  terminalShell: field({ scope: 'instance', parse: parseTerminalShell, ui: uiStore('terminalShell', (v) => useUIStore.getState().setTerminalShell(v)) }),
  terminalLoginShells: field({ scope: 'instance', parse: parseTerminalShells(isTerminalShell), ui: uiStore('terminalLoginShells', (v) => useUIStore.getState().setTerminalLoginShells(v)) }),
  openInAppId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  dictationEnabled: field({ scope: 'profile', parse: parseBoolean, ui: configField('dictationEnabled') }),
  dictationAutoSend: field({ scope: 'profile', parse: parseBoolean, ui: configField('dictationAutoSend') }),
  sttProvider: field({ scope: 'instance', parse: parseSttProvider, ui: configField('sttProvider') }),
  sttServerUrl: field({ scope: 'instance', parse: parseTrimmedStringUpTo(2048), ui: configField('sttServerUrl') }),
  sttEndpointPath: field({ scope: 'instance', parse: fromSchema(z.string().trim().max(1024)), ui: configField('sttEndpointPath') }),
  sttModel: field({ scope: 'instance', parse: parseTrimmedStringUpTo(256), ui: configField('sttModel') }),
  sttLocalModel: field({ scope: 'instance', parse: parseTrimmedStringUpTo(256), ui: configField('sttLocalModel') }),
  sttLanguage: field({ scope: 'profile', parse: parseTrimmedStringUpTo(64), ui: configField('sttLanguage') }),
  sttCorrectTranscript: field({ scope: 'profile', parse: parseBoolean, ui: configField('sttCorrectTranscript') }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Interface language (profile; the i18n store owns the live copy and keeps
 // browser storage as the first-paint copy; the language picker writes it) ──
 locale: field({
  scope: 'profile',
  effect: ['server', 'shell', 'ui'],
  parse: parseOneOf(LOCALES),
  ui: {
   read: () => useI18nStore.getState().locale,
   write: (value) => useI18nStore.getState().setLocale(value),
   autoSave: false,
  },
 }),
||||||| bc50ba56aa
  // ── Tunnels (instance) ──
  tunnelProvider: field({ scope: 'instance', parse: mapParser(parseNonEmptyTrimmedString, (value) => value.toLowerCase()) }),
  tunnelMode: field({ scope: 'instance', parse: fromSchema(z.string().transform((value) => value.trim().toLowerCase()).pipe(z.enum(['quick', 'managed-remote', 'managed-local', 'serve', 'funnel']))) }),
  tunnelHttpsPort: field({ scope: 'instance', parse: parseIntegerInRange(1, 65535) }),
  tunnelBootstrapTtlMs: field({ scope: 'instance', parse: parseNullableFiniteNumber }),
  tunnelSessionTtlMs: field({ scope: 'instance', parse: parseFiniteNumber }),
  managedLocalTunnelConfigPath: field({ scope: 'instance', parse: parseNullableTrimmedPath }),
  managedRemoteTunnelHostname: field({ scope: 'instance', parse: parseTrimmedString }),
  managedRemoteTunnelToken: field({ scope: 'instance', secret: true, parse: parseNullableTrimmedString }),
  hasManagedRemoteTunnelToken: field({ scope: 'instance', computed: true, parse: parseBoolean }),
  managedRemoteTunnelPresets: field<ManagedRemoteTunnelPreset[]>({ scope: 'instance', parse: parseManagedRemoteTunnelPresets }),
  managedRemoteTunnelSelectedPresetId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  // Write-only: the tunnel page learns which presets have a token from the
  // tunnel status endpoint (`managedRemoteTunnelTokenPresetIds`), never from here.
  managedRemoteTunnelPresetTokens: field({ scope: 'instance', secret: true, parse: parseManagedRemoteTunnelPresetTokens }),
=======
  tunnelProvider: field({ scope: 'instance', parse: mapParser(parseNonEmptyTrimmedString, (value) => value.toLowerCase()) }),
  tunnelMode: field({ scope: 'instance', parse: fromSchema(z.string().transform((value) => value.trim().toLowerCase()).pipe(z.enum(['quick', 'managed-remote', 'managed-local', 'serve', 'funnel']))) }),
  tunnelHttpsPort: field({ scope: 'instance', parse: parseIntegerInRange(1, 65535) }),
  tunnelBootstrapTtlMs: field({ scope: 'instance', parse: parseNullableFiniteNumber }),
  tunnelSessionTtlMs: field({ scope: 'instance', parse: parseFiniteNumber }),
  managedLocalTunnelConfigPath: field({ scope: 'instance', parse: parseNullableTrimmedPath }),
  managedRemoteTunnelHostname: field({ scope: 'instance', parse: parseTrimmedString }),
  managedRemoteTunnelToken: field({ scope: 'instance', secret: true, parse: parseNullableTrimmedString }),
  hasManagedRemoteTunnelToken: field({ scope: 'instance', computed: true, parse: parseBoolean }),
  managedRemoteTunnelPresets: field<ManagedRemoteTunnelPreset[]>({ scope: 'instance', parse: parseManagedRemoteTunnelPresets }),
  managedRemoteTunnelSelectedPresetId: field({ scope: 'instance', parse: parseNonEmptyTrimmedString }),
  managedRemoteTunnelPresetTokens: field({ scope: 'instance', secret: true, parse: parseManagedRemoteTunnelPresetTokens }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Workspace pointers and instance facts ──
 lastDirectory: field({ scope: 'instance', effect: ['server', 'store', 'ui'], adopt: 'bootstrap-only', parse: parseNonEmptyString }),
 homeDirectory: field({ scope: 'instance', effect: ['server', 'shell', 'store', 'ui'], parse: parseNonEmptyString }),
 projects: field<ProjectEntry[]>({ scope: 'instance', effect: ['server', 'shell', 'store', 'ui'], parse: parseProjects }),
 activeProjectId: field({ scope: 'instance', effect: ['server', 'store', 'ui'], adopt: 'bootstrap-only', parse: parseNonEmptyString }),
 pinnedDirectories: field({ scope: 'instance', effect: ['server'], parse: parseStringSet }),
 desktopLanAccessEnabled: field({ scope: 'instance', effect: ['shell', 'ui'], surfaces: ['desktop'], parse: parseBoolean }),
 desktopKeepAwakeEnabled: field({ scope: 'instance', effect: ['shell'], surfaces: ['desktop'], parse: parseBoolean }),
 desktopMinimizeToTrayEnabled: field({ scope: 'instance', effect: ['shell'], surfaces: ['desktop'], parse: parseBoolean }),
 desktopMacMenuBarEnabled: field({ scope: 'instance', effect: ['shell', 'ui'], surfaces: ['desktop'], parse: parseBoolean }),
 desktopLinuxNativeFrame: field({ scope: 'instance', effect: ['shell', 'ui'], surfaces: ['desktop'], parse: parseBoolean }),
 // Write-only: the desktop network page learns whether one is set from
 // `hasDesktopUiPassword` and sends a value only when the user types a new
 // one (or removes it with an empty string).
 desktopUiPassword: field({ scope: 'instance', effect: ['shell', 'ui'], secret: true, surfaces: ['desktop'], parse: parseTrimmedString }),
 hasDesktopUiPassword: field({ scope: 'instance', effect: ['ui'], computed: true, surfaces: ['desktop'], parse: parseBoolean }),
 desktopLanAccessActive: field({ scope: 'instance', effect: ['ui'], computed: true, surfaces: ['desktop'], parse: parseBoolean }),
 desktopLanAccessBlockedReason: field({ scope: 'instance', effect: ['ui'], computed: true, surfaces: ['desktop'], parse: parseTrimmedString }),
 githubClientId: field({ scope: 'instance', effect: ['server'], parse: parseNonEmptyTrimmedString }),
 githubScopes: field({ scope: 'instance', effect: ['server'], parse: parseNonEmptyTrimmedString }),
 gitlabClientId: field({ scope: 'instance', effect: ['server'], parse: parseNonEmptyTrimmedString }),
 skillCatalogs: field<SkillCatalogConfig[]>({ scope: 'instance', effect: ['server', 'ui'], parse: parseSkillCatalogs }),
 defaultGitIdentityId: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseTrimmedString }),
 // The server keeps the message search index only while this is on.
 messageSearchEnabled: field({
  scope: 'instance',
  effect: ['server', 'ui'],
  surfaces: ['web', 'desktop', 'mobile'],
  parse: parseBoolean,
  ui: uiStore('messageSearchEnabled', (v) => useUIStore.getState().setMessageSearchEnabled(v)),
 }),
 // Agent reasoning in the same index; the server re-reads agent records when it turns on.
 messageSearchReasoningEnabled: field({
  scope: 'instance',
  effect: ['server', 'ui'],
  surfaces: ['web', 'desktop', 'mobile'],
  parse: parseBoolean,
  ui: uiStore('messageSearchReasoningEnabled', (v) => useUIStore.getState().setMessageSearchReasoningEnabled(v)),
 }),
 agentControlToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentControlToolEnabled', (v) => useUIStore.getState().setAgentControlToolEnabled(v)) }),
 agentWebToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentWebToolEnabled', (v) => useUIStore.getState().setAgentWebToolEnabled(v)) }),
 // `builtin` or an installed extension id; the server falls back to `builtin` when that extension cannot serve.
 browserProvider: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseNonEmptyString, ui: uiStore('browserProvider', (v) => useUIStore.getState().setBrowserProvider(v)) }),
 agentNotifyToolEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('agentNotifyToolEnabled', (v) => useUIStore.getState().setAgentNotifyToolEnabled(v)) }),
 // The isolated-spaces switch the server reads once at start. It has no Settings
 // row: the feature is unreleased, and `lib/spaces/release.ts` gates the UI on
 // its own. Declared here because the Host persists it and the wire snapshot
 // must agree with what a client is allowed to write.
 isolatedSpacesEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('isolatedSpacesEnabled', (v) => useUIStore.getState().setIsolatedSpacesEnabled(v)) }),
 // The idle stop of isolated spaces. Written and read through the spaces route,
 // which also tells the running spaces, so no store keeps a copy.
 isolatedSpacesIdleStop: field({
  scope: 'instance',
  effect: ['server'],
  parse: fromSchema(z.object({ enabled: z.boolean(), hours: z.number().int().min(1).max(168) }).strict()),
 }),
 // Server-owned: whether this build has agent workflows (`OPENCHAMBER_WORKFLOWS_ENABLE`).
 agentWorkflowFeatureAvailable: field({
  scope: 'instance',
  effect: ['ui'],
  computed: true,
  parse: parseBoolean,
  ui: uiStore('agentWorkflowFeatureAvailable', (v) => useUIStore.getState().setAgentWorkflowFeatureAvailable(v), { autoSave: false }),
 }),
 routingFeatureAvailable: field({
  scope: 'instance',
  effect: ['store', 'ui'],
  computed: true,
  parse: parseBoolean,
  ui: uiStore('routingFeatureAvailable', (v) => useUIStore.getState().setRoutingFeatureAvailable(v), { autoSave: false }),
 }),
 // Server-owned: whether this build mounts the overview page
 // (`OPENCHAMBER_OVERVIEW_ENABLED`). Without this field the server's answer never
 // reaches the store, so the page and its command stay unreachable.
 overviewFeatureAvailable: field({
  scope: 'instance',
  effect: ['server', 'store', 'ui'],
  computed: true,
  parse: parseBoolean,
  ui: uiStore('overviewFeatureAvailable', (v) => useUIStore.getState().setOverviewFeatureAvailable(v), { autoSave: false }),
 }),
 autoDeleteEnabled: field({ scope: 'instance', effect: ['ui'], parse: parseBoolean, ui: uiStore('autoDeleteEnabled', (v) => useUIStore.getState().setAutoDeleteEnabled(v)) }),
 autoDeleteAfterDays: field({ scope: 'instance', effect: ['ui'], parse: parseIntegerInRange(1, 365), ui: uiStore('autoDeleteAfterDays', (v) => useUIStore.getState().setAutoDeleteAfterDays(v)) }),
 // Apply scope before action so leaving archived-only mode can restore an incoming archive choice.
 sessionRetentionOnlyArchived: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseBoolean, ui: uiStore('sessionRetentionOnlyArchived', (v) => useUIStore.getState().setSessionRetentionOnlyArchived(v)) }),
 sessionRetentionIncludeInWork: field({ scope: 'instance', effect: ['ui'], parse: parseBoolean, ui: uiStore('sessionRetentionIncludeInWork', (v) => useUIStore.getState().setSessionRetentionIncludeInWork(v)) }),
 sessionRetentionAction: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseOneOf(['archive', 'delete']), ui: uiStore('sessionRetentionAction', (v) => useUIStore.getState().setSessionRetentionAction(v)) }),
 mergedWorktreeCleanupEnabled: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('mergedWorktreeCleanupEnabled', (v) => useUIStore.getState().setMergedWorktreeCleanupEnabled(v)) }),
 terminalShell: field({ scope: 'instance', effect: ['ui'], parse: parseTerminalShell, ui: uiStore('terminalShell', (v) => useUIStore.getState().setTerminalShell(v)) }),
 terminalLoginShells: field({ scope: 'instance', effect: ['ui'], parse: parseTerminalShells(isTerminalShell), ui: uiStore('terminalLoginShells', (v) => useUIStore.getState().setTerminalLoginShells(v)) }),
 openInAppId: field({ scope: 'instance', effect: ['store'], parse: parseNonEmptyTrimmedString }),
 dictationEnabled: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: configField('dictationEnabled') }),
 dictationAutoSend: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: configField('dictationAutoSend') }),
 sttProvider: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseSttProvider, ui: configField('sttProvider') }),
 sttServerUrl: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseTrimmedStringUpTo(2048), ui: configField('sttServerUrl') }),
 sttEndpointPath: field({ scope: 'instance', effect: ['store', 'ui'], parse: fromSchema(z.string().trim().max(1024)), ui: configField('sttEndpointPath') }),
 sttModel: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseTrimmedStringUpTo(256), ui: configField('sttModel') }),
 sttLocalModel: field({ scope: 'instance', effect: ['store', 'ui'], parse: parseTrimmedStringUpTo(256), ui: configField('sttLocalModel') }),
 sttLanguage: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseTrimmedStringUpTo(64), ui: configField('sttLanguage') }),
 sttCorrectTranscript: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: configField('sttCorrectTranscript') }),
||||||| bc50ba56aa
  // ── Sidebar display (profile; useSessionDisplayStore) ──
  sidebarProjectDisplayMode: field({ scope: 'profile', parse: parseOneOf(['all', 'single']), ui: sessionDisplayField('projectDisplayMode') }),
  // Per surface: the phone defaults to the timeline and a choice made there
  // must not flip the desktop sidebar (and vice versa).
  sidebarViewMode: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['projects', 'timeline']), ui: sessionDisplayField('sidebarViewMode') }),
  sidebarListSessionGrouping: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('listSessionGrouping') }),
  sidebarGrouping: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('sidebarGrouping') }),
  sidebarKeepWorkInPlace: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('keepWorkInPlace') }),
  sidebarProjectSortOrder: field({ scope: 'profile', parse: parseOneOf(['manual', 'a-z', 'z-a', 'date-added', 'recent']), ui: sessionDisplayField('projectSortOrder') }),
  sidebarShowChatsSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showChatsSection') }),
  sidebarShowWorkSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showWorkSection') }),
  sidebarShowPinnedSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showPinnedSection') }),
  sidebarDetailedZoneRows: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('detailedZoneRows') }),
  sidebarWorktreeNameByBranch: field({ scope: 'profile', parse: parseBoolean, ui: sessionDisplayField('worktreeNameByBranch') }),
  // The sections and pin lists are one arrangement for every surface; which of
  // the user's sections a surface shows is its own. They are written through
  // the store's setters, which record the instance they came from.
  sidebarSections: field({ scope: 'profile', parse: fromSchema(sidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().sections, write: (value) => useSessionDisplayStore.getState().setSections(value), autoSave: false } }),
  sidebarPinLists: field({ scope: 'profile', parse: fromSchema(sidebarPinListsSchema), ui: { read: () => useSessionDisplayStore.getState().pinLists, write: (value) => useSessionDisplayStore.getState().setPinLists(value), autoSave: false } }),
  sidebarHiddenSections: field({ scope: 'profile', perSurface: true, parse: fromSchema(hiddenSidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().hiddenSections, write: (value) => useSessionDisplayStore.getState().setHiddenSections(value), autoSave: false } }),
=======
  sidebarProjectDisplayMode: field({ scope: 'profile', parse: parseOneOf(['all', 'single']), ui: sessionDisplayField('projectDisplayMode') }),
  sidebarViewMode: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['projects', 'timeline']), ui: sessionDisplayField('sidebarViewMode') }),
  sidebarListSessionGrouping: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('listSessionGrouping') }),
  sidebarGrouping: field({ scope: 'profile', perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('sidebarGrouping') }),
  sidebarKeepWorkInPlace: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('keepWorkInPlace') }),
  sidebarKeepPinnedInPlace: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('keepPinnedInPlace') }),
  sidebarSessionBatchSize: field({ scope: 'profile', parse: parseIntegerInRange(SIDEBAR_SESSION_BATCH_MIN, SIDEBAR_SESSION_BATCH_MAX), ui: sessionDisplayField('sessionBatchSize') }),
  sidebarProjectSortOrder: field({ scope: 'profile', parse: parseOneOf(['manual', 'a-z', 'z-a', 'date-added', 'recent']), ui: sessionDisplayField('projectSortOrder') }),
  sidebarShowChatsSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showChatsSection') }),
  sidebarShowWorkSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showWorkSection') }),
  sidebarShowPinnedSection: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showPinnedSection') }),
  sidebarDetailedZoneRows: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: sessionDisplayField('detailedZoneRows') }),
  sidebarWorktreeNameByBranch: field({ scope: 'profile', parse: parseBoolean, ui: sessionDisplayField('worktreeNameByBranch') }),
  sidebarSections: field({ scope: 'profile', parse: fromSchema(sidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().sections, write: (value) => useSessionDisplayStore.getState().setSections(value), autoSave: false } }),
  sidebarPinLists: field({ scope: 'profile', parse: fromSchema(sidebarPinListsSchema), ui: { read: () => useSessionDisplayStore.getState().pinLists, write: (value) => useSessionDisplayStore.getState().setPinLists(value), autoSave: false } }),
  sidebarHiddenSections: field({ scope: 'profile', perSurface: true, parse: fromSchema(hiddenSidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().hiddenSections, write: (value) => useSessionDisplayStore.getState().setHiddenSections(value), autoSave: false } }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Tunnels (instance) ──
 tunnelProvider: field({ scope: 'instance', effect: ['server', 'ui'], parse: mapParser(parseNonEmptyTrimmedString, (value) => value.toLowerCase()) }),
 tunnelMode: field({ scope: 'instance', effect: ['server', 'ui'], parse: fromSchema(z.string().transform((value) => value.trim().toLowerCase()).pipe(z.enum(['quick', 'managed-remote', 'managed-local', 'serve', 'funnel']))) }),
 tunnelHttpsPort: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseIntegerInRange(1, 65535) }),
 tunnelBootstrapTtlMs: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseNullableFiniteNumber }),
 tunnelSessionTtlMs: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseFiniteNumber }),
 managedLocalTunnelConfigPath: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseNullableTrimmedPath }),
 managedRemoteTunnelHostname: field({ scope: 'instance', effect: ['server', 'ui'], parse: parseTrimmedString }),
 managedRemoteTunnelToken: field({ scope: 'instance', effect: ['server', 'ui'], secret: true, parse: parseNullableTrimmedString }),
 hasManagedRemoteTunnelToken: field({ scope: 'instance', effect: ['server', 'ui'], computed: true, parse: parseBoolean }),
 managedRemoteTunnelPresets: field<ManagedRemoteTunnelPreset[]>({ scope: 'instance', effect: ['server', 'ui'], parse: parseManagedRemoteTunnelPresets }),
 // Write-only: the tunnel page learns which presets have a token from the
 // tunnel status endpoint (`managedRemoteTunnelTokenPresetIds`), never from here.
 managedRemoteTunnelPresetTokens: field({ scope: 'instance', effect: ['ui'], secret: true, parse: parseManagedRemoteTunnelPresetTokens }),
||||||| bc50ba56aa
  // ── Work status ──
  workStatusSectionOrder: field({
    scope: 'profile',
    parse: mapParser(parseStringList, sanitizeWorkStatusSectionOrder),
    // The explicit marker tells an order the user arranged from a saved default.
    ui: uiStore('workStatusSectionOrder', (value, snapshot) => {
      const explicit = snapshot.workStatusSectionOrderExplicit === true;
      useUIStore.setState({
        workStatusSectionOrder: sanitizeWorkStatusSectionOrder(value, explicit),
        workStatusSectionOrderExplicit: explicit,
      });
    }),
  }),
  workStatusSectionOrderExplicit: field({
    scope: 'profile',
    parse: parseBoolean,
    // Applied here too: the order above is skipped when it equals the local one.
    ui: uiStore('workStatusSectionOrderExplicit', (value) => useUIStore.setState({ workStatusSectionOrderExplicit: value })),
  }),
  workStatusPanelEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('workStatusPanelEnabled', (v) => useUIStore.getState().setWorkStatusPanelEnabled(v)) }),
  workStatusHiddenSections: field({
    scope: 'profile',
    parse: parseWorkStatusHiddenSections,
    ui: {
      read: () => useUIStore.getState().workStatusHiddenSections,
      // The explicit marker distinguishes chosen lists from the old telemetry
      // default; both land in one store update so subscribers never see the
      // list without its marker.
      write: (value, snapshot) => {
        const explicit = snapshot.workStatusHiddenSectionsExplicit === true;
        useUIStore.setState({
          workStatusHiddenSections: sanitizeWorkStatusHiddenSections(value, explicit),
          workStatusHiddenSectionsExplicit: explicit,
        });
      },
      autoSave: true,
    },
  }),
  workStatusHiddenSectionsExplicit: field({
    scope: 'profile',
    parse: parseBoolean,
    // Applied together with the list above.
    ui: uiStore('workStatusHiddenSectionsExplicit', () => undefined),
  }),
=======
  workStatusSectionOrder: field({
    scope: 'profile',
    parse: mapParser(parseStringList, sanitizeWorkStatusSectionOrder),
    ui: uiStore('workStatusSectionOrder', (value, snapshot) => {
      const explicit = snapshot.workStatusSectionOrderExplicit === true;
      useUIStore.setState({
        workStatusSectionOrder: sanitizeWorkStatusSectionOrder(value, explicit),
        workStatusSectionOrderExplicit: explicit,
      });
    }),
  }),
  workStatusSectionOrderExplicit: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: uiStore('workStatusSectionOrderExplicit', (value) => useUIStore.setState({ workStatusSectionOrderExplicit: value })),
  }),
  workStatusPanelEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('workStatusPanelEnabled', (v) => useUIStore.getState().setWorkStatusPanelEnabled(v)) }),
  workStatusHiddenSections: field({
    scope: 'profile',
    parse: parseWorkStatusHiddenSections,
    ui: {
      read: () => useUIStore.getState().workStatusHiddenSections,
      write: (value, snapshot) => {
        const explicit = snapshot.workStatusHiddenSectionsExplicit === true;
        useUIStore.setState({
          workStatusHiddenSections: sanitizeWorkStatusHiddenSections(value, explicit),
          workStatusHiddenSectionsExplicit: explicit,
        });
      },
      autoSave: true,
    },
  }),
  workStatusHiddenSectionsExplicit: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: uiStore('workStatusHiddenSectionsExplicit', () => undefined),
  }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Sidebar display (profile; useSessionDisplayStore) ──
 sidebarProjectDisplayMode: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['all', 'single']), ui: sessionDisplayField('projectDisplayMode') }),
 sidebarListSessionGrouping: field({ scope: 'profile', effect: ['store'], perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('listSessionGrouping') }),
 sidebarGrouping: field({ scope: 'profile', effect: ['store', 'ui'], perSurface: true, parse: parseOneOf(['project', 'time']), ui: sessionDisplayField('sidebarGrouping') }),
 sidebarKeepWorkInPlace: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: sessionDisplayField('keepWorkInPlace') }),
 sidebarProjectSortOrder: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseOneOf(['manual', 'a-z', 'z-a', 'date-added', 'recent']), ui: sessionDisplayField('projectSortOrder') }),
 sidebarShowChatsSection: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showChatsSection') }),
 sidebarShowWorkSection: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showWorkSection') }),
 sidebarShowPinnedSection: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: sessionDisplayField('showPinnedSection') }),
 sidebarDetailedZoneRows: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: sessionDisplayField('detailedZoneRows') }),
 // The sections and pin lists are one arrangement for every surface; which of
 // the user's sections a surface shows is its own. They are written through the
 // store's setters, which record the instance they came from.
 sidebarSections: field({ scope: 'profile', effect: ['store', 'ui'], parse: fromSchema(sidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().sections, write: (value) => useSessionDisplayStore.getState().setSections(value), autoSave: false } }),
 sidebarPinLists: field({ scope: 'profile', effect: ['ui'], parse: fromSchema(sidebarPinListsSchema), ui: { read: () => useSessionDisplayStore.getState().pinLists, write: (value) => useSessionDisplayStore.getState().setPinLists(value), autoSave: false } }),
 sidebarHiddenSections: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: fromSchema(hiddenSidebarSectionsSchema), ui: { read: () => useSessionDisplayStore.getState().hiddenSections, write: (value) => useSessionDisplayStore.getState().setHiddenSections(value), autoSave: false } }),
||||||| bc50ba56aa
  // ── Chat and rendering (profile) ──
  showReasoningTraces: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showReasoningTraces', (v) => useUIStore.getState().setShowReasoningTraces(v)) }),
  streamingAutoFollowEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('streamingAutoFollowEnabled', (v) => useUIStore.getState().setStreamingAutoFollowEnabled(v)) }),
  collapsibleThinkingBlocks: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('collapsibleThinkingBlocks', (v) => useUIStore.getState().setCollapsibleThinkingBlocks(v)) }),
  expandReasoningWhileStreaming: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('expandReasoningWhileStreaming', (v) => useUIStore.getState().setExpandReasoningWhileStreaming(v)) }),
  showTextJustificationActivity: field({ scope: 'profile', parse: parseBoolean }),
  /** Legacy chat mode that `activityRenderMode` absorbs at parse time. */
  chatRenderMode: field({ scope: 'profile', parse: parseOneOf(['sorted', 'live']) }),
  activityRenderMode: field({ scope: 'profile', parse: parseActivityRenderMode, ui: uiStore('activityRenderMode', (v) => useUIStore.getState().setActivityRenderMode(v)) }),
  mermaidRenderingMode: field({ scope: 'profile', parse: parseOneOf(['svg', 'ascii']), ui: uiStore('mermaidRenderingMode', (v) => useUIStore.getState().setMermaidRenderingMode(v)) }),
  userMessageRenderingMode: field({ scope: 'profile', parse: parseOneOf(['markdown', 'plain']), ui: uiStore('userMessageRenderingMode', (v) => useUIStore.getState().setUserMessageRenderingMode(v)) }),
  collapsibleUserMessages: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('collapsibleUserMessages', (v) => useUIStore.getState().setCollapsibleUserMessages(v)) }),
  stickyUserHeader: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('stickyUserHeader', (v) => useUIStore.getState().setStickyUserHeader(v)) }),
  promptNavigatorEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('promptNavigatorEnabled', (v) => useUIStore.getState().setPromptNavigatorEnabled(v)) }),
  wideChatLayoutEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('wideChatLayoutEnabled', (v) => useUIStore.getState().setWideChatLayoutEnabled(v)) }),
  showSplitAssistantMessageActions: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showSplitAssistantMessageActions', (v) => useUIStore.getState().setShowSplitAssistantMessageActions(v)) }),
  showToolFileIcons: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showToolFileIcons', (v) => useUIStore.getState().setShowToolFileIcons(v)) }),
  codeBlockLineWrap: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('codeBlockLineWrap', (v) => useUIStore.getState().setCodeBlockLineWrap(v)) }),
  tableCellWrap: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('tableCellWrap', (v) => useUIStore.getState().setTableCellWrap(v)) }),
  copyMessagesAsPlainText: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('copyMessagesAsPlainText', (v) => useUIStore.getState().setCopyMessagesAsPlainText(v)) }),
  selectionApprovalText: field({ scope: 'profile', parse: parseTextUpTo(1000), ui: uiStore('selectionApprovalText', (v) => useUIStore.getState().setSelectionApprovalText(v)) }),
  showTurnChangedFiles: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showTurnChangedFiles', (v) => useUIStore.getState().setShowTurnChangedFiles(v)) }),
  toolJsonViewMode: field({ scope: 'profile', parse: parseOneOf(['summary', 'formatted', 'raw']), ui: uiStore('toolJsonViewMode', (v) => useUIStore.getState().setToolJsonViewMode(v)) }),
  timeFormatPreference: field({ scope: 'profile', parse: parseOneOf(['auto', '12h', '24h']), ui: uiStore('timeFormatPreference', (v) => useUIStore.getState().setTimeFormatPreference(v)) }),
  weekStartPreference: field({ scope: 'profile', parse: parseOneOf(['auto', 'sunday', 'monday']), ui: uiStore('weekStartPreference', (v) => useUIStore.getState().setWeekStartPreference(v)) }),
  messageStreamTransport: field({ scope: 'profile', parse: parseOneOf(['auto', 'ws', 'sse']), ui: configField('settingsMessageStreamTransport') }),
  diffLayoutPreference: field({ scope: 'profile', parse: parseOneOf(['dynamic', 'inline', 'side-by-side']), ui: uiStore('diffLayoutPreference', (v) => useUIStore.getState().setDiffLayoutPreference(v)) }),
  diffWrapLines: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('diffWrapLines', (v) => useUIStore.getState().setDiffWrapLines(v)) }),
  diffHideWhitespace: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('diffHideWhitespace', (v) => useUIStore.getState().setDiffHideWhitespace(v)) }),
  gitChangesViewMode: field({ scope: 'profile', parse: parseOneOf(['flat', 'tree']), ui: uiStore('gitChangesViewMode', (v) => useUIStore.getState().setGitChangesViewMode(v)) }),
  gitmojiEnabled: field({ scope: 'profile', parse: parseBoolean }),
  defaultFileViewerPreview: field({ scope: 'profile', parse: parseBoolean }),
  directoryShowHidden: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: { read: getDirectoryShowHidden, write: (v) => setDirectoryShowHidden(v, { persist: false }), autoSave: false },
  }),
  filesViewShowGitignored: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: { read: getFilesViewShowGitignored, write: (v) => setFilesViewShowGitignored(v, { persist: false }), autoSave: false },
  }),
  fileEditorKeymap: field({ scope: 'profile', parse: parseFileEditorKeymap, ui: uiStore('fileEditorKeymap', (v) => useUIStore.getState().setFileEditorKeymap(v)) }),
  fileEditorVimMappings: field({ scope: 'profile', parse: parseTextUpTo(10_000), ui: uiStore('fileEditorVimMappings', (v) => useUIStore.getState().setFileEditorVimMappings(v)) }),
  autoSaveEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('autoSaveEnabled', (v) => useUIStore.getState().setAutoSaveEnabled(v)) }),
  fileEditorWrapLines: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('fileEditorWrapLines', (v) => useUIStore.getState().setFileEditorWrapLines(v)) }),
  confirmFileTreeMove: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('confirmFileTreeMove', (v) => useUIStore.getState().setConfirmFileTreeMove(v)) }),
  fileTreeSide: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseOneOf(['left', 'right']), ui: uiStore('fileTreeSide', (v) => useUIStore.getState().setFileTreeSide(v)) }),
  layoutAnimations: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('layoutAnimations', (v) => useUIStore.getState().setLayoutAnimations(v)) }),
  openLinksInBrowserPanel: field({ scope: 'profile', surfaces: ['desktop'], parse: parseBoolean, ui: uiStore('openLinksInBrowserPanel', (v) => useUIStore.getState().setOpenLinksInBrowserPanel(v)) }),
  liveBrowserTabLimit: field({ scope: 'profile', surfaces: ['desktop'], parse: parseIntegerInRange(LIVE_BROWSER_TABS_MIN, LIVE_BROWSER_TABS_MAX), ui: uiStore('liveBrowserTabLimit', (v) => useUIStore.getState().setLiveBrowserTabLimit(v)) }),
  openTrackerLinksOnBoard: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('openTrackerLinksOnBoard', (v) => useUIStore.getState().setOpenTrackerLinksOnBoard(v)) }),
  terminalCloseOnExit: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('terminalCloseOnExit', (v) => useUIStore.getState().setTerminalCloseOnExit(v)) }),
  autoCreateWorktree: field({ scope: 'profile', parse: parseBoolean }),
  sessionTabsEnabled: field({ scope: 'profile', surfaces: ['web', 'desktop', 'vscode'], parse: parseBoolean, ui: uiStore('sessionTabsEnabled', (v) => useUIStore.getState().setSessionTabsEnabled(v)) }),
  sessionTabsPerWorkspace: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('sessionTabsPerWorkspace', (v) => useUIStore.getState().setSessionTabsPerWorkspace(v)) }),
  allowPromptingSubagentSessions: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('allowPromptingSubagentSessions', (v) => useUIStore.getState().setAllowPromptingSubagentSessions(v)) }),
=======
  showReasoningTraces: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showReasoningTraces', (v) => useUIStore.getState().setShowReasoningTraces(v)) }),
  streamingAutoFollowEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('streamingAutoFollowEnabled', (v) => useUIStore.getState().setStreamingAutoFollowEnabled(v)) }),
  collapsibleThinkingBlocks: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('collapsibleThinkingBlocks', (v) => useUIStore.getState().setCollapsibleThinkingBlocks(v)) }),
  expandReasoningWhileStreaming: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('expandReasoningWhileStreaming', (v) => useUIStore.getState().setExpandReasoningWhileStreaming(v)) }),
  showTextJustificationActivity: field({ scope: 'profile', parse: parseBoolean }),
  chatRenderMode: field({ scope: 'profile', parse: parseOneOf(['sorted', 'live']) }),
  activityRenderMode: field({ scope: 'profile', parse: parseActivityRenderMode, ui: uiStore('activityRenderMode', (v) => useUIStore.getState().setActivityRenderMode(v)) }),
  mermaidRenderingMode: field({ scope: 'profile', parse: parseOneOf(['svg', 'ascii']), ui: uiStore('mermaidRenderingMode', (v) => useUIStore.getState().setMermaidRenderingMode(v)) }),
  userMessageRenderingMode: field({ scope: 'profile', parse: parseOneOf(['markdown', 'plain']), ui: uiStore('userMessageRenderingMode', (v) => useUIStore.getState().setUserMessageRenderingMode(v)) }),
  collapsibleUserMessages: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('collapsibleUserMessages', (v) => useUIStore.getState().setCollapsibleUserMessages(v)) }),
  stickyUserHeader: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('stickyUserHeader', (v) => useUIStore.getState().setStickyUserHeader(v)) }),
  promptNavigatorEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean, ui: uiStore('promptNavigatorEnabled', (v) => useUIStore.getState().setPromptNavigatorEnabled(v)) }),
  chatWidth: field({ scope: 'profile', perSurface: true, parse: parseChatWidth, ui: uiStore('chatWidth', (v) => useUIStore.getState().setChatWidth(v)) }),
  wideChatLayoutEnabled: field({ scope: 'profile', perSurface: true, parse: parseBoolean }),
  showSplitAssistantMessageActions: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showSplitAssistantMessageActions', (v) => useUIStore.getState().setShowSplitAssistantMessageActions(v)) }),
  showToolFileIcons: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showToolFileIcons', (v) => useUIStore.getState().setShowToolFileIcons(v)) }),
  codeBlockLineWrap: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('codeBlockLineWrap', (v) => useUIStore.getState().setCodeBlockLineWrap(v)) }),
  tableCellWrap: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('tableCellWrap', (v) => useUIStore.getState().setTableCellWrap(v)) }),
  copyMessagesAsPlainText: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('copyMessagesAsPlainText', (v) => useUIStore.getState().setCopyMessagesAsPlainText(v)) }),
  selectionApprovalText: field({ scope: 'profile', parse: parseTextUpTo(1000), ui: uiStore('selectionApprovalText', (v) => useUIStore.getState().setSelectionApprovalText(v)) }),
  showTurnChangedFiles: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showTurnChangedFiles', (v) => useUIStore.getState().setShowTurnChangedFiles(v)) }),
  toolJsonViewMode: field({ scope: 'profile', parse: parseOneOf(['summary', 'formatted', 'raw']), ui: uiStore('toolJsonViewMode', (v) => useUIStore.getState().setToolJsonViewMode(v)) }),
  timeFormatPreference: field({ scope: 'profile', parse: parseOneOf(['auto', '12h', '24h']), ui: uiStore('timeFormatPreference', (v) => useUIStore.getState().setTimeFormatPreference(v)) }),
  weekStartPreference: field({ scope: 'profile', parse: parseOneOf(['auto', 'sunday', 'monday']), ui: uiStore('weekStartPreference', (v) => useUIStore.getState().setWeekStartPreference(v)) }),
  messageStreamTransport: field({ scope: 'profile', parse: parseOneOf(['auto', 'ws', 'sse']), ui: configField('settingsMessageStreamTransport') }),
  diffLayoutPreference: field({ scope: 'profile', parse: parseOneOf(['dynamic', 'inline', 'side-by-side']), ui: uiStore('diffLayoutPreference', (v) => useUIStore.getState().setDiffLayoutPreference(v)) }),
  diffWrapLines: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('diffWrapLines', (v) => useUIStore.getState().setDiffWrapLines(v)) }),
  diffHideWhitespace: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('diffHideWhitespace', (v) => useUIStore.getState().setDiffHideWhitespace(v)) }),
  gitChangesViewMode: field({ scope: 'profile', parse: parseOneOf(['flat', 'tree']), ui: uiStore('gitChangesViewMode', (v) => useUIStore.getState().setGitChangesViewMode(v)) }),
  gitmojiEnabled: field({ scope: 'profile', parse: parseBoolean }),
  defaultFileViewerPreview: field({ scope: 'profile', parse: parseBoolean }),
  directoryShowHidden: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: { read: getDirectoryShowHidden, write: (v) => setDirectoryShowHidden(v, { persist: false }), autoSave: false },
  }),
  filesViewShowGitignored: field({
    scope: 'profile',
    parse: parseBoolean,
    ui: { read: getFilesViewShowGitignored, write: (v) => setFilesViewShowGitignored(v, { persist: false }), autoSave: false },
  }),
  fileEditorKeymap: field({ scope: 'profile', parse: parseFileEditorKeymap, ui: uiStore('fileEditorKeymap', (v) => useUIStore.getState().setFileEditorKeymap(v)) }),
  fileEditorVimMappings: field({ scope: 'profile', parse: parseTextUpTo(10_000), ui: uiStore('fileEditorVimMappings', (v) => useUIStore.getState().setFileEditorVimMappings(v)) }),
  autoSaveEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('autoSaveEnabled', (v) => useUIStore.getState().setAutoSaveEnabled(v)) }),
  fileEditorWrapLines: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('fileEditorWrapLines', (v) => useUIStore.getState().setFileEditorWrapLines(v)) }),
  confirmFileTreeMove: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('confirmFileTreeMove', (v) => useUIStore.getState().setConfirmFileTreeMove(v)) }),
  fileTreeSide: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseOneOf(['left', 'right']), ui: uiStore('fileTreeSide', (v) => useUIStore.getState().setFileTreeSide(v)) }),
  layoutAnimations: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('layoutAnimations', (v) => useUIStore.getState().setLayoutAnimations(v)) }),
  openLinksInBrowserPanel: field({ scope: 'profile', surfaces: ['desktop'], parse: parseBoolean, ui: uiStore('openLinksInBrowserPanel', (v) => useUIStore.getState().setOpenLinksInBrowserPanel(v)) }),
  liveBrowserTabLimit: field({ scope: 'profile', surfaces: ['desktop'], parse: parseIntegerInRange(LIVE_BROWSER_TABS_MIN, LIVE_BROWSER_TABS_MAX), ui: uiStore('liveBrowserTabLimit', (v) => useUIStore.getState().setLiveBrowserTabLimit(v)) }),
  agentBrowserSharesLogins: field({ scope: 'profile', surfaces: ['desktop'], parse: parseBoolean, ui: uiStore('agentBrowserSharesLogins', (v) => useUIStore.getState().setAgentBrowserSharesLogins(v)) }),
  openTrackerLinksOnBoard: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('openTrackerLinksOnBoard', (v) => useUIStore.getState().setOpenTrackerLinksOnBoard(v)) }),
  terminalCloseOnExit: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('terminalCloseOnExit', (v) => useUIStore.getState().setTerminalCloseOnExit(v)) }),
  terminalOpenOnProjectAction: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('terminalOpenOnProjectAction', (v) => useUIStore.getState().setTerminalOpenOnProjectAction(v)) }),
  autoCreateWorktree: field({ scope: 'profile', parse: parseBoolean }),
  sessionTabsEnabled: field({ scope: 'profile', surfaces: ['web', 'desktop', 'vscode'], parse: parseBoolean, ui: uiStore('sessionTabsEnabled', (v) => useUIStore.getState().setSessionTabsEnabled(v)) }),
  sessionTabsPerWorkspace: field({ scope: 'profile', surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('sessionTabsPerWorkspace', (v) => useUIStore.getState().setSessionTabsPerWorkspace(v)) }),
  allowPromptingSubagentSessions: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('allowPromptingSubagentSessions', (v) => useUIStore.getState().setAllowPromptingSubagentSessions(v)) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Work status ──
 workStatusSectionOrder: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: mapParser(parseStringList, sanitizeWorkStatusSectionOrder),
  ui: uiStore('workStatusSectionOrder', (value) => useUIStore.getState().setWorkStatusSectionOrder(value)),
 }),
 workStatusPanelEnabled: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: uiStore('workStatusPanelEnabled', (v) => useUIStore.getState().setWorkStatusPanelEnabled(v)) }),
 workStatusHiddenSections: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: parseWorkStatusHiddenSections,
  ui: {
   read: () => useUIStore.getState().workStatusHiddenSections,
   // The explicit marker distinguishes chosen lists from the old telemetry
   // default; both land in one store update so subscribers never see the
   // list without its marker.
   write: (value, snapshot) => {
    const explicit = snapshot.workStatusHiddenSectionsExplicit === true;
    useUIStore.setState({
     workStatusHiddenSections: sanitizeWorkStatusHiddenSections(value, explicit),
     workStatusHiddenSectionsExplicit: explicit,
    });
   },
   autoSave: true,
  },
 }),
 workStatusHiddenSectionsExplicit: field({
  scope: 'profile',
  effect: ['store'],
  parse: parseBoolean,
  // Applied together with the list above.
  ui: uiStore('workStatusHiddenSectionsExplicit', () => undefined),
 }),
||||||| bc50ba56aa
  // ── Composer (profile) ──
  inputSpellcheckEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('inputSpellcheckEnabled', (v) => useUIStore.getState().setInputSpellcheckEnabled(v)) }),
  enterToSend: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('enterToSend', (v) => useUIStore.getState().setEnterToSend(v)) }),
  enterToSendConfigured: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('enterToSendConfigured', (v) => useUIStore.getState().setEnterToSendConfigured(v)) }),
  mobileReturnKeySends: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('mobileReturnKeySends', (v) => useUIStore.getState().setMobileReturnKeySends(v)) }),
  largeTextPasteBehavior: field({ scope: 'profile', parse: parseLargeTextPasteBehavior, ui: uiStore('largeTextPasteBehavior', (v) => useUIStore.getState().setLargeTextPasteBehavior(v)) }),
  savePastedImagesAsFiles: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('savePastedImagesAsFiles', (v) => useUIStore.getState().setSavePastedImagesAsFiles(v)) }),
  followUpBehavior: field({
    scope: 'profile',
    parse: parseFollowUpBehavior,
    ui: {
      read: () => useMessageQueueStore.getState().followUpBehavior,
      write: (v) => useMessageQueueStore.getState().setFollowUpBehavior(v),
      autoSave: false,
    },
  }),
  /** Legacy boolean that `followUpBehavior` absorbs at parse time. */
  queueModeEnabled: field({ scope: 'profile', parse: parseBoolean }),
  inputHistoryScope: field({
    scope: 'profile',
    parse: parseInputHistoryScope,
    ui: { read: () => useInputHistoryStore.getState().scope, write: (v) => useInputHistoryStore.getState().applyScope(v), autoSave: false },
  }),
  inputHistoryLimit: field({
    scope: 'profile',
    parse: parseInputHistoryLimit,
    ui: { read: () => useInputHistoryStore.getState().entryLimit, write: (v) => useInputHistoryStore.getState().applyEntryLimit(v), autoSave: false },
  }),
  draftStarters: field<DraftStarterRef[]>({
    scope: 'profile',
    parse: parseDraftStarters,
    ui: {
      read: () => useUIStore.getState().globalDraftStarters ?? undefined,
      write: (value, snapshot) => useUIStore.getState().setGlobalDraftStarters(withOfferedBuiltInStarters(value, snapshot)),
      // useDraftStarters writes the list together with its markers.
      autoSave: false,
    },
  }),
  draftStartersVisible: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('draftStartersVisible', (v) => useUIStore.getState().setDraftStartersVisible(v)) }),
  draftStartersCraftGoalAdded: field({ scope: 'profile', parse: parseBoolean }),
  draftStartersScheduleTaskAdded: field({ scope: 'profile', parse: parseBoolean }),
=======
  inputSpellcheckEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('inputSpellcheckEnabled', (v) => useUIStore.getState().setInputSpellcheckEnabled(v)) }),
  enterToSend: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('enterToSend', (v) => useUIStore.getState().setEnterToSend(v)) }),
  enterToSendConfigured: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('enterToSendConfigured', (v) => useUIStore.getState().setEnterToSendConfigured(v)) }),
  mobileReturnKeySends: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('mobileReturnKeySends', (v) => useUIStore.getState().setMobileReturnKeySends(v)) }),
  largeTextPasteBehavior: field({ scope: 'profile', parse: parseLargeTextPasteBehavior, ui: uiStore('largeTextPasteBehavior', (v) => useUIStore.getState().setLargeTextPasteBehavior(v)) }),
  savePastedImagesAsFiles: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('savePastedImagesAsFiles', (v) => useUIStore.getState().setSavePastedImagesAsFiles(v)) }),
  followUpBehavior: field({
    scope: 'profile',
    parse: parseFollowUpBehavior,
    ui: {
      read: () => useMessageQueueStore.getState().followUpBehavior,
      write: (v) => useMessageQueueStore.getState().setFollowUpBehavior(v),
      autoSave: false,
    },
  }),
  queueModeEnabled: field({ scope: 'profile', parse: parseBoolean }),
  inputHistoryScope: field({
    scope: 'profile',
    parse: parseInputHistoryScope,
    ui: { read: () => useInputHistoryStore.getState().scope, write: (v) => useInputHistoryStore.getState().applyScope(v), autoSave: false },
  }),
  inputHistoryLimit: field({
    scope: 'profile',
    parse: parseInputHistoryLimit,
    ui: { read: () => useInputHistoryStore.getState().entryLimit, write: (v) => useInputHistoryStore.getState().applyEntryLimit(v), autoSave: false },
  }),
  draftStarters: field<DraftStarterRef[]>({
    scope: 'profile',
    parse: parseDraftStarters,
    ui: {
      read: () => useUIStore.getState().globalDraftStarters ?? undefined,
      write: (value, snapshot) => useUIStore.getState().setGlobalDraftStarters(withOfferedBuiltInStarters(value, snapshot)),
      autoSave: false,
    },
  }),
  draftStartersVisible: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('draftStartersVisible', (v) => useUIStore.getState().setDraftStartersVisible(v)) }),
  draftStartersCraftGoalAdded: field({ scope: 'profile', parse: parseBoolean }),
  draftStartersScheduleTaskAdded: field({ scope: 'profile', parse: parseBoolean }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Chat and rendering (profile) ──
 showReasoningTraces: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('showReasoningTraces', (v) => useUIStore.getState().setShowReasoningTraces(v)) }),
 streamingAutoFollowEnabled: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: uiStore('streamingAutoFollowEnabled', (v) => useUIStore.getState().setStreamingAutoFollowEnabled(v)) }),
 collapsibleThinkingBlocks: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('collapsibleThinkingBlocks', (v) => useUIStore.getState().setCollapsibleThinkingBlocks(v)) }),
 expandReasoningWhileStreaming: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('expandReasoningWhileStreaming', (v) => useUIStore.getState().setExpandReasoningWhileStreaming(v)) }),
 showTextJustificationActivity: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 chatRenderMode: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['sorted', 'live']), ui: uiStore('chatRenderMode', (v) => useUIStore.getState().setChatRenderMode(v)) }),
 activityRenderMode: field({ scope: 'profile', effect: ['ui'], parse: parseActivityRenderMode, ui: uiStore('activityRenderMode', (v) => useUIStore.getState().setActivityRenderMode(v)) }),
 mermaidRenderingMode: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['svg', 'ascii']), ui: uiStore('mermaidRenderingMode', (v) => useUIStore.getState().setMermaidRenderingMode(v)) }),
 userMessageRenderingMode: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['markdown', 'plain']), ui: uiStore('userMessageRenderingMode', (v) => useUIStore.getState().setUserMessageRenderingMode(v)) }),
 collapsibleUserMessages: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('collapsibleUserMessages', (v) => useUIStore.getState().setCollapsibleUserMessages(v)) }),
 stickyUserHeader: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: uiStore('stickyUserHeader', (v) => useUIStore.getState().setStickyUserHeader(v)) }),
 promptNavigatorEnabled: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: uiStore('promptNavigatorEnabled', (v) => useUIStore.getState().setPromptNavigatorEnabled(v)) }),
 wideChatLayoutEnabled: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseBoolean, ui: uiStore('wideChatLayoutEnabled', (v) => useUIStore.getState().setWideChatLayoutEnabled(v)) }),
 showSplitAssistantMessageActions: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('showSplitAssistantMessageActions', (v) => useUIStore.getState().setShowSplitAssistantMessageActions(v)) }),
 showToolFileIcons: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('showToolFileIcons', (v) => useUIStore.getState().setShowToolFileIcons(v)) }),
 codeBlockLineWrap: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('codeBlockLineWrap', (v) => useUIStore.getState().setCodeBlockLineWrap(v)) }),
 tableCellWrap: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('tableCellWrap', (v) => useUIStore.getState().setTableCellWrap(v)) }),
 copyMessagesAsPlainText: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('copyMessagesAsPlainText', (v) => useUIStore.getState().setCopyMessagesAsPlainText(v)) }),
 showTurnChangedFiles: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('showTurnChangedFiles', (v) => useUIStore.getState().setShowTurnChangedFiles(v)) }),
 toolJsonViewMode: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseOneOf(['summary', 'formatted', 'raw']), ui: uiStore('toolJsonViewMode', (v) => useUIStore.getState().setToolJsonViewMode(v)) }),
 timeFormatPreference: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['auto', '12h', '24h']), ui: uiStore('timeFormatPreference', (v) => useUIStore.getState().setTimeFormatPreference(v)) }),
 weekStartPreference: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['auto', 'sunday', 'monday']), ui: uiStore('weekStartPreference', (v) => useUIStore.getState().setWeekStartPreference(v)) }),
 diffLayoutPreference: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['dynamic', 'inline', 'side-by-side']), ui: uiStore('diffLayoutPreference', (v) => useUIStore.getState().setDiffLayoutPreference(v)) }),
 diffWrapLines: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('diffWrapLines', (v) => useUIStore.getState().setDiffWrapLines(v)) }),
 diffHideWhitespace: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('diffHideWhitespace', (v) => useUIStore.getState().setDiffHideWhitespace(v)) }),
 gitChangesViewMode: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseOneOf(['flat', 'tree']), ui: uiStore('gitChangesViewMode', (v) => useUIStore.getState().setGitChangesViewMode(v)) }),
 gitmojiEnabled: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean }),
 // Commit-message controls. A missing value is not `false`:
 // `lib/gitCommitSettings.ts` owns the defaults (generation on, the rest off),
 // so an install that never touched these keeps generating as it always did.
 generateCommitMessages: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 commitMessageReasoning: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 commitMessageNotes: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 commitMessageChangeId: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 defaultFileViewerPreview: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: configField('settingsDefaultFileViewerPreview') }),
 directoryShowHidden: field({
  scope: 'profile',
  effect: ['ui'],
  parse: parseBoolean,
  ui: { read: getDirectoryShowHidden, write: (v) => setDirectoryShowHidden(v, { persist: false }), autoSave: false },
 }),
 filesViewShowGitignored: field({
  scope: 'profile',
  effect: ['ui'],
  parse: parseBoolean,
  ui: { read: getFilesViewShowGitignored, write: (v) => setFilesViewShowGitignored(v, { persist: false }), autoSave: false },
 }),
 fileEditorKeymap: field({ scope: 'profile', effect: ['ui'], parse: parseFileEditorKeymap, ui: uiStore('fileEditorKeymap', (v) => useUIStore.getState().setFileEditorKeymap(v)) }),
 fileEditorVimMappings: field({ scope: 'profile', effect: ['ui'], parse: parseTextUpTo(10_000), ui: uiStore('fileEditorVimMappings', (v) => useUIStore.getState().setFileEditorVimMappings(v)) }),
 autoSaveEnabled: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean, ui: uiStore('autoSaveEnabled', (v) => useUIStore.getState().setAutoSaveEnabled(v)) }),
 confirmFileTreeMove: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('confirmFileTreeMove', (v) => useUIStore.getState().setConfirmFileTreeMove(v)) }),
 autoCreateWorktree: field({ scope: 'profile', effect: ['store'], parse: parseBoolean }),
 terminalCloseOnExit: field({ scope: 'profile', effect: ['ui'], surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('terminalCloseOnExit', (v) => useUIStore.getState().setTerminalCloseOnExit(v)) }),
 sessionTabsEnabled: field({ scope: 'profile', effect: ['ui'], surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('sessionTabsEnabled', (v) => useUIStore.getState().setSessionTabsEnabled(v)) }),
 sessionTabsPerWorkspace: field({ scope: 'profile', effect: ['ui'], surfaces: ['web', 'desktop'], parse: parseBoolean, ui: uiStore('sessionTabsPerWorkspace', (v) => useUIStore.getState().setSessionTabsPerWorkspace(v)) }),
 allowPromptingSubagentSessions: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('allowPromptingSubagentSessions', (v) => useUIStore.getState().setAllowPromptingSubagentSessions(v)) }),
||||||| bc50ba56aa
  // ── Typography (profile; sizes per surface) ──
  fontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('fontSize', (v) => useUIStore.getState().setFontSize(v)) }),
  chatFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('chatFontSize', (v) => useUIStore.getState().setChatFontSize(v)) }),
  terminalFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('terminalFontSize', (v) => useUIStore.getState().setTerminalFontSize(v)) }),
  editorFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('editorFontSize', (v) => useUIStore.getState().setEditorFontSize(v)) }),
  uiFont: field({ scope: 'profile', parse: parseUiFont, ui: uiStore('uiFont', (v) => useUIStore.getState().setUiFont(v)) }),
  monoFont: field({ scope: 'profile', parse: parseMonoFont, ui: uiStore('monoFont', (v) => useUIStore.getState().setMonoFont(v)) }),
  customUiFont: field({ scope: 'profile', parse: parseTextUpTo(100), ui: uiStore('customUiFont', (v) => useUIStore.getState().setCustomUiFont(v)) }),
  customMonoFont: field({ scope: 'profile', parse: parseTextUpTo(100), ui: uiStore('customMonoFont', (v) => useUIStore.getState().setCustomMonoFont(v)) }),
  uiFontWeight: field({ scope: 'profile', parse: parseOneOf(UI_FONT_WEIGHT_OPTIONS), ui: uiStore('uiFontWeight', (v) => useUIStore.getState().setUiFontWeight(v)) }),
  padding: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('padding', (v) => useUIStore.getState().setPadding(v)) }),
  cornerRadius: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('cornerRadius', (v) => useUIStore.getState().setCornerRadius(v)) }),
  shortcutOverrides: field({
    scope: 'profile',
    parse: parseShortcutOverrides,
    ui: uiStore('shortcutOverrides', setUi('shortcutOverrides')),
  }),
=======
  fontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('fontSize', (v) => useUIStore.getState().setFontSize(v)) }),
  chatFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('chatFontSize', (v) => useUIStore.getState().setChatFontSize(v)) }),
  terminalFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('terminalFontSize', (v) => useUIStore.getState().setTerminalFontSize(v)) }),
  editorFontSize: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('editorFontSize', (v) => useUIStore.getState().setEditorFontSize(v)) }),
  uiFont: field({ scope: 'profile', parse: parseUiFont, ui: uiStore('uiFont', (v) => useUIStore.getState().setUiFont(v)) }),
  monoFont: field({ scope: 'profile', parse: parseMonoFont, ui: uiStore('monoFont', (v) => useUIStore.getState().setMonoFont(v)) }),
  customUiFont: field({ scope: 'profile', parse: parseTextUpTo(100), ui: uiStore('customUiFont', (v) => useUIStore.getState().setCustomUiFont(v)) }),
  customMonoFont: field({ scope: 'profile', parse: parseTextUpTo(100), ui: uiStore('customMonoFont', (v) => useUIStore.getState().setCustomMonoFont(v)) }),
  uiFontWeight: field({ scope: 'profile', parse: parseOneOf(UI_FONT_WEIGHT_OPTIONS), ui: uiStore('uiFontWeight', (v) => useUIStore.getState().setUiFontWeight(v)) }),
  padding: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('padding', (v) => useUIStore.getState().setPadding(v)) }),
  cornerRadius: field({ scope: 'profile', perSurface: true, parse: parseFiniteNumber, ui: uiStore('cornerRadius', (v) => useUIStore.getState().setCornerRadius(v)) }),
  shortcutOverrides: field({
    scope: 'profile',
    parse: parseShortcutOverrides,
    ui: uiStore('shortcutOverrides', setUi('shortcutOverrides')),
  }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Composer (profile) ──
 inputSpellcheckEnabled: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('inputSpellcheckEnabled', (v) => useUIStore.getState().setInputSpellcheckEnabled(v)) }),
 enterToSend: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('enterToSend', (v) => useUIStore.getState().setEnterToSend(v)) }),
 enterToSendConfigured: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('enterToSendConfigured', (v) => useUIStore.getState().setEnterToSendConfigured(v)) }),
 persistChatDraft: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('persistChatDraft', (v) => useUIStore.getState().setPersistChatDraft(v)) }),
 largeTextPasteBehavior: field({ scope: 'profile', effect: ['ui'], parse: parseLargeTextPasteBehavior, ui: uiStore('largeTextPasteBehavior', (v) => useUIStore.getState().setLargeTextPasteBehavior(v)) }),
 selectionApprovalText: field({ scope: 'profile', effect: ['ui'], parse: parseTextUpTo(1000), ui: uiStore('selectionApprovalText', (v) => useUIStore.getState().setSelectionApprovalText(v)) }),
 followUpBehavior: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: parseFollowUpBehavior,
  ui: {
   read: () => useMessageQueueStore.getState().followUpBehavior,
   write: (v) => useMessageQueueStore.getState().setFollowUpBehavior(v),
   autoSave: false,
  },
 }),
 /** Legacy boolean that `followUpBehavior` absorbs at parse time. */
 queueModeEnabled: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseBoolean }),
 inputHistoryScope: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: parseInputHistoryScope,
  ui: { read: () => useInputHistoryStore.getState().scope, write: (v) => useInputHistoryStore.getState().applyScope(v), autoSave: false },
 }),
 inputHistoryLimit: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: parseInputHistoryLimit,
  ui: { field: 'entryLimit', read: () => useInputHistoryStore.getState().entryLimit, write: (v) => useInputHistoryStore.getState().applyEntryLimit(v), autoSave: false },
 }),
 draftStarters: field<DraftStarterRef[]>({
  scope: 'profile',
  effect: ['server', 'store', 'ui'],
  parse: parseDraftStarters,
  ui: {
   read: () => useUIStore.getState().globalDraftStarters ?? undefined,
   write: (value, snapshot) => useUIStore.getState().setGlobalDraftStarters(withOfferedBuiltInStarters(value, snapshot)),
   // useDraftStarters writes the list together with its markers.
   autoSave: false,
  },
 }),
 draftStartersVisible: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('draftStartersVisible', (v) => useUIStore.getState().setDraftStartersVisible(v)) }),
 draftStartersCraftGoalAdded: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
 draftStartersScheduleTaskAdded: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean }),
||||||| bc50ba56aa
  // ── Models and agents (profile) ──
  defaultModel: field({ scope: 'profile', parse: parseNonEmptyString }),
  defaultVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  defaultAgent: field({ scope: 'profile', parse: parseNonEmptyString }),
  smallModelUseDefault: field({ scope: 'profile', parse: parseBoolean }),
  smallModelOverride: field({ scope: 'profile', parse: parseNonEmptyString }),
  smallModelVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  walkthroughModelOverride: field({ scope: 'profile', parse: parseNonEmptyString }),
  walkthroughModelVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  // Read by the server when a provider's usage limit is hit (lib/limit-failover).
  fallbackModel: field({ scope: 'profile', parse: parseNonEmptyString }),
  fallbackVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  accountSwitchProviders: field({ scope: 'profile', parse: parseStringSet }),
  zenModel: field({ scope: 'profile', parse: parseNonEmptyTrimmedString }),
  // The model-prefs auto-save owns these with its own debounce.
  favoriteModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(64), ui: uiStore('favoriteModels', setUi('favoriteModels'), { autoSave: false }) }),
  hiddenModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(1024), ui: uiStore('hiddenModels', setUi('hiddenModels'), { autoSave: false }) }),
  collapsedModelProviders: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('collapsedModelProviders', setUi('collapsedModelProviders'), { autoSave: false }) }),
  customProviderIcons: field({ scope: 'profile', parse: parseCustomProviderIcons, ui: uiStore('customProviderIcons', setUi('customProviderIcons'), { autoSave: false }) }),
  // Written by the server's provider logo routes along with the image file.
  customProviderLogos: field({ scope: 'profile', parse: parseCustomProviderLogos, ui: uiStore('customProviderLogos', setUi('customProviderLogos'), { autoSave: false }) }),
  recentModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(16), ui: uiStore('recentModels', setUi('recentModels'), { autoSave: false }) }),
  lastSelectedModel: field({ scope: 'profile', parse: parseNonEmptyString, ui: uiStore('lastSelectedModel', setUi('lastSelectedModel')) }),
  recentAgents: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('recentAgents', setUi('recentAgents'), { autoSave: false }) }),
  favoriteAgents: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('favoriteAgents', setUi('favoriteAgents'), { autoSave: false }) }),
  recentEfforts: field({ scope: 'profile', parse: parseRecentEfforts, ui: uiStore('recentEfforts', setUi('recentEfforts'), { autoSave: false }) }),
  lastUsedEfforts: field({ scope: 'profile', parse: parseLastUsedEfforts, ui: uiStore('lastUsedEfforts', setUi('lastUsedEfforts'), { autoSave: false }) }),
  providerOrder: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('providerOrder', (v) => useUIStore.getState().setProviderOrder(v)) }),
=======
  defaultModel: field({ scope: 'profile', parse: parseNonEmptyString }),
  defaultVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  defaultAgent: field({ scope: 'profile', parse: parseNonEmptyString }),
  smallModelUseDefault: field({ scope: 'profile', parse: parseBoolean }),
  smallModelOverride: field({ scope: 'profile', parse: parseNonEmptyString }),
  smallModelVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  walkthroughModelOverride: field({ scope: 'profile', parse: parseNonEmptyString }),
  walkthroughModelVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  fallbackModel: field({ scope: 'profile', parse: parseNonEmptyString }),
  fallbackVariant: field({ scope: 'profile', parse: parseNonEmptyString }),
  accountSwitchProviders: field({ scope: 'profile', parse: parseStringSet }),
  zenModel: field({ scope: 'profile', parse: parseNonEmptyTrimmedString }),
  favoriteModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(64), ui: uiStore('favoriteModels', setUi('favoriteModels'), { autoSave: false }) }),
  hiddenModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(1024), ui: uiStore('hiddenModels', setUi('hiddenModels'), { autoSave: false }) }),
  collapsedModelProviders: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('collapsedModelProviders', setUi('collapsedModelProviders'), { autoSave: false }) }),
  customProviderIcons: field({ scope: 'profile', parse: parseCustomProviderIcons, ui: uiStore('customProviderIcons', setUi('customProviderIcons'), { autoSave: false }) }),
  customProviderLogos: field({ scope: 'profile', parse: parseCustomProviderLogos, ui: uiStore('customProviderLogos', setUi('customProviderLogos'), { autoSave: false }) }),
  recentModels: field<ModelRef[]>({ scope: 'profile', parse: parseModelRefs(16), ui: uiStore('recentModels', setUi('recentModels'), { autoSave: false }) }),
  lastSelectedModel: field({ scope: 'profile', parse: parseNonEmptyString, ui: uiStore('lastSelectedModel', setUi('lastSelectedModel')) }),
  recentAgents: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('recentAgents', setUi('recentAgents'), { autoSave: false }) }),
  favoriteAgents: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('favoriteAgents', setUi('favoriteAgents'), { autoSave: false }) }),
  recentEfforts: field({ scope: 'profile', parse: parseRecentEfforts, ui: uiStore('recentEfforts', setUi('recentEfforts'), { autoSave: false }) }),
  lastUsedEfforts: field({ scope: 'profile', parse: parseLastUsedEfforts, ui: uiStore('lastUsedEfforts', setUi('lastUsedEfforts'), { autoSave: false }) }),
  providerOrder: field({ scope: 'profile', parse: parseStringSet, ui: uiStore('providerOrder', (v) => useUIStore.getState().setProviderOrder(v)) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Typography (profile; sizes per surface) ──
 fontSize: field({ scope: 'profile', effect: ['store', 'ui'], perSurface: true, parse: parseFiniteNumber, ui: uiStore('fontSize', (v) => useUIStore.getState().setFontSize(v)) }),
 chatFontSize: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseFiniteNumber, ui: uiStore('chatFontSize', (v) => useUIStore.getState().setChatFontSize(v)) }),
 terminalFontSize: field({ scope: 'profile', effect: ['store', 'ui'], perSurface: true, parse: parseFiniteNumber, ui: uiStore('terminalFontSize', (v) => useUIStore.getState().setTerminalFontSize(v)) }),
 editorFontSize: field({ scope: 'profile', effect: ['ui'], perSurface: true, parse: parseFiniteNumber, ui: uiStore('editorFontSize', (v) => useUIStore.getState().setEditorFontSize(v)) }),
 uiFont: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseUiFont, ui: uiStore('uiFont', (v) => useUIStore.getState().setUiFont(v)) }),
 monoFont: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseMonoFont, ui: uiStore('monoFont', (v) => useUIStore.getState().setMonoFont(v)) }),
 customUiFont: field({ scope: 'profile', effect: ['ui'], parse: parseTextUpTo(100), ui: uiStore('customUiFont', (v) => useUIStore.getState().setCustomUiFont(v)) }),
 customMonoFont: field({ scope: 'profile', effect: ['ui'], parse: parseTextUpTo(100), ui: uiStore('customMonoFont', (v) => useUIStore.getState().setCustomMonoFont(v)) }),
 uiFontWeight: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(UI_FONT_WEIGHT_OPTIONS), ui: uiStore('uiFontWeight', (v) => useUIStore.getState().setUiFontWeight(v)) }),
 padding: field({ scope: 'profile', effect: ['server', 'store', 'ui'], perSurface: true, parse: parseFiniteNumber, ui: uiStore('padding', (v) => useUIStore.getState().setPadding(v)) }),
 shortcutOverrides: field({
  scope: 'profile',
  effect: ['store', 'ui'],
  parse: parseShortcutOverrides,
  ui: uiStore('shortcutOverrides', setUi('shortcutOverrides')),
 }),
||||||| bc50ba56aa
  // ── Sessions and summaries (profile) ──
  sessionRecapEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionRecapEnabled', (v) => useUIStore.getState().setSessionRecapEnabled(v)) }),
  sessionSuggestionEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionSuggestionEnabled', (v) => useUIStore.getState().setSessionSuggestionEnabled(v)) }),
  sessionWorkEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionWorkEnabled', (v) => useUIStore.getState().setSessionWorkEnabled(v)) }),
  sessionReviewOfferEnabled: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('sessionReviewOfferEnabled', (v) => useUIStore.getState().setSessionReviewOfferEnabled(v)) }),
  sessionGoalEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionGoalEnabled', (v) => useUIStore.getState().setSessionGoalEnabled(v)) }),
  // Who checks goal progress. The goal loop runs on the OpenChamber server,
  // which VS Code does not have.
  sessionGoalChecker: field({
    scope: 'profile',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseOneOf(['classifier', 'small-model']),
    ui: uiStore('sessionGoalChecker', (v) => useUIStore.getState().setSessionGoalChecker(v)),
  }),
  sessionGoalMaxAutoTurns: field({
    scope: 'profile',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: fromSchema(z.number().refine(isSessionGoalMaxAutoTurns)),
    ui: uiStore('sessionGoalMaxAutoTurns', (v) => useUIStore.getState().setSessionGoalMaxAutoTurns(v)),
  }),
  sessionGoalDefaultBudgetEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionGoalDefaultBudgetEnabled', (v) => useUIStore.getState().setSessionGoalDefaultBudgetEnabled(v)) }),
  sessionGoalDefaultBudget: field({ scope: 'profile', parse: parsePositiveInteger, ui: uiStore('sessionGoalDefaultBudget', (v) => useUIStore.getState().setSessionGoalDefaultBudget(v)) }),
  summarizeLastMessage: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('summarizeLastMessage', (v) => useUIStore.getState().setSummarizeLastMessage(v)) }),
  summaryThreshold: field({ scope: 'profile', parse: parseIntegerAtLeast(0), ui: uiStore('summaryThreshold', (v) => useUIStore.getState().setSummaryThreshold(v)) }),
  summaryLength: field({ scope: 'profile', parse: parseIntegerAtLeast(10), ui: uiStore('summaryLength', (v) => useUIStore.getState().setSummaryLength(v)) }),
  maxLastMessageLength: field({ scope: 'profile', parse: parseIntegerAtLeast(10), ui: uiStore('maxLastMessageLength', (v) => useUIStore.getState().setMaxLastMessageLength(v)) }),
  showDeletionDialog: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showDeletionDialog', (v) => useUIStore.getState().setShowDeletionDialog(v)) }),
=======
  sessionRecapEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionRecapEnabled', (v) => useUIStore.getState().setSessionRecapEnabled(v)) }),
  sessionSuggestionEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionSuggestionEnabled', (v) => useUIStore.getState().setSessionSuggestionEnabled(v)) }),
  sessionWorkEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionWorkEnabled', (v) => useUIStore.getState().setSessionWorkEnabled(v)) }),
  sessionReviewOfferEnabled: field({ scope: 'profile', surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('sessionReviewOfferEnabled', (v) => useUIStore.getState().setSessionReviewOfferEnabled(v)) }),
  sessionGoalEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionGoalEnabled', (v) => useUIStore.getState().setSessionGoalEnabled(v)) }),
  sessionGoalChecker: field({
    scope: 'profile',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: parseOneOf(['classifier', 'small-model']),
    ui: uiStore('sessionGoalChecker', (v) => useUIStore.getState().setSessionGoalChecker(v)),
  }),
  sessionGoalMaxAutoTurns: field({
    scope: 'profile',
    surfaces: ['web', 'desktop', 'mobile'],
    parse: fromSchema(z.number().refine(isSessionGoalMaxAutoTurns)),
    ui: uiStore('sessionGoalMaxAutoTurns', (v) => useUIStore.getState().setSessionGoalMaxAutoTurns(v)),
  }),
  sessionGoalDefaultBudgetEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('sessionGoalDefaultBudgetEnabled', (v) => useUIStore.getState().setSessionGoalDefaultBudgetEnabled(v)) }),
  sessionGoalDefaultBudget: field({ scope: 'profile', parse: parsePositiveInteger, ui: uiStore('sessionGoalDefaultBudget', (v) => useUIStore.getState().setSessionGoalDefaultBudget(v)) }),
  summarizeLastMessage: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('summarizeLastMessage', (v) => useUIStore.getState().setSummarizeLastMessage(v)) }),
  summaryThreshold: field({ scope: 'profile', parse: parseIntegerAtLeast(0), ui: uiStore('summaryThreshold', (v) => useUIStore.getState().setSummaryThreshold(v)) }),
  summaryLength: field({ scope: 'profile', parse: parseIntegerAtLeast(10), ui: uiStore('summaryLength', (v) => useUIStore.getState().setSummaryLength(v)) }),
  maxLastMessageLength: field({ scope: 'profile', parse: parseIntegerAtLeast(10), ui: uiStore('maxLastMessageLength', (v) => useUIStore.getState().setMaxLastMessageLength(v)) }),
  showDeletionDialog: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showDeletionDialog', (v) => useUIStore.getState().setShowDeletionDialog(v)) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Models and agents (profile) ──
 // New-session model and thinking level belong to OMP (`modelRoles.default`,
 // `defaultThinkingLevel`); the app no longer keeps a second default.
 zenModel: field({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseNonEmptyTrimmedString }),
 // The model-prefs auto-save owns these six with its own debounce.
 favoriteModels: field<ModelRef[]>({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseModelRefs(64), ui: uiStore('favoriteModels', setUi('favoriteModels'), { autoSave: false }) }),
 hiddenModels: field<ModelRef[]>({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseModelRefs(1024), ui: uiStore('hiddenModels', setUi('hiddenModels'), { autoSave: false }) }),
 customProviderIcons: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseCustomProviderIcons, ui: uiStore('customProviderIcons', setUi('customProviderIcons'), { autoSave: false }) }),
 // Written by the server's provider logo routes along with the image file.
 customProviderLogos: field({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseCustomProviderLogos, ui: uiStore('customProviderLogos', setUi('customProviderLogos'), { autoSave: false }) }),
 recentModels: field<ModelRef[]>({ scope: 'profile', effect: ['server', 'store', 'ui'], parse: parseModelRefs(16), ui: uiStore('recentModels', setUi('recentModels'), { autoSave: false }) }),
 lastSelectedModel: field({ scope: 'profile', effect: ['store'], parse: parseNonEmptyString, ui: uiStore('lastSelectedModel', setUi('lastSelectedModel')) }),
 favoriteAgents: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseStringSet, ui: uiStore('favoriteAgents', setUi('favoriteAgents'), { autoSave: false }) }),
 lastUsedEfforts: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseLastUsedEfforts, ui: uiStore('lastUsedEfforts', setUi('lastUsedEfforts'), { autoSave: false }) }),
 providerOrder: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseStringSet, ui: uiStore('providerOrder', (v) => useUIStore.getState().setProviderOrder(v)) }),
||||||| bc50ba56aa
  // ── Notifications (profile) ──
  nativeNotificationsEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('nativeNotificationsEnabled', (v) => useUIStore.getState().setNativeNotificationsEnabled(v)) }),
  notificationMode: field({ scope: 'profile', parse: parseOneOf(['always', 'hidden-only']), ui: uiStore('notificationMode', (v) => useUIStore.getState().setNotificationMode(v)) }),
  notifyOnSubtasks: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnSubtasks', (v) => useUIStore.getState().setNotifyOnSubtasks(v)) }),
  notifyOnCompletion: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnCompletion', (v) => useUIStore.getState().setNotifyOnCompletion(v)) }),
  notifyOnPullRequests: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnPullRequests', (v) => useUIStore.getState().setNotifyOnPullRequests(v)) }),
  notifyOnError: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnError', (v) => useUIStore.getState().setNotifyOnError(v)) }),
  notifyOnQuestion: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnQuestion', (v) => useUIStore.getState().setNotifyOnQuestion(v)) }),
  notificationTemplates: field<NotificationTemplates>({
    scope: 'profile',
    parse: parseNotificationTemplates,
    ui: uiStore('notificationTemplates', (v) => useUIStore.getState().setNotificationTemplates(v)),
  }),
  showOpenCodeUpdateNotifications: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showOpenCodeUpdateNotifications', (v) => useUIStore.getState().setShowOpenCodeUpdateNotifications(v)) }),
  reportUsage: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('reportUsage', (v) => useUIStore.getState().setReportUsage(v)) }),
=======
  nativeNotificationsEnabled: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('nativeNotificationsEnabled', (v) => useUIStore.getState().setNativeNotificationsEnabled(v)) }),
  notificationMode: field({ scope: 'profile', parse: parseOneOf(['always', 'hidden-only']), ui: uiStore('notificationMode', (v) => useUIStore.getState().setNotificationMode(v)) }),
  notifyOnSubtasks: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnSubtasks', (v) => useUIStore.getState().setNotifyOnSubtasks(v)) }),
  notifyOnCompletion: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnCompletion', (v) => useUIStore.getState().setNotifyOnCompletion(v)) }),
  notifyOnPullRequests: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnPullRequests', (v) => useUIStore.getState().setNotifyOnPullRequests(v)) }),
  notifyOnError: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnError', (v) => useUIStore.getState().setNotifyOnError(v)) }),
  notifyOnQuestion: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('notifyOnQuestion', (v) => useUIStore.getState().setNotifyOnQuestion(v)) }),
  notificationTemplates: field<NotificationTemplates>({
    scope: 'profile',
    parse: parseNotificationTemplates,
    ui: uiStore('notificationTemplates', (v) => useUIStore.getState().setNotificationTemplates(v)),
  }),
  showOpenCodeUpdateNotifications: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('showOpenCodeUpdateNotifications', (v) => useUIStore.getState().setShowOpenCodeUpdateNotifications(v)) }),
  reportUsage: field({ scope: 'profile', parse: parseBoolean, ui: uiStore('reportUsage', (v) => useUIStore.getState().setReportUsage(v)) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Sessions and summaries (profile) ──
 sessionRecapEnabled: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('sessionRecapEnabled', (v) => useUIStore.getState().setSessionRecapEnabled(v)) }),
 suggestionGenerator: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['session', 'small', 'off'] as const), ui: uiStore('suggestionGenerator', (v) => useUIStore.getState().setSuggestionGenerator(v)) }),
 sessionWorkEnabled: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('sessionWorkEnabled', (v) => useUIStore.getState().setSessionWorkEnabled(v)) }),
 sessionWorkAutoOpen: field({ scope: 'profile', effect: ['server', 'ui'], surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('sessionWorkAutoOpen', (v) => useUIStore.getState().setSessionWorkAutoOpen(v)) }),
 sessionReviewOfferEnabled: field({ scope: 'profile', effect: ['server', 'ui'], surfaces: ['web', 'desktop', 'mobile'], parse: parseBoolean, ui: uiStore('sessionReviewOfferEnabled', (v) => useUIStore.getState().setSessionReviewOfferEnabled(v)) }),
 sessionGoalDefaultBudgetEnabled: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('sessionGoalDefaultBudgetEnabled', (v) => useUIStore.getState().setSessionGoalDefaultBudgetEnabled(v)) }),
 sessionGoalDefaultBudget: field({ scope: 'profile', effect: ['server', 'ui'], parse: parsePositiveInteger, ui: uiStore('sessionGoalDefaultBudget', (v) => useUIStore.getState().setSessionGoalDefaultBudget(v)) }),
 maxLastMessageLength: field({ scope: 'profile', effect: ['server'], parse: parseIntegerAtLeast(10), ui: uiStore('maxLastMessageLength', (v) => useUIStore.getState().setMaxLastMessageLength(v)) }),
 showDeletionDialog: field({ scope: 'profile', effect: ['ui'], parse: parseBoolean, ui: uiStore('showDeletionDialog', (v) => useUIStore.getState().setShowDeletionDialog(v)) }),
 defaultSessionMode: field({ scope: 'profile', effect: ['ui'], parse: parseOneOf(['main', 'plan', 'vibe', 'goal']), ui: uiStore('defaultSessionMode', (v) => useUIStore.getState().setDefaultSessionMode(v)) }),
||||||| bc50ba56aa
  // ── Usage page (profile; the page reads and writes these itself) ──
  usageDisplayMode: field({ scope: 'profile', parse: parseOneOf(['usage', 'remaining']) }),
  usageDropdownProviders: field({ scope: 'profile', parse: parseStringList }),
  usageSelectedModels: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageCollapsedFamilies: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageExpandedFamilies: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageModelGroups: field<UsageModelGroups>({ scope: 'profile', parse: parseUsageModelGroups }),
=======
  usageDisplayMode: field({ scope: 'profile', parse: parseOneOf(['usage', 'remaining']) }),
  usageDropdownProviders: field({ scope: 'profile', parse: parseStringList }),
  usageSelectedModels: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageCollapsedFamilies: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageExpandedFamilies: field({ scope: 'profile', parse: parseStringRecordOfStringLists }),
  usageModelGroups: field<UsageModelGroups>({ scope: 'profile', parse: parseUsageModelGroups }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Notifications (profile) ──
 nativeNotificationsEnabled: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('nativeNotificationsEnabled', (v) => useUIStore.getState().setNativeNotificationsEnabled(v)) }),
 notificationMode: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseOneOf(['always', 'hidden-only']), ui: uiStore('notificationMode', (v) => useUIStore.getState().setNotificationMode(v)) }),
 notifyOnSubtasks: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('notifyOnSubtasks', (v) => useUIStore.getState().setNotifyOnSubtasks(v)) }),
 notifyOnCompletion: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('notifyOnCompletion', (v) => useUIStore.getState().setNotifyOnCompletion(v)) }),
 notifyOnError: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('notifyOnError', (v) => useUIStore.getState().setNotifyOnError(v)) }),
 notifyOnQuestion: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('notifyOnQuestion', (v) => useUIStore.getState().setNotifyOnQuestion(v)) }),
 notifyOnPullRequests: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean, ui: uiStore('notifyOnPullRequests', (v) => useUIStore.getState().setNotifyOnPullRequests(v)) }),
 notificationTemplates: field<NotificationTemplates>({
  scope: 'profile',
  effect: ['server', 'store', 'ui'],
  parse: parseNotificationTemplates,
  ui: uiStore('notificationTemplates', (v) => useUIStore.getState().setNotificationTemplates(v)),
 }),
||||||| bc50ba56aa
  // ── Behavior (profile) ──
  globalBehaviorPrompt: field({ scope: 'profile', parse: parseTextUpTo(1024 * 1024) }),
  responseStyleEnabled: field({ scope: 'profile', parse: parseBoolean }),
  responseStylePreset: field({ scope: 'profile', parse: parseOneOf(RESPONSE_STYLE_PRESETS) }),
  responseStyleCustomInstructions: field({ scope: 'profile', parse: parseTextUpTo(50_000) }),
=======
  globalBehaviorPrompt: field({ scope: 'profile', parse: parseTextUpTo(1024 * 1024) }),
  responseStyleEnabled: field({ scope: 'profile', parse: parseBoolean }),
  responseStylePreset: field({ scope: 'profile', parse: parseOneOf(RESPONSE_STYLE_PRESETS) }),
  responseStyleCustomInstructions: field({ scope: 'profile', parse: parseTextUpTo(50_000) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Usage page (profile; the page reads and writes these itself) ──
 usageDisplayMode: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseOneOf(['usage', 'remaining']) }),
 usageDropdownProviders: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseStringList }),
 usageSelectedModels: field({ scope: 'profile', effect: ['store', 'ui'], parse: parseStringRecordOfStringLists }),
 usageExpandedFamilies: field({ scope: 'profile', effect: ['store'], parse: parseStringRecordOfStringLists }),
||||||| bc50ba56aa
  // The server serves the PWA manifest from these, so they are facts about
  // the instance even though only the installed web app shows them.
  pwaAppName: field({ scope: 'instance', surfaces: ['web'], parse: parsePwaAppName }),
  pwaOrientation: field({ scope: 'instance', surfaces: ['web'], parse: parseOneOf(['system', 'portrait', 'landscape']) }),
=======
  pwaAppName: field({ scope: 'instance', surfaces: ['web'], parse: parsePwaAppName }),
  pwaOrientation: field({ scope: 'instance', surfaces: ['web'], parse: parseOneOf(['system', 'portrait', 'landscape']) }),
>>>>>>> upstream/main

<<<<<<< HEAD
 // ── Behavior page (profile; the page writes these itself) ──
 // AGENTS.md rules live in the files OMP loads natively; only the resolved
 // response-style instruction travels with a prompt.
 // The resolved instruction of the selected preset. `default` and a blank
 // custom preset store '' — the zero-injection case.
 responseStyleInstruction: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseTextUpTo(100_000) }),
 responseStyleEnabled: field({ scope: 'profile', effect: ['server', 'ui'], parse: parseBoolean }),
 responseStylePreset: field({ scope: 'profile', effect: ['ui'], parse: parseResponseStylePreset }),
 responseStyleCustomInstructions: field({ scope: 'profile', effect: ['ui'], parse: parseTextUpTo(50_000) }),

 // The server serves the PWA manifest from these, so they are facts about
 // the instance even though only the installed web app shows them.
 pwaAppName: field({ scope: 'instance', effect: ['server', 'ui'], surfaces: ['web'], parse: parsePwaAppName }),
 pwaOrientation: field({ scope: 'instance', effect: ['server', 'ui'], surfaces: ['web'], parse: parseOneOf(['system', 'portrait', 'landscape']) }),

 // ── Device fields: never written to the server; an old settings.json that
 // still carries one is read once as a seed for the local store. ──
 mobileKeyboardMode: field({
  scope: 'device',
  effect: ['store', 'ui'],
  surfaces: ['mobile'],
  parse: parseMobileKeyboardModeValue,
  ui: uiStore('mobileKeyboardMode', (v) => useUIStore.getState().setMobileKeyboardMode(v)),
 }),
 desktopWindowControlsPosition: field<DesktopWindowControlsPosition>({
  scope: 'device',
  effect: ['store', 'ui'],
  surfaces: ['desktop'],
  parse: parseDesktopWindowControlsPosition,
  ui: uiStore('desktopWindowControlsPosition', (v) => useUIStore.getState().setDesktopWindowControlsPosition(v)),
 }),
 desktopWindowControlsStyle: field<DesktopWindowControlsStyle>({
  scope: 'device',
  effect: ['ui'],
  surfaces: ['desktop'],
  parse: parseOneOf(['classic', 'traffic-lights']),
  ui: uiStore('desktopWindowControlsStyle', (v) => useUIStore.getState().setDesktopWindowControlsStyle(v)),
 }),
 inputBarOffset: field({ scope: 'device', effect: ['ui'], surfaces: ['mobile', 'web'], parse: parseFiniteNumber, ui: uiStore('inputBarOffset', (v) => useUIStore.getState().setInputBarOffset(v)) }),
||||||| bc50ba56aa
  // ── Device fields: never written to the server; an old settings.json that
  // still carries one is read once as a seed for the local store. ──
  mobileKeyboardMode: field({
    scope: 'device',
    surfaces: ['mobile'],
    parse: parseMobileKeyboardModeValue,
    ui: uiStore('mobileKeyboardMode', (v) => useUIStore.getState().setMobileKeyboardMode(v)),
  }),
  desktopWindowControlsPosition: field<DesktopWindowControlsPosition>({
    scope: 'device',
    surfaces: ['desktop'],
    parse: parseDesktopWindowControlsPosition,
    ui: uiStore('desktopWindowControlsPosition', (v) => useUIStore.getState().setDesktopWindowControlsPosition(v)),
  }),
  desktopWindowControlsStyle: field<DesktopWindowControlsStyle>({
    scope: 'device',
    surfaces: ['desktop'],
    parse: parseOneOf(['classic', 'traffic-lights']),
    ui: uiStore('desktopWindowControlsStyle', (v) => useUIStore.getState().setDesktopWindowControlsStyle(v)),
  }),
  inputBarOffset: field({ scope: 'device', surfaces: ['mobile', 'web'], parse: parseFiniteNumber, ui: uiStore('inputBarOffset', (v) => useUIStore.getState().setInputBarOffset(v)) }),
=======
  mobileKeyboardMode: field({
    scope: 'device',
    surfaces: ['mobile'],
    parse: parseMobileKeyboardModeValue,
    ui: uiStore('mobileKeyboardMode', (v) => useUIStore.getState().setMobileKeyboardMode(v)),
  }),
  desktopWindowControlsPosition: field<DesktopWindowControlsPosition>({
    scope: 'device',
    surfaces: ['desktop'],
    parse: parseDesktopWindowControlsPosition,
    ui: uiStore('desktopWindowControlsPosition', (v) => useUIStore.getState().setDesktopWindowControlsPosition(v)),
  }),
  desktopWindowControlsStyle: field<DesktopWindowControlsStyle>({
    scope: 'device',
    surfaces: ['desktop'],
    parse: parseOneOf(['classic', 'traffic-lights']),
    ui: uiStore('desktopWindowControlsStyle', (v) => useUIStore.getState().setDesktopWindowControlsStyle(v)),
  }),
  inputBarOffset: field({ scope: 'device', surfaces: ['mobile', 'web'], parse: parseFiniteNumber, ui: uiStore('inputBarOffset', (v) => useUIStore.getState().setInputBarOffset(v)) }),
>>>>>>> upstream/main
} as const;

type SettingsKey = keyof typeof SETTINGS_REGISTRY;

type FieldValue<S> = S extends SettingsFieldSpec<infer T> ? T : never;

export type DesktopSettings = { -readonly [K in SettingsKey]?: FieldValue<(typeof SETTINGS_REGISTRY)[K]> };

export const LOCAL_DEVICE_KEYS = [
<<<<<<< HEAD
 'theme',
 'isSidebarOpen',
 'sidebarWidth',
 'contextPanelByDirectory',
 'contextRailOrder',
 'contextRailHiddenSurfaces',
 'mobileWorkspaceTabOrder',
 'mobileWorkspaceHiddenTabs',
 'mobileWorkStatusHiddenSections',
 'contextEditorTreeVisible',
 'contextEditorVisible',
 'contextEditorTreeWidth',
 'workStatusExpandedSections',
 'messageQueueExpanded',
 'workStatusScrollTop',
 'isSessionSwitcherOpen',
 'settingsPage',
 'settingsHasOpenedOnce',
 'settingsProjectsSelectedId',
 'settingsRemoteInstancesSelectedId',
 'autoDeleteLastRunAt',
 'walkthroughTocWidth',
 'diffFileListMode',
 'diffFileTreeWidth',
 'showTerminalQuickKeysOnDesktop',
 'dockBadgeEnabled',
 'alwaysShowScrollbars',
 // Workspace zones (task 09): device layout, not settings.
 'sidebarFoldedForExpandedZone',
 'contextSurfaceZones',
 'fileTreeSide',
 'contextZoneSizes',
 'contextZoneExpandedChatSizes',
||||||| bc50ba56aa
  'theme',
  'isSidebarOpen',
  'sidebarFoldedForExpandedZone',
  'sidebarWidth',
  'contextPanelByDirectory',
  'contextZoneSizes',
  'contextZoneExpandedChatSizes',
  'contextRailOrder',
  'contextRailHiddenSurfaces',
  'mobileWorkspaceTabOrder',
  'mobileWorkspaceHiddenTabs',
  'mobileWorkStatusHiddenSections',
  'contextSurfaceZones',
  'contextEditorTreeVisible',
  'contextEditorVisible',
  'contextEditorTreeWidth',
  'workStatusExpandedSections',
  'messageQueueExpanded',
  'workStatusScrollTop',
  'isSessionSwitcherOpen',
  'sidebarSection',
  'settingsPage',
  'settingsHasOpenedOnce',
  'settingsProjectsSelectedId',
  'settingsRemoteInstancesSelectedId',
  'isSessionCreateDialogOpen',
  'autoDeleteLastRunAt',
  'messageLimit',
  'walkthroughTocWidth',
  'diffFileListMode',
  'diffFileTreeWidth',
  'showTerminalQuickKeysOnDesktop',
  'dockBadgeEnabled',
  'alwaysShowScrollbars',
  'agentMemoryViewedAt',
=======
  'theme',
  'isSidebarOpen',
  'sidebarFoldedForExpandedZone',
  'sidebarWidth',
  'contextPanelByDirectory',
  'contextZoneSizes',
  'contextZoneExpandedChatSizes',
  'contextRailOrder',
  'contextRailHiddenSurfaces',
  'mobileWorkspaceTabOrder',
  'mobileWorkspaceHiddenTabs',
  'mobileWorkStatusHiddenSections',
  'contextSurfaceZones',
  'contextEditorTreeVisible',
  'contextEditorVisible',
  'contextEditorTreeWidth',
  'workStatusExpandedSections',
  'messageQueueExpanded',
  'workStatusScrollTop',
  'isSessionSwitcherOpen',
  'sidebarSection',
  'settingsPage',
  'settingsHasOpenedOnce',
  'settingsProjectsSelectedId',
  'settingsRemoteInstancesSelectedId',
  'isSessionCreateDialogOpen',
  'autoDeleteLastRunAt',
  'messageLimit',
  'walkthroughTocWidth',
  'diffFileListMode',
  'diffFileTreeWidth',
  'showTerminalQuickKeysOnDesktop',
  'dockBadgeEnabled',
  'alwaysShowScrollbars',
  'mobileKeepScreenAwake',
  'questionsInChat',
  'agentMemoryViewedAt',
>>>>>>> upstream/main
] as const;

export const DESKTOP_SHELL_KEYS = [
 'desktopSplashColors',
 'desktopHosts',
 'desktopDefaultHostId',
 'desktopInstallId',
 'desktopLocalPort',
 'desktopSshInstances',
 'desktopWindowState',
] as const;

const isSettingsKey = (key: string): key is SettingsKey => Object.prototype.hasOwnProperty.call(SETTINGS_REGISTRY, key);

export const SETTINGS_KEYS: SettingsKey[] = Object.keys(SETTINGS_REGISTRY).filter(isSettingsKey);

export const isDeviceSettingsKey = (key: SettingsKey): boolean => SETTINGS_REGISTRY[key].scope === 'device';

type SettingsValue = DesktopSettings[SettingsKey];

const specOf = (key: SettingsKey): SettingsFieldSpec<SettingsValue> => SETTINGS_REGISTRY[key];

export const isWritableSettingsKey = (key: SettingsKey): boolean => !SETTINGS_REGISTRY[key].computed && !isDeviceSettingsKey(key);

const rawDocumentSchema = z.record(z.string(), z.unknown());

export const parseSettingsDocument = (payload: unknown): DesktopSettings | null => {
 const document = rawDocumentSchema.safeParse(payload);
 if (!document.success) {
  return null;
 }
 const raw = document.data;
 if (raw.sessionWorkKeepInGroup !== undefined && raw.sidebarKeepWorkInPlace === undefined) {
  raw.sidebarKeepWorkInPlace = raw.sessionWorkKeepInGroup;
 }
 const result: DesktopSettings = {};
 for (const key of SETTINGS_KEYS) {
  const spec = specOf(key);
  const parsed = spec.parse(raw[key], raw);
  if (parsed !== undefined) {
   Object.assign(result, { [key]: parsed });
  }
 }
 return result;
};

const isSameValue = (left: SettingsValue, right: SettingsValue): boolean => {
 if (left === right) return true;
 if (left === undefined || right === undefined) return false;
 return JSON.stringify(left) === JSON.stringify(right);
};

export const applySettingsToStores = (snapshot: DesktopSettings): void => {
 for (const key of SETTINGS_KEYS) {
  const spec = specOf(key);
  if (!spec.ui) continue;
  const value = snapshot[key];
  if (value === undefined) continue;
  if (isSameValue(spec.ui.read(), value)) continue;
  spec.ui.write(value, snapshot);
 }
};

export const AUTO_SAVE_KEYS = SETTINGS_KEYS.filter((key) => {
 const spec = specOf(key);
 return spec.ui?.autoSave === true;
});

export const readAutoSaveSnapshot = (): DesktopSettings => {
 const snapshot: DesktopSettings = {};
 for (const key of AUTO_SAVE_KEYS) {
  const spec = specOf(key);
  const value = spec.ui?.read();
  if (value !== undefined) Object.assign(snapshot, { [key]: value });
 }
 return snapshot;
};

export const MIRRORED_KEYS = SETTINGS_KEYS.filter((key) => {
 const spec = specOf(key);
 return spec.scope !== 'device' && !spec.secret && !spec.computed;
});

<<<<<<< HEAD
/** Shape of one field in the generated JSON snapshot the server consumes. */
||||||| bc50ba56aa
/** Shape of one field in the generated JSON snapshot the server and the VS Code bridge consume. */
=======
>>>>>>> upstream/main
type SettingsRegistrySnapshotField = {
<<<<<<< HEAD
 scope: SettingsScope;
 perSurface?: true;
 surfaces?: readonly SettingsSurface[];
 adopt?: 'bootstrap-only';
 derived?: true;
 secret?: true;
 computed?: true;
 /** Lives only in the local store; never crosses the wire. */
 local?: true;
 /** Written by the desktop shell straight into the file; never by a client. */
 owner?: 'desktop-shell';
||||||| bc50ba56aa
  scope: SettingsScope;
  perSurface?: true;
  surfaces?: readonly SettingsSurface[];
  adopt?: 'bootstrap-only';
  derived?: true;
  secret?: true;
  computed?: true;
  /** Lives only in the local store; never crosses the wire. */
  local?: true;
  /** Written by the desktop shell straight into the file; never by a client. */
  owner?: 'desktop-shell';
=======
  scope: SettingsScope;
  perSurface?: true;
  surfaces?: readonly SettingsSurface[];
  adopt?: 'bootstrap-only';
  derived?: true;
  secret?: true;
  computed?: true;
  local?: true;
  owner?: 'desktop-shell';
>>>>>>> upstream/main
};

type SettingsRegistrySnapshot = {
 version: 1;
 fields: Record<string, SettingsRegistrySnapshotField>;
};

export const buildSettingsRegistrySnapshot = (): SettingsRegistrySnapshot => {
 const fields: Record<string, SettingsRegistrySnapshotField> = {};
 for (const key of SETTINGS_KEYS) {
  const spec = specOf(key);
  const entry: SettingsRegistrySnapshotField = { scope: spec.scope };
  if (spec.perSurface) entry.perSurface = true;
  if (spec.surfaces) entry.surfaces = spec.surfaces;
  if (spec.adopt) entry.adopt = spec.adopt;
  if (spec.derived) entry.derived = true;
  if (spec.secret) entry.secret = true;
  if (spec.computed) entry.computed = true;
  fields[key] = entry;
 }
 for (const key of LOCAL_DEVICE_KEYS) {
  fields[key] = { scope: 'device', local: true };
 }
 for (const key of DESKTOP_SHELL_KEYS) {
  fields[key] = { scope: 'instance', owner: 'desktop-shell', surfaces: ['desktop'] };
 }
 return { version: 1, fields };
};
