import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { ModelMetadata } from '@/types';
import { I18nProvider } from '@/lib/i18n';
import { useConfigStore } from '@/stores/useConfigStore';
import { ProviderLogo } from '@/components/ui/ProviderLogo';

// The rendered mark is the contract: an `<img>` to `models.dev` is a request a
// custom provider cannot answer, and its absence is what the audit observed.
const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  SVGElement: browser.SVGElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const initialMetadata = useConfigStore.getState().modelsMetadata;

afterEach(() => {
  useConfigStore.setState({ modelsMetadata: initialMetadata });
});

afterAll(() => {
  browser.close();
});

const renderLogoSource = async (providerId: string): Promise<string | null> => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider><ProviderLogo providerId={ providerId } /> </I18nProvider>);
  });
  const src = container.querySelector('img')?.getAttribute('src') ?? null;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return src;
};

describe('provider logo sources', () => {
  test('a custom provider outside the catalog draws no remote logo', async () => {
    useConfigStore.setState({
      modelsMetadata: new Map<string, ModelMetadata>([['anthropic/claude-opus-4-1', { id: 'claude-opus-4-1', providerId: 'anthropic' }]]),
    });
    // The audit's custom provider: present in models.yml, absent from models.dev.
    // It used to produce `https://models.dev/logos/cliproxyapi.svg`, a request
    // that failed with `net::ERR_CONNECTION_CLOSED` in every such session.
    expect(await renderLogoSource('CLIProxyAPI')).toBeNull();
  });

  test('a provider the catalog carries keeps its models.dev logo', async () => {
    useConfigStore.setState({
      modelsMetadata: new Map<string, ModelMetadata>([['deepseek/deepseek-chat', { id: 'deepseek-chat', providerId: 'deepseek' }]]),
    });
    expect(await renderLogoSource('deepseek')).toBe('https://models.dev/logos/deepseek.svg');
  });

  test('a catalog that arrives after mount turns into the remote logo without a re-render', async () => {
    // The catalog loads lazily (when the browser is idle), so a provider the
    // app does not bundle can be known only after the logo mounted. The hook
    // must subscribe to that arrival; sampling the store once leaves no logo.
    useConfigStore.setState({ modelsMetadata: new Map() });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<I18nProvider><ProviderLogo providerId="deepseek" /></I18nProvider>);
    });
    expect(container.querySelector('img')).toBeNull();

    await act(async () => {
      useConfigStore.setState({
        modelsMetadata: new Map<string, ModelMetadata>([['deepseek/deepseek-chat', { id: 'deepseek-chat', providerId: 'deepseek' }]]),
      });
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://models.dev/logos/deepseek.svg');
    await act(async () => { root.unmount(); });
    container.remove();
  });

  test('an empty catalog alone never turns into a request', async () => {
    useConfigStore.setState({ modelsMetadata: new Map() });
    expect(await renderLogoSource('CLIProxyAPI')).toBeNull();
  });
});
