import './testDom';
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type {
  ExtensionInventory,
  ExtensionItem,
  InstalledPluginEntry,
  LocalExtensionEntry,
  LocalExtensionSource,
  PluginCatalogState,
  PluginConfigureRequest,
  PluginLifecycleState,
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
const emptyInventory: PluginCatalogState['extensions'] = { providers: [], items: [], warnings: [], kinds: [] };
const emptyCatalog: PluginCatalogState = {
  workspaceId,
  revision: '3',
  plugins: [],
  marketplace: [],
  localExtensions: [],
  workers: [],
  marketplaceSources: [],
  availableUpdates: [],
  extensions: emptyInventory,
};

installTestDomGlobals();
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;

beforeEach(async () => {
  installTestDomGlobals();
  await useI18nStore.getState().setLocale('en');
  useUIStore.setState({ settingsProjectPath: null });
  document.querySelectorAll('[data-slot="dialog-content"], [data-slot="dialog-overlay"]').forEach(el => el.remove());
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

test('offline plugin settings say when changes will apply instead of disabling a restart button', async () => {
  usePluginsStore.setState({
    catalog: { ...emptyCatalog, plugins: [plugin] },
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: false,
    loadPlugins: async () => true,
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });
  expect(container.textContent).toContain('Plugin changes take effect when a new session starts.');
  expect(container.textContent).not.toContain('Restart idle sessions to apply');
});

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
    requestedScope: JSON.stringify([getRuntimeKey(), '/repo']),
    isLoading: false,
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
  await act(async () => { applyButton.click(); });
  await settle();

  expect(applies).toBe(0);
  // The confirmation dialog mounts asynchronously; wait for its portal rather than one tick.
  await waitFor(() => document.querySelector('[data-slot="dialog-content"]') !== null);
  const dialog = document.querySelector('[data-slot="dialog-content"]');
  if (!dialog) throw new Error('Missing apply confirmation dialog');

  const confirm = Array.from(dialog.querySelectorAll('button'))
    .find(button => !button.matches('[data-slot="dialog-close"]') && button.textContent?.trim() === applyActionName);
  if (!confirm) throw new Error('Missing apply confirmation action');
  await act(async () => { confirm.click(); });
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

test('feature checkboxes and project JSON write only to the selected native scope', async () => {
  const installed = {
    ...plugin, globalSettings: { greeting: 'global' },
    settingDefinitions: [...plugin.settingDefinitions, {
      key: 'greeting', description: '', type: 'string' as const, secret: false, configured: true, globalConfigured: true, overridden: true
    }]
  };
  const catalog = { ...emptyCatalog, plugins: [installed] };
  const lifecycle: PluginLifecycleState = {
    workspaceId, revision: catalog.revision, projectWritable: true, plugins: [{
      ...installed, availableFeatures: [{ name: 'stable', defaultEnabled: true }, { name: 'preview', defaultEnabled: false }],
      globalFeatures: null, globalFeaturesWritable: true, workspaceFeatures: [], workspaceWritable: true, projectSettings: { greeting: 'project' }
    }]
  };
  const writes: Array<Omit<PluginConfigureRequest, 'expectedRevision'>> = [];
  usePluginsStore.setState({
    catalog, loadedDirectory: '/repo', loadedRuntimeKey: getRuntimeKey(), loadPlugins: async () => true,
    readPluginLifecycle: async () => lifecycle,
    configurePlugin: async input => {
      writes.push(input);
      return { workspaceId, revision: catalog.revision, persistence: 'committed', status: 'no-active-workers', workers: [], catalog };
    }
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });
  const card = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(plugin.name) && button.textContent?.includes(plugin.version));
  if (!card) throw new Error('Missing plugin card');
  await act(async () => { card.dispatchEvent(new Event('click', { bubbles: true })); });
  await waitFor(() => container.querySelector('[role="checkbox"]') !== null);
  const stable = () => container.querySelector('[role="checkbox"][aria-label="stable"]');
  expect(stable()?.getAttribute('aria-checked')).toBe('true');
  const project = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === 'Project');
  if (!project) throw new Error('Missing project scope control');
  await act(async () => { project.click(); });
  expect(stable()?.getAttribute('aria-checked')).toBe('false');
  await act(async () => { (stable() as HTMLElement | null)?.click(); });
  expect(writes[0]).toEqual({ target: plugin.target, settingsScope: 'workspace', enabledFeatures: ['stable'] });
  const editor = container.querySelector<HTMLTextAreaElement>('#native-plugin-project-settings');
  if (!editor) throw new Error('Missing project JSON editor');
  expect(JSON.parse(editor.value)).toEqual({ greeting: 'project' });
  const inputWindow = editor.ownerDocument.defaultView;
  if (!inputWindow) throw new Error('Missing textarea window');
  const setter = Object.getOwnPropertyDescriptor(inputWindow.HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing textarea setter');
  await act(async () => {
    setter.call(editor, '{"greeting":"edited"}');
    editor.dispatchEvent(new inputWindow.Event('input', { bubbles: true, composed: true }));
  });
  await act(async () => {
    editor.dispatchEvent(new inputWindow.FocusEvent('focusout', { bubbles: true, composed: true }));
  });
  await waitFor(() => writes.length === 2);
  expect(writes[1]).toEqual({ target: plugin.target, settingsScope: 'workspace', settings: { greeting: 'edited' } });
  expect(container.querySelector<HTMLTextAreaElement>('#native-plugin-settings')?.value).toContain('"global"');
});

test('a shadowed global copy offers only global features', async () => {
  const projectPlugin: InstalledPluginEntry = {
    ...plugin, id: 'project_copy', version: '2.0.0', scope: 'workspace',
    target: { kind: 'marketplace', name: plugin.name, marketplace: 'fixture', scope: 'project' },
  };
  const catalog = { ...emptyCatalog, plugins: [plugin, projectPlugin] };
  const lifecycle: PluginLifecycleState = {
    workspaceId, revision: catalog.revision, projectWritable: true,
    plugins: [
      { ...plugin, availableFeatures: [{ name: 'shared', defaultEnabled: true }], globalFeaturesWritable: true,
        globalFeatures: null, workspaceFeatures: ['shared', 'project-only'], workspaceWritable: false, projectSettings: {} },
      { ...projectPlugin, availableFeatures: [{ name: 'shared', defaultEnabled: true }, { name: 'project-only', defaultEnabled: true }],
        globalFeaturesWritable: false, globalFeatures: null, workspaceFeatures: ['shared', 'project-only'], workspaceWritable: true, projectSettings: {} },
    ],
  };
  usePluginsStore.setState({
    catalog, loadedDirectory: '/repo', loadedRuntimeKey: getRuntimeKey(), loadPlugins: async () => true,
    readPluginLifecycle: async () => lifecycle,
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });
  const card = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(plugin.name) && button.textContent?.includes(plugin.version));
  if (!card) throw new Error('Missing global plugin card');
  await act(async () => { card.click(); });
  const shared = () => container.querySelector('[role="checkbox"][aria-label="shared"]');
  await waitFor(() => shared() !== null);
  expect(shared()?.getAttribute('aria-checked')).toBe('true');
  expect(Array.from(container.querySelectorAll('button')).some(button => button.textContent?.trim() === 'Project')).toBe(false);
});

test('PluginsPage mounts without infinite re-render loop when catalog is null', async () => {
  usePluginsStore.setState({
    catalog: null,
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: true,
  });
  await act(async () => {
    root.render(<I18nProvider><PluginsPage /></I18nProvider>);
  });
  await settle();
  expect(container.textContent).toContain('Plugins');
});

const ruleItem = (overrides: Partial<ExtensionItem>): ExtensionItem => ({
  id: 'ext_rule', kind: 'rule', name: 'rule', providerId: 'agents', providerName: 'Agent Dirs (.agent/.agents)',
  scope: 'project', path: '<workspace>/.agents/rules/rule.md', enabled: true, shadowed: false, toggleable: true, triggers: [],
  ...overrides,
});
const kindInventory = (items: ExtensionItem[]): ExtensionInventory => ({
  providers: [{ id: 'agents', displayName: 'Agent Dirs (.agent/.agents)', description: '', priority: 1, capabilities: ['rule', 'skill'], enabled: true, userSourceEnabled: true, foreignUserSource: false, itemCount: items.length }],
  items,
  warnings: [],
  kinds: [{ kind: 'rule', label: 'Rules' }, { kind: 'skill', label: 'Skills' }],
});
const showCatalog = async (catalog: PluginCatalogState) => {
  usePluginsStore.setState({
    catalog,
    extensions: catalog.extensions,
    extensionRevision: '1',
    loadedDirectory: '/repo',
    loadedRuntimeKey: getRuntimeKey(),
    isLoading: false,
    error: null,
    isMutating: false,
    loadPlugins: async () => true,
    lastMutation: null,
    doctor: null,
  });
  await act(async () => { root.render(<I18nProvider><PluginsPage /></I18nProvider>); });
  await settle();
};
const buttonWith = (text: string) => Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes(text));

test('the bundled provider is named in the reader language while other providers keep their reported name', async () => {
  useI18nStore.getState().setLocale('zh-CN');
  for (let attempt = 0; attempt < 50 && useI18nStore.getState().loadingLocale !== null; attempt += 1) await settle();
  const { dict: zhCn } = await import('@/lib/i18n/messages/zh-CN');
  await showCatalog({
    ...emptyCatalog, extensions: {
      ...kindInventory([ruleItem({ name: 'project-rule' })]),
      providers: [
        { id: 'agents', displayName: 'Agent Dirs (.agent/.agents)', description: '', priority: 1, capabilities: ['rule', 'skill'], enabled: true, userSourceEnabled: true, foreignUserSource: false, itemCount: 1 },
        { id: 'builtin-defaults', displayName: 'Builtin Defaults', description: '', priority: 9, capabilities: ['rule'], enabled: true, userSourceEnabled: false, foreignUserSource: false, itemCount: 1 },
      ],
    },
  });

  expect(container.textContent).toContain(zhCn['settings.plugins.provider.builtinDefaults']);
  expect(container.textContent).toContain('Agent Dirs (.agent/.agents)');
  expect(container.textContent).not.toContain('Builtin Defaults');
  // The switch's accessible name uses the same localized label.
  const bundledSwitch = [...container.querySelectorAll<HTMLElement>('[role="switch"]')]
    .find((element) => element.getAttribute('aria-label')?.includes(zhCn['settings.plugins.provider.builtinDefaults']));
  expect(bundledSwitch).toBeDefined();
  expect(bundledSwitch?.getAttribute('aria-label')).toBe(
    zhCn['settings.extensions.actions.disable.aria'].replace('{name}', zhCn['settings.plugins.provider.builtinDefaults']),
  );
});

test('capability kind tabs use localized labels instead of the worker English labels', async () => {
  useI18nStore.getState().setLocale('fr');
  for (let attempt = 0; attempt < 50 && useI18nStore.getState().loadingLocale !== null; attempt += 1) await settle();
  await showCatalog({ ...emptyCatalog, extensions: kindInventory([ruleItem({ name: 'project-rule' })]) });

  expect(buttonWith('Règles')).toBeDefined();
  expect(container.textContent).not.toContain('Rules');
});

test('bundled capabilities start collapsed behind a count and expand on demand', async () => {
  await showCatalog({
    ...emptyCatalog, extensions: kindInventory([
      ruleItem({ id: 'ext_project', name: 'project-rule' }),
      ruleItem({ id: 'ext_bundled', name: 'builtin-rule', providerId: 'builtin-defaults', providerName: 'Builtin Defaults', scope: 'user', path: 'builtin-defaults:builtin-rule' }),
    ])
  });

  expect(container.textContent).toContain('project-rule');
  expect(container.textContent).not.toContain('builtin-rule');
  const toggle = buttonWith('Show 1 bundled');
  if (!toggle) throw new Error('Missing bundled toggle');
  await act(async () => { toggle.dispatchEvent(new Event('click', { bubbles: true })); });
  await settle();

  expect(container.textContent).toContain('builtin-rule');
});

test('Extension Control Center keeps raw triggers and paths out of rows and shows them in the inspector', async () => {
  const longTriggers = [
    'ast:grep($X.foo.bar.baz.qux())',
    'glob:**/*.test.ts',
    'glob:**/*.spec.ts',
    'glob:src/**/*.tsx',
  ];
  await showCatalog({
    ...emptyCatalog, extensions: kindInventory([
      ruleItem({ id: 'ext_long_rule', name: 'long-trigger-rule', triggers: longTriggers, content: 'Rule body' }),
    ])
  });

  const row = buttonWith('long-trigger-rule')?.closest('.flex');
  if (!row) throw new Error('Missing capability row');
  expect(row.textContent).toContain('long-trigger-rule');
  for (const trigger of longTriggers) expect(row.textContent).not.toContain(trigger);
  expect(row.textContent).not.toContain('<workspace>/.agents/rules/rule.md');

  expect(container.textContent).toContain('<workspace>/.agents/rules/rule.md');
  for (const trigger of longTriggers) expect(container.textContent).toContain(trigger);
});

test('an empty installed list offers an Add plugin card that explains the empty state', async () => {
  await showCatalog(emptyCatalog);

  expect(container.textContent).toContain('No plugins installed yet.');
  expect(buttonWith('Add plugin')).toBeDefined();
});

test('the capability section and the marketplace source line stay visible when nothing was discovered', async () => {
  // Both states used to be an absent element, so the section that explains them
  // simply vanished: the reader saw no inventory and no reason for it.
  await showCatalog(emptyCatalog);

  expect(container.textContent).toContain('Capabilities');
  expect(container.textContent).toContain('No extensions loaded.');
  expect(container.textContent).toContain('No marketplace sources yet.');
});

test('a selected marketplace category resets when its source leaves the catalog, and every remaining plugin is listed', async () => {
  const lintKit = { marketplace: 'market-a', name: 'lint-kit', description: 'Lint rules', version: '1.0.0', details: { category: 'Quality' } };
  const docsKit = { marketplace: 'market-b', name: 'docs-kit', description: 'Docs', version: '2.0.0' };
  const notesKit = { marketplace: 'market-b', name: 'notes-kit', description: 'Notes', version: '0.1.0', details: { category: 'Docs' } };
  await showCatalog({ ...emptyCatalog, marketplace: [lintKit, docsKit, notesKit] });

  const quality = buttonWith('Quality');
  if (!quality) throw new Error('Missing category chip');
  await act(async () => { quality.dispatchEvent(new Event('click', { bubbles: true })); });
  await settle();
  expect(container.textContent).not.toContain('docs-kit');

  // market-a is removed: its entries leave the catalog while the selected category is still set.
  await showCatalog({ ...emptyCatalog, marketplace: [docsKit, notesKit] });

  expect(buttonWith('All categories')?.getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('docs-kit');
  expect(container.textContent).toContain('notes-kit');
  expect(container.textContent).not.toContain('lint-kit');
});

test.each([false, true])('marketplace metadata and actions stay independently bounded on narrow panes (installed: %s)', async installed => {
  const name = 'very-long-plugin-name-without-any-breaks'.repeat(3);
  const marketplace = 'very-long-marketplace-source'.repeat(3);
  await showCatalog({
    ...emptyCatalog,
    plugins: installed ? [{ ...plugin, name, scope: 'workspace', target: { kind: 'marketplace', name, marketplace, scope: 'project' } }] : [],
    marketplace: [{ name, marketplace, version: '1.0.0-long-version'.repeat(3), description: 'long-description'.repeat(30) }],
  });

  const label = Array.from(container.querySelectorAll('p')).find(element => element.textContent === name);
  const metadata = label?.parentElement;
  const content = metadata?.parentElement;
  const row = content?.parentElement;
  const action = row?.lastElementChild;
  expect(label?.classList.contains('truncate')).toBe(true);
  expect(content?.classList.contains('min-w-0')).toBe(true);
  expect(content?.classList.contains('break-words')).toBe(true);
  expect(metadata?.classList.contains('flex-wrap')).toBe(true);
  for (const item of Array.from(metadata?.children ?? [])) {
    expect(item.classList.contains('max-w-full')).toBe(true);
    expect(item.classList.contains('truncate')).toBe(true);
  }
  expect(action?.tagName).toBe('BUTTON');
  expect(action?.classList.contains('self-start')).toBe(true);
  expect(action?.classList.contains('max-w-full')).toBe(true);
  expect(action?.classList.contains('whitespace-normal')).toBe(true);
  expect((action as HTMLButtonElement).disabled).toBe(installed);

  const add = buttonWith('Add plugin');
  if (!add) throw new Error('Missing Add plugin action');
  await act(async () => { add.click(); });
  await waitFor(() => document.querySelector('[data-slot="dialog-content"]') !== null);
  const dialog = document.querySelector('[data-slot="dialog-content"]');
  const dialogName = Array.from(dialog?.querySelectorAll('span') ?? []).find(element => element.textContent === name);
  const dialogContent = dialogName?.parentElement?.parentElement;
  const dialogAction = dialogContent?.parentElement?.lastElementChild;
  expect(dialogName?.classList.contains('max-w-full')).toBe(true);
  expect(dialogContent?.classList.contains('break-words')).toBe(true);
  expect(dialogAction?.tagName).toBe('BUTTON');
  expect(dialogAction?.classList.contains('self-start')).toBe(true);
  expect(dialogAction?.classList.contains('max-w-full')).toBe(true);
  expect(dialogAction?.classList.contains('whitespace-normal')).toBe(true);
});

test('plugin section headings stack above bounded, wrapping actions on narrow panes', async () => {
  await showCatalog(emptyCatalog);
  for (const title of ['Installed', 'Marketplace', 'Capabilities']) {
    const heading = Array.from(container.querySelectorAll('h2')).find(element => element.textContent === title);
    const header = heading?.parentElement?.parentElement?.parentElement;
    expect(header?.classList.contains('flex-col')).toBe(true);
    expect(header?.classList.contains('@xl:flex-row')).toBe(true);
    const actions = header?.lastElementChild;
    expect(actions?.classList.contains('max-w-full')).toBe(true);
    expect(actions?.classList.contains('min-w-0')).toBe(true);
    if (title !== 'Capabilities') expect(actions?.firstElementChild?.classList.contains('flex-wrap')).toBe(true);
  }
});

test('a long installed plugin name stays inside the card above its reserved controls area', async () => {
  const name = 'long-installed-plugin-name'.repeat(12);
  await showCatalog({ ...emptyCatalog, plugins: [{ ...plugin, name }] });
  const title = container.querySelector(`[title="${name}"]`);
  const card = title?.closest('button');
  expect(title?.classList.contains('truncate')).toBe(true);
  expect(title?.parentElement?.classList.contains('self-stretch')).toBe(true);
  expect(card?.classList.contains('min-w-0')).toBe(true);
  expect(card?.parentElement?.classList.contains('min-w-0')).toBe(true);
  const footer = card?.querySelector('.mt-auto');
  expect(footer?.classList.contains('min-h-10')).toBe(true);
  expect(footer?.classList.contains('@xl:min-h-0')).toBe(true);
  expect(footer?.classList.contains('shrink-0')).toBe(true);
  expect(card?.parentElement?.querySelector('[role="switch"]')).not.toBeNull();
});

test('installed plugin capability chips sit in one shrinkable, wrapping container in the card footer', async () => {
  const installed: InstalledPluginEntry = {
    ...plugin,
    id: 'plugin_lint_kit',
    name: 'lint-kit',
    target: { kind: 'marketplace', name: 'lint-kit', marketplace: 'market-a', scope: 'user' },
  };
  await showCatalog({
    ...emptyCatalog,
    plugins: [installed],
    marketplace: [{
      marketplace: 'market-a',
      name: 'lint-kit',
      description: 'Lint rules',
      version: '1.2.3',
      details: { commands: ['a'], agents: ['b'], hooks: ['c'], mcpServers: ['d'], lspServers: ['e'] },
    }],
  });

  const footer = Array.from(container.querySelectorAll<HTMLElement>('.mt-auto')).find(element => element.querySelectorAll('.oc-tile-inset').length === 5);
  if (!footer) throw new Error('Missing installed card footer with five capability chips');
  const wrap = footer.firstElementChild;
  expect(wrap?.classList.contains('flex-wrap')).toBe(true);
  expect(wrap?.classList.contains('min-w-0')).toBe(true);
  expect(wrap?.querySelectorAll('.oc-tile-inset').length).toBe(5);
});
