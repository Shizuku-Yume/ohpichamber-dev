import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as contract from '@openchamber/agent-contract';
import { orderedSettings } from '@oh-my-pi/pi-coding-agent/config/all-settings';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { OMP_SETTING_EXPOSED_IDS, OMP_SETTING_OWNER_IDS, OMP_SETTING_PLACEMENTS, presentOmpSetting } from './settings-ui.ts';
import { NativeSettings } from './catalog-settings.ts';
import { readFileSync, readdirSync, statSync } from 'node:fs';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'settings-ui-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  return {
    settings, cwd, agentDirectory, native: new NativeSettings(settings, agentDirectory),
    async close() {
      settings.cancelPendingSaves();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('every TUI-visible OMP setting has a placement and no hand-kept id list remains', () => {
  expect((contract as Record<string, unknown>).OMP_SETTING_IDS).toBeUndefined();
  const all = orderedSettings();
  const tuiVisible = all.filter(s => s.ui?.tab !== undefined);
  expect(tuiVisible.length).toBe(482);

  for (const setting of tuiVisible) {
    const placement = OMP_SETTING_PLACEMENTS[setting.id];
    expect(placement, `Missing placement for TUI-visible setting ${setting.id}`).toBeDefined();
    expect(placement.type, `Placement for ${setting.id} must not be hidden`).not.toBe('hidden');
    expect(['page', 'engine', 'tui-only', 'owned-by', 'config-only', 'boundary'], setting.id).toContain(placement.type);
    if (placement.type === 'owned-by') {
      expect(placement.owner.length, setting.id).toBeGreaterThan(0);
    }
  }

  // Untabbed settings default to hidden when not explicitly placed
  const untabbedHidden = presentOmpSetting('some.unplaced.untabbed.setting', undefined, null as unknown as Settings);
  expect(untabbedHidden.placement).toEqual({ type: 'hidden' });
});

test('misclassifications are fixed: followUpMode is not a chat owner; recap belongs to Chat → Session recap', () => {
  expect(OMP_SETTING_PLACEMENTS['followUpMode']).toEqual({ type: 'page', page: 'sessions', section: 'execution' });
  expect(OMP_SETTING_PLACEMENTS['recap.enabled']).toEqual({ type: 'owned-by', owner: 'chat.session-recap' });
  expect(OMP_SETTING_PLACEMENTS['recap.idleSeconds']).toEqual({ type: 'owned-by', owner: 'chat.session-recap' });
  expect(OMP_SETTING_OWNER_IDS).not.toContain('chat.follow-up-behavior');
});

test('an owned-by placement names an owner control, and all placement types stay populated', () => {
  expect([...OMP_SETTING_OWNER_IDS].sort()).toEqual([
    'chat.session-recap', 'chat.suggestion-generator', 'omp.modelRoles', 'sessions.default-thinking',
    'sessions.fallback-model', 'sessions.model-compaction',
  ]);
  const counts = { page: 0, engine: 0, 'tui-only': 0, 'owned-by': 0, 'config-only': 0, hidden: 0, boundary: 0 };
  for (const placement of Object.values(OMP_SETTING_PLACEMENTS)) {
    counts[placement.type] += 1;
  }
  expect(counts.page).toBeGreaterThan(0);
  expect(counts.engine).toBeGreaterThan(0);
  expect(counts['tui-only']).toBeGreaterThan(0);
  expect(counts['owned-by']).toBeGreaterThan(0);
});

test('reads surface, owner and condition from the pinned definitions', async () => {
  const f = await fixture();
  try {
    const state = await f.native.read('workspace_1', '0');
    // The page needs the file it hides settings from, not a second renderer.
    expect(state.configPath).toBe(join(f.agentDirectory, 'config.yml'));
    const byId = new Map(state.settings.map(setting => [setting.id, setting]));
    expect(byId.get('compaction.thresholdPercent')).toMatchObject({ placement: { type: 'page', page: 'sessions', section: 'compaction' } });
    expect(byId.has('enabledModels')).toBe(false);
    expect(byId.has('tui.renderMermaid')).toBe(false);
    expect(byId.get('tools.artifactTailLines')).toMatchObject({ placement: { type: 'engine' } });
    expect(byId.has('cycleOrder')).toBe(false);
    // OMP's own `ui.condition` travels with the descriptor and is evaluated
    // against this worker's settings, not a process-wide singleton.
    expect(byId.get('retry.usageReservePct')).toMatchObject({
      condition: 'usageAwareFallbackEnabled', conditionActive: false,
    });
    // The pinned definition gates both plan rows on plan mode itself;
    // `planAutosaveEnabled` belongs to `plan.autosaveDir`, which the
    // no GUI owner draws.
    expect(byId.get('plan.defaultOnStartup')).toMatchObject({ condition: 'planModeEnabled', conditionActive: true });
    expect(byId.get('plan.autosave')).toMatchObject({ condition: 'planModeEnabled', conditionActive: true });
    expect(byId.get('retry.usageReservePolicy')).toMatchObject({ condition: 'usageAwareFallbackEnabled', conditionActive: false });
    // A setting without a condition never claims one.
    expect(byId.get('compaction.enabled')).not.toHaveProperty('condition');
  } finally { await f.close(); }
});

test('a condition turns true when the setting it reads is turned on', async () => {
  const f = await fixture();
  try {
    const read = await f.native.read('workspace_1', '0');
    await f.native.write('workspace_1', '1', {
      expectedRevision: read.revision,
      changes: [
        { id: 'retry.usageAwareFallback', value: true },
        { id: 'plan.enabled', value: false },
      ],
    });
    const after = await f.native.read('workspace_1', '2');
    const byId = new Map(after.settings.map(setting => [setting.id, setting]));
    expect(byId.get('retry.usageReservePct')).toMatchObject({ conditionActive: true });
    expect(byId.get('retry.usageReservePolicy')).toMatchObject({ conditionActive: true });
    // A condition reading a setting no GUI owner draws still
    // evaluates against the same handle, so plan mode being off hides its rows.
    expect(byId.get('plan.defaultOnStartup')).toMatchObject({ conditionActive: false });
    expect(byId.get('plan.autosave')).toMatchObject({ conditionActive: false });
  } finally { await f.close(); }
});

test('an unknown condition name keeps the row visible', async () => {
  const f = await fixture();
  try {
    expect(presentOmpSetting('compaction.enabled', 'someClosedSourceCondition', f.settings)).toEqual({
      placement: { type: 'page', page: 'sessions', section: 'compaction' }, condition: 'someClosedSourceCondition', conditionActive: true,
    });
  } finally { await f.close(); }
});

test('every engine placement carries OMP label and description from the pinned registry', () => {
  for (const setting of orderedSettings()) {
    if (setting.isCredential) continue;
    if (OMP_SETTING_PLACEMENTS[setting.id]?.type !== 'engine') continue;
    expect(setting.ui?.label, `${setting.id} needs an OMP label`).toBeTruthy();
    expect(setting.ui?.description, `${setting.id} needs an OMP description`).toBeTruthy();
  }
});

test('only GUI-owned settings are exposed: boundary, tui-only and unwritten page placements are not', () => {
  for (const id of ['skills.registryUrl', 'plan.autosaveDir', 'tui.renderSvg', 'stt.enabled', 'collab.relayUrl']) {
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(false);
  }
  // Terminal renderer switches, print mode, and two silent egress toggles have
  // no GUI consumer: they stay in config.yml and the route refuses them.
  for (const id of [
    'read.renderMarkdown', 'read.toolResultPreview', 'mcp.renderMarkdownResults',
    'async.printWake', 'extensionRenderers.assistantText',
  ]) {
    expect(OMP_SETTING_PLACEMENTS[id], id).toEqual({ type: 'tui-only' });
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(false);
  }
  for (const id of ['dev.autoqa', 'spotlight.experiment.enabled']) {
    expect(OMP_SETTING_PLACEMENTS[id], id).toEqual({ type: 'boundary' });
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(false);
  }
  // Record/Array engine settings with no generic choices cannot be edited via GUI controls and stay in config.yml
  for (const id of ['tools.approval', 'bash.patterns', 'model.toolCallLoopGuard.exemptTools']) {
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(false);
  }
  for (const id of ['compaction.thresholdPercent', 'recap.enabled', 'defaultThinkingLevel', 'modelRoles', 'steeringMode', 'plan.enabled', 'goal.enabled', 'retry.fallbackChains']) {
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(true);
  }
});

test('a moved row is absent from state and refused on write', async () => {
  const f = await fixture();
  try {
    const state = await f.native.read('workspace_1', '0');
    const byId = new Map(state.settings.map(setting => [setting.id, setting]));
    const moved = [
      'read.renderMarkdown', 'read.toolResultPreview', 'mcp.renderMarkdownResults',
      'async.printWake', 'extensionRenderers.assistantText',
      'dev.autoqa', 'spotlight.experiment.enabled', 'secrets.enabled', 'providers.fetch',
      'git.enabled', 'completion.notify', 'error.notify', 'ask.notify',
      'exa.enabled', 'exa.searchDelayMs', 'providers.webSearchTimeoutSeconds',
    ];
    for (const id of moved) {
      expect(byId.has(id), id).toBe(false);
      await expect(f.native.write('workspace_1', '1', {
        expectedRevision: state.revision,
        changes: [{ id, value: true }],
      }), id).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    }
  } finally { await f.close(); }
});

test('General power uses the native OMP sleep-prevention setting', async () => {
  const f = await fixture();
  try {
    const before = await f.native.read('workspace_1', '0');
    const power = before.settings.find(({ id }) => id === 'power.sleepPrevention');
    expect(power).toMatchObject({
      placement: { type: 'page', page: 'general', section: 'power' },
      value: 'idle',
    });
    const write = f.native.write('workspace_1', '1', {
      expectedRevision: before.revision,
      changes: [{ id: 'power.sleepPrevention', value: 'off' }],
    });
    const missingLinuxBus = process.platform === 'linux' && !process.env.DBUS_SYSTEM_BUS_ADDRESS
      && !statSync('/var/run/dbus/system_bus_socket', { throwIfNoEntry: false })?.isSocket();
    if (missingLinuxBus) {
      expect(power).toMatchObject({ condition: contract.OMP_POWER_CONDITIONS.backendAvailable, conditionActive: false });
      await expect(write).rejects.toMatchObject({ code: 'UNSUPPORTED_CAPABILITY' });
      expect((await f.native.read('workspace_1', '0')).settings.find(({ id }) => id === 'power.sleepPrevention')?.value).toBe('idle');
      return;
    }
    expect(power?.conditionActive).toBeUndefined();
    await write;
    const after = await f.native.read('workspace_1', '1');
    expect(after.settings.find(({ id }) => id === 'power.sleepPrevention')?.value).toBe('off');
  } finally { await f.close(); }
});

test('a project power override is readable but cannot change the global config', async () => {
  const f = await fixture();
  try {
    const globalPath = join(f.agentDirectory, 'config.yml');
    const globalConfig = 'power:\n  sleepPrevention: idle\n';
    await writeFile(globalPath, globalConfig);
    await mkdir(join(f.cwd, '.omp'));
    await writeFile(join(f.cwd, '.omp', 'config.yml'), 'power:\n  sleepPrevention: display\n');
    const before = await f.native.read('workspace_1', '0');
    expect(before.settings.find(({ id }) => id === 'power.sleepPrevention')).toMatchObject({
      value: 'display',
      condition: contract.OMP_POWER_CONDITIONS.usesSharedConfig,
      conditionActive: false,
    });
    await expect(f.native.write('workspace_1', '1', {
      expectedRevision: before.revision,
      changes: [{ id: 'power.sleepPrevention', value: 'off' }],
    })).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect(readFileSync(globalPath, 'utf8')).toBe(globalConfig);
  } finally { await f.close(); }
});

test('model compaction rules persist their native formats and reject invalid edits atomically', async () => {
  const f = await fixture();
  try {
    const rules = { 'example/*': '80%', 'example/reasoning': 'f90000', 'other/model': 80000 };
    const state = await f.native.write('workspace_1', '1', {
      expectedRevision: '0',
      changes: [{ id: 'compaction.modelThresholds', value: rules }, { id: 'compaction.modelThresholdsEnabled', value: false }],
    });
    expect(state.settings.find(({ id }) => id === 'compaction.modelThresholds')).toMatchObject({
      placement: { type: 'owned-by', owner: 'sessions.model-compaction' },
      value: rules,
    });
    expect(state.settings.find(({ id }) => id === 'compaction.modelThresholdsEnabled')?.value).toBe(false);
    await expect(f.native.write('workspace_1', '2', {
      expectedRevision: '1',
      changes: [{ id: 'compaction.modelThresholdsEnabled', value: true }, { id: 'compaction.modelThresholds', value: { 'example/*': '101%' } }],
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    const after = await f.native.read('workspace_1', '1');
    expect(after.settings.find(({ id }) => id === 'compaction.modelThresholds')?.value).toEqual(rules);
    expect(after.settings.find(({ id }) => id === 'compaction.modelThresholdsEnabled')?.value).toBe(false);
  } finally { await f.close(); }
});

test('a stale model compaction edit cannot overwrite newer settings on disk', async () => {
  const f = await fixture();
  try {
    const globalPath = join(f.agentDirectory, 'config.yml');
    const initialRules = { 'example/*': 90000 };
    await writeFile(globalPath, 'compaction:\n  modelThresholds:\n    example/*: 90000\n');
    const before = await f.native.read('workspace_1', '0');
    expect(before.settings.find(({ id }) => id === 'compaction.modelThresholds')?.value).toEqual(initialRules);
    const updatedConfig = 'compaction:\n  modelThresholds:\n    example/*: 90000\n    other/model: "80%"\n';
    await writeFile(globalPath, updatedConfig);
    await expect(f.native.write('workspace_1', '1', {
      expectedRevision: before.revision,
      changes: [{
        id: 'compaction.modelThresholds',
        value: { 'example/*': 85000 },
        expectedValue: initialRules,
      }],
    })).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect(readFileSync(globalPath, 'utf8')).toBe(updatedConfig);
  } finally { await f.close(); }
});

test('project model compaction rules are readable without writing them to shared config', async () => {
  const f = await fixture();
  try {
    const globalPath = join(f.agentDirectory, 'config.yml');
    const globalConfig = 'compaction:\n  modelThresholds:\n    example/*: 90000\n';
    await writeFile(globalPath, globalConfig);
    await mkdir(join(f.cwd, '.omp'));
    await writeFile(join(f.cwd, '.omp', 'config.yml'), 'compaction:\n  modelThresholds:\n    other/model: "80%"\n');
    const before = await f.native.read('workspace_1', '0');
    expect(before.settings.find(({ id }) => id === 'compaction.modelThresholds')).toMatchObject({
      value: { 'other/model': '80%' },
      conditionActive: false,
    });
    await expect(f.native.write('workspace_1', '1', {
      expectedRevision: '0',
      changes: [{ id: 'compaction.modelThresholds', value: {} }],
    })).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect(readFileSync(globalPath, 'utf8')).toBe(globalConfig);
  } finally { await f.close(); }
});

test('project resets cannot expose hidden shared model compaction rules to replacement', async () => {
  const f = await fixture();
  try {
    const globalPath = join(f.agentDirectory, 'config.yml');
    const globalConfig = 'compaction:\n  modelThresholds:\n    example/*: 90000\n  modelThresholdsEnabled: false\n';
    await writeFile(globalPath, globalConfig);
    await mkdir(join(f.cwd, '.omp'));
    await writeFile(join(f.cwd, '.omp', 'config.yml'), 'compaction:\n  modelThresholds: null\n  modelThresholdsEnabled: null\n');
    const before = await f.native.read('workspace_1', '0');
    for (const setting of before.settings.filter(({ id }) => id.startsWith('compaction.modelThresholds'))) {
      expect(setting.conditionActive).toBe(false);
      await expect(f.native.write('workspace_1', '1', {
        expectedRevision: before.revision,
        changes: [{ id: setting.id, value: setting.default, expectedValue: setting.value }],
      })).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    }
    expect(readFileSync(globalPath, 'utf8')).toBe(globalConfig);
  } finally { await f.close(); }
});

test('the auto thinking ceiling reports its condition against defaultThinkingLevel', async () => {
  const f = await fixture();
  try {
    // OMP's `autoThinkingActive` is `defaultThinkingLevel === "auto"`, so the
    // ceiling row only applies to the auto preset. The pinned default is
    // `high`, where the row has no effect and the page hides it.
    const read = await f.native.read('workspace_1', '0');
    const before = new Map(read.settings.map(setting => [setting.id, setting]));
    expect(before.get('providers.autoThinkingMaxEffort')).toMatchObject({
      condition: 'autoThinkingActive', conditionActive: false,
    });

    await f.native.write('workspace_1', '1', {
      expectedRevision: read.revision,
      changes: [{ id: 'defaultThinkingLevel', value: 'auto' }],
    });
    const after = new Map((await f.native.read('workspace_1', '2')).settings.map(setting => [setting.id, setting]));
    expect(after.get('providers.autoThinkingMaxEffort')).toMatchObject({ conditionActive: true });
  } finally { await f.close(); }
});

test('every exposed page row is drawn by the section a GUI owner renders', () => {
  // A placement on a page section nobody draws makes the row writable but
  // invisible: the "hollow setting" this effort exists to remove. The section
  // names are read from the components that render them, so a deleted section
  // fails here instead of being excused by this test's own list.
  const placed = new Map<string, Set<string>>();
  for (const id of OMP_SETTING_EXPOSED_IDS) {
    const placement = OMP_SETTING_PLACEMENTS[id];
    if (placement?.type !== 'page') continue;
    const sections = placed.get(placement.page) ?? new Set<string>();
    sections.add(placement.section);
    placed.set(placement.page, sections);
  }

  // Fail closed. A page with exposed rows whose owner this test cannot read is
  // an unchecked page, not a clean one: that is how the Sessions page slipped
  // through while 57 of its rows went unverified.
  const unread: string[] = [];
  const unwritten: string[] = [];
  for (const [page, sections] of placed) {
    const rendered = renderedSections(page);
    if (rendered === undefined) {
      unread.push(page);
      continue;
    }
    for (const section of sections) {
      if (!rendered.has(section)) unwritten.push(`${page}:${section}`);
    }
  }
  expect(unread).toEqual([]);
  expect(unwritten).toEqual([]);
});

test('the placement table contains only live IDs and never silently drops a page row', () => {
  const registered = new Set(orderedSettings().map((setting) => setting.id));
  registered.add('suggestion.generator');
  const placements = Object.entries(OMP_SETTING_PLACEMENTS);
  expect(placements.filter(([id]) => !registered.has(id)).map(([id]) => id)).toEqual([]);
  expect(placements
    .filter(([id, placement]) => placement.type === 'page' && !OMP_SETTING_EXPOSED_IDS.has(id))
    .map(([id]) => id)).toEqual([]);
});

test('a value no generic row can draw is owned by the control that writes it, or config-only', () => {
  // A per-model record or a bare array has no option list, so an OmpRowControl
  // would draw an empty chip group. Those values either name the control that
  // writes them or stay in config.yml; none sits on a page as a hollow row.
  expect(OMP_SETTING_PLACEMENTS['retry.fallbackChains']).toEqual({ type: 'owned-by', owner: 'sessions.fallback-model' });
  expect(OMP_SETTING_EXPOSED_IDS.has('retry.fallbackChains')).toBe(true);
  for (const id of ['tools.approval', 'tools.restrictedFolders', 'compaction.methodOrder', 'ttsr.disabledRules', 'bash.patterns', 'model.toolCallLoopGuard.exemptTools', 'task.perCallModelAllow', 'goal.continuationModes', 'tools.commandInline']) {
    expect(OMP_SETTING_PLACEMENTS[id], id).toEqual({ type: 'config-only' });
    expect(OMP_SETTING_EXPOSED_IDS.has(id), id).toBe(false);
  }
});

/**
 * The locale dictionaries in `omp-settings.i18n.ts`, read as text because the UI
 * package is not an import target for the worker: the file is the source the
 * page renders from, so a key missing there is missing in the app.
 */
function readDictionaries(): Map<string, Map<string, string>> {
  const source = readFileSync(
    String(new URL('../../../ui/src/lib/i18n/messages/omp-settings.i18n.ts', import.meta.url).pathname),
    'utf8',
  );
  const dictionaries = new Map<string, Map<string, string>>();
  for (const block of source.matchAll(/^ {2}'([^']+)': \{\n([\s\S]*?)^ {2}\},?$/gm)) {
    const entries = new Map<string, string>();
    for (const line of block[2].matchAll(/^ {4}'([^']+)': (?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),$/gm)) {
      entries.set(line[1], line[2] ?? line[3] ?? '');
    }
    dictionaries.set(block[1], entries);
  }
  return dictionaries;
}

test('every exposed OMP row has a label and description in all fifteen locales', () => {
  // `OmpRowControl` renders the locale and falls back to OMP's English copy, so
  // a row without a translation shows English in a Chinese UI — and a row whose
  // OMP label is empty used to show its raw id (`modelRoles`). The ids come from
  // the placement table, not a hand list, so a newly exposed row cannot join the
  // page without copy.
  const dictionaries = readDictionaries();
  expect([...dictionaries.keys()].sort()).toEqual([
    'ar', 'de', 'en', 'es', 'fr', 'he', 'ja', 'ko', 'nl', 'pl', 'pt-BR', 'tr', 'uk', 'zh-CN', 'zh-TW',
  ]);

  // The rows a control draws: engine rows and page rows on a page the UI owns.
  // `owned-by` rows are drawn by their named control, which supplies its own
  // translated label.
  const drawn = [...OMP_SETTING_EXPOSED_IDS].filter((id) => OMP_SETTING_PLACEMENTS[id]?.type !== 'owned-by');
  const english = dictionaries.get('en')!;
  const missing: string[] = [];
  // A description identical to the English one is an untranslated row, not a
  // translation. Names are sometimes the same everywhere (`Glob`, `Bash`), so
  // only the description is compared.
  const untranslated: string[] = [];
  for (const [locale, entries] of dictionaries) {
    for (const id of drawn) {
      const label = `settings.omp.items.${id}.label`;
      const description = `settings.omp.items.${id}.description`;
      if (!entries.has(label)) missing.push(`${locale}: ${label}`);
      if (!entries.has(description)) missing.push(`${locale}: ${description}`);
      if (locale !== 'en' && entries.has(description) && entries.get(description) === english.get(description)) {
        untranslated.push(`${locale}: ${description}`);
      }
    }
  }
  expect(missing).toEqual([]);
  expect(untranslated).toEqual([]);
});

test('every page and engine option has a label and, where OMP describes it, a description in all fifteen locales', () => {
  // Enum chips and option selects on both Concept pages (`page`) and the OMP
  // page (`engine`) render OMP's raw English option label and description when
  // the slug key is missing, so a zh-CN user reads `prose-only`, `Prompt`, or
  // `Legacy reserve-based threshold`. Every value a page or engine control
  // offers needs copy in all fifteen locales, and an option OMP describes needs
  // its helper line translated too. The values come from OMP's own descriptors,
  // not a hand list. The slug rule mirrors `optionSlug` in
  // `packages/ui/src/components/sections/shared/ompRowHelpers.ts`, which this
  // package cannot import.
  const dictionaries = readDictionaries();
  const english = dictionaries.get('en')!;
  const byId = new Map(orderedSettings().map((setting) => [setting.id, setting]));
  // Keyed by i18n key so one missing option lists the locales still to write
  // instead of one line per locale.
  const missing = new Map<string, string[]>();
  const untranslated = new Map<string, string[]>();
  for (const [locale, entries] of dictionaries) {
    for (const id of OMP_SETTING_EXPOSED_IDS) {
      const placement = OMP_SETTING_PLACEMENTS[id];
      if (!placement || (placement.type !== 'engine' && placement.type !== 'page')) continue;
      const setting = byId.get(id);
      if (!setting) continue;
      const declared = setting.ui?.options;
      if (setting.type !== 'enum' && !Array.isArray(declared)) continue;
      const options: readonly { value: string; description?: string }[] = Array.isArray(declared)
        ? declared.map((option) => ({ value: String(option.value), description: option.description }))
        : (setting.enumValues ?? []).map((value) => ({ value: String(value) }));
      for (const option of options) {
        const value = String(option.value).trim();
        if (id === 'edit.mode' && value === 'magic') continue;
        // A number row's `default` sentinel uses the shared Default label,
        // unless OMP attaches an option description rendered under the label;
        // keeping both keys preserves the label+description key pairing.
        // `-1` means unlimited (or provider default) and reads as its own choice.
        if (setting.type === 'number' && value === 'default' && option.description === undefined) continue;
        const slug = setting.type === 'number' && value === '-1'
          ? 'unlimited'
          : value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const keys = [`settings.omp.items.${id}.options.${slug}`];
        if (option.description !== undefined) keys.push(`${keys[0]}.description`);
        for (const key of keys) {
          if (!entries.has(key)) {
            missing.set(key, [...(missing.get(key) ?? []), locale]);
            continue;
          }
          if (key.endsWith('.description') && locale !== 'en' && entries.get(key) === english.get(key)) {
            untranslated.set(key, [...(untranslated.get(key) ?? []), locale]);
          }
        }
      }
    }
  }
  const format = (found: Map<string, string[]>) =>
    [...found].map(([key, locales]) => `${key} :: ${locales.join(', ')}`);
  expect(format(missing)).toEqual([]);
  expect(format(untranslated)).toEqual([]);
});

test('every owned-by owner is an anchor a control emits', () => {
  // `owned-by` says a control writes this key instead of a generic row, so the
  // named anchor has to exist: otherwise search lands on the page and finds
  // nothing, and the setting is unowned in fact while looking owned in the
  // table. The anchors are read from the UI sources, not listed here.
  const sources = walk(String(new URL('../../../ui/src/components/sections', import.meta.url).pathname))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
  const missing = OMP_SETTING_OWNER_IDS.filter((owner) => !sources.includes(`settingsItem="${owner}"`));
  expect(missing).toEqual([]);
});

test('every page or engine placement can actually draw a control', () => {
  // The Audit reads placement type alone to decide whether the route exposes a
  // row, because it cannot see OMP's descriptors. That is only sound while a
  // value the generic row cannot draw is never placed on a page or `engine`.
  const byId = new Map(orderedSettings().map((setting) => [setting.id, setting]));
  const undrawable: string[] = [];
  for (const [id, placement] of Object.entries(OMP_SETTING_PLACEMENTS)) {
    if (placement.type !== 'page' && placement.type !== 'engine') continue;
    const setting = byId.get(id);
    if (!setting) continue; // a synthetic id the route resolves from OMP's own registry
    const type = setting.type;
    const choices = setting.ui?.options ?? setting.enumValues ?? [];
    const drawable = type === 'boolean' || type === 'number' || type === 'string' || choices.length > 0;
    if (!drawable) undrawable.push(`${id} (${type}) → ${placement.type}`);
  }
  expect(undrawable).toEqual([]);
});

/**
 * The page sections the UI draws, read from the components themselves: a page
 * section is rendered by `getSectionRows('<section>')` or
 * `getSectionSettings('<section>')`.
 *
 * A page's owner either takes the shared `useOmpPageSettings('<page>')` hook or
 * filters the snapshot itself, as `DefaultsSettings` does with its own state
 * and `placement.page === 'sessions'`. Both shapes are the page's own; gating
 * on the hook alone skipped every Sessions section. Returns `undefined` when no
 * component claims the page or claims it without pulling a section, so the
 * caller can fail closed rather than read silence as "all drawn".
 */
function renderedSections(page: string): ReadonlySet<string> | undefined {
  const root = new URL('../../../ui/src/components/sections', import.meta.url);
  const files = walk(String(root.pathname));
  const sections = new Set<string>();
  const ownPage = new RegExp(`placement\\??\\.page === '${page}'`);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes(`useOmpPageSettings('${page}')`) && !ownPage.test(source)) continue;
    for (const match of source.matchAll(/getSectionRows\('([^']+)'\)/g)) sections.add(match[1]);
    for (const match of source.matchAll(/getSectionSettings\('([^']+)'\)/g)) sections.add(match[1]);
  }
  return sections.size > 0 ? sections : undefined;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry) ? [full] : [];
  });
}
