import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';

if (!globalThis.window) {
  const dom = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement,
    HTMLButtonElement: dom.HTMLButtonElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent,
    MouseEvent: dom.MouseEvent,
    MutationObserver: dom.MutationObserver,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

let lastTabClosedHandler: (() => void) | undefined;
let terminalViewMounted = false;
let filesSurfaceProps: {
  visible?: boolean;
  registerBackHandler?: (handler: (() => boolean) | null) => void;
} | undefined;

mock.module('@/components/views/TerminalView', () => ({
  TerminalView: ({ onLastTabClosed, visible }: { onLastTabClosed?: () => void; visible?: boolean }) => {
    lastTabClosedHandler = onLastTabClosed;
    React.useEffect(() => {
      terminalViewMounted = true;
      return () => {
        terminalViewMounted = false;
      };
    }, []);
    return <div data-testid="terminal-view" data-visible={visible}>Terminal</div>;
  },
}));

mock.module('@/hooks/useEdgeSwipe', () => ({
  useEdgeSwipe: () => undefined,
}));

mock.module('@/components/ui/sortable-tabs-strip', () => ({
  SortableTabsStrip: () => <div data-testid="tabs-strip" />,
}));

mock.module('@/components/sections/status/MobileStatusPane', () => ({
  MobileStatusPane: () => <div />,
}));

mock.module('./MobileFilesSurface', () => ({
  MobileFilesSurface: (props: NonNullable<typeof filesSurfaceProps>) => {
    filesSurfaceProps = props;
    return <div />;
  },
}));

mock.module('@/components/context/ProjectContextPanel', () => ({
  ProjectContextPanel: () => <div />,
}));

import { MobileWorkspaceDrawer } from './MobileWorkspaceDrawer';

describe('MobileWorkspaceDrawer terminal lifecycle', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    lastTabClosedHandler = undefined;
    terminalViewMounted = false;
    filesSurfaceProps = undefined;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container as unknown as Element);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test.each([
    { name: 'short Android terminal with keyboard', height: 122, android: true, keyboard: true, tab: 'terminal', compact: true },
    { name: 'short Android terminal without keyboard', height: 122, android: true, keyboard: false, tab: 'terminal', compact: false },
    { name: 'tall Android terminal with keyboard', height: 360, android: true, keyboard: true, tab: 'terminal', compact: false },
    { name: 'short iOS terminal with keyboard', height: 122, android: false, keyboard: true, tab: 'terminal', compact: false },
    { name: 'short Android Files surface with keyboard', height: 122, android: true, keyboard: true, tab: 'files', compact: false },
  ] as const)('only collapses terminal chrome when space is tight: $name', async ({ height, android, keyboard, tab, compact }) => {
    const testWindow = window as unknown as Window;
    const html = document.documentElement;
    const style = document.createElement('style');
    style.textContent = readFileSync(new URL('../styles/mobile.css', import.meta.url), 'utf8');
    document.head.append(style);
    const platformClass = android ? 'oc-platform-android' : 'oc-platform-ios';
    html.classList.add('oc-capacitor-app', platformClass);
    html.classList.toggle('oc-keyboard-open', keyboard);
    const previousHeight = testWindow.innerHeight;
    testWindow.happyDOM.setViewport({ height });

    try {
      await act(async () => root.render(
        <I18nProvider>
          <MobileWorkspaceDrawer
            open
            tab={tab}
            onClose={() => undefined}
            onTabChange={() => undefined}
            pendingChangesDiff={null}
            onOpenPlan={() => undefined}
          />
        </I18nProvider>,
      ));
      const header = document.querySelector('[role="dialog"] [data-testid="tabs-strip"]')!.parentElement!.parentElement!;
      expect(getComputedStyle(header).display === 'none').toBe(compact);
      if (tab === 'terminal') {
        expect(document.querySelector('[data-testid="terminal-view"]')?.getAttribute('data-visible')).toBe('true');
      }
    } finally {
      html.classList.remove('oc-capacitor-app', platformClass, 'oc-keyboard-open');
      testWindow.happyDOM.setViewport({ height: previousHeight });
      style.remove();
    }
  });

  test('forwards viewer Back registration only with the Files visibility state', async () => {
    const registerBackHandler = () => undefined;
    const renderDrawer = async (open: boolean) => act(async () => root.render(
      <I18nProvider>
        <MobileWorkspaceDrawer
          open={open}
          tab="files"
          onClose={() => undefined}
          onTabChange={() => undefined}
          pendingChangesDiff={null}
          onOpenPlan={() => undefined}
          registerBackHandler={registerBackHandler}
          variant="panel"
        />
      </I18nProvider>,
    ));
    await renderDrawer(true);
    expect(filesSurfaceProps?.registerBackHandler).toBe(registerBackHandler);
    expect(filesSurfaceProps?.visible).toBe(true);
    await renderDrawer(false);
    expect(filesSurfaceProps?.visible).toBe(false);
  });

  test('closing the last terminal tab unmounts the terminal pane and calls onClose', async () => {
    let closed = false;
    const onClose = () => { closed = true; };

    await act(async () => {
      root.render(
        <I18nProvider>
          <MobileWorkspaceDrawer
            open={true}
            tab="terminal"
            onClose={onClose}
            onTabChange={() => undefined}
            pendingChangesDiff={null}
            onOpenPlan={() => undefined}
            variant="panel"
          />
        </I18nProvider>,
      );
    });

    expect(terminalViewMounted).toBe(true);
    expect(lastTabClosedHandler).toBeDefined();

    // Trigger onLastTabClosed
    await act(async () => {
      lastTabClosedHandler?.();
    });

    // onClose must be called
    expect(closed).toBe(true);
    // TerminalView pane must be unmounted via stopVisitingTab('terminal')
    expect(terminalViewMounted).toBe(false);
  });
});
