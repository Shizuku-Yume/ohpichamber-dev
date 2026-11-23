import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';
import type { WebSearchSnapshot } from '@/stores/useWebSearchStore';
import type { WebSearchProviderEntry } from '@openchamber/agent-contract';
import { dict as en } from '@/lib/i18n/messages/en';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Node: browser.Node,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  HTMLButtonElement: browser.HTMLButtonElement,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  DOMRect: browser.DOMRect,
  KeyboardEvent: browser.KeyboardEvent,
  FocusEvent: browser.FocusEvent,
  CustomEvent: browser.CustomEvent,
  MutationObserver: browser.MutationObserver,
  ResizeObserver: browser.ResizeObserver,
  getComputedStyle: browser.getComputedStyle.bind(browser),
  requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
  cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  IS_REACT_ACT_ENVIRONMENT: true,
});

// These loading boundaries must run after the browser globals and the Bun asset-loader plugin are installed.
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { I18nProvider, useI18nStore } = await import('@/lib/i18n');
const { dict: dictZhCn } = await import('@/lib/i18n/messages/zh-CN');
const { getWebSearchScopeKey, useWebSearchStore } = await import('@/stores/useWebSearchStore');
const { WebSearchPage } = await import('./WebSearchPage');

describe('WebSearchPage', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container?.remove();
  });

  test('renders provider selection, timeout, and collapsible provider credential cards', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const scope = getWebSearchScopeKey();
    const mockSnapshot: WebSearchSnapshot = {
      workspaceId: 'workspace-1',
      scope,
      revision: '1',
      enabled: true,
      selectedProviderId: 'tavily',
      fallbackProviderIds: ['brave'],
      timeoutSeconds: 30,
      providers: [
        {
          providerId: 'tavily',
          name: 'Tavily',
          configured: true,
          requiresCredential: true,
          isSelfHosted: false,
          credentialConfigured: true,
          credentialWritable: true,
        },
        {
          providerId: 'brave',
          name: 'Brave Search',
          configured: true,
          requiresCredential: true,
          isSelfHosted: false,
          credentialConfigured: false,
          credentialWritable: true,
        },
      ],
    };

    useWebSearchStore.setState({
      state: { kind: 'ready', snapshot: mockSnapshot },
      error: null,
      outcome: null,
      busy: false,
      load: async () => { },
    });

    await act(async () => {
      root?.render(
        <I18nProvider>
          <WebSearchPage />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toContain('Tavily');
    expect(container.textContent).toContain('Brave Search');

    const timeoutInput = container.querySelector('input[inputmode="numeric"]');
    expect(timeoutInput).not.toBeNull();
    if (timeoutInput instanceof HTMLInputElement) {
      expect(timeoutInput.value).toBe('30');
    }
  });

  // The page's load effect must fire once for an unanswered scope. It used to
  // depend on the whole state object, and `load()` publishes a fresh
  // `{ kind: 'loading' }` on every call, so the effect re-ran for its own write
  // and the page resolved the workspace thousands of times without ever
  // reading the snapshot.
  test('an unanswered scope triggers one load, not a loop', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let loads = 0;
    const pending = new Promise<void>(() => { });
    useWebSearchStore.setState({
      state: { kind: 'idle' },
      error: null,
      outcome: null,
      busy: false,
      load: async () => {
        loads += 1;
        // Publish the same shape the real store does, then stay in flight.
        useWebSearchStore.setState({ state: { kind: 'loading', scope: getWebSearchScopeKey() } });
        await pending;
      },
    });

    await act(async () => {
      root?.render(
        <I18nProvider>
          <WebSearchPage />
        </I18nProvider>,
      );
    });
    await act(async () => { await Promise.resolve(); });

    expect(loads).toBe(1);
  });

  // A read in flight belongs to the scope that started it. A scope change
  // abandons that request, so the page must start the new one instead of
  // waiting for a reply the store will discard.
  test('a scope change during a read starts a load for the new scope', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let loads = 0;
    useWebSearchStore.setState({
      state: { kind: 'loading', scope: 'a-different-scope' },
      error: null,
      outcome: null,
      busy: false,
      load: async () => { loads += 1; },
    });

    await act(async () => {
      root?.render(
        <I18nProvider>
          <WebSearchPage />
        </I18nProvider>,
      );
    });
    await act(async () => { await Promise.resolve(); });

    expect(loads).toBe(1);
  });

  const entry = (providerId: string, name: string, overrides: Partial<WebSearchProviderEntry> = {}): WebSearchProviderEntry => ({
    providerId,
    name,
    configured: true,
    requiresCredential: true,
    isSelfHosted: false,
    credentialConfigured: true,
    credentialWritable: true,
    ...overrides,
  });

  // Expected copy comes from the English dictionary, so a wording change in a
  // locale file cannot silently pass these assertions.
  const addFallbackLabel = en['settings.webSearch.native.addFallback'];
  const removeLabel = (provider: string) =>
    en['settings.webSearch.native.removeFallback'].replace('{provider}', provider);
  const configureLabel = (provider: string) =>
    en['settings.webSearch.native.configureFallback'].replace('{provider}', provider);

  const fallbackSnapshot = (fallbackProviderIds: string[]): WebSearchSnapshot => ({
    workspaceId: 'workspace-1',
    scope: getWebSearchScopeKey(),
    revision: '1',
    enabled: true,
    selectedProviderId: 'tavily',
    fallbackProviderIds,
    timeoutSeconds: 30,
    providers: [
      entry('tavily', 'Tavily'),
      entry('brave', 'Brave Search', { credentialConfigured: false }),
      entry('exa', 'Exa'),
      entry('searxng', 'SearXNG', { requiresCredential: false, credentialConfigured: false }),
      entry('serper', 'Serper', { configured: false, requiresCredential: false, credentialConfigured: false }),
    ],
  });

  const renderWithSnapshot = async (initial: WebSearchSnapshot) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const saved: (string[] | null)[] = [];
    let snapshot = initial;
    useWebSearchStore.setState({
      state: { kind: 'ready', snapshot },
      error: null,
      outcome: null,
      busy: false,
      load: async () => { },
      update: async (changes) => {
        if (changes.fallbackProviderIds !== undefined) saved.push(changes.fallbackProviderIds);
        snapshot = { ...snapshot, ...changes, fallbackProviderIds: changes.fallbackProviderIds ?? snapshot.fallbackProviderIds };
        useWebSearchStore.setState({ state: { kind: 'ready', snapshot } });
        return true;
      },
    });

    await act(async () => {
      root?.render(
        <I18nProvider>
          <WebSearchPage />
        </I18nProvider>,
      );
    });

    const getSection = () => {
      const element = container.querySelector('[data-settings-item="web-search.fallbacks"]');
      if (!(element instanceof HTMLElement)) throw new Error('The fallback section did not render');
      return element;
    };
    const section = getSection();
    const handles = () => Array.from(getSection().querySelectorAll<HTMLButtonElement>('button[aria-label^="Drag "]'));
    // A row is the sortable item that wraps each handle; its content is the
    // sibling list of ordinal, icon, name, optional pill and remove button.
    const rows = () => handles().map((handle) => handle.parentElement).filter((row): row is HTMLElement => row !== null);
    const rowNames = () => rows().map((row) => row.querySelector('.typography-ui-label.text-foreground')?.textContent);
    const rowOrdinals = () => rows().map((row) => row.querySelector('.oc-tile-inset.tabular-nums')?.textContent);
    // Both static `SettingsCardPill` spans and interactive warning setup
    // buttons carry `rounded-full` inside a row, so this counts status pills
    // structurally instead of matching their copy.
    const rowPillCounts = () => rows().map((row) => row.querySelectorAll('.rounded-full').length);
    const helperLines = () => Array.from(getSection().querySelectorAll('p.typography-meta')).map((line) => line.textContent);
    const addButton = () => [...getSection().querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes(addFallbackLabel));
    return { section, saved, handles, rows, rowNames, rowOrdinals, rowPillCounts, helperLines, addButton };
  };

  test('resetting the fallbacks clears the override rather than saving an empty chain', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot([]));
    const reset = Array.from(page.section.querySelectorAll('button'))
      .find(button => button.textContent === en['settings.webSearch.native.resetFallbacks']);
    expect(reset).toBeDefined();
    await act(async () => reset?.click());
    expect(page.saved).toEqual([null]);
  });

  test('an empty fallback chain shows one helper line and the add action', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot([]));

    expect(page.rowNames()).toEqual([]);
    expect(page.helperLines()).toEqual([en['settings.webSearch.native.fallbacksEmpty']]);
    expect(page.addButton()).toBeInstanceOf(HTMLButtonElement);
    expect(page.addButton()?.disabled).toBe(false);
  });

  // With no rows and nothing addable, the empty-state line is the only helper:
  // a second "nothing to add" line would say the same thing twice.
  test('an empty chain with nothing addable shows exactly one helper line', async () => {
    const snapshot = fallbackSnapshot([]);
    snapshot.providers = [entry('tavily', 'Tavily'), entry('serper', 'Serper', { configured: false, requiresCredential: false, credentialConfigured: false })];
    const page = await renderWithSnapshot(snapshot);

    expect(page.rowNames()).toEqual([]);
    expect(page.helperLines()).toEqual([en['settings.webSearch.native.fallbacksEmpty']]);
    expect(page.addButton()?.disabled).toBe(true);
  });

  test('nothing addable with existing rows disables the add action and explains why', async () => {
    const snapshot = fallbackSnapshot(['brave', 'exa']);
    snapshot.providers = [entry('tavily', 'Tavily'), entry('brave', 'Brave Search'), entry('exa', 'Exa')];
    const page = await renderWithSnapshot(snapshot);

    expect(page.addButton()?.disabled).toBe(true);
    expect(page.helperLines()).toEqual([en['settings.webSearch.native.addFallbackNone']]);
  });

  // The primary provider and an unconfigured provider are never offered; a
  // picked provider is appended to the chain in one write.
  test('the add menu lists only addable providers and appends the pick', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot(['brave', 'searxng']));

    const trigger = page.addButton();
    if (!trigger) throw new Error('The add-fallback trigger did not render');
    await act(async () => { trigger.click(); });
    const items = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    // Serper is unconfigured and Tavily is the primary, so only Exa is offered.
    expect(items().map((item) => item.textContent?.trim())).toEqual(['Exa']);

    await act(async () => { items()[0]?.click(); });
    expect(page.saved).toEqual([['brave', 'searxng', 'exa']]);
    expect(page.rowNames()).toEqual(['Brave Search', 'SearXNG', 'Exa']);
  });

  // A fallback carries a pill only when its key or setup is missing; removal is
  // an icon-only ghost button addressed by its localised label.
  test('a row shows a warning only when setup is missing and removes by icon label', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot(['brave', 'serper']));

    const rows = page.rows();
    expect(rows[0]?.parentElement?.classList.contains('gap-2')).toBe(true);
    rows.forEach((row, index) => {
      expect(row.classList.contains('oc-tile')).toBe(true);
      expect(row.classList.contains('oc-tile-hover')).toBe(true);
      expect(row.classList.contains('rounded-xl')).toBe(true);
      expect(row.querySelector('.oc-tile-inset.tabular-nums')?.textContent).toBe(String(index + 1));
      expect(row.querySelector('.oc-tile-inset svg')).not.toBeNull();
    });

    expect(page.rowNames()).toEqual(['Brave Search', 'Serper']);
    expect(page.rowPillCounts()).toEqual([1, 1]);
    const [keyRow, setupRow] = rows;
    expect(keyRow?.textContent).toContain(en['settings.webSearch.card.needsKey']);
    expect(keyRow?.querySelector(`button[aria-label="${configureLabel('Brave Search')}"]`)).toBeInstanceOf(HTMLButtonElement);
    expect(setupRow?.textContent).toContain(en['settings.webSearch.card.needsSetup']);
    expect(setupRow?.querySelector(`button[aria-label="${configureLabel('Serper')}"]`)).toBeInstanceOf(HTMLButtonElement);

    const remove = page.section.querySelector<HTMLButtonElement>(`button[aria-label="${removeLabel('Brave Search')}"]`);
    expect(remove).toBeInstanceOf(HTMLButtonElement);
    expect(remove?.textContent?.trim()).toBe('');
    await act(async () => { remove?.click(); });
    expect(page.saved[page.saved.length - 1]).toEqual(['serper']);
    expect(page.rowNames()).toEqual(['Serper']);
  });

  test('clicking an unconfigured fallback warning pill opens provider detail and back returns to the list', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot(['brave', 'serper']));

    const configureButton = page.section.querySelector<HTMLButtonElement>(
      `button[aria-label="${configureLabel('Brave Search')}"]`,
    );
    expect(configureButton).toBeInstanceOf(HTMLButtonElement);
    await act(async () => { configureButton?.click(); });

    const keyInput = container.querySelector('input[aria-label="Brave Search API key"]');
    expect(keyInput).toBeInstanceOf(HTMLInputElement);
    const backButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${en['settings.webSearch.detail.back']}"]`,
    );
    expect(backButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => { backButton?.click(); });
    expect(page.rowNames()).toEqual(['Brave Search', 'Serper']);
  });

  // A fully configured fallback says nothing: the list already implies that a
  // row was addable, so only a missing key or setup is worth a pill.
  test('a fully configured fallback carries no status pill', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot(['exa']));

    expect(page.rowNames()).toEqual(['Exa']);
    expect(page.rowPillCounts()).toEqual([0]);
  });

  // The chain is saved whole and in order, so a keyboard drag writes the same
  // complete list a mouse drag does; the ordinals follow the new order.
  test('a fallback reorders with the keyboard handle and saves the new order', async () => {
    const page = await renderWithSnapshot(fallbackSnapshot(['brave', 'searxng']));

    expect(page.rowNames()).toEqual(['Brave Search', 'SearXNG']);
    expect(page.rowOrdinals()).toEqual(['1', '2']);
    page.handles().forEach((handle, index) => {
      if (handle.parentElement) handle.parentElement.getBoundingClientRect = () => new DOMRect(0, index * 40, 400, 36);
    });
    const press = (target: EventTarget, code: string) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code, key: code === 'Space' ? ' ' : code }));
    };
    const searxngHandle = page.handles()[1];
    if (!searxngHandle) throw new Error('The SearXNG handle did not render');
    await act(async () => { press(searxngHandle, 'Space'); });
    await act(async () => { press(document, 'ArrowUp'); });
    await act(async () => { press(document, 'Space'); });

    expect(page.saved).toEqual([['searxng', 'brave']]);
    expect(page.rowNames()).toEqual(['SearXNG', 'Brave Search']);
    expect(page.rowOrdinals()).toEqual(['1', '2']);
  });
  // The Agent Service calls this provider "Session model"; the UI names it in
  // the reader's language, and any other id keeps the name the service reports.
  test('a known provider id is named by the dictionary and an unknown one keeps the service name', async () => {
    await act(async () => { useI18nStore.getState().setLocale('zh-CN'); });
    for (let attempt = 0; attempt < 50 && useI18nStore.getState().loadingLocale !== null; attempt += 1) {
      await act(async () => { await Promise.resolve(); });
    }
    const page = await renderWithSnapshot({
      ...fallbackSnapshot(['web/hosted']),
      selectedProviderId: 'web/hosted',
      providers: [entry('web/hosted', 'Session model'), entry('team/search', 'Team search')],
    });

    expect(container.textContent).toContain(dictZhCn['settings.webSearch.provider.hosted']);
    expect(container.textContent).toContain(
      dictZhCn['settings.webSearch.mode.providerDescription'].replace('{provider}', dictZhCn['settings.webSearch.provider.hosted']),
    );
    expect(container.textContent).toContain('Team search');
    expect(container.textContent).not.toContain('Session model');
    expect(page.rowNames()).toEqual([]);
  });
});
