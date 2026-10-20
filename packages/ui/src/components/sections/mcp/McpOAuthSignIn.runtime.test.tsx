import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import type { MCPOAuthResult, MCPOAuthRequest } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  Event: browser.Event, FocusEvent: browser.FocusEvent, CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});
const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ home: '/test' }));

let runtimeKey = 'runtime_initial';
const actualRuntime = await import('@/lib/runtime-switch');
mock.module('@/lib/runtime-switch', () => ({ ...actualRuntime, getRuntimeKey: () => runtimeKey }));

const owner = { serverId: 'tools', persistedRevision: '3', worker: { rootSessionId: 'root', workspaceId: 'workspace', workerGeneration: 'generation' } };
const disconnected: MCPOAuthResult = { ...owner, status: 'unauthenticated', authenticated: false };
interface CredentialCall { value: string; runtime: string }
const credentialCalls: CredentialCall[] = [];
const submitted: MCPOAuthRequest[] = [];
const secretWrite = Promise.withResolvers<{ workspaceId: string; serverId: string; persistedRevision: string; credentialRef: string }>();
const actualClient = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...actualClient,
  canonicalClient: {
    ...actualClient.canonicalClient,
    resolveWorkspace: async () => ({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }),
    getWorkspaceMcpOAuth: async () => disconnected,
    writeWorkspaceMcpCredential: async (_workspaceId: string, _serverId: string, request: { value: string }) => {
      credentialCalls.push({ value: request.value, runtime: runtimeKey });
      return secretWrite.promise;
    },
    submitWorkspaceMcpOAuth: async (_workspaceId: string, _serverId: string, request: MCPOAuthRequest) => {
      submitted.push(request);
      return disconnected;
    },
  },
}));

// Dynamic imports install browser globals and module mocks before these modules load.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { McpOAuthSignIn } = await import('./McpOAuthSignIn');

const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
beforeEach(() => {
  runtimeKey = 'runtime_initial';
  credentialCalls.length = 0;
  submitted.length = 0;
  root = createRoot(container);
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

test('a runtime switch during the client-secret write blocks the OAuth submit', async () => {
  await act(async () => {
    root.render(<I18nProvider><McpOAuthSignIn serverId="tools" directory="/repo" onConnected={() => undefined} /></I18nProvider>);
  });
  await waitFor(() => container.querySelector<HTMLInputElement>('input[type="password"]') !== null);

  const secret = container.querySelector<HTMLInputElement>('input[type="password"]');
  if (!secret) throw new Error('Missing client secret input');
  await setInput(secret, 'client-secret');
  const authorize = [...container.querySelectorAll('button')].find(button => button.textContent === 'Authorize');
  if (!authorize) throw new Error('Missing authorize action');
  await act(async () => { authorize.dispatchEvent(new Event('click', { bubbles: true })); });
  await waitFor(() => credentialCalls.length === 1);

  runtimeKey = 'runtime_replacement';
  await act(async () => {
    secretWrite.resolve({ workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', credentialRef: 'secret_ref' });
  });
  await waitFor(() => container.querySelector('[role="alert"]') !== null);
  for (let flush = 0; flush < 3; flush += 1) await settle();

  expect(credentialCalls).toEqual([{ value: 'client-secret', runtime: 'runtime_initial' }]);
  expect(submitted).toHaveLength(0);
});
