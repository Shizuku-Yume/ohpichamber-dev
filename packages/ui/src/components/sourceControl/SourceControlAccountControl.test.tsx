import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { SourceControlAuthStatus, SourceControlIdentity } from '@/lib/api/types';
import { getSourceControlAuthKey, useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';

const identity: SourceControlIdentity = { provider: 'gitlab', instance: 'https://gitlab.example' };
const connected: SourceControlAuthStatus = {
  ...identity, status: 'connected', connected: true,
  user: { ...identity, id: 'one', username: 'one' },
  accounts: [
    { id: 'one', credentialId: 'one', credentialRevision: 1, providerUserId: 'one', providerUserStatus: 'available', user: { ...identity, id: 'one', username: 'one' }, current: true, source: 'pat', status: 'valid' },
    { id: 'two', credentialId: 'two', credentialRevision: 1, providerUserId: 'two', providerUserStatus: 'available', user: { ...identity, id: 'two', username: 'two' }, current: false, source: 'pat', status: 'valid' },
  ],
};

let dom: Window;
let root: Root;
const globals = new Map<string, PropertyDescriptor | undefined>();

beforeEach(() => {
  dom = new Window({ url: 'http://localhost' });
  const values = {
    window: dom, document: dom.document, navigator: dom.navigator,
    localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
    Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement, HTMLButtonElement: dom.HTMLButtonElement,
    Event: dom.Event, CustomEvent: dom.CustomEvent, MouseEvent: dom.MouseEvent,
    PointerEvent: dom.PointerEvent, KeyboardEvent: dom.KeyboardEvent, FocusEvent: dom.FocusEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(values)) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  globals.clear();
  await dom.happyDOM.abort();
  dom.close();
});

test('a delayed source-control activation cannot replace the next runtime status', async () => {
  const { promise, resolve } = Promise.withResolvers<SourceControlAuthStatus>();
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
  try {
    // These modules initialize browser-dependent stores on import, after the test window is installed.
    const { createRoot } = await import('react-dom/client');
    const { createWebAPIs } = await import('../../../../web/src/api/index');
    const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
    const { I18nProvider } = await import('@/lib/i18n');
    const { SourceControlAccountControl } = await import('./SourceControlAccountControl');
    const apis = createWebAPIs();
    let calls = 0;
    apis.sourceControl.authActivate = async () => { calls += 1; return promise; };
    useSourceControlAuthStore.getState().setStatus(identity, connected);
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => root.render(<I18nProvider><RuntimeAPIContext.Provider value={apis}><SourceControlAccountControl identity={identity} /></RuntimeAPIContext.Provider></I18nProvider>));
    const trigger = host.querySelector<HTMLElement>('[data-slot="dropdown-menu-trigger"]');
    expect(trigger).not.toBeNull();
    await act(async () => {
      trigger!.focus();
      trigger!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes('two'));
    expect(item).toBeDefined();
    await act(async () => { item!.click(); });
    expect(calls).toBe(1);
    const nextStatus: SourceControlAuthStatus = { ...identity, status: 'disconnected', connected: false };
    await act(async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'https://host-b.example', runtimeKey: 'host-b' });
      useSourceControlAuthStore.getState().resetForRuntimeSwitch();
      useSourceControlAuthStore.getState().setStatus(identity, nextStatus);
      resolve(connected);
      await promise;
    });
    expect(useSourceControlAuthStore.getState().entries[getSourceControlAuthKey(identity)]?.status).toEqual(nextStatus);
  } finally {
    fetchSpy.mockRestore();
  }
});
