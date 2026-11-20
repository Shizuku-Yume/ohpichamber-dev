import React from 'react';
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useMobileSettingsSurfaceOpener } from '@/apps/mobileAppContext';
import { LegacyDataNotice } from './LegacyDataNotice';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import { useUIStore } from '@/stores/useUIStore';

// Bun cannot load Vite's `?worker&url` import that the settings page graph reaches.
mock.module('../chat/markdown/markdown-shiki.worker.ts?worker&url', () => ({ default: 'blob:test-shiki-worker' }));
// Loaded after the shim so the worker URL never reaches Bun's loader.
const { SettingsView } = await import('@/components/views/SettingsView');

type HappyDomWindow = InstanceType<typeof Window>;
const originalFetch = globalThis.fetch;
const originalDescriptors = new Map();
const globalNames = ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const storageKeys = ['legacy-data-notice-dismissed:task20-rendered', 'legacy-data-notice-dismissed:task20-configure', 'legacy-data-notice-dismissed:task20-mobile'];
let browser: HappyDomWindow | undefined;
let root: Root | undefined;
let container: HTMLElement;

const installBrowser = () => {
  browser = new Window({ url: 'http://localhost' });
  const values = {
    window: browser, document: browser.document, navigator: browser.navigator, localStorage: browser.localStorage,
    HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, Event: browser.Event, CustomEvent: browser.CustomEvent,
    MouseEvent: browser.MouseEvent, getComputedStyle: browser.getComputedStyle.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
  };
  for (const name of globalNames) {
    originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: values[name] });
  }
  container = document.createElement('div');
  document.body.append(container);
};

const renderNotice = async () => {
  const nextRoot = createRoot(container);
  root = nextRoot;
  await act(async () => {
    nextRoot.render(<I18nProvider><LegacyDataNotice /></I18nProvider>);
    await flush();
  });
};

const flush = async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, 0);
  await promise;
};

const MobileLegacyHandoffHarness: React.FC = () => {
  const [surface, setSurface] = React.useState<'settings' | null>(null);
  const [initialMobileStage, setInitialMobileStage] = React.useState<'nav' | 'page-content'>('nav');
  const openSettingsSurface = useMobileSettingsSurfaceOpener(setInitialMobileStage, setSurface);
  return (
    <>
      <LegacyDataNotice onOpenSettings={openSettingsSurface} />
      {surface === 'settings' ? (
        <div data-mobile-active-surface={surface}>
          <SettingsView forceMobile isWindowed initialMobileStage={initialMobileStage} visiblePageSlugs={['providers']} />
        </div>
      ) : null}
    </>
  );
};

const renderMobileHarness = async () => {
  const nextRoot = createRoot(container);
  root = nextRoot;
  await act(async () => {
    nextRoot.render(<I18nProvider><TooltipProvider><MobileLegacyHandoffHarness /></TooltipProvider></I18nProvider>);
    await flush();
  });
};

afterEach(async () => {
  const mountedRoot = root;
  root = undefined;
  if (mountedRoot) await act(async () => mountedRoot.unmount());
  globalThis.fetch = originalFetch;
  for (const key of storageKeys) getSafeStorage().removeItem(key);
  if (browser) await browser.happyDOM.close();
  for (const [name, descriptor] of originalDescriptors) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originalDescriptors.clear();
  browser = undefined;
  useUIStore.getState().setSettingsDialogOpen(false);
  useUIStore.getState().setSettingsProvidersConnectRequested(false);
  useUIStore.getState().setSettingsPage('home');
  switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: 'task20-rendered-reset' });
});

describe('legacy notice rendered behavior', () => {
  test('renders from an existence-only response, dismisses, and stays hidden after remount', async () => {
    installBrowser();
    switchRuntimeEndpoint({ apiBaseUrl: 'http://task20.test', clientToken: 'task20', runtimeKey: 'task20-rendered' });
    globalThis.fetch = async input => String(input).includes('/api/host/legacy-data')
      ? Response.json({ present: true })
      : Response.json({ present: false });
    const response = await fetch('http://task20.test/api/host/legacy-data');
    const payload = await response.json();
    expect(payload).toEqual({ present: true });
    expect(Object.keys(payload)).toEqual(['present']);
    await renderNotice();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    const dismiss = [...container.querySelectorAll('button')].find(button => button.textContent === 'Dismiss');
    expect(dismiss).toBeDefined();
    if (!dismiss) throw new Error('Dismiss button missing');
    await act(async () => dismiss.click());
    expect(container.querySelector('[role="status"]')).toBeNull();
    const mountedRoot = root;
    if (!mountedRoot) throw new Error('Notice root missing');
    await act(async () => mountedRoot.unmount());
    root = undefined;
    await renderNotice();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  test('configure providers navigates to the existing providers settings surface', async () => {
    installBrowser();
    switchRuntimeEndpoint({ apiBaseUrl: 'http://task20.test', clientToken: 'task20', runtimeKey: 'task20-configure' });
    globalThis.fetch = async () => Response.json({ present: true });
    await renderNotice();
    const configure = [...container.querySelectorAll('button')].find(button => button.textContent === 'Configure providers');
    expect(configure).toBeDefined();
    if (!configure) throw new Error('Configure providers button missing');
    await act(async () => configure.click());
    expect(useUIStore.getState().settingsProvidersConnectRequested).toBe(true);
    expect(useUIStore.getState().settingsPage).toBe('providers');
    expect(useUIStore.getState().isSettingsDialogOpen).toBe(true);
  });

  test('mobile configure opens Settings on the Providers page, consumes the request, and dismisses the notice', async () => {
    installBrowser();
    switchRuntimeEndpoint({ apiBaseUrl: 'http://task20.test', clientToken: 'task20', runtimeKey: 'task20-mobile' });
    globalThis.fetch = async input => String(input).includes('/api/host/legacy-data')
      ? Response.json({ present: true })
      : Response.json({});
    await renderMobileHarness();
    expect(container.querySelector('[data-mobile-active-surface="settings"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
    const configure = [...container.querySelectorAll('button')].find(button => button.textContent === 'Configure providers');
    expect(configure).toBeDefined();
    if (!configure) throw new Error('Configure providers button missing');
    await act(async () => {
      configure.click();
      await flush();
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[data-mobile-active-surface="settings"]')).not.toBeNull();
    expect(container.querySelector('[data-settings-view="true"]')).not.toBeNull();
    expect(container.textContent).toContain('Providers');
    expect(useUIStore.getState().settingsPage).toBe('providers');
    expect(useUIStore.getState().isSettingsDialogOpen).toBe(true);
    expect(useUIStore.getState().settingsProvidersConnectRequested).toBe(false);
  });

  test('keeps the notice hidden when the Host reports clean data', async () => {
    installBrowser();
    switchRuntimeEndpoint({ apiBaseUrl: 'http://task20.test', clientToken: 'task20', runtimeKey: 'task20-clean' });
    globalThis.fetch = async () => Response.json({ present: false });
    await renderNotice();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
