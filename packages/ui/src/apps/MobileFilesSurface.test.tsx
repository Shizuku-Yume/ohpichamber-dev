import React, { act } from 'react';
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Root } from 'react-dom/client';
import type { FileSearchQuery, FileSearchResult } from '@/lib/api/types';

const dom = new Window({ url: 'http://localhost' });
Object.assign(globalThis, {
  window: dom,
  document: dom.document,
  navigator: dom.navigator,
  HTMLElement: dom.HTMLElement,
  Element: dom.Element,
  Event: dom.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});

const search = mock<(query: FileSearchQuery) => Promise<FileSearchResult[]>>();
const listDirectory = mock<() => Promise<{ entries: [] }>>();
const files = { search, listDirectory };
mock.module('@/hooks/useRuntimeAPIs', () => ({ useRuntimeAPIs: () => ({ files }) }));
mock.module('@/hooks/useEffectiveDirectory', () => ({
  useEffectiveDirectory: () => '/workspace',
  resolveEffectiveDirectory: () => '/workspace',
}));
mock.module('@/components/views/files/useFileTreeChanges', () => ({
  AUTO_RELIST_MAX_ENTRIES: 1000,
  useFileTreeChanges: () => undefined,
}));
mock.module('@/components/views/files/useFileTreeUpload', () => ({
  useFileTreeUpload: () => ({ canUpload: false, uploadingDirectory: null }),
}));
mock.module('@/components/ui/ScrollShadow', () => ({
  ScrollShadow: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const { createRoot } = await import('react-dom/client');
const { I18nProvider } = await import('@/lib/i18n');
const { MobileFilesSurface } = await import('./MobileFilesSurface');
let container: HTMLElement;
let root: Root;

beforeEach(async () => {
  search.mockReset();
  listDirectory.mockReset();
  listDirectory.mockResolvedValue({ entries: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MobileFilesSurface /></I18nProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const input = () => container.querySelector<HTMLInputElement>('input')!;
const enterQuery = async (value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, 'value')!.set!.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const waitForSearch = async (count: number) => {
  for (let attempt = 0; attempt < 50 && search.mock.calls.length < count; attempt++) {
    await act(async () => { await Bun.sleep(20); });
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
  let rejectOldSearch!: (error: Error) => void;
  search.mockReturnValueOnce(new Promise<FileSearchResult[]>((_resolve, reject) => {
    rejectOldSearch = reject;
  }));
  search.mockResolvedValueOnce([{ path: '/workspace/README.md' }]);
  await enterQuery('old');
  await waitForSearch(1);
  await enterQuery('README');
  await waitForSearch(2);
  await act(async () => rejectOldSearch(new Error('Offline')));
  expect(container.textContent).toContain('README.md');
  expect(button('Retry')).toBeUndefined();
});
