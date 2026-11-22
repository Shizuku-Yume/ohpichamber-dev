import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const browser = new Window({ url: 'http://localhost' });
let root: Root;
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage, Node: browser.Node, Event: browser.Event, MouseEvent: browser.MouseEvent, PointerEvent: browser.PointerEvent, KeyboardEvent: browser.KeyboardEvent, MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver, Element: browser.Element, HTMLElement: browser.HTMLElement, getComputedStyle: browser.getComputedStyle.bind(browser), requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useConfirmDialog } = await import('./confirm-dialog');

type Confirmation = { confirmed: boolean; checkboxChecked: boolean };
function Harness({ onResult, raised = false }: { onResult: (result: Confirmation) => void; raised?: boolean }) {
  const { confirmWithCheckbox, dialog } = useConfirmDialog(raised ? { layerClassName: 'z-[70]', backdropProps: { className: 'z-[70]' } } : undefined);
  const ask = React.useCallback(async () => {
    const result = await confirmWithCheckbox({
      title: 'Delete archive?',
      message: 'The local branch is kept by default.',
      action: 'Confirm delete',
      checkbox: { label: 'Also delete local branch', defaultChecked: false },
    });
    onResult(result);
  }, [confirmWithCheckbox, onResult]);
  React.useEffect(() => { void ask(); }, [ask]);
  return <>{dialog}<button onClick={() => { void ask(); }}>Ask again</button></>;
}

beforeEach(() => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

afterAll(async () => {
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

const render = async (element: React.ReactNode) => {
  await act(async () => root.render(<I18nProvider>{element}</I18nProvider>));
};

test("confirmed archive deletion carries the user's keep-or-delete branch choice", async () => {
  const results: Confirmation[] = [];
  const onResult = (result: Confirmation) => results.push(result);
  await render(<Harness onResult={onResult} />);
  expect(document.querySelector('[data-slot="dialog-layer"]')?.classList.contains('z-50')).toBe(true);
  expect(document.querySelector('[data-slot="dialog-overlay"]')?.classList.contains('z-50')).toBe(true);
  const confirm = () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Confirm delete');
  const keepBranch = confirm();
  if (!keepBranch) throw new Error('Confirmation action is missing');
  await act(async () => keepBranch.click());
  expect(results).toEqual([{ confirmed: true, checkboxChecked: false }]);

  const askAgain = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Ask again');
  if (!askAgain) throw new Error('The confirmation cannot be asked again');
  await act(async () => askAgain.click());
  const checkbox = document.querySelector('[aria-label="Also delete local branch"]');
  const deleteBranch = confirm();
  if (!(checkbox instanceof HTMLElement) || !deleteBranch) throw new Error('Branch choice controls are missing');
  await act(async () => checkbox.click());
  await act(async () => deleteBranch.click());
  expect(results).toEqual([
    { confirmed: true, checkboxChecked: false },
    { confirmed: true, checkboxChecked: true },
  ]);
});

test('confirmation layer overrides raise both the popup and backdrop without changing dismissal', async () => {
  const results: Confirmation[] = [];
  await render(<Harness raised onResult={(result) => results.push(result)} />);
  expect(document.querySelector('[data-slot="dialog-layer"]')?.classList.contains('z-[70]')).toBe(true);
  expect(document.querySelector('[data-slot="dialog-overlay"]')?.classList.contains('z-[70]')).toBe(true);
  const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Cancel');
  if (!cancel) throw new Error('Cancel action is missing');
  await act(async () => cancel.click());
  expect(results).toEqual([{ confirmed: false, checkboxChecked: false }]);
  expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
});
