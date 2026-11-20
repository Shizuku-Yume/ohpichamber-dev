import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { mock } from 'bun:test';
mock.module('@/hooks/useChatSearchDirectory', () => ({ useChatSearchDirectory: () => '/repo' }));
mock.module('@/hooks/useRuntimeAPIs', () => ({ useRuntimeAPIs: () => ({ files: { statFile: async () => ({}) } }) }));
const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  Event: browser.Event,
  CustomEvent: browser.CustomEvent,
  KeyboardEvent: browser.KeyboardEvent,
  PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  localStorage: browser.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { FileMentionAutocomplete } = await import('./FileMentionAutocomplete');

let container: HTMLDivElement;
let root: Root;

const settle = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await act(async () => { await promise; });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test('FileMentionAutocomplete offers OMP internal URL schemes (skill://, local://, proc://, agent://, history://)', async () => {
  let selected: { path: string } | null = null;
  await act(async () => {
    root.render(
      <I18nProvider>
        <FileMentionAutocomplete
          searchQuery="skill"
          onFileSelect={file => { selected = file; }}
          onClose={() => {}}
        />
      </I18nProvider>
    );
  });
  await settle();

  expect(container.textContent).toContain('skill://');
  const skillOption = container.querySelector('[aria-label="skill://"]');
  expect(skillOption).not.toBeNull();
  if (skillOption instanceof HTMLElement) {
    await act(async () => { skillOption.click(); });
    expect(selected).toMatchObject({ path: 'skill://' });
  }
});

test('FileMentionAutocomplete lists all 5 OMP internal schemes on empty query', async () => {
  await act(async () => {
    root.render(
      <I18nProvider>
        <FileMentionAutocomplete
          searchQuery=""
          onFileSelect={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>
    );
  });
  await settle();

  for (const scheme of ['skill://', 'local://', 'proc://', 'agent://', 'history://']) {
    expect(container.textContent).toContain(scheme);
  }
});
