import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import type { Spy } from 'bun:test';
import type { Root } from 'react-dom/client';
import type { CanonicalClient } from '@/api/canonicalClient';
import { Window } from 'happy-dom';
import type { OmpSetting, OmpSettingsState } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/repo' }));
const revealPath = mock(async () => ({ success: true }));
mock.module('@/hooks/useRuntimeAPIs', () => ({
  useRuntimeAPIs: () => ({ files: { revealPath } }),
}));

// React DOM must initialize after happy-dom is installed; a static import would evaluate before this setup.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const { CanonicalApiError, canonicalClient } = await import('@/api/canonicalClient');
const { OmpSettingsPage } = await import('./OmpSettingsPage');
const { useOmpSettingsTabStore } = await import('./ompSettingsLayout');
const { ompSettingsI18n } = await import('@/lib/i18n/messages/omp-settings.i18n');

const CONFIG_PATH = '/home/user/.omp/agent/config.yml';
const en = ompSettingsI18n.en;

/** One row per placement, so the page's filtering is observable. */
const setting = (row: Pick<OmpSetting, 'id' | 'type'> & Partial<OmpSetting>): OmpSetting => ({
  value: null,
  default: null,
  configured: false,
  placement: { type: 'engine' },
  ...row,
});

const state: OmpSettingsState = {
  workspaceId: 'workspace_1',
  revision: '7',
  configPath: CONFIG_PATH,
  totalCount: 40,
  settings: [
    // Common tab: a switch, a three-choice enum and a numeric picker.
    setting({ id: 'bash.enabled', type: 'boolean', value: true, label: 'Bash', group: 'Bash', tab: 'shell' }),
    setting({
      id: 'features.unexpectedStopDetection', type: 'enum', value: 'mechanical',
      label: 'Unexpected Stops', group: 'Agent', tab: 'interaction',
      enumValues: ['off', 'mechanical', 'smart'],
    }),
    setting({
      id: 'task.maxConcurrency', type: 'number', value: 32, label: 'Max Concurrent Tasks', group: 'Subagents',
      options: [
        { value: 'default', label: 'Default' },
        { value: '8', label: '8' },
        { value: '32', label: '32' },
      ],
    }),
    // The auto thinking ceiling is gated by OMP's own condition.
    setting({
      id: 'providers.autoThinkingMaxEffort', type: 'enum', value: 'xhigh',
      condition: 'autoThinkingActive', conditionActive: false,
      label: 'Auto Thinking Ceiling', group: 'Thinking', tab: 'model',
      enumValues: ['xhigh', 'max'],
    }),
    // Editing tab: reading rows plus the five settings the preset owns.
    setting({ id: 'readLineNumbers', type: 'boolean', value: true, label: 'Line Numbers', group: 'Reading' }),
    setting({
      id: 'read.defaultLimit', type: 'number', value: -1, default: -1, label: 'Default Read Limit', group: 'Reading',
      options: [
        { value: 'default', label: 'Default' },
        { value: '200', label: '200' },
        { value: '500', label: '500' },
      ],
    }),
    setting({ id: 'read.summarize.enabled', type: 'boolean', value: true, label: 'Read Summaries' }),
    setting({ id: 'read.summarize.prose', type: 'boolean', value: true, label: 'Prose Summaries' }),
    setting({ id: 'read.summarize.minTotalLines', type: 'number', value: 20, label: 'Minimum File Length' }),
    setting({ id: 'read.summarize.minBodyLines', type: 'number', value: 4, label: 'Body Lines' }),
    setting({ id: 'read.summarize.minCommentLines', type: 'number', value: 6, label: 'Comment Lines' }),
    setting({ id: 'read.summarize.unfoldUntil', type: 'number', value: 50, label: 'Unfold Target' }),
    setting({ id: 'read.summarize.unfoldLimit', type: 'number', value: 100, label: 'Unfold Ceiling' }),
    setting({ id: 'lsp.enabled', type: 'boolean', value: true, label: 'LSP', group: 'LSP', tab: 'lsp' }),
    // Execution tab.
    setting({ id: 'mcp.startupTimeoutMs', type: 'number', value: 250, label: 'MCP Startup Window', group: 'Discovery & MCP' }),
    setting({
      id: 'tools.artifactSpillThreshold', type: 'number', value: 50, label: 'Artifact Spill Threshold', group: 'Output Limits',
      options: [
        { value: 'default', label: 'Default' },
        { value: '50', label: '50 KB' },
      ],
    }),
    // Advanced tab.
    setting({ id: 'tools.format', type: 'enum', value: 'auto', label: 'Tool Calling Mode', group: 'Experimental', enumValues: ['auto', 'native'] }),
    // Reset-credit rules live on the OMP page's resets section, drawn as two collapsed provider disclosures.
    setting({
      id: 'codexResets.autoRedeem5h', type: 'enum', value: 'yes',
      placement: { type: 'page', page: 'omp', section: 'resets' },
      enumValues: ['unset', 'yes', 'no'],
    }),
    setting({
      id: 'codexResets.autoRedeemWeekly', type: 'enum', value: 'no',
      placement: { type: 'page', page: 'omp', section: 'resets' },
      enumValues: ['unset', 'yes', 'no'],
    }),
    setting({
      id: 'codexResets.minBlockedMinutes', type: 'number', value: 45,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    setting({
      id: 'codexResets.keepCredits', type: 'number', value: 2,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    setting({
      id: 'codexResets.salvageHorizonHours', type: 'number', value: 8,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    setting({
      id: 'claudeResets.autoRedeem5h', type: 'enum', value: 'unset',
      placement: { type: 'page', page: 'omp', section: 'resets' },
      enumValues: ['unset', 'yes', 'no'],
    }),
    setting({
      id: 'claudeResets.autoRedeemWeekly', type: 'enum', value: 'unset',
      placement: { type: 'page', page: 'omp', section: 'resets' },
      enumValues: ['unset', 'yes', 'no'],
    }),
    setting({
      id: 'claudeResets.autoRedeemFable', type: 'enum', value: 'unset',
      placement: { type: 'page', page: 'omp', section: 'resets' },
      enumValues: ['unset', 'yes', 'no'],
    }),
    setting({
      id: 'claudeResets.minBlockedMinutes', type: 'number', value: 60,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    setting({
      id: 'claudeResets.keepCredits', type: 'number', value: 0,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    setting({
      id: 'claudeResets.salvageHorizonHours', type: 'number', value: 12,
      placement: { type: 'page', page: 'omp', section: 'resets' },
    }),
    // Two short, unexplained choices stay chips; a longer or explained list is a select.
    setting({ id: 'ttsr.contextMode', type: 'enum', value: 'keep', label: 'TTSR Context Mode', group: 'Rules (TTSR)', enumValues: ['discard', 'keep'] }),
    // Terminal presentation, page rows, owned-by rows and egress rows are never drawn.
    setting({ id: 'tui.maxFps', type: 'number', value: 30, placement: { type: 'tui-only' }, label: 'Max FPS' }),
    setting({ id: 'cycleOrder', type: 'array', value: ['smol', 'default'], placement: { type: 'tui-only' } }),
    setting({ id: 'tools.artifactTailLines', type: 'number', value: 1000, placement: { type: 'page', page: 'tools', section: 'limits' } }),
    setting({ id: 'recap.enabled', type: 'boolean', value: true, placement: { type: 'page', page: 'chat', section: 'recap' } }),
    setting({ id: 'enabledModels', type: 'array', value: [], placement: { type: 'owned-by', owner: 'providers.models' } }),
    setting({
      id: 'modelRoles', type: 'record', value: { vision: 'anthropic/claude-3-7-sonnet:high' },
      label: 'Model Roles', placement: { type: 'owned-by', owner: 'omp.modelRoles' },
    }),
    setting({ id: 'dev.autoqa', type: 'boolean', value: false, placement: { type: 'boundary' }, label: 'Auto QA' }),
  ],
};

let resolveWorkspace: Spy<CanonicalClient['resolveWorkspace']>;
let getSettings: Spy<CanonicalClient['getOmpSettings']>;
let updateSettings: Spy<CanonicalClient['updateOmpSettings']>;
let container: HTMLDivElement;
let root: Root;

const settle = async () => {
  await act(async () => {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 0);
    await promise;
  });
};

const render = async () => {
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();
};

const row = (id: string) => container.querySelector(`[data-settings-item="omp.${id}"]`);

const TABS = ['common', 'editing', 'execution', 'advanced'] as const;

/** Click a tab by position, so a test never depends on finished copy. */
const switchTab = async (name: typeof TABS[number]) => {
  const button = container.querySelectorAll('[role="tab"]')[TABS.indexOf(name)];
  if (!(button instanceof HTMLElement)) throw new Error(`tab ${name} missing`);
  await act(async () => { button.click(); });
  await settle();
  expect(useOmpSettingsTabStore.getState().tab).toBe(name);
};

beforeEach(async () => {
  useOmpSettingsTabStore.setState({ tab: 'common' });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'repo' });
  getSettings = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(state);
  updateSettings = spyOn(canonicalClient, 'updateOmpSettings').mockImplementation(async (_workspaceId, request) => ({
    ...state,
    revision: String(Number(request.expectedRevision) + 1),
    settings: state.settings.map(entry => {
      const change = request.changes.find(candidate => candidate.id === entry.id);
      return change ? { ...entry, value: change.value } : entry;
    }),
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  resolveWorkspace.mockRestore();
  getSettings.mockRestore();
  updateSettings.mockRestore();
  container.remove();
  browser.close();
});

test('renders only the layout rows of the active tab and saves a changed value with the captured revision', async () => {
  await render();

  const enabledRow = row('bash.enabled');
  expect(enabledRow?.textContent).toContain('Bash');
  // Common is the default tab: an editing row is not in the document yet.
  expect(row('lsp.enabled')).toBeNull();

  if (!(enabledRow instanceof HTMLElement)) throw new Error('settings row missing');
  await act(async () => { enabledRow.click(); });
  await settle();
  expect(updateSettings).toHaveBeenCalledWith('workspace_1', {
    expectedRevision: '7',
    changes: [{ id: 'bash.enabled', value: false }],
  });
});

test('switching tabs shows the rows of that tab and remembers the last tab', async () => {
  await render();
  expect(row('lsp.enabled')).toBeNull();

  await switchTab('editing');
  expect(row('lsp.enabled')).not.toBeNull();
  expect(row('bash.enabled')).toBeNull();
  expect(useOmpSettingsTabStore.getState().tab).toBe('editing');

  await switchTab('execution');
  expect(row('mcp.startupTimeoutMs')).not.toBeNull();
  expect(row('lsp.enabled')).toBeNull();

  await switchTab('advanced');
  expect(row('tools.format')).not.toBeNull();
});

test('renders a number setting with a default option as a select showing Default for -1 and 默认 in zh-CN', async () => {
  await render();
  await switchTab('editing');

  const select = row('read.defaultLimit');
  expect(select).not.toBeNull();
  expect(select?.textContent).toContain('Default');

  await act(async () => {
    useI18nStore.getState().setLocale('zh-CN');
  });
  while (useI18nStore.getState().loadingLocale) {
    await settle();
  }
  try {
    await render();
    await switchTab('editing');
    const selectZh = row('read.defaultLimit');
    expect(selectZh?.textContent).toContain(ompSettingsI18n['zh-CN']['settings.omp.value.default']);
  } finally {
    await act(async () => {
      useI18nStore.getState().setLocale('en');
    });
    while (useI18nStore.getState().loadingLocale) {
      await settle();
    }
  }
});

test('hides the auto thinking ceiling while its condition is off and shows it when it holds', async () => {
  const withCondition = (conditionActive: boolean) => ({
    ...state,
    settings: state.settings.map((entry) => (
      entry.id === 'providers.autoThinkingMaxEffort' ? { ...entry, conditionActive } : entry
    )),
  });

  getSettings.mockResolvedValueOnce(withCondition(false));
  await render();
  expect(row('providers.autoThinkingMaxEffort')).toBeNull();

  // The snapshot is fetched on mount, so a new read needs a new mount.
  await act(async () => root.unmount());
  getSettings.mockResolvedValueOnce(withCondition(true));
  root = createRoot(container);
  await render();
  expect(row('providers.autoThinkingMaxEffort')).not.toBeNull();
});

test('leaves terminal-only, page and duplicate settings off every tab', async () => {
  await render();
  for (const tabName of TABS) {
    await switchTab(tabName);
    for (const id of ['tui.maxFps', 'cycleOrder', 'tools.artifactTailLines', 'enabledModels', 'recap.enabled', 'dev.autoqa']) {
      expect(`${tabName} ${id}: ${row(id) === null}`).toBe(`${tabName} ${id}: true`);
    }
  }
});

test('the config file footer renders only the heading and open button without audit paragraphs or file path', async () => {
  await render();
  for (const tabName of ['common', 'editing', 'execution'] as const) {
    await switchTab(tabName);
    expect(container.querySelector('[data-settings-item="omp.configFile"]')).toBeNull();
  }
  await switchTab('advanced');

  const footer = container.querySelector('[data-settings-item="omp.configFile"]');
  expect(footer).not.toBeNull();
  expect(footer?.textContent).toContain(en['settings.omp.configFile.title']);
  expect(footer?.textContent).toContain(en['settings.omp.openConfig']);
  expect(container.textContent).not.toContain(CONFIG_PATH);
  expect(footer?.querySelectorAll('p').length).toBe(0);

  const openConfig = Array.from(footer?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(en['settings.omp.openConfig']),
  );
  if (!openConfig) throw new Error('open config button missing');
  revealPath.mockClear();
  await act(async () => { openConfig.click(); });
  expect(revealPath).toHaveBeenCalledWith(CONFIG_PATH);
});

test('omits the open config button when no config path is reported', async () => {
  getSettings.mockResolvedValueOnce({ ...state, configPath: undefined });
  await render();
  await switchTab('advanced');

  const footer = container.querySelector('[data-settings-item="omp.configFile"]');
  expect(footer).not.toBeNull();
  expect(footer?.textContent).toContain(en['settings.omp.configFile.title']);
  expect(footer?.querySelectorAll('p').length).toBe(0);
  expect(footer?.querySelectorAll('button').length).toBe(0);
});

test('applying the read-summary preset sends one update carrying every changed key', async () => {
  await render();
  await switchTab('editing');

  const presetRow = row('read.summarize.enabled');
  expect(presetRow?.textContent).toContain(en['settings.omp.preset.readSummary.options.balanced']);
  const trigger = presetRow?.querySelector<HTMLElement>('[role="combobox"]');
  if (!trigger) throw new Error('preset trigger missing');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
  const aggressive = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
    .find((option) => option.textContent === en['settings.omp.preset.readSummary.options.aggressive']);
  if (!aggressive) throw new Error('aggressive option missing');
  await act(async () => { aggressive.click(); });
  await settle();

  expect(updateSettings).toHaveBeenCalledTimes(1);
  const [, request] = updateSettings.mock.calls[0];
  expect(request.expectedRevision).toBe('7');
  expect([...request.changes].sort((left, right) => left.id.localeCompare(right.id))).toEqual([
    { id: 'read.summarize.minBodyLines', value: 3 },
    { id: 'read.summarize.minCommentLines', value: 4 },
    { id: 'read.summarize.unfoldLimit', value: 60 },
    { id: 'read.summarize.unfoldUntil', value: 30 },
  ]);
});

test('keeps the read-summary switch editable when a preset threshold is missing', async () => {
  // The preset maps five settings to one choice; a snapshot that omits any of
  // the four thresholds cannot describe the tuple, so the switch stays a plain
  // checkbox rather than disappearing with the picker.
  getSettings.mockResolvedValueOnce({
    ...state,
    settings: state.settings.filter((entry) => entry.id !== 'read.summarize.unfoldLimit'),
  });
  await render();
  await switchTab('editing');

  const target = row('read.summarize.enabled');
  expect(target).not.toBeNull();
  expect(target?.querySelector('[role="combobox"]')).toBeNull();
  if (!(target instanceof HTMLElement)) throw new Error('read-summary row missing');
  await act(async () => { target.click(); });
  await settle();
  expect(updateSettings).toHaveBeenLastCalledWith('workspace_1', {
    expectedRevision: '7',
    changes: [{ id: 'read.summarize.enabled', value: false }],
  });
});

test('model roles live on concept-owning pages and stay off the OMP page', async () => {
  await render();
  for (const role of ['default', 'smol', 'slow', 'commit', 'vision', 'image', 'memory', 'task', 'advisor']) {
    expect(`${role}: ${container.querySelector(`[data-settings-item="omp.modelRoles.${role}"]`) === null}`).toBe(`${role}: true`);
  }
});

test('shows a retry path when the settings read fails', async () => {
  getSettings.mockRejectedValue(new Error('offline'));
  await render();
  expect(container.textContent).toContain(en['settings.omp.loadFailed']);
  expect(container.textContent).toContain(en['settings.omp.retry']);
});

test('retries once at the refreshed revision when another mutation wins', async () => {
  await render();
  getSettings.mockResolvedValueOnce({ ...state, revision: '8' });
  updateSettings.mockRejectedValueOnce(new CanonicalApiError({
    type: 'urn:ohpichamber:problem:CATALOG_CONFLICT', title: 'Request refused', status: 409,
    code: 'CATALOG_CONFLICT', detail: 'stale revision', retryable: false,
  }));
  const target = row('bash.enabled');
  if (!(target instanceof HTMLElement)) throw new Error('settings row missing');
  await act(async () => { target.click(); });
  await settle();
  expect(updateSettings).toHaveBeenCalledTimes(2);
  expect(updateSettings).toHaveBeenLastCalledWith('workspace_1', {
    expectedRevision: '8',
    changes: [{ id: 'bash.enabled', value: false }],
  });
});

test('shows a short enum as chips and never a raw control', async () => {
  await render();
  await switchTab('advanced');

  const target = row('ttsr.contextMode');
  expect(target).not.toBeNull();
  const chips = target?.querySelector('[role="group"]');
  expect(chips).not.toBeNull();
  const buttons = chips?.querySelectorAll('button');
  expect(buttons?.length).toBe(2);
  expect(Array.from(buttons ?? []).some(button => button.getAttribute('aria-pressed') === 'true')).toBe(true);
});

test('renders every drawn row and heading translated in zh-CN with no raw setting id on screen', async () => {
  await act(async () => {
    useI18nStore.getState().setLocale('zh-CN');
  });
  while (useI18nStore.getState().loadingLocale) {
    await settle();
  }
  try {
    await render();
    const dictionary = useI18nStore.getState().dictionary;
    expect(container.textContent).toContain(dictionary['settings.omp.items.bash.enabled.label']);

    // A section heading is addressed by key like every row, so a heading the
    // vocabulary forgot would render as `settings.omp.group.<id>`.
    for (const tabName of TABS) {
      await switchTab(tabName);
      expect(container.textContent).not.toContain('settings.omp.group.');
      expect(container.textContent).not.toContain('settings.omp.tab.');
    }
    expect(container.textContent).toContain(dictionary['settings.omp.configFile.title']);
    expect(container.textContent).toContain(dictionary['settings.omp.openConfig']);
    expect(container.textContent).not.toContain(CONFIG_PATH);
    // Every heading comes from the locale, never from OMP's own group name: a
    // group the vocabulary missed would show its raw English name here.
    for (const rawGroup of ['Compaction', 'Subagents', 'Commands & Skills', 'Discovery & MCP', 'Modes', 'Retry & Fallback']) {
      expect(`${rawGroup}: ${(container.textContent ?? '').includes(rawGroup)}`).toBe(`${rawGroup}: false`);
    }
    // No raw `setting.id` leaks: the ids are snake/dot vocabulary, never prose.
    for (const raw of ['bash.enabled', 'read.defaultLimit', 'features.unexpectedStopDetection', 'modelRoles']) {
      expect(`${raw}: ${(container.textContent ?? '').includes(raw)}`).toBe(`${raw}: false`);
    }
  } finally {
    await act(async () => {
      useI18nStore.getState().setLocale('en');
    });
    while (useI18nStore.getState().loadingLocale) {
      await settle();
    }
  }
});

test('reset credit disclosures render collapsed on the advanced tab, expand, and save through updateOmpSettings', async () => {
  await render();
  // Reset rows stay off the non-advanced tabs.
  for (const tabName of ['common', 'editing', 'execution'] as const) {
    await switchTab(tabName);
    expect(container.querySelector('[data-settings-item="omp.codexResets.autoRedeem5h"]')).toBeNull();
  }
  await switchTab('advanced');

  const triggers = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
  const codexTrigger = triggers.find((button) => button.textContent?.includes('Codex'));
  const claudeTrigger = triggers.find((button) => button.textContent?.includes('Claude'));
  if (!codexTrigger || !claudeTrigger) throw new Error('reset disclosures missing on the advanced tab');
  // Both providers start collapsed: no reset rows in the DOM.
  expect(codexTrigger.getAttribute('aria-expanded')).toBe('false');
  expect(claudeTrigger.getAttribute('aria-expanded')).toBe('false');
  expect(container.querySelector('[data-settings-item="omp.codexResets.autoRedeem5h"]')).toBeNull();
  expect(container.querySelector('[data-settings-item="omp.claudeResets.autoRedeem5h"]')).toBeNull();

  // Expand Codex: its auto-redeem and threshold rows appear in order.
  await act(async () => { codexTrigger.click(); });
  await settle();
  expect(codexTrigger.getAttribute('aria-expanded')).toBe('true');
  const codexRowIds = Array.from(container.querySelectorAll<HTMLElement>('[data-settings-item^="omp.codexResets."]'))
    .map((node) => node.getAttribute('data-settings-item'));
  expect(codexRowIds).toEqual([
    'omp.codexResets.autoRedeem5h',
    'omp.codexResets.autoRedeemWeekly',
    'omp.codexResets.minBlockedMinutes',
    'omp.codexResets.keepCredits',
    'omp.codexResets.salvageHorizonHours',
  ]);

  // An enum row with explained options renders as a select: open it and pick
  // Never, which writes through the page autosave like every other row.
  updateSettings.mockClear();
  const autoRedeemRow = row('codexResets.autoRedeem5h');
  if (!(autoRedeemRow instanceof HTMLElement)) throw new Error('autoRedeem5h row missing');
  const trigger = autoRedeemRow.querySelector<HTMLElement>('[role="combobox"]');
  if (!trigger) throw new Error('autoRedeem5h trigger missing');
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
  const neverOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
    .find((option) => option.textContent?.includes(en['settings.omp.items.codexResets.autoRedeem5h.options.no']));
  if (!neverOption) throw new Error('autoRedeem5h Never option missing');
  await act(async () => { neverOption.click(); });
  await settle();
  expect(updateSettings).toHaveBeenCalledWith('workspace_1', {
    expectedRevision: '7',
    changes: [{ id: 'codexResets.autoRedeem5h', value: 'no' }],
  });
});
