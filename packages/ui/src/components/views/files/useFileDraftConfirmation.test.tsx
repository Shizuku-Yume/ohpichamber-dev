import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';

import { useFileDraftConfirmation } from './useFileDraftConfirmation';

type Props = Parameters<typeof useFileDraftConfirmation>[0];

let root: Root;
let browser: Window;
let confirmation: ReturnType<typeof useFileDraftConfirmation>;
let restoreGlobals: () => void;

function Probe(props: Props) {
  confirmation = useFileDraftConfirmation(props);
  return null;
}

beforeEach(() => {
  browser = new Window();
  const globals = { window: browser, document: browser.document, IS_REACT_ACT_ENVIRONMENT: true };
  const previous = Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  restoreGlobals = () => {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  Object.assign(globalThis, globals);
  root = createRoot(document.createElement('div'));
});

afterEach(async () => {
  await act(async () => root.unmount());
  await browser.happyDOM.close();
  restoreGlobals();
});

const render = (props: Partial<Props> = {}) => act(async () => {
  root.render(<Probe scope="host" path="/repo/a.txt" isDirty isSaving={false}
    saveDraft={async () => false} discardDraft={() => {}} {...props} />);
});

test('Cancel drops a bulk close and releases the autosave pause without touching the draft', async () => {
  const closeTabs = mock(() => {});
  const discardDraft = mock(() => {});
  await render({ discardDraft });
  await act(async () => {
    confirmation.confirm(closeTabs);
    expect(confirmation.isPending()).toBe(true);
  });
  expect(confirmation.open).toBe(true);
  await act(async () => { confirmation.cancel(); });
  expect(confirmation.isPending()).toBe(false);
  expect(confirmation.open).toBe(false);
  expect(closeTabs).not.toHaveBeenCalled();
  expect(discardDraft).not.toHaveBeenCalled();
});

test('a failed save keeps a bulk close pending; a successful retry closes only once the draft is clean', async () => {
  const closeTabs = mock(() => {});
  const saveDraft = mock(async () => false);
  await render({ saveDraft });
  await act(async () => confirmation.confirm(closeTabs));
  await act(async () => confirmation.save());
  expect(saveDraft).toHaveBeenCalledTimes(1);
  expect(confirmation.open).toBe(true);
  expect(closeTabs).not.toHaveBeenCalled();

  const retry = mock(async () => true);
  await render({ saveDraft: retry });
  await act(async () => confirmation.save());
  expect(retry).toHaveBeenCalledTimes(1);
  expect(closeTabs).not.toHaveBeenCalled();
  await render({ isDirty: false });
  expect(confirmation.open).toBe(false);
  expect(closeTabs).toHaveBeenCalledTimes(1);
});

test('Discard waits for an in-flight write, then clears the remaining draft before closing', async () => {
  const actions: string[] = [];
  const discardDraft = () => actions.push('discard draft');
  await render({ discardDraft, isSaving: true });
  await act(async () => confirmation.confirm(() => actions.push('close tab')));
  await act(async () => confirmation.discard());
  expect(actions).toEqual([]);
  expect(confirmation.open).toBe(true);
  await render({ discardDraft });
  await act(async () => confirmation.discard());
  expect(actions).toEqual(['discard draft', 'close tab']);
  expect(confirmation.open).toBe(false);
});

test('a file or scope change clears the old close before a clean replacement can complete it', async () => {
  const closeTabs = mock(() => {});
  await render();
  await act(async () => confirmation.confirm(closeTabs));
  await render({ path: '/repo/b.txt', isDirty: false });
  expect(confirmation.open).toBe(false);
  expect(closeTabs).not.toHaveBeenCalled();
});
