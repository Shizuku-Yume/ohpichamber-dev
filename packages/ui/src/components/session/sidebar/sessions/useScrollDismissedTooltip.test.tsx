import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useScrollDismissedTooltip } from './useScrollDismissedTooltip';

const DOM_GLOBAL_NAMES = ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'getComputedStyle', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
const installDom = () => {
  const win = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  const values = { window: win, document: win.document, navigator: win.navigator, Node: win.Node, Element: win.Element,
    HTMLElement: win.HTMLElement, getComputedStyle: win.getComputedStyle.bind(win), ResizeObserver: win.ResizeObserver,
    requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), IS_REACT_ACT_ENVIRONMENT: true };
  for (const name of DOM_GLOBAL_NAMES) Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, restore: () => {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    void win.happyDOM.close();
  } };
};

/**
 * Whether this row's tooltip is open, by the same controlled state the row
 * hands its `Tooltip`. The popup's data attribute is base-ui's business; what
 * this hook promises is that the open state it is given matches the scroll.
 */
const Row = ({ label, onOpen }: { label: string; onOpen: (open: boolean) => void }) => {
  const tooltip = useScrollDismissedTooltip();
  const [open, setOpen] = React.useState(false);
  return (
    <Tooltip
      actionsRef={tooltip.actionsRef}
      open={open}
      onOpenChange={(next, details) => {
        tooltip.onOpenChange(next, details);
        if (details.isCanceled) return;
        setOpen(next);
        onOpen(next);
      }}
    >
      <TooltipTrigger asChild><button type="button" data-row={label}>{label}</button></TooltipTrigger>
      <TooltipContent>{`${label} details`}</TooltipContent>
    </Tooltip>
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('session row tooltips while the list scrolls', () => {
  let root: Root;
  let dom: ReturnType<typeof installDom>;

  const openByRow = new Map<string, boolean>();
  const rowIsOpen = (label: string): boolean => openByRow.get(label) ?? false;

  beforeEach(async () => {
    dom = installDom();
    root = createRoot(dom.container);
    openByRow.clear();
    await act(async () => root.render(
      <TooltipProvider delay={0} closeDelay={0}>
        <div data-list="">
          <Row label="first" onOpen={(open) => openByRow.set('first', open)} />
          <Row label="second" onOpen={(open) => openByRow.set('second', open)} />
        </div>
        <div data-elsewhere="" />
      </TooltipProvider>,
    ));
    // The scroll tracker is shared by every test; let earlier scrolls settle.
    await act(async () => { await wait(200); });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.restore();
  });

  const row = (label: string) => dom.container.querySelector<HTMLElement>(`[data-row="${label}"]`)!;
  const hover = async (element: HTMLElement) => {
    await act(async () => {
      element.dispatchEvent(new window.PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
      element.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
      element.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: true }));
      element.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true }));
      await wait(20);
    });
  };
  const scroll = async (selector: string) => {
    await act(async () => {
      dom.container.querySelector(selector)!.dispatchEvent(new window.Event('scroll'));
      await wait(20);
    });
  };

  test('scrolling the list closes the open row tooltip', async () => {
    await hover(row('first'));
    expect(rowIsOpen('first')).toBe(true);

    await scroll('[data-list]');
    expect(rowIsOpen('first')).toBe(false);
  });

  test('a row that arrives under the pointer mid-scroll stays closed until the scroll settles', async () => {
    await scroll('[data-list]');
    await hover(row('second'));
    expect(rowIsOpen('second')).toBe(false);

    await act(async () => { await wait(200); });
    await hover(row('first'));
    expect(rowIsOpen('first')).toBe(true);
  });

  test('scrolling something outside the list leaves the tooltip open', async () => {
    await hover(row('first'));
    await scroll('[data-elsewhere]');
    expect(rowIsOpen('first')).toBe(true);
  });
});
