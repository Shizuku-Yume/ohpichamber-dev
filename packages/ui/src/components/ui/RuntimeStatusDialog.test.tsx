import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

const uiState = {
  isRuntimeStatusDialogOpen: true,
  runtimeStatusText: 'Time: 2026-10-29T00:00:00.000Z\nLog files:\n- Host console: /tmp/host.log',
  setRuntimeStatusDialogOpen: () => undefined,
};

mock.module('@/stores/useUIStore', () => ({
  useUIStore: <T,>(selector: (state: typeof uiState) => T): T => selector(uiState),
}));
mock.module('@/components/ui', () => ({ toast: { success: () => undefined, error: () => undefined } }));
mock.module('@/lib/clipboard', () => ({ copyTextToClipboard: async () => ({ ok: true }) }));
mock.module('@/lib/diagnostics/export', () => ({ downloadDiagnosticLog: async () => 'diagnostics.json' }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
// The dialog shell is not what this test proves; the body's direction is.
mock.module('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

// Deferred on purpose: the component captures the mocked stores and dialog shell
// at import time, so a static import would load the real modules first.
const { RuntimeStatusDialog } = await import('./RuntimeStatusDialog');

describe('RuntimeStatusDialog under a right-to-left locale', () => {
  let windowInstance: Window;
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    windowInstance = new Window({ url: 'http://localhost/' });
    // SAFETY: the test installs a happy-dom Window for the component and restores the original global afterward.
    Object.assign(globalThis, {
      window: windowInstance,
      document: windowInstance.document,
      navigator: windowInstance.navigator,
      Node: windowInstance.Node,
      Element: windowInstance.Element,
      HTMLElement: windowInstance.HTMLElement,
      Event: windowInstance.Event,
      MouseEvent: windowInstance.MouseEvent,
      MutationObserver: windowInstance.MutationObserver,
      getComputedStyle: windowInstance.getComputedStyle.bind(windowInstance),
      requestAnimationFrame: windowInstance.requestAnimationFrame.bind(windowInstance),
      cancelAnimationFrame: windowInstance.cancelAnimationFrame.bind(windowInstance),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    document.documentElement.dir = 'rtl';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    windowInstance.close();
  });

  // Generated status text is Latin machine output. Under an RTL document the
  // body must still read left to right, so it carries its own direction and the
  // dialog shell keeps following the document.
  test('the diagnostics body is LTR while the dialog follows the document direction', async () => {
    await act(async () => {
      root.render(<RuntimeStatusDialog />);
      await Promise.resolve();
    });

    const body = host.querySelector('pre');
    expect(body?.getAttribute('dir')).toBe('ltr');
    expect(body?.className).toContain('text-start');
    expect(body?.textContent).toContain('Log files:');
    expect(document.documentElement.dir).toBe('rtl');
    const shell = host.querySelector('[data-testid="dialog-content"]');
    expect(shell?.getAttribute('dir')).toBeNull();
  });
});
