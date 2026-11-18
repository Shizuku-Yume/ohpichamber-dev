import { act } from 'react';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { HTMLDivElement as HappyDivElement, Window } from 'happy-dom';
import type { Model, Provider } from '@openchamber/agent-contract';

const browser = new Window({ url: 'http://localhost' });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  customElements: browser.customElements,
  IS_REACT_ACT_ENVIRONMENT: true,
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  getComputedStyle: browser.getComputedStyle.bind(browser),
})) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useConfigStore } = await import('@/stores/useConfigStore');
const { MobileEffortButton } = await import('./MobileEffortButton');

const PROVIDER_ID = 'omp';
const MODEL_ID = 'reasoning-model';

const model = (overrides: Partial<Model>): Model => ({
  modelId: MODEL_ID,
  provider: PROVIDER_ID,
  name: MODEL_ID,
  modalities: ['text'],
  contextWindow: 200_000,
  maxOutputTokens: 8_000,
  reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low', label: 'Low', budgetTokens: null },
    { reasoningEffort: 'medium', label: 'Medium', budgetTokens: null },
    { reasoningEffort: 'high', label: 'High', budgetTokens: null },
  ],
  variants: [],
  pricing: null,
  ...overrides,
});

const providerWith = (entry: Model): Provider & { models: Model[] } => ({
  providerId: PROVIDER_ID,
  name: PROVIDER_ID,
  endpoint: null,
  protocol: null,
  authMethods: [],
  auth: { status: 'missing' },
  models: [entry],
});

let root: Root | undefined;
let container: HappyDivElement;
const configInitial = useConfigStore.getState();

beforeEach(() => {
  container = browser.document.createElement('div') as HappyDivElement;
  browser.document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  useConfigStore.setState(configInitial, true);
});

async function renderFor(entry: Model) {
  useConfigStore.setState({
    providers: [providerWith(entry)],
    providersLoaded: true,
    currentProviderId: PROVIDER_ID,
    currentModelId: MODEL_ID,
    currentAgentName: 'build',
    currentReasoningEffort: 'medium',
    currentVariant: undefined,
    currentVariantSelection: { override: undefined, inherited: undefined },
  });
  await act(async () => {
    root!.render(
      <I18nProvider>
        <MobileEffortButton onCycleThinking={() => { }} onOpenThinking={() => { }} />
      </I18nProvider>,
    );
  });
  return container.querySelector('button');
}

describe('MobileEffortButton', () => {
  test('renders the model effort levels when the catalog only carries reasoningOptions', async () => {
    const button = await renderFor(model({}));
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Thinking: Medium');
    expect(button?.textContent).toContain('/');
    expect(button?.textContent).toContain('Medium');
  });

  test('renders a single Off level for a reasoning model with no advertised options', async () => {
    const button = await renderFor(model({ reasoningOptions: [] }));
    expect(button?.getAttribute('aria-label')).toBe('Thinking: Off');
  });

  test('falls back to legacy variant routes when the catalog has no effort options', async () => {
    const button = await renderFor(model({
      reasoningEffortSupported: false,
      reasoningOptions: [],
      variants: [{ variant: 'low', label: 'Low', reasoningEffort: null }],
    }));
    expect(button?.getAttribute('aria-label')).toBe('Thinking: Default');
  });

  test('hides for a model with neither effort options nor routes', async () => {
    expect(await renderFor(model({ reasoningEffortSupported: false, reasoningOptions: [], variants: [] }))).toBeNull();
  });

  test('hides for Auto routing', async () => {
    useConfigStore.setState({ currentProviderId: 'openchamber', currentModelId: 'auto' });
    await act(async () => {
      root!.render(<I18nProvider><MobileEffortButton onCycleThinking={() => { }} onOpenThinking={() => { }} /></I18nProvider>);
    });
    expect(container.querySelector('button')).toBeNull();
  });
});
