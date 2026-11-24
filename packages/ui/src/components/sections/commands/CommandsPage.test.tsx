import { afterEach, expect, spyOn, test } from 'bun:test';
import type { CommandEntry } from '@openchamber/agent-contract';
import { plugin } from 'bun';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Window } from 'happy-dom';
import type { OmpSettingsState } from '@openchamber/agent-contract';

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
  HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const _fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
  const request = new Request(input instanceof Request ? input : new URL(input, window.location.href), init);
  const path = new URL(request.url).pathname;
  if (path === '/api/fs/home') return Response.json({ home: '/test' });
  if (path === '/api/config/settings') return Response.json({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace', projectId: 'project', name: 'project' });
  if (path === '/api/agent/v1/workspaces/workspace/settings') return Response.json({ workspaceId: 'workspace', revision: '0', totalCount: 0, settings: [] });
  throw new Error(`Unexpected request: ${request.method} ${path}`);
});

// React's input-event support is detected when react-dom loads.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
// Match Vite's eager asset glob when the real model selector loads in Bun.
plugin({
  name: 'command-settings-provider-logos',
  setup(build) {
    build.onLoad({ filter: /useProviderLogo\.ts$/ }, ({ path }) => {
      const directory = resolve(dirname(path), '../assets/provider-logos');
      const logos = Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith('.svg')).map((name) => [
        `../assets/provider-logos/${name}`, pathToFileURL(resolve(directory, name)).href,
      ]));
      return { contents: readFileSync(path, 'utf8').replace(/import\.meta\.glob<string>\([\s\S]*?\);/, `${JSON.stringify(logos)};`), loader: 'ts' };
    });
  },
});
const { CommandsPage } = await import('./CommandsPage');
const { canonicalClient } = await import('@/api/canonicalClient');
test('Commands discovery writes its native setting and refreshes the catalog', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  const state: OmpSettingsState = {
    workspaceId: 'workspace', revision: '1', totalCount: 2,
    settings: [{
      id: 'commands.enableClaudeProject', type: 'boolean', value: true, default: true, configured: false,
      placement: { type: 'page', page: 'commands', section: 'catalog' }
    }, {
      id: 'commands.enableOpencodeProject', type: 'boolean', value: false, default: true, configured: true,
      condition: 'discoveryUsesSharedConfig', conditionActive: false,
      placement: { type: 'page', page: 'commands', section: 'catalog' },
    }],
  };
  const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'project' });
  const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(state);
  const write = spyOn(canonicalClient, 'updateOmpSettings').mockResolvedValue({
    ...state, revision: '2', settings: [{ ...state.settings[0], value: false, configured: true }],
  });
  const reload = spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
  try {
    await act(async () => root.render(<SyncProvider directory="/project"><I18nProvider><CommandsPage /></I18nProvider></SyncProvider>));
    expect(container.querySelector('[data-settings-item="omp.commands.enableClaudeProject"]')).toBeNull();
    const trigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Discovery sources'));
    if (!trigger) throw new Error('Missing Discovery sources button');
    await act(async () => trigger.click());
    const row = document.body.querySelector<HTMLElement>('[data-settings-item="omp.commands.enableClaudeProject"]');
    if (!row) throw new Error('Missing discovery setting');
    const overridden = document.body.querySelector<HTMLElement>('[data-settings-item="omp.commands.enableOpencodeProject"]');
    expect(overridden?.getAttribute('aria-disabled')).toBe('true');
    expect(overridden?.textContent).toContain('Editing the shared setting would not change this project.');
    await act(async () => overridden?.click());
    expect(write).not.toHaveBeenCalled();
    await act(async () => row.click());
    expect(write).toHaveBeenCalledWith('workspace', { expectedRevision: '1', changes: [{ id: 'commands.enableClaudeProject', value: false }] });
    expect(reload).toHaveBeenCalledWith('/project');
  } finally { resolve.mockRestore(); read.mockRestore(); write.mockRestore(); reload.mockRestore(); }
});

test('Commands hides the Discovery sources button when zero discovery settings are exposed', async () => {
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  const emptyState: OmpSettingsState = { workspaceId: 'workspace', revision: '1', totalCount: 0, settings: [] };
  const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'project' });
  const read = spyOn(canonicalClient, 'getOmpSettings').mockResolvedValue(emptyState);
  try {
    await act(async () => root.render(<SyncProvider directory="/project"><I18nProvider><CommandsPage /></I18nProvider></SyncProvider>));
    const trigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent?.includes('Discovery sources'));
    expect(trigger).toBeUndefined();
  } finally { resolve.mockRestore(); read.mockRestore(); }
});
const { useCommandsStore } = await import('@/stores/useCommandsStore');
const { useProjectsStore } = await import('@/stores/useProjectsStore');
const { SyncProvider } = await import('@/sync/sync-context');
const initialStore = useCommandsStore.getState();
const container = document.createElement('div');
document.body.appendChild(container);
let root = createRoot(container);

afterEach(async () => {
  await act(async () => root.unmount());
  container.innerHTML = '';
  root = createRoot(container);
  useCommandsStore.setState(initialStore, true);
  await new Promise((resolve) => setTimeout(resolve, 350));
});

test('a command refresh during save preserves the newer draft for the queued save', async () => {
  const writes: Array<{ template: string; agentId: string | null | undefined; publish: () => void; finish: (success?: boolean) => void }> = [];
  const command: CommandEntry = { commandId: 'command_example', name: 'example', content: 'initial', description: '', scope: 'agent', source: 'agent', editable: true };
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useCommandsStore.setState({
    selectedCommandName: command.name,
    commands: [command],
    commandsByDirectory: { '/project': [command] },
    updateCommand: async (_name, config) => new Promise<boolean>((resolve) => {
      writes.push({
        template: config.content || '', agentId: config.agentId, publish: () => {
          const { agentId, ...rest } = { ...command, ...config };
          const updated: CommandEntry = { ...rest, ...(agentId ? { agentId } : {}) };
          useCommandsStore.setState({ commands: [updated], commandsByDirectory: { '/project': [updated] } });
        }, finish: (success = true) => resolve(success)
      });
    }),
  });
  await act(async () => { root.render(<SyncProvider directory="/project"><I18nProvider><CommandsPage /></I18nProvider></SyncProvider>); });
  expect(container.textContent).not.toContain('Override Agent');
  const prompt = container.querySelector<HTMLTextAreaElement>('textarea[rows="12"]');
  if (!prompt) throw new Error('Missing command template');
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setValue) throw new Error('Missing native textarea setter');
  const edit = async (value: string) => {
    await act(async () => {
      setValue.call(prompt, value);
      prompt.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => { prompt.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  };
  await edit(' older ');
  await edit('newer');
  expect(writes[0].agentId).toBeNull();
  // updateCommand publishes the refreshed catalog before its promise settles.
  await act(async () => { writes[0].publish(); });
  expect(prompt.value).toBe('newer');
  await act(async () => { writes[0].finish(); });
  expect(writes.map((write) => write.template)).toEqual([' older ', 'newer']);
  await act(async () => { writes[1].publish(); writes[1].finish(); });
  expect(prompt.value).toBe('newer');

  // React may process the refreshed catalog only after the save has settled.
  await edit(' trimmed ');
  await edit('latest');
  await act(async () => { writes[2].publish(); writes[2].finish(); });
  await act(async () => { writes[2].publish(); });
  expect(prompt.value).toBe('latest');
  expect(writes.map((write) => write.template)).toEqual([' older ', 'newer', ' trimmed ', 'latest']);
  await act(async () => { writes[3].publish(); writes[3].finish(); });

  // A failed write must leave the draft dirty so the next blur retries it.
  await edit('retry me');
  await act(async () => { writes[4].finish(false); });
  expect(prompt.value).toBe('retry me');
  await act(async () => { prompt.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes.map((write) => write.template)).toEqual([' older ', 'newer', ' trimmed ', 'latest', 'retry me', 'retry me']);
  await act(async () => { writes[5].publish(); writes[5].finish(); });

  // An old completion must not replace the baseline for a different command.
  await edit('pending');
  const other: CommandEntry = { ...command, commandId: 'command_other', name: 'other', content: 'other initial' };
  await act(async () => {
    useCommandsStore.setState({ selectedCommandName: other.name, commands: [other], commandsByDirectory: { '/project': [other] } });
  });
  expect(prompt.value).toBe('other initial');
  await act(async () => { writes[6].finish(); });
  await act(async () => { prompt.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes).toHaveLength(7);
});

test('a built-in command is not editable here and the page keeps only template files', async () => {
  const builtin: CommandEntry = {
    commandId: 'command_compact',
    name: 'compact',
    content: '',
    description: 'Manually compact the session context',
    argumentHint: '[soft|remote|snapcompact] [focus]',
    scope: 'inherited',
    source: 'builtin',
    editable: false,
  };
  const template: CommandEntry = {
    commandId: 'command_deploy',
    name: 'deploy',
    content: 'Ship it',
    description: 'Deploy the app',
    scope: 'workspace',
    source: 'workspace',
    editable: true,
  };
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useCommandsStore.setState({
    selectedCommandName: builtin.name,
    selectedCommandId: builtin.commandId,
    commands: [builtin, template],
    commandsByDirectory: { '/project': [builtin, template] },
  });

  await act(async () => {
    root.render(
      <I18nProvider>
        <SyncProvider directory="/project">
          <CommandsPage />
        </SyncProvider>
      </I18nProvider>
    );
  });

  // A built-in has no template file, so the page offers no editor for it.
  expect(container.textContent).toContain('Select a command from the sidebar');
  expect(container.querySelector('textarea')).toBeNull();
  // The empty pane still has the page heading Settings focuses on navigation.
  const heading = container.querySelector('[data-settings-page-heading]');
  expect(heading?.textContent).toBe('Commands');
});

test('locale switch preserves unsaved custom command draft without rehydrating', async () => {
  const custom: CommandEntry = {
    commandId: 'command_custom_one',
    name: 'my-custom-cmd',
    content: 'Custom template content',
    description: 'Initial description',
    scope: 'workspace',
    source: 'workspace',
    editable: true,
  };
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useCommandsStore.setState({
    selectedCommandName: custom.name,
    selectedCommandId: custom.commandId,
    commands: [custom],
    commandsByDirectory: { '/project': [custom] },
  });

  await act(async () => {
    root.render(
      <I18nProvider>
        <SyncProvider directory="/project">
          <CommandsPage />
        </SyncProvider>
      </I18nProvider>
    );
  });

  const descTextarea = container.querySelector<HTMLTextAreaElement>('textarea');
  expect(descTextarea).not.toBeNull();
  const setTextValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setTextValue?.call(descTextarea, 'Dirty unsaved description');
    descTextarea!.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await act(async () => {
    await useI18nStore.getState().setLocale('zh-CN');
  });

  expect(descTextarea?.value).toBe('Dirty unsaved description');

  await act(async () => {
    await useI18nStore.getState().setLocale('en');
  });
});

test('creating a custom command with same name as built-in is permitted', async () => {
  const builtinCompact: CommandEntry = {
    commandId: 'command_compact',
    name: 'compact',
    content: '',
    description: 'Built-in compact',
    scope: 'inherited',
    source: 'builtin',
    editable: false,
  };
  let created = false;
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/project' }], activeProjectId: 'project' });
  useCommandsStore.setState({
    selectedCommandName: 'compact',
    selectedCommandId: null,
    commandDraft: { name: 'compact', scope: 'workspace', description: 'Override', content: 'Custom content' },
    commands: [builtinCompact],
    commandsByDirectory: { '/project': [builtinCompact] },
    createCommand: async () => {
      created = true;
      return true;
    },
  });

  await act(async () => {
    root.render(
      <I18nProvider>
        <SyncProvider directory="/project">
          <CommandsPage />
        </SyncProvider>
      </I18nProvider>
    );
  });

  const createBtn = Array.from(container.querySelectorAll('button'))
    .find(button => button.textContent?.includes('Create'));
  expect(createBtn).toBeDefined();
  await act(async () => { createBtn?.click(); });

  expect(created).toBe(true);
});
