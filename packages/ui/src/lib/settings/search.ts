
import { canKeepScreenAwake } from '@/lib/platform';
import type { I18nKey } from '@/lib/i18n/store';
import type { SettingsPageSlug, SettingsRuntimeContext } from './metadata';
import { getSettingsPageMeta } from './metadata';
import { getCustomizableShortcutActions } from '@/lib/shortcuts';
import { ompLayoutSettingIds } from '@/components/sections/openchamber/ompSettingsLayout';
import { CHAT_SENDING_SEARCH_ITEMS } from './search-chat-sending';

/** The search anchor of one shortcut's row: the id the Shortcuts page names it by. */
export const shortcutSearchItemId = (actionId: string): string => `shortcuts.action.${actionId}`;

export interface SettingsSearchItem {
  id: string;
  page: SettingsPageSlug;
  titleKey: I18nKey;
  descriptionKey?: I18nKey;
  keywords?: string[];
  isAvailable?: (ctx: SettingsSearchAvailabilityContext) => boolean;
}

export interface SettingsSearchResult extends SettingsSearchItem {
  title: string;
  description: string | null;
  pageTitle: string;
}

export interface SettingsSearchAvailabilityContext extends SettingsRuntimeContext {
  isMobile: boolean;
  isDesktopLocalOrigin: boolean;
  isMac: boolean;
  isWindows: boolean;
  isLinux: boolean;
}

/**
 * One search entry per OMP row the page draws, built from the same layout table
 * the page renders. A hand-kept index drifted to 47 anchors of 132 and left most
 * engine rows unreachable; deriving it here means a row cannot join the page
 * without becoming searchable.
 */
const ompLayoutSearchItems = (): SettingsSearchItem[] => ompLayoutSettingIds().map((settingId) => ({
  id: `omp.${settingId}`,
  page: 'omp' as const,
  titleKey: `settings.omp.items.${settingId}.label` as I18nKey,
  descriptionKey: `settings.omp.items.${settingId}.description` as I18nKey,
}));

/**
 * The settings search index. Every `titleKey`/`descriptionKey` must exist in the
 * English dictionary: a key with no copy resolves to the key itself and shows a
 * raw `settings.…` string, so an entry without copy is dead weight, not a row.
 * `search.test.ts` holds that invariant.
 */
export const SETTINGS_SEARCH_ITEMS: readonly SettingsSearchItem[] = [
  {
    id: 'omp.power.sleepPrevention',
    page: 'general',
    titleKey: 'settings.omp.items.power.sleepPrevention.label',
    descriptionKey: 'settings.omp.items.power.sleepPrevention.description',
  },
  {
    id: 'omp.configFile',
    page: 'omp',
    titleKey: 'settings.omp.configFile.title',
    keywords: ['advanced', 'config.yml', 'config', 'terminal', 'egress', 'settings', 'dynamic', 'omp configuration'],
  },
  {
    id: 'model-roles.section.chat',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.title',
    descriptionKey: 'settings.omp.modelRoles.description',
    keywords: ['model roles', 'roles', 'models', 'thinking effort', 'assignments'],
  },
  ...ompLayoutSearchItems(),
  {
    id: 'omp.modelRoles.memory',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.memory.label',
    descriptionKey: 'settings.omp.modelRoles.role.memory.desc',
    keywords: ['model role', 'memory', 'role'],
  },
  {
    id: 'omp.modelRoles.task',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.task.label',
    descriptionKey: 'settings.omp.modelRoles.role.task.desc',
    keywords: ['model role', 'task', 'role'],
  },
  {
    id: 'omp.modelRoles.advisor',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.advisor.label',
    descriptionKey: 'settings.omp.modelRoles.role.advisor.desc',
    keywords: ['model role', 'advisor', 'role'],
  },
  {
    id: 'omp.modelRoles.vision',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.vision.label',
    descriptionKey: 'settings.omp.modelRoles.role.vision.desc',
    keywords: ['model role', 'role', 'vision', 'image input', 'screenshots'],
  },
  {
    id: 'omp.modelRoles.commit',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.commit.label',
    descriptionKey: 'settings.omp.modelRoles.role.commit.desc',
    keywords: ['model role', 'role', 'commit', 'message', 'commit message model', 'generation', 'pr description'],
  },
  {
    id: 'omp.modelRoles.tiny',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.tiny.label',
    descriptionKey: 'settings.omp.modelRoles.role.tiny.desc',
    keywords: ['model role', 'role', 'tiny', 'classification', 'extraction', 'cheap'],
  },
  {
    id: 'omp.modelRoles.widget',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.widget.label',
    descriptionKey: 'settings.omp.modelRoles.role.widget.desc',
    keywords: ['model role', 'role', 'widget', 'job widgets', 'jobs'],
  },
  {
    id: 'omp.modelRoles.judge',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.judge.label',
    descriptionKey: 'settings.omp.modelRoles.role.judge.desc',
    keywords: ['model role', 'role', 'judge', 'grading', 'evaluation', 'goal check'],
  },
  {
    id: 'omp.modelRoles.image',
    page: 'model-roles',
    titleKey: 'settings.omp.modelRoles.role.image.label',
    descriptionKey: 'settings.omp.modelRoles.role.image.desc',
    keywords: ['model role', 'image', 'role'],
  },
  {
    id: 'omp.autoResume',
    page: 'sessions',
    titleKey: 'settings.omp.items.autoResume.label' as I18nKey,
    descriptionKey: 'settings.omp.items.autoResume.description' as I18nKey,
  },
  {
    id: 'omp.btw.inject',
    page: 'chat',
    titleKey: 'settings.omp.items.btw.inject.label' as I18nKey,
    descriptionKey: 'settings.omp.items.btw.inject.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.enabled',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.enabled.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.ultrathink',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.ultrathink.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.ultrathink.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.chillax',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.chillax.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.chillax.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.orchestrate',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.orchestrate.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.orchestrate.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.workflow',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.workflow.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.workflow.description' as I18nKey,
  },
  {
    id: 'omp.magicKeywords.jevify',
    page: 'chat',
    titleKey: 'settings.omp.items.magicKeywords.jevify.label' as I18nKey,
    descriptionKey: 'settings.omp.items.magicKeywords.jevify.description' as I18nKey,
  },
  {
    id: 'omp.contextPromotion.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.contextPromotion.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.contextPromotion.enabled.description' as I18nKey,
  },
  {
    id: 'omp.extendedContext',
    page: 'sessions',
    titleKey: 'settings.omp.items.extendedContext.label' as I18nKey,
    descriptionKey: 'settings.omp.items.extendedContext.description' as I18nKey,
  },
  {
    id: 'omp.branchSummary.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.branchSummary.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.branchSummary.enabled.description' as I18nKey,
  },
  {
    id: 'omp.compaction.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.enabled.description' as I18nKey,
  },
  {
    id: 'omp.compaction.thresholdPercent',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.thresholdPercent.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.thresholdPercent.description' as I18nKey,
  },
  {
    id: 'omp.compaction.thresholdTokens',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.thresholdTokens.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.thresholdTokens.description' as I18nKey,
  },
  {
    id: 'omp.compaction.idleEnabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.idleEnabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.idleEnabled.description' as I18nKey,
  },
  {
    id: 'omp.compaction.idleThresholdTokens',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.idleThresholdTokens.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.idleThresholdTokens.description' as I18nKey,
  },
  {
    id: 'omp.compaction.idleTimeoutSeconds',
    page: 'sessions',
    titleKey: 'settings.omp.items.compaction.idleTimeoutSeconds.label' as I18nKey,
    descriptionKey: 'settings.omp.items.compaction.idleTimeoutSeconds.description' as I18nKey,
  },
  {
    id: 'omp.temperature',
    page: 'sessions',
    titleKey: 'settings.omp.items.temperature.label' as I18nKey,
    descriptionKey: 'settings.omp.items.temperature.description' as I18nKey,
  },
  {
    id: 'omp.topP',
    page: 'sessions',
    titleKey: 'settings.omp.items.topP.label' as I18nKey,
    descriptionKey: 'settings.omp.items.topP.description' as I18nKey,
  },
  {
    id: 'omp.topK',
    page: 'sessions',
    titleKey: 'settings.omp.items.topK.label' as I18nKey,
    descriptionKey: 'settings.omp.items.topK.description' as I18nKey,
  },
  {
    id: 'omp.minP',
    page: 'sessions',
    titleKey: 'settings.omp.items.minP.label' as I18nKey,
    descriptionKey: 'settings.omp.items.minP.description' as I18nKey,
  },
  {
    id: 'omp.presencePenalty',
    page: 'sessions',
    titleKey: 'settings.omp.items.presencePenalty.label' as I18nKey,
    descriptionKey: 'settings.omp.items.presencePenalty.description' as I18nKey,
  },
  {
    id: 'omp.repetitionPenalty',
    page: 'sessions',
    titleKey: 'settings.omp.items.repetitionPenalty.label' as I18nKey,
    descriptionKey: 'settings.omp.items.repetitionPenalty.description' as I18nKey,
  },
  {
    id: 'omp.textVerbosity',
    page: 'sessions',
    titleKey: 'settings.omp.items.textVerbosity.label' as I18nKey,
    descriptionKey: 'settings.omp.items.textVerbosity.description' as I18nKey,
  },
  {
    id: 'omp.retry.maxRetries',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.maxRetries.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.maxRetries.description' as I18nKey,
  },
  {
    id: 'omp.retry.waitForUsageReset',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.waitForUsageReset.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.waitForUsageReset.description' as I18nKey,
  },
  {
    id: 'omp.retry.modelFallback',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.modelFallback.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.modelFallback.description' as I18nKey,
  },
  {
    id: 'omp.retry.fallbackOn',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.fallbackOn.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.fallbackOn.description' as I18nKey,
  },
  {
    id: 'omp.retry.usageAwareFallback',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.usageAwareFallback.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.usageAwareFallback.description' as I18nKey,
  },
  {
    id: 'omp.retry.usageReservePct',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.usageReservePct.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.usageReservePct.description' as I18nKey,
  },
  {
    id: 'omp.retry.usageReservePolicy',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.usageReservePolicy.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.usageReservePolicy.description' as I18nKey,
  },
  {
    id: 'omp.retry.fallbackRevertPolicy',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.fallbackRevertPolicy.label' as I18nKey,
    descriptionKey: 'settings.omp.items.retry.fallbackRevertPolicy.description' as I18nKey,
  },
  {
    id: 'omp.task.isolation.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.task.isolation.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.task.isolation.enabled.description' as I18nKey,
  },
  {
    id: 'omp.plan.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.plan.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.plan.enabled.description' as I18nKey,
  },
  {
    id: 'omp.plan.defaultOnStartup',
    page: 'sessions',
    titleKey: 'settings.omp.items.plan.defaultOnStartup.label' as I18nKey,
    descriptionKey: 'settings.omp.items.plan.defaultOnStartup.description' as I18nKey,
  },
  {
    id: 'omp.plan.autosave',
    page: 'sessions',
    titleKey: 'settings.omp.items.plan.autosave.label' as I18nKey,
    descriptionKey: 'settings.omp.items.plan.autosave.description' as I18nKey,
  },
  {
    id: 'omp.goal.enabled',
    page: 'sessions',
    titleKey: 'settings.omp.items.goal.enabled.label' as I18nKey,
    descriptionKey: 'settings.omp.items.goal.enabled.description' as I18nKey,
  },
  {
    id: 'chat.activity-default',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.activityDefault',
    keywords: ['activity', 'collapsed', 'text', 'expanded', 'live', 'tools', 'history'],
  },
  {
    id: 'appearance.language',
    page: 'appearance',
    titleKey: 'settings.appearance.language.label',
    descriptionKey: 'settings.appearance.language.description',
    keywords: ['locale', 'translation', 'ui language'],
  },
  {
    id: 'appearance.time-format',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.timeFormat',
    keywords: ['clock', '12h', '24h'],
  },
  {
    id: 'appearance.week-start',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.weekStartsOn',
    keywords: ['calendar', 'monday', 'sunday'],
  },
  {
    id: 'appearance.light-theme',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.lightTheme',
    keywords: ['theme', 'color', 'light mode'],
  },
  {
    id: 'appearance.dark-theme',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.darkTheme',
    keywords: ['theme', 'color', 'dark mode'],
  },
  {
    id: 'appearance.import-theme',
    page: 'appearance',
    titleKey: 'settings.themeImport.action',
    descriptionKey: 'settings.themeImport.catalogHint',
    keywords: ['theme', 'import', 'vscode', 'open vsx', 'openvsx', 'json', 'jsonc', 'syntax', 'palette'],
  },
  {
    id: 'appearance.dock-badge',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.dockBadge',
    descriptionKey: 'settings.openchamber.visual.field.dockBadgeHint',
    keywords: ['dock', 'badge', 'unread', 'unseen', 'counter', 'count', 'notification', 'macos'],
    isAvailable: (ctx) => ctx.isMac,
  },
  {
    id: 'general.keep-screen-awake',
    page: 'general',
    titleKey: 'settings.mobileApp.keepScreenAwake.label',
    descriptionKey: 'settings.mobileApp.keepScreenAwake.info',
    keywords: ['screen', 'display', 'sleep', 'lock', 'awake', 'wake lock', 'timeout', 'battery', 'phone'],
    isAvailable: () => canKeepScreenAwake(),
  },
  {
    id: 'appearance.scrollbars',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.alwaysShowScrollbars',
    descriptionKey: 'settings.openchamber.visual.field.alwaysShowScrollbarsHint',
    keywords: ['scrollbar', 'scrollbars', 'scroll', 'mouse', 'wheel', 'accessibility', 'always visible'],
  },
  {
    id: 'appearance.pwa-install-name',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.installAppName',
    descriptionKey: 'settings.openchamber.visual.field.installAppNameHint',
    keywords: ['pwa', 'installed app'],
    isAvailable: (ctx) => ctx.isWeb && !ctx.isDesktop,
  },
  {
    id: 'appearance.pwa-orientation',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.installOrientation',
    descriptionKey: 'settings.openchamber.visual.field.installOrientationHint',
    keywords: ['pwa', 'portrait', 'landscape'],
    isAvailable: (ctx) => ctx.isWeb && !ctx.isDesktop,
  },
  {
    id: 'appearance.mobile-keyboard-mode',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.mobileKeyboardMode',
    descriptionKey: 'settings.openchamber.visual.field.mobileKeyboardModeHint',
    keywords: ['mobile', 'keyboard', 'resize'],
    isAvailable: (ctx) => ctx.isMobile && ctx.isWeb && !ctx.isDesktop,
  },
  {
    id: 'appearance.animated-activity-indicators',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.animatedActivityIndicators',
    descriptionKey: 'settings.openchamber.visual.field.animatedActivityIndicatorsInfo',
    keywords: ['spinner', 'animation', 'session', 'activity', 'motion', 'running', 'indicator'],
  },
  {
    id: 'appearance.interface-font-size',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.interfaceFontSize',
    keywords: ['font', 'text size', 'ui scale'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.chat-font-size',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.chatFontSize',
    keywords: ['chat', 'font', 'text size', 'messages'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.interface-font-weight',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.interfaceFontWeight',
    descriptionKey: 'settings.openchamber.visual.field.interfaceFontWeightInfo',
    keywords: ['font weight', 'bold', 'regular', 'balanced', 'strong', 'typography'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.terminal-font-size',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.terminalFontSize',
    keywords: ['terminal', 'font', 'text size'],
  },
  {
    id: 'appearance.terminal-shell',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.terminalShell',
    descriptionKey: 'settings.openchamber.visual.field.terminalShellHint',
    keywords: ['terminal', 'shell', 'bash', 'zsh', 'fish', 'pwsh', 'powershell'],
  },
  {
    id: 'appearance.terminal-close-on-exit',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.terminalCloseOnExit',
    descriptionKey: 'settings.openchamber.visual.field.terminalCloseOnExitInfo',
    keywords: ['terminal', 'exit', 'close', 'tab', 'shell'],
  },
  {
    id: 'appearance.terminal-open-on-project-action',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.terminalOpenOnProjectAction',
    descriptionKey: 'settings.openchamber.visual.field.terminalOpenOnProjectActionInfo',
    keywords: ['terminal', 'project action', 'run', 'open', 'panel', 'dev server'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.editor-font-size',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.editorFontSize',
    keywords: ['editor', 'font', 'text size', 'code'],
  },
  {
    id: 'appearance.spacing-density',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.spacingDensity',
    keywords: ['density', 'compact', 'comfortable', 'spacing'],
  },
  {
    id: 'appearance.input-bar-offset',
    page: 'appearance',
    titleKey: 'settings.openchamber.visual.field.inputBarOffset',
    descriptionKey: 'settings.openchamber.visual.field.inputBarOffsetTooltip',
    keywords: ['input', 'home bar', 'offset'],
    isAvailable: (ctx) => ctx.isMobile,
  },
  {
    id: 'appearance.auto-save-enabled',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.autoSaveEnabled',
    descriptionKey: 'settings.openchamber.visual.field.autoSaveEnabledInfo',
    keywords: ['editor', 'autosave', 'auto-save', 'files', 'save'],
  },
  {
    id: 'appearance.confirm-file-tree-move',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.confirmFileTreeMove',
    keywords: ['files', 'tree', 'move', 'drag', 'drop', 'confirm'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.file-editor-keymap',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.fileEditorKeymap',
    keywords: ['editor', 'vim', 'keymap'],
  },
  {
    id: 'appearance.session-tabs',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.sessionTabsGroup',
    descriptionKey: 'settings.openchamber.visual.field.sessionTabsInfo',
    keywords: ['session', 'tabs', 'header', 'working set'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'appearance.live-browser-tabs',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.liveBrowserTabs',
    descriptionKey: 'settings.openchamber.visual.field.liveBrowserTabsInfo',
    keywords: ['browser', 'tabs', 'memory', 'reload', 'background', 'loaded'],
    isAvailable: (ctx) => ctx.isDesktop && !ctx.isMobile,
  },
  {
    id: 'layout.mobile-workspace-tabs',
    page: 'general',
    titleKey: 'settings.layout.general.mobileTabs.title',
    descriptionKey: 'settings.layout.general.mobileTabs.info',
    keywords: ['tabs', 'workspace', 'panel', 'order', 'hide', 'status', 'git', 'files', 'terminal', 'mobile'],
    isAvailable: (ctx) => ctx.isMobile,
  },
  {
    id: 'appearance.terminal-quick-keys',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.terminalQuickKeys',
    descriptionKey: 'settings.openchamber.visual.field.terminalQuickKeysTooltip',
    keywords: ['terminal', 'keyboard', 'esc', 'ctrl', 'arrows'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'general.app-links',
    page: 'general',
    titleKey: 'settings.openchamber.appLinks.title',
    descriptionKey: 'settings.openchamber.appLinks.info',
    keywords: ['security', 'app link', 'deep link', 'scheme', 'protocol', 'obsidian', 'notion'],
  },
  {
    id: 'chat.session-recap',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.sessionRecap',
    keywords: ['recap', 'assist', 'small model', 'summary'],
  },
  {
    id: 'chat.session-assistance',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.sessionAssistance',
    keywords: ['recap', 'suggestion', 'subagent'],
  },
  {
    id: 'chat.suggestion-generator',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.suggestionGenerator',
    keywords: ['suggestion', 'generator', 'next prompt', 'prediction', 'small model'],
  },
  {
    id: 'chat.session-review-offer',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.sessionReviewOffer',
    descriptionKey: 'settings.openchamber.visual.field.sessionReviewOfferInfo',
    keywords: ['review', 'walkthrough', 'changes', 'diff', 'jev', 'classification'],
  },
  {
    id: 'chat.session-goal-budget',
    page: 'sessions',
    titleKey: 'settings.openchamber.visual.goal.budgetLabel',
    keywords: ['goal', 'budget', 'tokens', 'limit'],
  },
  {
    id: 'chat.reasoning-traces',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.showReasoningTraces',
    keywords: ['thinking', 'reasoning'],
  },
  {
    id: 'chat.reasoning',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.reasoning',
    keywords: ['thinking', 'traces', 'collapse', 'expand', 'streaming'],
  },
  {
    id: 'chat.streaming-auto-follow',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.streamingAutoFollow',
    descriptionKey: 'settings.openchamber.visual.field.streamingAutoFollowInfo',
    keywords: ['autoscroll', 'auto-scroll', 'follow', 'stick to bottom', 'streaming'],
  },
  {
    id: 'chat.sticky-user-header',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.stickyUserHeader',
    keywords: ['messages', 'header'],
  },
  {
    id: 'chat.prompt-navigator',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.promptNavigatorEnabled',
    keywords: ['prompt', 'navigator', 'navigation', 'timeline', 'scroll'],
  },
  {
    id: 'chat.collapsible-user-messages',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.collapsibleUserMessages',
    keywords: ['collapse', 'expand', 'clamp', 'long messages', 'user messages'],
  },
  {
    id: 'chat.width',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.chatWidth',
    descriptionKey: 'settings.openchamber.visual.field.chatWidthInfo',
    keywords: ['layout', 'wide', 'wider', 'full', 'width', 'column', 'messages'],
  },
  {
    id: 'chat.message-appearance',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.messageAppearance',
    keywords: ['layout', 'messages', 'appearance'],
  },
  {
    id: 'chat.code-block-line-wrap',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.codeBlockLineWrap',
    keywords: ['code', 'wrap', 'line wrap', 'markdown'],
  },
  {
    id: 'chat.table-cell-wrap',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.tableCellWrap',
    descriptionKey: 'settings.openchamber.visual.field.tableCellWrapInfo',
    keywords: ['table', 'wrap', 'cell', 'columns', 'markdown'],
  },
  {
    id: 'chat.copy-plain-text',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.copyMessagesAsPlainText',
    descriptionKey: 'settings.openchamber.visual.field.copyMessagesAsPlainTextInfo',
    keywords: ['copy', 'clipboard', 'plain text', 'markdown', 'selection'],
  },
  {
    id: 'chat.inline-assistant-actions',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.showSplitAssistantMessageActions',
    descriptionKey: 'settings.openchamber.visual.field.showSplitAssistantMessageActionsTooltip',
    keywords: ['copy', 'save image', 'read aloud'],
  },
  {
    id: 'chat.draft-starters-visible',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.draftStartersVisible',
    keywords: ['starter', 'starters', 'new session', 'welcome', 'suggestions'],
  },
  {
    id: 'chat.subagent-read-only-banner',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.allowPromptingSubagentSessions',
    keywords: ['subagent', 'read only', 'prompt', 'banner'],
  },
  {
    id: 'chat.tool-file-icons',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.showToolFileIcons',
    keywords: ['tools', 'files', 'icons'],
  },
  {
    id: 'chat.changed-files',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.showTurnChangedFiles',
    keywords: ['changed files', 'turns'],
  },
  {
    id: 'chat.dotfiles',
    page: 'general',
    titleKey: 'settings.openchamber.visual.field.showDotfiles',
    keywords: ['hidden files', 'dotfiles', 'file tree', 'files'],
  },
  {
    id: 'chat.follow-up-behavior',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.followUpBehavior',
    descriptionKey: 'settings.openchamber.visual.field.followUpBehaviorDescription',
    keywords: ['follow up', 'queue', 'steer', 'send immediately'],
  },
  {
    id: 'chat.questions-placement',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.questionsPlacement',
    descriptionKey: 'settings.openchamber.visual.field.questionsPlacementInfo',
    keywords: ['question', 'form', 'ask', 'pop-up', 'popup', 'dock', 'inline', 'in the chat'],
  },
  {
    id: 'chat.input-history-scope',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.inputHistoryScope',
    descriptionKey: 'settings.openchamber.visual.field.inputHistoryScopeDescription',
    keywords: ['input history', 'composer history', 'global', 'session', 'reuse'],
  },
  {
    id: 'chat.input-history-limit',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.inputHistoryLimit',
    descriptionKey: 'settings.openchamber.visual.field.inputHistoryLimitDescription',
    keywords: ['history limit', 'prompt recall', 'remember prompts', 'composer history', 'submitted prompts', 'trim history'],
  },
  {
    id: 'chat.message-search',
    page: 'chat',
    titleKey: 'settings.openchamber.messageSearch.title',
    keywords: ['search', 'find', 'index', 'messages', 'history', 'full text'],
  },
  {
    id: 'chat.message-search-enabled',
    page: 'chat',
    titleKey: 'settings.openchamber.messageSearch.field.enabled',
    keywords: ['search', 'find', 'index', 'messages'],
  },
  {
    id: 'chat.message-search-reasoning',
    page: 'chat',
    titleKey: 'settings.openchamber.messageSearch.field.reasoning',
    keywords: ['search', 'reasoning', 'thinking', 'index'],
  },
  ...CHAT_SENDING_SEARCH_ITEMS,
  {
    id: 'chat.persist-drafts',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.persistDraftMessages',
    keywords: ['draft', 'message'],
  },
  {
    id: 'chat.selection-approval-text',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.field.selectionApprovalText',
    descriptionKey: 'settings.openchamber.visual.field.selectionApprovalTextInfo',
    keywords: ['lgtm', 'sounds good', 'approval', 'feedback', 'selection', 'citation', 'comment', 'thumbs up', '👍'],
  },
  {
    id: 'chat.user-message-rendering',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.userMessageRendering',
    keywords: ['markdown', 'plain text', 'user message', 'format'],
  },
  {
    id: 'chat.mermaid-rendering',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.mermaidRendering',
    keywords: ['mermaid', 'diagram', 'svg', 'ascii'],
  },
  {
    id: 'chat.diff-layout',
    page: 'chat',
    titleKey: 'settings.openchamber.visual.section.diffLayout',
    keywords: ['diff', 'inline', 'side by side', 'split', 'changes'],
  },
  {
    id: 'chat.session-goal-checker',
    page: 'sessions',
    titleKey: 'settings.openchamber.visual.goal.checkerLabel',
    keywords: ['goal', 'progress', 'check', 'jev', 'classification', 'small model'],
  },
  {
    id: 'chat.session-goal-max-turns',
    page: 'sessions',
    titleKey: 'settings.openchamber.visual.goal.maxTurnsLabel',
    keywords: ['goal', 'turns', 'limit', 'continuations', 'safety'],
  },
  {
    id: 'sessions.default-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.defaultModel',
    keywords: ['model', 'provider', 'new sessions'],
  },
  {
    id: 'sessions.default-thinking',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.defaultThinking',
    keywords: ['thinking', 'reasoning', 'variant'],
  },
  {
    // The plan role is what makes Plan selectable in the composer, so a search
    // for "plan model" has to land on the control that writes it.
    id: 'sessions.default-plan',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.planModel.title',
    descriptionKey: 'settings.openchamber.defaults.planModel.description',
    keywords: ['plan', 'plan mode', 'model', 'plan model', 'role'],
  },
  {
    id: 'sessions.model-compaction',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.compaction.modelRules',
    descriptionKey: 'settings.openchamber.defaults.compaction.modelRulesInfo',
    keywords: ['compaction', 'model', 'context limit', 'threshold', 'tokens'],
  },
  {
    id: 'sessions.fallback-model',
    page: 'sessions',
    titleKey: 'settings.omp.items.retry.fallbackChains.label',
    descriptionKey: 'settings.omp.items.retry.fallbackChains.description',
    keywords: ['fallback', 'retry', 'chain', 'model'],
  },
  {
    id: 'sessions.default-mode',
    page: 'sessions',
    titleKey: 'chat.chatInput.mode.label',
    keywords: ['mode', 'session mode', 'main', 'plan', 'vibe', 'goal', 'default'],
  },
  {
    id: 'sessions.deletion-dialog',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.showDeletionDialog',
    keywords: ['delete', 'confirmation'],
  },
  {
    id: 'sessions.warming',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.sessionWarming',
    descriptionKey: 'settings.openchamber.defaults.field.sessionWarmingInfo',
    keywords: ['warming', 'warm', 'cache', 'prompt cache', 'keep-alive', 'idle'],
  },
  {
    id: 'sessions.session-warming',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.sessionWarming.label',
    descriptionKey: 'settings.openchamber.defaults.sessionWarming.info',
    keywords: ['warming', 'warm', 'cache', 'prompt cache', 'keep warm', 'session', 'override', 'idle'],
  },
  {
    id: 'sessions.show-chats',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.field.showChats',
    keywords: ['chats', 'sidebar', 'hide', 'show', 'section'],
  },
  {
    id: 'sessions.work',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionWork.title',
    descriptionKey: 'settings.openchamber.sessionWork.info',
    keywords: ['in work', 'in progress', 'track', 'done', 'inbox', 'sidebar', 'jev'],
  },
  {
    id: 'sessions.work-enabled',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionWork.field.enabled',
    keywords: ['in work', 'in progress', 'track', 'done', 'sidebar'],
  },
  {
    id: 'sessions.work-auto-open',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionWork.field.autoOpen',
    descriptionKey: 'settings.openchamber.sessionWork.field.autoOpenInfo',
    keywords: ['in work', 'automatic', 'jev', 'classification', 'track'],
  },
  {
    id: 'sessions.work-keep-in-group',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionWork.field.keepInGroup',
    descriptionKey: 'settings.openchamber.sessionWork.field.keepInGroupInfo',
    keywords: ['in work', 'track', 'project group', 'folder', 'sidebar', 'keep'],
  },
  {
    id: 'sessions.small-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.smallModel.title',
    descriptionKey: 'settings.openchamber.defaults.smallModel.description',
    keywords: ['small model', 'utility', 'summary', 'recap', 'cheap', 'override'],
  },
  {
    id: 'sessions.walkthrough-model',
    page: 'sessions',
    titleKey: 'settings.openchamber.defaults.walkthroughModel.title',
    descriptionKey: 'settings.openchamber.defaults.walkthroughModel.description',
    keywords: ['walkthrough', 'diff', 'review', 'changes', 'structured output', 'model', 'override'],
  },
  {
    id: 'sessions.auto-cleanup',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionRetention.field.enableAutoCleanup',
    descriptionKey: 'settings.openchamber.sessionRetention.tooltip',
    keywords: ['retention', 'archive', 'delete'],
  },
  {
    id: 'sessions.merged-worktree-cleanup',
    page: 'sessions',
    titleKey: 'settings.openchamber.mergedWorktreeCleanup.field.enable',
    descriptionKey: 'settings.openchamber.mergedWorktreeCleanup.field.enableDescription',
    keywords: ['pr', 'pull request', 'merged', 'worktree', 'branch', 'archive', 'cleanup', 'remove'],
  },
  {
    id: 'sessions.worktree-archive-on-done',
    page: 'sessions',
    titleKey: 'settings.openchamber.finishedWorktrees.field.archiveOnDone',
    descriptionKey: 'settings.openchamber.finishedWorktrees.info',
    keywords: ['worktree', 'archive', 'done', 'cleanup'],
  },
  {
    id: 'sessions.retention-only-archived',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionRetention.field.onlyArchived',
    descriptionKey: 'settings.openchamber.sessionRetention.field.onlyArchivedDescription',
    keywords: ['archive', 'archived', 'only', 'delete', 'cleanup', 'retention'],
  },
  {
    id: 'sessions.retention-period',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionRetention.field.retentionPeriod',
    keywords: ['days', 'cleanup', 'retention'],
  },
  {
    id: 'sessions.retention-action',
    page: 'sessions',
    titleKey: 'settings.openchamber.sessionRetention.field.whenSessionsExpire',
    keywords: ['archive', 'delete', 'expire'],
  },
  {
    id: 'sessions.desktop-launch-at-login',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.launchAtLogin',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.launchAtLoginDescription',
    keywords: ['desktop', 'startup', 'login', 'launch', 'background', 'autostart'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'sessions.desktop-window-controls-position',
    page: 'appearance',
    titleKey: 'settings.openchamber.desktopNetwork.field.windowControlsPosition',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.windowControlsPositionDescription',
    keywords: ['desktop', 'window', 'controls', 'minimize', 'maximize', 'close', 'titlebar', 'linux', 'windows'],
    isAvailable: (ctx) => ctx.isDesktop && (ctx.isWindows || !ctx.isMac),
  },
  {
    id: 'sessions.desktop-window-controls-style',
    page: 'appearance',
    titleKey: 'settings.openchamber.desktopNetwork.field.windowControlsStyle',
    keywords: ['desktop', 'window', 'controls', 'style', 'traffic', 'lights', 'classic', 'macos', 'titlebar'],
    isAvailable: (ctx) => ctx.isDesktop && (ctx.isWindows || !ctx.isMac),
  },
  {
    id: 'sessions.desktop-mac-menu-bar',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.macMenuBar',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.macMenuBarDescription',
    keywords: ['desktop', 'menu bar', 'tray', 'status item', 'macos', 'background'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin && ctx.isMac,
  },
  {
    id: 'sessions.desktop-linux-native-frame',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.linuxNativeFrame',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.linuxNativeFrameDescription',
    keywords: ['desktop', 'linux', 'title bar', 'titlebar', 'window', 'frame', 'decorations', 'gnome', 'kde'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin && ctx.isLinux,
  },
  {
    id: 'sessions.desktop-minimize-to-tray',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.minimizeToTray',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.minimizeToTrayDescription',
    keywords: ['desktop', 'tray', 'system tray', 'minimize', 'close', 'background', 'windows', 'linux'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin && (ctx.isWindows || ctx.isLinux),
  },
  {
    id: 'sessions.desktop-keep-awake',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.keepAwake',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.keepAwakeDescription',
    keywords: ['desktop', 'sleep', 'awake', 'server', 'mobile', 'phone'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'sessions.desktop-mini-chat-global-shortcut',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.miniChatGlobalShortcut',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.miniChatGlobalShortcutDescription',
    keywords: ['desktop', 'mini chat', 'shortcut', 'hotkey', 'global', 'keyboard'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'sessions.desktop-quake-mode',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.quakeMode',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.quakeModeDescription',
    keywords: ['desktop', 'quake', 'dropdown', 'hotkey', 'shortcut', 'height', 'global', 'background', 'tray', 'terminal'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'sessions.desktop-ui-password',
    page: 'general',
    titleKey: 'settings.openchamber.desktopPassword.field.password',
    descriptionKey: 'settings.openchamber.desktopPassword.field.passwordDescription',
    keywords: ['desktop', 'password', 'auth', 'login'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'sessions.desktop-lan-access',
    page: 'general',
    titleKey: 'settings.openchamber.desktopNetwork.field.allowLanAccess',
    descriptionKey: 'settings.openchamber.desktopNetwork.field.allowLanAccessDescription',
    keywords: ['desktop', 'lan', 'network', 'phone', 'tablet'],
    isAvailable: (ctx) => ctx.isDesktopLocalOrigin,
  },
  {
    id: 'general.environment-variables',
    page: 'general',
    titleKey: 'settings.environment.user.title',
    descriptionKey: 'settings.environment.user.info',
    keywords: ['environment', 'env', 'variables', 'api key', 'token', 'secret', 'opencode', 'terminal', 'git'],
  },
  {
    id: 'sessions.agent-control-tool',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.field.agentControlTool',
    descriptionKey: 'settings.openchamber.tools.field.agentControlToolInfo',
    keywords: ['agent', 'tool', 'orchestration', 'openchamber', 'sessions', 'schedule', 'control'],
  },
  {
    id: 'sessions.agent-terminal-tool',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.field.agentTerminalTool',
    descriptionKey: 'settings.openchamber.tools.field.agentTerminalToolSummary',
    keywords: ['agent', 'terminal', 'panel', 'read', 'output'],
  },
  {
    id: 'sessions.agent-browser-logins',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.agentBrowserLogins.label',
    descriptionKey: 'settings.openchamber.tools.agentBrowserLogins.info',
    keywords: ['agent', 'browser', 'logins', 'cookies', 'profile'],
    isAvailable: (ctx) => ctx.isDesktop,
  },
  {
    id: 'sessions.agent-web-tool',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.field.agentWebTool',
    descriptionKey: 'settings.openchamber.tools.field.agentWebToolInfo',
    keywords: ['agent', 'tool', 'web', 'browser', 'page', 'preview', 'openchamber'],
  },
  {
    id: 'sessions.browser-provider',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.browserProvider.label',
    descriptionKey: 'settings.openchamber.tools.browserProvider.info',
    keywords: ['agent', 'browser', 'provider', 'extension', 'chrome', 'server', 'headless'],
  },
  {
    id: 'sessions.agent-notify-tool',
    page: 'tools',
    titleKey: 'settings.openchamber.tools.field.agentNotifyTool',
    descriptionKey: 'settings.openchamber.tools.field.agentNotifyToolInfo',
    keywords: ['agent', 'tool', 'notify', 'notification', 'alert', 'ping', 'openchamber'],
  },
  {
    id: 'git.gitlab-account',
    page: 'integrations',
    titleKey: 'settings.gitlab.title',
    descriptionKey: 'settings.gitlab.info',
    keywords: ['gitlab', 'account', 'oauth', 'pat', 'merge request', 'issues', 'glab'],
  },
  {
    id: 'git.gitlab-connect',
    page: 'integrations',
    titleKey: 'settings.gitlab.actions.connect',
    keywords: ['gitlab', 'connect', 'add account', 'oauth', 'pat', 'token', 'instance'],
  },
  {
    id: 'routing.token',
    page: 'routing',
    titleKey: 'settings.routing.token.label',
    descriptionKey: 'settings.routing.token.info',
    keywords: ['jev', 'typesafe', 'api key', 'token', 'routing'],
    isAvailable: (ctx) => ctx.routingAvailable,
  },
  {
    id: 'routing.enabled',
    page: 'routing',
    titleKey: 'settings.routing.auto.enable',
    descriptionKey: 'settings.routing.auto.enableInfo',
    keywords: ['auto', 'routing', 'model', 'jev', 'automatic'],
    isAvailable: (ctx) => ctx.routingAvailable && !ctx.jevBlockedByEnterprise,
  },
  {
    id: 'routing.preserve-cache',
    page: 'routing',
    titleKey: 'settings.routing.auto.preserveCache',
    descriptionKey: 'settings.routing.auto.preserveCacheInfo',
    keywords: ['cache', 'prompt cache', 'auto', 'routing', 'switch', 'model', 'cost'],
    isAvailable: (ctx) => ctx.routingAvailable && !ctx.jevBlockedByEnterprise,
  },
  {
    id: 'routing.fallback-model',
    page: 'routing',
    titleKey: 'settings.routing.auto.fallbackModel',
    descriptionKey: 'settings.routing.auto.fallbackModelInfo',
    keywords: ['fallback', 'default', 'model', 'routing'],
    isAvailable: (ctx) => ctx.routingAvailable && !ctx.jevBlockedByEnterprise,
  },
  {
    id: 'routing.add-category',
    page: 'routing',
    titleKey: 'settings.routing.categories.title',
    descriptionKey: 'settings.routing.categories.description',
    keywords: ['category', 'categories', 'task type', 'routing'],
    isAvailable: (ctx) => ctx.routingAvailable && !ctx.jevBlockedByEnterprise,
  },
  {
    id: 'git.identities',
    page: 'git',
    titleKey: 'settings.gitIdentities.page.section.title',
    descriptionKey: 'settings.gitIdentities.page.empty.description',
    keywords: ['identity', 'profile', 'author', 'email', 'credentials', 'account', 'transport', 'ssh', 'ssh key', 'signing', 'commit signing', 'ssh signing', 'gpg'],
  },
  {
    id: 'git.commit-generation',
    page: 'git',
    titleKey: 'settings.openchamber.git.commitGeneration.generateMessages.label',
    descriptionKey: 'settings.openchamber.git.commitGeneration.generateMessages.desc',
    keywords: ['commit', 'commit message', 'generate', 'generation', 'ai'],
  },
  {
    id: 'git.commit-reasoning',
    page: 'git',
    titleKey: 'settings.openchamber.git.commitGeneration.reasoning.label',
    descriptionKey: 'settings.openchamber.git.commitGeneration.reasoning.desc',
    keywords: ['commit', 'reasoning', 'effort', 'thinking', 'model'],
  },
  {
    id: 'git.commit-notes',
    page: 'git',
    titleKey: 'settings.openchamber.git.commitGeneration.notes.label',
    descriptionKey: 'settings.openchamber.git.commitGeneration.notes.desc',
    keywords: ['commit', 'notes', 'git notes', 'note'],
  },
  {
    id: 'git.commit-change-id',
    page: 'git',
    titleKey: 'settings.openchamber.git.commitGeneration.changeId.label',
    descriptionKey: 'settings.openchamber.git.commitGeneration.changeId.desc',
    keywords: ['commit', 'change-id', 'gerrit', 'review', 'trailer'],
  },
  {
    id: 'git.changes-view',
    page: 'git',
    titleKey: 'settings.openchamber.git.changesViewTitle',
    keywords: ['changes', 'flat list', 'tree view'],
  },
  {
    id: 'git.gitmoji',
    page: 'git',
    titleKey: 'settings.openchamber.git.enableGitmoji',
    keywords: ['commit', 'emoji'],
  },
  {
    id: 'git.gitignored-files',
    page: 'git',
    titleKey: 'settings.openchamber.git.showGitignored',
    keywords: ['ignored', 'files', 'gitignore'],
  },
  {
    id: 'usage.statistics',
    page: 'usage',
    titleKey: 'usageStats.title',
    descriptionKey: 'settings.usage.page.options.showInWorkStatusTooltip',
    keywords: ['quota', 'tokens', 'sessions', 'cost', 'models', 'activity'],
  },
  {
    id: 'usage.quotas',
    page: 'usage',
    titleKey: 'settings.usage.page.section.quotas',
    keywords: ['quota', 'limits', 'plan', 'provider'],
  },
  {
    id: 'projects.name',
    page: 'projects',
    titleKey: 'settings.projects.page.field.projectName',
    keywords: ['label', 'display name', 'project metadata'],
  },
  {
    id: 'projects.default-model',
    page: 'projects',
    titleKey: 'settings.projects.page.field.projectModel',
    keywords: ['model', 'default', 'new chat', 'project metadata'],
  },
  {
    id: 'projects.default-thinking',
    page: 'projects',
    titleKey: 'settings.projects.page.field.projectThinking',
    keywords: ['thinking', 'variant', 'reasoning', 'effort', 'model', 'project metadata'],
  },
  {
    id: 'projects.accent-color',
    page: 'projects',
    titleKey: 'settings.projects.page.field.accentColor',
    keywords: ['color', 'appearance', 'project metadata'],
  },
  {
    id: 'projects.icon',
    page: 'projects',
    titleKey: 'settings.projects.page.field.projectIcon',
    keywords: ['icon', 'favicon', 'upload', 'project metadata'],
  },
  {
    id: 'projects.worktree',
    page: 'projects',
    titleKey: 'settings.projects.page.section.worktree',
    keywords: ['worktree', 'branch', 'repository'],
  },
  {
    id: 'projects.worktree.create',
    page: 'projects',
    titleKey: 'settings.openchamber.worktrees.create.title',
    descriptionKey: 'settings.openchamber.worktrees.create.info',
    keywords: ['worktree', 'create', 'commands', 'bootstrap'],
  },
  {
    id: 'projects.worktree.directory',
    page: 'projects',
    titleKey: 'settings.openchamber.worktrees.directory.label',
    descriptionKey: 'settings.openchamber.worktrees.directory.info',
    keywords: ['worktree', 'directory', 'folder', 'location', 'path', 'home', 'absolute', 'relative'],
  },
  {
    id: 'projects.worktree.setup.wait',
    page: 'projects',
    titleKey: 'settings.openchamber.worktrees.setup.waitForCommands',
    keywords: ['worktree', 'setup commands', 'bootstrap', 'wait'],
  },
  {
    id: 'projects.worktree.setup.replace',
    page: 'projects',
    titleKey: 'settings.projects.shared.replaceMode',
    keywords: ['worktree', 'setup commands', 'shared', 'team', 'only mine'],
  },
  {
    id: 'projects.environment',
    page: 'projects',
    titleKey: 'settings.projects.environment.title',
    descriptionKey: 'settings.projects.environment.info',
    keywords: ['environment', 'env', 'variables', 'direnv', 'devenv', 'nix', 'envrc', 'path', 'terminal', 'git hooks'],
  },
  {
    id: 'projects.notes-todos.repository',
    page: 'projects',
    titleKey: 'settings.projects.notesTodos.inRepository',
    descriptionKey: 'settings.projects.notesTodos.inRepositoryDescription',
    keywords: ['notes', 'todos', 'repository', 'git', 'sync', '.openchamber', 'notes-todos.json'],
  },
  {
    id: 'projects.shared',
    page: 'projects',
    titleKey: 'settings.projects.shared.title',
    descriptionKey: 'settings.projects.shared.description',
    keywords: ['shared', 'team', 'repository', '.openchamber', 'project.json', 'trust'],
  },
  {
    id: 'projects.shared.plansDir',
    page: 'projects',
    titleKey: 'settings.projects.shared.plansDir',
    descriptionKey: 'settings.projects.shared.plansDirInfo',
    keywords: ['plans', 'folder', 'shared', 'team', 'docs'],
  },
  {
    id: 'remote-instances.client-auth',
    page: 'remote-instances',
    titleKey: 'settings.remoteInstances.clientAuth.title',
    descriptionKey: 'settings.remoteInstances.clientAuth.description',
    keywords: ['pairing link', 'client token', 'connect desktop', 'remote access', 'relay', 'devices', 'connect from anywhere'],
  },
  {
    id: 'remote-instances.direct-hosts',
    page: 'remote-instances',
    titleKey: 'settings.remoteInstances.direct.title',
    descriptionKey: 'settings.remoteInstances.direct.description',
    keywords: ['server url', 'connection token', 'import link', 'host switcher', 'additional headers', 'request headers', 'cloudflare access', 'service token'],
    isAvailable: (ctx) => ctx.isDesktop,
  },
  {
    id: 'behavior.prompt-personality',
    page: 'behavior',
    titleKey: 'settings.behavior.section.prompt.title',
    descriptionKey: 'settings.behavior.section.prompt.description',
    keywords: ['prompt', 'personality', 'tone', 'persona', 'model role', 'workspace tree', 'tool descriptors'],
  },
  {
    id: 'behavior.response-style',
    page: 'behavior',
    titleKey: 'settings.behavior.page.section.responseStyle',
    descriptionKey: 'settings.behavior.page.responseStyle.tooltip',
    keywords: ['response style', 'preset', 'tone', 'concise', 'detailed', 'mentor', 'custom instructions', 'first message'],
  },
  {
    id: 'behavior.system-prompt',
    page: 'behavior',
    titleKey: 'settings.behavior.files.agentsMd',
    descriptionKey: 'settings.behavior.page.warning.description',
    keywords: ['agents.md', 'system prompt', 'global rules', 'project rules', 'custom instructions', 'agent instructions'],
  },
  {
    id: 'behavior.files.rules-md',
    page: 'behavior',
    titleKey: 'settings.behavior.files.rulesMd',
    keywords: ['rules.md', 'sticky rules', 'global rules', 'project rules'],
  },
  {
    id: 'behavior.files.system-md',
    page: 'behavior',
    titleKey: 'settings.behavior.files.systemMd',
    keywords: ['system.md', 'system prompt', 'global'],
  },
  {
    id: 'behavior.rules',
    page: 'behavior',
    titleKey: 'settings.behavior.files.rules',
    keywords: ['.omp/rules', 'rules', 'scoped rules', 'globs', 'always apply', 'frontmatter'],
  },
  {
    id: 'behavior.instructions',
    page: 'behavior',
    titleKey: 'settings.behavior.files.instructions',
    keywords: ['.omp/instructions', 'instructions', 'scoped instructions', 'on-demand'],
  },
  {
    id: 'behavior.files.create',
    page: 'behavior',
    titleKey: 'settings.behavior.files.create',
    keywords: ['create', 'add', 'new rule', 'new instruction', '.omp'],
  },
  {
    id: 'agents.create',
    page: 'agents',
    titleKey: 'settings.agents.page.title.new',
    keywords: ['create', 'add', 'new agent'],
  },
  {
    id: 'agents.name',
    page: 'agents',
    titleKey: 'settings.agents.page.field.agentName',
    keywords: ['agent', 'name'],
  },
  {
    id: 'agents.mode',
    page: 'agents',
    titleKey: 'settings.agents.page.field.mode',
    descriptionKey: 'settings.agents.page.field.modeTooltip',
    keywords: ['primary', 'subagent', 'visibility'],
  },
  {
    id: 'agents.color',
    page: 'agents',
    titleKey: 'settings.agents.page.field.color',
    descriptionKey: 'settings.agents.page.field.colorTooltip',
    keywords: ['colour', 'hex', 'accent'],
  },
  {
    id: 'agents.model',
    page: 'agents',
    titleKey: 'settings.agents.page.field.overrideModel',
    keywords: ['model', 'provider'],
  },
  {
    id: 'agents.variant',
    page: 'agents',
    titleKey: 'settings.agents.page.field.variant',
    descriptionKey: 'settings.agents.page.field.variantTooltip',
    keywords: ['thinking', 'reasoning', 'variant', 'depth'],
  },
  {
    id: 'agents.temperature',
    page: 'agents',
    titleKey: 'settings.agents.page.field.temperature',
    descriptionKey: 'settings.agents.page.field.temperatureTooltip',
    keywords: ['randomness', 'creative'],
  },
  {
    id: 'agents.top-p',
    page: 'agents',
    titleKey: 'settings.agents.page.field.topP',
    descriptionKey: 'settings.agents.page.field.topPTooltip',
    keywords: ['sampling', 'nucleus'],
  },
  {
    id: 'agents.system-prompt',
    page: 'agents',
    titleKey: 'settings.agents.page.section.systemPrompt',
    keywords: ['prompt', 'instructions'],
  },
  {
    id: 'agents.steps',
    page: 'agents',
    titleKey: 'settings.agents.page.field.steps',
    descriptionKey: 'settings.agents.page.field.stepsTooltip',
    keywords: ['steps', 'loop', 'tool calls'],
  },
  {
    id: 'agents.permissions',
    page: 'agents',
    titleKey: 'settings.agents.page.section.toolPermissions',
    keywords: ['tools', 'permissions', 'rules', 'allow', 'ask', 'deny'],
  },
  {
    id: 'commands.create',
    page: 'commands',
    titleKey: 'settings.commands.page.title.new',
    keywords: ['create', 'add', 'new command'],
  },
  {
    id: 'commands.name',
    page: 'commands',
    titleKey: 'settings.commands.page.field.commandName',
    keywords: ['slash command', 'name'],
  },
  {
    id: 'commands.model',
    page: 'commands',
    titleKey: 'settings.agents.page.field.overrideModel',
    keywords: ['model', 'provider'],
  },
  {
    id: 'commands.argument-hint',
    page: 'commands',
    titleKey: 'settings.commands.page.field.argumentHint',
    keywords: ['arguments', 'argument hint', '$arguments', 'user input'],
  },
  {
    id: 'commands.group',
    page: 'commands',
    titleKey: 'settings.commands.page.field.group',
    keywords: ['group', 'folder', 'category', 'command group'],
  },
  {
    id: 'commands.template',
    page: 'commands',
    titleKey: 'settings.commands.page.section.template',
    keywords: ['prompt', 'template', 'arguments', 'shell', 'file'],
  },
  {
    id: 'mcp.create',
    page: 'mcp',
    titleKey: 'settings.mcp.sidebar.actions.addServerTitle',
    keywords: ['create', 'add', 'server'],
  },
  {
    id: 'mcp.server',
    page: 'mcp',
    titleKey: 'settings.mcp.page.server.title',
    keywords: ['server', 'name', 'transport'],
  },
  {
    id: 'mcp.command',
    page: 'mcp',
    titleKey: 'settings.mcp.page.connection.command',
    keywords: ['stdio', 'local', 'command'],
  },
  {
    id: 'mcp.environment',
    page: 'mcp',
    titleKey: 'settings.mcp.page.env.title',
    keywords: ['env', 'variables', 'api key'],
  },
  {
    id: 'mcp.advanced',
    page: 'mcp',
    titleKey: 'settings.mcp.page.advanced.title',
    keywords: ['oauth', 'headers', 'timeout', 'code mode', 'codemode'],
  },
  {
    id: 'plugins.create',
    page: 'plugins',
    titleKey: 'settings.plugins.sidebar.actions.addTitle',
    keywords: ['add', 'plugin', 'npm', 'path', 'file'],
  },
  {
    id: 'plugins.spec',
    page: 'plugins',
    titleKey: 'settings.plugins.page.field.spec',
    keywords: ['npm', 'package', 'path'],
  },
  {
    id: 'plugins.options',
    page: 'plugins',
    titleKey: 'settings.plugins.page.field.options',
    keywords: ['json', 'configuration'],
  },
  {
    id: 'plugins.content',
    page: 'plugins',
    titleKey: 'settings.plugins.page.field.content',
    keywords: ['file', 'code'],
  },
  {
    id: 'snippets.create',
    page: 'snippets',
    titleKey: 'settings.snippets.sidebar.actions.create',
    keywords: ['add', 'new snippet'],
  },
  {
    id: 'snippets.content',
    page: 'snippets',
    titleKey: 'settings.snippets.page.field.content',
    keywords: ['markdown', 'prompt', 'template'],
  },
  {
    id: 'providers.connect',
    page: 'providers',
    titleKey: 'settings.providers.page.connect.title',
    keywords: ['add provider', 'connect provider', 'credentials'],
  },
  {
    id: 'providers.classification',
    page: 'providers',
    titleKey: 'settings.classification.page.title',
    descriptionKey: 'settings.classification.page.description',
    keywords: ['jev', 'typesafe', 'zen', 'api key', 'token', 'safety net', 'auto', 'routing', 'classification', 'promotion', 'off', 'disable', 'privacy', 'custom endpoint', 'base url', 'openai-compatible', 'system one', 'self-hosted', 'proxy'],
    isAvailable: (ctx) => ctx.routingAvailable,
  },
  {
    id: 'providers.custom',
    page: 'providers',
    titleKey: 'settings.providers.page.custom.title',
    descriptionKey: 'settings.providers.page.custom.description',
    keywords: ['other', 'custom', 'openai-compatible', 'base url', 'api key', 'client certificate', 'mtls', 'mutual tls', 'gateway'],
  },
  {
    id: 'providers.auth',
    page: 'providers',
    titleKey: 'settings.providers.accounts.title',
    keywords: ['api key', 'oauth', 'credentials', 'accounts', 'switch account', 'disconnect'],
  },
  {
    id: 'providers.logo',
    page: 'providers',
    titleKey: 'settings.providers.page.logo.title',
    keywords: ['logo', 'image', 'upload', 'icon', 'picture', 'svg', 'png'],
  },
  {
    id: 'providers.models',
    page: 'providers',
    titleKey: 'settings.providers.page.models.title',
    keywords: ['models', 'hide', 'show'],
  },
  {
    id: 'web-search.provider',
    page: 'web-search',
    titleKey: 'settings.webSearch.section.provider',
    descriptionKey: 'settings.webSearch.native.info',
    keywords: ['web search', 'web_search', 'internet', 'provider', 'disable', 'off', 'fallback', 'timeout'],
  },
  {
    id: 'web-search.fallbacks',
    page: 'web-search',
    titleKey: 'settings.webSearch.native.fallbacks',
    descriptionKey: 'settings.webSearch.native.fallbackInfo',
    keywords: ['fallback', 'fallbacks', 'chain', 'order', 'backup provider'],
  },
  {
    id: 'web-search.timeout',
    page: 'web-search',
    titleKey: 'settings.webSearch.native.timeout',
    keywords: ['timeout', 'latency', 'seconds', 'deadline'],
  },
  {
    id: 'web-search.keys',
    page: 'web-search',
    titleKey: 'settings.webSearch.section.keys',
    keywords: ['api key', 'exa', 'tavily', 'firecrawl', 'parallel', 'tinyfish', 'credentials'],
  },
  {
    id: 'skills.create',
    page: 'skills.installed',
    titleKey: 'settings.skills.page.title.newSkill',
    keywords: ['create', 'add', 'new skill'],
  },
  {
    id: 'skills.basic-information',
    page: 'skills.installed',
    titleKey: 'settings.skills.page.section.basicInformation',
    keywords: ['name', 'location', 'description', 'manual', 'invocation', 'autoinvoke'],
  },
  {
    id: 'skills.instructions',
    page: 'skills.installed',
    titleKey: 'settings.skills.page.section.instructions',
    keywords: ['markdown', 'skill.md', 'content'],
  },
  {
    id: 'skills.supporting-files',
    page: 'skills.installed',
    titleKey: 'settings.skills.page.section.supportingFiles',
    keywords: ['files', 'resources'],
  },
  {
    id: 'skills.catalog.source',
    page: 'skills.catalog',
    titleKey: 'settings.skills.catalog.page.section.sourceRepository',
    keywords: ['catalog', 'repository', 'source', 'refresh'],
  },
  {
    id: 'skills.catalog.search',
    page: 'skills.catalog',
    titleKey: 'settings.skills.catalog.shared.field.searchSkillsPlaceholder',
    keywords: ['find skills', 'install skills', 'catalog search'],
  },
  {
    id: 'skills.catalog.add-catalog',
    page: 'skills.catalog',
    titleKey: 'settings.skills.catalog.page.actions.addCatalog',
    keywords: ['external repository', 'add source', 'catalog'],
  },
  {
    id: 'magic-prompts.visible-prompt',
    page: 'magic-prompts',
    titleKey: 'settings.magicPrompts.page.block.visiblePrompt',
    keywords: ['prompt text', 'user message', 'template'],
  },
  {
    id: 'magic-prompts.instructions',
    page: 'magic-prompts',
    titleKey: 'settings.magicPrompts.page.block.instructions',
    keywords: ['hidden prompt', 'instructions', 'template'],
  },
  {
    id: 'magic-prompts.reset-overrides',
    page: 'magic-prompts',
    titleKey: 'settings.magicPrompts.page.actions.resetAllOverrides',
    keywords: ['reset', 'default prompts', 'overrides'],
  },
  {
    id: 'shortcuts.keyboard-shortcuts',
    page: 'shortcuts',
    titleKey: 'settings.openchamber.keyboardShortcuts.title',
    descriptionKey: 'settings.openchamber.keyboardShortcuts.tooltip',
    keywords: ['keyboard', 'hotkeys', 'bindings'],
  },
  ...getCustomizableShortcutActions()
    .filter((action) => action.category !== 'desktop')
    .map((action): SettingsSearchItem => ({
      id: shortcutSearchItemId(action.id),
      page: 'shortcuts',
      titleKey: action.settingsLabelKey,
      keywords: ['shortcut', 'hotkey', 'keyboard', 'keybinding'],
    })),
  {
    id: 'voice.playback',
    page: 'voice',
    titleKey: 'settings.voice.page.section.playbackAndSummary',
    keywords: ['tts', 'read aloud', 'voice', 'provider', 'speech rate', 'speech pitch', 'speech volume', 'tts input mode', 'markdown'],
  },
  {
    id: 'voice.speech-recognition',
    page: 'voice',
    titleKey: 'settings.voice.page.section.speechRecognition',
    keywords: ['stt', 'dictation', 'voice input', 'transcribe', 'whisper', 'parakeet', 'microphone'],
  },
  {
    id: 'tunnel.provider',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.field.provider',
    descriptionKey: 'settings.openchamber.tunnel.description',
    keywords: ['remote access', 'cloudflare', 'ngrok'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'tunnel.type',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.field.tunnelType',
    keywords: ['quick', 'managed remote', 'managed local'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'tunnel.ttl',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.field.connectLinkTtl',
    descriptionKey: 'settings.openchamber.tunnel.field.tunnelSessionTtl',
    keywords: ['expiry', 'expiration', 'session ttl', 'connect link ttl'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'tunnel.managed-remote',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.section.savedManagedRemoteTunnels',
    keywords: ['cloudflare', 'hostname', 'token', 'managed remote'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'tunnel.managed-local-config',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.field.configurationFile',
    descriptionKey: 'settings.openchamber.tunnel.note.managedLocalUsesConfig',
    keywords: ['cloudflared', 'config', 'yaml', 'json', 'managed local'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'tunnel.start',
    page: 'tunnel',
    titleKey: 'settings.openchamber.tunnel.actions.startTunnel',
    descriptionKey: 'settings.openchamber.tunnel.note.connectLinksOneTime',
    keywords: ['connect link', 'qr code', 'public url', 'remote access'],
    isAvailable: (ctx) => !ctx.enterpriseMode,
  },
  {
    id: 'notifications.delivery',
    page: 'notifications',
    titleKey: 'settings.notifications.page.delivery.title',
    keywords: ['desktop notifications', 'system notifications'],
  },
  {
    id: 'notifications.events',
    page: 'notifications',
    titleKey: 'settings.notifications.page.events.title',
    keywords: ['completion', 'subtasks', 'errors', 'questions'],
  },
  {
    id: 'notifications.push',
    page: 'notifications',
    titleKey: 'settings.notifications.page.push.title',
    keywords: ['background', 'push'],
    isAvailable: (ctx) => ctx.isWeb && !ctx.isDesktop,
  },
  {
    id: 'integrations.first-party',
    page: 'integrations',
    titleKey: 'settings.integrations.firstParty.title',
    descriptionKey: 'settings.integrations.firstParty.info',
    keywords: ['built-in', 'first-party', 'native', 'github', 'linear'],
  },
  {
    id: 'integrations.github',
    page: 'integrations',
    titleKey: 'settings.integrations.github.title',
    descriptionKey: 'settings.integrations.github.description',
    keywords: ['github', 'account', 'oauth', 'gh', 'cli', 'prs', 'pull request', 'issues', 'connect'],
  },
  {
    id: 'git.github-connect',
    page: 'integrations',
    titleKey: 'settings.github.page.actions.connect',
    keywords: ['github', 'connect', 'add account', 'oauth', 'device flow'],
  },
  {
    id: 'integrations.linear',
    page: 'integrations',
    titleKey: 'settings.integrations.linear.title',
    descriptionKey: 'settings.integrations.linear.description',
    keywords: ['linear', 'issues', 'oauth', 'connect', 'workspace'],
  },
  {
    id: 'integrations.linear.add-workspace',
    page: 'integrations',
    titleKey: 'settings.integrations.linear.actions.addWorkspace',
    descriptionKey: 'settings.integrations.linear.description',
    keywords: ['linear', 'workspace', 'add', 'connect', 'oauth'],
  },
  {
    id: 'integrations.linear.mapping',
    page: 'integrations',
    titleKey: 'settings.integrations.linear.mapping.defaultProject',
    descriptionKey: 'settings.integrations.linear.mapping.defaultProject.info',
    keywords: ['linear', 'project', 'team', 'map', 'workspace', 'directory'],
  },
  {
    id: 'integrations.third-party',
    page: 'integrations',
    titleKey: 'settings.integrations.thirdParty.title',
    descriptionKey: 'settings.integrations.thirdParty.info',
    keywords: ['plugin', 'provider', 'install', 'update', 'remove', 'subscription'],
  },
  {
    id: 'integrations.third-party.opencode-claude',
    page: 'integrations',
    titleKey: 'settings.integrations.thirdParty.opencodeClaude.name',
    descriptionKey: 'settings.integrations.thirdParty.opencodeClaude.description',
    keywords: ['claude', 'anthropic', 'claude code', 'pro', 'max', 'agent sdk', '@openchamber/opencode-claude'],
  },
  {
    id: 'integrations.extensions',
    page: 'integrations',
    titleKey: 'settings.integrations.extensionCatalog.title',
    descriptionKey: 'settings.integrations.extensionCatalog.info',
    keywords: ['extension', 'install', 'update', 'remove', 'openchamber'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'integrations.extensions.excalidraw',
    page: 'integrations',
    titleKey: 'settings.integrations.extensionCatalog.excalidraw.name',
    descriptionKey: 'settings.integrations.extensionCatalog.excalidraw.description',
    keywords: ['excalidraw', 'drawing', 'diagram', 'canvas', 'whiteboard', 'obsidian', 'sketch'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'integrations.guests',
    page: 'integrations',
    titleKey: 'settings.integrations.guests.title',
    descriptionKey: 'settings.integrations.guests.info',
    keywords: ['guest', 'extension', 'oauth', 'clickup', 'gitlab', 'panel', 'connect'],
  },
  {
    id: 'extensions.add',
    page: 'extensions',
    titleKey: 'settings.extensions.add.label',
    descriptionKey: 'settings.extensions.add.info',
    keywords: ['folder', 'path', 'zip', 'git', 'url', 'install', 'guest', 'panel'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'extensions.gitIdentity',
    page: 'extensions',
    titleKey: 'settings.extensions.identity.title',
    descriptionKey: 'settings.extensions.add.info',
    keywords: ['ssh', 'key', 'identity', 'git', 'private', 'clone', 'extension'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
  {
    id: 'extensions.updates.check',
    page: 'extensions',
    titleKey: 'settings.extensions.updates.check',
    keywords: ['update', 'upgrade', 'version', 'git', 'extension', 'guest', 'refresh'],
    isAvailable: (ctx) => !ctx.isMobile,
  },
];

const SETTINGS_SEARCH_ITEMS_BY_ID = new Map(SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item] as const));

export const isSettingsAnchorAvailable = (anchorId: string, ctx: SettingsSearchAvailabilityContext): boolean => {
  const item = SETTINGS_SEARCH_ITEMS_BY_ID.get(anchorId);
  if (!item) return false;
  const page = getSettingsPageMeta(item.page);
  return Boolean(page) && (!page?.isAvailable || page.isAvailable(ctx)) && (!item.isAvailable || item.isAvailable(ctx));
};

interface BuildSettingsSearchResultsOptions {
  query: string;
  runtimeCtx: SettingsSearchAvailabilityContext;
  visiblePageSlugs?: SettingsPageSlug[];
  t: (key: I18nKey) => string;
  getPageTitle: (slug: SettingsPageSlug) => string;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function buildSettingsSearchResults({
  query,
  runtimeCtx,
  visiblePageSlugs,
  t,
  getPageTitle,
}: BuildSettingsSearchResultsOptions): SettingsSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const allowedPages = visiblePageSlugs ? new Set<SettingsPageSlug>(visiblePageSlugs) : null;
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);

  return SETTINGS_SEARCH_ITEMS.flatMap((item) => {
    if (allowedPages && !allowedPages.has(item.page)) {
      return [];
    }

    const pageMeta = getSettingsPageMeta(item.page);
    if (!pageMeta || (pageMeta.isAvailable && !pageMeta.isAvailable(runtimeCtx)) || (item.isAvailable && !item.isAvailable(runtimeCtx))) {
      return [];
    }

    const title = t(item.titleKey);
    const description = item.descriptionKey ? t(item.descriptionKey) : null;
    const haystack = normalizeSearchText([
      title,
      description,
      getPageTitle(item.page),
      ...(item.keywords ?? []),
    ].filter(Boolean).join(' '));

    if (!terms.every((term) => haystack.includes(term))) {
      return [];
    }

    return [{
      ...item,
      title,
      description,
      pageTitle: getPageTitle(item.page),
    }];
  });
}

/** Static anchors used to seed the first-install baseline. */
export const SETTINGS_ANCHOR_PAGES: ReadonlyMap<string, SettingsPageSlug> = new Map(
  SETTINGS_SEARCH_ITEMS.map((item) => [item.id, item.page] as const),
);

export const getAvailableSettingsAnchorPages = (ctx: SettingsSearchAvailabilityContext): ReadonlyMap<string, SettingsPageSlug> => new Map(
  SETTINGS_SEARCH_ITEMS.filter((item) => {
    const page = getSettingsPageMeta(item.page);
    return page && (!page.isAvailable || page.isAvailable(ctx)) && (!item.isAvailable || item.isAvailable(ctx));
  }).map((item) => [item.id, item.page] as const),
);
