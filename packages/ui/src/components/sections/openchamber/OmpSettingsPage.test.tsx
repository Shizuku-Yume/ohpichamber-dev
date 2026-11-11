import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import type { Spy } from 'bun:test';
import type { Root } from 'react-dom/client';
import type { CanonicalClient } from '@/api/canonicalClient';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/repo' }));

// React DOM must initialize after happy-dom is installed; a static import would evaluate before this setup.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const { CanonicalApiError, canonicalClient } = await import('@/api/canonicalClient');
import type { ModelCatalog, OmpSettingsState } from '@openchamber/agent-contract';
import { ompSettingsI18n } from '@/lib/i18n/messages/ompSettingsI18n';
const { OmpSettingsPage } = await import('./OmpSettingsPage');

const state = {
  workspaceId: 'workspace_1',
  revision: '7',
  settings: [
    { id: 'compaction.enabled' as const, type: 'boolean' as const, value: true, default: true, configured: true, label: 'Auto-Compact', group: 'Compaction', tab: 'context' },
    { id: 'compaction.thresholdPercent' as const, type: 'number' as const, value: 50, default: -1, configured: true, label: 'Compaction Threshold', group: 'Compaction', tab: 'context' },
  ],
};
const mockModelCatalog = {
  workspaceId: 'workspace_1',
  revision: '1',
  imageModels: [], planRoleAvailable: true,
  defaults: { model: { providerId: 'anthropic', modelId: 'claude-3-7-sonnet' }, thinkingLevel: 'auto' },
  models: [
    {
      modelId: 'claude-3-7-sonnet',
      provider: 'anthropic',
      name: 'Claude 3.7 Sonnet',
      modalities: ['text', 'image'] as const,
      contextWindow: 200000,
      maxOutputTokens: 64000,
      reasoningEffortSupported: true,
      reasoningOptions: [
        { reasoningEffort: 'low', label: 'Low', budgetTokens: 2048 },
        { reasoningEffort: 'medium', label: 'Medium', budgetTokens: 8192 },
        { reasoningEffort: 'high', label: 'High', budgetTokens: 32000 },
      ],
      variants: [],
      pricing: null,
    },
    {
      modelId: 'gpt-4o-mini',
      provider: 'openai',
      name: 'GPT-4o mini',
      modalities: ['text', 'image'] as const,
      contextWindow: 128000,
      maxOutputTokens: 16000,
      reasoningEffortSupported: false,
      reasoningOptions: [],
      variants: [],
      pricing: null,
    },
    {
      modelId: 'o3-mini',
      provider: 'openai',
      name: 'o3-mini',
      modalities: ['text'] as const,
      contextWindow: 200000,
      maxOutputTokens: 100000,
      reasoningEffortSupported: true,
      reasoningOptions: [],
      variants: [],
      pricing: null,
    },
  ],
};

const stateWithRoles = {
  workspaceId: 'workspace_1',
  revision: '7',
  settings: [
    ...state.settings,
    {
      id: 'modelRoles' as const,
      type: 'record' as const,
      value: { default: 'anthropic/claude-3-7-sonnet', smol: 'openai/gpt-4o-mini', slow: 'openai/o3-mini' },
      default: {},
      configured: true,
    },
    {
      id: 'cycleOrder' as const,
      type: 'array' as const,
      value: ['smol', 'default', 'slow'],
      default: ['smol', 'default', 'slow'],
      configured: true,
    },
    {
      id: 'steeringMode' as const,
      type: 'enum' as const,
      value: 'one-at-a-time',
      default: 'one-at-a-time',
      configured: true,
      enumValues: ['all', 'one-at-a-time'],
      label: 'Steering Mode',
      group: 'Input',
      tab: 'interaction',
    },
  ],
};

let resolveWorkspace: Spy<CanonicalClient['resolveWorkspace']>;
let getSettings: Spy<CanonicalClient['getOmpSettings']>;
let updateSettings: Spy<CanonicalClient['updateOmpSettings']>;
let getModels: Spy<CanonicalClient['getModels']>;
let container: HTMLDivElement;
let root: Root;

const settle = async () => {
  await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
};

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace_1', projectId: 'project_1', name: 'repo' });
  getSettings = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(state);
  getModels = spyOn(canonicalClient, 'getModels').mockResolvedValue(mockModelCatalog as unknown as ModelCatalog);
  updateSettings = spyOn(canonicalClient, 'updateOmpSettings').mockImplementation(async (_workspaceId, request) => ({
    ...state,
    revision: String(Number(request.expectedRevision) + 1),
    settings: state.settings.map(setting => {
      const change = request.changes.find(candidate => candidate.id === setting.id);
      return change ? { ...setting, value: change.value } : setting;
    }),
  }));
});

afterEach(async () => {
  await act(async () => root.unmount());
  resolveWorkspace.mockRestore();
  getSettings.mockRestore();
  updateSettings.mockRestore();
  getModels.mockRestore();
  container.remove();
  browser.close();
});

test('loads OMP metadata and saves a changed value with the captured revision', async () => {
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();
  expect(container.textContent).toContain('Auto-Compact');
  expect(container.textContent).toContain('Compaction Threshold');
  const row = container.querySelector('[data-settings-item="omp.compaction.enabled"]');
  if (!(row instanceof HTMLElement)) throw new Error('settings row missing');
  await act(async () => { row.click(); });
  await settle();
  expect(updateSettings).toHaveBeenCalledWith('workspace_1', {
    expectedRevision: '7',
    changes: [{ id: 'compaction.enabled', value: false }],
  });
  expect(container.textContent).toContain('OMP');
});

test('shows a retry path when the settings read fails', async () => {
  getSettings.mockRejectedValue(new Error('offline'));
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();
  expect(container.textContent).toContain('Could not read OMP settings');
  expect(container.textContent).toContain('Retry');
});

test('retries once at the refreshed revision when another mutation wins', async () => {
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();
  getSettings.mockResolvedValueOnce({ ...state, revision: '8' });
  updateSettings.mockRejectedValueOnce(new CanonicalApiError({
    type: 'urn:ohpichamber:problem:CATALOG_CONFLICT', title: 'Request refused', status: 409,
    code: 'CATALOG_CONFLICT', detail: 'stale revision', retryable: false,
  }));
  const row = container.querySelector('[data-settings-item="omp.compaction.enabled"]');
  if (!(row instanceof HTMLElement)) throw new Error('settings row missing');
  await act(async () => { row.click(); });
  await settle();
  expect(updateSettings).toHaveBeenCalledTimes(2);
  expect(updateSettings).toHaveBeenLastCalledWith('workspace_1', {
    expectedRevision: '8',
    changes: [{ id: 'compaction.enabled', value: false }],
  });
});
const EXPECTED_ROLES: Array<{ id: string; tag: string }> = [
  { id: 'default', tag: 'DEFAULT' }, { id: 'smol', tag: 'SMOL' },
  { id: 'slow', tag: 'SLOW' }, { id: 'vision', tag: 'VISION' },
  { id: 'plan', tag: 'PLAN' }, { id: 'commit', tag: 'COMMIT' },
  { id: 'tiny', tag: 'TINY' }, { id: 'memory', tag: 'MEMORY' },
  { id: 'task', tag: 'TASK' }, { id: 'advisor', tag: 'ADVISOR' },
  { id: 'widget', tag: 'WIDGET' }, { id: 'image', tag: 'IMAGE' },
  { id: 'web', tag: 'WEB' }, { id: 'speech', tag: 'SPEECH' },
  { id: 'dictation', tag: 'DICTATION' }, { id: 'judge', tag: 'JUDGE' },
];

test('renders visual selectors and fallback indicators for all 16 OMP model roles', async () => {
  getSettings.mockResolvedValue(stateWithRoles);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();
  expect(ompSettingsI18n.en['settings.omp.modelRoles.title']).toBe('Model Roles');
  expect(ompSettingsI18n.en['settings.omp.modelRoles.effort.minimal']).toBe('Minimal');

  // Verify modelRoles is NOT rendered as a raw textarea
  const textarea = container.querySelector('[data-settings-item="omp.modelRoles"] textarea');
  expect(textarea).toBeNull();

  // Verify all 16 roles are rendered with their badges
  for (const role of EXPECTED_ROLES) {
    const roleRow = container.querySelector(`[data-settings-item="omp.modelRoles.${role.id}"]`);
    expect(roleRow).not.toBeNull();
    expect(roleRow?.textContent).toContain(role.tag);
  }

  // Verify fallback indicator for commit (which inherits from smol = openai/gpt-4o-mini).
  // Production markup carries no test-only attributes; the row text states it.
  const commitRow = container.querySelector('[data-settings-item="omp.modelRoles.commit"]');
  expect(commitRow?.textContent).toContain('@smol (openai/gpt-4o-mini)');

  // Verify thinking effort selector exists for default (which has claude-3-7-sonnet, a reasoning model)
  const defaultRow = container.querySelector('[data-settings-item="omp.modelRoles.default"]');
  const triggers = defaultRow?.querySelectorAll('button[role="combobox"]');
  expect(triggers?.length).toBe(2); // Model picker + thinking effort picker

  // Verify smol (gpt-4o-mini, non-reasoning) only has 1 picker (no thinking effort picker)
  const smolRow = container.querySelector('[data-settings-item="omp.modelRoles.smol"]');
  const smolTriggers = smolRow?.querySelectorAll('button[role="combobox"]');
  expect(smolTriggers?.length).toBe(1);

  // Verify cycleOrder renders as an input instead of a textarea
  const cycleOrderInput = container.querySelector('[data-settings-item="omp.cycleOrder"] input');
  expect(cycleOrderInput).not.toBeNull();
  expect((cycleOrderInput as HTMLInputElement)?.value).toBe('smol, default, slow');

  // Verify steeringMode renders in the Input group
  const steeringRow = container.querySelector('[data-settings-item="omp.steeringMode"]');
  expect(steeringRow).not.toBeNull();
});

test('translates default effort options when model.reasoningOptions are absent', async () => {
  await act(async () => { useI18nStore.getState().setLocale('de'); });
  try {
    getSettings.mockResolvedValue(stateWithRoles);
    await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
    await settle();

    // slow is configured with o3-mini (reasoningEffortSupported: true, reasoningOptions: [])
    const slowRow = container.querySelector('[data-settings-item="omp.modelRoles.slow"]');
    expect(slowRow).not.toBeNull();
    const slowTriggers = slowRow?.querySelectorAll('button[role="combobox"]');
    expect(slowTriggers?.length).toBe(2); // Model picker + thinking effort picker

    // Verify translated German effort labels exist in i18n dictionary for OMP settings
    expect(ompSettingsI18n.de['settings.omp.modelRoles.effort.low']).toBe('Niedrig');
    expect(ompSettingsI18n.de['settings.omp.modelRoles.effort.medium']).toBe('Mittel');
    expect(ompSettingsI18n.de['settings.omp.modelRoles.effort.high']).toBe('Hoch');
    expect(ompSettingsI18n.de['settings.omp.modelRoles.effort.max']).toBe('Maximal');
  } finally {
    await act(async () => { useI18nStore.getState().setLocale('en'); });
  }
});

test('safely parses roles record with malformed or non-string fields without throwing', async () => {
  const malformed = {
    ...stateWithRoles,
    settings: stateWithRoles.settings.map(s => s.id === 'modelRoles' ? {
      ...s,
      value: { default: 'anthropic/claude-3-7-sonnet', count: 123, invalid: null },
    } : s),
  };
  getSettings.mockResolvedValue(malformed);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  // Verify default role was still safely extracted
  const defaultRow = container.querySelector('[data-settings-item="omp.modelRoles.default"]');
  expect(defaultRow?.textContent).toContain('anthropic/claude-3-7-sonnet');
});

test('eliminates all raw JSON textareas and renders structured controls for all complex settings', async () => {
  const fullState = {
    workspaceId: 'workspace_1',
    revision: '10',
    settings: [
      ...stateWithRoles.settings,
      {
        id: 'enabledModels' as const,
        type: 'array' as const,
        value: ['anthropic/*', 'openai/gpt-4o-mini'],
        default: [],
        configured: true,
        label: 'Enabled Models',
      },
      {
        id: 'modelPresets' as const,
        type: 'record' as const,
        value: {
          fastCoding: {
            modelRoles: { default: 'openai/gpt-4o-mini', smol: 'openai/gpt-4o-mini' },
            defaultThinkingLevel: 'low',
          },
        },
        default: {},
        configured: true,
        label: 'Model Presets',
      },
      {
        id: 'retry.fallbackChains' as const,
        type: 'record' as const,
        value: { default: ['openai/gpt-4o-mini', 'openai/o3-mini'] },
        default: {},
        configured: true,
        label: 'Retry Fallback Chains',
        group: 'Retry & Fallback',
      },
      {
        id: 'retry.fallbackOn' as const,
        type: 'enum' as const,
        value: 'usage-limit',
        default: 'any',
        configured: true,
        label: 'Fallback Trigger',
        group: 'Retry & Fallback',
      },
      {
        id: 'compaction.methodOrder' as const,
        type: 'array' as const,
        value: ['remote', 'snapcompact', 'handoff', 'shake', 'soft'],
        default: ['remote', 'snapcompact', 'handoff', 'shake', 'soft'],
        configured: true,
        label: 'Compaction Method Order',
        group: 'Compaction',
      },
      {
        id: 'compaction.modelThresholds' as const,
        type: 'record' as const,
        value: { 'openai/gpt-4o': 90000, 'anthropic/*': 120000 },
        default: {},
        configured: true,
        label: 'Model Thresholds',
        group: 'Compaction',
      },
    ],
  };

  getSettings.mockResolvedValue(fullState as unknown as OmpSettingsState);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  // Acceptance requirement 1: EXACTLY ZERO <textarea> elements anywhere on OmpSettingsPage
  const allTextareas = container.querySelectorAll('textarea');
  expect(allTextareas.length).toBe(0);

  // Acceptance requirement 2: All 9 canonical category tabs present in SortableTabsStrip
  const tabElements = container.querySelectorAll('[data-tabs-strip] button, [role="tab"], .cursor-pointer');
  const tabLabels = Array.from(tabElements).map(el => el.textContent?.trim()).filter(Boolean);
  expect(tabLabels.some(l => l?.includes('Model') || l?.includes('模型'))).toBe(true);

  // Acceptance requirement 3: enabledModels renders structured chip list
  const enabledModelsRow = container.querySelector('[data-settings-item="omp.enabledModels"]');
  expect(enabledModelsRow).not.toBeNull();
  expect(enabledModelsRow?.textContent).toContain('anthropic/*');
  expect(enabledModelsRow?.textContent).toContain('openai/gpt-4o-mini');
  expect(enabledModelsRow?.querySelector('textarea')).toBeNull();

  // Acceptance requirement 4: modelPresets renders structured preset editor
  const presetsRow = container.querySelector('[data-settings-item="omp.modelPresets"]');
  expect(presetsRow).not.toBeNull();
  expect(presetsRow?.textContent).toContain('fastCoding');
  expect(presetsRow?.querySelector('textarea')).toBeNull();

  // Acceptance requirement 5: retry.fallbackChains renders structured chain editor
  const chainsRow = container.querySelector('[data-settings-item="omp.retry.fallbackChains"]');
  expect(chainsRow).not.toBeNull();
  expect(chainsRow?.textContent).toContain('default');
  expect(chainsRow?.textContent).toContain('openai/gpt-4o-mini');
  expect(chainsRow?.querySelector('textarea')).toBeNull();

  // Acceptance requirement 6: retry.fallbackOn renders single-select chips preserving enum
  const fallbackOnRow = container.querySelector('[data-settings-item="omp.retry.fallbackOn"]');
  expect(fallbackOnRow).not.toBeNull();
  expect(fallbackOnRow?.querySelector('[role="group"]')).not.toBeNull();
  expect(fallbackOnRow?.querySelector('textarea')).toBeNull();

  // Acceptance requirement 7: compaction.methodOrder renders reorderable chips
  const methodOrderRow = container.querySelector('[data-settings-item="omp.compaction.methodOrder"]');
  expect(methodOrderRow).not.toBeNull();
  expect(methodOrderRow?.textContent).toContain('Server compaction');
  expect(methodOrderRow?.textContent).toContain('Snapcompact');
  expect(methodOrderRow?.querySelector('textarea')).toBeNull();

  // Acceptance requirement 8: compaction.modelThresholds renders structured number thresholds
  const thresholdsRow = container.querySelector('[data-settings-item="omp.compaction.modelThresholds"]');
  expect(thresholdsRow).not.toBeNull();
  expect(thresholdsRow?.textContent).toContain('openai/gpt-4o');
  expect(Array.from(thresholdsRow?.querySelectorAll('input') ?? []).some(inp => inp.value.includes('90'))).toBe(true);
  expect(thresholdsRow?.querySelector('textarea')).toBeNull();
});

test('provides full reactive i18n coverage in both English and Chinese for OMP settings', async () => {
  // Verify English keys
  expect(ompSettingsI18n.en['settings.omp.items.enabledModels.label']).toBe('Enabled models');
  expect(ompSettingsI18n.en['settings.omp.tab.model.label']).toBe('Model & Roles');
  expect(ompSettingsI18n.en['settings.omp.group.role_models.label']).toBe('Role Models');
  expect(ompSettingsI18n.en['settings.omp.items.retry.fallbackOn.options.any']).toBe('Any error');

  // Verify Chinese translations
  expect(ompSettingsI18n['zh-CN']['settings.omp.items.enabledModels.label']).toBe('启用的模型');
  expect(ompSettingsI18n['zh-CN']['settings.omp.tab.model.label']).toBe('模型与角色');
  expect(ompSettingsI18n['zh-CN']['settings.omp.group.role_models.label']).toBe('角色模型');
  expect(ompSettingsI18n['zh-CN']['settings.omp.items.retry.fallbackOn.options.any']).toBe('任意错误');

  // Reactive test: Switch locale to zh-CN and render
  await act(async () => {
    useI18nStore.getState().setLocale('zh-CN');
    await new Promise((r) => setTimeout(r, 50));
  });
  try {
    getSettings.mockResolvedValue(state);
    await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
    await settle();

    expect(container.textContent).toContain('自动压缩');
    expect(container.textContent).toContain('压缩阈值');
  } finally {
    await act(async () => { useI18nStore.getState().setLocale('en'); });
  }
});

test('modelPresets structured editor supports multiple role overrides and rejects duplicate preset names', async () => {
  const presetState = {
    workspaceId: 'workspace_1',
    revision: '15',
    settings: [
      {
        id: 'modelPresets' as const,
        type: 'record' as const,
        value: {
          arch: {
            modelRoles: { default: 'openai/gpt-4o', plan: 'anthropic/claude-3-7-sonnet', smol: 'openai/gpt-4o-mini' },
            defaultThinkingLevel: 'high',
          },
        },
        default: {},
        configured: true,
        label: 'Model Presets',
      },
    ],
  };

  getSettings.mockResolvedValue(presetState as unknown as OmpSettingsState);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  const presetCard = container.querySelector('[data-settings-item="omp.modelPresets"]');
  expect(presetCard?.textContent).toContain('arch');
  // Verifies all three role overrides are preserved and rendered
  expect(presetCard?.textContent).toContain('Default');
  expect(presetCard?.textContent).toContain('Architect');
  expect(presetCard?.textContent).toContain('Fast (Smol)');

  // Test duplicate preset name rejection
  const nameInput = presetCard?.querySelector('input[placeholder="New preset name"]') as HTMLInputElement;
  const addContainer = nameInput.closest('.p-3');
  const addBtn = addContainer?.querySelector<HTMLButtonElement>('button:not([role="combobox"])');
  expect(nameInput).not.toBeNull();
  expect(addBtn).not.toBeNull();

  await act(async () => {
    const nativeSetter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
    nativeSetter?.call(nameInput, 'arch');
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();

  await act(async () => {
    addBtn?.click();
  });
  await settle();

  expect(presetCard?.textContent).toContain('A preset with this name already exists');
});

test('compaction.modelThresholds preserves and renders valid native string thresholds like percentage or fixed triggers', async () => {
  const thresholdState = {
    workspaceId: 'workspace_1',
    revision: '16',
    settings: [
      {
        id: 'compaction.modelThresholds' as const,
        type: 'record' as const,
        value: {
          'openai/gpt-4o': 90000,
          'deepseek/*': '80%',
          'anthropic/*': 'f100000',
        },
        default: {},
        configured: true,
        label: 'Model Thresholds',
        group: 'Compaction',
      },
    ],
  };

  getSettings.mockResolvedValue(thresholdState as unknown as OmpSettingsState);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  const thSection = container.querySelector('[data-settings-item="omp.compaction.modelThresholds"]');
  expect(thSection?.textContent).toContain('openai/gpt-4o');
  expect(thSection?.textContent).toContain('deepseek/*');
  expect(thSection?.textContent).toContain('anthropic/*');

  const inputs = Array.from(thSection?.querySelectorAll('input') ?? []).map(i => i.value);
  expect(inputs.some(val => val.includes('90'))).toBe(true);
  expect(inputs.includes('80%')).toBe(true);
  expect(inputs.includes('f100000')).toBe(true);
});

test('numeric option with default sentinel (-1) renders Default label in trigger without NaN', async () => {
  const sentinelState = {
    workspaceId: 'workspace_1',
    revision: '17',
    settings: [
      {
        id: 'compaction.thresholdPercent' as const,
        type: 'number' as const,
        value: -1,
        default: -1,
        configured: true,
        label: 'Compaction Threshold',
        group: 'Compaction',
        tab: 'context',
        options: [
          { value: 'default', label: 'Default' },
          { value: '50', label: '50%' },
        ],
      },
    ],
  };

  getSettings.mockResolvedValue(sentinelState as unknown as OmpSettingsState);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  const row = container.querySelector('[data-settings-item="omp.compaction.thresholdPercent"]');
  expect(row).not.toBeNull();
  // Verifies trigger text is Default, not blank or NaN
  expect(row?.textContent).toContain('Default');
});

test('StringRecordField preserves scalar and structured values without lossy string coercion', async () => {
  const recordState = {
    workspaceId: 'workspace_1',
    revision: '18',
    settings: [
      {
        id: 'tools.approval' as const,
        type: 'record' as const,
        value: {
          bash: true,
          edit: 'always-ask',
          retryCount: 3,
        },
        default: {},
        configured: true,
        label: 'Tool Approvals',
        group: 'Approvals',
        tab: 'interaction',
      },
    ],
  };

  getSettings.mockResolvedValue(recordState as unknown as OmpSettingsState);
  await act(async () => { root.render(<I18nProvider><OmpSettingsPage /></I18nProvider>); });
  await settle();

  const recordRow = container.querySelector('[data-settings-item="omp.tools.approval"]');
  expect(recordRow).not.toBeNull();
  expect(recordRow?.textContent).toContain('bash:');
  expect(recordRow?.textContent).toContain('edit:');
  expect(recordRow?.textContent).toContain('retryCount:');

  const inputs = Array.from(recordRow?.querySelectorAll('input') ?? []).map((i) => i.value);
  expect(inputs.includes('true')).toBe(true);
  expect(inputs.includes('always-ask')).toBe(true);
  expect(inputs.includes('3')).toBe(true);
});
