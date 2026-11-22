import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import type { ProviderConfigurationRead } from '@openchamber/agent-contract';

const dom = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom, document: dom.document, CustomEvent: dom.CustomEvent, navigator: dom.navigator, localStorage: dom.localStorage,
  HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event,
  MouseEvent: dom.MouseEvent, PointerEvent: dom.PointerEvent, KeyboardEvent: dom.KeyboardEvent, MutationObserver: dom.MutationObserver,
  ResizeObserver: dom.ResizeObserver, IntersectionObserver: class { observe() {} disconnect() {} }, getComputedStyle: dom.getComputedStyle.bind(dom),
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
});
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { CustomProviderForm } = await import('./CustomProviderForm');


const savedProvider: ProviderConfigurationRead = {
  revision: '0',
  configuration: {
    providerId: 'campus-llm',
    name: 'Campus LLM',
    endpoint: 'https://llm.example.edu/v1',
    protocol: 'chat-completions',
    credentialRef: null,
  },
  models: [{
    provider: 'campus-llm',
    modelId: 'fast',
    name: 'Fast',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    modalities: ['text', 'image'],
    toolsSupported: true,
    reasoningEffortSupported: false,
    reasoningOptions: [],
    variants: [],
    pricing: null,
  }],
  headerNames: [],
  imageModels: [],
};
const formProps = {
  workspaceId: 'ws_test',
  revision: '0',
  existingProviderIDs: new Set<string>(),
  onSubmit: async () => {},
  onCancel: () => {},
};

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

const render = async (element: React.ReactElement) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<I18nProvider>{element}</I18nProvider>));
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
};

const buttonByText = (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim().includes(text));
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
};

test('saved models start collapsed with a one-line summary and open on click', async () => {
  const container = await render(
    <CustomProviderForm {...formProps} initial={savedProvider} />,
  );
  const row = buttonByText(container, 'Fast');
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(row.textContent).toContain('128K');
  expect(row.textContent).toContain('image');
  expect(container.querySelector('input[aria-label="Context window"]')).toBeNull();

  await act(async () => row.click());
  expect(row.getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Context window"]')?.value).toBe('128000');
});

test('a new provider opens its first blank model row for editing', async () => {
  const container = await render(<CustomProviderForm {...formProps} />);
  expect(buttonByText(container, 'New model').getAttribute('aria-expanded')).toBe('true');
});

test('found models are reviewed once and added as collapsed rows next to the saved ones', async () => {
  const { canonicalClient } = await import('@/api/canonicalClient');
  const discover = spyOn(canonicalClient, 'discoverProviderModels').mockResolvedValue({
    models: [
      { modelId: 'fast', name: 'fast' },
      { modelId: 'vision-pro', name: 'Vision Pro', contextWindow: 200000 },
      { modelId: 'tiny', name: 'tiny' },
    ],
  });
  cleanups.push(() => discover.mockRestore());

  const container = await render(
    <CustomProviderForm {...formProps} initial={savedProvider} />,
  );
  await act(async () => buttonByText(container, 'Find models').click());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

  // The saved model reads as already added; the other two can be added.
  expect(document.body.textContent).toContain('Models found');
  expect(document.body.textContent).toContain('Already added');
  await act(async () => buttonByText(document.body, 'Add all models (2)').click());

  const added = buttonByText(container, 'Vision Pro');
  expect(added.getAttribute('aria-expanded')).toBe('false');
  expect(added.textContent).toContain('200K');
  expect(buttonByText(container, 'tiny').getAttribute('aria-expanded')).toBe('false');
});
