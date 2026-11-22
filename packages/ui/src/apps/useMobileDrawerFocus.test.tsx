import React, { act } from 'react';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useMobileDrawerFocus } from './useMobileDrawerFocus';

let root: Root;
let host: HTMLElement;
let opener: HTMLButtonElement;
let restoreGlobals: () => void;

beforeEach(() => {
  const dom = new Window();
  const globals = { window: dom, document: dom.document, HTMLElement: dom.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true };
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  Object.assign(globalThis, globals);
  restoreGlobals = () => {
    for (const key of Object.keys(globals)) {
      const descriptor = descriptors[key];
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  host = document.createElement('div');
  opener = document.createElement('button');
  document.body.append(opener, host);
  root = createRoot(host);
  opener.focus();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  opener.remove();
  restoreGlobals();
});

function Drawer({ open, enabled = true }: { open: boolean; enabled?: boolean }) {
  const ref = React.useRef<HTMLElement>(null);
  useMobileDrawerFocus(ref, open && enabled);
  return <section ref={ref} tabIndex={-1} inert={!open}><input /><button>Close</button></section>;
}

const render = async (open: boolean, enabled = true) => {
  act(() => root.render(<Drawer open={open} enabled={enabled} />));
  await act(async () => { await new Promise(resolve => window.setTimeout(resolve, 30)); });
};

test('opening focuses the drawer without raising a keyboard, closing restores its opener', async () => {
  await render(false);
  expect(document.activeElement).toBe(opener);
  await render(true);
  expect(document.activeElement).toBe(host.querySelector('section'));
  host.querySelector('button')?.focus();
  await render(false);
  expect(document.activeElement).toBe(opener);
  expect(host.querySelector('section')?.hasAttribute('inert')).toBe(true);
});

test('closing preserves focus already moved to another overlay', async () => {
  await render(true);
  opener.focus();
  const overlay = document.createElement('button');
  document.body.append(overlay);
  overlay.focus();
  await render(false);
  expect(document.activeElement).toBe(overlay);
  overlay.remove();
});

test('a rapid close cancels delayed entry focus', async () => {
  act(() => root.render(<Drawer open />));
  await render(false);
  expect(document.activeElement).toBe(opener);
});

test('inline panels do not own or restore modal focus', async () => {
  await render(true, false);
  expect(document.activeElement).toBe(opener);
  host.querySelector('input')?.focus();
  await render(false, false);
  expect(document.activeElement).not.toBe(opener);
});
