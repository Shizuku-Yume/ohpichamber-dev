import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { ComponentProps } from 'react';
import type { Root } from 'react-dom/client';
import type { ModelPickerEntry, ModelPickerProvider } from './ModelPickerList';
import type { Model } from '@openchamber/agent-contract';

// react-dom freezes canUseDOM/globalDocument at module evaluation, so a DOM
// must exist before it loads; the per-test Window below replaces this one.
const preloadWindow = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: preloadWindow,
  document: preloadWindow.document,
  navigator: preloadWindow.navigator,
  localStorage: preloadWindow.localStorage,
  sessionStorage: preloadWindow.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { ModelPickerList } = await import('./ModelPickerList');

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
  makeProvider('labcloud', 'Lab Cloud', [makeModel('labcloud', 'ds-flash', 'DeepSeek V4.1 Flash')]),
  makeProvider('labrouter', 'Lab Router', [makeModel('labrouter', 'ds-flash', 'DeepSeek V4.1 Flash')]),
];
const favorites = providers.map((provider) => ({
  providerID: provider.providerId,
  modelID: 'ds-flash',
  model: provider.models![0],
}));
const autoEntry: ModelPickerEntry = {
  providerId: 'openchamber-auto',
  modelId: 'auto',
  model: makeModel('openchamber-auto', 'auto', 'Auto'),
};

const labels = {
  searchPlaceholder: 'Search models',
  list: 'Models',
  noResults: 'No models found',
  favorites: 'Favorites',
  recent: 'Recent',
  keyboardHint: 'navigate',
  favorite: 'Favorite',
  unfavorite: 'Unfavorite',
  provider: 'Provider',
  capabilities: 'Capabilities',
  capabilityToolCalling: 'Tools',
  capabilityReasoning: 'Reasoning',
  input: 'Input',
  output: 'Output',
  costPerMillion: 'per 1M tokens',
};

const renderPicker = async (props: Partial<ComponentProps<typeof ModelPickerList>> = {}) => {
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
        onSearchQueryChange={() => { }}
        onSelect={() => { }}
        labels={labels}
        {...props}
      />,
    );
  });
  return host;
};

describe('ModelPickerList row tooltips', () => {
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
      ResizeObserver: class { observe() { } unobserve() { } disconnect() { } },
      IntersectionObserver: class { observe() { } unobserve() { } disconnect() { } },
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

  test('mounts without errors', async () => {
    const host = await renderPicker({ favoriteModels: favorites, leadingEntry: autoEntry });
    expect(host).toBeTruthy();
  });
});
