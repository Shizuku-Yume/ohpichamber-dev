import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { I18nProvider } from '@/lib/i18n';
import { closeTopmostBackLayer } from '@/lib/mobileBackLayers';

if (!globalThis.window) {
  const dom = new Window({ url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    localStorage: dom.localStorage,
    sessionStorage: dom.sessionStorage,
    HTMLElement: dom.HTMLElement,
    Element: dom.Element,
    Node: dom.Node,
    Event: dom.Event,
    KeyboardEvent: dom.KeyboardEvent,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
  });
}

mock.module('@/components/session/sidebar/shell/useSwitcherItems', () => ({
  useSwitcherItems: () => [],
}));

const { MobileSessionSwitcher } = await import('./MobileSessionSwitcher');

describe('MobileSessionSwitcher', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('closes on the system back gesture while open', () => {
    const anchorRef = { current: null };
    let closed = 0;
    const onClose = () => { closed += 1; };
    const render = (open: boolean) => act(() => root.render(
      <I18nProvider>
        <MobileSessionSwitcher open={open} onClose={onClose} anchorRef={anchorRef} />
      </I18nProvider>,
    ));

    render(true);
    expect(closeTopmostBackLayer()).toBe(true);
    expect(closed).toBe(1);

    render(false);
    expect(closeTopmostBackLayer()).toBe(false);
  });
});
