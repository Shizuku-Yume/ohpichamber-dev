import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Model, Provider } from '@openchamber/agent-contract';
import type { RoutingConfig } from '@/lib/routing/routingApi';
import { useRoutingStore } from '@/stores/useRoutingStore';
import { useConfigStore } from '@/stores/useConfigStore';

const domWindow = new Window();
Object.defineProperty(globalThis, 'window', { value: domWindow, configurable: true, writable: true });
Object.defineProperty(globalThis, 'document', { value: domWindow.document, configurable: true, writable: true });
Object.assign(globalThis, {
  navigator: domWindow.navigator,
  Node: domWindow.Node,
  Element: domWindow.Element,
  HTMLElement: domWindow.HTMLElement,
  HTMLInputElement: domWindow.HTMLInputElement,
  HTMLButtonElement: domWindow.HTMLButtonElement,
  customElements: domWindow.customElements,
  MutationObserver: domWindow.MutationObserver,
  ResizeObserver: domWindow.ResizeObserver,
  PointerEvent: domWindow.PointerEvent,
  MouseEvent: domWindow.MouseEvent,
  KeyboardEvent: domWindow.KeyboardEvent,
  Event: domWindow.Event,
  localStorage: domWindow.localStorage,
  getComputedStyle: domWindow.getComputedStyle.bind(domWindow),
  requestAnimationFrame: domWindow.requestAnimationFrame.bind(domWindow),
  cancelAnimationFrame: domWindow.cancelAnimationFrame.bind(domWindow),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// Setup DOM globals before importing React DOM client and component under test
const reactDomClient = await import('react-dom/client');
const createRoot = reactDomClient.createRoot;
type Root = import('react-dom/client').Root;

const mockConfig: RoutingConfig = {
  enabled: true,
  fallback: {
    model: { providerID: 'anthropic', modelID: 'claude-3-7-sonnet' },
    variant: 'high',
  },
  minConfidence: 0.6,
  preserveCache: true,
  safetyNet: { enabled: true, threshold: 0.6 },
  categories: [
    {
      id: 'trivial',
      builtin: true,
      enabled: true,
      name: 'Trivial',
      description: 'Quick mechanical task',
      model: null,
      variant: null,
      agent: null,
    },
    {
      id: 'hard',
      builtin: true,
      enabled: true,
      name: 'Hard',
      description: 'Hard reasoning and architecture',
      model: { providerID: 'anthropic', modelID: 'claude-3-7-sonnet' },
      variant: 'high',
      agent: null,
    },
  ],
};

mock.module('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params?.name && typeof params.name === 'string') return `${key}:${params.name}`;
      return key;
    },
  }),
}));

mock.module('@/components/sections/classification/JevAccessNote', () => ({
  JevAccessNote: () => <div data-testid="jev-access-note" />,
}));

interface MockModelSelectorProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  placeholder?: string;
}

mock.module('@/components/sections/agents/ModelSelector', () => ({
  ModelSelector: ({ providerId, modelId, onChange, placeholder }: MockModelSelectorProps) => (
    <div data-testid="model-selector" data-provider={providerId} data-model={modelId}>
      <span>{modelId || placeholder}</span>
      <button type="button" onClick={() => onChange('anthropic', 'claude-3-7-sonnet')}>
        Select Model
      </button>
    </div>
  ),
}));

mock.module('@/lib/persistence', () => ({
  reportSettingsSaveState: () => {},
}));

const mockModel: Model = {
  modelId: 'claude-3-7-sonnet',
  provider: 'anthropic',
  name: 'Claude 3.7 Sonnet',
  modalities: ['text'],
  contextWindow: 200_000,
  maxOutputTokens: 64_000,
  reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
    { reasoningEffort: 'medium', label: 'Medium', budgetTokens: null },
    { reasoningEffort: 'high', label: 'High', budgetTokens: null },
  ],
  variants: [],
  pricing: null,
};

const mockProvider: Provider & { models: Model[] } = {
  providerId: 'anthropic',
  name: 'Anthropic',
  endpoint: null,
  protocol: null,
  authMethods: ['api-key'],
  auth: { status: 'configured', method: 'api-key', source: 'stored-credential', credentialRef: 'cred_anthropic' },
  models: [mockModel],
};

const { RoutingPage } = await import('./RoutingPage');

describe('RoutingPage', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    useRoutingStore.setState({
      available: true,
      loaded: true,
      autoReady: true,
      config: mockConfig,
      builtins: mockConfig.categories,
      load: async () => {},
      saveConfig: async () => {},
    });

    useConfigStore.setState({
      providers: [mockProvider],
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  test('does not render AgentSelector in routing category editor (W2 invariant)', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });
    const toggleButton = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Hard'));
    expect(toggleButton).toBeDefined();
    await act(async () => {
      toggleButton?.click();
    });
    // AgentSelector and agent field must NOT be rendered in the category editor
    expect(container.querySelector('[data-testid="agent-selector"]')).toBeNull();
    expect(container.textContent).not.toContain('settings.routing.category.agent');

    // Thinking efforts and model selector are rendered
    expect(container.textContent).toContain('settings.routing.category.thinking');
    expect(container.textContent).toContain('settings.routing.category.model');
  });

  test('thinking select displays reasoning effort options rather than legacy model variants', async () => {
    await act(async () => {
      root.render(<RoutingPage />);
    });

    const fallbackSelect = container.querySelector('[aria-label="settings.routing.auto.fallbackThinking"]');
    expect(fallbackSelect).not.toBeNull();

    expect(container.textContent).toContain('settings.page.routing.title');
    expect(container.textContent).toContain('settings.routing.auto.fallbackModel');
  });
});
