import { afterAll, afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ClassifierSource } from '@/lib/routing/routingApi';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
  Node: browser.Node, Element: browser.Element, HTMLElement: browser.HTMLElement,
  Event: browser.Event, MouseEvent: browser.MouseEvent, PointerEvent: browser.PointerEvent,
  MutationObserver: browser.MutationObserver, ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
});
// Browser-dependent UI modules are intentionally loaded after the happy-dom globals are installed.
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { TooltipProvider } = await import('@/components/ui/tooltip');
const { ROUTING_UNAVAILABLE } = await import('@/lib/routing/routingApi');
const { useRoutingStore } = await import('@/stores/useRoutingStore');
const { ClassificationProvidersPage } = await import('./ClassificationProvidersPage');
const originalRoutingState = useRoutingStore.getState();
const container = document.createElement('div');
document.body.appendChild(container);
let root: Root;
let restoreLoad = () => {};

beforeEach(() => {
  useRoutingStore.setState({
    ...ROUTING_UNAVAILABLE,
    available: true,
    loaded: true,
    loadError: null,
    classifier: {
      selected: 'zen-key', effective: null,
      sources: [
        { id: 'zen-key', usable: false },
        { id: 'openrouter', usable: false },
        { id: 'vercel', usable: false },
      ],
    },
  });
  restoreLoad = spyOn(useRoutingStore.getState(), 'load').mockResolvedValue();
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  restoreLoad();
  useRoutingStore.setState(originalRoutingState, true);
  container.replaceChildren();
});
afterAll(() => browser.close());

const openProviderLink = async (label: string, targetProviderId: string, selectedSource: ClassifierSource) => {
  const opened: string[] = [];
  await act(async () => {
    root.render(
      <I18nProvider>
        <TooltipProvider>
          <ClassificationProvidersPage titleLeading={null} onOpenProvider={(providerId) => opened.push(providerId)} />
        </TooltipProvider>
      </I18nProvider>,
    );
  });
  const link = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.trim() === `Open ${label}`);
  if (!link) throw new Error(`Missing provider link: ${label}`);
  await act(async () => link.click());
  expect(opened).toEqual([targetProviderId]);
  expect(useRoutingStore.getState().classifier?.selected).toBe(selectedSource);
};

test('Zen key setup opens the native OpenCode Zen provider without selecting the classifier source', async () => {
  await openProviderLink('OpenCode Zen', 'opencode-zen', 'zen-key');
});

test('Vercel key setup opens the native Vercel AI Gateway provider', async () => {
  useRoutingStore.setState({ classifier: {
    selected: 'vercel', effective: null,
    sources: [
      { id: 'zen-key', usable: false },
      { id: 'openrouter', usable: false },
      { id: 'vercel', usable: false },
    ],
  } });
  await openProviderLink('Vercel AI Gateway', 'vercel-ai-gateway', 'vercel');
});
