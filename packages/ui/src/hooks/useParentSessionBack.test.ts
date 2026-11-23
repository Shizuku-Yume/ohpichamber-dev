import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useParentSessionBack } from './useParentSessionBack';

test('parent navigation follows Canonical IDs and paths, registers only visible parents and releases its handler', async () => {
  const dom = new Window();
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.createElement('div'));
  const opened: Array<[string, string | null]> = [];
  const handlers: Array<(() => void) | null> = [];
  let parent: { sessionId: string; displayPath: string } | null = { sessionId: 'parent', displayPath: '/project' };
  let hidden = false;
  let back: () => void = () => {};
  const open = (id: string, directory: string | null) => opened.push([id, directory]);
  const register = (handler: (() => void) | null) => handlers.push(handler);
  function Probe() { back = useParentSessionBack(parent, hidden, open, register); return null; }
  const render = () => act(async () => root.render(React.createElement(Probe)));
  try {
    await render();
    handlers.at(-1)?.();
    expect(opened).toEqual([['parent', '/project']]);
    hidden = true;
    await render();
    expect(handlers.at(-1)).toBeNull();
    parent = null;
    hidden = false;
    await render();
    back();
    expect(opened).toHaveLength(1);
    expect(handlers.at(-1)).toBeNull();
    await act(async () => root.unmount());
    expect(handlers.at(-1)).toBeNull();
  } finally {
    await act(async () => root.unmount());
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
