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
  onSubmit: async () => { },
  onCancel: () => { },
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
test('multi-protocol custom provider shows API badges, protocol filter chips, and duplicates rows', async () => {
  const multiProvider: ProviderConfigurationRead = {
    revision: '1',
    configuration: {
      providerId: 'CLIProxyAPI',
      name: 'CLIProxyAPI',
      endpoint: 'https://proxy.example/v1',
      protocol: 'chat-completions',
      credentialRef: null,
    },
    native: {
      providerId: 'CLIProxyAPI',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://proxy.example/v1',
      effectiveApi: 'openai-completions',
      name: 'CLIProxyAPI',
      baseUrl: 'https://proxy.example/v1',
      configApiKey: { configured: false },
      headerNames: [],
      disableStrictTools: false,
      models: [
        { id: 'gpt-5', name: 'GPT-5', api: 'openai-responses', input: ['text'], headerNames: [] },
        { id: 'claude-4', name: 'Claude 4', api: 'anthropic-messages', input: ['text'], headerNames: [] },
        { id: 'gemini-3', name: 'Gemini 3', api: 'google-generative-ai', input: ['text'], headerNames: [] },
        { id: 'qwen-3', name: 'Qwen 3', api: 'openai-completions', input: ['text'], headerNames: [] },
        { id: 'deepseek-4', name: 'DeepSeek 4', input: ['text'], headerNames: [] },
        { id: 'kimi-k2', name: 'Kimi K2', input: ['text'], headerNames: [] },
      ],
      modelOverrides: {},
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const container = await render(
    <CustomProviderForm {...formProps} initial={multiProvider} />,
  );

  expect(container.querySelector('input[aria-label="Filter configured models..."]')).not.toBeNull();
  const anthropicChip = buttonByText(container, 'anthropic-messages (1)');
  await act(async () => anthropicChip.click());
  expect(container.textContent).toContain('Claude 4');
  expect(container.textContent).not.toContain('GPT-5');

  await act(async () => buttonByText(container, 'All (6)').click());
  expect(container.textContent).toContain('GPT-5');

  const duplicateButtons = container.querySelectorAll('button[aria-label="Duplicate model"]');
  expect(duplicateButtons.length).toBe(6);
  await act(async () => (duplicateButtons[0] as HTMLButtonElement).click());
  expect(container.textContent).toContain('New model');
});

test('built-in provider renders overrides mode with reset overrides action', async () => {
  let resetCalled = 0;
  const builtInProvider: ProviderConfigurationRead = {
    revision: '2',
    configuration: null,
    native: {
      providerId: 'openai',
      isBuiltIn: true,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://api.openai.com/v1',
      effectiveApi: 'openai-responses',
      baseUrl: 'https://proxy.openai.example/v1',
      configApiKey: { configured: true, source: 'env', envVar: 'OPENAI_PROXY_KEY' },
      headerNames: [],
      disableStrictTools: false,
      models: [],
      modelOverrides: {
        'gpt-5': {
          contextWindow: 400000,
          headerNames: [],
        },
      },
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const container = await render(
    <CustomProviderForm
      {...formProps}
      initial={builtInProvider}
      onResetOverrides={async () => {
        resetCalled += 1;
      }}
    />,
  );

  expect(container.textContent).toContain('Provider overrides');
  expect(container.textContent).toContain('Using environment variable OPENAI_PROXY_KEY');
  expect(container.textContent).toContain('Reset overrides');
  expect(container.textContent).not.toContain('Delete provider');
  expect(resetCalled).toBe(0);
});
