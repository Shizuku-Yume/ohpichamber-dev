import { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import type { Root } from 'react-dom/client';
import { HTMLDivElement as HappyDivElement, Window } from 'happy-dom';
import type { RuntimeAPIs } from '@/lib/api/types';

mock.module('@/components/chat/markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));
mock.module('../chat/markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));

// SAFETY: These navigation tests do not call any runtime API.
const runtime = {} as RuntimeAPIs;

const browser = new Window({ url: 'http://localhost' });
let root: Root;
const descriptors = new Map<string, PropertyDescriptor | undefined>();

for (const [key, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
  Element: browser.Element,
  HTMLElement: browser.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
  customElements: browser.customElements,
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (handle: number) => clearTimeout(handle),
  getComputedStyle: browser.getComputedStyle.bind(browser),
})) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { useUIStore } = await import('@/stores/useUIStore');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { SettingsView } = await import('./SettingsView');
const { MOBILE_SETTINGS_PAGES } = await import('@/apps/mobileSettingsNavigation');

let container: HappyDivElement;

beforeEach(() => {
  container = browser.document.createElement('div');
  browser.document.body.appendChild(container);
  const rootTarget = container as unknown as Element;
  root = createRoot(rootTarget);
  useUIStore.setState({
    settingsPage: 'general',
    isSettingsDialogOpen: true,
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

test('SettingsView renders the restored Behavior page in the agent navigation group', async () => {
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtime}>
        <I18nProvider>
          <SettingsView onClose={() => {}} forceMobile={false} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    );
  });
  const buttonElements = Array.from(container.querySelectorAll('button'));
  const navTexts = buttonElements.map((b) => b.textContent?.trim() || '');

  // Behavior is restored next to OMP for global and project AGENTS.md rules.
  expect(navTexts.some((text) => text === 'Behavior')).toBe(true);

  // Verify OMP, Agents, Commands, MCP are present in navigation
  expect(navTexts.some((text) => text === 'OMP')).toBe(true);
  expect(navTexts.some((text) => text === 'Agents')).toBe(true);
  expect(navTexts.some((text) => text === 'Commands')).toBe(true);
  expect(navTexts.some((text) => text === 'MCP')).toBe(true);
});

test('SettingsView displays clarified Guest Extensions, OMP Plugins, and Prompt Templates labels', async () => {
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtime}>
        <I18nProvider>
          <SettingsView onClose={() => {}} forceMobile={false} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    );
  });

  const buttonElements = Array.from(container.querySelectorAll('button'));
  const navTexts = buttonElements.map((b) => b.textContent?.trim() || '');
  // Verify clarified names in settings navigation
  expect(navTexts.some((text) => text === 'Guest Extensions')).toBe(true);
  expect(navTexts.some((text) => text === 'OMP Plugins')).toBe(true);
  expect(navTexts.some((text) => text === 'Prompt Templates')).toBe(true);

  // Verify old unclarified names are no longer used as standalone nav items
  expect(navTexts.includes('Extensions')).toBe(false);
  expect(navTexts.includes('Plugins')).toBe(false);
  expect(navTexts.includes('Snippets')).toBe(false);
});

test('the phone Settings list offers every page a deep link can open', async () => {
  useUIStore.setState({ settingsPage: 'home', isSettingsDialogOpen: true });
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtime}>
        <I18nProvider>
          <SettingsView onClose={() => {}} forceMobile initialMobileStage="nav" visiblePageSlugs={[...MOBILE_SETTINGS_PAGES]} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    );
  });
  const navTexts = Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() || '');
  for (const page of ['Memory', 'Behavior', 'Projects', 'Remote instances', 'Tools', 'General']) {
    expect(navTexts.some((text) => text === page)).toBe(true);
  }
  // The phone has no hardware keyboard, so Shortcuts stays out of its list.
  expect(navTexts).not.toContain('Shortcuts');
});

test('a phone deep link to a page the list shows opens the page', async () => {
  useUIStore.setState({ settingsPage: 'memory', isSettingsDialogOpen: true });
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtime}>
        <I18nProvider>
          <SettingsView onClose={() => {}} forceMobile initialMobileStage="page-content" visiblePageSlugs={[...MOBILE_SETTINGS_PAGES]} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    );
  });
  // The navigation stage is the list with a search field; the page is not.
  expect(container.querySelector('[data-settings-search]')).toBeNull();
});

test('a phone deep link to the keyboard-only Shortcuts page stays on the list', async () => {
  useUIStore.setState({ settingsPage: 'shortcuts', isSettingsDialogOpen: true });
  await act(async () => {
    root.render(
      <RuntimeAPIContext.Provider value={runtime}>
        <I18nProvider>
          <SettingsView onClose={() => {}} forceMobile initialMobileStage="nav" visiblePageSlugs={[...MOBILE_SETTINGS_PAGES]} />
        </I18nProvider>
      </RuntimeAPIContext.Provider>
    );
  });
  expect(container.querySelector('[data-settings-search]')).not.toBeNull();
  expect(container.textContent).not.toContain('Customize keyboard shortcuts.');
});
