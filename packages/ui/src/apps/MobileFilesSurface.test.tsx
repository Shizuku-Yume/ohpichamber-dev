import React, { act } from 'react';
import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';
import type { FilesAPI, FileSearchResult } from '@/lib/api/types';

const dom = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  localStorage: dom.localStorage,
  location: dom.location,
  HTMLElement: dom.HTMLElement,
  HTMLInputElement: dom.HTMLInputElement,
  Element: dom.Element,
  Node: dom.Node,
  Event: dom.Event,
  requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
  cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const originalFetch = globalThis.fetch;
globalThis.fetch = Object.assign(async (input: RequestInfo | URL) => {
  const url = new URL(input instanceof Request ? input.url : String(input), dom.location.href);
  if (url.pathname === '/api/fs/home' || url.pathname === '/api/session-folders') {
    return new Promise<Response>(() => { });
  }
  throw new Error(`Unexpected request ${url.pathname}`);
}, originalFetch);
afterAll(() => { globalThis.fetch = originalFetch; });

const search = mock<FilesAPI['search']>();
const listDirectory = mock<FilesAPI['listDirectory']>();
const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { RuntimeAPIContext } = await import('@/contexts/runtimeAPIContext');
const { getRuntimeKey } = await import('@/lib/runtime-switch');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { ChildStoreManager } = await import('@/sync/child-store');
const { SyncRuntimeContext } = await import('@/sync/sync-context');
const { SessionMessageLoader } = await import('@/sync/session-message-loader');
const { deferred, nativeClient } = await import('@/sync/session-message-loader-test-fixtures');
const { createWebAPIs } = await import('../../../web/src/api/index');
const { MobileFilesSurface } = await import('./MobileFilesSurface');
const webAPIs = createWebAPIs();
const apis = { ...webAPIs, files: { ...webAPIs.files, search, listDirectory } };
let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  search.mockReset();
  listDirectory.mockReset();
  listDirectory.mockResolvedValue({ directory: '/workspace', entries: [] });
  useDirectoryStore.setState({ currentDirectory: '/workspace' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const childStores = new ChildStoreManager();
  const client = nativeClient();
  const runtimeKey = getRuntimeKey();
  const sync = {
    childStores, client, runtimeKey,
    messageLoader: new SessionMessageLoader(childStores, { client, runtimeKey }),
    currentDirectory: { get: () => '/workspace', subscribe: () => () => {} },
  };
  await act(async () => root.render(
    <I18nProvider>
      <SyncRuntimeContext.Provider value={sync}>
        <RuntimeAPIContext.Provider value={apis}><MobileFilesSurface /></RuntimeAPIContext.Provider>
      </SyncRuntimeContext.Provider>
    </I18nProvider>,
  ));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const input = () => container.querySelector<HTMLInputElement>('input[placeholder]')!;
const enterQuery = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const waitForSearch = async (count: number) => {
  for (let attempt = 0; attempt < 50 && search.mock.calls.length < count; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  }
  expect(search.mock.calls).toHaveLength(count);
};
const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent?.trim() === label);

test('keeps a failed name query, retries it without reloading the folder, and distinguishes empty results', async () => {
  listDirectory.mockRejectedValueOnce(new Error('Folder not reachable'));
  const refresh = container.querySelector<HTMLButtonElement>('button[aria-label]')!;
  await act(async () => refresh.click());
  expect(container.textContent).toContain('Folder not reachable');

  search.mockRejectedValueOnce(new Error('Offline'));
  search.mockResolvedValueOnce([{ path: '/workspace/README.md' }]);
  search.mockResolvedValueOnce([]);
  await enterQuery('README');
  await waitForSearch(1);
  expect(container.textContent).toContain("Couldn't search files.");
  expect(container.textContent).not.toContain('No files found.');
  expect(input().value).toBe('README');

  await act(async () => button('Retry')!.click());
  await waitForSearch(2);
  expect(search.mock.calls[1]).toEqual(search.mock.calls[0]);
  expect(listDirectory).toHaveBeenCalledTimes(2);
  expect(container.textContent).toContain('README.md');

  await enterQuery('nonexistent');
  await waitForSearch(3);
  expect(container.textContent).toContain('No files found.');
  expect(button('Retry')).toBeUndefined();
});

test('ignores a failure from a superseded search', async () => {
  const oldSearch = deferred<FileSearchResult[]>();
  search.mockReturnValueOnce(oldSearch.promise);
  search.mockResolvedValueOnce([{ path: '/workspace/README.md' }]);
  await enterQuery('old');
  await waitForSearch(1);
  await enterQuery('README');
  await waitForSearch(2);
  await act(async () => oldSearch.reject(new Error('Offline')));
  expect(container.textContent).toContain('README.md');
  expect(button('Retry')).toBeUndefined();
});
