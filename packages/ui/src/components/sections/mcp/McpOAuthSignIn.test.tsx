import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { MCPOAuthRequest, MCPOAuthResult } from '@openchamber/agent-contract';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  Event: browser.Event, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const owner = { serverId: 'tools', persistedRevision: '3', worker: { rootSessionId: 'oauth_owner', workspaceId: 'workspace', workerGeneration: 'generation' } };
const disconnected: MCPOAuthResult = { ...owner, status: 'unauthenticated', authenticated: false };
const pending: MCPOAuthResult = { ...owner, status: 'pending', authenticated: false, pendingFlow: { flowId: 'flow', authorizationUrl: 'https://auth.example.test/authorize?state=opaque' } };
let requests: MCPOAuthRequest[] = [];
let credentials: Array<{ persistedRevision: string; value: string }> = [];
let reconnects = 0;
const actual = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({ ...actual, canonicalClient: {
  resolveWorkspace: async () => ({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }),
  getWorkspaceMcpOAuth: async (): Promise<MCPOAuthResult> => disconnected,
  writeWorkspaceMcpCredential: async (_workspaceId: string, _serverId: string, input: { persistedRevision: string; value: string }) => { credentials.push(input); return { ...owner, credentialRef: 'private_ref' }; },
  submitWorkspaceMcpOAuth: async (_workspaceId: string, _serverId: string, input: MCPOAuthRequest): Promise<MCPOAuthResult> => {
    requests.push(input);
    if (input.action === 'start') return pending;
    return input.action === 'complete' ? { ...owner, status: 'authenticated', authenticated: true } : disconnected;
  },
} }));
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { McpOAuthSignIn } = await import('./McpOAuthSignIn');
const container = document.createElement('div'); document.body.appendChild(container);
let root: ReturnType<typeof createRoot>;
beforeEach(() => { root = createRoot(container); requests = []; credentials = []; reconnects = 0; });
afterEach(async () => { await act(async () => root.unmount()); });
afterAll(() => browser.close());
const render = async (serverId = 'tools') => { await act(async () => { root.render(<I18nProvider><McpOAuthSignIn serverId={serverId} directory="/repo" onConnected={() => { reconnects += 1; }} /></I18nProvider>); }); };
const enter = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing input setter');
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === label);
  if (!button) throw new Error(`Missing ${label} button`);
  await act(async () => button.dispatchEvent(new Event('click', { bubbles: true })));
};

test('OAuth client secret stays in the dedicated private write and completion carries exact flow ownership', async () => {
  await render();
  const secret = container.querySelector<HTMLInputElement>('input[type="password"]');
  if (!secret) throw new Error('Missing client secret');
  await enter(secret, 'private-client-secret');
  await click('Authorize');
  expect(credentials).toEqual([{ persistedRevision: '3', value: 'private-client-secret' }]);
  expect(requests[0]).toEqual({ action: 'start', persistedRevision: '3', workerGeneration: 'generation', oauth: { clientSecretRef: 'private_ref' } });
  expect(JSON.stringify(requests)).not.toContain('private-client-secret');
  const callback = container.querySelector<HTMLInputElement>('input');
  if (!callback) throw new Error('Missing callback field');
  await enter(callback, 'http://127.0.0.1/callback?code=code&state=opaque');
  await click('Complete Authorization');
  expect(requests[1]).toEqual({ action: 'complete', persistedRevision: '3', workerGeneration: 'generation', flowId: 'flow', callbackInput: 'http://127.0.0.1/callback?code=code&state=opaque' });
  expect(reconnects).toBe(1);
});

test('cancel and clear authentication retain their native flow and worker boundaries', async () => {
  await render(); await click('Authorize'); await click('Cancel');
  expect(requests[1]).toEqual({ action: 'cancel', persistedRevision: '3', workerGeneration: 'generation', flowId: 'flow' });
  await click('Authorize'); await click('Complete Authorization'); await click('Clear Auth');
  expect(requests[4]).toEqual({ action: 'disconnect', persistedRevision: '3', workerGeneration: 'generation' });
});
