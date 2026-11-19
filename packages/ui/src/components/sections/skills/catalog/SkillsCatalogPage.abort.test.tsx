import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';

/**
 * Leaving the catalog page must cancel its in-flight repository scan. The
 * server-side clone can outlive the page; without an abort it finishes after
 * the user is on another settings page and reports its failure there.
 */
describe('SkillsCatalogPage background loads', () => {
  let dom: Window;
  let root: Root | undefined;
  let container: HTMLElement;
  const globals = new Map<string, PropertyDescriptor | undefined>();
  const signals: AbortSignal[] = [];

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    const values = {
      window: dom, document: dom.document, navigator: dom.navigator,
      HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
      HTMLInputElement: dom.HTMLInputElement,
      DocumentFragment: dom.DocumentFragment, MutationObserver: dom.MutationObserver,
      ResizeObserver: dom.ResizeObserver, MouseEvent: dom.MouseEvent,
      PointerEvent: dom.PointerEvent, Event: dom.Event, CustomEvent: dom.CustomEvent,
      AbortController: dom.AbortController, AbortSignal: dom.AbortSignal,
      getComputedStyle: dom.getComputedStyle.bind(dom),
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
      cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
      IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(values)) {
      globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    signals.length = 0;
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(async () => {
    const mountedRoot = root;
    if (mountedRoot) await act(async () => { mountedRoot.unmount(); });
    root = undefined;
    await dom.happyDOM.close();
    for (const [key, value] of globals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  });

  const mount = async (loadSource: (sourceId: string, options?: { signal?: AbortSignal }) => Promise<boolean>) => {
    const previous = useSkillsCatalogStore.getState();
    useSkillsCatalogStore.setState({
      sources: [{ id: 'custom:team', label: 'Team', source: 'owner/team', stars: null, repoUpdatedAt: null }],
      itemsBySource: {},
      loadedSourceIds: {},
      selectedSourceId: 'custom:team',
      lastCatalogError: null,
      loadCatalog: async () => true,
      loadSource: async (sourceId, options) => {
        if (options?.signal) signals.push(options.signal);
        return loadSource(sourceId, options);
      },
    });
    const { createRoot } = await import('react-dom/client');
    const { SkillsCatalogPage } = await import('./SkillsCatalogPage');
    const { I18nProvider } = await import('@/lib/i18n');
    const { TooltipProvider } = await import('@/components/ui/tooltip');
    const mountedRoot = createRoot(container);
    root = mountedRoot;
    await act(async () => {
      mountedRoot.render(
        <I18nProvider>
          <TooltipProvider>
            <SkillsCatalogPage mode="external" onModeChange={() => { }} showModeTabs={false} />
          </TooltipProvider>
        </I18nProvider>,
      );
    });
    return () => useSkillsCatalogStore.setState(previous);
  };

  test('aborts the selected source load when the page unmounts', async () => {
    const { promise: loadStarted, resolve: markStarted } = Promise.withResolvers<void>();
    const { promise: blocked, resolve: release } = Promise.withResolvers<boolean>();
    const restore = await mount(async () => {
      markStarted();
      return blocked;
    });

    try {
      await loadStarted;
      // The selected-source effect and the background pass ask for the same
      // source; the store dedupes the request, so both share its pending state.
      expect(signals.length).toBeGreaterThan(0);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);

      await act(async () => {
        const mountedRoot = root;
        if (mountedRoot) mountedRoot.unmount();
      });
      root = undefined;

      expect(signals.every((signal) => signal.aborted)).toBe(true);

      await act(async () => {
        release(false);
        await Promise.resolve();
      });
    } finally {
      restore();
      release(false);
    }
  });
});
