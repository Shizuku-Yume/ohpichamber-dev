import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { Window } from 'happy-dom';

describe('notification test feedback', () => {
  let dom: Window;
  let root: Root | undefined;
  let container: HTMLElement;
  const globals = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(() => {
    dom = new Window({ url: 'http://localhost/' });
    const values = {
      window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage,
      HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node,
      HTMLInputElement: dom.HTMLInputElement, DocumentFragment: dom.DocumentFragment,
      MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
      MouseEvent: dom.MouseEvent, PointerEvent: dom.PointerEvent, Event: dom.Event,
      CustomEvent: dom.CustomEvent, getComputedStyle: dom.getComputedStyle.bind(dom),
      requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
      cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
    };
    for (const [key, value] of Object.entries(values)) {
      globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = undefined;
    await dom.happyDOM.close();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  });

  const cases = ['darwin', 'win32', 'linux'].flatMap(platform => [false, true].map(shown => ({ platform, shown })));
  for (const { platform, shown } of cases) {
    test(`${platform} test reports ${shown ? 'native handoff' : 'failure'}`, async () => {
      const { createRoot } = await import('react-dom/client');
      const { NotificationSettings } = await import('./NotificationSettings');
      const { I18nProvider } = await import('@/lib/i18n');
      const { TooltipProvider } = await import('@/components/ui/tooltip');
      const { toast } = await import('@/components/ui');
      const { useUIStore } = await import('@/stores/useUIStore');
      const { getRegisteredRuntimeAPIs, registerRuntimeAPIs } = await import('@/contexts/runtimeAPIRegistry');
      const priorAPIs = getRegisteredRuntimeAPIs();
      registerRuntimeAPIs(null);
      Object.assign(window, {
        __OPENCHAMBER_ELECTRON__: { runtime: 'electron' },
        __OPENCHAMBER_PLATFORM__: platform,
        __OPENCHAMBER_RUNTIME_APIS__: { notifications: { notifyAgentCompletion: async () => shown } },
      });
      const priorEnabled = useUIStore.getState().nativeNotificationsEnabled;
      useUIStore.setState({ nativeNotificationsEnabled: true });
      const success = spyOn(toast, 'success').mockImplementation(() => 'success');
      const error = spyOn(toast, 'error').mockImplementation(() => 'error');
      try {
        const mounted = createRoot(container);
        root = mounted;
        await act(async () => {
          mounted.render(<I18nProvider><TooltipProvider><NotificationSettings /></TooltipProvider></I18nProvider>);
        });
        const button = [...container.querySelectorAll('button')].find(value => value.textContent?.includes('Send test notification'));
        if (!button) throw new Error('Missing test notification button');
        await act(async () => { button.click(); });
        if (shown) {
          expect(success).toHaveBeenCalledWith(platform === 'darwin'
            ? 'Test notification sent to macOS. If no banner appeared, allow OhPiChamber in System Settings → Notifications.'
            : 'Test notification sent successfully');
          expect(error).not.toHaveBeenCalled();
        } else {
          expect(error).toHaveBeenCalledWith(platform === 'darwin'
            ? 'Notification delivery could not be confirmed. Allow OhPiChamber in macOS System Settings → Notifications, then try again.'
            : 'Failed to send test notification');
          expect(success).not.toHaveBeenCalled();
        }
      } finally {
        success.mockRestore();
        error.mockRestore();
        registerRuntimeAPIs(priorAPIs);
        await act(async () => { useUIStore.setState({ nativeNotificationsEnabled: priorEnabled }); });
      }
    });
  }
});
