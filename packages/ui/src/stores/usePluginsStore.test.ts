import { afterAll, afterEach, beforeEach, expect, spyOn, test, type Mock } from 'bun:test';
import { Window } from 'happy-dom';
import type { ExtensionInventory, PluginCatalogState, PluginMutationResult } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import type { CanonicalClient } from '@/api/canonicalClient';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
});

const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ data: [] }));
const { usePluginsStore } = await import('@/stores/usePluginsStore');
const { useProjectsStore } = await import('./useProjectsStore');

const DIRECTORY = '/workspace/project';
const OTHER_DIRECTORY = '/workspace/other';
const WORKSPACE = 'workspace_one';
const OTHER_WORKSPACE = 'workspace_two';

const inventory = (count: number, label = 'provider'): ExtensionInventory => ({
  providers: [{
    id: label, displayName: label, description: '', priority: 1, capabilities: ['skill'],
    enabled: count % 2 === 0, userSourceEnabled: true, foreignUserSource: false, itemCount: count,
  }],
  items: count === 0 ? [] : [{
    id: 'extension_row', kind: 'skill', name: 'release-notes', providerId: label, providerName: label,
    scope: 'user', path: '<agent>/skills/release-notes', enabled: count % 2 !== 0, shadowed: false,
    toggleable: true, triggers: [],
  }],
  warnings: [], kinds: [{ kind: 'skill', label: 'Skills' }],
});
const catalog = (revision: string, workspaceId = WORKSPACE, count = 0): PluginCatalogState => ({
  workspaceId, revision, plugins: [], marketplace: [], localExtensions: [], workers: [],
  marketplaceSources: [], availableUpdates: [], extensions: inventory(count),
});
const mutation = (revision: string, workspaceId = WORKSPACE, count = 1): PluginMutationResult => ({
  workspaceId, revision, persistence: 'committed', status: 'no-active-workers', workers: [], catalog: catalog(revision, workspaceId, count),
});

let resolveWorkspace: Mock<CanonicalClient['resolveWorkspace']>;
let listPlugins: Mock<CanonicalClient['plugins']['list']>;
let installPlugin: Mock<CanonicalClient['plugins']['install']>;
let readInventory: Mock<CanonicalClient['extensions']['inventory']>;
let toggleExtension: Mock<CanonicalClient['extensions']['toggle']>;

beforeEach(() => {
  fetchSpy.mockReset().mockResolvedValue(Response.json({ data: [] }));
  useProjectsStore.setState({ projects: [{ id: 'project', path: DIRECTORY }], activeProjectId: 'project' });
  usePluginsStore.setState({
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null,
    requestedScope: null, isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null,
  });
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => ({
    workspaceId: directory === OTHER_DIRECTORY ? OTHER_WORKSPACE : WORKSPACE, projectId: 'project', name: directory,
  }));
  listPlugins = spyOn(canonicalClient.plugins, 'list').mockImplementation(async workspaceId => catalog('1', workspaceId));
  installPlugin = spyOn(canonicalClient.plugins, 'install').mockImplementation(async workspaceId => mutation('2', workspaceId));
  readInventory = spyOn(canonicalClient.extensions, 'inventory').mockImplementation(async workspaceId => ({
    workspaceId, revision: '5', extensions: inventory(2),
  }));
  toggleExtension = spyOn(canonicalClient.extensions, 'toggle').mockImplementation(async (workspaceId, input) => ({
    workspaceId, revision: String(BigInt(input.expectedRevision) + 1n), extensions: inventory(input.enabled ? 0 : 1),
  }));
});

afterEach(() => {
  resolveWorkspace.mockRestore(); listPlugins.mockRestore(); installPlugin.mockRestore();
  readInventory.mockRestore(); toggleExtension.mockRestore();
  usePluginsStore.setState({
    catalog: null, extensions: null, extensionRevision: null, loadedDirectory: null, loadedRuntimeKey: null,
    requestedScope: null, isLoading: false, error: null, isMutating: false, lastMutation: null, doctor: null,
  });
});
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });

const load = async (directory = DIRECTORY) => {
  expect(await usePluginsStore.getState().loadPlugins({ directory })).toBe(true);
};
const state = () => usePluginsStore.getState();

test('an extension switch keeps its own revision and never rewrites the plugin catalog revision', async () => {
  await load();
  expect(state().catalog?.revision).toBe('1');
  await state().toggleExtensionProvider('provider', false);
  expect(state().extensionRevision).toBe('6');
  expect(state().catalog?.revision).toBe('1');
  expect(state().extensions?.providers[0]?.enabled).toBe(false);
  // The write read the authoritative settings revision before toggling.
  expect(readInventory).toHaveBeenCalledWith(WORKSPACE);
  expect(toggleExtension).toHaveBeenCalledWith(WORKSPACE, { expectedRevision: '5', providerId: 'provider', enabled: false });
});

test('a plugin mutation after an extension switch leaves the switched inventory intact', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  const switched = state().extensions;
  const result = await state().installPlugin({ kind: 'package', spec: 'example' });
  expect(result.revision).toBe('2');
  expect(state().catalog?.revision).toBe('2');
  // The mutation's own refresh read is stale relative to the switch, so the
  // newer settings-owned snapshot wins and the plugin revision stays separate.
  expect(state().extensions).toEqual(switched);
  expect(state().extensionRevision).toBe('6');
});

test('an extension switch after a plugin mutation keeps the bumped plugin revision', async () => {
  await load();
  await state().installPlugin({ kind: 'package', spec: 'example' });
  expect(state().catalog?.revision).toBe('2');
  await state().toggleExtensionItem('provider', 'extension_row', false);
  expect(state().catalog?.revision).toBe('2');
  expect(state().extensionRevision).toBe('6');
});

test('a forced catalog reload does not resurrect a stale embedded inventory', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  const switched = state().extensions;
  // The plugin catalog still embeds the pre-switch inventory (count 0).
  expect(await state().loadPlugins({ directory: DIRECTORY, force: true })).toBe(true);
  expect(state().extensions).toEqual(switched);
  expect(state().extensionRevision).toBe('6');
});

test('a failed settings write reports the failure and leaves the inventory untouched', async () => {
  await load();
  toggleExtension.mockImplementation(async () => {
    throw new CanonicalApiError({
      type: 'urn:ohpichamber:problem:INTERNAL_ERROR', title: 'Rejected', status: 503,
      detail: 'Native extension settings could not be persisted', code: 'SERVICE_UNAVAILABLE', retryable: true,
    });
  });
  await expect(state().toggleExtensionProvider('provider', false)).rejects.toThrow(/could not be persisted/);
  // The pre-write read is the only committed state; the failed write changed nothing.
  expect(state().extensions).toEqual(inventory(2));
  expect(state().extensionRevision).toBe('5');
  expect(state().isMutating).toBe(false);
  expect(state().error).toBeNull();
});

test('switching directories clears the inventory and refuses a queued old-scope write', async () => {
  await load();
  await state().toggleExtensionProvider('provider', false);
  expect(state().extensions).not.toBeNull();
  await load(OTHER_DIRECTORY);
  expect(state().catalog?.workspaceId).toBe(OTHER_WORKSPACE);
  expect(state().extensions).toEqual(catalog('1', OTHER_WORKSPACE).extensions);
  expect(state().extensionRevision).toBeNull();
  // A queued write for the previous scope is refused; a fresh write targets the new one.
  await state().toggleExtensionProvider('provider', true);
  expect(toggleExtension.mock.calls.at(-1)?.[0]).toBe(OTHER_WORKSPACE);
  expect(state().extensionRevision).toBe('6');
});
