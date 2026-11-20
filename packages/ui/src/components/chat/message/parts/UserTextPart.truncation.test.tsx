import { act } from 'react';
import { describe, expect, test } from 'bun:test';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';

import { I18nProvider } from '@/lib/i18n';
import { SyncProvider } from '@/sync/sync-context';
import { useUIStore } from '@/stores/useUIStore';

import UserTextPart from './UserTextPart';
import type { Part } from '@openchamber/agent-contract';
// Plain rendering keeps the lazy markdown module (and its shiki worker asset import) out of the test graph; the expand affordance is mode-independent.
useUIStore.setState({ userMessageRenderingMode: 'plain' });


// bun test shares globalThis across a file; install a happy-dom window for the
// client-only measurement effect, mirroring ReasoningPart.test.tsx.
const DOM_GLOBAL_NAMES = [
  'window',
  'document',
  'navigator',
  'customElements',
  'Node',
  'NodeList',
  'Element',
  'HTMLElement',
  'SVGElement',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'ResizeObserver',
  'MutationObserver',
  'MouseEvent',
  'KeyboardEvent',
  'IS_REACT_ACT_ENVIRONMENT',
] as const;

type TextPartFixture = Extract<Part, { type: 'text' }>;

const makeTextPart = (text: string): TextPartFixture => ({
  type: 'text',
  partId: 'prt_truncation_3742',
  content: text,
});


// SAFETY: happy-dom types querySelector results as its own class instances;
// the runtime objects satisfy React's expected HTMLElement shape because the
// stub installed exactly these happy-dom classes as the global DOM types.

const installDomStub = () => {
  const happyWindow = new Window({ url: 'http://localhost' });
  const previous = DOM_GLOBAL_NAMES.map(
    (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const observers: Array<{ notify(): void }> = [];
  class ResizeObserverStub implements ResizeObserver {
    readonly targets = new Set<Element>();

    constructor(private readonly callback: ResizeObserverCallback) {
      observers.push(this);
    }
    observe(target: Element) { this.targets.add(target); }
    unobserve(target: Element) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
    notify() {
      // SAFETY: this stub implements the full ResizeObserver contract, so
      // the callback receives a valid observer argument.
      if (this.targets.size > 0) this.callback([], this as ResizeObserver);
    }
  }
  const values = {
    window: happyWindow,
    document: happyWindow.document,
    navigator: happyWindow.navigator,
    customElements: happyWindow.customElements,
    Node: happyWindow.Node,
    NodeList: happyWindow.NodeList,
    Element: happyWindow.Element,
    HTMLElement: happyWindow.HTMLElement,
    SVGElement: happyWindow.SVGElement,
    requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
    cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
    getComputedStyle: happyWindow.getComputedStyle.bind(happyWindow),
    ResizeObserver: ResizeObserverStub,
    MutationObserver: happyWindow.MutationObserver,
    MouseEvent: happyWindow.MouseEvent,
    KeyboardEvent: happyWindow.KeyboardEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const name of DOM_GLOBAL_NAMES) {
    Object.defineProperty(globalThis, name, { value: values[name], configurable: true, writable: true });
  }

  const container = document.createElement('div');
  document.body.appendChild(container);

  return {
    container,
    observers,
    restore: () => {
      for (const [name, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else Reflect.deleteProperty(globalThis, name);
      }
    },
  };
};

// Drives the geometry the truncation effect reads: `scrollHeight` is the
// natural content height and `clientHeight` the clamped box height.
const setClampedGeometry = (el: HTMLElement, clampedHeight: number, contentHeight: number) => {
  Object.defineProperties(el, {
    clientHeight: { configurable: true, value: clampedHeight },
    scrollHeight: { configurable: true, value: contentHeight },
  });
};

describe('UserTextPart expand affordance (issue #3742)', () => {
  test('collapsed truncated message reports truncation and a click on the text expands the message', async () => {
    const dom = installDomStub();
    let expandCalls = 0;
    const onExpandMessage = () => { expandCalls += 1; };
    const truncation: boolean[] = [];
    const part = makeTextPart(`${'Long user report. '.repeat(40)}`);
    const root = createRoot(dom.container);

    try {
      await act(async () => {
        root.render(
          <SyncProvider directory="">
            <I18nProvider>
              <UserTextPart
                part={part}
                isMobile={false}
                messageExpanded={false}
                onExpandMessage={onExpandMessage}
                partIndex={0}
                attachmentFilenames={[]}
                onTruncationChange={(_index, truncated) => { truncation.push(truncated); }}
              />
            </I18nProvider>
          </SyncProvider>,
        );
      });

      // SAFETY: the container is a happy-dom HTMLElement the stub
      // installed as the global DOM class; the selector is this
      // component's clamped text div.
      const textDiv = dom.container.querySelector('div.relative > div') as HTMLElement;
      if (!textDiv) throw new Error('Expected the clamped user text div');
      setClampedGeometry(textDiv, 40, 200);
      await act(async () => {
        dom.observers.forEach((observer) => observer.notify());
      });

      expect(truncation.at(-1)).toBe(true);

      await act(async () => {
        textDiv.click();
      });
      expect(expandCalls).toBe(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    }
  });

  test('short non-truncated collapsed message reports no truncation', async () => {
    const dom = installDomStub();
    const part = makeTextPart('Short message.');
    const truncation: boolean[] = [];
    const root = createRoot(dom.container);

    try {
      await act(async () => {
        root.render(
          <SyncProvider directory="">
            <I18nProvider>
              <UserTextPart
                part={part}
                isMobile={false}
                messageExpanded={false}
                onExpandMessage={() => undefined}
                partIndex={0}
                attachmentFilenames={[]}
                onTruncationChange={(_index, truncated) => { truncation.push(truncated); }}
              />
            </I18nProvider>
          </SyncProvider>,
        );
      });

      // SAFETY: same happy-dom container and selector as the truncated
      // case above; the runtime class satisfies HTMLElement.
      const textDiv = dom.container.querySelector('div.relative > div') as HTMLElement;
      if (!textDiv) throw new Error('Expected the clamped user text div');
      setClampedGeometry(textDiv, 40, 40);
      await act(async () => {
        dom.observers.forEach((observer) => observer.notify());
      });

      expect(truncation.length).toBeGreaterThan(0);
      expect(truncation.every((value) => value === false)).toBe(true);
    } finally {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    }
  });

});
