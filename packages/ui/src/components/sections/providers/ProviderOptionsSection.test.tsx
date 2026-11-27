import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { OmpSetting, OmpSettingsState, OmpSettingsUpdateRequest } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

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

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { canonicalClient } = await import('@/api/canonicalClient');
const { ProviderOptionsSection } = await import('./ProviderOptionsSection');

const WORKSPACE = { workspaceId: 'ws_providers', projectId: 'project_1', name: 'repo' };

const allProviderSettings = (overrides: Partial<Record<string, Partial<OmpSetting>>> = {}): OmpSetting[] => {
  const base: OmpSetting[] = [
    {
      id: 'tier.openai',
      type: 'enum',
      value: 'none',
      default: 'none',
      configured: false,
      label: 'Service Tier — OpenAI',
      options: [
        { value: 'none', label: 'None' },
        { value: 'priority', label: 'Priority' },
      ],
      placement: { type: 'page', page: 'providers', section: 'service-tier' },
    },
    {
      id: 'tier.anthropic',
      type: 'enum',
      value: 'none',
      default: 'none',
      configured: false,
      label: 'Service Tier — Anthropic',
      options: [
        { value: 'none', label: 'None' },
        { value: 'priority', label: 'Priority' },
      ],
      placement: { type: 'page', page: 'providers', section: 'service-tier' },
    },
    {
      id: 'tier.google',
      type: 'enum',
      value: 'none',
      default: 'none',
      configured: false,
      label: 'Service Tier — Google',
      options: [
        { value: 'none', label: 'None' },
        { value: 'flex', label: 'Flex' },
        { value: 'priority', label: 'Priority' },
      ],
      placement: { type: 'page', page: 'providers', section: 'service-tier' },
    },
    {
      id: 'providers.fireworksTier',
      type: 'enum',
      value: 'standard',
      default: 'standard',
      configured: false,
      label: 'Fireworks Tier',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'priority', label: 'Priority' },
      ],
      placement: { type: 'page', page: 'providers', section: 'service-tier' },
    },
    {
      id: 'providers.kimiApiFormat',
      type: 'enum',
      value: 'auto',
      default: 'auto',
      configured: false,
      label: 'Kimi API Format',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'openai', label: 'OpenAI' },
        { value: 'anthropic', label: 'Anthropic' },
      ],
      placement: { type: 'page', page: 'providers', section: 'protocol' },
    },
    {
      id: 'providers.openaiWebsockets',
      type: 'enum',
      value: 'auto',
      default: 'auto',
      configured: false,
      label: 'OpenAI Codex WebSockets',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'off', label: 'Off' },
        { value: 'on', label: 'On' },
      ],
      placement: { type: 'page', page: 'providers', section: 'protocol' },
    },
    {
      id: 'providers.openaiResponsesWebsockets',
      type: 'boolean',
      value: false,
      default: false,
      configured: false,
      label: 'OpenAI Responses WebSockets',
      placement: { type: 'page', page: 'providers', section: 'protocol' },
    },
    {
      id: 'providers.openaiLiveSteering',
      type: 'boolean',
      value: false,
      default: false,
      configured: false,
      label: 'OpenAI Live Steering',
      placement: { type: 'page', page: 'providers', section: 'protocol' },
    },
    {
      id: 'providers.openrouterVariant',
      type: 'enum',
      value: 'default',
      default: 'default',
      configured: false,
      label: 'OpenRouter Routing',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'nitro', label: ':nitro' },
        { value: 'floor', label: ':floor' },
        { value: 'online', label: ':online' },
        { value: 'exacto', label: ':exacto' },
      ],
      placement: { type: 'page', page: 'providers', section: 'protocol' },
    },
  ];
  return base.map((entry) => ({ ...entry, ...(overrides[entry.id] ?? {}) }));
};

const makeState = (revision: string, settings: OmpSetting[]): OmpSettingsState => ({
  workspaceId: WORKSPACE.workspaceId,
  revision,
  totalCount: settings.length,
  settings,
});

const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
const restores: Array<{ mockRestore(): void }> = [];
let updates: Array<{ workspaceId: string; request: OmpSettingsUpdateRequest }> = [];

const flushMicrotasks = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  updates = [];
  useProjectsStore.setState({
    projects: [{ id: 'project_1', path: '/repo', label: 'repo' }],
    activeProjectId: 'project_1',
  });
  useUIStore.setState({ settingsProjectPath: '/repo' });
  root = createRoot(container);
});

afterEach(async () => {
  while (restores.length > 0) restores.pop()?.mockRestore();
  await act(async () => root.unmount());
  container.replaceChildren();
});

afterAll(() => browser.close());

const render = async (providerId: string) => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <ProviderOptionsSection providerId={providerId} />
      </I18nProvider>,
    );
  });
  await flushMicrotasks();
};

test('renders only the open provider rows and persists changes with the expected id and value', async () => {
  let snapshot = makeState('1', allProviderSettings());
  restores.push(
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue(WORKSPACE),
    spyOn(canonicalClient, 'getOmpSettings').mockImplementation(async () => snapshot),
    spyOn(canonicalClient, 'updateOmpSettings').mockImplementation(async (workspaceId, request) => {
      updates.push({ workspaceId, request });
      const nextSettings = snapshot.settings.map((entry) => {
        const change = request.changes.find((item) => item.id === entry.id);
        return change ? { ...entry, value: change.value, configured: true } : entry;
      });
      snapshot = makeState('2', nextSettings);
      return snapshot;
    }),
  );

  await render('openai');

  const anchors = Array.from(container.querySelectorAll<HTMLElement>('[data-settings-item]'))
    .map((el) => el.getAttribute('data-settings-item'));
  expect(anchors).toEqual(['omp.tier.openai', 'omp.providers.openaiResponsesWebsockets']);
  expect(container.querySelector('[data-settings-item="omp.tier.anthropic"]')).toBeNull();
  expect(container.querySelector('[data-settings-item="omp.providers.openaiWebsockets"]')).toBeNull();
  expect(container.querySelector('[data-settings-item="omp.providers.kimiApiFormat"]')).toBeNull();

  const toggleRow = container.querySelector<HTMLElement>('[data-settings-item="omp.providers.openaiResponsesWebsockets"]');
  const checkbox = toggleRow?.querySelector<HTMLButtonElement>('[role="checkbox"]');
  expect(checkbox).not.toBeNull();

  await act(async () => {
    checkbox!.click();
  });
  await flushMicrotasks();

  expect(updates).toEqual([
    {
      workspaceId: WORKSPACE.workspaceId,
      request: {
        expectedRevision: '1',
        changes: [{ id: 'providers.openaiResponsesWebsockets', value: true }],
      },
    },
  ]);

  const tierRow = container.querySelector<HTMLElement>('[data-settings-item="omp.tier.openai"]');
  expect(tierRow).not.toBeNull();
  const trigger = tierRow!.querySelector<HTMLElement>('[role="combobox"]');
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
  const priorityOption = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
    .find((option) => option.textContent?.includes('Priority'));
  expect(priorityOption).toBeDefined();

  await act(async () => {
    priorityOption!.click();
  });
  await flushMicrotasks();
  expect(updates[1]).toEqual({
    workspaceId: WORKSPACE.workspaceId,
    request: {
      expectedRevision: '2',
      changes: [{ id: 'tier.openai', value: 'priority' }],
    },
  });
});

test('renders nothing for a provider with no mapped options', async () => {
  restores.push(
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue(WORKSPACE),
    spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(makeState('1', allProviderSettings())),
  );

  await render('unknown-provider');
  expect(container.innerHTML).toBe('');
});

test('omits rows whose conditionActive is false and hides section when none remain', async () => {
  restores.push(
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue(WORKSPACE),
    spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(
      makeState('1', allProviderSettings({
        'tier.anthropic': { condition: 'customGate', conditionActive: false },
      })),
    ),
  );

  await render('anthropic');
  expect(container.querySelector('[data-settings-item="omp.tier.anthropic"]')).toBeNull();
  expect(container.innerHTML).toBe('');
});

test('shows loading status while settings fetch is pending and shows load failure rather than empty success', async () => {
  const pendingLoad = Promise.withResolvers<OmpSettingsState>();
  restores.push(
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue(WORKSPACE),
    spyOn(canonicalClient, 'getOmpSettings').mockImplementation(() => pendingLoad.promise),
  );

  await render('anthropic');
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Loading...');

  const consoleWarn = spyOn(console, 'warn').mockImplementation(() => undefined);
  restores.push(consoleWarn);

  await act(async () => {
    pendingLoad.reject(new Error('network down'));
    await Promise.resolve();
    await Promise.resolve();
  });
  await flushMicrotasks();

  expect(container.innerHTML).not.toBe('');
  expect(container.querySelector('[role="status"]')?.textContent).toBe('Could not read OMP\'s settings.');
});
