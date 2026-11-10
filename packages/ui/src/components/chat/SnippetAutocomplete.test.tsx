import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { Window } from 'happy-dom';

import type { Snippet } from '@/types/snippet';
import { SyncProvider } from '@/sync/sync-context';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import type { SnippetAutocompleteHandle } from './SnippetAutocomplete';

let SnippetAutocomplete: typeof import('./SnippetAutocomplete')['SnippetAutocomplete'];
let I18nProvider: typeof import('@/lib/i18n')['I18nProvider'];
let useSnippetsStore: typeof import('@/stores/useSnippetsStore')['useSnippetsStore'];
let dom: Window;
let root: Root;
let host: HTMLDivElement;
let restore: Array<() => void>;
const globals = new Map<string, PropertyDescriptor | undefined>();

const snippet = (name: string): Snippet => ({
  templateId: `tpl-${name}`,
  name,
  description: `${name} desc`,
  content: `${name} body`,
  scope: 'workspace',
  source: 'workspace',
  editable: true,
});

beforeEach(async () => {
  dom = new Window({ url: 'http://localhost' });
  const values = {
    window: dom, document: dom.document, navigator: dom.navigator,
    localStorage: dom.localStorage, sessionStorage: dom.sessionStorage,
    Node: dom.Node, Element: dom.Element, HTMLElement: dom.HTMLElement,
    HTMLInputElement: dom.HTMLInputElement, HTMLButtonElement: dom.HTMLButtonElement,
    SVGElement: dom.SVGElement, Document: dom.Document, ShadowRoot: dom.ShadowRoot,
    Event: dom.Event, MouseEvent: dom.MouseEvent, PointerEvent: dom.PointerEvent,
    KeyboardEvent: dom.KeyboardEvent, CustomEvent: dom.CustomEvent,
    MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver,
    getComputedStyle: dom.getComputedStyle.bind(dom),
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
  };
  for (const [name, value] of Object.entries(values)) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const fetch = spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => undefined));
  ({ I18nProvider } = await import('@/lib/i18n'));
  ({ SnippetAutocomplete } = await import('./SnippetAutocomplete'));
  ({ useSnippetsStore } = await import('@/stores/useSnippetsStore'));
  const { useUIStore } = await import('@/stores/useUIStore');
  const priorSnippets = useSnippetsStore.getState();
  const priorUI = useUIStore.getState();
  restore = [
    () => fetch.mockRestore(),
    () => useSnippetsStore.setState(priorSnippets),
    () => useUIStore.setState(priorUI),
  ];
  useUIStore.setState({ isMobile: false });
  useDirectoryStore.setState({ currentDirectory: '/test' });
  useSnippetsStore.setState({
    catalogsByDirectory: new Map([['/test', { workspaceId: 'ws-test', templates: [snippet('deploy'), snippet('fix-pr')], revision: '1' }]]),
    loadSnippets: async () => true,
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  const { createRoot } = await import('react-dom/client');
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  restore.forEach((undo) => undo());
  host.remove();
  await dom.happyDOM.close();
  for (const [name, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  globals.clear();
});

const rowLabels = () => Array.from(host.querySelectorAll<HTMLElement>('.cursor-pointer')).map((row) => row.textContent?.trim());

async function mountPicker(searchQuery: string) {
  const handle = React.createRef<SnippetAutocompleteHandle>();
  const selected: string[] = [];
  await act(async () => root.render(
    <SyncProvider directory="/test">
      <I18nProvider>
        <SnippetAutocomplete
          ref={handle}
          searchQuery={searchQuery}
          onClose={() => undefined}
          onSnippetSelect={(_snippet, trigger) => { selected.push(trigger); }}
        />
      </I18nProvider>
    </SyncProvider>,
  ));
  const press = (key: string) => act(async () => handle.current?.handleKeyDown(key));
  return { press, selected };
}

test('pressing Enter on the add row opens snippet settings', async () => {
  const { press } = await mountPicker('ship-it');
  expect(rowLabels()[0]).toBe('Add new snippet');

  await press('Enter'); // selectedIndex is 0 when no matches
  const { useUIStore } = await import('@/stores/useUIStore');
  expect(useUIStore.getState().settingsPage).toBe('snippets');
  expect(useUIStore.getState().isSettingsDialogOpen).toBe(true);
});

test('a name a snippet answers to selects the match on Enter', async () => {
  const { press, selected } = await mountPicker('fix');
  expect(rowLabels().some((label) => label?.includes('fix-pr'))).toBe(true);

  await press('Enter');
  expect(selected).toEqual(['fix-pr']);
});

test('ArrowDown navigates to the next snippet', async () => {
  const { press, selected } = await mountPicker('');
  await press('ArrowDown');
  await press('Enter');
  expect(selected).toEqual(['fix-pr']);
});
