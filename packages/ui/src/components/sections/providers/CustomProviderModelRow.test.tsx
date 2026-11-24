import { afterEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import type { ProviderConfigurationRead } from '@openchamber/agent-contract';
import type { ModelRow } from './custom-provider-form';

const dom = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  CustomEvent: dom.CustomEvent,
  navigator: dom.navigator,
  localStorage: dom.localStorage,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Node: dom.Node,
  Event: dom.Event,
  MouseEvent: dom.MouseEvent,
  PointerEvent: dom.PointerEvent,
  KeyboardEvent: dom.KeyboardEvent,
  MutationObserver: dom.MutationObserver,
  ResizeObserver: dom.ResizeObserver,
  IntersectionObserver: class { observe() { } disconnect() { } },
  getComputedStyle: dom.getComputedStyle.bind(dom),
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
  cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Happy-dom globals must exist on globalThis before React/UI modules evaluate.

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { CustomProviderModelRow } = await import('./CustomProviderModelRow');
const {
  buildCustomProviderRequest,
  createEmptyCustomProviderForm,
  createModelRow,
} = await import('./custom-provider-form');

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
  return {
    container,
    rerender: async (next: React.ReactElement) => {
      await act(async () => root.render(<I18nProvider>{next}</I18nProvider>));
    },
  };
};

const buttonByText = (container: HTMLElement, text: string) => {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`Missing button containing: ${text}`);
  return button;
};

const noop = () => { };

test('collapsed row renders a crisp 2-line summary with human API label, deduplicated modelId, and no repeated host or capability badges', async () => {
  const distinctRow = {
    ...createModelRow(),
    modelId: 'gpt-5-codex',
    name: 'GPT-5 Codex',
    api: 'openai-codex-responses' as const,
    contextWindow: '600000',
    maxOutputTokens: '128000',
    baseUrl: 'https://proxy.example.com/v1/responses',
    modalities: ['text', 'image'] as Array<'text' | 'image'>,
    toolsSupported: false,
    preferWebsockets: 'true' as const,
  };

  const { container } = await render(
    <CustomProviderModelRow
      providerDefaultApi="openai-completions"
      providerBaseUrl="https://proxy.example.com/v1"
      model={distinctRow}
      expanded={false}
      onToggle={noop}
      onUpdate={noop}
      onClearError={noop}
      onUserEdit={noop}
      onDuplicate={noop}
      onRemove={noop}
    />,
  );

  const toggle = buttonByText(container, 'GPT-5 Codex');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(toggle.textContent).toContain('GPT-5 Codex');
  expect(toggle.textContent).toContain('gpt-5-codex');
  expect(toggle.textContent).toContain('OpenAI Codex Responses · 600K ctx · 128K out');
  expect(toggle.textContent).not.toContain('openai-codex-responses');
  expect(toggle.textContent).not.toContain('proxy.example.com');
  expect(toggle.textContent).not.toContain('image');
  expect(toggle.textContent).not.toContain('no tool calls');
  expect(toggle.textContent).not.toContain('WS');
  expect(container.querySelector('button[aria-label="Duplicate model"]')).not.toBeNull();
  expect(container.querySelector('button[aria-label="Remove model"]')).not.toBeNull();

  const sameNameRow = {
    ...createModelRow(),
    modelId: 'claude-sonnet-4',
    name: 'claude-sonnet-4',
    baseUrl: 'https://override.example.net/v1',
  };

  const { container: sameNameContainer } = await render(
    <CustomProviderModelRow
      providerDefaultApi="anthropic-messages"
      providerBaseUrl="https://proxy.example.com/v1"
      model={sameNameRow}
      expanded={false}
      onToggle={noop}
      onUpdate={noop}
      onClearError={noop}
      onUserEdit={noop}
    />,
  );

  const sameToggle = buttonByText(sameNameContainer, 'claude-sonnet-4');
  expect(sameToggle.querySelector('span.font-mono')).toBeNull();
  expect(sameToggle.textContent).toContain('Anthropic Messages · override.example.net');
  expect(sameToggle.textContent).not.toContain('anthropic-messages');
});

test('expanded row renders only the 5 essential fields directly and keeps all 4 disclosures collapsed with summaries', async () => {
  const populatedRow = {
    ...createModelRow(),
    modelId: 'gpt-image-1',
    name: 'GPT Image 1',
    api: 'openai-images' as const,
    kind: 'image' as const,
    nativeKind: 'image' as const,
    baseUrl: 'https://cdn.example.com/v1',
    contextWindow: '128000',
    maxContextWindow: '1000000',
    maxOutputTokens: '16384',
    modalities: ['text', 'image'] as Array<'text' | 'image'>,
    thinkingMode: 'effort' as const,
    thinkingEfforts: ['low', 'medium', 'high'] as Array<'low' | 'medium' | 'high'>,
    costInput: '2.5',
    costOutput: '10',
    preferWebsockets: 'true' as const,
    compatJson: '{"supportsStore": true}',
    remoteCompactionEndpoint: 'https://compact.example.com/v1',
  };

  const StatefulRow: React.FC = () => {
    const [row, setRow] = React.useState<ModelRow>(populatedRow);
    return (
      <CustomProviderModelRow
        providerDefaultApi="openai-completions"
        model={row}
        expanded={true}
        onToggle={noop}
        onUpdate={(updater) => setRow((prev) => updater(prev))}
        onClearError={noop}
        onUserEdit={noop}
      />
    );
  };

  const { container } = await render(<StatefulRow />);

  // 5 essential fields visible directly
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Model ID"]')?.value).toBe('gpt-image-1');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Model name"]')?.value).toBe('GPT Image 1');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Context window"]')?.value).toBe('128000');
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Max output tokens"]')?.value).toBe('16384');

  const toolsGroup = container.querySelector('[role="group"][aria-label="Tool calls"]');
  const reasoningGroup = container.querySelector('[role="group"][aria-label="Reasoning supported"]');
  expect(toolsGroup).not.toBeNull();
  expect(reasoningGroup).not.toBeNull();
  expect(container.querySelector('input[type="checkbox"][aria-label="text"], [role="checkbox"][aria-label="text"]')).not.toBeNull();
  expect(container.querySelector('input[type="checkbox"][aria-label="image"], [role="checkbox"][aria-label="image"]')).not.toBeNull();

  // Tri-state 'default' fidelity on Core Capabilities chips
  const toolsDefault = [...(toolsGroup?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Default');
  const toolsDisabled = [...(toolsGroup?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Disabled');
  expect(toolsDefault?.getAttribute('aria-pressed')).toBe('true');
  await act(async () => toolsDisabled?.click());
  expect(toolsDisabled?.getAttribute('aria-pressed')).toBe('true');
  expect(toolsDefault?.getAttribute('aria-pressed')).toBe('false');
  await act(async () => toolsDefault?.click());
  expect(toolsDefault?.getAttribute('aria-pressed')).toBe('true');

  // All 4 disclosures collapsed by default with non-default summaries
  const protocolToggle = buttonByText(container, 'Protocol & endpoint override');
  const thinkingToggle = buttonByText(container, 'Thinking & effort');
  const pricingToggle = buttonByText(container, 'Pricing & cache');
  const advancedToggle = buttonByText(container, 'Advanced & compatibility');

  expect(protocolToggle.getAttribute('aria-expanded')).toBe('false');
  expect(thinkingToggle.getAttribute('aria-expanded')).toBe('false');
  expect(pricingToggle.getAttribute('aria-expanded')).toBe('false');
  expect(advancedToggle.getAttribute('aria-expanded')).toBe('false');

  expect(protocolToggle.textContent).toContain('OpenAI Images · image · cdn.example.com · 1.0M max');
  expect(protocolToggle.textContent).not.toContain('openai-images');
  expect(thinkingToggle.textContent).toContain('effort (low, medium, high)');
  expect(pricingToggle.textContent).toContain('2.5 / 10');
  expect(advancedToggle.textContent).toContain('3 configured');

  // Nested disclosure fields are not mounted while collapsed
  expect(container.querySelector('[aria-label="Model base URL"]')).toBeNull();
  expect(container.querySelector('[aria-label="Max context window"]')).toBeNull();
  expect(container.querySelector('[aria-label="Thinking mode"]')).toBeNull();
  expect(container.querySelector('[aria-label="Input ($/1M)"]')).toBeNull();
  expect(container.querySelector('[aria-label="Compat JSON"]')).toBeNull();

  // Opening protocol disclosure shows human-readable API label in trigger
  await act(async () => protocolToggle.click());
  expect(protocolToggle.getAttribute('aria-expanded')).toBe('true');
  const modelApiTrigger = container.querySelector('[aria-label="Model API"]');
  expect(modelApiTrigger?.textContent).toContain('OpenAI Images');
  expect(modelApiTrigger?.textContent).not.toContain('openai-images');
});

test('disclosures auto-open only when validation fails on a field inside them', async () => {
  const row = createModelRow();

  const { container, rerender } = await render(
    <CustomProviderModelRow
      model={row}
      errors={{ baseUrl: 'Invalid URL' }}
      expanded={true}
      onToggle={noop}
      onUpdate={noop}
      onClearError={noop}
      onUserEdit={noop}
    />,
  );

  expect(buttonByText(container, 'Protocol & endpoint override').getAttribute('aria-expanded')).toBe('true');
  expect(buttonByText(container, 'Thinking & effort').getAttribute('aria-expanded')).toBe('false');
  expect(buttonByText(container, 'Pricing & cache').getAttribute('aria-expanded')).toBe('false');
  expect(buttonByText(container, 'Advanced & compatibility').getAttribute('aria-expanded')).toBe('false');
  expect(container.textContent).toContain('Invalid URL');

  await rerender(
    <CustomProviderModelRow
      model={row}
      errors={{ thinkingEffortMapJson: 'Enter a valid JSON object', promptCacheShort: 'Non-negative', compatJson: 'Bad JSON' }}
      expanded={true}
      onToggle={noop}
      onUpdate={noop}
      onClearError={noop}
      onUserEdit={noop}
    />,
  );

  expect(buttonByText(container, 'Thinking & effort').getAttribute('aria-expanded')).toBe('true');
  expect(buttonByText(container, 'Pricing & cache').getAttribute('aria-expanded')).toBe('true');
  expect(buttonByText(container, 'Advanced & compatibility').getAttribute('aria-expanded')).toBe('true');
  expect(container.textContent).toContain('Enter a valid JSON object');
  expect(container.textContent).toContain('Non-negative');
  expect(container.textContent).toContain('Bad JSON');

  // Manually collapse an invalid nested disclosure, then re-submit with the same error -> must re-open
  const advancedToggle = buttonByText(container, 'Advanced & compatibility');
  await act(async () => advancedToggle.click());
  expect(advancedToggle.getAttribute('aria-expanded')).toBe('false');

  await rerender(
    <CustomProviderModelRow
      model={row}
      errors={{ thinkingEffortMapJson: 'Enter a valid JSON object', promptCacheShort: 'Non-negative', compatJson: 'Bad JSON' }}
      validationAttempt={1}
      expanded={true}
      onToggle={noop}
      onUpdate={noop}
      onClearError={noop}
      onUserEdit={noop}
    />,
  );
  expect(buttonByText(container, 'Advanced & compatibility').getAttribute('aria-expanded')).toBe('true');
});

test('editing through a disclosure round-trips losslessly without dropping collapsed fields', async () => {
  const initialProvider: ProviderConfigurationRead = {
    revision: '3',
    configuration: null,
    native: {
      providerId: 'custom-omp',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://api.example.com/v1',
      effectiveApi: 'openai-completions',
      name: 'Custom OMP',
      baseUrl: 'https://api.example.com/v1',
      api: 'openai-completions',
      configApiKey: { configured: false },
      headerNames: [],
      disableStrictTools: false,
      models: [
        {
          id: 'reasoning-pro',
          name: 'Reasoning Pro',
          api: 'openai-responses',
          kind: 'chat',
          baseUrl: 'https://models.example.com/v1',
          contextWindow: 200000,
          maxContextWindow: 400000,
          maxTokens: 32000,
          input: ['text', 'image'],
          supportsTools: true,
          reasoning: true,
          thinking: {
            mode: 'effort',
            efforts: ['low', 'medium', 'high'],
            defaultLevel: 'medium',
            supportsDisplay: true,
            requiresEffort: false,
            effortMap: { high: 'max' },
          },
          cost: {
            input: 3,
            output: 15,
            cacheRead: 0.3,
            cacheWrite: 3.75,
          },
          promptCache: { short: 300, long: 3600 },
          premiumMultiplier: 1.5,
          preferWebsockets: true,
          omitMaxOutputTokens: false,
          tokenizer: 'cl100k',
          imageCountBudget: 4,
          imageInputDecoder: 'stb',
          contextPromotionTarget: 'custom-omp/long-ctx',
          compactionModel: 'custom-omp/mini',
          compat: { supportsStore: true },
          remoteCompaction: {
            enabled: true,
            api: 'openai-responses',
            endpoint: 'https://compact.example.com/v1',
            model: 'compact-1',
          },
          headerNames: [],
        },
      ],
      modelOverrides: {},
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const initialForm = createEmptyCustomProviderForm(initialProvider);
  let latestForm = initialForm;

  const Harness: React.FC = () => {
    const [form, setForm] = React.useState(initialForm);
    const [expanded, setExpanded] = React.useState(true);
    latestForm = form;
    return (
      <CustomProviderModelRow
        providerDefaultApi={form.api}
        providerBaseUrl={form.endpoint}
        model={form.models[0]!}
        expanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        onUpdate={(updater) => setForm((prev) => ({
          ...prev,
          models: prev.models.map((entry, idx) => (idx === 0 ? updater(entry) : entry)),
        }))}
        onClearError={noop}
        onUserEdit={noop}
      />
    );
  };

  const { container } = await render(<Harness />);

  // Open Thinking & effort, toggle off 'low', then collapse Thinking & effort and the outer row
  const thinkingToggle = buttonByText(container, 'Thinking & effort');
  await act(async () => thinkingToggle.click());
  const lowChip = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'low');
  if (!lowChip) throw new Error('Missing low effort chip');
  await act(async () => lowChip.click());
  await act(async () => thinkingToggle.click());
  await act(async () => buttonByText(container, 'Reasoning Pro').click());

  const plan = buildCustomProviderRequest(latestForm, '3');
  const savedModel = plan.request.native?.models?.[0];
  expect(savedModel).toBeDefined();
  expect(savedModel?.api).toBe('openai-responses');
  expect(savedModel?.kind).toBe('chat');
  expect(savedModel?.baseUrl).toBe('https://models.example.com/v1');
  expect(savedModel?.maxContextWindow).toBe(400000);
  expect(savedModel?.thinking).toEqual({
    mode: 'effort',
    efforts: ['medium', 'high'],
    defaultLevel: 'medium',
    supportsDisplay: true,
    requiresEffort: false,
    effortMap: { high: 'max' },
  });
  expect(savedModel?.cost).toEqual({ input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 });
  expect(savedModel?.promptCache).toEqual({ short: 300, long: 3600 });
  expect(savedModel?.premiumMultiplier).toBe(1.5);
  expect(savedModel?.preferWebsockets).toBe(true);
  expect(savedModel?.omitMaxOutputTokens).toBe(false);
  expect(savedModel?.tokenizer).toBe('cl100k');
  expect(savedModel?.imageCountBudget).toBe(4);
  expect(savedModel?.imageInputDecoder).toBe('stb');
  expect(savedModel?.contextPromotionTarget).toBe('custom-omp/long-ctx');
  expect(savedModel?.compactionModel).toBe('custom-omp/mini');
  expect(savedModel?.compat).toEqual({ supportsStore: true });
  expect(savedModel?.remoteCompaction).toEqual({
    enabled: true,
    api: 'openai-responses',
    endpoint: 'https://compact.example.com/v1',
    model: 'compact-1',
  });
});
