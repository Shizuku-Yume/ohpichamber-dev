import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const dom = new Window();
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  MutationObserver: dom.MutationObserver,
  ResizeObserver: dom.ResizeObserver,
  Node: dom.Node,
  HTMLElement: dom.HTMLElement,
  InputEvent: dom.InputEvent,
  CustomEvent: dom.CustomEvent,
  getComputedStyle: dom.getComputedStyle.bind(dom),
  requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { EditorView } = await import('@codemirror/view');
const { CodeMirrorEditor } = await import('./CodeMirrorEditor');
const { ComposerEditorView } = await import('../chat/composer/editor/ComposerEditorView');
const { ComposerEditor } = await import('../chat/composer/editor/ComposerEditor');
const { history, undo } = await import('@codemirror/commands');
const { EditorState, StateEffect } = await import('@codemirror/state');
const { focusedHistory, handleNativeHistoryMenu } = await import('@/lib/codemirror/focusedHistory');

type EditorProps = React.ComponentProps<typeof CodeMirrorEditor>;

let container: HTMLDivElement;
let root: Root;
let view: InstanceType<typeof EditorView> | null;
let reconfigures: number;
// Stable across renders, as a host passes it; it counts reconfigurations.
const extensions = [EditorView.updateListener.of((update) => {
  if (update.transactions.some((transaction) => transaction.reconfigured)) reconfigures += 1;
})];
const lineNumbersConfig = {};

const render = async (props: Partial<EditorProps> = {}) => {
  await act(async () => {
    root.render(
      <CodeMirrorEditor
        value={'one\ntwo\nthree'}
        onChange={() => {}}
        extensions={extensions}
        lineNumbersConfig={lineNumbersConfig}
        onViewReady={(ready) => { view = ready; }}
        {...props}
      />,
    );
  });
};

beforeEach(() => {
  window.addEventListener('openchamber:history-action', handleNativeHistoryMenu);
  view = null;
  reconfigures = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  window.removeEventListener('openchamber:history-action', handleNativeHistoryMenu);
  await act(async () => root.unmount());
  document.body.replaceChildren();
});
afterAll(() => dom.happyDOM.close());

describe('CodeMirrorEditor detached', () => {
  test('mounts out of the document when detached, with its state', async () => {
    await render({ detached: true });
    expect(view).not.toBeNull();
    expect(view?.dom.isConnected).toBe(false);
    expect(view?.state.doc.toString()).toBe('one\ntwo\nthree');
  });

  test('leaves the document and comes back into its host, the same view', async () => {
    await render();
    const mounted = view;
    expect(mounted?.dom.isConnected).toBe(true);
    await render({ detached: true });
    expect(mounted?.dom.isConnected).toBe(false);
    await render({ detached: false });
    expect(view).toBe(mounted);
    expect(mounted?.dom.isConnected).toBe(true);
    expect(container.contains(mounted?.dom ?? null)).toBe(true);
  });

  test('is destroyed cleanly while detached', async () => {
    await render({ detached: true });
    await act(async () => root.unmount());
    root = createRoot(container);
    expect(container.querySelector('.cm-editor')).toBeNull();
  });
});

describe('CodeMirrorEditor reconfiguration', () => {
  test('a re-render with equal inputs reconfigures nothing', async () => {
    await render({ highlightLines: { start: 1, end: 2 } });
    reconfigures = 0;
    await render({ highlightLines: { start: 1, end: 2 } });
    await render({ highlightLines: { start: 1, end: 2 }, detached: true });
    await render({ highlightLines: { start: 1, end: 2 }, detached: false });
    expect(reconfigures).toBe(0);
  });

  test('a changed input reconfigures its compartment', async () => {
    await render({ highlightLines: { start: 1, end: 2 } });
    reconfigures = 0;
    await render({ highlightLines: { start: 2, end: 3 } });
    expect(reconfigures).toBe(1);
    await render({ highlightLines: { start: 2, end: 3 }, readOnly: true });
    expect(reconfigures).toBe(2);
    expect(view?.state.facet(EditorView.editable)).toBe(false);
  });
});

const nativeHistory = async (target: InstanceType<typeof EditorView>, inputType: string) => {
  const event = new InputEvent('beforeinput', { inputType, bubbles: true, cancelable: true });
  await act(async () => { target.contentDOM.dispatchEvent(event); });
  return event;
};

const menuHistory = async (action: unknown) => {
  const event = new CustomEvent('openchamber:history-action', { detail: action, cancelable: true });
  let unhandled = true;
  await act(async () => { unhandled = window.dispatchEvent(event); });
  return !unhandled;
};

test('routes undo and redo to the focused composer without file changes', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  const composerHost = document.createElement('div');
  document.body.append(composerHost);
  const composerRoot = createRoot(composerHost);
  await act(async () => composerRoot.render(<ComposerEditor value="composer" languageContext={{
    inputMode: 'normal', knownAgentNames: new Set(), confirmedMentions: new Set(),
    knownSlashNames: new Set(), knownSnippetTriggers: new Set(), attachmentFilenames: [],
  }} onChange={() => {}} />));
  const other = EditorView.findFromDOM(composerHost.querySelector('.cm-content')!)!;
  try {
    await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
    other.dispatch({ changes: { from: 0, insert: 'pasted ' } });
    changes.length = 0;
    other.focus();
    expect(other.hasFocus).toBe(true);
    expect(file.hasFocus).toBe(false);
    expect((await nativeHistory(file, 'historyUndo')).defaultPrevented).toBe(true);
    expect(other.state.doc.toString()).toBe('composer');
    await nativeHistory(file, 'historyRedo');
    expect(other.state.doc.toString()).toBe('pasted composer');
    expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
    expect(changes).toEqual([]);
    expect(other.hasFocus).toBe(true);
    file.focus();
    await nativeHistory(other, 'historyUndo');
    expect(file.state.doc.toString()).toBe('one\ntwo\nthree');
    expect(other.state.doc.toString()).toBe('pasted composer');
    await nativeHistory(other, 'historyRedo');
    expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
    changes.length = 0;
    other.focus();
    expect(await menuHistory('undo')).toBe(true);
    expect(other.state.doc.toString()).toBe('composer');
    expect(await menuHistory('redo')).toBe(true);
    expect(other.state.doc.toString()).toBe('pasted composer');
    expect(changes).toEqual([]);
    expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
    file.focus();
    expect(await menuHistory('undo')).toBe(true);
    expect(file.state.doc.toString()).toBe('one\ntwo\nthree');
    expect(await menuHistory('redo')).toBe(true);
    expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
    expect(other.state.doc.toString()).toBe('pasted composer');
  } finally {
    await act(async () => composerRoot.unmount());
  }
});

test('inactive document history stays with its active composer', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  const composer = new ComposerEditorView({ doc: 'composer', extensions: [history(), focusedHistory], parent: document.body });
  const hasFocus = document.hasFocus;
  try {
    await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
    composer.dispatch({ changes: { from: 0, insert: 'pasted ' } });
    composer.focus();
    document.hasFocus = () => false;
    expect(document.activeElement).toBe(composer.contentDOM);
    expect(composer.hasFocus).toBe(false);
    changes.length = 0;
    expect(await menuHistory('undo')).toBe(true);
    expect(composer.state.doc.toString()).toBe('composer');
    expect(await menuHistory('redo')).toBe(true);
    expect(composer.state.doc.toString()).toBe('pasted composer');
    expect((await nativeHistory(file, 'historyUndo')).defaultPrevented).toBe(true);
    expect(composer.state.doc.toString()).toBe('composer');
    expect((await nativeHistory(file, 'historyRedo')).defaultPrevented).toBe(true);
    expect(composer.state.doc.toString()).toBe('pasted composer');
    expect(await menuHistory('undo')).toBe(true);
    expect(await menuHistory('undo')).toBe(true);
    expect(composer.state.doc.toString()).toBe('composer');
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    expect(await menuHistory('undo')).toBe(false);
    expect(await menuHistory('redo')).toBe(false);
    expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
    expect(changes).toEqual([]);
  } finally {
    document.hasFocus = hasFocus;
    composer.destroy();
  }
});

test('focused file undo and redo keep working', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
  file.focus();
  changes.length = 0;
  await nativeHistory(file, 'historyUndo');
  await nativeHistory(file, 'historyRedo');
  expect(changes).toEqual(['one\ntwo\nthree', 'saved one\ntwo\nthree']);
});

test('empty focused history never falls back to the file history', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  const other = new ComposerEditorView({ doc: 'composer', extensions: [history(), focusedHistory], parent: document.body });
  try {
    await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
    other.focus();
    changes.length = 0;
    await nativeHistory(file, 'historyUndo');
    expect(await menuHistory('undo')).toBe(true);
    expect(changes).toEqual([]);
    await act(async () => { undo(file); });
    changes.length = 0;
    await nativeHistory(file, 'historyRedo');
    expect(await menuHistory('redo')).toBe(true);
    expect(changes).toEqual([]);
    expect(file.state.doc.toString()).toBe('one\ntwo\nthree');
    expect(other.state.doc.toString()).toBe('composer');
  } finally {
    other.destroy();
  }
});

test('a focused native input or no focused editor makes stale history a no-op', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
  changes.length = 0;
  const input = document.createElement('input');
  document.body.append(input);
  input.focus();
  expect(await menuHistory('undo')).toBe(false);
  expect(await menuHistory('redo')).toBe(false);
  await nativeHistory(file, 'historyUndo');
  input.blur();
  expect(await menuHistory('undo')).toBe(false);
  await nativeHistory(file, 'historyUndo');
  expect(changes).toEqual([]);
  expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
});

test('menu history ignores invalid actions and consumes read-only CodeMirror history', async () => {
  const changes: string[] = [];
  await render({ onChange: (value) => changes.push(value) });
  const file = view!;
  file.focus();
  expect(await menuHistory('copy')).toBe(false);
  expect(await menuHistory(null)).toBe(false);
  await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
  file.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
  changes.length = 0;
  expect(await menuHistory('undo')).toBe(true);
  expect(changes).toEqual([]);
  expect(file.state.doc.toString()).toBe('saved one\ntwo\nthree');
});

test('menu history claims focus ownership before dispatching the edit', async () => {
  await render();
  const file = view!;
  await act(async () => file.dispatch({ changes: { from: 0, insert: 'saved ' } }));
  file.focus();
  const event = new CustomEvent('openchamber:history-action', { detail: 'undo', cancelable: true });
  const dispatch = file.dispatch;
  let claimed = false;
  file.dispatch = () => { claimed = event.defaultPrevented; };
  try {
    window.dispatchEvent(event);
    expect(claimed).toBe(true);
  } finally {
    file.dispatch = dispatch;
  }
});
