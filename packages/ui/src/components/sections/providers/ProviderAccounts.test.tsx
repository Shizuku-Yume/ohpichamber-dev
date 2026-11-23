import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import type { ProviderAccounts, ProviderAccountMutationRequest } from '@openchamber/agent-contract';
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
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
let requests: ProviderAccountMutationRequest[];
const roster = (overrides: Partial<ProviderAccounts> = {}): ProviderAccounts => ({
  revision: '7', providerId: 'openai', selectionMode: 'automatic', selectionOverriddenBy: null,
  accounts: [
    { credentialRef: 'first', label: 'First', method: 'api-key', active: false, disabled: false },
    { credentialRef: 'second', label: 'Second', method: 'oauth', active: false, disabled: false },
  ],
  ...overrides,
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

const render = async (value = roster(), busyId: string | null = null, disabled = false) => {
  await act(async () => root.render(
    <I18nProvider>
      <Accounts roster={value} busyId={busyId} disabled={disabled} onMutate={(request) => requests.push(request)} />
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
  const value = roster({ selectionMode: 'pinned' });
  value.accounts[0]!.active = true;
  await render(value);
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
    await render(roster({ selectionOverriddenBy: source }));
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
  const value = roster({ selectionMode: 'pinned' });
  value.accounts.push({ credentialRef: 'expired', label: 'Expired', method: 'oauth', active: true, disabled: true });
  await render(value);
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(container.textContent?.match(/Pinned/g)).toHaveLength(1);
  expect(container.textContent).toContain('Sign in again');
});

test('a missing pinned account selects no chip and shows no badge', async () => {
  await render(roster({ selectionMode: 'pinned' }));
  expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
  expect(container.textContent).not.toContain('Pinned');
  await click('Automatic');
  expect(requests).toEqual([{ action: 'automatic', expectedRevision: '7' }]);
});
