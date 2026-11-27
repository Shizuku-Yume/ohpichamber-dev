import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionInventory } from '@openchamber/agent-contract';
import { filterPluginCapabilities } from '@/components/sections/plugins/pluginCapabilities';

/**
 * Settings layout guard.
 *
 * Settings rows and section spacing come from the named classes in
 * `shared/SettingsSection.tsx`; layout.md and PATTERNS.md explain why (one row
 * pattern, one control width, one spacing scale, container queries only). This
 * test enforces that by scanning the JSX under `components/sections` and
 * rejecting the ad-hoc utilities that produced the ragged right column, the
 * doubled section rhythm and the drifting gaps.
 *
 * Rules, each reported with file:line:
 *
 * - W  a raw width utility (`w-48`, `w-[…]`, `w-fit`, `max-w-md`, `min-w-[1rem]`,
 *      with or without a variant prefix) on a settings control — SelectTrigger,
 *      Input, Textarea, NumberInput, the model/agent/project pickers — or in
 *      `controlClassName`/`containerClassName`/`triggerClassName`. `w-full`,
 *      `min-w-0`, `max-w-none` and `max-w-full` only say "fill", "may shrink"
 *      or "stay in the column", so they stay allowed.
 * - S  a `space-y-*` wrapper around `SettingsSection` children: sections own
 *      their vertical rhythm (`py-8`), so a page must not stack them again.
 *      `space-y-0` is the documented "no extra spacing" spelling and passes.
 * - P  page padding on `SettingsPageLayout`: the page layout owns it
 *      (`px-6 @3xl:px-12`).
 * - B  a viewport breakpoint (`sm:`/`md:`/`lg:`/`xl:`/`2xl:`) in settings pane
 *      content. The pane is much narrower than the viewport, so its content
 *      responds with container queries (`@xl:`, `@3xl:`). Hover-only opacity
 *      affordances pass: there the prefix selects desktop pointer behaviour
 *      (`md:group-hover:opacity-100`), not a pane width. A modal dialog sizes
 *      to the window, so elements under a `Dialog`/`AlertDialog` pass.
 * - N  `SETTINGS_WIDTH_NUMBER_CLASS` applied outside a
 *      `SETTINGS_NUMBER_STEPPER_ROW_CLASS` row: the fixed width exists to size a
 *      stepper, and a bare one leaves a stub on the line.
 * - G  spacing utilities where the named classes own the decision: margin
 *      (`mt-2`, `mb-4`, `mx-auto`, …), non-zero `gap-*` and non-zero
 *      `space-x-/space-y-*` on a settings control, on a
 *      `SettingsFieldRow`/`SettingsStackedField`/`SettingsCheckboxRow`, or a
 *      non-zero `space-y-*` in a `SettingsSection`/`SettingsControlGroup`
 *      `contentClassName`. Zero values (`m-0`, `gap-0`, `space-y-0`) and
 *      generic wrappers (a `div` may carry its own gap) stay allowed.
 * - F/M/T/X  raw HTML form tags, manual Save/Apply chrome on autosave pages,
 *            untranslated row labels, and boxed/padded row chrome.
 *
 * Rule A (search-index <-> `data-settings-item` anchor parity) lives in
 * `settingsSearchAnchors.test.ts` so layout scans stay decoupled from the search
 * registry.
 * File exceptions are listed with their reason below and stay narrow:
 * navigation/sidebar chrome (layout.md "Exception"), the project settings
 * dialog shell, and two shared editors that are not settings field rows.
 * `shared/SettingsSection.tsx` is excluded because it defines the vocabulary.
 *
 * The scan is only as good as the lexer, so two checks keep it honest. Every
 * scanned file must parse to EOF with each element finding its own closing
 * tag: a hole (a regex literal holding a quote, an arrow generic read as JSX)
 * used to swallow the rest of the file silently, and now fails by name. And
 * for every file that has a control, the test appends a raw width and injects
 * one mid-file, asserting both are found; a region the lexer skips cannot
 * pass both.
 */

const SECTIONS_ROOT = dirname(fileURLToPath(import.meta.url));
const COMPONENTS_ROOT = dirname(SECTIONS_ROOT);

/**
 * Settings-pane views rendered by settings pages outside `components/sections`
 * (Usage page embeds `UsageStatsReport`; Skills page embeds `PreviewToggleButton`;
 * Repository bindings embed `GitOperationStatus`; About page embeds `ReleaseNotesBody`).
 */
const PANE_VIEW_SOURCES: readonly string[] = [
  'views/usage/UsageStatsView.tsx',
  'views/PreviewToggleButton.tsx',
  'views/git/GitOperationStatus.tsx',
  'update/ReleaseNotesBody.tsx',
];

const RULES = ['W', 'S', 'P', 'B', 'N', 'G', 'F', 'M', 'T', 'X'] as const;
type Rule = (typeof RULES)[number];

/** Attributes that carry class names for a control or its wrapper. */
const CLASS_ATTRS = new Set([
  'className',
  'controlClassName',
  'containerClassName',
  'triggerClassName',
  'contentClassName',
]);

/** Components that are settings controls (or the trigger of one). */
const CONTROL_TAGS = new Set([
  'Input',
  'Textarea',
  'NumberInput',
  'Select',
  'SelectTrigger',
  'ModelSelector',
  'AgentSelector',
  'SettingsProjectSelector',
  'SettingsColorField',
  'SortableTabsStrip',
]);
/** Row primitives: their own padding/stack is the row contract, not the page's. */
const ROW_TAGS = new Set([
  'SettingsFieldRow',
  'SettingsStackedField',
  'SettingsCheckboxRow',
]);

/** Clusters whose content stack is a named `SETTINGS_SPACE_*` decision. */
const CONTENT_STACK_TAGS = new Set([
  'SettingsSection',
  'SettingsControlGroup',
]);

/** Width tokens that only say "fill", "may shrink" or "stay in the column". */
const NEUTRAL_WIDTH_TOKENS = new Set([
  'w-full',
  'min-w-0',
  'max-w-none',
  'max-w-full',
]);

/**
 * Sanctioned raw-HTML form tags (rule F): file/colour pickers and range
 * sliders have no shared primitive; bespoke list-row, disclosure, swatch and
 * entity-selection toggles and explicit non-autosave submit `<form>`s keep a
 * documented exemption each. Every other lowercase `<input>`, `<button>`,
 * `<select>`, `<textarea>` or `<form>` in a settings section must use the
 * shared control primitives.
 */
const RAW_FORM_EXEMPTIONS = new Map(Object.entries({
  // Hidden pickers / sliders with no shared primitive.
  'openchamber/ThemeImportButton.tsx': {
    tags: ['input'], inputTypes: ['file'],
    reason: 'hidden <input type="file"> theme file picker; no shared primitive exists',
  },
  'openchamber/TunnelSettings.tsx': {
    tags: ['button', 'input'], inputTypes: ['file'],
    reason: 'managed-local <input type="file"> config picker and inline text-link toggles; no shared primitive',
  },
  'openchamber/VoiceSettings.tsx': {
    tags: ['input'], inputTypes: ['range'],
    reason: '<input type="range"> sliders for speech rate/pitch/volume; the shared kit has no slider',
  },
  'extensions/ExtensionsPage.tsx': {
    tags: ['input'], inputTypes: ['file'],
    reason: 'hidden <input type="file"> extension .zip picker; no shared primitive exists',
  },
  'providers/ProviderLogoImageControl.tsx': {
    tags: ['input'], inputTypes: ['file'],
    reason: 'hidden <input type="file"> provider logo picker; no shared primitive exists',
  },
  'shared/SettingsColorField.tsx': {
    tags: ['button', 'input'], inputTypes: ['color'],
    reason: 'colour-swatch picker: button swatches + hidden <input type="color">; a bespoke widget, not a field row',
  },
  // Bespoke toggle/disclosure/picker widgets shared primitives do not cover.
  'shared/SettingsCards.tsx': {
    tags: ['button'],
    reason: 'SettingsCard/AddCard card-toggle: the whole card is the hit target, not a form field',
  },
  'shared/SettingsInfoHint.tsx': {
    tags: ['button'],
    reason: 'info-hint icon toggle: a disclosure trigger, not a form field',
  },
  'shared/SettingsProjectSelector.tsx': {
    tags: ['button'],
    reason: 'project switcher chip toggle: a bespoke picker control, not a form field',
  },
  'shared/SettingsSidebarItem.tsx': {
    tags: ['button'],
    reason: 'navigation list-item toggle in the settings nav column, not pane content',
  },
  'shared/EnvironmentVariablesEditor.tsx': {
    tags: ['form'],
    reason: 'bespoke name/value row editor: each row is an explicit non-autosave submit, not a settings form',
  },
  // Entity list-row selection toggles (no shared sidebar list-item primitive exists).
  'agents/AgentsSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar entity-list selection row; matches the Commands/Skills/Snippets sidebar pattern',
  },
  'agents/ModelSelector.tsx': {
    tags: ['button'],
    reason: 'mobile model-picker dropdown trigger toggle; a bespoke picker, not a form field',
  },
  'model-roles/ImageModelSelector.tsx': {
    tags: ['button'],
    reason: 'mobile image-model dropdown trigger toggle; a bespoke picker, not a form field',
  },
  'commands/CommandsSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar entity-list selection row; matches the sibling sidebar pattern',
  },
  'magic-prompts/MagicPromptsSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar entity-list selection row; matches the sibling sidebar pattern',
  },
  'skills/SkillsSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar entity-list selection row; matches the sibling sidebar pattern',
  },
  'skills/catalog/SkillsCatalogPage.tsx': {
    tags: ['button'],
    reason: 'catalog entry/disclosure toggles inside the skills browser, not form fields',
  },
  'snippets/SnippetsSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar entity-list selection row; matches the sibling sidebar pattern',
  },
  'usage/UsageSidebar.tsx': {
    tags: ['button'],
    reason: 'sidebar list-item selection row, not pane content',
  },
  'update/ReleaseNotesBody.tsx': {
    tags: ['button'],
    reason: 'changelog show-more/show-less text toggles, not form fields',
  },
  // Explicit non-autosave submit lifecycles.
  'providers/CustomProviderForm.tsx': {
    tags: ['form'],
    reason: 'explicit connect-form submit lifecycle (not an autosave page)',
  },
  'providers/ProviderAccounts.tsx': {
    tags: ['form'],
    reason: 'account add/edit runs an explicit submit lifecycle, not autosave',
  },
  'providers/ProviderOAuthMethods.tsx': {
    tags: ['form'],
    reason: 'OAuth manual-input code entry runs an explicit submit lifecycle',
  },
  'providers/CustomProviderModelRow.tsx': {
    tags: ['button'],
    reason: 'per-model disclosure expander row; a bespoke list item, not a form field',
  },
  'providers/ProviderConnectPicker.tsx': {
    tags: ['button'],
    reason: 'provider connect grid rows: one labelled toggle per provider, not a form field',
  },
  'routing/CreateRoutingCategoryDialog.tsx': {
    tags: ['form'],
    reason: 'category create form runs an explicit dialog submit lifecycle',
  },
  'projects/ProjectEnvironmentSection.tsx': {
    tags: ['form'],
    reason: 'environment variable add runs an explicit submit lifecycle',
  },
  'projects/ProjectActionsTab.tsx': {
    tags: ['button'],
    reason: 'project action list-row edit toggle, not a form field',
  },
  'projects/ProjectActionEditorDialog.tsx': {
    tags: ['button'],
    reason: 'editor dialog disclosure/control toggles, not form fields',
  },
  // Feature-specific bespoke toggles.
  'classification/JevAccessNote.tsx': {
    tags: ['button'],
    reason: 'inline access-note acknowledge link, not a form field',
  },
  'openchamber/InstanceServiceUrls.tsx': {
    tags: ['button'],
    reason: 'service-URL external-link chips, not form fields',
  },
  'openchamber/WorktreeSectionContent.tsx': {
    tags: ['button'],
    reason: 'worktree list-row action toggles, not form fields',
  },
  'plugins/ExtensionControlCenter.tsx': {
    tags: ['button'],
    reason: 'extension permission/control toggles, not form fields',
  },
  'git-identities/GitIdentityEditorDialog.tsx': {
    tags: ['button'],
    reason: 'identity colour/scope picker toggles inside the editor dialog, not form fields',
  },
  'remote-instances/RemoteInstancesPage.tsx': {
    tags: ['form', 'button'],
    reason: 'pairing/SSH host dialogs run an explicit submit lifecycle outside the autosave contract',
  },
}));

/**
 * Rule F exempts a tag only when it is one of the sanctioned kinds listed
 * for the file: `<input type="file">`, `<input type="range">` and
 * `<input type="color">` pass, while any other raw control in the same file
 * still fails.
 */
const RAW_FORM_SANCTIONED_INPUT_TYPES = new Set(['file', 'range', 'color']);

/** Autosave contract sources: these pages save silently; a success toast or a
 * manual Save/Apply button reintroduces the chrome the contract removed. */
const AUTOSAVE_SOURCE_MARKERS = ['useAutosave', 'useOmpPageSettings', 'reportSettingsSaveState'];

/**
 * Rule M exemptions: lifecycle confirmation buttons that are not ordinary
 * saves (a Create draft, a write-only secret confirmation, the Plugins page's
 * single Apply), each documented. A file pattern matches the element when its
 * rendered text names one of `actions`.
 */
const SAVE_BUTTON_EXEMPTIONS: ReadonlyArray<{ file: RegExp; actions: readonly string[]; reason: string }> = [
  {
    file: /(^|\/)plugins\/PluginsPage\.tsx$/,
    actions: ['settings.plugins.action.apply'],
    reason: 'one explicit Apply lifecycle action for pending plugin/extension changes',
  },
  {
    file: /(^|\/)mcp\/McpPage\.tsx$/,
    actions: ['settings.common.actions.saveChanges'],
    reason: 'key/value env+header editors hold a local pending buffer; saveChanges commits the buffer, not an autosaved field',
  },
];

/**
 * Rule M toast exemptions: an entity/credential lifecycle confirmation is not
 * the redundant "settings saved" toast the rule bans. Each entry keys on the
 * i18n key inside the `toast.success(...)` call so a new non-lifecycle toast
 * in the same file still fails.
 */
const TOAST_EXEMPTIONS: ReadonlyArray<{ file: RegExp; keys: RegExp; reason: string }> = [
  {
    file: /(^|\/)agents\/AgentsPage\.tsx$/,
    keys: /\.created'/,
    reason: 'agent create lifecycle confirmation, not a settings-field save',
  },
  {
    file: /(^|\/)commands\/CommandsPage\.tsx$/,
    keys: /\.created'/,
    reason: 'command create lifecycle confirmation',
  },
  {
    file: /(^|\/)integrations\/GuestIntegrationsSection\.tsx$/,
    keys: /\.(?:connected|disconnected)'/,
    reason: 'guest connect/disconnect lifecycle confirmation',
  },
  {
    file: /(^|\/)integrations\/NotificationChannelCard\.tsx$/,
    keys: /\.(?:connected|disconnected)'/,
    reason: 'notification channel connect/disconnect lifecycle confirmation',
  },
  {
    file: /(^|\/)integrations\/TrackerSettings\.tsx$/,
    keys: /toast(?:Connected|AccountSwitched|Disconnected)\b/,
    reason: 'tracker account connect/switch/disconnect lifecycle confirmation',
  },
  {
    file: /(^|\/)mcp\/McpPage\.tsx$/,
    keys: /\.configImported'/,
    reason: 'config import lifecycle confirmation',
  },
  {
    file: /(^|\/)plugins\/PluginsPage\.tsx$/,
    keys: /\.(?:deleted|installed|done|none)'/,
    reason: 'plugin install/update/upgrade/delete lifecycle confirmation',
  },
  {
    file: /(^|\/)skills\/SkillsPage\.tsx$/,
    keys: /(?:skillCreated|fileUpdated|fileAdded|fileRemoved|fileDeleted|fileCreated)'/,
    reason: 'skill create and supporting-file entity lifecycle confirmation',
  },
  {
    file: /(^|\/)websearch\/WebSearchPage\.tsx$/,
    keys: /\.keySaved'/,
    reason: 'provider API-key credential write confirmation, not a settings-field save',
  },
];

/**
 * Rule T exemptions: a `label` bound to a model/entity key rather than a
 * fixed `t(...)` literal. Each names the file and the prop expression.
 */
const LABEL_EXEMPTIONS: ReadonlyArray<{ file: RegExp; reason: string }> = [
  {
    file: /(^|\/)model-roles\/ModelRolesPage\.tsx$/,
    reason: 'role label comes from settings.omp.modelRoles.role.<role>.label, keyed by the rendered role',
  },
  {
    file: /(^|\/)shared\/(?:ModelRoleEditor|ModelRoleLinkRow|OmpRowControl)\.tsx$/,
    reason: 'shared row primitive receives an already-translated label from the caller',
  },
  {
    file: /(^|\/)openchamber\/(?:ModelCompactionSettings|InstanceServiceUrls)\.tsx$/,
    reason: 'label resolves a t() call assigned to a named variable just above the row',
  },
  {
    file: /(^|\/)shared\/OmpReadSummaryPresetRow\.tsx$/,
    reason: 'label resolves a t() call assigned to a named variable just above the row',
  },
  {
    file: /(^|\/)integrations\/TrackerProjectMapping\.tsx$/,
    reason: 'label renders the remote tracker team name (entity data, not translatable copy)',
  },
  {
    file: /(^|\/)providers\/CustomProviderModelRow\.tsx$/,
    reason: 'label renders a fixed modality enum (text/image/audio/…) entity key, not translatable copy',
  },
  {
    file: /(^|\/)shared\/SettingsSortableVisibilityList\.tsx$/,
    reason: 'label is item.label supplied already-translated by each caller',
  },
  {
    file: /(^|\/)classification\/(?:ClassificationProvidersPage|CustomEndpointFields)\.tsx$/,
    reason: 'label={null} deliberately renders an unlabeled continuation row',
  },
  {
    file: /(^|\/)plugins\/PluginsPage\.tsx$/,
    reason: 'feature flags are plugin-declared capability names, not translatable copy',
  },
  {
    file: /(^|\/)openchamber\/PasskeySettings\.tsx$/,
    reason: 'label renders user-supplied passkey.label entity data or inline rename Input',
  },
  {
    file: /(^|\/)agents\/AgentPermissionsEditor\.tsx$/,
    reason: 'label resolves tool name from t(TOOL_NAME_KEYS[id]) or tool.name entity identifier',
  },
];

/**
 * Rule X exemptions: elements whose chrome is the documented exception —
 * `SettingsCard`/`SettingsCardPill` grids, a status callout, an icon badge, a
 * `kbd` shortcut chip, a `pre`/`code` preview block, or a native `<input>`
 * slider (rule F) — keep their token.
 */
const CHROME_ALLOWED_TAGS = new Set([
  'SettingsCard',
  'SettingsCardPill',
  'SettingsCardChip',
  'SettingsAddCard',
  'IntegrationCatalogCard',
  'kbd',
  'pre',
  'code',
  'input',
]);


/** Row-level primitives: a number stepper belongs inside the row's own band. */
const ROW_BOUNDARY_TAGS = new Set([
  'SettingsSection',
  'SettingsFieldRow',
  'SettingsStackedField',
  'SettingsControlGroup',
  'SettingsTwoColumn',
  'SettingsPageLayout',
]);

const NUMBER_WIDTH_CLASS = 'SETTINGS_WIDTH_NUMBER_CLASS';
const NUMBER_STEPPER_ROW_CLASS = 'SETTINGS_NUMBER_STEPPER_ROW_CLASS';

const VIEWPORT_BREAKPOINT = /^(?:sm|md|lg|xl|2xl):(.+)$/;
const HOVER_OPACITY = /^(?:sm|md|lg|xl|2xl):(?:(?:group-hover|hover|focus|focus-visible):)?opacity-/;
/** Modal chrome sizes to the viewport; its body still follows the pane rules. */
const DIALOG_CHROME_TAG = /^(?:Dialog|AlertDialog)/;

interface FileException {
  readonly match: RegExp;
  /** Rules the file is exempt from; omit for every rule. */
  readonly rules?: readonly Rule[];
  readonly reason: string;
}

const FILE_EXCEPTIONS: readonly FileException[] = [
  {
    match: /(^|\/)[A-Za-z0-9]*Sidebar\.tsx$/,
    rules: ['W', 'S', 'P', 'B', 'N', 'G', 'T', 'X'],
    reason: 'navigation chrome outside the pane (layout.md Exception); its bespoke list-toggle `<button>` is still rejected by F',
  },
  {
    match: /(^|\/)SettingsSidebar(?:Item|Layout|Search)?\.tsx$/,
    rules: ['W', 'S', 'P', 'B', 'N', 'G', 'T', 'X'],
    reason: 'navigation chrome outside the pane (layout.md Exception)',
  },
  {
    match: /(^|\/)ProjectSettings(?:Panel|Header)\.tsx$/,
    reason: 'project settings dialog shell: header and tab strip are modal chrome',
  },
  {
    match: /(^|\/)shared\/SettingsColorField\.tsx$/,
    rules: ['W'],
    reason: 'hex field is sized to a #RRGGBB swatch, not to a settings field row',
  },
  {
    match: /(^|\/)shared\/EnvironmentVariablesEditor\.tsx$/,
    rules: ['W'],
    reason: 'bespoke name/value row editor, not a settings field row',
  },
  {
    match: /(^|\/)shared\/SettingsCards\.tsx$/,
    rules: ['X'],
    reason: 'SettingsCard grid is the sanctioned card-chrome owner (PATTERNS.md)',
  },
];

interface JsxAttr {
  readonly name: string;
  /** Raw value source, quotes or braces included; empty for a bare attribute. */
  readonly raw: string;
  readonly start: number;
}

interface JsxElement {
  readonly tag: string;
  readonly attrs: readonly JsxAttr[];
  readonly start: number;
  end: number;
  readonly parent: JsxElement | null;
  /** Elements in child position (not ones nested in an attribute expression). */
  readonly children: JsxElement[];
  /** Set when the element never found its own closing tag. */
  validationError?: boolean;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly rule: Rule;
  readonly detail: string;
}

interface ParseResult {
  /** Every element the lexer saw, in document order. */
  readonly elements: JsxElement[];
  /** False when a string, comment, tag or brace ran past EOF or closed wrong. */
  readonly complete: boolean;
}

interface ScanContext {
  readonly elements: JsxElement[];
  truncated: boolean;
}

const TAG_NAME_PART = /[\w$.:-]/;

function isNamePart(character: string | undefined): boolean {
  return character !== undefined && TAG_NAME_PART.test(character);
}

/** Skip a quoted string or template literal, including `${…}` code in a template. */
function scanString(
  source: string,
  start: number,
  limit: number,
  parent: JsxElement | null,
  context: ScanContext,
): number {
  const quote = source[start];
  let index = start + 1;
  while (index < limit) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === quote) return index + 1;
    if (quote === '`' && character === '$' && source[index + 1] === '{') {
      index = scanCode(source, index + 2, limit, parent, context, true);
      continue;
    }
    index += 1;
  }
  context.truncated = true;
  return limit;
}

/**
 * A `/` starts a regex rather than a division when the previous token cannot
 * end an expression. Without this, a regex body containing a quote or a
 * backtick (`/[^!#$%&'*+._`|~]/g`) is read as a string and swallows the file.
 */
function isRegexAllowed(source: string, slashIndex: number): boolean {
  let previous = slashIndex - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (previous < 0) return true;

  const character = source[previous];
  if ('(,=:[!&|?{};+-*%<>~^'.includes(character)) return true;
  if (!/[A-Za-z_$]/.test(character)) return false;

  let wordStart = previous;
  while (wordStart > 0 && /[A-Za-z_$]/.test(source[wordStart - 1])) wordStart -= 1;
  return /^(?:return|typeof|instanceof|case|in|of|new|delete|void|do|else|yield|await|throw)$/
    .test(source.slice(wordStart, previous + 1));
}

function skipRegex(source: string, start: number): number {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '\n') return index;
    if (character === '[') inCharacterClass = true;
    else if (character === ']') inCharacterClass = false;
    else if (character === '/' && !inCharacterClass) {
      index += 1;
      while (index < source.length && /[a-z]/i.test(source[index])) index += 1;
      return index;
    }
    index += 1;
  }
  return index;
}

/**
 * True when `<` at `index` starts a JSX element rather than a comparison or a
 * type argument list: the tag name must follow the angle bracket, and the
 * preceding token must not be an identifier or number (`Array<string>`,
 * `count < 5`).
 */
function isJsxStart(source: string, index: number): boolean {
  let after = index + 1;
  while (after < source.length && /\s/.test(source[after])) after += 1;
  if (source[after] === '>') return true;
  if (after >= source.length || !/[A-Za-z_$]/.test(source[after])) return false;

  let previous = index - 1;
  while (previous >= 0 && /\s/.test(source[previous])) previous -= 1;
  if (previous < 0) return true;

  const character = source[previous];
  if (!/[\w$]/.test(character)) return true;

  // `return <p>`, `yield <X>`, `default <Y>`, `else <Z>`: a keyword can end a
  // statement and still be followed by JSX.
  let wordStart = previous;
  while (wordStart > 0 && /[A-Za-z_$]/.test(source[wordStart - 1])) wordStart -= 1;
  return /^(?:return|yield|default|else|do|await|case|throw)$/.test(source.slice(wordStart, previous + 1));
}

/**
 * Scan JavaScript (and the JSX inside it) from `start` to `limit`.
 * `stopAtBrace` ends the scan after the matching `}` (the caller consumed the
 * opening brace), so an attribute expression, a child expression and a code
 * block all recurse through here.
 */
function scanCode(
  source: string,
  start: number,
  limit: number,
  parent: JsxElement | null,
  context: ScanContext,
  stopAtBrace: boolean,
): number {
  let index = start;
  while (index < limit) {
    const character = source[index];

    if (character === '/') {
      const next = source[index + 1];
      if (next === '/') {
        const newline = source.indexOf('\n', index);
        index = newline < 0 || newline >= limit ? limit : newline + 1;
        continue;
      }
      if (next === '*') {
        const close = source.indexOf('*/', index + 2);
        if (close < 0) {
          context.truncated = true;
          return limit;
        }
        index = close + 2;
        continue;
      }
      if (isRegexAllowed(source, index)) {
        index = skipRegex(source, index);
        continue;
      }
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      index = scanString(source, index, limit, parent, context);
      continue;
    }

    if (character === '{') {
      index = scanCode(source, index + 1, limit, parent, context, true);
      continue;
    }

    if (character === '}') {
      if (stopAtBrace) return index + 1;
      index += 1;
      continue;
    }

    if (character === '<' && isJsxStart(source, index)) {
      const next = readElement(source, index, parent, context);
      index = next ?? index + 1;
      continue;
    }

    index += 1;
  }

  if (stopAtBrace) context.truncated = true;
  return index;
}

/**
 * Read the children of an open element up to and including its closing tag.
 * Returns `-1` when this was not a real element after all (no matching close),
 * so the caller can fall back to reading the `<` as text: a generic arrow
 * (`<Item extends Row>(…)`) must not swallow the rest of the file.
 */
function readChildren(source: string, start: number, parent: JsxElement, context: ScanContext): number {
  const limit = source.length;
  let index = start;

  while (index < limit) {
    const character = source[index];

    if (character === '<') {
      if (source[index + 1] === '/') {
        const close = source.indexOf('>', index + 2);
        if (close < 0) {
          markUnbalanced(parent);
          return -1;
        }
        if (parent.tag.length > 0 && source.slice(index + 2, close).trim() !== parent.tag) {
          markUnbalanced(parent);
          return -1;
        }
        return close + 1;
      }
      if (isJsxStart(source, index)) {
        const next = readElement(source, index, parent, context);
        index = next ?? index + 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (character === '{') {
      const next = scanCode(source, index + 1, limit, parent, context, true);
      if (next < 0) return -1;
      index = next;
      continue;
    }

    // JSX text: quotes, `//` and backticks here are literal characters.
    index += 1;
  }

  markUnbalanced(parent);
  return -1;
}

/**
 * A JSX-looking `<` in prose (`a < b`) never finds a closing tag; only a real
 * element (a component name or any tag with attributes) makes a lost position
 * an error worth failing on.
 */
function markUnbalanced(element: JsxElement): void {
  if (/^[A-Z]/.test(element.tag) || element.attrs.length > 0) element.validationError = true;
}

/** Read one element (opening tag, attributes, children) starting at `<`. */
function readElement(
  source: string,
  start: number,
  parent: JsxElement | null,
  context: ScanContext,
): number | null {
  const limit = source.length;
  const attrs: JsxAttr[] = [];
  let sawTypeParameterModifier = false;

  let index = start + 1;
  while (index < limit && /\s/.test(source[index])) index += 1;
  const nameStart = index;
  while (index < limit && isNamePart(source[index])) index += 1;
  const tag = source.slice(nameStart, index);
  const node: JsxElement = { tag, attrs, start, end: start, parent, children: [] };
  const elementMark = context.elements.length;
  const childMark = parent === null ? 0 : parent.children.length;

  // A node is registered only once its tag closed, so a rejected speculative
  // element leaves no trace in the tree.
  const register = (): void => {
    context.elements.push(node);
    if (parent !== null) parent.children.push(node);
  };
  const rollback = (): null => {
    context.elements.length = elementMark;
    if (parent !== null) parent.children.length = childMark;
    return null;
  };

  // A generic element (`<Select<RemoteTransportType> …>`) carries a type
  // argument list between the tag name and its attributes.
  if (source[index] === '<') {
    let depth = 0;
    while (index < limit) {
      const character = source[index];
      if (character === '{') {
        index = scanCode(source, index + 1, limit, node, context, true);
        continue;
      }
      if (character === '<') depth += 1;
      if (character === '>') {
        depth -= 1;
        if (depth === 0) {
          index += 1;
          break;
        }
      }
      index += 1;
    }
  }

  while (index < limit) {
    while (index < limit && /\s/.test(source[index])) index += 1;
    if (index >= limit) return rollback();

    const character = source[index];
    // Comments may sit between attributes.
    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline < 0 || newline >= limit ? limit : newline + 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      if (close < 0) return rollback();
      index = close + 2;
      continue;
    }
    if (character === '/' && source[index + 1] === '>') {
      node.end = index + 2;
      register();
      return index + 2;
    }
    if (character === '>') {
      // `<T extends X>(…)` and `<T,>(…)` are type-parameter lists on an arrow
      // function, not elements. The speculative read fails to find a matching
      // closing tag and rolls back; `extends` and the `,` reject immediately.
      if (sawTypeParameterModifier) return rollback();
      const end = readChildren(source, index + 1, node, context);
      if (end < 0) return rollback();
      node.end = end;
      register();
      return end;
    }
    if (character === '{') {
      // Spread attribute: `{...props}`. JSX may be nested in the expression.
      index = scanCode(source, index + 1, limit, node, context, true);
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      index = scanString(source, index, limit, node, context);
      continue;
    }
    if (!isNamePart(character)) {
      // Not a tag after all (a stray `<` in text, a generic arrow): the caller
      // reads the `<` as text. The class-attribute count catches a real drop.
      return rollback();
    }

    const attrStart = index;
    while (index < limit && isNamePart(source[index])) index += 1;
    const name = source.slice(attrStart, index);
    while (index < limit && /\s/.test(source[index])) index += 1;

    if (source[index] !== '=') {
      if (name === 'extends') sawTypeParameterModifier = true;
      attrs.push({ name, raw: '', start: attrStart });
      continue;
    }

    index += 1;
    while (index < limit && /\s/.test(source[index])) index += 1;
    const valueStart = index;

    if (source[index] === '"' || source[index] === "'") {
      index = scanString(source, index, limit, node, context);
    } else if (source[index] === '{') {
      // The expression is scanned as code, so JSX inside it is found with this
      // element as its parent (headerAction, headerEnd, label, render props).
      index = scanCode(source, index + 1, limit, node, context, true);
    } else {
      while (index < limit && isNamePart(source[index])) index += 1;
    }
    attrs.push({ name, raw: source.slice(valueStart, index), start: attrStart });
  }

  return rollback();
}

function parseJsx(source: string): ParseResult {
  const context: ScanContext = { elements: [], truncated: false };
  const consumed = scanCode(source, 0, source.length, null, context, false);
  const lostPlace = context.elements.some((element) => element.validationError === true);
  const complete = consumed >= source.length && !context.truncated && !lostPlace;
  return { elements: context.elements, complete };
}

/** Every string literal inside an attribute value, template parts included. */
function stringLiterals(raw: string): string[] {
  const literals: string[] = [];
  let index = 0;
  while (index < raw.length) {
    const quote = raw[index];
    if (quote !== '"' && quote !== "'" && quote !== '`') {
      index += 1;
      continue;
    }
    let buffer = '';
    index += 1;
    while (index < raw.length) {
      const character = raw[index];
      if (character === '\\') {
        buffer += raw[index + 1] ?? '';
        index += 2;
        continue;
      }
      if (character === quote) {
        index += 1;
        break;
      }
      buffer += character;
      index += 1;
    }
    literals.push(buffer);
  }
  return literals;
}

/** Class tokens an attribute contributes, whether a literal or an expression. */
function classTokens(raw: string): string[] {
  if (raw.length === 0) return [];
  const texts = raw[0] === '"' || raw[0] === "'"
    ? [raw.slice(1, -1)]
    : stringLiterals(raw);
  // `cn('a', cond && 'b')` yields quoted fragments; split on quote characters
  // too so a class inside a nested literal is still one token.
  return texts.flatMap((text) => text.split(/[\s'"`]+/).filter((token) => token.length > 0));
}

/** Utility name with variant prefixes (`@xl:`, `md:`, `hover:`) removed. */
function baseUtility(token: string): string {
  let bracketDepth = 0;
  let lastColon = -1;
  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === ':' && bracketDepth === 0) lastColon = index;
  }
  return lastColon < 0 ? token : token.slice(lastColon + 1);
}

function isRawWidthToken(token: string): boolean {
  const utility = baseUtility(token);
  if (NEUTRAL_WIDTH_TOKENS.has(utility)) return false;
  return /^w-(\d+(?:\.\d+)?|px|fit|auto|min|max|screen|\[\S+\]|\d+\/\d+)$/.test(utility)
    || /^max-w-/.test(utility)
    || /^min-w-/.test(utility);
}

/** Margin, gap and stack utilities; a zero value is neutral. */
function isSpacingUtility(token: string): boolean {
  const utility = baseUtility(token).replace(/^-/, '');
  const match = /^(m[trblxyse]?|gap(?:-[xy])?|space-[xy])-(.+)$/.exec(utility);
  if (match === null) return false;
  return match[2] !== '0';
}

/** Non-zero `space-y-*` only (the documented section/group stack decision). */
function isVerticalStackUtility(token: string): boolean {
  const utility = baseUtility(token);
  return /^space-y-/.test(utility) && utility !== 'space-y-0';
}

/** Lowercase form tags rule F rejects outside the sanctioned file/tag pairs. */
const RAW_FORM_TAGS = new Set([
  'input',
  'button',
  'select',
  'textarea',
  'form',
]);

function rawFormExempted(file: string, element: JsxElement): string | null {
  const entry = RAW_FORM_EXEMPTIONS.get(file);
  if (entry === undefined || !entry.tags.includes(element.tag)) return null;
  if (element.tag === 'input') {
    const type = element.attrs.find((attr) => attr.name === 'type');
    const typeValue = type === undefined || type.raw.replace(/["'{}]/g, '') === '' ? 'text' : type.raw.replace(/["'{}]/g, '');
    const allowed = entry.inputTypes ?? [...RAW_FORM_SANCTIONED_INPUT_TYPES];
    if (!allowed.includes(typeValue)) return null;
  }
  return entry.reason;
}

/** A `<Button>` counts as a manual save when its text names a save/apply action. */
const SAVE_ACTION_PATTERN = /actions\.(?:save|apply|saveChanges)|\.action\.apply\b|(?:common|actions)\.(?:save|apply|saveChanges)\b|['"]\s*(?:Save|Apply)(?:\s+changes)?\s*['"]|>\s*(?:Save|Apply)(?:\s+Changes)?\s*</i;

function saveButtonExempted(file: string, element: JsxElement, source: string): string | null {
  const text = source.slice(element.start, element.end);
  for (const exemption of SAVE_BUTTON_EXEMPTIONS) {
    if (!exemption.file.test(file)) continue;
    if (exemption.actions.some((action) => text.includes(action))) return exemption.reason;
  }
  return null;
}

/** Return the source slice of one `toast.success(...)` call bounded by its closing `)`. */
function readCallSlice(source: string, start: number): string {
  const openParen = source.indexOf('(', start);
  if (openParen < 0) return source.slice(start, start + 120);
  let depth = 1;
  let index = openParen + 1;
  while (index < source.length && depth > 0) {
    const character = source[index];
    if (character === '"' || character === "'" || character === '`') {
      const quote = character;
      index += 1;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    index += 1;
  }
  return source.slice(start, index);
}

/**
 * A `toast.success(...)` is exempt when the file entry's `keys` pattern matches
 * the i18n key inside that single call, so an unrelated non-lifecycle toast in
 * the same file still fails.
 */
function toastExempted(file: string, source: string, index: number): string | null {
  const call = readCallSlice(source, index);
  for (const exemption of TOAST_EXEMPTIONS) {
    if (!exemption.file.test(file)) continue;
    if (exemption.keys.test(call)) return exemption.reason;
  }
  return null;
}


/** Label props rule T inspects on the two row primitives. */
const LABEL_INSPECTED_TAGS = new Set([
  'SettingsFieldRow',
  'SettingsCheckboxRow',
]);

const TRANSLATE_CALL_PATTERN = /(?:^|[^\w$.])t\s*\(/;

/** A `label` value routed through `t(...)` (or `null`/`undefined` for a
 * deliberately unlabeled continuation row) passes; bare identifiers, non-t
 * helpers (`format(...)`), and JSX carrying hardcoded English text do not. */
function labelIsTranslated(attr: JsxAttr): boolean {
  const raw = attr.raw.trim();
  if (raw === 'null' || raw === 'undefined') return true;
  if (!TRANSLATE_CALL_PATTERN.test(raw)) return false;
  if (/^\{?\s*\(?\s*</.test(raw)) {
    return !/>[^<{}]*[A-Za-z][^<{}]*</.test(raw)
      && !/>[^<{}]*[A-Za-z][^<{}]*\{/.test(raw)
      && !/\}[^<{}]*[A-Za-z][^<{}]*</.test(raw);
  }
  return true;
}

function labelExempted(file: string): string | null {
  for (const exemption of LABEL_EXEMPTIONS) {
    if (exemption.file.test(file)) return exemption.reason;
  }
  return null;
}

/** Row primitives may not carry `p*` padding; their own row band owns the
 * inset. A control (`Input`, `Select`) keeps the padding its chrome needs
 * (an icon affordance, a ring offset), so only the rows are inspected. */
const ROW_PADDING_TAGS = new Set([
  'SettingsFieldRow',
  'SettingsStackedField',
  'SettingsCheckboxRow',
  'SettingsSection',
  'SettingsControlGroup',
  'SettingsDisclosure',
]);

const PADDING_TOKEN = /^(?:p|px|py|ps|pe|pt|pb|pl|pr)-/;

/** Container tags that can carry an unsanctioned box around settings rows. */
const CHROME_CONTAINER_TAGS = new Set([
  'div',
  'section',
  'label',
  'details',
  'form',
  'ul',
  'li',
]);

/** Chrome a container may not wrap a settings row in: a filled box, an inset
 * tile, or a bordered rounded frame. Badges and pills keep their own chrome. */
const CONTAINER_CHROME_TOKEN = /^(?:border(?:-(?:[trblxyse]))?(?:\/\d+)?$|rounded(?:-(?:[0-9a-z]+|\[[^\]]+\]))$|bg-surface-[a-z-]+$|oc-tile(?:-hover|-inset)?$)/;

function isContainerChromeToken(token: string): boolean {
  return CONTAINER_CHROME_TOKEN.test(baseUtility(token));
}

/** Chrome is sanctioned inside a `SettingsCard` grid or a status callout; it
 * is unsanctioned on a generic wrapper inside `SettingsSection` content. */
function insideCardOrCallout(element: JsxElement): boolean {
  let current: JsxElement | null = element.parent;
  while (current !== null) {
    if (CHROME_ALLOWED_TAGS.has(current.tag)) return true;
    if (DIALOG_CHROME_TAG.test(current.tag)) return true;
    current = current.parent;
  }
  return false;
}

/** A status callout advertises itself with a `var(--status-…)` token. */
function isStatusCallout(tokens: readonly string[]): boolean {
  return tokens.some((token) => token.includes('--status-') || token.includes('[var(--status-'));
}

/** Tags that are a flat settings row; boxing them in chrome is the violation. */
const ROW_PRIMITIVE_TAGS = new Set([
  'SettingsFieldRow',
  'SettingsStackedField',
  'SettingsCheckboxRow',
  'SettingsControlGroup',
  'OmpRowControl',
  'SettingsRadioOption',
  'SettingsChipGroup',
  'SettingsDisclosure',
]);

/** True when any descendant element is a settings row the chrome would box. */
function wrapsRowPrimitive(element: JsxElement): boolean {
  const pending = [...element.children];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (ROW_PRIMITIVE_TAGS.has(current.tag)) return true;
    pending.push(...current.children);
  }
  return false;
}

function lineOf(source: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset && index < source.length; index += 1) {
    if (source[index] === '\n') line += 1;
  }
  return line;
}

/** Every class-bearing attribute on the element. */
function classAttrs(element: JsxElement): JsxAttr[] {
  return element.attrs.filter((attr) => CLASS_ATTRS.has(attr.name));
}

function exceptionReason(file: string, rule: Rule): string | null {
  for (const exception of FILE_EXCEPTIONS) {
    if (!exception.match.test(file)) continue;
    if (exception.rules !== undefined && !exception.rules.includes(rule)) continue;
    return exception.reason;
  }
  return null;
}

/** True when every viewport prefix on the value is a hover-only opacity affordance. */
function isHoverOnlyBreakpointValue(tokens: readonly string[]): boolean {
  return tokens
    .filter((token) => VIEWPORT_BREAKPOINT.test(token))
    .every((token) => HOVER_OPACITY.test(token));
}

/** True when the element renders inside a modal dialog, which sizes to the window. */
function insideDialog(element: JsxElement): boolean {
  let current: JsxElement | null = element;
  while (current !== null) {
    if (DIALOG_CHROME_TAG.test(current.tag)) return true;
    current = current.parent;
  }
  return false;
}

function scanSource(file: string, source: string): Violation[] {
  return scanSourceDetailed(file, source).violations;
}

interface ScanDetail {
  readonly violations: Violation[];
  readonly parse: ParseResult;
}

function scanSourceDetailed(file: string, source: string): ScanDetail {
  const violations: Violation[] = [];
  const report = (offset: number, rule: Rule, detail: string): void => {
    if (exceptionReason(file, rule) !== null) return;
    violations.push({ file, line: lineOf(source, offset), rule, detail });
  };

  const parse = parseJsx(source);

  for (const element of parse.elements) {
    // W: page-local control widths.
    for (const attr of element.attrs) {
      const inspected = attr.name === 'controlClassName'
        || attr.name === 'containerClassName'
        || attr.name === 'triggerClassName'
        || (attr.name === 'className' && CONTROL_TAGS.has(element.tag));
      if (!inspected) continue;
      for (const token of classTokens(attr.raw)) {
        if (!isRawWidthToken(token)) continue;
        report(
          attr.start,
          'W',
          `<${element.tag}> ${attr.name} carries the raw width "${token}" (use a SETTINGS_WIDTH_* class)`,
        );
      }
    }

    // S: a stack around sections.
    const className = element.attrs.find((attr) => attr.name === 'className');
    if (className !== undefined && element.children.some((child) => child.tag === 'SettingsSection')) {
      for (const token of classTokens(className.raw)) {
        if (!isVerticalStackUtility(token)) continue;
        report(
          className.start,
          'S',
          `<${element.tag}> stacks sections with "${token}" (sections own their rhythm; use SETTINGS_SPACE_* for content groups)`,
        );
      }
    }

    // P: the page layout owns page padding.
    if (element.tag === 'SettingsPageLayout') {
      for (const attr of classAttrs(element)) {
        for (const token of classTokens(attr.raw)) {
          if (!/^(?:p|px|py|ps|pe|pt|pb|pl|pr)-/.test(baseUtility(token))) continue;
          report(attr.start, 'P', `SettingsPageLayout overrides page padding with "${token}"`);
        }
      }
    }

    // B: viewport breakpoints inside pane content. A dialog sizes to the
    // window, so its body is not pane content; control widths inside it (W)
    // still follow the row rules.
    if (!insideDialog(element)) {
      for (const attr of classAttrs(element)) {
        const tokens = classTokens(attr.raw);
        if (isHoverOnlyBreakpointValue(tokens)) continue;
        for (const token of tokens) {
          if (!VIEWPORT_BREAKPOINT.test(token)) continue;
          report(
            attr.start,
            'B',
            `<${element.tag}> ${attr.name} uses the viewport breakpoint "${token}" in pane content (use @xl:/@3xl:)`,
          );
        }
      }
    }

    // N: the fixed number width belongs to a stepper row.
    for (const attr of classAttrs(element)) {
      if (!attr.raw.includes(NUMBER_WIDTH_CLASS)) continue;
      let ancestor = element.parent;
      let inStepperRow = false;
      while (ancestor !== null) {
        const stepper = ancestor.attrs.some((candidate) => candidate.raw.includes(NUMBER_STEPPER_ROW_CLASS));
        if (stepper) {
          inStepperRow = true;
          break;
        }
        if (ROW_BOUNDARY_TAGS.has(ancestor.tag)) break;
        ancestor = ancestor.parent;
      }
      if (!inStepperRow) {
        report(
          attr.start,
          'N',
          `<${element.tag}> applies ${NUMBER_WIDTH_CLASS} outside a ${NUMBER_STEPPER_ROW_CLASS} row`,
        );
      }
    }

    // G: spacing utilities where a named class owns the decision.
    const controlSpacing = element.tag !== '' && CONTROL_TAGS.has(element.tag);
    const rowSpacing = ROW_TAGS.has(element.tag);
    const contentStack = CONTENT_STACK_TAGS.has(element.tag);
    for (const attr of classAttrs(element)) {
      const checksSpacing = (attr.name === 'className' && controlSpacing)
        || (rowSpacing && (attr.name === 'className' || attr.name === 'controlClassName'));
      const checksStack = contentStack && attr.name === 'contentClassName';
      if (!checksSpacing && !checksStack) continue;
      for (const token of classTokens(attr.raw)) {
        if (checksStack) {
          if (!isVerticalStackUtility(token)) continue;
          report(
            attr.start,
            'G',
            `<${element.tag}> ${attr.name} sets its own stack with "${token}" (use SETTINGS_SPACE_SECTION_CLASS / SETTINGS_SPACE_ROW_CLASS / SETTINGS_SPACE_CHECKBOX_CLASS)`,
          );
          continue;
        }
        if (!isSpacingUtility(token)) continue;
        report(
          attr.start,
          'G',
          `<${element.tag}> ${attr.name} carries the spacing utility "${token}" (row and section spacing come from the shared primitives)`,
        );
      }
    }

    // F: raw lowercase form elements bypass the shared control primitives.
    if (RAW_FORM_TAGS.has(element.tag)) {
      if (rawFormExempted(file, element) === null) {
        report(
          element.start,
          'F',
          `<${element.tag}> is a raw HTML form element (use the shared Input/Button/Select/Textarea primitives or a documented exemption)`,
        );
      }
    }

    // X: box/row chrome (border, rounded-*, bg-surface-*, oc-tile) outside a
    // SettingsCard grid or a status callout, and p* padding on a row/control
    // primitive whose own band owns the inset.
    for (const attr of classAttrs(element)) {
      const tokens = classTokens(attr.raw);
      if (tokens.length === 0) continue;
      const rowPrimitive = ROW_PADDING_TAGS.has(element.tag);
      for (const token of tokens) {
        const utility = baseUtility(token);
        if (rowPrimitive && PADDING_TOKEN.test(utility)) {
          report(
            attr.start,
            'X',
            `<${element.tag}> ${attr.name} carries the padding utility "${token}" (row/control primitives own their inset)`,
          );
          continue;
        }
        // Only a container tag can wrap rows in a box; a leaf badge, input or
        // pill keeps its own chrome.
        if (!CHROME_CONTAINER_TAGS.has(element.tag)) continue;
        if (!isContainerChromeToken(utility)) continue;
        if (insideCardOrCallout(element)) continue;
        if (isStatusCallout(tokens)) continue;
        // The box is a violation only when it packages a flat settings row;
        // a rich widget, tile, table or editor keeps its own chrome.
        if (!wrapsRowPrimitive(element)) continue;
        report(
          attr.start,
          'X',
          `<${element.tag}> ${attr.name} carries the box chrome "${token}" outside a SettingsCard grid or status callout`,
        );
      }
    }

    // T: a field/checkbox row label must route through t(...); a bare
    // identifier would render an untranslated string.
    if (LABEL_INSPECTED_TAGS.has(element.tag)) {
      const label = element.attrs.find((attr) => attr.name === 'label');
      if (label !== undefined && !labelIsTranslated(label) && labelExempted(file) === null) {
        report(
          label.start,
          'T',
          `<${element.tag}> label is bound to a raw identifier (route it through t(...) or document the dynamic key)`,
        );
      }
    }
  }

  // M: a manual Save/Apply button or a success toast reintroduces save chrome
  // the autosave/showSaveStatus contract removed.
  if (AUTOSAVE_SOURCE_MARKERS.some((marker) => source.includes(marker))) {
    for (const element of parse.elements) {
      if (element.tag === 'Button' || element.tag === 'button') {
        const slice = source.slice(element.start, element.end);
        if (SAVE_ACTION_PATTERN.test(slice) && saveButtonExempted(file, element, source) === null) {
          report(
            element.start,
            'M',
            `<${element.tag}> renders a manual Save/Apply action on an autosave page`,
          );
        }
      }
    }
    for (const match of source.matchAll(/toast\.success\s*\(/g)) {
      if (toastExempted(file, source, match.index ?? 0) !== null) continue;
      report(match.index, 'M', 'toast.success on an autosave page (saves are silent; only failures toast)');
    }
  }

  return { violations, parse };
}

const EXCLUDED_SOURCES = new Set([
  'shared/SettingsSection.tsx',
]);

const sectionPath = (file: string): string => relative(SECTIONS_ROOT, file).split(sep).join('/');

function walkSources(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkSources(full, files);
      continue;
    }
    if (!entry.name.endsWith('.tsx') || entry.name.endsWith('.test.tsx')) continue;
    if (EXCLUDED_SOURCES.has(sectionPath(full))) continue;
    files.push(full);
  }
  return files;
}

interface FileScan {
  readonly file: string;
  readonly fullPath: string;
  readonly source: string;
  readonly detail: ScanDetail;
}

function scanSections(): FileScan[] {
  const sectionFiles = walkSources(SECTIONS_ROOT).map((fullPath) => {
    const file = sectionPath(fullPath);
    const source = readFileSync(fullPath, 'utf8');
    return {
      file,
      fullPath,
      source,
      detail: scanSourceDetailed(file, source),
    };
  });
  const viewFiles = PANE_VIEW_SOURCES.map((file) => {
    const fullPath = join(COMPONENTS_ROOT, file);
    const source = readFileSync(fullPath, 'utf8');
    return {
      file,
      fullPath,
      source,
      detail: scanSourceDetailed(file, source),
    };
  });
  return [...sectionFiles, ...viewFiles];
}

function formatViolations(violations: readonly Violation[]): string {
  return violations
    .map((violation) => `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`)
    .sort()
    .join('\n');
}


/**
 * Regression guards for UX-audit remediations: each pins the mechanism the
 * fix landed with so a later refactor cannot quietly restore the pattern it
 * removed. The source-level pins ride the same `scanSections()` pass the
 * layout rules already run, so they cost no extra read.
 */
describe('settings UX regression guards', () => {
  test('ModelRoleLinkRow navigates with shared Button chrome, never SettingsInlineLink', () => {
    // The affordance is an outline button with an arrow icon, not a bare
    // inline link inside the row's control band.
    const scan = scanSections().find((entry) => entry.file === 'shared/ModelRoleLinkRow.tsx');
    expect(scan, 'shared/ModelRoleLinkRow.tsx must be scanned').toBeDefined();
    expect(scan!.source).not.toContain('SettingsInlineLink');
    expect(/import\s*\{[^}]*\bButton\b[^}]*\}\s*from\s*'@\/components\/ui\/button'/.test(scan!.source)).toBe(true);
  });

  test('PluginsPage and ExtensionControlCenter exclude ssh, openssh-config, and builtin-defaults entries', () => {
    // The shared filter is the mechanism: it drops the `ssh` kind, the
    // `openssh-config`/`builtin-defaults` discovery providers, and every
    // builtin-scope row before the inventory reaches either component.
    const inventory: ExtensionInventory = {
      providers: [
        { id: 'agents', displayName: 'Agents', description: '', priority: 1, capabilities: ['tool'], enabled: true, userSourceEnabled: true, foreignUserSource: false, itemCount: 2 },
        { id: 'openssh-config', displayName: 'OpenSSH', description: '', priority: 2, capabilities: ['ssh'], enabled: true, userSourceEnabled: true, foreignUserSource: false, itemCount: 1 },
        { id: 'builtin-defaults', displayName: 'Builtin', description: '', priority: 3, capabilities: ['tool'], enabled: true, userSourceEnabled: false, foreignUserSource: false, itemCount: 1 },
      ],
      items: [
        { id: 'keep-tool', kind: 'tool', name: 't', providerId: 'agents', providerName: 'Agents', scope: 'user', path: 'p', enabled: true, shadowed: false, toggleable: true, triggers: [] },
        { id: 'drop-ssh', kind: 'ssh', name: 's', providerId: 'openssh-config', providerName: 'OpenSSH', scope: 'user', path: 'p', enabled: true, shadowed: false, toggleable: true, triggers: [] },
        { id: 'drop-builtin-provider', kind: 'tool', name: 'b', providerId: 'builtin-defaults', providerName: 'Builtin', scope: 'user', path: 'p', enabled: true, shadowed: false, toggleable: true, triggers: [] },
        { id: 'drop-builtin-scope', kind: 'tool', name: 'n', providerId: 'agents', providerName: 'Agents', scope: 'builtin', path: 'p', enabled: true, shadowed: false, toggleable: true, triggers: [] },
      ],
      warnings: [],
      kinds: [
        { kind: 'tool', label: 'Tool' },
        { kind: 'ssh', label: 'SSH' },
      ],
    };
    const filtered = filterPluginCapabilities(inventory);
    expect(filtered.items.map((item) => item.id)).toEqual(['keep-tool']);
    expect(filtered.providers.map((provider) => provider.id)).toEqual(['agents']);
    const scanned = new Map(scanSections().map((entry) => [entry.file, entry.source]));
    for (const file of ['plugins/PluginsPage.tsx', 'plugins/ExtensionControlCenter.tsx']) {
      const source = scanned.get(file);
      expect(source, `${file} must be scanned`).toBeDefined();
      expect(
        source!.includes('filterPluginCapabilities'),
        `${file} must route the extension inventory through filterPluginCapabilities`,
      ).toBe(true);
    }
  });

  test('OmpResetCreditSettings disclosures start collapsed and UsagePage no longer renders reset rules', () => {
    const scanned = new Map(scanSections().map((entry) => [entry.file, entry.source]));
    const resetsSource = scanned.get('openchamber/OmpResetCreditSettings.tsx');
    const usageSource = scanned.get('usage/UsagePage.tsx');
    const providerSource = scanned.get('providers/CustomProviderForm.tsx');
    const advancedSource = scanned.get('providers/CustomProviderAdvancedSection.tsx');
    expect(resetsSource, 'openchamber/OmpResetCreditSettings.tsx must be scanned').toBeDefined();
    expect(usageSource, 'usage/UsagePage.tsx must be scanned').toBeDefined();
    expect(providerSource, 'providers/CustomProviderForm.tsx must be scanned').toBeDefined();
    expect(advancedSource, 'providers/CustomProviderAdvancedSection.tsx must be scanned').toBeDefined();
    // `expanded` maps key->open; the empty initial map keeps every group
    // collapsed, and a `true` literal would resurface one section open on load.
    expect(resetsSource!.includes('expanded[provider.key] === true')).toBe(true);
    expect(/SettingsDisclosure[^]*expanded=\{true\}/.test(resetsSource!)).toBe(false);
    // The maintainer directed the auto-redeem rules out of Usage entirely;
    // the page must not re-introduce them.
    expect(usageSource!.includes('ResetCreditSettings')).toBe(false);
    expect(usageSource!.includes('codexResets')).toBe(false);
    expect(usageSource!.includes('claudeResets')).toBe(false);
    for (const state of ['discoveryOpen', 'compatOpen', 'bedrockOpen', 'remoteCompactionOpen']) {
      expect(
        new RegExp(`const \\[${state},\\s*set[A-Z]\\w*\\] = React\\.useState\\(false\\)`).test(providerSource!),
        `CustomProviderForm ${state} must initialize to false`,
      ).toBe(true);
      expect(
        new RegExp(`expanded=\\{${state}\\}`).test(advancedSource!),
        `CustomProviderAdvancedSection must bind ${state} to a SettingsDisclosure`,
      ).toBe(true);
    }
  });
});

describe('settings layout guard', () => {
  test('detects a raw width on a control and a section stack on a page', () => {
    const source = `
      const page = (
        <SettingsPageLayout title="OMP">
          <div className="space-y-6">
            <SettingsSection title="A">
              <SettingsFieldRow label={t('settings.fixture.model')}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              </SettingsFieldRow>
              <SettingsFieldRow label={t('settings.fixture.budget')} controlClassName="max-w-md">
                <Input className="h-7 w-44" />
                <ModelSelector className="w-48" />
              </SettingsFieldRow>
            </SettingsSection>
          </div>
        </SettingsPageLayout>
      );
    `;
    const violations = scanSource('fixture/LayoutPage.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['S', 'W', 'W', 'W', 'W']);
    expect(violations.some((violation) => violation.detail.includes('"w-48"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"max-w-md"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"w-44"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"space-y-6"'))).toBe(true);
  });

  test('accepts the named classes and layout-neutral widths', () => {
    const source = `
      const page = (
        <SettingsPageLayout title="OMP">
          <div className="space-y-0">
            <SettingsSection title="A">
              <div className={SETTINGS_SPACE_ROW_CLASS}>
                <SettingsFieldRow label={t('settings.fixture.model')}>
                  <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}><SelectValue /></SelectTrigger>
                </SettingsFieldRow>
                <SettingsFieldRow label={t('settings.fixture.budget')}>
                  <div className={SETTINGS_NUMBER_STEPPER_ROW_CLASS}>
                    <NumberInput className={SETTINGS_WIDTH_NUMBER_CLASS} />
                    <span className={SETTINGS_NUMBER_UNIT_CLASS}>s</span>
                  </div>
                </SettingsFieldRow>
                <SettingsFieldRow label={t('settings.fixture.notes')} controlClassName="w-full max-w-none">
                  <Textarea className="min-w-0" />
                </SettingsFieldRow>
              </div>
            </SettingsSection>
          </div>
        </SettingsPageLayout>
      );
    `;
    expect(formatViolations(scanSource('fixture/CleanPage.tsx', source))).toBe('');
  });

  test('detects bare number width, page padding and viewport breakpoints', () => {
    const source = `
      const page = (
        <SettingsPageLayout className="px-4 @xl:px-6" title="Git">
          <SettingsSection title="A">
            <SettingsFieldRow label={t('settings.fixture.limit')}>
              <NumberInput className={SETTINGS_WIDTH_NUMBER_CLASS} />
            </SettingsFieldRow>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input className="h-7 md:max-w-sm" />
            </div>
            <Button className="md:opacity-0 md:group-hover:opacity-100" />
          </SettingsSection>
        </SettingsPageLayout>
      );
    `;
    const violations = scanSource('fixture/OverridesPage.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['B', 'B', 'N', 'P', 'P', 'W']);
    expect(violations.every((violation) => !violation.detail.includes('md:opacity-0'))).toBe(true);
  });

  test('detects spacing utilities on controls, row primitives and section content', () => {
    const source = `
      <SettingsPageLayout title="A">
        <SettingsSection title="B" contentClassName="space-y-4">
          <SettingsFieldRow label={t('settings.fixture.c')} className="mt-2" controlClassName="gap-3">
            <Input className="mb-4 w-full" />
            <SelectTrigger className="space-x-2" />
          </SettingsFieldRow>
          <SettingsStackedField label={t('settings.fixture.d')} controlClassName="mx-auto" />
          <SettingsCheckboxRow label={t('settings.fixture.e')} className="my-3" />
          <SettingsControlGroup title="F" contentClassName="space-y-6" />
          <div className="space-y-4 gap-2 mt-6">
            <Input className="m-0 p-0" />
          </div>
        </SettingsSection>
      </SettingsPageLayout>
    `;
    const violations = scanSource('fixture/SpacingPage.tsx', source);
    const details = violations.map((violation) => `${violation.rule}:${violation.detail}`);
    // Section content stack + field-row className/controlClassName + input
    // margin + trigger stack + stacked-field control + checkbox margin +
    // control-group content stack.
    expect(details.length).toBe(8);
    expect(details.every((detail) => detail.startsWith('G:'))).toBe(true);
    for (const token of ['"space-y-4"', '"mt-2"', '"gap-3"', '"mb-4"', '"space-x-2"', '"mx-auto"', '"my-3"', '"space-y-6"']) {
      expect(details.some((detail) => detail.includes(token))).toBe(true);
    }
    // A generic wrapper keeps its own gap stack; `m-0` and `p-0` are neutral.
    expect(details.some((detail) => detail.includes('<div>'))).toBe(false);
  });

  test('exempts modal chrome, sidebars and the project dialog shell', () => {
    const dialog = `
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="sm:text-start" />
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row" />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    `;
    expect(formatViolations(scanSource('agents/AgentsDialog.tsx', dialog))).toBe('');
    expect(formatViolations(scanSource('agents/AgentsSidebar.tsx', '<div className="h-6 w-6 md:opacity-0" />'))).toBe('');
    expect(formatViolations(scanSource('projects/ProjectSettingsPanel.tsx', '<div className="px-4 sm:px-6" />'))).toBe('');

    // A dialog body sizes to the window, so its viewport breakpoints pass, but
    // a control width inside it still follows the row rules.
    const nestedRow = `
      <Dialog open>
        <DialogContent className="sm:max-w-4xl">
          <SettingsFieldRow label={t('settings.fixture.limit')}>
            <Input className="h-7 md:max-w-sm" />
          </SettingsFieldRow>
        </DialogContent>
      </Dialog>
    `;
    const nested = scanSource('fixture/NestedSettings.tsx', nestedRow);
    expect(nested.map((violation) => violation.rule).sort()).toEqual(['W']);
  });

  test('scans JSX nested in attribute expressions', () => {
    const source = `
      <SettingsSection
        title="A"
        headerAction={(<Input className="w-44" />)}
        headerEnd={<SelectTrigger className="max-w-[10rem]" />}
      >
        <SettingsFieldRow label={t('settings.fixture.b')} />
      </SettingsSection>
    `;
    const violations = scanSource('fixture/HeaderAction.tsx', source);
    expect(violations.map((violation) => violation.rule).sort()).toEqual(['W', 'W']);
    expect(violations.some((violation) => violation.detail.includes('"w-44"'))).toBe(true);
    expect(violations.some((violation) => violation.detail.includes('"max-w-[10rem]"'))).toBe(true);
  });

  test('lexes regex literals and keeps scanning after them', () => {
    // The quote and backtick inside the character class used to be read as a
    // string, swallowing the rest of the file.
    const source = `
      const normalize = (value: string) => value.replace(/[^!#$%&'*+._\`|~0-9A-Za-z-]/g, '');
      const division = total / count;
      export const Page = () => (
        <SettingsSection title="A">
          <Input className="w-48" />
        </SettingsSection>
      );
    `;
    const violations = scanSource('fixture/RegexPage.tsx', source);
    expect(violations.map((violation) => violation.rule)).toEqual(['W']);
    expect(scanSourceDetailed('fixture/RegexPage.tsx', source).parse.complete).toBe(true);
  });

  test('scans every file to the end: appended and mid-file violations are found', () => {
    // Each scanned file with a control must report a raw width appended at
    // EOF and one injected on its middle control. A region the lexer skips
    // cannot satisfy both, whichever part of the file it is.
    const failures: string[] = [];
    let probed = 0;

    for (const { file, fullPath } of scanSections()) {
      // A file-level exception (navigation chrome) legitimately hides the hit.
      if (exceptionReason(file, 'W') !== null) continue;
      const source = readFileSync(fullPath, 'utf8');
      const { elements } = parseJsx(source);
      const controls = elements.filter((element) => CONTROL_TAGS.has(element.tag));
      if (controls.length === 0) continue;
      probed += 1;

      const appended = `${source}\nconst ProbeAppended = () => <Input className="w-48" />;\nconst ProbeStack = () => <SettingsSection contentClassName="space-y-4" />;\n`;
      const appendedHits = scanSource(file, appended);
      if (!appendedHits.some((violation) => violation.rule === 'W' && violation.detail.includes('"w-48"'))) {
        failures.push(`${file}: appended element not scanned`);
      }
      if (!appendedHits.some((violation) => violation.rule === 'G' && violation.detail.includes('"space-y-4"'))) {
        failures.push(`${file}: appended section stack not scanned`);
      }

      // Skip a generic element (`<Select<Preset>`): its type list sits where
      // the probe would insert attributes.
      const plain = controls.filter((element) => source[element.start + 1 + element.tag.length] !== '<');
      if (plain.length === 0) continue;
      const target = plain[Math.floor(plain.length / 2)];
      const at = target.start + 1 + target.tag.length;
      const mutated = `${source.slice(0, at)} className="w-48"${source.slice(at)}`;
      if (!scanSource(file, mutated).some((violation) => violation.rule === 'W' && violation.detail.includes('"w-48"'))) {
        failures.push(`${file}: mid-file control not scanned`);
      }
    }

    // The probe must actually cover the tree, not pass by finding no files.
    expect(probed).toBeGreaterThan(40);
    expect(failures.sort()).toEqual([]);
  });

  test('lexes templates, comments and arrow generics without losing JSX', () => {
    const source = `
      /* A doc comment may show JSX: <Input className="w-99" /> must not count. */
      // Nor may this line: <Input className="w-98" />
      const label = \`</div> <Input className="w-97" /> \${value}\`;
      const render = <Item extends Row>(row: Item) => <span>{row.id}</span>;
      const narrow = <T,>(value: T): T => value;
      export const Page = () => (
        <SettingsSection title="A">
          <Input className="w-96" />
        </SettingsSection>
      );
    `;
    const detail = scanSourceDetailed('fixture/HolesPage.tsx', source);
    expect(detail.parse.complete).toBe(true);
    // Only the real element's width counts; the doc comment, the line comment
    // and the template literal each name a width too, and must not.
    expect(detail.violations).toHaveLength(1);
    expect(detail.violations[0].detail).toContain('"w-96"');
  });

  test('scans settings-pane views outside components/sections', () => {
    const scanned = new Set(scanSections().map((entry) => entry.file));
    for (const view of PANE_VIEW_SOURCES) {
      expect(scanned.has(view)).toBe(true);
    }
    const rawSelect = scanSource(
      'views/usage/UsageStatsView.tsx',
      '<SelectTrigger className="w-fit min-w-[140px] max-w-64" />',
    );
    expect(rawSelect.map((violation) => violation.rule)).toEqual(['W', 'W', 'W']);

    const cappedTabs = scanSource(
      'openchamber/OmpSettingsPage.tsx',
      '<SortableTabsStrip className="h-8 max-w-[28rem]" />',
    );
    expect(cappedTabs.map((violation) => violation.rule)).toEqual(['W']);

    const intrinsicTabs = scanSource(
      'openchamber/OmpSettingsPage.tsx',
      '<SortableTabsStrip className="flex-none max-w-full" />',
    );
    expect(intrinsicTabs).toEqual([]);
  });

  test('flags raw form elements, save chrome, untranslated labels and boxed row chrome (F/M/T/X)', () => {
    // F: each raw form tag must trip unless a file documents an exemption.
    const cases: ReadonlyArray<[string, string]> = [
      ['input', '<input type="text" />'],
      ['button', '<button type="button">x</button>'],
      ['select', '<select>x</select>'],
      ['textarea', '<textarea />'],
      ['form', '<form onSubmit={f}>x</form>'],
    ];
    for (const [tag, source] of cases) {
      const hits = scanSource('fixture/RawFormPage.tsx', source);
      expect(hits.filter((violation) => violation.rule === 'F').length, `<${tag}>`).toBeGreaterThan(0);
    }

    // M: on an autosave page a manual Save/Apply button or a non-lifecycle
    // toast.success reintroduces the save chrome the contract removed.
    const autosave = `
      const page = useAutosave();
      const view = <Button onClick={actions.saveChanges}>{t('settings.common.actions.saveChanges')}</Button>;
      toast.success(t('settings.fixture.toast.saved'));
    `;
    const manualHits = scanSource('fixture/AutosavePage.tsx', autosave);
    expect(manualHits.filter((violation) => violation.rule === 'M').length).toBe(2);

    // T: a SettingsFieldRow/SettingsCheckboxRow label bound to a bare
    // identifier, a hardcoded literal, a non-t helper (`format(...)`), or
    // JSX with hardcoded English text is rejected; JSX wrapping `t(...)` passes.
    const rows = `
      const view = (
        <div>
          <SettingsFieldRow label="Model" />
          <SettingsFieldRow label={field} />
          <SettingsCheckboxRow label={item.label} />
          <SettingsFieldRow label={format(name)} />
          <SettingsFieldRow label={<span>Model</span>} />
          <SettingsFieldRow label={<span>Model {t('settings.fixture.model')}</span>} />
          <SettingsFieldRow label={<span>{t('settings.fixture.model')}</span>} />
        </div>
      );
    `;
    const labelHits = scanSource('fixture/LabelsPage.tsx', rows);
    expect(labelHits.filter((violation) => violation.rule === 'T')).toHaveLength(6);

    // M (tightened): generic Save/Apply button copy (`t('common.save')` and
    // literal `Save`) trips, and an exempted neighbor cannot shield an
    // unexempted `<Button>` or `toast.success(...)` next to it.
    const neighborBleed = `
      const page = useAutosave();
      const actionsView = (
        <>
          <Button onClick={save}>{t('common.save')}</Button>
          <Button onClick={apply}>Apply</Button>
          <Button onClick={applyPending}>{t('settings.plugins.action.apply')}</Button>
        </>
      );
      toast.success(t('settings.fixture.toast.saved'));
      toast.success(t('settings.plugins.marketplace.toast.installed', { name }));
    `;
    const bleedHits = scanSource('plugins/PluginsPage.tsx', neighborBleed)
      .filter((violation) => violation.rule === 'M');
    expect(bleedHits).toHaveLength(3);

    // X: box chrome on a container that wraps a row primitive (including
    // SettingsDisclosure) is a boxed row.
    const boxed = `
      const view = (
        <div className="rounded-lg border border-edge bg-surface-1">
          <SettingsFieldRow label={t('settings.fixture.model')} />
        </div>
      );
    `;
    const chromeHits = scanSource('fixture/BoxedPage.tsx', boxed);
    expect(chromeHits.some((violation) => violation.rule === 'X')).toBe(true);

    const boxedDisclosure = `
      <div className="rounded-lg border border-edge">
        <SettingsDisclosure title={t('settings.fixture.model')} expanded onToggle={() => undefined} />
      </div>
    `;
    expect(scanSource('fixture/BoxedDisclosure.tsx', boxedDisclosure).some((violation) => violation.rule === 'X')).toBe(true);

    // A row-level p-* utility on a row primitive (including SettingsDisclosure)
    // is a layout override (X).
    const padded = `<SettingsFieldRow label={t('settings.fixture.model')} className="p-4" />`;
    expect(scanSource('fixture/PaddedPage.tsx', padded).some((violation) => violation.rule === 'X')).toBe(true);
    const paddedDisclosure = `<SettingsDisclosure title={t('settings.fixture.model')} className="p-4" expanded onToggle={() => undefined} />`;
    expect(scanSource('fixture/PaddedDisclosure.tsx', paddedDisclosure).some((violation) => violation.rule === 'X')).toBe(true);
  });

  test('sanctioned form widgets and lifecycle toasts pass rule F and M', () => {
    // A hidden file picker and a range slider have no shared primitive.
    expect(
      scanSource('openchamber/ThemeImportButton.tsx', '<input type="file" className="hidden" />')
        .filter((violation) => violation.rule === 'F'),
    ).toEqual([]);
    expect(
      scanSource('openchamber/VoiceSettings.tsx', '<input type="range" />')
        .filter((violation) => violation.rule === 'F'),
    ).toEqual([]);
    // A lifecycle toast in a documented file does not count as save chrome.
    const lifecycle = `
      const s = useAutosave();
      toast.success(t('settings.plugins.marketplace.toast.installed', { name }));
    `;
    expect(
      scanSource('plugins/PluginsPage.tsx', lifecycle).filter((violation) => violation.rule === 'M'),
    ).toEqual([]);
  });

  test('the lexer reaches the end of every settings source file', () => {
    const truncated = scanSections()
      .filter(({ detail }) => !detail.parse.complete)
      .map(({ file }) => `${file}: parse did not reach EOF in a balanced state`);
    expect(truncated.sort()).toEqual([]);
  });

  test('finds no ad-hoc layout override under components/sections or settings-pane views', () => {
    const violations = scanSections().flatMap((entry) => entry.detail.violations);
    expect(formatViolations(violations)).toBe('');
  });
});
