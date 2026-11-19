import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';

test('opens Git Settings after repository configuration finishes closing', async () => {
  const dom = new Window({ url: 'http://localhost' });
  const values = {
    window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
    Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement, HTMLButtonElement: dom.HTMLButtonElement,
    HTMLInputElement: dom.HTMLInputElement, DocumentFragment: dom.DocumentFragment,
    Event: dom.Event, CustomEvent: dom.CustomEvent, MouseEvent: dom.MouseEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  const previous = Object.keys(values).map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  for (const [name, value] of Object.entries(values)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://localhost');
    if (url.pathname === '/api/fs/home') return Response.json({ home: '/sandbox' });
    if (url.pathname === '/api/config/settings') return Response.json({});
    return new Response(null, { status: 503 });
  }, originalFetch);
  const { createRoot } = await import('react-dom/client');
  const { I18nProvider } = await import('@/lib/i18n');
  const { useUIStore } = await import('@/stores/useUIStore');
  const { RepositoryConfigurationDialog } = await import('./SourceControlBindingSettings');
  const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
  const { createWebAPIs } = await import('../../../../../web/src/api/index');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const Harness = () => {
    const [open, setOpen] = React.useState(true);
    return <RepositoryConfigurationDialog open={open} onOpenChange={setOpen} directory="" />;
  };
  useUIStore.setState({ isSettingsDialogOpen: false, settingsPage: 'home' });
  const dialogsAtSettingsOpen: number[] = [];
  const unsubscribe = useUIStore.subscribe((state, previous) => {
    if (state.isSettingsDialogOpen && !previous.isSettingsDialogOpen) {
      dialogsAtSettingsOpen.push(document.querySelectorAll('[role="dialog"][data-open]').length);
    }
  });
  try {
    await act(async () => root.render(<I18nProvider><RuntimeAPIContext.Provider value={createWebAPIs()}><Harness /></RuntimeAPIContext.Provider></I18nProvider>));
    const settings = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('Open Git Settings'));
    expect(settings).toBeDefined();
    await act(async () => settings?.click());
    for (let attempt = 0; attempt < 30 && !useUIStore.getState().isSettingsDialogOpen; attempt += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    }
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(useUIStore.getState().settingsPage).toBe('git');
    expect(useUIStore.getState().isSettingsDialogOpen).toBe(true);
    expect(dialogsAtSettingsOpen).toEqual([0]);
  } finally {
    unsubscribe();
    await act(async () => root.unmount());
    await new Promise((resolve) => setTimeout(resolve, 250));
    globalThis.fetch = originalFetch;
    await dom.happyDOM.abort();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('every locale supplies repository context copy', async () => {
  const keys = ['configure', 'description', 'needsAttention', 'settings'];
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) expect(dict[`gitView.context.${key}`]).toBeTruthy();
  }
});

test('every locale supplies checkout hydration repair copy', async () => {
  const keys = [
    'title', 'description', 'parentRemote', 'retry', 'endpoint', 'chooseEndpoint',
    'identity', 'authorizationNeeded', 'lfsMissing', 'kind.submodule', 'kind.lfs',
    'status.succeeded', 'status.failed', 'status.cancelled', 'status.authorization-required',
    'status.invalid', 'status.client-missing', 'status.not-needed',
  ] as const;
  const { dict: english } = await import('../../../lib/i18n/messages/en.ts');
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) {
      const messageKey = `gitView.hydration.${key}` as const;
      expect(dict[messageKey]).toBeTruthy();
      if (locale !== 'en' && !['kind.lfs', 'parentRemote', 'endpoint'].includes(key)) expect(dict[messageKey]).not.toBe(english[messageKey]);
    }
  }
});

test('every locale supplies the copy for a repository\u2019s other remotes', async () => {
  const { dict: english } = await import('../../../lib/i18n/messages/en.ts');
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'tr', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of ['title', 'description'] as const) {
      const messageKey = `gitView.remotes.${key}` as const;
      expect(dict[messageKey]).toBeTruthy();
      if (locale !== 'en') expect(dict[messageKey]).not.toBe(english[messageKey]);
    }
    // The hydration editor asks for an identity per endpoint, and says what a
    // stopped run needs; Turkish is covered here because the older lists above
    // exempt it over Git terms it keeps untranslated.
    for (const key of ['gitView.hydration.identity', 'gitView.hydration.authorizationNeeded'] as const) {
      expect(dict[key]).toBeTruthy();
      if (locale !== 'en') expect(dict[key]).not.toBe(english[key]);
    }
    // And the identity strip says what a stale binding needs, not only that it does.
    expect(dict['gitView.identity.configChanged']).toBeTruthy();
    if (locale !== 'en') {
      expect(dict['gitView.identity.configChanged']).not.toBe(english['gitView.identity.configChanged']);
    }
  }
});
