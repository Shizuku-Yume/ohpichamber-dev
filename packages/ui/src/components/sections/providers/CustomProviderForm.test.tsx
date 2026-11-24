import { afterEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import type { ProviderConfigurationRead } from '@openchamber/agent-contract';
import type { CustomProviderPersistPlan } from './custom-provider-form';

const dom = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom, document: dom.document, CustomEvent: dom.CustomEvent, navigator: dom.navigator, localStorage: dom.localStorage,
  HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event,
  MouseEvent: dom.MouseEvent, PointerEvent: dom.PointerEvent, KeyboardEvent: dom.KeyboardEvent, MutationObserver: dom.MutationObserver,
  ResizeObserver: dom.ResizeObserver, IntersectionObserver: class { observe() { } disconnect() { } }, getComputedStyle: dom.getComputedStyle.bind(dom),
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
  expect(row.textContent).toContain('OpenAI Chat Completions');
  expect(row.textContent).toContain('128K');
  expect(row.textContent).toContain('16K');
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
  const anthropicChip = buttonByText(container, 'Anthropic Messages (1)');
  expect(container.textContent).not.toContain('anthropic-messages (1)');
  await act(async () => anthropicChip.click());
  expect(container.textContent).toContain('Claude 4');
  expect(container.textContent).not.toContain('GPT-5');

  await act(async () => buttonByText(container, 'All (6)').click());
  expect(container.textContent).toContain('GPT-5');

  const duplicateButtons = container.querySelectorAll('button[aria-label="Duplicate model"]');
  expect(duplicateButtons.length).toBe(6);
  const firstDuplicate = duplicateButtons[0];
  if (!(firstDuplicate instanceof HTMLElement)) throw new Error('Missing duplicate model button');
  await act(async () => firstDuplicate.click());
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
  expect(container.textContent).not.toContain('without copying its catalog');
  expect(resetCalled).toBe(0);
});

test('Tier 1 & Tier 3 disclosures start collapsed with secondary summaries even when populated, and save losslessly without opening', async () => {
  const submittedPlans: CustomProviderPersistPlan[] = [];
  const populatedProvider: ProviderConfigurationRead = {
    revision: '5',
    configuration: {
      providerId: 'enterprise-bedrock',
      name: 'Enterprise Bedrock',
      endpoint: 'https://bedrock.example.internal/v1',
      protocol: 'messages',
      credentialRef: null,
    },
    native: {
      providerId: 'enterprise-bedrock',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://bedrock.example.internal/v1',
      effectiveApi: 'bedrock-converse-stream',
      name: 'Enterprise Bedrock',
      baseUrl: 'https://bedrock.example.internal/v1',
      api: 'bedrock-converse-stream',
      auth: 'apiKey',
      authHeader: true,
      configApiKey: { configured: true, source: 'env', envVar: 'BEDROCK_CFG_KEY' },
      headerNames: ['X-Tenant', 'X-Trace'],
      discovery: { type: 'ollama', timeoutMs: 5000 },
      compat: { supportsStore: true },
      disableStrictTools: true,
      transport: 'pi-native',
      guardrailIdentifier: 'gr-prod-1',
      guardrailVersion: '3',
      guardrailTrace: 'enabled',
      requestMetadata: { team: 'core' },
      remoteCompaction: { enabled: true, endpoint: 'https://compact.example.internal/v1' },
      models: [{
        id: 'claude-sonnet',
        name: 'Claude Sonnet',
        contextWindow: 200000,
        maxTokens: 16384,
        input: ['text', 'image'],
        supportsTools: true,
        reasoning: true,
        cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
        compat: { supportsDeveloperRole: false },
        headerNames: ['X-Model-Key'],
      }],
      modelOverrides: {
        'claude-haiku': {
          contextWindow: 150000,
          headerNames: [],
        },
      },
    },
    models: [],
    headerNames: ['X-Tenant', 'X-Trace'],
    imageModels: [],
  };

  const container = await render(
    <CustomProviderForm
      {...formProps}
      initial={populatedProvider}
      initialIcon="cloud"
      onSubmit={async (plan) => {
        submittedPlans.push(plan);
      }}
    />,
  );

  // All disclosures default-collapsed even though every section is populated (including bedrock protocol).
  const disclosureTitles = [
    'Appearance & auth overrides',
    'Headers',
    'Model overrides',
    'Runtime discovery',
    'Compatibility & transport',
    'Bedrock guardrails & metadata',
    'Remote compaction',
  ];
  for (const title of disclosureTitles) {
    const btn = buttonByText(container, title);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  }

  // Collapsed children are not mounted.
  expect(container.querySelector('textarea[aria-label="Compat JSON"]')).toBeNull();
  expect(container.querySelector('input[aria-label="Guardrail ID"]')).toBeNull();
  expect(container.querySelector('input[aria-label="Compaction endpoint"]')).toBeNull();
  expect(container.querySelector('button[aria-label="Cloud"]')).toBeNull();

  // Secondary summaries are visible on the collapsed disclosure headers.
  const appearanceBtn = buttonByText(container, 'Appearance & auth overrides');
  expect(appearanceBtn.textContent).toContain('Icon: Cloud');
  expect(appearanceBtn.textContent).toContain('Bearer header on');
  expect(appearanceBtn.textContent).toContain('Using environment variable BEDROCK_CFG_KEY');
  expect(buttonByText(container, 'Headers').textContent).toContain('2 headers');
  expect(buttonByText(container, 'Model overrides').textContent).toContain('1 override');
  expect(buttonByText(container, 'Runtime discovery').textContent).toContain('ollama');
  const compatBtn = buttonByText(container, 'Compatibility & transport');
  expect(compatBtn.textContent).toContain('Custom JSON');
  expect(compatBtn.textContent).toContain('Strict tools off');
  expect(compatBtn.textContent).toContain('pi-native transport');
  const bedrockBtn = buttonByText(container, 'Bedrock guardrails & metadata');
  expect(bedrockBtn.textContent).toContain('Guardrail configured');
  expect(bedrockBtn.textContent).toContain('1 metadata entry');
  expect(buttonByText(container, 'Remote compaction').textContent).toContain('Endpoint set');

  // Save WITHOUT opening any disclosure -> lossless round-trip!
  const form = container.querySelector('form');
  if (!form) throw new Error('Missing form');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(submittedPlans.length).toBe(1);
  const plan = submittedPlans[0];
  expect(plan.icon).toBe('cloud');
  expect(plan.request.native?.authHeader).toBe(true);
  expect(plan.request.native?.discovery).toEqual({ type: 'ollama', timeoutMs: 5000 });
  expect(plan.request.native?.compat).toEqual({ supportsStore: true });
  expect(plan.request.native?.disableStrictTools).toBe(true);
  expect(plan.request.native?.transport).toBe('pi-native');
  expect(plan.request.native?.guardrailIdentifier).toBe('gr-prod-1');
  expect(plan.request.native?.guardrailVersion).toBe('3');
  expect(plan.request.native?.guardrailTrace).toBe('enabled');
  expect(plan.request.native?.requestMetadata).toEqual({ team: 'core' });
  expect(plan.request.native?.remoteCompaction).toEqual({
    enabled: true,
    endpoint: 'https://compact.example.internal/v1',
  });
  expect(plan.request.native?.headersPatch).toBeUndefined();
  expect(plan.request.native?.headers).toBeUndefined();
  expect(plan.request.native?.modelOverrides?.['claude-haiku']).toEqual({ contextWindow: 150000 });
  expect(plan.request.native?.models?.[0]).toMatchObject({
    id: 'claude-sonnet',
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    compat: { supportsDeveloperRole: false },
  });
});

test('disclosures auto-open when validation fails inside them and when bedrock-converse-stream is selected interactively', async () => {
  const invalidPopulated: ProviderConfigurationRead = {
    revision: '1',
    configuration: {
      providerId: 'test-prov',
      name: 'Test Prov',
      endpoint: 'https://api.example/v1',
      protocol: 'chat-completions',
      credentialRef: null,
    },
    native: {
      providerId: 'test-prov',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://api.example/v1',
      effectiveApi: 'openai-completions',
      name: 'Test Prov',
      baseUrl: 'https://api.example/v1',
      api: 'openai-completions',
      configApiKey: { configured: false },
      headerNames: [],
      discovery: { type: 'ollama', timeoutMs: 5000 },
      remoteCompaction: { enabled: true, endpoint: 'https://rc.example/compact' },
      models: [{ id: 'm1', name: 'M1', input: ['text'], headerNames: [] }],
      modelOverrides: {},
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const container = await render(
    <CustomProviderForm {...formProps} initial={invalidPopulated} />,
  );

  // Open Compat disclosure, enter invalid JSON, collapse it, then submit -> it must auto-open with error.
  await act(async () => buttonByText(container, 'Compatibility & transport').click());
  const compatTextarea = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Compat JSON"]');
  if (!compatTextarea) throw new Error('Missing Compat JSON textarea');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(compatTextarea, '{bad-json');
    compatTextarea.dispatchEvent(new Event('input', { bubbles: true }));
    compatTextarea.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () => buttonByText(container, 'Compatibility & transport').click());
  expect(buttonByText(container, 'Compatibility & transport').getAttribute('aria-expanded')).toBe('false');

  // Submit -> Compat disclosure auto-opens on validation error while Discovery/Remote Compaction stay collapsed.
  const form = container.querySelector('form');
  if (!form) throw new Error('Missing form');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(buttonByText(container, 'Compatibility & transport').getAttribute('aria-expanded')).toBe('true');
  expect(container.textContent).toContain('Enter a valid JSON object');
  expect(buttonByText(container, 'Runtime discovery').getAttribute('aria-expanded')).toBe('false');
  expect(buttonByText(container, 'Remote compaction').getAttribute('aria-expanded')).toBe('false');

  // Interactively selecting AWS Bedrock in Protocol Select auto-opens Bedrock disclosure.
  expect(buttonByText(container, 'Bedrock guardrails & metadata').getAttribute('aria-expanded')).toBe('false');
  const protocolTrigger = container.querySelector<HTMLElement>('[aria-label="API protocol"]');
  if (!protocolTrigger) throw new Error('Missing API protocol trigger');
  await act(async () => {
    protocolTrigger.click();
  });
  const bedrockOption = [...document.body.querySelectorAll('[role="option"]')].find((el) => el.textContent?.includes('AWS Bedrock'));
  if (!(bedrockOption instanceof HTMLElement)) throw new Error('Missing AWS Bedrock option in protocol dropdown');
  await act(async () => {
    bedrockOption.click();
  });
  expect(buttonByText(container, 'Bedrock guardrails & metadata').getAttribute('aria-expanded')).toBe('true');
  expect(container.querySelector('input[aria-label="Guardrail ID"]')).not.toBeNull();
});

test('protocol filter chips hide with <2 protocols and render human labels for >=2 protocols even with 2 models', async () => {
  const singleProtocolProvider: ProviderConfigurationRead = {
    revision: '1',
    configuration: {
      providerId: 'single-proto',
      name: 'Single Proto',
      endpoint: 'https://api.example/v1',
      protocol: 'chat-completions',
      credentialRef: null,
    },
    native: {
      providerId: 'single-proto',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://api.example/v1',
      effectiveApi: 'openai-completions',
      name: 'Single Proto',
      baseUrl: 'https://api.example/v1',
      api: 'openai-completions',
      configApiKey: { configured: false },
      headerNames: [],
      models: [
        { id: 'm1', name: 'M1', input: ['text'], headerNames: [] },
        { id: 'm2', name: 'M2', input: ['text'], headerNames: [] },
        { id: 'm3', name: 'M3', input: ['text'], headerNames: [] },
        { id: 'm4', name: 'M4', input: ['text'], headerNames: [] },
        { id: 'm5', name: 'M5', input: ['text'], headerNames: [] },
        { id: 'm6', name: 'M6', input: ['text'], headerNames: [] },
      ],
      modelOverrides: {},
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const singleContainer = await render(
    <CustomProviderForm {...formProps} initial={singleProtocolProvider} />,
  );
  expect(singleContainer.querySelector('input[aria-label="Filter configured models..."]')).not.toBeNull();
  expect(singleContainer.textContent).not.toContain('All (6)');

  const twoModelTwoProtoProvider: ProviderConfigurationRead = {
    revision: '1',
    configuration: {
      providerId: 'dual-proto',
      name: 'Dual Proto',
      endpoint: 'https://api.example/v1',
      protocol: 'responses',
      credentialRef: null,
    },
    native: {
      providerId: 'dual-proto',
      isBuiltIn: false,
      hasNativeEntry: true,
      effectiveBaseUrl: 'https://api.example/v1',
      effectiveApi: 'openai-codex-responses',
      name: 'Dual Proto',
      baseUrl: 'https://api.example/v1',
      api: 'openai-codex-responses',
      configApiKey: { configured: false },
      headerNames: [],
      models: [
        { id: 'codex-1', name: 'Codex 1', input: ['text'], headerNames: [] },
        { id: 'img-1', name: 'Image 1', api: 'openai-images', input: ['image'], headerNames: [] },
      ],
      modelOverrides: {},
    },
    models: [],
    headerNames: [],
    imageModels: [],
  };

  const dualContainer = await render(
    <CustomProviderForm {...formProps} initial={twoModelTwoProtoProvider} />,
  );
  const allChip = buttonByText(dualContainer, 'All (2)');
  const codexChip = buttonByText(dualContainer, 'OpenAI Codex Responses (1)');
  const imagesChip = buttonByText(dualContainer, 'OpenAI Images (1)');
  expect(allChip.getAttribute('aria-pressed')).toBe('true');
  expect(codexChip.getAttribute('aria-pressed')).toBe('false');
  expect(imagesChip.getAttribute('aria-pressed')).toBe('false');
  await act(async () => imagesChip.click());
  expect(allChip.getAttribute('aria-pressed')).toBe('false');
  expect(imagesChip.getAttribute('aria-pressed')).toBe('true');
  expect(dualContainer.textContent).not.toContain('openai-codex-responses');
  expect(dualContainer.textContent).not.toContain('openai-images');
});
