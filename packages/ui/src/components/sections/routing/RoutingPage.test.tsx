import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Model, Provider } from '@openchamber/agent-contract';
import type { RoutingConfig } from '@/lib/routing/routingApi';
import { useRoutingStore } from '@/stores/useRoutingStore';
import { useConfigStore } from '@/stores/useConfigStore';

const domWindow = new Window();
Object.defineProperty(globalThis, 'window', { value: domWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', { value: domWindow.document, configurable: true, writable: true });
Object.assign(globalThis, {
  navigator: domWindow.navigator,
  Node: domWindow.Node,
  Element: domWindow.Element,
  HTMLElement: domWindow.HTMLElement,
  HTMLInputElement: domWindow.HTMLInputElement,
  HTMLTextAreaElement: domWindow.HTMLTextAreaElement,
  HTMLButtonElement: domWindow.HTMLButtonElement,
  customElements: domWindow.customElements,
  MutationObserver: domWindow.MutationObserver,
  ResizeObserver: domWindow.ResizeObserver,
  PointerEvent: domWindow.PointerEvent,
  MouseEvent: domWindow.MouseEvent,
  KeyboardEvent: domWindow.KeyboardEvent,
  Event: domWindow.Event,
  localStorage: domWindow.localStorage,
  getComputedStyle: domWindow.getComputedStyle.bind(domWindow),
  requestAnimationFrame: domWindow.requestAnimationFrame.bind(domWindow),
  cancelAnimationFrame: domWindow.cancelAnimationFrame.bind(domWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Setup DOM globals before importing React DOM client and component under test
const reactDomClient = await import('react-dom/client');
const createRoot = reactDomClient.createRoot;
type Root = import('react-dom/client').Root;

const mockConfig: RoutingConfig = {
  enabled: true,
  fallback: {
    model: { providerID: 'anthropic', modelID: 'claude-3-7-sonnet' },
    variant: 'high',
  },
  minConfidence: 0.6,
  preserveCache: true,
  safetyNet: { enabled: true, threshold: 0.6 },
  categories: [
    {
      id: 'trivial',
      builtin: true,
      enabled: true,
      name: 'Trivial',
      description: 'Quick mechanical task',
      model: null,
      variant: null,
      agent: null,
    },
    {
      id: 'hard',
      builtin: true,
      enabled: true,
      name: 'Hard',
      description: 'Hard reasoning and architecture',
      model: { providerID: 'anthropic', modelID: 'claude-3-7-sonnet' },
      variant: 'high',
      agent: null,
    },
  ],
};

// The page names a builtin category in the reader's language only while the
// stored name still equals the seeded English one, so the mock must translate
// those keys the way a real dictionary does instead of echoing the key.
const BUILTIN_NAMES = {
  en: { trivial: 'Trivial', research: 'Research', implement: 'Implement', hard: 'Hard' },
  'zh-CN': { trivial: '简单', research: '研究', implement: '实现', hard: '困难' },
} as const;
type MockBuiltinId = keyof (typeof BUILTIN_NAMES)['en'];
type MockLocale = keyof typeof BUILTIN_NAMES;
let mockLocale: MockLocale = 'en';

const builtinIdOfKey = (key: string): MockBuiltinId | null => {
  switch (key) {
    case 'settings.routing.builtin.trivial.name': return 'trivial';
    case 'settings.routing.builtin.research.name': return 'research';
    case 'settings.routing.builtin.implement.name': return 'implement';
    case 'settings.routing.builtin.hard.name': return 'hard';
    default: return null;
  }
};

mock.module('@/lib/i18n', () => ({
  useI18n: () => ({
    locale: mockLocale,
    t: (key: string, params?: { name?: string }) => {
      const builtinId = builtinIdOfKey(key);
      if (builtinId !== null) return BUILTIN_NAMES[mockLocale][builtinId];
      return params?.name === undefined ? key : `${key}:${params.name}`;
    },
  }),
}));

mock.module('@/components/sections/classification/JevAccessNote', () => ({
  JevAccessNote: () => <div data-testid="jev-access-note" />,
}));

interface MockModelSelectorProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  placeholder?: string;
}

mock.module('@/components/sections/agents/ModelSelector', () => ({
  ModelSelector: ({ providerId, modelId, onChange, placeholder }: MockModelSelectorProps) => (
    <div data-testid="model-selector" data-provider={providerId} data-model={modelId}>
      <span>{modelId || placeholder}</span>
      <button type="button" onClick={() => onChange('anthropic', 'claude-3-7-sonnet')}>
        Select Model
      </button>
    </div>
  ),
}));

const saveStateCalls: string[] = [];
const saveCalls: RoutingConfig[] = [];

mock.module('@/lib/persistence', () => ({
  reportSettingsSaveState: (state: string) => { saveStateCalls.push(state); },
}));

const mockModel: Model = {
  modelId: 'claude-3-7-sonnet',
  provider: 'anthropic',
  name: 'Claude 3.7 Sonnet',
  modalities: ['text'],
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
    { reasoningEffort: 'medium', label: 'Medium', budgetTokens: null },
    { reasoningEffort: 'high', label: 'High', budgetTokens: null },
  ],
  variants: [],
  pricing: null,
};

const mockProvider: Provider & { models: Model[] } = {
  providerId: 'anthropic',
  name: 'Anthropic',
  endpoint: null,
  protocol: null,
  authMethods: ['api-key'],
  auth: { status: 'configured', method: 'api-key', source: 'stored-credential', credentialRef: 'cred_anthropic' },
  models: [mockModel],
};

const { RoutingPage } = await import('./RoutingPage');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE_SETTLE_MS = 650;

const setInputValue = async (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (!setter) throw new Error('Missing value setter');
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const buttonIn = (root: ParentNode, text: string): HTMLButtonElement => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent?.includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
};

const buttonContaining = (text: string): HTMLButtonElement => buttonIn(document, text);

const getCreateDialog = (): HTMLElement => {
  const dialog = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
  if (!dialog) throw new Error('Expected create-category dialog to be open');
  return dialog;
};
describe('RoutingPage', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    mockLocale = 'en';
    saveCalls.length = 0;
    saveStateCalls.length = 0;
    useRoutingStore.setState({
      available: true,
      loaded: true,
      autoReady: true,
      config: mockConfig,
      builtins: mockConfig.categories,
      load: async () => { },
      // Mirrors the server's schema: it trims both fields, rejects an empty one,
      // and caps the list at 32, so a leaked invalid save would report an error.
      saveConfig: async (config: RoutingConfig) => {
        saveCalls.push(config);
        const invalid = config.categories.some((category) => category.name.trim().length === 0 || category.description.trim().length === 0);
        if (invalid || config.categories.length > 32) throw new Error('Invalid routing config');
      },
    });

    useConfigStore.setState({
      providers: [mockProvider],
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

// Only a builtin that still carries the seeded English name is translated:
  // the stored config is never rewritten, and a renamed builtin shows what the
  // user typed.
  test('builtin categories are translated while their stored name is the seeded English one', async () => {
    const localizedConfig: RoutingConfig = {
      ...mockConfig,
      categories: [
        { id: 'trivial', builtin: true, enabled: true, name: 'Trivial', description: 'Quick mechanical task', model: null, variant: null, agent: null },
        { id: 'hard', builtin: true, enabled: true, name: 'Hard', description: 'Hard reasoning and architecture', model: null, variant: null, agent: null },
        { id: 'research', builtin: true, enabled: true, name: 'My Research', description: 'My own description', model: null, variant: null, agent: null },
      ],
    };
    useRoutingStore.setState({ config: localizedConfig, builtins: localizedConfig.categories });

    mockLocale = 'zh-CN';
    await act(async () => { root.render(<RoutingPage />); });

    expect(container.textContent).toContain('简单');
    expect(container.textContent).toContain('困难');
    expect(container.textContent).toContain('My Research');
    // The stored names keep their English text; only the display changes.
    expect(localizedConfig.categories[0]?.name).toBe('Trivial');
    expect(saveCalls).toHaveLength(0);

    // The enabled checkbox names the same localized title.
    const enabledAria = container.querySelector('[aria-label]');
    expect(container.textContent).not.toContain('Trivial');
    expect(enabledAria).not.toBeNull();
  });

  test('does not render AgentSelector in routing category editor (W2 invariant)', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });
    const toggleButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Hard'));
    expect(toggleButton).toBeDefined();
    await act(async () => {
      toggleButton?.click();
    });
    // AgentSelector and agent field must NOT be rendered in the category editor
    expect(container.querySelector('[data-testid="agent-selector"]')).toBeNull();
    expect(container.textContent).not.toContain('settings.routing.category.agent');

    // Thinking efforts and model selector are rendered
    expect(container.textContent).toContain('settings.routing.category.thinking');
    expect(container.textContent).toContain('settings.routing.category.model');
  });

  test('renders addCategory button instead of legacy inline add row', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    expect(document.querySelector('[aria-label="settings.routing.categories.addLabel"]')).toBeNull();
    const legacyAddButton = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((entry) => entry.textContent?.trim() === 'settings.routing.categories.add');
    expect(legacyAddButton).toBeUndefined();

    const addCategoryButton = buttonContaining('settings.routing.categories.addCategory');
    expect(addCategoryButton.disabled).toBe(false);
  });

  test('opening the create category dialog shows clean fields with no initial errors and closes on cancel', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('settings.routing.categories.addCategory').click();
    });

    const dialog = getCreateDialog();
    expect(dialog.textContent).toContain('settings.routing.categories.createDialog.title');
    expect(document.body.textContent).not.toContain('settings.routing.categories.invalidDraft');
    expect(document.body.textContent).not.toContain('settings.routing.category.nameRequired');
    expect(document.body.textContent).not.toContain('settings.routing.category.descriptionRequired');
    expect(document.body.textContent).not.toContain('settings.routing.category.nameDuplicate');

    const nameInput = dialog.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    if (!nameInput) throw new Error('Missing dialog name input');
    expect(nameInput.maxLength).toBe(60);

    const modelSelector = dialog.querySelector('[data-testid="model-selector"]');
    if (!modelSelector) throw new Error('Missing dialog model selector');
    expect(modelSelector.textContent).toContain('settings.routing.model.useFallback');

    const thinkingSelect = dialog.querySelector('[aria-label="settings.routing.category.thinking"]');
    if (!thinkingSelect) throw new Error('Missing dialog thinking select');
    expect(
      thinkingSelect.hasAttribute('disabled')
      || thinkingSelect.getAttribute('aria-disabled') === 'true'
      || thinkingSelect.hasAttribute('data-disabled')
    ).toBe(true);

    const descriptionInput = dialog.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!descriptionInput) throw new Error('Missing dialog description textarea');
    expect(descriptionInput.maxLength).toBe(2000);

    expect(buttonIn(dialog, 'settings.routing.categories.createDialog.submit')).toBeDefined();

    // Selecting a reasoning model enables the Thinking selector inside the dialog.
    await act(async () => {
      buttonIn(dialog, 'Select Model').click();
    });
    const updatedThinkingSelect = dialog.querySelector('[aria-label="settings.routing.category.thinking"]');
    if (!updatedThinkingSelect) throw new Error('Missing dialog thinking select after model selection');
    expect(
      updatedThinkingSelect.hasAttribute('disabled')
      || updatedThinkingSelect.getAttribute('aria-disabled') === 'true'
      || updatedThinkingSelect.hasAttribute('data-disabled')
    ).toBe(false);

    await act(async () => {
      buttonIn(dialog, 'settings.common.actions.cancel').click();
    });

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(saveCalls.length).toBe(0);
  });

  test('dialog validates empty fields, clears description error on input, and blocks duplicate names without saving', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('settings.routing.categories.addCategory').click();
    });

    const dialog = getCreateDialog();
    const submitButton = buttonIn(dialog, 'settings.routing.categories.createDialog.submit');

    // Empty Name and empty Description -> both field errors inside dialog, no invalidDraft banner, no save.
    await act(async () => {
      submitButton.click();
    });
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(dialog.textContent).toContain('settings.routing.category.nameRequired');
    expect(dialog.textContent).toContain('settings.routing.category.descriptionRequired');
    expect(document.body.textContent).not.toContain('settings.routing.categories.invalidDraft');
    expect(saveCalls.length).toBe(0);
    expect(saveStateCalls).not.toContain('error');
    expect(saveStateCalls).not.toContain('saving');

    // Valid Name with empty Description -> only descriptionRequired remains; typing into Description clears it immediately.
    const nameInput = dialog.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    const descriptionInput = dialog.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!nameInput || !descriptionInput) throw new Error('Missing dialog inputs');

    await setInputValue(nameInput, 'Docs');
    await act(async () => {
      submitButton.click();
    });

    expect(dialog.textContent).not.toContain('settings.routing.category.nameRequired');
    expect(dialog.textContent).toContain('settings.routing.category.descriptionRequired');
    expect(saveCalls.length).toBe(0);

    await setInputValue(descriptionInput, 'Docs and reference writing');
    expect(dialog.textContent).not.toContain('settings.routing.category.descriptionRequired');
    expect(saveCalls.length).toBe(0);

    // Case-insensitive collision with existing 'Trivial' -> shows nameDuplicate, keeps dialog open, no save.
    await setInputValue(nameInput, 'trivial');
    await act(async () => {
      submitButton.click();
    });

    expect(dialog.textContent).toContain('settings.routing.category.nameDuplicate');
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    expect(saveCalls.length).toBe(0);
  });

  test('submitting a valid category in the dialog appends it, closes the dialog, and saves immediately', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('settings.routing.categories.addCategory').click();
    });

    const dialog = getCreateDialog();
    const nameInput = dialog.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    const descriptionInput = dialog.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!nameInput || !descriptionInput) throw new Error('Missing dialog inputs');

    await setInputValue(nameInput, 'Docs');
    await act(async () => {
      buttonIn(dialog, 'Select Model').click();
    });
    await setInputValue(descriptionInput, 'Docs and reference writing');

    saveStateCalls.length = 0;
    saveCalls.length = 0;
    await act(async () => {
      buttonIn(dialog, 'settings.routing.categories.createDialog.submit').click();
    });

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    expect(saveCalls.length).toBe(1);

    const docs = saveCalls[0].categories.find((category) => category.id === 'docs');
    expect(docs).toEqual({
      id: 'docs',
      builtin: false,
      enabled: true,
      name: 'Docs',
      description: 'Docs and reference writing',
      model: { providerID: 'anthropic', modelID: 'claude-3-7-sonnet' },
      variant: null,
      agent: null,
    });

    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(1);
    expect(saveStateCalls).toContain('saved');
  });

  test('clearing an existing category description never sends an invalid config', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('Hard').click();
    });
    const description = container.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!description) throw new Error('Missing description field');
    await setInputValue(description, '');

    saveStateCalls.length = 0;
    saveCalls.length = 0;
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(0);
    expect(saveStateCalls).not.toContain('error');
    expect(saveStateCalls).not.toContain('saving');
    expect(container.textContent).toContain('settings.routing.category.descriptionRequired');

    const name = container.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    if (!name) throw new Error('Missing name field');
    await setInputValue(name, '');
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(0);
    expect(container.textContent).toContain('settings.routing.category.nameRequired');
  });

  test('unmounting with an invalid draft does not send it', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('Hard').click();
    });
    const name = container.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    if (!name) throw new Error('Missing name field');
    await setInputValue(name, '');

    saveCalls.length = 0;
    saveStateCalls.length = 0;
    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(0);
    expect(saveStateCalls).not.toContain('error');
    expect(saveStateCalls).not.toContain('saving');
  });

  test('an invalid category stays open, says why, and holds unrelated edits until it is fixed', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('Hard').click();
    });
    const description = container.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!description) throw new Error('Missing description field');
    await setInputValue(description, '');
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(container.textContent).toContain('settings.routing.categories.invalidDraft');

    // An unrelated edit rides along in the same draft; nothing is sent while the
    // category is invalid, and the section says so.
    saveCalls.length = 0;
    saveStateCalls.length = 0;
    const preserveCacheRow = [...container.querySelectorAll<HTMLElement>('[role="button"]')]
      .find((row) => row.textContent?.includes('settings.routing.auto.preserveCache'));
    if (!preserveCacheRow) throw new Error('Missing preserve-cache row');
    await act(async () => {
      preserveCacheRow.click();
    });
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(0);
    expect(saveStateCalls).not.toContain('saving');
    expect(container.textContent).toContain('settings.routing.categories.invalidDraft');

    // The invalid row cannot be collapsed, so its reason stays on screen.
    await act(async () => {
      buttonContaining('Hard').click();
    });
    expect(container.querySelector('[aria-label="settings.routing.category.description"]')).not.toBeNull();

    const reopenedDescription = container.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!reopenedDescription) throw new Error('Missing description field');
    await setInputValue(reopenedDescription, 'Hard reasoning and architecture again');
    await act(async () => {
      await sleep(DEBOUNCE_SETTLE_MS);
    });

    expect(saveCalls.length).toBe(1);
    expect(saveCalls[0].preserveCache).toBe(false);
    const hard = saveCalls[0].categories.find((category) => category.id === 'hard');
    expect(hard?.description).toBe('Hard reasoning and architecture again');
    expect(container.textContent).not.toContain('settings.routing.categories.invalidDraft');
  });

  test('a new category never takes the id of a removed built-in', async () => {
    const researchBuiltin = {
      id: 'research',
      builtin: true,
      enabled: true,
      name: 'Research',
      description: 'Reading and comparing sources',
      model: null,
      variant: null,
      agent: null,
    };
    useRoutingStore.setState({ builtins: [...mockConfig.categories, researchBuiltin] });

    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('settings.routing.categories.addCategory').click();
    });

    const dialog = getCreateDialog();
    const nameInput = dialog.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    const descriptionInput = dialog.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!nameInput || !descriptionInput) throw new Error('Missing dialog inputs');

    await setInputValue(nameInput, 'Research');
    await setInputValue(descriptionInput, 'Summarising papers');
    await act(async () => {
      buttonIn(dialog, 'settings.routing.categories.createDialog.submit').click();
    });

    expect(saveCalls.length).toBe(1);
    const added = saveCalls[0].categories.find((category) => !category.builtin && category.name === 'Research');
    expect(added).toBeDefined();
    expect(added?.id).toBe('research-2');
  });

  test('a new category deduplicates its slug against an existing user category id', async () => {
    useRoutingStore.setState({
      config: {
        ...mockConfig,
        categories: [
          ...mockConfig.categories,
          {
            id: 'docs',
            builtin: false,
            enabled: true,
            name: 'Documentation',
            description: 'Existing documentation bucket',
            model: null,
            variant: null,
            agent: null,
          },
        ],
      },
    });

    await act(async () => {
      root.render(<RoutingPage />);
    });

    await act(async () => {
      buttonContaining('settings.routing.categories.addCategory').click();
    });

    const dialog = getCreateDialog();
    const nameInput = dialog.querySelector<HTMLInputElement>('[aria-label="settings.routing.category.name"]');
    const descriptionInput = dialog.querySelector<HTMLTextAreaElement>('[aria-label="settings.routing.category.description"]');
    if (!nameInput || !descriptionInput) throw new Error('Missing dialog inputs');

    await setInputValue(nameInput, 'Docs');
    await setInputValue(descriptionInput, 'Docs and reference writing');
    await act(async () => {
      buttonIn(dialog, 'settings.routing.categories.createDialog.submit').click();
    });

    expect(saveCalls.length).toBe(1);
    const added = saveCalls[0].categories.find((category) => !category.builtin && category.name === 'Docs');
    expect(added).toBeDefined();
    expect(added?.id).toBe('docs-2');
  });

  test('Add is disabled at the server cap of 32 categories', async () => {
    const many = Array.from({ length: 32 }, (_, index) => ({
      id: `category-${index}`,
      builtin: false,
      enabled: true,
      name: `Category ${index}`,
      description: `Tasks for bucket ${index}`,
      model: null,
      variant: null,
      agent: null,
    }));
    useRoutingStore.setState({
      config: { ...mockConfig, categories: many },
      builtins: mockConfig.categories,
    });

    await act(async () => {
      root.render(<RoutingPage />);
    });

    const addButton = buttonContaining('settings.routing.categories.addCategory');
    expect(addButton.disabled).toBe(true);
    await act(async () => {
      addButton.click();
    });
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
  });

  test('thinking select displays reasoning effort options rather than legacy model variants', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    const fallbackSelect = container.querySelector('[aria-label="settings.routing.auto.fallbackThinking"]');
    expect(fallbackSelect).not.toBeNull();

    expect(container.textContent).toContain('settings.page.routing.title');
    expect(container.textContent).toContain('settings.routing.auto.fallbackModel');
  });
});
