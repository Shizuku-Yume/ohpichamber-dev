import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { ProviderAccountMutationRequest } from '@openchamber/agent-contract';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement, HTMLInputElement: browser.HTMLInputElement,
  CustomEvent: browser.CustomEvent, Event: browser.Event, MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver, getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const transport = await import('@/lib/runtime-fetch');
const startupFetch = spyOn(transport, 'runtimeFetch').mockImplementation(async () => Response.json({}));
const { canonicalClient } = await import('@/api/canonicalClient');
const directoryHook = await import('@/hooks/useSettingsDirectory');
const { useUIStore } = await import('@/stores/useUIStore');
const { I18nProvider } = await import('@/lib/i18n');
const { ProvidersPage } = await import('./ProvidersPage');
const { toast } = await import('@/components/ui');
startupFetch.mockRestore();
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
let restores: Array<{ mockRestore(): void }>;
let selectionStatus: number;
let selectionReads: number;
let mutations: ProviderAccountMutationRequest[];
const accounts = { revision: '7', providerId: 'openai', accounts: [
  { credentialRef: 'first', method: 'api-key' as const, label: 'First', active: true, disabled: false },
  { credentialRef: 'second', method: 'api-key' as const, label: 'Second', active: false, disabled: false },
] };

beforeEach(() => {
  selectionStatus = 404;
  selectionReads = 0;
  mutations = [];
  useUIStore.setState({ settingsProvidersOpenRequested: 'openai' });
  restores = [
    spyOn(directoryHook, 'useSettingsDirectory').mockReturnValue('/workspace'),
    spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace', displayPath: 'workspace' }),
    spyOn(canonicalClient, 'getProviders').mockResolvedValue({ workspaceId: 'workspace', revision: '7', providers: [
      { providerId: 'openai', name: 'OpenAI', endpoint: null, protocol: null, authMethods: ['api-key'], auth: { status: 'configured', credentialRef: 'first', source: 'stored-credential', method: 'api-key' } },
    ] }),
    spyOn(canonicalClient, 'getModels').mockResolvedValue({ workspaceId: 'workspace', revision: '7', models: [], imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: false }),
    spyOn(canonicalClient, 'providerOAuthMethods').mockResolvedValue({ methods: [] }),
    spyOn(canonicalClient, 'providerAccounts').mockResolvedValue(accounts),
    spyOn(canonicalClient, 'providerConfiguration').mockResolvedValue({ revision: '7', configuration: { providerId: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', protocol: 'chat-completions', credentialRef: null }, models: [], imageModels: [], headerNames: [] }),
    spyOn(canonicalClient, 'mutateProviderAccount').mockImplementation(async (_workspace, _provider, request) => {
      mutations.push(request);
      return { ...accounts, revision: '8' };
    }),
    spyOn(transport, 'runtimeFetch').mockImplementation(async (path) => {
      if (String(path).endsWith('/account-selection')) {
        selectionReads += 1;
        if (selectionStatus === 200) return Response.json({ revision: '7', providerId: 'openai', selectionMode: 'automatic', pinnedCredentialRef: null, selectionOverriddenBy: null });
        const code = selectionStatus === 404 ? 'NOT_IMPLEMENTED' : 'SERVICE_UNAVAILABLE';
        return Response.json({ type: `urn:ohpichamber:problem:${code}`, title: 'Request refused', status: selectionStatus,
          code, detail: selectionStatus === 404 ? 'No canonical operation matches this route.' : 'Selection service unavailable.', retryable: selectionStatus >= 500 }, { status: selectionStatus });
      }
      return Response.json({});
    }),
  ];
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  while (restores.length) restores.pop()?.mockRestore();
  container.replaceChildren();
});
afterAll(() => browser.close());
const render = async () => {
  await act(async () => root.render(<I18nProvider><ProvidersPage /></I18nProvider>));
};

test('older Hosts render legacy account controls and recheck selection after Use', async () => {
  await render();
  expect(container.textContent).toContain('Active');
  expect(container.textContent).not.toContain('Automatic');
  expect(container.querySelector('[role="group"]')).toBeNull();
  const use = container.querySelector<HTMLButtonElement>('[aria-label="Use Second"]');
  expect(use).not.toBeNull();
  const reads = selectionReads;
  await act(async () => use!.click());
  expect(mutations).toEqual([{ action: 'select', expectedRevision: '7', credentialRef: 'second' }]);
  expect(selectionReads).toBeGreaterThan(reads);
});

test('non-404 selection failure renders the existing load-error path rather than legacy controls', async () => {
  selectionStatus = 503;
  await render();
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain('Try again');
  expect(container.querySelector('[aria-label="Use Second"]')).toBeNull();
  expect(container.textContent).not.toContain('Automatic');
  expect(mutations).toEqual([]);
});

test('pin feedback uses the same unlabeled API-key name as the account chip and row', async () => {
  selectionStatus = 200;
  const roster = { ...accounts, accounts: accounts.accounts.map((account) => ({ ...account, label: undefined, credentialRef: `credential_${account.credentialRef}` })) };
  restores.push(spyOn(canonicalClient, 'providerAccounts').mockResolvedValue(roster));
  const feedback = spyOn(toast, 'success');
  restores.push(feedback);
  await render();
  const chip = [...container.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.trim() === 'API key 2');
  expect(chip).toBeDefined();
  expect(container.textContent?.match(/API key 2/g)).toHaveLength(2);
  await act(async () => chip!.click());
  expect(mutations).toEqual([{ action: 'select', expectedRevision: '7', credentialRef: 'credential_second' }]);
  expect(feedback).toHaveBeenCalledWith('Switched to API key 2');
});
