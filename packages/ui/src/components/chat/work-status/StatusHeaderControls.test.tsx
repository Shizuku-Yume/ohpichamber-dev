import { expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

const DOM_GLOBAL_NAMES = [
  'window',
  'document',
  'navigator',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLButtonElement',
  'Event',
  'CustomEvent',
  'PointerEvent',
  'MouseEvent',
  'localStorage',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'ResizeObserver',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

type DomHarness = { container: HTMLElement; restore: () => void };

const installDom = (): DomHarness => {
  const win = new Window({ url: 'http://status.test' });
  const previous = DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const values = {
    window: win,
    document: win.document,
    navigator: win.navigator,
    Node: win.Node,
    Element: win.Element,
    HTMLElement: win.HTMLElement,
    HTMLButtonElement: win.HTMLButtonElement,
    Event: win.Event,
    CustomEvent: win.CustomEvent,
    PointerEvent: win.PointerEvent,
    MouseEvent: win.MouseEvent,
    localStorage: win.localStorage,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    ResizeObserver: win.ResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const name of DOM_GLOBAL_NAMES) {
    Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  return {
    container,
    restore: () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
      void win.happyDOM.close();
    },
  };
};

test('renders independent controls with full accessible labels and refuses disabled activation', async () => {
  const dom = installDom();
  const root = createRoot(dom.container);
  const events: Array<{ id: string; value?: string }> = [];

  try {
    const { StatusHeaderControls } = await import('./StatusHeaderControls.tsx');

    await act(async () => {
      root.render(
        <StatusHeaderControls
          layout="below"
          controls={[
            { kind: 'button', id: 'refresh', label: 'Refresh all remote branches' },
            { kind: 'button', id: 'disabled', label: 'Disabled action', disabled: true },
            {
              kind: 'select',
              id: 'scope',
              label: 'Repository scope',
              value: 'current',
              options: [
                { value: 'current', label: 'Current repository' },
                { value: 'all', label: 'All repositories' },
              ],
            },
            {
              kind: 'select',
              id: 'disabled-scope',
              label: 'Disabled repository scope',
              value: 'current',
              disabled: true,
              options: [{ value: 'current', label: 'Current repository' }],
            },
          ]}
          onActivate={(id, value) => events.push(value === undefined ? { id } : { id, value })}
        />,
      );
    });

    const controls = dom.container.querySelector<HTMLElement>('[data-work-status-controls]');
    expect(controls).not.toBeNull();
    expect(controls?.className).toContain('grid-cols-2');

    const refreshBtn = dom.container.querySelector<HTMLButtonElement>('[data-work-status-control="refresh"] button');
    const disabledBtn = dom.container.querySelector<HTMLButtonElement>('[data-work-status-control="disabled"] button');
    const scopeBtn = dom.container.querySelector<HTMLButtonElement>('[data-work-status-control="scope"] button');
    const disabledScopeBtn = dom.container.querySelector<HTMLButtonElement>('[data-work-status-control="disabled-scope"] button');

    expect(refreshBtn).not.toBeNull();
    expect(disabledBtn).not.toBeNull();
    expect(scopeBtn).not.toBeNull();
    expect(disabledScopeBtn).not.toBeNull();

    expect(refreshBtn?.getAttribute('aria-label')).toBe('Refresh all remote branches');
    expect(disabledBtn?.disabled).toBe(true);
    expect(scopeBtn?.getAttribute('aria-label')).toBe('Repository scope: Current repository');
    expect(disabledScopeBtn?.disabled).toBe(true);

    if (!refreshBtn || !disabledBtn) throw new Error('Status controls did not render');
    await act(async () => {
      refreshBtn.click();
    });
    await act(async () => {
      disabledBtn.click();
    });
    expect(events).toEqual([{ id: 'refresh' }]);
  } finally {
    await act(async () => {
      root.unmount();
    });
    dom.restore();
  }
});
