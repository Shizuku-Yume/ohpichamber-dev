import './testDom';
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type {
  InstalledPluginEntry,
  LocalExtensionEntry,
  LocalExtensionSource,
  PluginCatalogState,
  PluginConfigureRequest,
  PluginMutationResult,
  PluginRuntimeState,
} from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { fetchSpy, installTestDomGlobals, testBrowser } from './testDom';

// React DOM detects event support (including change events) when it is
// imported, so the happy-dom globals must already exist. Static imports of
// createRoot would load react-dom before this module's body runs.
const { act } = await import('react');
installTestDomGlobals();
mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/repo' }));
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const { getRuntimeKey } = await import('@/lib/runtime-switch');
const { usePluginsStore } = await import('@/stores/usePluginsStore');
const { useUIStore } = await import('@/stores/useUIStore');
const { PluginsPage } = await import('./PluginsPage');

const workspaceId = 'workspace_one';
const worker = { rootSessionId: 'session_one', workspaceId, workerGeneration: 'generation_one' };
const readyWorker: PluginRuntimeState = { worker, status: 'ready', appliedRevision: '3', error: null };
const extension: LocalExtensionEntry = { extensionId: 'example.ts', relativePath: '.omp/extensions/example.ts' };
const plugin: InstalledPluginEntry = {
  id: 'plugin_example',
  target: { kind: 'package', name: 'example-plugin' },
  name: 'example-plugin',
  version: '1.2.3',
  description: 'Example plugin',
  scope: 'global',
  enabled: true,
  enabledFeatures: null,
  settingsScope: 'global',
  globalSettings: {},
  settings: {},
  settingDefinitions: [{
    key: 'token',
    description: 'API token',
    type: 'string',
    secret: true,
    configured: true,
    globalConfigured: true,
    overridden: false,
  }],
};
const emptyCatalog: PluginCatalogState = {
  workspaceId,
  revision: '3',
  plugins: [],
  marketplace: [],
  localExtensions: [],
  workers: [],
};

installTestDomGlobals();
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;

beforeEach(async () => {
  await useI18nStore.getState().setLocale('en');
  useUIStore.setState({ settingsProjectPath: null });
  container.innerHTML = '';
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  usePluginsStore.setState(usePluginsStore.getInitialState(), true);
});
afterAll(() => {
  fetchSpy.mockRestore();
  testBrowser.close();
});

const settle = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await act(async () => { await promise; });
};

/** Let effects and their rejection handlers publish before asserting on them. */
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 10);
    await act(async () => { await promise; });
    if (predicate()) return;
  }
};

test('applying plugin changes only calls the native apply after the confirmation dialog is accepted', async () => {
  let applies = 0;
  const applied: PluginMutationResult = {
    workspaceId, revision: '3', persistence: 'committed', status: 'no-active-workers', workers: [],
    catalog: { ...emptyCatalog, workers: [readyWorker] },
  };
  usePluginsStore.setState({
    catalog: { ...emptyCatalog, workers: [readyWorker] },
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: false,
    error: null,
    isMutating: false,
    lastMutation: null,
    doctor: null,
    loadPlugins: async () => true,
    applyPlugins: async () => {
      applies += 1;
      return applied;
    },
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });

  const applyButton = Array.from(container.querySelectorAll('button'))
    .find(button => button.textContent?.trim() === 'Restart idle sessions to apply');
  if (!applyButton) throw new Error('Missing runtime apply action');
  const applyActionName = applyButton.textContent?.trim();
  await act(async () => { applyButton.dispatchEvent(new Event('click', { bubbles: true })); });
  await settle();

  expect(applies).toBe(0);
  const dialog = document.querySelector('[data-slot="dialog-content"]');
  if (!dialog) throw new Error('Missing apply confirmation dialog');

  const confirm = Array.from(dialog.querySelectorAll('button'))
    .find(button => !button.matches('[data-slot="dialog-close"]') && button.textContent?.trim() === applyActionName);
  if (!confirm) throw new Error('Missing apply confirmation action');
  await act(async () => { confirm.dispatchEvent(new Event('click', { bubbles: true })); });
  await waitFor(() => applies === 1);

  expect(applies).toBe(1);
});

test('a local extension read failure keeps the failure visible and retry reloads the source', async () => {
  let reads = 0;
  usePluginsStore.setState({
    catalog: { ...emptyCatalog, localExtensions: [extension] },
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: false,
    error: null,
    isMutating: false,
    lastMutation: null,
    doctor: null,
    loadPlugins: async () => true,
    readLocalExtension: async (extensionId: string): Promise<LocalExtensionSource> => {
      reads += 1;
      if (reads === 1) throw new Error('denied');
      return { workspaceId, revision: '3', extension: { ...extension, extensionId }, content: 'export default 1;' };
    },
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });

  const card = Array.from(container.querySelectorAll('button'))
    .find(button => button.textContent?.includes(extension.extensionId));
  if (!card) throw new Error('Missing local extension card');
  await act(async () => { card.dispatchEvent(new Event('click', { bubbles: true })); });
  await waitFor(() => container.querySelector('[role="alert"]') !== null);

  const failure = container.querySelector('[role="alert"]');
  if (!failure) throw new Error('Missing local extension load failure');
  const failedEditor = container.querySelector<HTMLTextAreaElement>('#native-local-extension-content');
  expect(failedEditor?.disabled).toBe(true);
  const retry = failure.querySelector('button');
  if (!retry) throw new Error('Missing local extension retry');
  await act(async () => { retry.dispatchEvent(new Event('click', { bubbles: true })); });
  await settle();
  await settle();

  expect(reads).toBe(2);
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain('.omp/extensions/example.ts');
  const editor = container.querySelector<HTMLTextAreaElement>('#native-local-extension-content');
  expect(editor?.value).toBe('export default 1;');
  expect(editor?.disabled).toBe(false);
});

test('a secret setting is written as a private configure value and never enters the settings JSON', async () => {
  const writes: Array<Omit<PluginConfigureRequest, 'expectedRevision'>> = [];
  const configured: PluginMutationResult = {
    workspaceId, revision: '4', persistence: 'committed', status: 'no-active-workers', workers: [],
    catalog: { ...emptyCatalog, revision: '4', plugins: [plugin] },
  };
  usePluginsStore.setState({
    catalog: { ...emptyCatalog, plugins: [plugin] },
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: false,
    error: null,
    isMutating: false,
    lastMutation: null,
    doctor: null,
    loadPlugins: async () => true,
    configurePlugin: async (input: Omit<PluginConfigureRequest, 'expectedRevision'>) => {
      writes.push(input);
      return configured;
    },
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });

  const card = Array.from(container.querySelectorAll('button'))
    .find(button => button.textContent?.includes(plugin.name) && button.textContent?.includes(plugin.version));
  if (!card) throw new Error('Missing plugin card');
  await act(async () => { card.dispatchEvent(new Event('click', { bubbles: true })); });
  await settle();

  const secret = container.querySelector<HTMLInputElement>('input[type="password"]');
  if (!secret) throw new Error('Missing write-only secret input');
  expect(secret.disabled).toBe(false);
  const inputWindow = secret.ownerDocument.defaultView;
  if (!inputWindow) throw new Error('Missing secret input window');
  const setter = Object.getOwnPropertyDescriptor(inputWindow.HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing input setter');
  await act(async () => {
    setter.call(secret, 'top-secret');
    secret.dispatchEvent(new inputWindow.Event('input', { bubbles: true, composed: true }));
  });
  await settle();
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });
  await settle();
  const renderedSecret = container.querySelector<HTMLInputElement>('input[type="password"]');
  expect(renderedSecret).toBe(secret);
  expect(renderedSecret?.value).toBe('top-secret');
  expect(writes).toHaveLength(0);

  await act(async () => {
    secret.dispatchEvent(new inputWindow.FocusEvent('focusout', { bubbles: true, composed: true }));
  });
  await waitFor(() => writes.length === 1);

  expect(writes).toHaveLength(1);
  expect(writes[0].settingsScope).toBe('global');
  expect(writes[0].settings).toEqual({ token: 'top-secret' });
  expect(writes[0].target).toEqual({ kind: 'package', name: plugin.name });
  const jsonEditor = container.querySelector<HTMLTextAreaElement>('#native-plugin-settings');
  expect(jsonEditor).not.toBeNull();
  expect(jsonEditor?.value ?? '').not.toContain('top-secret');
  expect(secret.value).toBe('');
});
