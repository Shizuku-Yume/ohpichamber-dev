<<<<<<< HEAD
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
||||||| bc50ba56aa
=======
import { afterAll, afterEach, beforeAll, expect, mock, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

mock.module('electron', () => ({
  app: { isPackaged: false, getAppPath: () => '' },
  BrowserWindow: class {},
  nativeTheme: {},
  protocol: {},
  screen: {},
}));
const { buildMainWindowOptions } = await import('./early-startup.mjs');

const originalPlatform = process.platform;
const originalDataDir = process.env.OPENCHAMBER_DATA_DIR;
let dataDir;

const setPlatform = (platform) => {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
};

const writeSettings = (settings) => {
  fs.writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify(settings));
};

const mainWindowOptions = () => buildMainWindowOptions({ bounds: null, backgroundColor: '#000000', additionalArguments: [] });

beforeAll(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-early-startup-'));
  process.env.OPENCHAMBER_DATA_DIR = dataDir;
});

afterEach(() => {
  setPlatform(originalPlatform);
  fs.rmSync(path.join(dataDir, 'settings.json'), { force: true });
});

afterAll(() => {
  if (originalDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
  else process.env.OPENCHAMBER_DATA_DIR = originalDataDir;
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Electron reads a present `frame: undefined` as false, so every case pins a
// boolean: only `true` gives the window the window manager's title bar.
test('Linux with the system title bar setting asks for the window manager frame', () => {
  setPlatform('linux');
  writeSettings({ desktopLinuxNativeFrame: true });
  const options = mainWindowOptions();
  expect(options.frame).toBe(true);
  expect(options.titleBarStyle).toBe('default');
});

test('Linux without the setting keeps the frameless window with the app title bar', () => {
  setPlatform('linux');
  const options = mainWindowOptions();
  expect(options.frame).toBe(false);
  expect(options.titleBarStyle).toBe('hidden');
});

test('Windows stays frameless even when the Linux setting is saved', () => {
  setPlatform('win32');
  writeSettings({ desktopLinuxNativeFrame: true });
  const options = mainWindowOptions();
  expect(options.frame).toBe(false);
  expect(options.titleBarStyle).toBe('hidden');
});

test('macOS keeps the hidden title bar with its traffic lights', () => {
  setPlatform('darwin');
  writeSettings({ desktopLinuxNativeFrame: true });
  const options = mainWindowOptions();
  expect(options.frame).toBe(false);
  expect(options.titleBarStyle).toBe('hidden');
  expect(options.trafficLightPosition).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
});
>>>>>>> upstream/main
