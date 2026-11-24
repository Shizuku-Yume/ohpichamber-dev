import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { Model, OmpSettingsState } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

const { I18nProvider } = await import('@/lib/i18n');
const { ModelRoleLinkRow } = await import('./ModelRoleLinkRow');
const { GitSettings } = await import('@/components/sections/openchamber/GitSettings');
const { MemoryPage } = await import('@/components/sections/memory/MemoryPage');
const omp = await import('@/components/sections/shared/useOmpPageSettings');
const dir = await import('@/hooks/useSettingsDirectory');
const modelsHook = await import('@/hooks/useSettingsModels');

const models: readonly Model[] = [
  {
    provider: 'CLIProxyAPI',
    modelId: 'devin-swe-2',
    name: 'Devin SWE-2',
    modalities: ['text'],
    contextWindow: 200000,
    maxOutputTokens: 32000,
    reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'max', label: 'Max', budgetTokens: 32000 }],
    variants: [],
    pricing: null,
  },
];

const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;

beforeEach(() => {
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
});

afterAll(() => {
  container.remove();
  browser.close();
});

test('ModelRoleLinkRow formats raw selectors cleanly and renders an outline xs Button with arrow-right icon', async () => {
  let clicks = 0;
  await act(async () => {
    root.render(
      <I18nProvider>
        <ModelRoleLinkRow
          label="Voice model"
          value="CLIProxyAPI/devin-swe-2:max, backup/other"
          models={models}
          linkLabel="Open Voice settings"
          onOpen={() => {
            clicks += 1;
          }}
          settingsItem="test.role-link"
        />
      </I18nProvider>,
    );
  });

  const row = container.querySelector('[data-settings-item="test.role-link"]');
  expect(row).not.toBeNull();
  expect(row?.textContent).toContain('Devin SWE-2 · Max +1');
  expect(row?.textContent).not.toContain('CLIProxyAPI/devin-swe-2:max');

  const button = row?.querySelector<HTMLButtonElement>('button[data-slot="button"][data-size="xs"]');
  expect(button).not.toBeNull();
  expect(button?.textContent).toBe('Open Voice settings');
  expect(button?.className).not.toContain('underline');
  expect(button?.querySelector('svg')).not.toBeNull();

  await act(async () => {
    button?.click();
  });
  expect(clicks).toBe(1);
});

test('ModelRoleLinkRow strips provider prefix when model is not in catalog', async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <ModelRoleLinkRow
          label="Web search"
          value="CLIProxyAPI/foo:max"
          models={models}
          linkLabel="Set in Web search"
          onOpen={() => {}}
        />
      </I18nProvider>,
    );
  });

  expect(container.textContent).toContain('foo · Max');
  expect(container.textContent).not.toContain('CLIProxyAPI/foo:max');
});

test('ModelRoleLinkRow formats RetryFallbackChains arrow-separated chain cleanly', async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <ModelRoleLinkRow
          label="Web search"
          value="web/exa → web/tavily"
          models={models}
          linkLabel="Set in Web search"
          onOpen={() => {}}
        />
      </I18nProvider>,
    );
  });
  expect(container.textContent).toContain('web/exa → web/tavily');
});

test('GitSettings renders inline commit ModelRoleEditor without ModelRoleLinkRow', async () => {
  const state: OmpSettingsState = {
    workspaceId: 'ws_1',
    revision: '1',
    totalCount: 1,
    settings: [{
      id: 'modelRoles',
      type: 'record' as const,
      default: {},
      configured: true,
      value: { commit: 'CLIProxyAPI/devin-swe-2:max' },
      placement: { type: 'owned-by' as const, owner: 'model-roles.section.chat' },
    }],
  };
  const dirSpy = spyOn(dir, 'useSettingsDirectory').mockReturnValue('/repo');
  const modelsSpy = spyOn(modelsHook, 'useSettingsModels').mockReturnValue([...models]);
  const ompSpy = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
    state,
    form: {},
    loading: false,
    saving: false,
    pageSettings: [],
    getSectionSettings: () => [],
    updateSetting: async () => {},
    updateSettings: async () => true,
  });
  try {
    await act(async () => {
      root.render(
        <I18nProvider>
          <GitSettings />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[data-settings-item="omp.modelRoles.commit"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Set in Model roles')).toBeUndefined();
    expect(container.textContent).toContain('devin-swe-2');
    expect(container.textContent).toContain('Max');
    expect(container.querySelector('[data-slot="dropdown-menu-trigger"]')).not.toBeNull();
  } finally {
    ompSpy.mockRestore();
    modelsSpy.mockRestore();
    dirSpy.mockRestore();
  }
});

test('MemoryPage renders inline memory ModelRoleEditor when memory backend is enabled', async () => {
  const state: OmpSettingsState = {
    workspaceId: 'ws_1',
    revision: '1',
    totalCount: 2,
    settings: [
      {
        id: 'memory.backend',
        type: 'enum' as const,
        default: 'off',
        configured: true,
        value: 'mnemopi',
        options: [{ value: 'off', label: 'Off' }, { value: 'mnemopi', label: 'Mnemopi' }],
        placement: { type: 'page' as const, page: 'memory', section: 'backend' },
      },
      {
        id: 'modelRoles',
        type: 'record' as const,
        default: {},
        configured: true,
        value: { memory: 'CLIProxyAPI/devin-swe-2:max' },
        placement: { type: 'owned-by' as const, owner: 'model-roles.section.chat' },
      },
    ],
  };
  const dirSpy = spyOn(dir, 'useSettingsDirectory').mockReturnValue('/repo');
  const modelsSpy = spyOn(modelsHook, 'useSettingsModels').mockReturnValue([...models]);
  const ompSpy = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
    state,
    form: { 'memory.backend': 'mnemopi' },
    loading: false,
    saving: false,
    pageSettings: [state.settings[0]],
    getSectionSettings: () => [state.settings[0]],
    updateSetting: async () => {},
    updateSettings: async () => true,
  });
  try {
    await act(async () => {
      root.render(
        <I18nProvider>
          <MemoryPage />
        </I18nProvider>,
      );
    });
    expect(container.querySelector('[data-settings-item="omp.modelRoles.memory"]')).toBeNull();
    expect(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Set in Model roles')).toBeUndefined();
    expect(container.textContent).toContain('devin-swe-2');
    expect(container.textContent).toContain('Max');
    expect(container.querySelector('[data-slot="dropdown-menu-trigger"]')).not.toBeNull();
  } finally {
    ompSpy.mockRestore();
    modelsSpy.mockRestore();
    dirSpy.mockRestore();
  }
});
