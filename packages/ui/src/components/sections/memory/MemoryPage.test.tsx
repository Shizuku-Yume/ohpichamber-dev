import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Model, ModelCatalog, OmpSetting, OmpSettingsState, OmpSettingsUpdateRequest } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
const domGlobals = {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  sessionStorage: browser.sessionStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  FocusEvent: browser.FocusEvent,
  KeyboardEvent: browser.KeyboardEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
};
Object.assign(globalThis, domGlobals);

// React DOM and stores must load after Happy DOM installs browser globals onto globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { canonicalClient } = await import('@/api/canonicalClient');
const { useConfigStore } = await import('@/stores/useConfigStore');
const directoryHook = await import('@/hooks/useSettingsDirectory');
const modelsHook = await import('@/hooks/useSettingsModels');
const { MemoryPage } = await import('./MemoryPage');

const MNEMOPI_IDS = [
  'mnemopi.bank',
  'mnemopi.scoping',
  'mnemopi.embeddingVariant',
  'mnemopi.autoRecall',
  'mnemopi.autoRetain',
  'mnemopi.polyphonicRecall',
  'mnemopi.enhancedRecall',
  'mnemopi.proactiveLinking',
  'mnemopi.noEmbeddings',
  'mnemopi.embeddingModel',
  'mnemopi.llmMode',
  'mnemopi.llmModel',
] as const;

const HINDSIGHT_IDS = [
  'hindsight.bankId',
  'hindsight.scoping',
  'hindsight.globalScope',
  'hindsight.autoRecall',
  'hindsight.autoRetain',
  'hindsight.retainMode',
  'hindsight.mentalModelsEnabled',
  'hindsight.mentalModelAutoSeed',
] as const;

const TEST_MODELS: readonly Model[] = [
  {
    provider: 'openai',
    modelId: 'gpt-4o',
    name: 'GPT-4o',
    modalities: ['text'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    reasoningEffortSupported: true,
    reasoningOptions: [
      { reasoningEffort: 'low', label: 'Low', budgetTokens: 2048 },
      { reasoningEffort: 'high', label: 'High', budgetTokens: 16000 },
    ],
    variants: [],
    pricing: null,
  },
  {
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    name: 'GPT-4o mini',
    modalities: ['text'],
    contextWindow: 128000,
    maxOutputTokens: 16384,
    reasoningEffortSupported: false,
    reasoningOptions: [],
    variants: [],
    pricing: null,
  },
];

const TEST_CATALOG: ModelCatalog = {
  workspaceId: 'ws_memory',
  revision: '1',
  imageModels: [],
  planRoleAvailable: false,
  defaults: { model: null, thinkingLevel: null },
  models: [...TEST_MODELS],
};

function makeSetting(
  id: string,
  type: OmpSetting['type'],
  value: OmpSetting['value'],
  defaultValue: OmpSetting['default'],
  placement: OmpSetting['placement'],
  options?: OmpSetting['options'],
): OmpSetting {
  const setting: OmpSetting = {
    id,
    type,
    value,
    default: defaultValue,
    configured: value !== defaultValue && value !== null,
    placement,
  };
  if (options) {
    setting.options = options;
  }
  return setting;
}

function buildMemoryState(
  backend: 'off' | 'mnemopi' | 'hindsight' | 'sharpshooter',
  overrides?: { sharpshooterModel?: string | null; memoryRole?: string },
): OmpSettingsState {
  const backendPlacement: OmpSetting['placement'] = { type: 'page', page: 'memory', section: 'backend' };
  const settings: OmpSetting[] = [
    makeSetting('memory.backend', 'enum', backend, 'off', backendPlacement, [
      { value: 'off', label: 'Off' },
      { value: 'local', label: 'Local' },
      { value: 'hindsight', label: 'Hindsight' },
      { value: 'mnemopi', label: 'Mnemopi' },
      { value: 'sharpshooter', label: 'Sharpshooter' },
    ]),
    makeSetting('sharpshooter.model', 'string', overrides?.sharpshooterModel ?? null, null, backendPlacement),
    makeSetting('autolearn.enabled', 'boolean', false, false, backendPlacement),
    makeSetting('autolearn.autoContinue', 'boolean', false, false, backendPlacement),
    makeSetting('mnemopi.bank', 'string', null, null, backendPlacement),
    makeSetting('mnemopi.scoping', 'enum', 'per-project', 'per-project', backendPlacement, [
      { value: 'global', label: 'Global' },
      { value: 'per-project', label: 'Per project' },
    ]),
    makeSetting('mnemopi.embeddingVariant', 'enum', 'en', 'en', backendPlacement, [
      { value: 'en', label: 'English' },
      { value: 'multilingual', label: 'Multilingual' },
    ]),
    makeSetting('mnemopi.autoRecall', 'boolean', true, true, backendPlacement),
    makeSetting('mnemopi.autoRetain', 'boolean', true, true, backendPlacement),
    makeSetting('mnemopi.polyphonicRecall', 'boolean', false, false, backendPlacement),
    makeSetting('mnemopi.enhancedRecall', 'boolean', false, false, backendPlacement),
    makeSetting('mnemopi.proactiveLinking', 'boolean', false, false, backendPlacement),
    makeSetting('mnemopi.noEmbeddings', 'boolean', false, false, backendPlacement),
    makeSetting('mnemopi.embeddingModel', 'string', null, null, backendPlacement),
    makeSetting('mnemopi.llmMode', 'enum', 'smol', 'smol', backendPlacement, [
      { value: 'none', label: 'None' },
      { value: 'smol', label: 'Small model' },
      { value: 'remote', label: 'Remote' },
    ]),
    makeSetting('mnemopi.llmModel', 'string', null, null, backendPlacement),
    makeSetting('hindsight.bankId', 'string', null, null, backendPlacement),
    makeSetting('hindsight.scoping', 'enum', 'per-project-tagged', 'per-project-tagged', backendPlacement, [
      { value: 'global', label: 'Global' },
      { value: 'per-project', label: 'Per project' },
      { value: 'per-project-tagged', label: 'Per project (tagged)' },
    ]),
    makeSetting('hindsight.globalScope', 'boolean', false, false, backendPlacement),
    makeSetting('hindsight.autoRecall', 'boolean', true, true, backendPlacement),
    makeSetting('hindsight.autoRetain', 'boolean', true, true, backendPlacement),
    makeSetting('hindsight.retainMode', 'enum', 'full-session', 'full-session', backendPlacement, [
      { value: 'full-session', label: 'Full session' },
      { value: 'last-turn', label: 'Last turn' },
    ]),
    makeSetting('hindsight.mentalModelsEnabled', 'boolean', true, true, backendPlacement),
    makeSetting('hindsight.mentalModelAutoSeed', 'boolean', true, true, backendPlacement),
    makeSetting(
      'modelRoles',
      'record',
      overrides?.memoryRole ? { memory: overrides.memoryRole } : {},
      {},
      { type: 'owned-by', owner: 'model-roles.section.chat' },
    ),
  ];

  return {
    workspaceId: 'ws_memory',
    revision: '1',
    totalCount: settings.length,
    settings,
  };
}

const settle = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i += 1) {
      await Promise.resolve();
    }
  });
};

afterAll(() => browser.close());

describe('MemoryPage', () => {
  let host: HTMLDivElement;
  let root: Root;
  let currentState: OmpSettingsState;
  let writtenRequests: OmpSettingsUpdateRequest[];
  let restore: (() => void)[];

  beforeEach(() => {
    Object.assign(globalThis, domGlobals);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    writtenRequests = [];
    currentState = buildMemoryState('off');

    useConfigStore.setState({
      activeDirectoryKey: '/repo',
      providersLoaded: true,
      models: [...TEST_MODELS],
      providers: [
        {
          providerId: 'openai',
          name: 'OpenAI',
          endpoint: null,
          protocol: 'responses',
          authMethods: ['api-key'],
          auth: { status: 'missing' },
          models: [...TEST_MODELS],
        },
      ],
    });

    const activeSpies = [
      spyOn(directoryHook, 'useSettingsDirectory').mockReturnValue('/repo'),
      spyOn(modelsHook, 'useSettingsModels').mockReturnValue([...TEST_MODELS]),
      spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({
        workspaceId: 'ws_memory',
        projectId: 'proj_1',
        name: 'repo',
      }),
      spyOn(canonicalClient, 'getModels').mockResolvedValue(TEST_CATALOG),
      spyOn(canonicalClient, 'getOmpSettings').mockImplementation(async () => currentState),
      spyOn(canonicalClient, 'updateOmpSettings').mockImplementation(async (_workspaceId, request) => {
        writtenRequests.push(request);
        const nextSettings = currentState.settings.map((setting) => {
          const change = request.changes.find((item) => item.id === setting.id);
          return change ? { ...setting, value: change.value, configured: change.value !== null } : setting;
        });
        currentState = {
          ...currentState,
          revision: String(Number(currentState.revision) + 1),
          settings: nextSettings,
        };
        return currentState;
      }),
    ];
    restore = activeSpies.map((spy) => () => spy.mockRestore());
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restore.forEach((reset) => reset());
    host.remove();
  });

  test('when memory.backend is off, hides both Mnemopi and Hindsight sections while keeping backend and autolearn', async () => {
    currentState = buildMemoryState('off');
    await act(async () => root.render(<I18nProvider><MemoryPage /></I18nProvider>));
    await settle();

    expect(host.querySelector('[data-settings-item="memory.section.backend"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.memory.backend"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="memory.section.autolearn"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.autolearn.enabled"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.autolearn.autoContinue"]')).not.toBeNull();

    expect(host.querySelector('[data-settings-item="memory.section.mnemopi"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="memory.section.hindsight"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="omp.sharpshooter.model"]')).toBeNull();
    for (const id of MNEMOPI_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).toBeNull();
    }
    for (const id of HINDSIGHT_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).toBeNull();
    }
    expect(host.querySelectorAll('[data-slot="dropdown-menu-trigger"]')).toHaveLength(0);
  });

  test('when memory.backend is mnemopi, shows only Mnemopi rows and hides Hindsight', async () => {
    currentState = buildMemoryState('mnemopi', { memoryRole: 'openai/gpt-4o:high' });
    await act(async () => root.render(<I18nProvider><MemoryPage /></I18nProvider>));
    await settle();

    expect(host.querySelector('[data-settings-item="memory.section.mnemopi"]')).not.toBeNull();
    for (const id of MNEMOPI_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).not.toBeNull();
    }

    expect(host.querySelector('[data-settings-item="memory.section.hindsight"]')).toBeNull();
    for (const id of HINDSIGHT_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).toBeNull();
    }
    expect(host.querySelector('[data-settings-item="omp.sharpshooter.model"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="memory.section.autolearn"]')).not.toBeNull();
    expect(host.querySelector('[data-settings-item="omp.modelRoles.memory"]')).toBeNull();
    expect(host.textContent).toContain('GPT-4o');
  });

  test('when memory.backend is hindsight, shows only Hindsight rows and hides Mnemopi', async () => {
    currentState = buildMemoryState('hindsight', { memoryRole: 'openai/gpt-4o:high' });
    await act(async () => root.render(<I18nProvider><MemoryPage /></I18nProvider>));
    await settle();

    expect(host.querySelector('[data-settings-item="memory.section.hindsight"]')).not.toBeNull();
    for (const id of HINDSIGHT_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).not.toBeNull();
    }

    expect(host.querySelector('[data-settings-item="memory.section.mnemopi"]')).toBeNull();
    for (const id of MNEMOPI_IDS) {
      expect(host.querySelector(`[data-settings-item="omp.${id}"]`)).toBeNull();
    }
    expect(host.querySelector('[data-settings-item="omp.sharpshooter.model"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="memory.section.autolearn"]')).not.toBeNull();
  });

  test('sharpshooter.model clearing writes null cleanly without conflicting with the inline memory role picker', async () => {
    currentState = buildMemoryState('sharpshooter', {
      sharpshooterModel: 'openai/gpt-4o-mini',
      memoryRole: 'openai/gpt-4o:high',
    });
    await act(async () => root.render(<I18nProvider><MemoryPage /></I18nProvider>));
    await settle();

    expect(host.querySelector('[data-settings-item="memory.section.mnemopi"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="memory.section.hindsight"]')).toBeNull();

    const sharpshooterRow = host.querySelector('[data-settings-item="omp.sharpshooter.model"]');
    expect(sharpshooterRow).not.toBeNull();
    expect(sharpshooterRow?.textContent).toContain('GPT-4o mini');

    // Inline memory role picker renders beside sharpshooter.model without claiming omp.modelRoles.memory.
    expect(host.querySelector('[data-settings-item="omp.modelRoles.memory"]')).toBeNull();
    expect(host.textContent).toContain('GPT-4o');
    expect(host.textContent).toContain('High');

    const sharpshooterTrigger = sharpshooterRow?.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]');
    expect(sharpshooterTrigger).not.toBeNull();
    await act(async () => {
      sharpshooterTrigger?.click();
    });

    const clearOption = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="listbox"] button'))
      .find((button) => button.textContent?.includes('Use the small model'));
    expect(clearOption).toBeDefined();

    await act(async () => {
      clearOption?.click();
    });
    await settle();

    expect(writtenRequests).toHaveLength(1);
    expect(writtenRequests[0]?.changes).toEqual([{ id: 'sharpshooter.model', value: null }]);
    expect(sharpshooterRow?.textContent).toContain('Use the small model');
    expect(host.textContent).toContain('GPT-4o');
    expect(host.textContent).toContain('High');

    // Selecting "Use the small model" again while already unset is a clean no-op.
    await act(async () => {
      sharpshooterTrigger?.click();
    });
    const clearOptionAgain = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="listbox"] button'))
      .find((button) => button.textContent?.includes('Use the small model'));
    await act(async () => {
      clearOptionAgain?.click();
    });
    await settle();
    expect(writtenRequests).toHaveLength(1);

    // Updating the inline memory role picker writes modelRoles without touching sharpshooter.model.
    const roleTrigger = host.querySelector<HTMLElement>(
      '[data-settings-item="memory.section.backend"] [data-slot="dropdown-menu-trigger"]',
    );
    expect(roleTrigger).not.toBeNull();
    await act(async () => {
      roleTrigger?.click();
    });
    const clearRoleOption = Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="listbox"] button'))
      .find((button) => button.textContent?.includes('Use the default model'));
    expect(clearRoleOption).toBeDefined();
    await act(async () => {
      clearRoleOption?.click();
    });
    await settle();

    expect(writtenRequests).toHaveLength(2);
    expect(writtenRequests[1]?.changes).toEqual([{ id: 'modelRoles', value: {} }]);
    expect(currentState.settings.find((setting) => setting.id === 'sharpshooter.model')?.value).toBeNull();
  });
});
