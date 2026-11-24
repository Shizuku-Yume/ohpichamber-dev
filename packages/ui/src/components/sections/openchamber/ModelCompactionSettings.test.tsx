import React from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { OmpSettingsChange, OmpSettingsState } from '@openchamber/agent-contract';

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
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  MouseEvent: browser.MouseEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  IntersectionObserver: class {
    observe() { }
    unobserve() { }
    disconnect() { }
  },
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// React DOM must evaluate after happy-dom installs browser globals into globalThis.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { toConfigDirectoryKey } = await import('@/stores/config/directories');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { ModelCompactionSettings } = await import('./ModelCompactionSettings');

function makeState(
  thresholds: Record<string, string | number>,
  options: { enabled?: boolean; mapOverridden?: boolean; toggleOverridden?: boolean } = {},
): OmpSettingsState {
  const { enabled = true, mapOverridden = false, toggleOverridden = false } = options;
  return {
    workspaceId: 'workspace_1',
    revision: '1',
    totalCount: 2,
    settings: [
      {
        id: 'compaction.modelThresholds',
        type: 'record',
        value: thresholds,
        default: {},
        configured: Object.keys(thresholds).length > 0,
        placement: { type: 'owned-by', owner: 'sessions.model-compaction' },
        conditionActive: !mapOverridden,
      },
      {
        id: 'compaction.modelThresholdsEnabled',
        type: 'boolean',
        value: enabled,
        default: true,
        configured: !enabled,
        placement: { type: 'owned-by', owner: 'sessions.model-compaction' },
        conditionActive: !toggleOverridden,
      },
    ],
  };
}


function setInputValue(input: HTMLInputElement, nextValue: string) {
  const setter = Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing HTMLInputElement value setter');
  setter.call(input, nextValue);
  input.dispatchEvent(new browser.Event('input', { bubbles: true }) as unknown as Event);
}

describe('ModelCompactionSettings', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useProjectsStore.setState({ projects: [], activeProjectId: null });
    useDirectoryStore.setState({ currentDirectory: '/repo' });
    useConfigStore.setState({
      activeDirectoryKey: toConfigDirectoryKey('/repo'),
      providersLoaded: true,
      providers: [
        {
          providerId: 'openai',
          name: 'OpenAI',
          endpoint: null,
          protocol: null,
          authMethods: ['api-key'],
          auth: { status: 'missing' },
          models: [
            {
              modelId: 'o3-mini',
              provider: 'openai',
              name: 'o3-mini',
              modalities: ['text'],
              contextWindow: 200000,
              maxOutputTokens: 64000,
              reasoningEffortSupported: true,
              reasoningOptions: [],
              variants: [],
              pricing: null,
            },
          ],
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
    initialThresholds: Record<string, string | number>,
    options: {
      enabled?: boolean;
      mapOverridden?: boolean;
      toggleOverridden?: boolean;
      shouldFail?: () => boolean;
    } = {},
  ) {
    const writes: OmpSettingsChange[][] = [];
    let currentState = makeState(initialThresholds, options);

    const Harness = () => {
      const [state, setState] = React.useState(currentState);
      const updateSettings = async (makeChanges: (latest: OmpSettingsState) => OmpSettingsChange[]) => {
        const changes = makeChanges(state);
        writes.push(changes);
        if (options.shouldFail?.()) return false;
        const nextSettings = state.settings.map((setting) => {
          const match = changes.find((change) => change.id === setting.id);
          return match ? { ...setting, value: match.value } : setting;
        });
        currentState = { ...state, settings: nextSettings };
        setState(currentState);
        return true;
      };
      return (
        <I18nProvider>
          <ModelCompactionSettings state={state} saving={false} updateSettings={updateSettings} />
        </I18nProvider>
      );
    };

    return {
      writes,
      render: async () => {
        await act(async () => root.render(<Harness />));
      },
    };
  }

  test('renders flat disclosure rows and outline Add rule button with no forms or manual Save buttons', async () => {
    const { render } = mountHarness({ 'example/*': '80%', 'other/model': 'f90000', 'openai/o3-mini': 80000 });
    await render();

    expect(host.querySelector('form')).toBeNull();
    const buttonTexts = Array.from(host.querySelectorAll('button')).map((button) => button.textContent?.trim());
    expect(buttonTexts).toContain('Add rule');
    expect(buttonTexts.some((text) => text?.toLowerCase().includes('save'))).toBe(false);

    expect(host.textContent).toContain('example/*');
    expect(host.textContent).toContain('80%');
    expect(host.textContent).toContain('other/model');
    expect(host.textContent).toContain('Fixed: 90000 tokens');
    expect(host.textContent).toContain('openai/o3-mini');
    expect(host.textContent).toContain('80000 tokens');
  });

  test.each([
    ['Percentage', '75', '75%', false],
    ['Token limit', '84000', 84000, true],
    ['Fixed token trigger', 'f84000', 'f84000', true],
  ])('adding a %s rule via dialog preserves existing native rules and enforces token cost warning', async (
    modeLabel,
    inputNumber,
    expectedValue,
    needsConfirmation,
  ) => {
    const existing = { 'example/*': '80%', 'other/model': 'f90000' };
    const { render, writes } = mountHarness(existing);
    await render();

    const addButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Add rule'));
    expect(addButton).toBeDefined();
    await act(async () => addButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('form')).toBeNull();

    const selectorInput = dialog?.querySelector<HTMLInputElement>('input[aria-label="Model selector"]');
    expect(selectorInput).not.toBeNull();
    await act(async () => {
      if (selectorInput) setInputValue(selectorInput, 'example/model');
    });

    if (modeLabel !== 'Percentage') {
      const modeTrigger = dialog?.querySelector<HTMLElement>('[aria-label="Threshold mode"]');
      expect(modeTrigger).not.toBeNull();
      await act(async () => modeTrigger?.click());
      const option = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
        (el) => el.textContent?.trim() === modeLabel,
      );
      expect(option).toBeDefined();
      await act(async () => option?.click());
    }

    const numericDigits = inputNumber.replace(/^f/i, '');
    const valueInput = dialog?.querySelector<HTMLInputElement>('input[aria-label="Compaction threshold"]');
    expect(valueInput).not.toBeNull();
    await act(async () => {
      if (valueInput) setInputValue(valueInput, numericDigits);
    });

    const submitButton = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Add rule',
    );
    expect(submitButton).toBeDefined();
    await act(async () => submitButton?.click());

    if (needsConfirmation) {
      expect(writes).toHaveLength(0);
      expect(document.body.textContent).toContain('Longer requests may cost more.');
      const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.trim() === 'Cancel',
      );
      expect(cancel).toBeDefined();
      await act(async () => cancel?.click());
      expect(writes).toHaveLength(0);
      // Dialog stays open after cancelling confirmation.
      expect(document.body.querySelector('input[aria-label="Model selector"]')).not.toBeNull();

      await act(async () => submitButton?.click());
      const confirmButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent?.trim().toLowerCase() === 'save changes',
      );
      expect(confirmButton).toBeDefined();
      await act(async () => confirmButton?.click());
    }

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([
      {
        id: 'compaction.modelThresholds',
        value: { ...existing, 'example/model': expectedValue },
        expectedValue: existing,
      },
    ]);
    expect(document.body.querySelector('input[aria-label="Model selector"]')).toBeNull();
  });

  test('dialog validates duplicate and invalid selectors with status-error alert and supports ModelSelector', async () => {
    const existing = { 'example/*': '80%' };
    const { render, writes } = mountHarness(existing);
    await render();

    const addButton = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('Add rule'));
    await act(async () => addButton?.click());

    const dialog = document.body.querySelector('[role="dialog"]');
    const selectorInput = dialog?.querySelector<HTMLInputElement>('input[aria-label="Model selector"]');
    const submitButton = Array.from(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Add rule',
    );

    // Invalid selector without slash.
    await act(async () => {
      if (selectorInput) setInputValue(selectorInput, 'invalid-selector');
    });
    await act(async () => submitButton?.click());
    const invalidAlert = dialog?.querySelector('[role="alert"]');
    expect(invalidAlert?.textContent).toContain('provider/*');
    expect(invalidAlert?.className).toContain('text-[var(--status-error)]');
    expect(writes).toHaveLength(0);

    // Duplicate selector.
    await act(async () => {
      if (selectorInput) setInputValue(selectorInput, 'example/*');
    });
    const dupAlert = dialog?.querySelector('[role="alert"]');
    expect(dupAlert?.textContent).toBe('This model selector already has a rule.');
    expect(submitButton?.disabled).toBe(true);

    // Selecting from ModelSelector fills the selector input.
    const modelTrigger = Array.from(dialog?.querySelectorAll<HTMLElement>('[data-slot="dropdown-menu-trigger"]') ?? [])[0];
    expect(modelTrigger?.textContent).toContain('Choose a model');
    await act(async () => {
      modelTrigger?.dispatchEvent(new browser.PointerEvent('pointerdown', { bubbles: true, button: 0 }) as unknown as Event);
      modelTrigger?.click();
    });
    const modelOption = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (el) => el.textContent?.includes('o3-mini'),
    );
    expect(modelOption).toBeDefined();
    await act(async () => modelOption?.click());
    expect(selectorInput?.value).toBe('openai/o3-mini');

    await act(async () => submitButton?.click());
    expect(writes).toHaveLength(1);
    expect(writes[0]?.[0]).toEqual({
      id: 'compaction.modelThresholds',
      value: { 'example/*': '80%', 'openai/o3-mini': '80%' },
      expectedValue: existing,
    });
  });

  test('editing an existing disclosure rule CAS-saves immediately on blur and mode switch, and accessory deletes', async () => {
    const existing = { 'example/*': '80%', 'openai/o3-mini': 80000 };
    const { render, writes } = mountHarness(existing);
    await render();

    const rowToggle = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')).find(
      (button) => button.textContent?.includes('example/*'),
    );
    expect(rowToggle).toBeDefined();
    await act(async () => rowToggle?.click());

    const thresholdInput = host.querySelector<HTMLInputElement>('input[aria-label="Compaction threshold"]');
    expect(thresholdInput?.value).toBe('80');
    await act(async () => {
      if (thresholdInput) {
        setInputValue(thresholdInput, '65');
        thresholdInput.dispatchEvent(new browser.FocusEvent('focusout', { bubbles: true }) as unknown as Event);
      }
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual([
      {
        id: 'compaction.modelThresholds',
        value: { 'example/*': '65%', 'openai/o3-mini': 80000 },
        expectedValue: existing,
      },
    ]);

    // Switching existing percentage rule to Token limit prompts confirmation; cancelling keeps 65%.
    const modeTrigger = host.querySelector<HTMLElement>('[aria-label="Threshold mode"]');
    await act(async () => modeTrigger?.click());
    const tokenOption = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (el) => el.textContent?.trim() === 'Token limit',
    );
    await act(async () => tokenOption?.click());
    expect(document.body.textContent).toContain('Longer requests may cost more.');
    const cancel = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Cancel',
    );
    await act(async () => cancel?.click());
    expect(writes).toHaveLength(1);

    // Editing an existing token rule does not re-prompt cost confirmation.
    const tokenToggle = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')).find(
      (button) => button.textContent?.includes('openai/o3-mini'),
    );
    await act(async () => tokenToggle?.click());
    const tokenInput = host.querySelector<HTMLInputElement>('input[aria-label="Compaction threshold"]');
    await act(async () => {
      if (tokenInput) {
        setInputValue(tokenInput, '85000');
        tokenInput.dispatchEvent(new browser.FocusEvent('focusout', { bubbles: true }) as unknown as Event);
      }
    });
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual([
      {
        id: 'compaction.modelThresholds',
        value: { 'example/*': '65%', 'openai/o3-mini': 85000 },
        expectedValue: { 'example/*': '65%', 'openai/o3-mini': 80000 },
      },
    ]);

    // Deleting via accessory button removes only that selector.
    const deleteButton = host.querySelector<HTMLButtonElement>('button[aria-label="Delete rule for example/*"]');
    expect(deleteButton).not.toBeNull();
    await act(async () => deleteButton?.click());
    expect(writes).toHaveLength(3);
    expect(writes[2]).toEqual([
      {
        id: 'compaction.modelThresholds',
        value: { 'openai/o3-mini': 85000 },
        expectedValue: { 'example/*': '65%', 'openai/o3-mini': 85000 },
      },
    ]);
    expect(host.textContent).not.toContain('example/*');
  });

  test('surfaces save failure with var(--status-error) and hides add/delete when overridden', async () => {
    let failWrites = true;
    const { render } = mountHarness({ 'example/*': '80%' }, { shouldFail: () => failWrites });
    await render();

    const deleteButton = host.querySelector<HTMLButtonElement>('button[aria-label="Delete rule for example/*"]');
    await act(async () => deleteButton?.click());
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Could not save OMP's settings.");
    expect(alert?.className).toContain('text-[var(--status-error)]');
    expect(host.textContent).toContain('example/*');

    failWrites = false;
    const overriddenHarness = mountHarness({ 'example/*': '80%' }, { mapOverridden: true });
    await overriddenHarness.render();
    expect(host.textContent).toContain('Native configuration overrides this shared setting for this project.');
    expect(host.querySelector('button[aria-label="Delete rule for example/*"]')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).some((button) => button.textContent?.includes('Add rule'))).toBe(false);
  });

  test('enabling model thresholds with existing token rules confirms cost warning and surfaces toggle failure', async () => {
    let failToggle = false;
    const { render, writes } = mountHarness(
      { 'openai/o3-mini': 80000 },
      { enabled: false, shouldFail: () => failToggle },
    );
    await render();

    const checkboxRow = host.querySelector<HTMLElement>('[data-settings-item="sessions.model-compaction"]');
    expect(checkboxRow).not.toBeNull();
    await act(async () => checkboxRow?.click());
    expect(writes).toHaveLength(0);
    expect(document.body.textContent).toContain('Longer requests may cost more.');

    const confirmButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim().toLowerCase() === 'save changes',
    );
    await act(async () => confirmButton?.click());
    expect(writes).toEqual([[{ id: 'compaction.modelThresholdsEnabled', value: true }]]);

    failToggle = true;
    await act(async () => checkboxRow?.click());
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Could not save OMP's settings.");
    expect(alert?.className).toContain('text-[var(--status-error)]');
  });
});
