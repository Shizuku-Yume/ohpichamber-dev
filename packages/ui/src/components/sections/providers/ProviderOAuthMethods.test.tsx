import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { ProviderOAuthRequest, ProviderOAuthResult } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  Event: browser.Event, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const owner = { flowId: 'flow_1', generation: 'generation_1', providerId: 'openai', revision: '7' };
const pending: ProviderOAuthResult = {
  ...owner,
  status: 'pending',
  instructions: 'Sign in to continue.',
  authorizationUrl: 'https://auth.example.test/authorize?state=opaque',
  manualInput: true,
  prompt: 'Paste the authorization code',
};
const ready: ProviderOAuthResult = { ...owner, status: 'ready', manualInput: false };
const authenticated: ProviderOAuthResult = { ...owner, status: 'authenticated', manualInput: false };
const cancelled: ProviderOAuthResult = { ...owner, status: 'cancelled', manualInput: false };
let requests: Array<{ methodId: string; request: ProviderOAuthRequest }> = [];
let connected = 0;

// Browser-dependent UI modules are intentionally loaded after the happy-dom
// globals are installed; a static import would evaluate them too early.
const actualClient = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...actualClient,
  canonicalClient: {
    providerOAuth: async (_workspaceId: string, methodId: string, request: ProviderOAuthRequest): Promise<ProviderOAuthResult> => {
      requests.push({ methodId, request });
      if (request.action === 'start') return pending;
      if (request.action === 'input') return ready;
      if (request.action === 'commit') return authenticated;
      if (request.action === 'cancel') return cancelled;
      return pending;
    },
  },
}));
const actualUi = await import('@/components/ui');
mock.module('@/components/ui', () => ({
  ...actualUi,
  toast: { success: () => undefined, error: () => undefined },
}));

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ProviderOAuthMethods } = await import('./ProviderOAuthMethods');
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;

beforeEach(() => {
  requests = [];
  connected = 0;
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.replaceChildren();
});
afterAll(() => browser.close());

const click = async (label: string) => {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === label);
  if (!button) throw new Error(`Missing ${label} button`);
  await act(async () => button.dispatchEvent(new Event('click', { bubbles: true })));
};
const enter = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing input setter');
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const render = async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <ProviderOAuthMethods
          workspaceId="workspace"
          revision="7"
          methods={[{ methodId: 'login', providerId: 'openai', name: 'Sign in', storeCredentialsAs: 'openai' }]}
          onConnected={async () => { connected += 1; }}
        />
      </I18nProvider>,
    );
  });
};

test('manual OAuth code and commit keep the native flow identity and starting revision', async () => {
  await render();
  await click('Connect');
  await act(async () => { await Promise.resolve(); });
  expect(requests.find((entry) => entry.request.action === 'start')).toEqual({
    methodId: 'login',
    request: { action: 'start', expectedRevision: '7' },
  });

  const code = [...container.querySelectorAll('input')].find((input) => input.readOnly === false);
  if (!(code instanceof HTMLInputElement)) throw new Error('Missing manual code input');
  await enter(code, 'code-123');
  const form = code.closest('form');
  if (!form) throw new Error('Missing manual code form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => { await Promise.resolve(); });
  expect(requests.find((entry) => entry.request.action === 'input')).toEqual({
    methodId: 'login',
    request: { action: 'input', flowId: 'flow_1', generation: 'generation_1', input: 'code-123' },
  });

  await click('Complete');
  await act(async () => { await Promise.resolve(); });
  expect(requests.find((entry) => entry.request.action === 'commit')).toEqual({
    methodId: 'login',
    request: {
      action: 'commit',
      flowId: 'flow_1',
      generation: 'generation_1',
      expectedRevision: '7',
    },
  });
  expect(connected).toBe(1);
});

test('cancelling a pending flow retires exactly that flow', async () => {
  await render();
  await click('Connect');
  await act(async () => { await Promise.resolve(); });
  await click('Cancel');
  expect(requests.find((entry) => entry.request.action === 'cancel')).toEqual({
    methodId: 'login',
    request: { action: 'cancel', flowId: 'flow_1', generation: 'generation_1' },
  });
  expect(connected).toBe(0);
});
