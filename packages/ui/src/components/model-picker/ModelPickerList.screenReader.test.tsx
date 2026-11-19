import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ModelPickerList, type ModelPickerProvider } from './ModelPickerList';
import type { Model } from '@openchamber/agent-contract';

const makeModel = (provider: string, modelId: string, name: string): Model => ({
  modelId,
  provider,
  name,
  modalities: ['text'],
  contextWindow: 128000,
  maxOutputTokens: 4096,
  reasoningEffortSupported: false,
  reasoningOptions: [],
  variants: [],
  pricing: null,
});

const makeProvider = (providerId: string, name: string, models: Model[] = []): ModelPickerProvider => ({
  providerId,
  name,
  endpoint: null,
  protocol: null,
  authMethods: [],
  auth: { status: 'missing' },
  models,
});

let root: Root | null = null;
let restoreGlobals: () => void;
let restoreFetch: () => void;
const globals = new Map<string, PropertyDescriptor | undefined>();

const providers: ModelPickerProvider[] = [
  makeProvider('labsmall', 'Lab Small', [makeModel('labsmall', 'alpha', 'Alpha'), makeModel('labsmall', 'beta', 'Beta')]),
  makeProvider('labbig', 'Lab Big', Array.from({ length: 60 }, (_, index) => makeModel('labbig', `big-${index + 1}`, `Big Model ${index + 1}`))),
];
const favorite = { providerID: 'labsmall', modelID: 'beta', model: providers[0].models![1] };

const labels = {
  searchPlaceholder: 'Search models',
  list: 'Models',
  noResults: 'No models found',
  favorites: 'Favorites',
  recent: 'Recent',
  keyboardHint: 'navigate',
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
};

const renderPicker = async (props: Partial<React.ComponentProps<typeof ModelPickerList>> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(
      <ModelPickerList
        providers={providers}
        favoriteModels={[]}
        recentModels={[]}
        searchQuery=""
        onSearchQueryChange={() => {}}
        onSelect={() => {}}
        labels={labels}
        {...props}
      />,
    );
  });
  return host;
};

describe('ModelPickerList screen reader semantics', () => {
  beforeEach(() => {
    const dom = new Window({ url: 'http://localhost' });
    const domGlobals = {
      window: dom,
      document: dom.document,
      navigator: dom.navigator,
      location: dom.location,
      localStorage: dom.localStorage,
      Element: dom.Element,
      HTMLElement: dom.HTMLElement,
      Node: dom.Node,
      Event: dom.Event,
      CustomEvent: dom.CustomEvent,
      MouseEvent: dom.MouseEvent,
      PointerEvent: dom.PointerEvent,
      KeyboardEvent: dom.KeyboardEvent,
      IS_REACT_ACT_ENVIRONMENT: true,
      requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(cb, 0),
      cancelAnimationFrame: (id: number) => clearTimeout(id),
      ResizeObserver: class { observe() {} unobserve() {} disconnect() {} },
      IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    };
    for (const [name, value] of Object.entries(domGlobals)) {
      globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
    restoreFetch = () => { globalThis.fetch = originalFetch; };
    restoreGlobals = () => {
      for (const [name, descriptor] of globals.entries()) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      globals.clear();
      restoreFetch();
    };
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
    restoreGlobals?.();
  });

<<<<<<< HEAD
  test('gives every section a role="group" and an accessible name', async () => {
    const host = await renderPicker({ favoriteModels: [favorite], recentModels: [favorite] });
    const groups = Array.from(host.querySelectorAll<HTMLElement>('[role="group"]'));
    expect(groups.length).toBeGreaterThanOrEqual(3);
    const names = groups.map((group) => group.getAttribute('aria-label'));
    expect(names).toContain(labels.favorites);
    expect(names).toContain(labels.recent);
    expect(names).toContain(providers[0].name);
  });
});
||||||| bc50ba56aa
/** The name a screen reader reads for a row, from its aria-labelledby. */
const rowName = (row: Element) => (row.getAttribute('aria-labelledby') ?? '')
  .split(' ')
  .map((id) => document.getElementById(id)?.textContent)
  .filter(Boolean)
  .join(' ');

const highlightedRow = () => document.querySelector('[role="option"].bg-interactive-selection');

test('the search field is a combobox that points at the highlighted row as arrows move', async () => {
  await renderPicker();
  const listbox = document.querySelector('[role="listbox"]');
  expect(field().getAttribute('role')).toBe('combobox');
  expect(field().getAttribute('aria-controls')).toBe(listbox?.id ?? null);
  expect(listbox?.getAttribute('aria-label')).toBe('Models');

  expect(activeRow()).toBe(highlightedRow());
  expect(rowName(activeRow()!)).toBe('Alpha');

  await press('ArrowDown');
  const row = activeRow()!;
  expect(row).toBe(highlightedRow());
  expect(row.getAttribute('role')).toBe('option');
  // The star button inside the row is left out of its name.
  expect(rowName(row)).toBe('Beta');
  expect(row.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Lab Small');
  expect(row.closest('[role="listbox"]')).toBe(listbox);
});

test('a favorite row, which shows its provider only as a logo, names the provider', async () => {
  await renderPicker([favorite]);
  const row = activeRow()!;
  expect(row.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Favorites');
  expect(rowName(row)).toBe('Beta Lab Small');
});

test('the field never points at a row that is not in the page', async () => {
  await renderPicker();
  // Up from the first row wraps to the last row of the long section, which is
  // not mounted until the list scrolls to it.
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowDown'] as const) {
    await press(key);
    const id = field().getAttribute('aria-activedescendant');
    if (id) expect(activeRow()).toBe(highlightedRow());
    else expect(highlightedRow()).toBeNull();
  }
});
=======
/** The name a screen reader reads for a row, from its aria-labelledby. */
const rowName = (row: Element) => (row.getAttribute('aria-labelledby') ?? '')
  .split(' ')
  .map((id) => document.getElementById(id)?.textContent)
  .filter(Boolean)
  .join(' ');

const highlightedRow = () => document.querySelector('[role="option"].oc-selected');

test('the search field is a combobox that points at the highlighted row as arrows move', async () => {
  await renderPicker();
  const listbox = document.querySelector('[role="listbox"]');
  expect(field().getAttribute('role')).toBe('combobox');
  expect(field().getAttribute('aria-controls')).toBe(listbox?.id ?? null);
  expect(listbox?.getAttribute('aria-label')).toBe('Models');

  expect(activeRow()).toBe(highlightedRow());
  expect(rowName(activeRow()!)).toBe('Alpha');

  await press('ArrowDown');
  const row = activeRow()!;
  expect(row).toBe(highlightedRow());
  expect(row.getAttribute('role')).toBe('option');
  // The star button inside the row is left out of its name.
  expect(rowName(row)).toBe('Beta');
  expect(row.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Lab Small');
  expect(row.closest('[role="listbox"]')).toBe(listbox);
});

test('a favorite row, which shows its provider only as a logo, names the provider', async () => {
  await renderPicker([favorite]);
  const row = activeRow()!;
  expect(row.closest('[role="group"]')?.getAttribute('aria-label')).toBe('Favorites');
  expect(rowName(row)).toBe('Beta Lab Small');
});
>>>>>>> upstream/main
