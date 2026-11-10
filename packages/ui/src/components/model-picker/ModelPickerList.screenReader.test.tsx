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

<<<<<<< HEAD
const renderPicker = async (props: Partial<React.ComponentProps<typeof ModelPickerList>> = {}) => {
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
=======
beforeEach(async () => {
  dom = new Window({ url: 'http://localhost', width: 1280, height: 800 });
  const values = {
    window: dom, document: dom.document, navigator: dom.navigator,
    localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
    Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement, HTMLButtonElement: dom.HTMLButtonElement,
    SVGElement: dom.SVGElement, Document: dom.Document, ShadowRoot: dom.ShadowRoot,
    Event: dom.Event, MouseEvent: dom.MouseEvent, PointerEvent: dom.PointerEvent,
    KeyboardEvent: dom.KeyboardEvent, CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(values)) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  // happy-dom lays nothing out; the list's scroller gets a menu's height so
  // the virtual list mounts the rows in view, as it does in a browser.
  for (const [name, size] of [['clientHeight', 400], ['clientWidth', 380]] as const) {
    Object.defineProperty(dom.HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) { return this.classList.contains('overlay-scrollbar-target') ? size : 0; },
    });
  }
  // The stores this list reads start background loads; keep them pending.
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  restoreFetch = () => fetch.mockRestore();
  ({ ModelPickerList } = await import('./ModelPickerList'));
  host = document.createElement('div');
  document.body.appendChild(host);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  restoreFetch();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  globals.clear();
  await dom.happyDOM.abort();
  dom.close();
});

const renderPicker = async (favoriteModels: ModelPickerEntry[] = []) => {
>>>>>>> bc50ba56a
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
