import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import type { MCPApplyResult, MCPServerConfig } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement, HTMLTextAreaElement: browser.HTMLTextAreaElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});
const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ home: '/test' }));
mock.module('@/hooks/useSettingsDirectory', () => ({ useSettingsDirectory: () => '/repo' }));
mock.module('./McpOAuthSignIn', () => ({ McpOAuthSignIn: () => null }));
const secretWrites: Array<{ value: string; persistedRevision: string }> = [];
// DOM globals and canonical transport seams must exist before importing the editor.
const real = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({ ...real, canonicalClient: {
  resolveWorkspace: async () => ({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }),
  writeWorkspaceMcpCredential: async (_workspaceId: string, _serverId: string, request: { value: string; persistedRevision: string }) => {
    secretWrites.push(request);
    return { workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', credentialRef: 'private_ref' };
  },
} }));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useMcpConfigStore } = await import('@/stores/useMcpConfigStore');
const { useMcpStore } = await import('@/stores/useMcpStore');
const { McpPage } = await import('./McpPage');
const container = document.createElement('div');
document.body.appendChild(container);
let root: ReturnType<typeof createRoot>;
const server: MCPServerConfig = { serverId: 'tools', label: 'Tools', enabled: true, transport: { type: 'http', url: 'https://initial.test' } };
const applyResult = (servers: MCPServerConfig[]): MCPApplyResult => ({ kind: 'mcp', status: 'no-active-workers', workers: [], configuration: { workspaceId: 'workspace', persistedRevision: '3', config: { servers } } });
beforeEach(() => {
  secretWrites.length = 0;
  root = createRoot(container);
  useMcpStore.getState().resetForRuntimeSwitch();
  useMcpConfigStore.setState({ selectedMcpName: 'tools', serversByDirectory: { '/repo': [server] }, configurationsByDirectory: { '/repo': applyResult([server]).configuration } });
});
afterEach(async () => { await act(async () => root.unmount()); });
const edit = async (field: HTMLInputElement, value: string, blur = true) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing input setter');
  await act(async () => { setter.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
  if (blur) await act(async () => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
};

test('a native catalog echo preserves a newer draft while serialized autosave is in flight', async () => {
  const writes: Array<{ value: string; finish: () => void }> = [];
  useMcpConfigStore.setState({ updateMcp: async (_serverId, config) => {
    const result = Promise.withResolvers<{ ok: true; result: MCPApplyResult }>();
    writes.push({ value: config.transport?.type === 'http' ? config.transport.url : '', finish: () => result.resolve({ ok: true, result: applyResult([{ ...server, ...config }]) }) });
    return result.promise;
  } });
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });
  const field = container.querySelector<HTMLInputElement>('input[aria-label="Server URL"]');
  if (!field) throw new Error('Missing URL field');
  await edit(field, 'https://older.test');
  await edit(field, 'https://newer.test', false);
  expect(writes.map(write => write.value)).toEqual(['https://older.test']);
  await act(async () => { useMcpConfigStore.setState({ serversByDirectory: { '/repo': [{ ...server, transport: { type: 'http', url: 'https://older.test' } }] } }); });
  expect(field.value).toBe('https://newer.test');
  await act(async () => { writes[0].finish(); });
  expect(field.value).toBe('https://newer.test');
  await act(async () => { field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(writes.map(write => write.value)).toEqual(['https://older.test', 'https://newer.test']);
  await act(async () => { writes[1].finish(); });
});

test('header values are written privately and only opaque references reach configuration', async () => {
  const configs: Array<Partial<MCPServerConfig>> = [];
  useMcpConfigStore.setState({ updateMcp: async (_serverId, config) => { configs.push(config); return { ok: true, result: applyResult([{ ...server, ...config }]) }; } });
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });
  const addVariable = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Add header');
  if (!addVariable) throw new Error('Missing add header control');
  await act(async () => { addVariable.dispatchEvent(new Event('click', { bubbles: true })); });
  const key = container.querySelector<HTMLInputElement>('input[aria-label="Key"]');
  const value = container.querySelector<HTMLInputElement>('input[aria-label="Value"]');
  if (!key || !value) throw new Error('Missing private credential fields');
  await edit(key, 'X-Api-Key', false); await edit(value, 'never-in-config', false);
  const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Save Changes');
  if (!save) throw new Error('Missing credential save');
  await act(async () => { save.dispatchEvent(new Event('click', { bubbles: true })); });
  expect(secretWrites).toEqual([{ value: 'never-in-config', persistedRevision: '3' }]);
  expect(configs[0].transport).toEqual({ type: 'http', url: 'https://initial.test', headerCredentialRefs: { 'X-Api-Key': 'private_ref' } });
  expect(JSON.stringify(configs)).not.toContain('never-in-config');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Value"]')).toBeNull();
});

test('worker apply failures remain visible even though persistence succeeded', async () => {
  const result: MCPApplyResult = { ...applyResult([server]), status: 'failed', workers: [{ worker: { rootSessionId: 'root', workspaceId: 'workspace', workerGeneration: 'generation' }, outcome: 'failed', revisions: { runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0' }, error: { code: 'MCP_APPLY_FAILED', detail: 'The worker could not connect.', retryable: true } }] };
  useMcpConfigStore.setState({ applyResultsByDirectory: { '/repo': result }, errorsByDirectory: { '/repo': 'Runtime application incomplete.' } });
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Runtime application incomplete.');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('The worker could not connect.');
});

afterAll(() => { fetchSpy.mockRestore(); browser.close(); });
