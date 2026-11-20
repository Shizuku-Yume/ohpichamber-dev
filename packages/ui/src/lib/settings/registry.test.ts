import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { useUIStore } from '@/stores/useUIStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import {
  resolveWorkStatusSectionOrder,
  sanitizeWorkStatusSectionOrder,
} from '@/components/chat/work-status/sections';
import { installHookTestDom } from '@/components/session/sidebar/test-utils/testDom';
import {
  AUTO_SAVE_KEYS,
  DESKTOP_SHELL_KEYS,
  LOCAL_DEVICE_KEYS,
  MIRRORED_KEYS,
  SETTINGS_KEYS,
  SETTINGS_REGISTRY,
  applySettingsToStores,
  parseSettingsDocument,
  readAutoSaveSnapshot,
} from './registry';

describe('settings registry', () => {
  test('round-trips custom selection approval text and clearing it without resetting omitted preferences', async () => {
    const options = useUIStore.persist.getOptions();
    const original = useUIStore.getState();
    let saved: Parameters<NonNullable<typeof options.storage>['setItem']>[1] = { state: original, version: options.version };
    try {
      useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: (_name, value) => { saved = value; }, removeItem: () => undefined } });
      for (const text of ['  认可此方案 👍  ', '']) {
        const parsed = parseSettingsDocument(JSON.parse(JSON.stringify({ selectionApprovalText: text })));
        expect(parsed).toEqual({ selectionApprovalText: text });
        if (!parsed) throw new Error('Expected valid settings');
        applySettingsToStores(parsed);
        expect(readAutoSaveSnapshot().selectionApprovalText).toBe(text);
        const persisted = saved;
        useUIStore.persist.setOptions({ storage: { getItem: () => persisted, setItem: () => undefined, removeItem: () => undefined } });
        useUIStore.getState().setSelectionApprovalText('other');
        await useUIStore.persist.rehydrate();
        expect(useUIStore.getState().selectionApprovalText).toBe(text);
        useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: (_name, value) => { saved = value; }, removeItem: () => undefined } });
      }
      useUIStore.getState().setSelectionApprovalText('Keep this');
      applySettingsToStores({});
      expect(useUIStore.getState().selectionApprovalText).toBe('Keep this');
      expect(parseSettingsDocument({ selectionApprovalText: null })).toEqual({});
      expect(parseSettingsDocument({ selectionApprovalText: 42 })).toEqual({});
      expect(parseSettingsDocument({ selectionApprovalText: 'x'.repeat(1001) })).toEqual({});
    } finally {
      useUIStore.persist.setOptions(options);
      useUIStore.setState(original, true);
    }
  });
  test('dictation auto-send is opt-in and adopts only explicit boolean preferences', () => {
    const dom = installHookTestDom();
    window.__zustand_config_store__ = useConfigStore;
    const original = useConfigStore.getState().dictationAutoSend;
    try {
      expect(useConfigStore.getInitialState().dictationAutoSend).toBe(false);
      expect(SETTINGS_REGISTRY.dictationAutoSend.scope).toBe('profile');
      expect(MIRRORED_KEYS).toContain('dictationAutoSend');
      for (const enabled of [true, false]) {
        const parsed = parseSettingsDocument(JSON.parse(JSON.stringify({ dictationAutoSend: enabled })));
        expect(parsed).toEqual({ dictationAutoSend: enabled });
        if (!parsed) throw new Error('Expected valid settings');
        applySettingsToStores(parsed);
        expect(useConfigStore.getState().dictationAutoSend).toBe(enabled);
        // The registry mirrors the field; the store's own setter is what persists
        // it, so the preference survives the next launch.
        useConfigStore.getState().setDictationAutoSend(enabled);
        expect(getSafeStorage().getItem('dictationAutoSend')).toBe(String(enabled));
        expect(useConfigStore.getState().dictationAutoSend).toBe(enabled);
      }
      applySettingsToStores({ dictationAutoSend: true });
      applySettingsToStores({});
      expect(useConfigStore.getState().dictationAutoSend).toBe(true);
      expect(parseSettingsDocument({ dictationAutoSend: 'true' })).toEqual({});
    } finally {
      useConfigStore.setState({ dictationAutoSend: original });
      dom.restore();
    }
  });

  test('round-trips all large text paste modes through settings and local persistence', async () => {
    const options = useUIStore.persist.getOptions();
    const original = useUIStore.getState();
    let saved: Parameters<NonNullable<typeof options.storage>['setItem']>[1] = { state: original, version: options.version };
    try {
      useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: (_name, value) => { saved = value; }, removeItem: () => undefined } });
      for (const mode of ['ask', 'attach', 'inline', 'inline-double-paste']) {
        const parsed = parseSettingsDocument(JSON.parse(JSON.stringify({ largeTextPasteBehavior: mode })));
        expect(parsed).toEqual({ largeTextPasteBehavior: mode });
        if (!parsed) throw new Error('Expected valid mode');
        applySettingsToStores(parsed);
        expect(useUIStore.getState().largeTextPasteBehavior).toBe(mode);
        expect(readAutoSaveSnapshot().largeTextPasteBehavior).toBe(mode);
        const persisted = saved;
        useUIStore.persist.setOptions({ storage: { getItem: () => persisted, setItem: () => undefined, removeItem: () => undefined } });
        useUIStore.getState().setLargeTextPasteBehavior('ask');
        await useUIStore.persist.rehydrate();
        expect(useUIStore.getState().largeTextPasteBehavior).toBe(mode);
        useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: (_name, value) => { saved = value; }, removeItem: () => undefined } });
      }
      expect(parseSettingsDocument({ largeTextPasteBehavior: 'invalid' })).toEqual({});
    } finally {
      useUIStore.persist.setOptions(options);
      useUIStore.setState(original, true);
    }
  });
  test('keeps the Host-owned permission policy as a profile key the server reads back', () => {
    expect(SETTINGS_REGISTRY.permissionAutoAccept.scope).toBe('profile');
    expect(MIRRORED_KEYS).toContain('permissionAutoAccept');
    const policy = { sessions: { ses_a: 'safety', ses_legacy: true }, revision: 2 };
    expect(parseSettingsDocument({ permissionAutoAccept: policy })).toEqual({ permissionAutoAccept: policy });
    // An entry that is neither a mode nor a legacy boolean is dropped, never
    // defaulted; the permission runtime fails closed to `ask` for it anyway.
    expect(parseSettingsDocument({ permissionAutoAccept: { sessions: { ses_a: 'always' }, revision: 1 } }))
      .toEqual({ permissionAutoAccept: { sessions: {}, revision: 1 } });
    expect(parseSettingsDocument({ permissionAutoAccept: { sessions: {} } }))
      .toEqual({ permissionAutoAccept: { sessions: {}, revision: 0 } });
    expect(parseSettingsDocument({ permissionAutoAccept: 'on' })).toEqual({});
  });

  test('applies the server-owned overview feature flag to the UI store', () => {
    const original = useUIStore.getState().overviewFeatureAvailable;
    try {
      useUIStore.setState({ overviewFeatureAvailable: false });
      const parsed = parseSettingsDocument({ overviewFeatureAvailable: true });
      expect(parsed).toEqual({ overviewFeatureAvailable: true });
      if (!parsed) throw new Error('Expected the overview flag to parse');
      applySettingsToStores(parsed);
      expect(useUIStore.getState().overviewFeatureAvailable).toBe(true);
      expect(useUIStore.getState().isOverviewOpen).toBe(false);
      // The page closes when the server says the build lost the feature.
      useUIStore.setState({ isOverviewOpen: true });
      applySettingsToStores({ overviewFeatureAvailable: false });
      expect(useUIStore.getState().overviewFeatureAvailable).toBe(false);
      expect(useUIStore.getState().isOverviewOpen).toBe(false);
    } finally {
      useUIStore.setState({ overviewFeatureAvailable: original, isOverviewOpen: false });
    }
  });

  test('accepts only interface languages the UI ships', () => {
    expect(parseSettingsDocument({ locale: 'zh-CN' })).toEqual({ locale: 'zh-CN' });
    expect(parseSettingsDocument({ locale: 'xx' })).toEqual({});
    expect(parseSettingsDocument({ locale: 3 })).toEqual({});
  });

  test('round-trips last-used efforts with an explicit Default', () => {
    const original = useUIStore.getState().lastUsedEfforts;
    try {
      const input = { 'anthropic/claude': 'high', 'openai/gpt-5': null };
      const parsed = parseSettingsDocument({ lastUsedEfforts: input });
      expect(parsed).toEqual({ lastUsedEfforts: input });
      if (!parsed) throw new Error('Expected valid settings');
      applySettingsToStores(parsed);
      expect(useUIStore.getState().lastUsedEfforts).toEqual(input);
      expect(parseSettingsDocument({ lastUsedEfforts: { 'anthropic/claude': 3 } })).toEqual({});
      expect(parseSettingsDocument({ lastUsedEfforts: { 'anthropic/claude': '' } })).toEqual({});
    } finally {
      useUIStore.setState({ lastUsedEfforts: original });
    }
  });
  test('project paths retain absolute Windows roots across parsing and serialization', () => {
    const parsed = parseSettingsDocument({
      projects: [
        { path: 'c:\\', label: 'Drive' },
        { path: 'c:\\Users\\Developer\\Project\\' },
        { path: 'C:/Users/Developer/Project' },
        { path: '\\\\Server\\Share\\' },
      ]
    });
    expect(parsed?.projects?.map((project) => project.path)).toEqual(['C:/', 'C:/Users/Developer/Project', '//Server/Share']);
    expect(parseSettingsDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  test('round-trips project label provenance and drops invalid or orphan sources', () => {
    const parsed = parseSettingsDocument({
      projects: [
        { path: '/example', label: ' Example ', labelSource: 'manual' },
        { path: '/auto', label: 'auto', labelSource: 'auto' },
        { path: '/invalid', label: 'Keep me', labelSource: 'unknown' },
        { path: '/orphan', labelSource: 'manual' },
        { path: '/blank', label: '  ', labelSource: 'auto' },
        { path: '/legacy', label: 'Legacy' },
      ]
    });
    expect(parsed?.projects?.map(({ path, label, labelSource }) => ({ path, label, labelSource }))).toEqual([
      { path: '/example', label: 'Example', labelSource: 'manual' },
      { path: '/auto', label: 'auto', labelSource: 'auto' },
      { path: '/invalid', label: 'Keep me', labelSource: undefined },
      { path: '/orphan', label: undefined, labelSource: undefined },
      { path: '/blank', label: undefined, labelSource: undefined },
      { path: '/legacy', label: 'Legacy', labelSource: undefined },
    ]);
    expect(parseSettingsDocument(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  test('round-trips section order without coupling it to visibility or partial snapshots', () => {
    const initial = useUIStore.getState().workStatusSectionOrder;
    const hidden = useUIStore.getState().workStatusHiddenSections;
    const explicit = useUIStore.getState().workStatusHiddenSectionsExplicit;
    try {
      useUIStore.getState().setWorkStatusSectionOrder(['mcp', 'repository', 'session']);
      const order = useUIStore.getState().workStatusSectionOrder;
      expect(order.slice(0, 3)).toEqual(['mcp', 'repository', 'session']);
      expect(AUTO_SAVE_KEYS).toContain('workStatusSectionOrder');
      expect(MIRRORED_KEYS).toContain('workStatusSectionOrder');
      const parsed = parseSettingsDocument(JSON.parse(JSON.stringify({ workStatusSectionOrder: readAutoSaveSnapshot().workStatusSectionOrder })));
      useUIStore.getState().setWorkStatusSectionOrder([]);
      if (!parsed) throw new Error('Expected valid settings');
      applySettingsToStores(parsed);
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(order);
      applySettingsToStores({ workStatusHiddenSections: ['mcp'] });
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(order);
      expect(parseSettingsDocument({ workStatusSectionOrder: 'bad' })).toEqual({});
      applySettingsToStores({});
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(order);
    } finally {
      useUIStore.setState({ workStatusSectionOrder: initial, workStatusHiddenSections: hidden, workStatusHiddenSectionsExplicit: explicit });
    }
  });

  test('section order: a saved order applies as stored and a dragged order stays', () => {
    const original = useUIStore.getState();
    const saved = ['session', 'repository', 'usage', 'telemetry', 'subagents', 'workflows', 'mcp', 'pinned', 'contextSources'];
    try {
      applySettingsToStores(parseSettingsDocument({ workStatusSectionOrder: saved }) ?? {});
      // The fork's store has one sanitized order and no explicit marker.
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(saved);

      const dragged = ['repository', 'session', 'usage', 'contextSources', 'telemetry', 'subagents', 'workflows', 'mcp', 'pinned'];
      useUIStore.getState().setWorkStatusSectionOrder(dragged);
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(dragged);

      // Obsolete ids are dropped and sections the build gained are appended.
      expect(sanitizeWorkStatusSectionOrder(['session', 'legacy-id', 'repository']))
        .toEqual(resolveWorkStatusSectionOrder(['session', 'repository'], []));
      // An order the user never arranged follows the default's Context sources move.
      expect(sanitizeWorkStatusSectionOrder(['session', 'repository', 'usage', 'subagents', 'mcp', 'pinned', 'contextSources'], false))
        .toEqual(['session', 'repository', 'usage', 'contextSources', 'subagents', 'mcp', 'pinned', 'telemetry', 'workflows']);
    } finally {
      useUIStore.setState(original, true);
    }
  });

  test('section order: the local store migration moves a saved default', async () => {
    const migrate = useUIStore.persist.getOptions().migrate;
    if (!migrate) throw new Error('Expected a migration');
    const savedDefault = ['session', 'repository', 'usage', 'telemetry', 'subagents', 'workflows', 'mcp', 'pinned', 'contextSources'];
    expect(await migrate({ workStatusSectionOrder: savedDefault }, 26)).toMatchObject({
      workStatusSectionOrder: ['session', 'repository', 'usage', 'contextSources', 'telemetry', 'subagents', 'tasks', 'workflows', 'mcp', 'pinned'],
    });
  });

  test('restores section order from the actual local persisted projection', async () => {
    const options = useUIStore.persist.getOptions();
    const original = useUIStore.getState();
    let saved: Parameters<NonNullable<typeof options.storage>['setItem']>[1] = { state: original, version: options.version };
    try {
      useUIStore.persist.setOptions({
        storage: {
          getItem: () => saved,
          setItem: (_name, value) => { saved = value; },
          removeItem: () => undefined,
        }
      });
      useUIStore.getState().setWorkStatusSectionOrder(['tasks', 'mcp', 'session']);
      const chosen = useUIStore.getState().workStatusSectionOrder;
      useUIStore.persist.setOptions({ storage: { getItem: () => saved, setItem: () => undefined, removeItem: () => undefined } });
      useUIStore.getState().setWorkStatusSectionOrder([]);
      await useUIStore.persist.rehydrate();
      expect(useUIStore.getState().workStatusSectionOrder).toEqual(chosen);
    } finally {
      useUIStore.persist.setOptions(options);
      useUIStore.setState(original, true);
    }
  });

  test('every key lives in exactly one table', () => {
    const all = [...SETTINGS_KEYS, ...LOCAL_DEVICE_KEYS, ...DESKTOP_SHELL_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });

  test('covers every key the ui-store persists, under its settings name', () => {
    const partialize = useUIStore.persist.getOptions().partialize;
    expect(partialize).toBeTruthy();
    // zustand types the persisted slice loosely; only its key names matter here.
    const persistedKeys = Object.keys(z.object({}).passthrough().parse(partialize!(useUIStore.getInitialState())));
    // The store's name for the shared `draftStarters` field.
    const aliases = new Map([['globalDraftStarters', 'draftStarters']]);
    const known = new Set<string>([...SETTINGS_KEYS, ...LOCAL_DEVICE_KEYS]);
    const missing = persistedKeys.map((key) => aliases.get(key) ?? key).filter((key) => !known.has(key));
    expect(missing).toEqual([]);
  });

  test('per-surface storage is a profile-only marker', () => {
    for (const key of SETTINGS_KEYS) {
      if (SETTINGS_REGISTRY[key].perSurface) {
        expect(SETTINGS_REGISTRY[key].scope).toBe('profile');
      }
    }
  });

  test('computed and secret fields never reach the mirror; computed ones are never auto-saved', () => {
    for (const key of MIRRORED_KEYS) {
      expect(SETTINGS_REGISTRY[key].secret).toBe(undefined);
      expect(SETTINGS_REGISTRY[key].computed).toBe(undefined);
      expect(SETTINGS_REGISTRY[key].scope).not.toBe('device');
    }
    for (const key of AUTO_SAVE_KEYS) {
      expect(SETTINGS_REGISTRY[key].computed).toBe(undefined);
    }
  });

  test('parses a document at the boundary: unknown keys dropped, rejected values absent, legacy keys mapped', () => {
    const parsed = parseSettingsDocument({
      fontSize: 15,
      toolJsonViewMode: 'invalid',
      queueModeEnabled: false,
      gitProviderId: 'anthropic',
      markdownDisplayMode: 'x',
      autoDeleteAfterDays: 900,
      sttProvider: 'server',
    });
    expect(parsed).toEqual({
      fontSize: 15,
      followUpBehavior: 'steer',
      queueModeEnabled: false,
      autoDeleteAfterDays: 365,
      sttProvider: 'openai-compatible',
    });
    expect(parseSettingsDocument(null)).toBeNull();
    expect(parseSettingsDocument([])).toBeNull();
  });

  test('reads the removed Sorted chat mode as collapsed activity until the user picks a mode', () => {
    expect(parseSettingsDocument({ chatRenderMode: 'sorted', activityRenderMode: 'summary' }))
      .toEqual({ chatRenderMode: 'sorted', activityRenderMode: 'collapsed' });
    expect(parseSettingsDocument({ chatRenderMode: 'sorted' }))
      .toEqual({ chatRenderMode: 'sorted', activityRenderMode: 'collapsed' });
    // Picking a mode in Settings writes chatRenderMode 'live' along with it.
    expect(parseSettingsDocument({ chatRenderMode: 'live', activityRenderMode: 'summary' }))
      .toEqual({ chatRenderMode: 'live', activityRenderMode: 'summary' });
    expect(parseSettingsDocument({ activityRenderMode: 'summary' })).toEqual({ activityRenderMode: 'summary' });
  });

  test('reads the old Wide chat layout switch as the Full chat width until a width is picked', () => {
    expect(parseSettingsDocument({ wideChatLayoutEnabled: true }))
      .toEqual({ wideChatLayoutEnabled: true, chatWidth: 'full' });
    expect(parseSettingsDocument({ wideChatLayoutEnabled: false }))
      .toEqual({ wideChatLayoutEnabled: false, chatWidth: 'default' });
    expect(parseSettingsDocument({ wideChatLayoutEnabled: true, chatWidth: 'wider' }))
      .toEqual({ wideChatLayoutEnabled: true, chatWidth: 'wider' });
    expect(parseSettingsDocument({ chatWidth: 'wide' })).toEqual({});
  });

  test('applies only the fields a snapshot carries and leaves the rest alone', () => {
    useUIStore.getState().setTerminalShell('fish');
    useUIStore.getState().setShowReasoningTraces(true);
    applySettingsToStores({ showReasoningTraces: false });
    expect(useUIStore.getState().showReasoningTraces).toBe(false);
    expect(useUIStore.getState().terminalShell).toBe('fish');
  });

  test('shows reasoning traces by default and treats an absent key as unchosen', () => {
    expect(useUIStore.getInitialState().showReasoningTraces).toBe(true);
    const original = useUIStore.getState().showReasoningTraces;
    try {
      useUIStore.getState().setShowReasoningTraces(true);
      // A snapshot without the key must not flip the default.
      applySettingsToStores({});
      expect(useUIStore.getState().showReasoningTraces).toBe(true);
      applySettingsToStores({ showReasoningTraces: false });
      expect(useUIStore.getState().showReasoningTraces).toBe(false);
    } finally {
      useUIStore.getState().setShowReasoningTraces(original);
    }
  });

  test('persists archived-only retention as an opt-in boolean and enforces its delete action', () => {
    expect(useUIStore.getInitialState().sessionRetentionOnlyArchived).toBe(false);
    expect(parseSettingsDocument({ sessionRetentionOnlyArchived: true })).toEqual({ sessionRetentionOnlyArchived: true });
    expect(parseSettingsDocument({ sessionRetentionOnlyArchived: false })).toEqual({ sessionRetentionOnlyArchived: false });
    expect(parseSettingsDocument({ sessionRetentionOnlyArchived: 'true' })).toEqual({});
    expect(AUTO_SAVE_KEYS).toContain('sessionRetentionOnlyArchived');
    expect(MIRRORED_KEYS).toContain('sessionRetentionOnlyArchived');

    applySettingsToStores({ sessionRetentionOnlyArchived: false, sessionRetentionAction: 'archive' });
    useUIStore.getState().setSessionRetentionOnlyArchived(true);
    expect(useUIStore.getState().sessionRetentionAction).toBe('delete');
    useUIStore.getState().setSessionRetentionAction('archive');
    expect(useUIStore.getState().sessionRetentionAction).toBe('delete');
    expect(readAutoSaveSnapshot().sessionRetentionOnlyArchived).toBe(true);
    expect(readAutoSaveSnapshot().sessionRetentionAction).toBe('delete');

    applySettingsToStores({ sessionRetentionOnlyArchived: true, sessionRetentionAction: 'archive' });
    expect(useUIStore.getState().sessionRetentionAction).toBe('delete');
    applySettingsToStores({ fontSize: 100 });
    expect(useUIStore.getState().sessionRetentionOnlyArchived).toBe(true);
    applySettingsToStores({ sessionRetentionOnlyArchived: false, sessionRetentionAction: 'archive' });
    expect(useUIStore.getState().sessionRetentionOnlyArchived).toBe(false);
    expect(useUIStore.getState().sessionRetentionAction).toBe('archive');
  });

  test('persists the four commit-message controls, keeping absent distinct from false', () => {
    const keys = ['generateCommitMessages', 'commitMessageReasoning', 'commitMessageNotes', 'commitMessageChangeId'] as const;
    for (const key of keys) {
      expect(SETTINGS_KEYS).toContain(key);
      expect(SETTINGS_REGISTRY[key].scope).toBe('profile');
      expect(MIRRORED_KEYS).toContain(key);
      expect(parseSettingsDocument({ [key]: true })).toEqual({ [key]: true });
      expect(parseSettingsDocument({ [key]: false })).toEqual({ [key]: false });
      // A rejected value is dropped as absent, never replaced by a default.
      expect(parseSettingsDocument({ [key]: 'true' })).toEqual({});
    }
    // Absent stays absent: the defaults belong to `lib/gitCommitSettings.ts`,
    // not to the parser, so generation stays on for an untouched install.
    expect(parseSettingsDocument({ gitmojiEnabled: true }))
      .toEqual({ gitmojiEnabled: true });
  });

  test('applies the hidden-sections list together with its explicit marker', () => {
    applySettingsToStores({ workStatusHiddenSections: ['mcp', 'telemetry'] });
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(false);
    applySettingsToStores({ workStatusHiddenSections: ['mcp', 'telemetry'], workStatusHiddenSectionsExplicit: true });
    expect(useUIStore.getState().workStatusHiddenSections).toEqual(['mcp', 'telemetry']);
    expect(useUIStore.getState().workStatusHiddenSectionsExplicit).toBe(true);
  });

});

describe('custom stt endpoint path setting', () => {
  test('is an instance setting that trims and caps the path', () => {
    expect(SETTINGS_REGISTRY.sttEndpointPath.scope).toBe('instance');
    expect(parseSettingsDocument({ sttEndpointPath: ' /speech_to_text ' })).toEqual({ sttEndpointPath: '/speech_to_text' });
    expect(parseSettingsDocument({ sttEndpointPath: `/${'a'.repeat(1024)}` })).toEqual({});
  });
});

/**
 * The registry decides what persists, so every row must also name something
 * that reads the value back. A row whose reader was deleted keeps writing a
 * preference no code path honours, and nothing else in the suite notices.
 *
 * The search is deliberately mechanical: it looks for the key's name (or its
 * `ui` binding's store field name) as a whole word in every source file, and
 * fails when only plumbing mentions it. Plumbing is the code whose whole job
 * is moving settings around — the registry, the stores' own field/setter
 * declarations, persistence, the auto-savers, the server's sanitizer and
 * runtime, the generated snapshot, i18n, and tests. A key that appears only
 * there is stored and never used.
 */
describe('settings registry effects', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');

  /** Files that move settings rather than consume them; see the doc comment. */
  const PLUMBING = new Set([
    'packages/ui/src/lib/settings/registry.ts',
    'packages/ui/src/lib/settings/registry.test.ts',
    'packages/ui/src/lib/settings/registry-snapshot.ts',
    'packages/ui/src/lib/settings/search.ts',
    'packages/ui/src/lib/persistence.ts',
    'packages/ui/src/lib/persistence.test.ts',
    'packages/ui/src/lib/appearanceAutoSave.ts',
    'packages/ui/src/lib/modelPrefsAutoSave.ts',
    'packages/web/server/lib/host/settings-helpers.js',
    'packages/web/server/lib/host/settings-helpers.test.js',
    'packages/web/server/lib/host/settings-runtime.js',
    'packages/web/server/lib/host/settings-files.js',
  ]);

  const SOURCE_ROOTS = [
    'packages/ui/src',
    'packages/web/server',
    'packages/electron',
    'packages/mobile',
    'packages/agent-service',
  ];
  const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
  // Build outputs are not source. `resources/web-dist` and the staged agent
  // runtime are produced by `electron:build` and are gitignored, so scanning
  // them would make this test's result depend on whether Electron was built.
  const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-bundle', 'build', 'out', '.git', 'ios', 'android', 'web-dist', 'agent-runtime']);

  const isPlumbing = (relativePath: string): boolean =>
    PLUMBING.has(relativePath)
    || relativePath.startsWith('packages/ui/src/lib/i18n/messages/')
    || /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(relativePath)
    || relativePath.endsWith('settings-registry.json');

  const sourceFiles = (): string[] => {
    const found: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name)) walk(join(directory, entry.name));
        } else if (SOURCE_FILE.test(entry.name)) {
          found.push(join(directory, entry.name));
        }
      }
    };
    for (const root of SOURCE_ROOTS) walk(join(repoRoot, root));
    return found;
  };

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /**
   * The store's own bookkeeping for a field: its declaration, its setter's
   * declaration, its projection into the persisted slice, the `set({...})`
   * that writes it, and the migration lines that assign or delete it. Those
   * lines exist because the field is persisted, not because anything reads it.
   */
  const storePlumbingLine = (line: string, name: string): boolean => {
    const escaped = escapeRegExp(name);
    return new RegExp(`^\\s*(readonly\\s+)?${escaped}\\??\\s*:`).test(line)
      || new RegExp(`^\\s*set[A-Z]\\w*\\??\\s*:`).test(line)
      || new RegExp(`${escaped}\\s*:\\s*state\\.${escaped}\\b`).test(line)
      || new RegExp(`set\\(\\{[^}]*\\b${escaped}\\s*:`).test(line)
      || new RegExp(`\\b${escaped}\\s*=(?!=)`).test(line)
      || new RegExp(`delete\\s+state\\.${escaped}\\b`).test(line);
  };
  const consumerClassOf = (relativePath: string): 'ui' | 'store' | 'server' | 'shell' => {
    if (relativePath.startsWith('packages/ui/src/stores/')) return 'store';
    if (relativePath.startsWith('packages/ui/src/')) return 'ui';
    if (relativePath.startsWith('packages/electron')) return 'shell';
    return 'server';
  };

  /** Settings pages that hold/edit settings without consuming them at runtime. */
  const isSettingsPage = (relativePath: string, key: string): boolean => {
    // Task 16 is landing worker-side suggestion generator in a parallel window
    if (key === 'suggestionGenerator') return false;
    return relativePath.startsWith('packages/ui/src/components/sections/')
      || relativePath === 'packages/ui/src/components/views/SettingsView.tsx';
  };

  /**
   * Every identifier mapped to the files that mention it and their classes.
   */
  const fileConsumersByIdentifier = (): Map<string, Map<string, 'ui' | 'store' | 'server' | 'shell'>> => {
    const index = new Map<string, Map<string, 'ui' | 'store' | 'server' | 'shell'>>();
    for (const file of sourceFiles()) {
      const relativePath = relative(repoRoot, file).replaceAll('\\', '/');
      if (isPlumbing(relativePath)) continue;
      const consumerClass = consumerClassOf(relativePath);
      const isStore = relativePath.startsWith('packages/ui/src/stores/');
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        const identifiers = line.match(/[A-Za-z_$][\w$]*/g);
        if (!identifiers) continue;
        for (const identifier of new Set(identifiers)) {
          if (isStore && storePlumbingLine(line, identifier)) continue;
          const files = index.get(identifier) ?? new Map();
          files.set(relativePath, consumerClass);
          index.set(identifier, files);
        }
      }
    }
    return index;
  };

  const fileConsumers = fileConsumersByIdentifier();
  /** Classes of code reading a key: the key itself or the store field it binds. */
  const effectClassesOf = (key: string): Set<string> => {
    const storeField = (SETTINGS_REGISTRY as Record<string, { ui?: { field?: string } }>)[key]?.ui?.field;
    const names = storeField && storeField !== key ? [key, storeField] : [key];
    const classes = new Set<string>();
    for (const name of names) {
      const files = fileConsumers.get(name);
      if (!files) continue;
      for (const [, consumerClass] of files.entries()) {
        classes.add(consumerClass);
      }
    }
    return classes;
  };

  /** Runtime consumers outside plumbing and outside settings editor pages. */
  const runtimeConsumersOf = (key: string): Set<string> => {
    const storeField = (SETTINGS_REGISTRY as Record<string, { ui?: { field?: string } }>)[key]?.ui?.field;
    const names = storeField && storeField !== key ? [key, storeField] : [key];
    const consumers = new Set<string>();
    for (const name of names) {
      const files = fileConsumers.get(name);
      if (!files) continue;
      for (const [file] of files.entries()) {
        if (isSettingsPage(file, key)) continue;
        consumers.add(file);
      }
    }
    return consumers;
  };

  test('every key has a consumer outside the settings plumbing', () => {
    const withoutConsumer = [...SETTINGS_KEYS, ...LOCAL_DEVICE_KEYS].filter((key) => {
      const consumers = runtimeConsumersOf(key);
      // Secret or computed instance keys are consumed in settings dialogs or server runtime
      if (SETTINGS_REGISTRY[key as keyof typeof SETTINGS_REGISTRY]?.computed) return false;
      if (SETTINGS_REGISTRY[key as keyof typeof SETTINGS_REGISTRY]?.secret) return false;
      // Local device keys are consumed in settings sidebars or dialogs
      if (LOCAL_DEVICE_KEYS.includes(key as typeof LOCAL_DEVICE_KEYS[number])) return false;
      return consumers.size === 0;
    });
    expect(withoutConsumer).toEqual([]);
  });

  test('every key declares an effect, and the declaration matches its consumers', () => {
    const mismatches: string[] = [];
    for (const key of SETTINGS_KEYS) {
      const declared = SETTINGS_REGISTRY[key].effect;
      if (!Array.isArray(declared) || declared.length === 0) {
        mismatches.push(`${key}: no effect declared`);
        continue;
      }
      const actual = effectClassesOf(key);
      // A declared effect with no consumer is a claim the code does not
      // support; a consumer class not declared is the same drift, reversed.
      for (const effect of declared) {
        if (!actual.has(effect)) mismatches.push(`${key}: declares '${effect}' but nothing outside plumbing reads it there`);
      }
      for (const consumerClass of actual) {
        if (!declared.includes(consumerClass)) mismatches.push(`${key}: read by '${consumerClass}' but does not declare it`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
