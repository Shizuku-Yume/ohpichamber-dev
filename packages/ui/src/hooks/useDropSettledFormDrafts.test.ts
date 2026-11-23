import { expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import { useDropSettledFormDrafts } from './useDropSettledFormDrafts';
import { loadFormDraft, resetFormDrafts, saveFormDraft } from '@/components/chat/formDrafts';

test('settled Canonical questions clear only their session and runtime, while retained pending state preserves drafts', async () => {
  const dom = new Window();
  const saved = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const root = createRoot(document.createElement('div'));
  const scope = { runtimeKey: 'runtime', directory: '/project', sessionID: 'first', formID: 'same-id' };
  const sibling = { ...scope, sessionID: 'second' };
  const remote = { ...scope, runtimeKey: 'remote' };
  const draft = { kind: 'question' as const, fieldsSignature: 'fields', answers: [{ selected: [], custom: true, text: 'text' }], step: 0 };
  saveFormDraft(scope, draft);
  saveFormDraft(sibling, draft);
  saveFormDraft(remote, draft);
  let runtimeKey = 'runtime';
  let forms: Array<{ sessionId: string; questionId: string }> = [{ sessionId: 'first', questionId: 'same-id' }];
  function Probe() {
    useDropSettledFormDrafts({ sessionId: 'first', directory: '/project' }, forms, runtimeKey);
    return null;
  }
  const render = () => act(async () => root.render(React.createElement(Probe)));
  try {
    await render();
    await render();
    expect(loadFormDraft(scope)).toEqual(draft);
    runtimeKey = 'remote';
    forms = [];
    await render();
    expect(loadFormDraft(scope)).toEqual(draft);
    expect(loadFormDraft(remote)).toEqual(draft);
    runtimeKey = 'runtime';
    forms = [{ sessionId: 'first', questionId: 'same-id' }];
    await render();
    forms = [];
    await render();
    expect(loadFormDraft(scope)).toBeNull();
    expect(loadFormDraft(sibling)).toEqual(draft);
    expect(loadFormDraft(remote)).toEqual(draft);
  } finally {
    await act(async () => root.unmount());
    resetFormDrafts();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
