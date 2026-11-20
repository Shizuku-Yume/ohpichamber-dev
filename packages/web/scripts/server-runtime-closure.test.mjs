import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { assertServerRuntimeClosure } from './server-runtime-closure.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function fixture(files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-server-closure-'));
  directories.push(directory);
  for (const [file, source] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
    await fs.writeFile(path.join(directory, file), source);
  }
  return directory;
}

test('checks every production runtime module without loading code', async () => {
  const directory = await fixture({
    'server/index.js': "import './host.js'; import('./worker.mjs');",
    'server/host.js': "import './helper.cjs'; import './settings.json' with { type: 'json' }; throw new Error('must not execute');",
    'server/worker.mjs': '',
    'server/helper.cjs': "require('./settings.json'); require('node:fs');",
    'server/settings.json': '{}',
  });
  expect(await assertServerRuntimeClosure(directory, ['server/index.js', 'server/host.js', 'server/worker.mjs', 'server/helper.cjs', 'server/settings.json'])).toBe(5);
});

test('an empty module selection has no required output', async () => {
  expect(await assertServerRuntimeClosure(await fixture({}), [])).toBe(0);
});

test('refuses a missing runtime counterpart', async () => {
  const directory = await fixture({ 'server/index.js': '' });
  await expect(assertServerRuntimeClosure(directory, ['server/index.js', 'server/missing.js'])).rejects.toThrow(/missing runtime module: server[/\\]missing.js/);
});

test('checks additional external entry modules even when the server does not import them', async () => {
  const directory = await fixture({ 'server/index.js': '' });
  await expect(assertServerRuntimeClosure(directory, ['server/index.js', 'server/host/login-shell-env.js'])).rejects.toThrow(/login-shell-env.js/);
});

test('refuses a module inventory that would depend on files outside the shipped output', async () => {
  const directory = await fixture({});
  await expect(assertServerRuntimeClosure(directory, ['../source.js'])).rejects.toThrow(/escapes the build/);
});
