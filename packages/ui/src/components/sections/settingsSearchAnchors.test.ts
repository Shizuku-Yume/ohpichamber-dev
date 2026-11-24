import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_SEARCH_ITEMS, shortcutSearchItemId } from '@/lib/settings/search';
import { ompLayoutSettingIds } from '@/components/sections/openchamber/ompSettingsLayout';
import { getCustomizableShortcutActions } from '@/lib/shortcuts';
import type { SettingsPageSlug } from '@/lib/settings/metadata';

/**
 * Rule A: the settings search index and the `data-settings-item` anchors agree
 * in both directions.
 *
 * A search result scrolls to `[data-settings-item="<id>"]` on `result.page`, so
 * every registry id must resolve to an anchor on its page, and every anchor a
 * user can highlight should be reachable through search. The pair is checked
 * statically because the two sides drift independently: anchors live in JSX,
 * the index in `lib/settings/search.ts`.
 *
 * Dynamic namespaces are claimed once instead of per row: `OmpRowControl`
 * writes `omp.${setting.id}` from server-delivered placements,
 * `omp.modelRoles.${role}` covers every model role, `shortcuts.action.*` comes
 * from `shortcutSearchItemId`, and the integrations cards interpolate provider
 * and guest ids. Allowlists carry the rest with a reason so an unindexed or
 * unanchored id is always a deliberate decision.
 */

const SECTIONS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENTS_ROOT = SECTIONS_ROOT;

interface Anchor {
  readonly id: string;
  readonly file: string;
  /** `namespace` marks a static-prefix template covering every id beneath it. */
  readonly namespace?: boolean;
  /** `mid` marks a template with a static tail (`a.${x}.b`) — no prefix claim. */
  readonly mid?: boolean;
}

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, files);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/** Every literal id an attribute can write, plus template namespaces. */
function collectAnchors(): Anchor[] {
  const anchors: Anchor[] = [];
  const ATTRIBUTE = /(?:settingsItem|data-settings-item)\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\}|\{([^{}]+)\})/g;
  // `const settingsItem = `a.${x}`` assigned to a variable that flows into an
  // attribute: the variable's template claims its static prefix namespace.
  const CONST_NAMESPACE = /(?:settingsItem|itemAnchor|anchor)\s*=\s*`([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)\.\$\{/g;
  for (const fullPath of walk(COMPONENTS_ROOT)) {
    const source = readFileSync(fullPath, 'utf8');
    const file = relative(COMPONENTS_ROOT, fullPath).split(sep).join('/');
    for (const match of source.matchAll(ATTRIBUTE)) {
      const literal = match[1] ?? match[3];
      const template = match[2];
      const expr = match[4];
      if (literal !== undefined) {
        anchors.push({ id: literal, file });
        continue;
      }
      if (template !== undefined) {
        // `a.${x}` claims the `a.` namespace; `a.${x}.b` keeps a static tail
        // that only concrete resolution could name, so it claims nothing.
        const head = template.split('${')[0];
        const tail = template.slice(template.lastIndexOf('}') + 1);
        if (head.length > 0 && tail.length === 0) {
          anchors.push({ id: head, file, namespace: true });
        } else if (head.length > 0 && tail.length > 0) {
          anchors.push({ id: template, file, mid: true });
        }
        continue;
      }
      if (expr === undefined) continue;
      // Ternary literals: `cond ? 'a.b' : 'c.d'` writes both literals; a bare
      // identifier or call is dynamic and handled through the allowlists.
      const literals = [...expr.matchAll(/'([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)'/g)].map((m) => m[1]);
      for (const id of literals) {
        anchors.push({ id, file });
      }
    }
    for (const match of source.matchAll(CONST_NAMESPACE)) {
      anchors.push({ id: `${match[1]}.`, file, namespace: true });
    }
    // `settingsItemPrefix="a."` declares the namespace a sortable list writes.
    for (const match of source.matchAll(/settingsItemPrefix\s*=\s*"([^"]+)"/g)) {
      anchors.push({ id: match[1], file, namespace: true });
    }
  }
  return anchors;
}
/**
 * The Settings page slug that renders each file. `sections/<dir>` maps
 * one-to-one except `openchamber/*`, whose components are split across the
 * OpenChamber sub-pages by `OpenChamberPage` and `SettingsView`.
 */
const OPENCHAMBER_FILE_PAGE = new Map<string, SettingsPageSlug>(Object.entries({
  'ChatSettings.tsx': 'chat',
  'MessageSearchSettings.tsx': 'chat',
  'TranscriptCorrectionRow.tsx': 'chat',
  'DefaultsSettings.tsx': 'sessions',
  'ModelCompactionSettings.tsx': 'sessions',
  'RetryFallbackChains.tsx': 'sessions',
  'SessionGoalCheckerField.tsx': 'sessions',
  'SessionWarmingCheckbox.tsx': 'sessions',
  'SessionWarmingField.tsx': 'sessions',
  'PermissionDefaultModeField.tsx': 'sessions',
  'SessionRetentionSettings.tsx': 'sessions',
  'MergedWorktreeCleanupSettings.tsx': 'sessions',
  'SessionWorkSettings.tsx': 'sessions',
  'GeneralWorkspaceSettings.tsx': 'general',
  'MobileWorkspaceTabsSettings.tsx': 'general',
  'AppLinkSecuritySettings.tsx': 'general',
  'PasskeySettings.tsx': 'general',
  'DesktopAppSettings.tsx': 'general',
  'DesktopNetworkSettings.tsx': 'general',
  'DesktopQuakeModeSettings.tsx': 'general',
  'EnvironmentVariablesSettings.tsx': 'general',
  'MobileAppSettings.tsx': 'general',
  'OpenChamberVisualSettings.tsx': 'appearance',
  'ThemeAppearancePicker.tsx': 'appearance',
  'ThemeImportButton.tsx': 'appearance',
  'GitSettings.tsx': 'git',
  'NotificationSettings.tsx': 'notifications',
  'VoiceSettings.tsx': 'voice',
  'TranscriptionPromptField.tsx': 'voice',
  'TunnelSettings.tsx': 'tunnel',
  'KeyboardShortcutsSettings.tsx': 'shortcuts',
  'OmpSettingsPage.tsx': 'omp',
  'AboutSettings.tsx': 'about',
}));

const SECTION_DIR_PAGE = new Map<string, SettingsPageSlug>(Object.entries({
  'agents': 'agents',
  'behavior': 'behavior',
  'classification': 'providers',
  'commands': 'commands',
  'extensions': 'extensions',
  'git-identities': 'git',
  'integrations': 'integrations',
  'magic-prompts': 'magic-prompts',
  'mcp': 'mcp',
  'memory': 'memory',
  'model-roles': 'model-roles',
  'plugins': 'plugins',
  'projects': 'projects',
  'providers': 'providers',
  'remote-instances': 'remote-instances',
  'routing': 'routing',
  'skills': 'skills.installed',
  'snippets': 'snippets',
  'tools': 'tools',
  'usage': 'usage',
  'websearch': 'web-search',
}));

function pageForFile(file: string): SettingsPageSlug | null {
  const parts = file.split('/');
  if (parts[0] !== 'sections') return null;
  if (parts[1] === 'openchamber') return OPENCHAMBER_FILE_PAGE.get(parts[parts.length - 1]) ?? null;
  if (parts[1] === 'shared') return null; // shared primitives anchor via call-site literals
  if (parts[1] === 'skills' && parts[2] === 'catalog') return 'skills.catalog';
  return SECTION_DIR_PAGE.get(parts[1]) ?? null;
}

/**
 * Anchors that stay unindexed on purpose. A trailing-`.` key is a namespace
 * prefix covering every id beneath it.
 */
const UNINDEXED_ANCHORS = new Map(Object.entries({
  // Dynamic rows: the anchor interpolates a server- or entity-supplied id, so
  // no stable registry entry can name it (registry rule: no dynamic entities).
  'integrations.extensions.': 'per-extension catalog card: `integrations.extensions.${definition.guestId}`',
  'integrations.channels.': 'per-channel card: `integrations.channels.${channel.providerId}`',
  'integrations.source-control.': 'per-provider card: `integrations.source-control.${descriptor.id}` beyond the indexed github/gitlab ids',
  'layout.mobile-workspace-tabs.': 'per-tab row: `${settingsItemPrefix}${item.id}` in SettingsSortableVisibilityList',
  'plugins.fileName': 'filename field inside the add-plugin draft dialog; the indexed `plugins.spec` target already lands the user in that dialog',
}));

/** Anchors that are not settings a user searches for, with the reason. */
const NON_SETTING_ANCHORS = new Map(Object.entries({
  'web-search.outcome': 'transient mutation-status callout, not a control',
  'projects.close': 'panel close button, not a setting',
}));

// `prepareSettingsSearchTarget` (SettingsView) redirects a create-style result
// to the field its fresh draft renders, so the registry id legitimately has no
// anchor of its own.
const SEARCH_TARGET_REDIRECTS = new Map(Object.entries({
  'agents.create': 'agents.name',
  'commands.create': 'commands.name',
  'mcp.create': 'mcp.server',
  'snippets.create': 'snippets.content',
  'skills.create': 'skills.basic-information',
  'plugins.create': 'plugins.spec',
  'extensions.gitIdentity': 'extensions.add',
  'integrations.third-party.opencode-claude': 'integrations.extensions',
}));

/**
 * Registry ids whose highlight target is written by a runtime-interpolated
 * template (`a.${providerId}.b`) or an expression the static scan cannot bind
 * to one file. Each entry names the mechanism that writes its anchor.
 */
const UNANCHORED_SEARCH_ITEMS = new Map(Object.entries({
  'integrations.linear': 'tracker card anchor is `integrations.${providerId}`; provider ids are runtime-registered',
  'integrations.linear.add-workspace': '`integrations.${providerId}.add-workspace` on the linear tracker card',
  'integrations.linear.mapping': '`integrations.${providerId}.mapping` on the linear tracker card',
  'integrations.linear.session-comments': '`integrations.${providerId}.session-comments` on the linear tracker card',
  'integrations.extensions.excalidraw': '`integrations.extensions.${guestId}` catalog card for guestId excalidraw',
  'integrations.source-control.github': '`integrations.source-control.${descriptor.id}` card; provider ids are runtime-registered',
  'integrations.source-control.gitlab': '`integrations.source-control.${descriptor.id}` card; provider ids are runtime-registered',
  'integrations.source-control.github.connect': '`${settingsItem}.connect` inside the github source-control card',
  'integrations.source-control.gitlab.connect': '`${settingsItem}.connect` inside the gitlab source-control card',
  'behavior.files.rules-md': '`itemAnchor` expression picks rules-md on the global scope in BehaviorSidebar',
  'behavior.files.system-md': '`itemAnchor` expression picks system-md on the global scope in BehaviorSidebar',
}));

const OMP_LAYOUT_IDS = new Set(ompLayoutSettingIds());
const SHORTCUT_IDS = new Set(getCustomizableShortcutActions().map((action) => shortcutSearchItemId(action.id)));

/** Anchor id -> covered, when it lands inside a dynamic namespace. */
function isDynamicAnchor(id: string): boolean {
  return (
    id.startsWith('shortcuts.action.') ||
    id.startsWith('integrations.source-control.') ||
    id.startsWith('integrations.extensions.') ||
    id.startsWith('integrations.channels.') ||
    /^integrations\.[^.]+\.(mapping|session-comments|add-workspace)$/.test(id) ||
    id.startsWith('layout.mobile-workspace-tabs.')
  );
}

function registryCovered(id: string): boolean {
  return (
    SETTINGS_SEARCH_ITEMS.some((item) => item.id === id) ||
    (id.startsWith('omp.') && OMP_LAYOUT_IDS.has(id.slice('omp.'.length))) ||
    SHORTCUT_IDS.has(id)
  );
}

describe('settings search anchors', () => {
  const anchors = collectAnchors().filter((a) => a.file.startsWith('sections/'));

  test('every anchor is either indexed or allowlisted', () => {
    const offenders: string[] = [];
    for (const anchor of anchors) {
      if (anchor.namespace === true || anchor.mid === true) {
        // Namespaces are claimed by prefix, not per resolved row.
        continue;
      }
      if (registryCovered(anchor.id)) continue;
      if (isDynamicAnchor(anchor.id)) continue;
      if (UNINDEXED_ANCHORS.get(anchor.id) !== undefined || NON_SETTING_ANCHORS.get(anchor.id) !== undefined) continue;
      offenders.push(`${anchor.id} (${anchor.file})`);
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  test('every registry item resolves to an anchor on its page', () => {
    const anchorsByPage = new Map<string, Set<string>>();
    const namespacesByPage = new Map<string, string[]>();
    for (const anchor of anchors) {
      const page = pageForFile(anchor.file);
      if (page === null) continue;
      if (anchor.namespace === true) {
        if (!namespacesByPage.has(page)) namespacesByPage.set(page, []);
        namespacesByPage.get(page)!.push(anchor.id);
        continue;
      }
      if (anchor.mid === true) continue;
      if (!anchorsByPage.has(page)) anchorsByPage.set(page, new Set());
      anchorsByPage.get(page)!.add(anchor.id);
    }
    const hasAnchor = (id: string, page: string): boolean => {
      if (anchorsByPage.get(page)?.has(id)) return true;
      return (namespacesByPage.get(page) ?? []).some((ns) => id.startsWith(ns));
    };
    const offenders: string[] = [];
    for (const item of SETTINGS_SEARCH_ITEMS) {
      const target = SEARCH_TARGET_REDIRECTS.get(item.id) ?? item.id;
      if (hasAnchor(target, item.page)) continue;
      if (item.id.startsWith('shortcuts.action.')) continue;
      if (item.id.startsWith('omp.modelRoles.')) continue;
      // `omp.<id>` renders through useOmpPageSettings + OmpRowControl
      // (`omp.${setting.id}`) — dynamic from static JSX on every page,
      // including the omp page whose rows come from ompSettingsLayout.
      if (item.id.startsWith('omp.')) continue;
      if (UNANCHORED_SEARCH_ITEMS.get(item.id) !== undefined) continue;
      offenders.push(`${item.id} -> ${target} (page ${item.page})`);
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  test('allowlists name anchors and entries that still exist, with reasons', () => {
    const anchorIds = new Set(anchors.map((a) => a.id));
    const registryIds = new Set(SETTINGS_SEARCH_ITEMS.map((item) => item.id));
    for (const [id, reason] of UNINDEXED_ANCHORS) {
      expect(reason.length > 0, `UNINDEXED_ANCHORS ${id} needs a reason`).toBe(true);
      const live = anchorIds.has(id)
        || [...anchorIds].some((a) => a.startsWith(id) || (a.endsWith('.') && id.startsWith(a)));
      expect(live, `UNINDEXED_ANCHORS ${id} stale`).toBe(true);
    }
    for (const [id, reason] of NON_SETTING_ANCHORS) {
      expect(anchorIds.has(id), `NON_SETTING_ANCHORS ${id} stale`).toBe(true);
      expect(reason.length > 0, `NON_SETTING_ANCHORS ${id} needs a reason`).toBe(true);
    }
    for (const [id, reason] of UNANCHORED_SEARCH_ITEMS) {
      expect(registryIds.has(id), `UNANCHORED_SEARCH_ITEMS ${id} no longer in registry — remove the allowlist row`).toBe(true);
      expect(reason.length > 0, `UNANCHORED_SEARCH_ITEMS ${id} needs a reason`).toBe(true);
    }
    for (const [id, target] of SEARCH_TARGET_REDIRECTS) {
      expect(registryIds.has(id), `redirect ${id} no longer in registry`).toBe(true);
      expect(anchorIds.has(target), `redirect target ${target} has no anchor`).toBe(true);
    }
  });

  describe('synthetic probes (Rule A rejects drift)', () => {
    const anchorIds = new Set(anchors.map((a) => a.id));
    const registryIds = new Set(SETTINGS_SEARCH_ITEMS.map((item) => item.id));

    test('an unindexed anchor is reported', () => {
      expect(registryCovered('probe.unindexed-anchor')).toBe(false);
      expect(UNINDEXED_ANCHORS.get('probe.unindexed-anchor')).toBeUndefined();
      expect(NON_SETTING_ANCHORS.get('probe.unindexed-anchor')).toBeUndefined();
    });

    test('an anchor on the wrong page is a page mismatch', () => {
      // `agents.name` renders on the agents page; a registry hit on any other
      // page would not find it via anchorsByPage.
      const agentsAnchors = new Set(anchors.filter((a) => pageForFile(a.file) === 'agents').map((a) => a.id));
      expect(agentsAnchors.has('agents.name')).toBe(true);
      const chatAnchors = new Set(anchors.filter((a) => pageForFile(a.file) === 'chat').map((a) => a.id));
      expect(chatAnchors.has('agents.name')).toBe(false);
    });

    test('a registry id without an anchor fails the reverse check', () => {
      expect(registryIds.size).toBeGreaterThan(0);
      expect(anchorIds.has('probe.no-such-anchor')).toBe(false);
      expect(UNANCHORED_SEARCH_ITEMS.get('probe.no-such-anchor')).toBeUndefined();
    });
  });
});
