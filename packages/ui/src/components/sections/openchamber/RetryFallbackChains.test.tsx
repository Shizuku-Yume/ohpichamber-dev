import React from 'react';
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Model, OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';

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
  HTMLButtonElement: browser.HTMLButtonElement,
  DOMRect: browser.DOMRect,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  MouseEvent: browser.MouseEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  IntersectionObserver: browser.IntersectionObserver,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { dict: en } = await import('@/lib/i18n/messages/en');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { RetryFallbackChains } = await import('./RetryFallbackChains');

const TEST_MODELS: Model[] = [
  {
    modelId: 'o3-mini',
    provider: 'openai',
    name: 'o3-mini',
    modalities: ['text'],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    reasoningEffortSupported: true,
    reasoningOptions: [
      { reasoningEffort: 'low', label: 'Low', budgetTokens: 2048 },
      { reasoningEffort: 'high', label: 'High', budgetTokens: 32000 },
    ],
    variants: [],
    pricing: null,
  },
  {
    modelId: 'claude-sonnet-4',
    provider: 'anthropic',
    name: 'Claude Sonnet 4',
    modalities: ['text'],
    contextWindow: 200000,
    maxOutputTokens: 64000,
    reasoningEffortSupported: false,
    reasoningOptions: [],
    variants: [],
    pricing: null,
  },
];

function makeState(
  chains: Record<string, string[]>,
  options: { overridden?: boolean; unavailable?: boolean } = {},
): OmpSettingsState {
  return {
    workspaceId: 'workspace_1',
    revision: '1',
    totalCount: 2,
    settings: [
      {
        id: 'defaultThinkingLevel',
        type: 'enum',
        value: 'low',
        default: 'low',
        configured: false,
        placement: { type: 'owned-by', owner: 'sessions.default-thinking' },
        options: ['off', 'low', 'high'].map((value) => ({ value, label: value })),
      },
      {
        id: 'retry.fallbackChains',
        type: 'record',
        value: chains,
        default: {},
        configured: Object.keys(chains).length > 0,
        placement: { type: 'owned-by', owner: 'sessions.fallback-model' },
        condition: 'retryChainsUseSharedConfig',
        conditionActive: options.unavailable ? undefined : !options.overridden,
      },
    ],
  };
}

function setInputValue(input: HTMLInputElement, nextValue: string) {
  const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing HTMLInputElement value setter');
  setter.call(input, nextValue);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const pressKey = (target: EventTarget, code: string) => {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      code,
      key: code === 'Space' ? ' ' : code,
    }),
  );
};

describe('RetryFallbackChains', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useDirectoryStore.setState({ currentDirectory: '' });
    useConfigStore.setState({
      activeDirectoryKey: '__global__',
      providersLoaded: true,
      providers: [
        {
          providerId: 'openai',
          name: 'OpenAI',
          endpoint: null,
          protocol: null,
          authMethods: ['api-key'],
          auth: { status: 'missing' },
          models: [TEST_MODELS[0]],
        },
        {
          providerId: 'anthropic',
          name: 'Anthropic',
          endpoint: null,
          protocol: null,
          authMethods: ['api-key'],
          auth: { status: 'missing' },
          models: [TEST_MODELS[1]],
        },
      ],
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  function mountHarness(
    initialChains: Record<string, string[]>,
    options: {
      overridden?: boolean;
      unavailable?: boolean;
      shouldFail?: () => boolean;
      conflictOnKey?: string;
    } = {},
  ) {
    const writes: OmpSettingsChange[][] = [];
    let currentState = makeState(initialChains, options);

    const Harness = () => {
      const [state, setState] = React.useState(currentState);
      const updateSettings = async (makeChanges: (latest: OmpSettingsState) => OmpSettingsChange[]) => {
        try {
          const snapshot = options.conflictOnKey
            ? makeState({ ...initialChains, [options.conflictOnKey]: ['stale/conflict'] }, options)
            : currentState;
          const changes = makeChanges(snapshot);
          writes.push(changes);
          if (options.shouldFail?.()) return false;
          const nextSettings = snapshot.settings.map((setting) => {
            const match = changes.find((change) => change.id === setting.id);
            return match ? { ...setting, value: match.value } : setting;
          });
          currentState = { ...snapshot, settings: nextSettings };
          setState(currentState);
          return true;
        } catch {
          return false;
        }
      };

      return (
        <I18nProvider>
          <RetryFallbackChains
            state={state}
            saving={false}
            updateSettings={updateSettings}
            models={TEST_MODELS}
          />
        </I18nProvider>
      );
    };

    return { Harness, writes };
  }

  test('renders flat disclosure rows without form or textarea and shows localized labels', async () => {
    const { Harness } = mountHarness({
      default: ['openai/o3-mini:high'],
      'other/*': ['@smol'],
      web: ['web/exa'],
    });
    await act(async () => root.render(<Harness />));

    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('.text-destructive')).toBeNull();

    const disclosures = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
      .filter((button) => Boolean(button.textContent));
    expect(disclosures.map((button) => button.textContent)).toEqual([
      'Defaultopenai/o3-mini:high',
      'other/*@smol',
    ]);
    expect(host.textContent).toContain(en['settings.omp.modelRoles.role.web.label']);
    expect(host.textContent).not.toMatch(/\bweb\b(?!\/)/);
  });

  test('renders the web chain with ModelRoleLinkRow jumping to web-search', async () => {
    const jump = spyOn(useUIStore.getState(), 'requestSettingsJump');
    try {
      const { Harness } = mountHarness({ web: ['web/exa', 'web/tavily'] });
      await act(async () => root.render(<Harness />));

      const group = host.querySelector('[data-settings-item="sessions.fallback-model"]');
      expect(group?.textContent).toContain(en['settings.omp.modelRoles.role.web.label']);
      expect(group?.textContent).toContain('web/exa → web/tavily');
      const link = [...group?.querySelectorAll('button') ?? []]
        .find((button) => button.textContent === en['settings.omp.modelRoles.link.webSearch']);
      expect(link).toBeDefined();
      await act(async () => link?.click());
      expect(jump).toHaveBeenCalledWith('web-search', 'web-search.fallbacks');
    } finally {
      jump.mockRestore();
    }
  });

  test('opens Add chain dialog, creates a new role chain with a model target via CAS, and expands it', async () => {
    const original = { 'other/*': ['@smol'] };
    const { Harness, writes } = mountHarness(original);
    await act(async () => root.render(<Harness />));

    const addButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes(en['settings.retryFallback.addChain']));
    expect(addButton).toBeDefined();
    await act(async () => addButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const modelTrigger = [...dialog?.querySelectorAll('[data-slot="dropdown-menu-trigger"]') ?? []]
      .find((entry) => entry.textContent?.includes(en['settings.retryFallback.selectModelPlaceholder']));
    expect(modelTrigger).toBeDefined();
    await act(async () => {
      modelTrigger?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
      (modelTrigger as HTMLElement | undefined)?.click();
    });

    const modelChoice = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"], button, [data-model-id]')]
      .find((entry) => entry.textContent?.includes('Claude Sonnet 4'));
    expect(modelChoice).toBeDefined();
    await act(async () => modelChoice?.click());

    const createButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === en['settings.common.actions.create']);
    expect(createButton?.disabled).toBe(false);
    await act(async () => createButton?.click());

    expect(writes).toEqual([
      [{
        id: 'retry.fallbackChains',
        value: { ...original, default: ['anthropic/claude-sonnet-4'] },
        expectedValue: original,
      }],
    ]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();

    const defaultRow = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
      .find((button) => button.textContent?.startsWith(en['settings.omp.modelRoles.role.default.label']));
    expect(defaultRow?.getAttribute('aria-expanded')).toBe('true');
  });

  test('Add chain dialog supports wildcard key + wildcard target and blocks duplicate or invalid keys', async () => {
    const original = { 'existing/*': ['openai/o3-mini'] };
    const { Harness, writes } = mountHarness(original);
    await act(async () => root.render(<Harness />));

    const addButton = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes(en['settings.retryFallback.addChain']));
    await act(async () => addButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]')!;
    const wildcardButtons = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .filter((button) => button.textContent === en['settings.retryFallback.keyKind.wildcard']);
    expect(wildcardButtons.length).toBe(2);

    await act(async () => wildcardButtons[0].click());
    await act(async () => wildcardButtons[1].click());

    const keyInput = dialog.querySelector<HTMLInputElement>(`input[aria-label="${en['settings.retryFallback.key']}"]`)!;
    const targetInput = dialog.querySelector<HTMLInputElement>(`input[aria-label="${en['settings.retryFallback.firstTarget']}"]`)!;

    await act(async () => {
      setInputValue(keyInput, 'existing/*');
      setInputValue(targetInput, 'anthropic/*');
    });
    expect(dialog.textContent).toContain(en['settings.retryFallback.duplicate']);

    const createButton = [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === en['settings.common.actions.create'])!;
    expect(createButton.disabled).toBe(true);

    // A bare "web" key is not a valid wildcard; the reserved-web shortcut is gone and
    // Create stays disabled via wildcard validation.
    await act(async () => setInputValue(keyInput, 'web'));
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(en['settings.retryFallback.invalidWildcard']);
    expect([...dialog.querySelectorAll('button')].some((button) => button.textContent === en['settings.omp.modelRoles.link.webSearch'])).toBe(false);
    expect(createButton.disabled).toBe(true);

    await act(async () => setInputValue(keyInput, 'google/*'));
    expect(createButton.disabled).toBe(false);
    await act(async () => createButton.click());

    expect(writes).toEqual([
      [{
        id: 'retry.fallbackChains',
        value: { ...original, 'google/*': ['anthropic/*'] },
        expectedValue: original,
      }],
    ]);
  });

  test('reorders targets via @dnd-kit keyboard drag and saves immediately via CAS while keeping other chains', async () => {
    const original = {
      default: ['other/original', '@slow', 'openai/o3-mini:high'],
      'other/*': ['@smol'],
    };
    const { Harness, writes } = mountHarness(original);
    await act(async () => root.render(<Harness />));

    const trigger = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
      .find((button) => button.textContent?.startsWith('Default'));
    await act(async () => trigger?.click());

    const handles = () => [...host.querySelectorAll<HTMLButtonElement>('button[aria-label^="Drag "]')];
    expect(handles().length).toBe(3);
    expect(host.textContent).toContain('1.');
    expect(host.textContent).toContain('2.');
    expect(host.textContent).toContain('3.');
    expect(host.querySelector(`[role="combobox"][aria-label="${en['settings.retryFallback.targetEffortAria'].replace('{target}', 'openai/o3-mini:high')}"]`)).not.toBeNull();

    handles().forEach((handle, index) => {
      if (handle.parentElement) {
        handle.parentElement.getBoundingClientRect = () => new DOMRect(0, index * 40, 400, 36);
      }
    });

    const lastHandle = handles()[2];
    await act(async () => pressKey(lastHandle, 'Space'));
    await act(async () => pressKey(document, 'ArrowUp'));
    await act(async () => pressKey(document, 'Space'));

    expect(writes).toEqual([
      [{
        id: 'retry.fallbackChains',
        value: {
          default: ['other/original', 'openai/o3-mini:high', '@slow'],
          'other/*': ['@smol'],
        },
        expectedValue: original,
      }],
    ]);
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });

  test('appends wildcard target, updates effort, removes a target, and deletes a chain via CAS', async () => {
    const original = {
      default: ['other/original', '@slow'],
      'other/*': ['openai/o3-mini:high'],
    };
    const { Harness, writes } = mountHarness(original);
    await act(async () => root.render(<Harness />));

    const trigger = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
      .find((button) => button.textContent?.startsWith('other/*'));
    await act(async () => trigger?.click());

    const wildcardInput = host.querySelector<HTMLInputElement>(`input[aria-label="${en['settings.retryFallback.addWildcard']}"]`)!;
    await act(async () => setInputValue(wildcardInput, 'invalid'));
    const addWildcardBtn = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === en['settings.retryFallback.addTargetAction'])!;
    await act(async () => addWildcardBtn.click());
    expect(host.textContent).toContain(en['settings.retryFallback.invalidWildcard']);
    expect(writes.length).toBe(0);

    await act(async () => setInputValue(wildcardInput, 'another-provider/*'));
    await act(async () => addWildcardBtn.click());
    const afterAdd = {
      ...original,
      'other/*': ['openai/o3-mini:high', 'another-provider/*'],
    };
    expect(writes[0]).toEqual([{
      id: 'retry.fallbackChains',
      value: afterAdd,
      expectedValue: original,
    }]);

    // Update effort on openai/o3-mini:high -> low
    const effortTrigger = host.querySelector(`[role="combobox"][aria-label="${en['settings.retryFallback.targetEffortAria'].replace('{target}', 'openai/o3-mini:high')}"]`);
    await act(async () => {
      effortTrigger?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    });
    const lowOption = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((option) => option.textContent === 'Low');
    await act(async () => lowOption?.click());
    const afterEffort = {
      ...original,
      'other/*': ['openai/o3-mini:low', 'another-provider/*'],
    };
    expect(writes[1]).toEqual([{
      id: 'retry.fallbackChains',
      value: afterEffort,
      expectedValue: afterAdd,
    }]);

    // Remove the first target via icon close button
    const removeBtn = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${en['settings.retryFallback.removeTargetAria'].replace('{target}', 'openai/o3-mini:low')}"]`,
    );
    await act(async () => removeBtn?.click());
    const afterRemove = {
      ...original,
      'other/*': ['another-provider/*'],
    };
    expect(writes[2]).toEqual([{
      id: 'retry.fallbackChains',
      value: afterRemove,
      expectedValue: afterEffort,
    }]);

    // Delete the entire other/* chain via disclosure header delete icon button
    const deleteBtn = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${en['settings.retryFallback.deleteChainAria'].replace('{key}', 'other/*')}"]`,
    );
    await act(async () => deleteBtn?.click());
    expect(writes[3]).toEqual([{
      id: 'retry.fallbackChains',
      value: { default: ['other/original', '@slow'] },
      expectedValue: afterRemove,
    }]);
  });

  test('surfaces CAS failure with status-error alert and keeps disclosure open', async () => {
    const { Harness } = mountHarness(
      { 'other/*': ['@smol'] },
      { conflictOnKey: 'other/*' },
    );
    await act(async () => root.render(<Harness />));

    const trigger = [...host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')]
      .find((button) => button.textContent?.startsWith('other/*'));
    await act(async () => trigger?.click());

    const removeBtn = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${en['settings.retryFallback.removeTargetAria'].replace('{target}', '@smol')}"]`,
    );
    await act(async () => removeBtn?.click());

    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(en['settings.omp.saveFailed']);
    expect(alert?.className).toContain('text-[var(--status-error)]');
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
  });

  test('hides add and delete controls when overridden by project configuration', async () => {
    const { Harness } = mountHarness({ 'other/*': ['@smol'] }, { overridden: true });
    await act(async () => root.render(<Harness />));

    expect(host.textContent).toContain(en['settings.retryFallback.overridden']);
    expect([...host.querySelectorAll('button')].some((button) => button.textContent?.includes(en['settings.retryFallback.addChain']))).toBe(false);
    expect(host.querySelector(`button[aria-label="${en['settings.retryFallback.deleteChainAria'].replace('{key}', 'other/*')}"]`)).toBeNull();
  });
});
