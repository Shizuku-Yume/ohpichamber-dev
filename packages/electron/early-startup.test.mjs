import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./early-startup.mjs', import.meta.url), 'utf8');
const start = source.indexOf('export const resolveBrowserPanelPreloadPath =');
const resolver = source.slice(start, source.indexOf('\n);', start) + 3)
  .replace('export ', '');

for (const [platform, moduleUrl, expected] of [
  ['posix', 'file:///app%20dir/%E9%9B%AA%23/early-startup.mjs', '/app dir/雪#/browser-panel-preload.cjs'],
  ['win32', 'file:///C:/app%20dir/%E9%9B%AA%23/early-startup.mjs', 'C:\\app dir\\雪#\\browser-panel-preload.cjs'],
]) {
  test(`development resolves the preload from the module URL (${platform})`, () => {
    const resolve = runInNewContext(
      `${resolver.replaceAll('import.meta.url', JSON.stringify(moduleUrl))}; resolveBrowserPanelPreloadPath`,
      {
        isDev: true,
        URL,
        fileURLToPath: (url) => fileURLToPath(url, { windows: platform === 'win32' }),
        path: path[platform],
        app: { getAppPath: () => { throw new Error('development must use the module location'); } },
      },
    );
    assert.equal(resolve(), expected);
  });

  test(`packaged preload stays relative to the app (${platform})`, () => {
    const appPath = platform === 'win32' ? 'C:\\installed app\\app.asar' : '/installed app/app.asar';
    const resolve = runInNewContext(
      `${resolver.replaceAll('import.meta.url', JSON.stringify(moduleUrl))}; resolveBrowserPanelPreloadPath`,
      {
        isDev: false,
        path: path[platform],
        app: { getAppPath: () => appPath },
      },
    );
    assert.equal(resolve(), path[platform].join(appPath, 'browser-panel-preload.cjs'));
  });
}
