import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import type { MCPServerConfig, Workspace } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';

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

let runtimeKey = 'runtime_initial';
const runtimeListeners = new Set<() => void>();
const setRuntimeKey = (next: string) => {
  runtimeKey = next;
  for (const listener of runtimeListeners) listener();
};
// Dynamic imports install browser globals and module mocks before these modules load.
const actualRuntime = await import('@/lib/runtime-switch');
mock.module('@/lib/runtime-switch', () => ({
  ...actualRuntime,
  getRuntimeKey: () => runtimeKey,
  subscribeRuntimeEndpointChanged: (listener: () => void) => {
    runtimeListeners.add(listener);
    return () => runtimeListeners.delete(listener);
  },
}));

interface CredentialCall { value: string; runtime: string }
const credentialCalls: CredentialCall[] = [];
const firstWrite = Promise.withResolvers<{
  workspaceId: string;
  serverId: string;
  persistedRevision: string;
  credentialRef: string;
}>();
interface WorkspaceGate { promise: Promise<Workspace>; resolve: (workspace: Workspace) => void }
let workspaceGate: WorkspaceGate | null = null;
let workspaceCalls = 0;
const actualClient = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...actualClient,
  canonicalClient: {
    ...actualClient.canonicalClient,
    resolveWorkspace: async () => {
      workspaceCalls += 1;
      if (workspaceGate) await workspaceGate.promise;
      return { workspaceId: 'workspace', projectId: 'project', name: 'Workspace' };
    },
    writeWorkspaceMcpCredential: async (_workspaceId: string, _serverId: string, request: { value: string }) => {
      credentialCalls.push({ value: request.value, runtime: runtimeKey });
      if (credentialCalls.length === 1) return firstWrite.promise;
      return { workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', credentialRef: 'later_ref' };
    },
  },
}));

// Mocks must be installed before the React component graph is imported.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useMcpConfigStore } = await import('@/stores/useMcpConfigStore');
const { useMcpStore } = await import('@/stores/useMcpStore');
const { McpPage } = await import('./McpPage');

const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
const server: MCPServerConfig = { serverId: 'tools', label: 'Tools', enabled: true, transport: { type: 'http', url: 'https://initial.test' } };
const configuration = { workspaceId: 'workspace', persistedRevision: '3', config: { servers: [server] } };
let updateCalls = 0;

beforeEach(() => {
  runtimeKey = 'runtime_initial';
  runtimeListeners.clear();
  workspaceGate = null;
  workspaceCalls = 0;
  credentialCalls.length = 0;
  updateCalls = 0;
  root = createRoot(container);
  useMcpStore.getState().resetForRuntimeSwitch();
  useMcpConfigStore.setState({
    selectedMcpName: 'tools',
    serversByDirectory: { '/repo': [server] },
    configurationsByDirectory: { '/repo': configuration },
    errorsByDirectory: {},
    applyResultsByDirectory: {},
    updateMcp: async () => {
      updateCalls += 1;
      return { ok: true, result: { kind: 'mcp', status: 'no-active-workers', workers: [], configuration } };
    },
  });
});
afterEach(async () => { await act(async () => root.unmount()); });
afterAll(() => { fetchSpy.mockRestore(); browser.close(); });

const settle = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await act(async () => { await promise; });
};
const waitFor = async (predicate: () => boolean) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await settle();
    if (predicate()) return;
  }
};
const setInput = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing input setter');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const click = async (element: Element) => {
  await act(async () => { element.dispatchEvent(new Event('click', { bubbles: true })); });
};

test('a runtime switch during the first credential write blocks later secret and configuration writes', async () => {
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });

  const findAddHeader = () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Add header');
  const addHeader = findAddHeader();
  if (!addHeader) throw new Error('Missing add header control');
  await click(addHeader);
  const addHeaderAgain = findAddHeader();
  if (!addHeaderAgain) throw new Error('Missing add header control');
  await click(addHeaderAgain);

  const keys = [...container.querySelectorAll<HTMLInputElement>('input[aria-label="Key"]')];
  const values = [...container.querySelectorAll<HTMLInputElement>('input[aria-label="Value"]')];
  if (keys.length !== 2 || values.length !== 2) throw new Error('Missing pending credential rows');
  await setInput(keys[0], 'X-First');
  await setInput(values[0], 'first-secret');
  await setInput(keys[1], 'X-Second');
  await setInput(values[1], 'second-secret');

  const save = [...container.querySelectorAll('button')].find(button => button.textContent === 'Save Changes');
  if (!save) throw new Error('Missing credential save action');
  await click(save);
  await waitFor(() => credentialCalls.length === 1);
  expect(credentialCalls).toEqual([{ value: 'first-secret', runtime: 'runtime_initial' }]);

  runtimeKey = 'runtime_replacement';
  await act(async () => {
    firstWrite.resolve({ workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', credentialRef: 'first_ref' });
  });
  await waitFor(() => container.querySelector('[role="alert"]') !== null);
  for (let flush = 0; flush < 3; flush += 1) await settle();

  expect(credentialCalls).toEqual([{ value: 'first-secret', runtime: 'runtime_initial' }]);
  expect(updateCalls).toBe(0);
});


test('a runtime switch before workspace resolution prevents any credential or configuration write', async () => {
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });

  const addHeader = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add header');
  if (!addHeader) throw new Error('Missing add header control');
  await click(addHeader);
  const key = container.querySelector<HTMLInputElement>('input[aria-label="Key"]');
  const value = container.querySelector<HTMLInputElement>('input[aria-label="Value"]');
  if (!key || !value) throw new Error('Missing pending credential row');
  await setInput(key, 'X-Only');
  await setInput(value, 'only-secret');

  const gate = Promise.withResolvers<Workspace>();
  workspaceGate = gate;
  const save = [...container.querySelectorAll('button')].find(button => button.textContent === 'Save Changes');
  if (!save) throw new Error('Missing credential save action');
  await click(save);
  await waitFor(() => workspaceCalls > 0);

  runtimeKey = 'runtime_replacement';
  await act(async () => { gate.resolve({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }); });
  await waitFor(() => container.querySelector('[role="alert"]') !== null);
  for (let flush = 0; flush < 3; flush += 1) await settle();

  expect(credentialCalls).toHaveLength(0);
  expect(updateCalls).toBe(0);
});

test('a runtime switch remounts the editor and clears a held credential draft', async () => {
  await act(async () => { root.render(<I18nProvider><McpPage /></I18nProvider>); });

  const addHeader = [...container.querySelectorAll('button')].find(button => button.textContent === 'Add header');
  if (!addHeader) throw new Error('Missing add header control');
  await click(addHeader);
  const value = container.querySelector<HTMLInputElement>('input[aria-label="Value"]');
  if (!value) throw new Error('Missing pending credential row');
  await setInput(value, 'held-secret');
  expect(value.value).toBe('held-secret');

  await act(async () => { setRuntimeKey('runtime_replacement'); });

  expect(container.querySelector<HTMLInputElement>('input[aria-label="Value"]')).toBeNull();
});
