import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { Window } from 'happy-dom';
import type { FileContents } from '@pierre/diffs';
import { getDefaultTheme } from '@/lib/theme/themes';
import { getThemeRenderName } from '@/lib/shiki/appThemeRegistry';

const browser = new Window();
const descriptors = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
  descriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { value, configurable: true });
}
const files: FileContents[] = [];
mock.module('@pierre/diffs/react', () => ({
  File: ({ file }: { file: FileContents }) => {
    files.push(file);
    return <pre>{file.contents}</pre>;
  },
}));
const { createRoot } = await import('react-dom/client');
const { FileCodePreview, getFilePreviewTheme } = await import('./FileCodePreview');
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const render = (file: FileContents) => act(async () => root.render(<FileCodePreview file={file} />));

afterEach(async () => {
  await act(async () => root.render(null));
  files.length = 0;
});

afterAll(async () => {
  await act(async () => root.unmount());
  mock.restore();
  await browser.happyDOM.close();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test('large preview keeps the same file identity across parent rerenders', async () => {
  const file = { name: 'large.txt', contents: 'visible text\n'.repeat(750_000), cacheKey: 'large:1' };
  await render({ ...file });
  await render({ ...file });
  expect(files).toHaveLength(2);
  expect(files[1]).toBe(files[0]);
  expect(host.textContent).toBe(file.contents);
});

test('empty and small previews preserve their contents and stable identity', async () => {
  for (const contents of ['', 'small preview\n']) {
    await render({ name: 'small.txt', contents });
    const previous = files.at(-1);
    await render({ name: 'small.txt', contents });
    expect(files.at(-1)).toBe(previous);
    expect(host.textContent).toBe(contents);
  }
});

test('content, file and highlighting changes invalidate the preview descriptor', async () => {
  let file: FileContents = { name: 'one.ts', contents: 'let a = 1;', lang: 'typescript', header: 'first', cacheKey: 'one:1' };
  await render(file);
  for (const change of [{ contents: 'let b = 1;' }, { name: 'two.ts' }, { lang: 'javascript' as const }, { header: 'second' }, { cacheKey: 'two:2' }]) {
    const previous = files.at(-1);
    file = { ...file, ...change };
    await render(file);
    expect(files.at(-1)).not.toBe(previous);
    expect(files.at(-1)).toEqual(file);
  }
});

test('preview requests the registered theme names, including edits under the same theme ID', () => {
  const light = getDefaultTheme(false);
  const dark = getDefaultTheme(true);
  const theme = getFilePreviewTheme(light, dark);
  expect(theme).toEqual({ light: getThemeRenderName(light), dark: getThemeRenderName(dark) });
  expect(theme.light).not.toBe(light.metadata.id);
  expect(theme.dark).not.toBe(dark.metadata.id);
  const edited = { ...light, colors: { ...light.colors, syntax: { ...light.colors.syntax, base: { ...light.colors.syntax.base, background: '#123456' } } } };
  expect(getFilePreviewTheme(edited, dark)).toEqual({ light: getThemeRenderName(edited), dark: theme.dark });
  expect(getFilePreviewTheme(edited, dark).light).not.toBe(theme.light);
});
