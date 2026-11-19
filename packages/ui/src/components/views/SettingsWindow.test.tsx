<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
// The Shiki worker is a Vite `?worker&url` import that bun cannot load; SettingsView.test.tsx stubs it the same way.
mock.module('@/components/chat/markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));
mock.module('../chat/markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { WebSearchProviderEntry } from '@openchamber/agent-contract';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useUIStore } from '@/stores/useUIStore';
import { useWebSearchStore, getWebSearchScopeKey, type WebSearchSnapshot } from '@/stores/useWebSearchStore';
import { I18nProvider } from '@/lib/i18n';
import { RuntimeAPIContext } from '@/contexts/runtimeAPIContext';

// Loaded after the DOM globals are installed in beforeEach: the component reads them at import time.
let SettingsWindow: typeof import('./SettingsWindow').SettingsWindow;

const entry = (providerId: string, name: string, overrides: Partial<WebSearchProviderEntry> = {}): WebSearchProviderEntry => ({
  providerId,
  name,
  configured: true,
  requiresCredential: true,
  isSelfHosted: false,
  credentialConfigured: true,
  credentialWritable: true,
  ...overrides,
});

describe('Settings window keyboard drag', () => {
  let win: Window;
  let root: Root;
  let restoreGlobals: () => void;
  let closeCount: number;
  let saved: string[][];
  let fallbacks: string[];

  const section = () => {
    const element = document.querySelector<HTMLElement>('[data-settings-item="web-search.fallbacks"]');
    if (!element) throw new Error('The fallback section did not render inside Settings');
    return element;
  };
  const handles = () => Array.from(section().querySelectorAll<HTMLButtonElement>('button[aria-label^="Drag "]'));
  const firstHandle = () => {
    const handle = handles()[0];
    if (!handle) throw new Error('The first fallback handle did not render');
    return handle;
  };
  const rowNames = () => handles().map((handle) => handle.parentElement?.querySelector('.typography-ui-label.text-foreground')?.textContent);
  const placeRows = () => handles().forEach((handle, index) => {
    if (handle.parentElement) handle.parentElement.getBoundingClientRect = () => new DOMRect(0, index * 40, 400, 36);
  });
  const key = async (target: EventTarget, code: string) => {
    await act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key: code === 'Space' ? ' ' : code }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };

  beforeEach(async () => {
    win = new Window({ url: 'http://localhost' });
    const values = {
      window: win, document: win.document, navigator: win.navigator,
      Node: win.Node, Element: win.Element, HTMLElement: win.HTMLElement,
      HTMLButtonElement: win.HTMLButtonElement, HTMLInputElement: win.HTMLInputElement,
      HTMLIFrameElement: win.HTMLIFrameElement, SVGElement: win.SVGElement,
      Document: win.Document, DocumentFragment: win.DocumentFragment,
      DOMRect: win.DOMRect, Event: win.Event, CustomEvent: win.CustomEvent,
      MouseEvent: win.MouseEvent, KeyboardEvent: win.KeyboardEvent,
      MutationObserver: win.MutationObserver, ResizeObserver: win.ResizeObserver,
      localStorage: win.localStorage, getComputedStyle: win.getComputedStyle.bind(win), customElements: win.customElements,
      requestAnimationFrame: win.requestAnimationFrame.bind(win),
      cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true,
    };
    const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
    for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    restoreGlobals = () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    };
    ({ SettingsWindow } = await import('./SettingsWindow'));

    const providers = [
      entry('tavily', 'Tavily'),
      entry('brave', 'Brave Search'),
      entry('searxng', 'SearXNG', { requiresCredential: false, credentialConfigured: false }),
    ];
    fallbacks = ['brave', 'searxng'];
    saved = [];
    // The scope key includes the host directory, which resolves asynchronously; the snapshot must carry the current key.
    const publish = () => {
      const snapshot: WebSearchSnapshot = {
        workspaceId: 'workspace-1',
        scope: getWebSearchScopeKey(),
        revision: '1',
        enabled: true,
        selectedProviderId: 'tavily',
        fallbackProviderIds: fallbacks,
        timeoutSeconds: 30,
        providers,
      };
      useWebSearchStore.setState({ state: { kind: 'ready', snapshot } });
    };
    useWebSearchStore.setState({
      state: { kind: 'idle' },
      error: null,
      outcome: null,
      busy: false,
      load: async () => { },
      update: async (changes) => {
        if (changes.fallbackProviderIds) {
          saved.push(changes.fallbackProviderIds);
          fallbacks = changes.fallbackProviderIds;
        }
        publish();
        return true;
      },
    });
    publish();
    useUIStore.setState({ settingsPage: 'web-search', isSettingsDialogOpen: true });

    closeCount = 0;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(
      <RuntimeAPIContext.Provider value={{} as RuntimeAPIs}>
        <I18nProvider>
          <SettingsWindow open onOpenChange={(next) => { if (!next) closeCount += 1; }} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>,
    ));
    // The first render loads the dialog's page asynchronously, and the host directory can change the scope key meanwhile.
    for (let attempt = 0; attempt < 100 && !document.querySelector('[data-settings-item="web-search.fallbacks"]'); attempt += 1) {
      publish();
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    placeRows();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    useWebSearchStore.setState({ state: { kind: 'idle' } });
    await win.happyDOM.close();
    restoreGlobals();
  });

  test('a fallback picked up with Space moves with ArrowDown, drops, and saves the new order', async () => {
    expect(rowNames()).toEqual(['Brave Search', 'SearXNG']);
    firstHandle().focus();
    await key(firstHandle(), 'Space');
    await key(firstHandle(), 'ArrowDown');
    await key(firstHandle(), 'Space');

    expect(saved).toEqual([['searxng', 'brave']]);
    expect(rowNames()).toEqual(['SearXNG', 'Brave Search']);
    expect(closeCount).toBe(0);
  });

  test('Escape cancels a keyboard fallback drag without saving or closing Settings', async () => {
    firstHandle().focus();
    await key(firstHandle(), 'Space');
    await key(firstHandle(), 'ArrowDown');
    await key(firstHandle(), 'Escape');

    expect(firstHandle().getAttribute('aria-pressed')).not.toBe('true');
    expect(saved).toEqual([]);
    expect(rowNames()).toEqual(['Brave Search', 'SearXNG']);
    expect(closeCount).toBe(0);
    expect(document.querySelector('[data-settings-item="web-search.fallbacks"]')).not.toBeNull();
  });
});
||||||| bc50ba56aa
=======
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';

// The settings contents are unrelated to which surface Cmd/Ctrl+W closes, and
// the target registry has its own tests; this file checks the wiring between
// the window and that registry.
mock.module('./SettingsView', () => ({ SettingsView: () => null }));

const registrations: Array<{
  close: () => void;
  area: { current: Element | null };
  priority: number;
  released: boolean;
}> = [];

mock.module('@/lib/closeTabTarget', () => ({
  registerCloseTabTarget: (
    close: () => void,
    area: { current: Element | null },
    priority = 0,
  ) => {
    const registration = { close, area, priority, released: false };
    registrations.push(registration);
    return () => {
      registration.released = true;
    };
  },
}));

import { I18nProvider } from '@/lib/i18n';
let SettingsWindow: typeof import('./SettingsWindow').SettingsWindow;

let windowInstance: Window;
let host: HTMLDivElement;
let root: Root;
let descriptors: Map<string, PropertyDescriptor | undefined>;

beforeEach(async () => {
  registrations.length = 0;
  windowInstance = new Window({ url: 'http://localhost' });
  const globals = {
    window: windowInstance,
    document: windowInstance.document,
    HTMLElement: windowInstance.HTMLElement,
    Element: windowInstance.Element,
    Node: windowInstance.Node,
    Event: windowInstance.Event,
    MouseEvent: windowInstance.MouseEvent,
    ResizeObserver: windowInstance.ResizeObserver,
    MutationObserver: windowInstance.MutationObserver,
    requestAnimationFrame: windowInstance.requestAnimationFrame.bind(windowInstance),
    cancelAnimationFrame: windowInstance.cancelAnimationFrame.bind(windowInstance),
    localStorage: windowInstance.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  descriptors = new Map(Object.keys(globals).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.assign(globalThis, globals);
  ({ SettingsWindow } = await import('./SettingsWindow'));
  host = document.createElement('div');
  document.body.append(host);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await windowInstance.happyDOM.close();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

test('an open settings window registers a covering target that closes it', async () => {
  const changes: boolean[] = [];
  await act(async () => {
    root.render(<I18nProvider><SettingsWindow open onOpenChange={(next) => changes.push(next)} /></I18nProvider>);
  });

  expect(registrations).toHaveLength(1);
  const [registration] = registrations;
  expect(registration.priority).toBe(1);
  expect(registration.area.current).not.toBeNull();

  await act(async () => registration.close());
  expect(changes).toEqual([false]);
});

test('closing the settings window releases its target', async () => {
  await act(async () => {
    root.render(<I18nProvider><SettingsWindow open onOpenChange={() => undefined} /></I18nProvider>);
  });
  await act(async () => {
    root.render(<I18nProvider><SettingsWindow open={false} onOpenChange={() => undefined} /></I18nProvider>);
  });

  expect(registrations.map((registration) => registration.released)).toEqual([true]);
});

test('settings that never opened register nothing', async () => {
  await act(async () => {
    root.render(<I18nProvider><SettingsWindow open={false} onOpenChange={() => undefined} /></I18nProvider>);
  });

  expect(registrations).toHaveLength(0);
});
>>>>>>> upstream/main
