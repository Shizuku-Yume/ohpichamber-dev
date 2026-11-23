import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import type { ProviderAccounts, ProviderAccountSelection, ProviderAccountMutationRequest } from '@openchamber/agent-contract';
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

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { ProviderAccounts: Accounts } = await import('./ProviderAccounts');
const { CanonicalClient } = await import('@/api/canonicalClient');
const transport = await import('@/lib/runtime-fetch');
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
let requests: ProviderAccountMutationRequest[];
const roster = (overrides: Partial<ProviderAccounts> = {}): ProviderAccounts => ({
  revision: '7', providerId: 'openai',
  accounts: [
    { credentialRef: 'first', label: 'First', method: 'api-key', active: false, disabled: false },
    { credentialRef: 'second', label: 'Second', method: 'oauth', active: false, disabled: false },
  ],
  ...overrides,
});
const selection = (overrides: Partial<ProviderAccountSelection> = {}): ProviderAccountSelection => ({
  revision: '7', providerId: 'openai', selectionMode: 'automatic', pinnedCredentialRef: null, selectionOverriddenBy: null, ...overrides,
});
beforeEach(() => {
  requests = [];
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.replaceChildren();
});
afterAll(() => browser.close());

const render = async (value = roster(), busyId: string | null = null, disabled = false, state: ProviderAccountSelection | null = selection()) => {
  await act(async () => root.render(
    <I18nProvider>
      <Accounts roster={value} selection={state} busyId={busyId} disabled={disabled} onMutate={(request) => requests.push(request)} />
    </I18nProvider>,
  ));
};
const button = (label: string) => {
  const found = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
};
const click = async (label: string) => {
  await act(async () => button(label).click());
};

test('automatic mode has no pinned row and explains native selection and backoff', async () => {
  await render();
  expect(button('Automatic').getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('OMP picks among enabled accounts and handles rate-limit backoff.');
  expect(container.textContent).not.toContain('Pinned');
  expect(container.querySelector('[aria-label="Pin First"]')).toBeNull();
  await click('First');
  expect(requests).toEqual([{ action: 'select', expectedRevision: '7', credentialRef: 'first' }]);
});

test('pinned mode marks its account and Automatic sends no credential ref', async () => {
  const value = roster();
  value.accounts[0]!.active = true;
  await render(value, null, false, selection({ selectionMode: 'pinned', pinnedCredentialRef: 'first' }));
  expect(button('First').getAttribute('aria-pressed')).toBe('true');
  expect(button('Automatic').getAttribute('aria-pressed')).toBe('false');
  expect(container.textContent?.match(/Pinned/g)).toHaveLength(1);
  expect(container.textContent).not.toContain('OMP picks');
  await click('Automatic');
  expect(requests).toEqual([{ action: 'automatic', expectedRevision: '7' }]);
});

test('the selection control can pin an enabled account', async () => {
  await render();
  await click('Second');
  expect(requests).toEqual([{ action: 'select', expectedRevision: '7', credentialRef: 'second' }]);
});

test('higher-precedence sources explain the override and disable all selection controls', async () => {
  for (const [source, wording] of [
    ['managed-environment', 'A managed credential'],
    ['external-environment', 'An external credential'],
    ['stored-credential', 'A stored credential'],
  ] as const) {
    await render(roster(), null, false, selection({ selectionOverriddenBy: source }));
    expect(container.textContent).toContain(`${wording} takes precedence; account selection does not apply.`);
    for (const label of ['Automatic', 'First', 'Second']) {
      expect(button(label).disabled).toBe(true);
      await click(label);
    }
  }
  expect(requests).toEqual([]);
});

test('disabled accounts keep reauthentication state and cannot be pinned', async () => {
  const value = roster();
  value.accounts.push({ credentialRef: 'expired', label: 'Expired', method: 'oauth', active: false, disabled: true });
  await render(value);
  expect(container.textContent).toContain('Sign in again');
  expect(container.querySelector('[aria-label="Pin Expired"]')).toBeNull();
  expect(container.querySelectorAll('[aria-pressed]')).toHaveLength(3);
});

test('empty and single-enabled rosters have no selection control', async () => {
  await render(roster({ accounts: [] }));
  expect(container.querySelector('[role="group"]')).toBeNull();
  const value = roster();
  value.accounts[1]!.disabled = true;
  await render(value);
  expect(container.querySelector('[role="group"]')).toBeNull();
  expect(container.querySelector('[aria-label="Pin First"]')).toBeNull();
  expect(container.textContent).toContain('Sign in again');
});

test('pending mutations and unavailable provider state disable selection', async () => {
  for (const [busyId, disabled] of [['automatic', false], [null, true]] as const) {
    await render(roster(), busyId, disabled);
    expect(button('Automatic').disabled).toBe(true);
    expect(button('First').disabled).toBe(true);
    await click('First');
  }
  expect(requests).toEqual([]);
});

test('a disabled pin keeps its row badge but selects no enabled chip', async () => {
  const value = roster();
  value.accounts.push({ credentialRef: 'expired', label: 'Expired', method: 'oauth', active: true, disabled: true });
  await render(value, null, false, selection({ selectionMode: 'pinned', pinnedCredentialRef: 'expired' }));
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(container.textContent?.match(/Pinned/g)).toHaveLength(1);
  expect(container.textContent).toContain('Sign in again');
});

test('a missing pinned account selects no chip and shows no badge', async () => {
  await render(roster(), null, false, selection({ selectionMode: 'pinned', pinnedCredentialRef: 'missing' }));
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(container.textContent).not.toContain('Pinned');
  await click('Automatic');
  expect(requests).toEqual([{ action: 'automatic', expectedRevision: '7' }]);
});

test('an older Host unknown-route response renders the legacy Active and Use UI', async () => {
  const fetch = spyOn(transport, 'runtimeFetch').mockResolvedValue(Response.json({
    type: 'urn:ohpichamber:problem:NOT_IMPLEMENTED', title: 'Request refused', status: 404,
    code: 'NOT_IMPLEMENTED', detail: 'No canonical operation matches this route.', retryable: false,
  }, { status: 404 }));
  try {
    const state = await new CanonicalClient().providerAccountSelection('workspace', 'openai');
    const value = roster();
    value.accounts[0]!.active = true;
    await render(value, null, false, state);
    expect(state).toBeNull();
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(container.textContent).toContain('Active');
    expect(container.textContent).not.toContain('Automatic');
    expect(container.textContent).not.toContain('Pinned');
    await click('Use Second');
    expect(requests).toEqual([{ action: 'select', expectedRevision: '7', credentialRef: 'second' }]);
  } finally { fetch.mockRestore(); }
});

test('supported automatic state ignores the legacy projected active account', async () => {
  const value = roster();
  value.accounts[0]!.active = true;
  await render(value);
  expect(button('Automatic').getAttribute('aria-pressed')).toBe('true');
  expect(button('First').getAttribute('aria-pressed')).toBe('false');
  expect(container.textContent).not.toContain('Pinned');
});
