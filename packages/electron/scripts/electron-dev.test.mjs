import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./electron-dev.mjs', import.meta.url), 'utf8');
const stopSource = source.slice(source.indexOf('async function stopChildTree('), source.indexOf('async function main('));

function fixture(platform, { treeKillSucceeds = true } = {}) {
  const calls = [];
  const child = { pid: 123, exitCode: null, signalCode: null };
  const stop = runInNewContext(`${stopSource}; stopChildTree`, {
    process: { platform },
    killWindowsProcessTree(pid) {
      calls.push(['tree', pid]);
      if (treeKillSucceeds) child.exitCode = 1;
    },
    signalChild(target, signal) {
      calls.push(['signal', signal]);
      target.signalCode = signal;
    },
    async waitForExit() {},
  });
  return { calls, child, stop };
}

test('Windows terminates the tree before a signal can orphan descendants', async () => {
  const { calls, child, stop } = fixture('win32');
  await stop(child);
  assert.deepEqual(calls, [['tree', 123]]);
});

test('Windows falls back to termination if tree cleanup fails', async () => {
  const { calls, child, stop } = fixture('win32', { treeKillSucceeds: false });
  await stop(child);
  assert.deepEqual(calls, [['tree', 123], ['signal', 'SIGTERM']]);
});

for (const platform of ['linux', 'darwin']) {
  test(`${platform} retains graceful signal cleanup`, async () => {
    const { calls, child, stop } = fixture(platform);
    await stop(child);
    assert.deepEqual(calls, [['signal', 'SIGINT']]);
  });
}

test('cleanup tolerates missing, exited and already stopped children', async () => {
  const { calls, child, stop } = fixture('win32');
  await stop(null);
  await stop({ ...child, exitCode: 0 });
  await stop({ ...child, signalCode: 'SIGTERM' });
  await stop(child);
  await stop(child);
  assert.deepEqual(calls, [['tree', 123]]);
});

test('relaunch keeps the same HMR server and ports; final exit stops it', async () => {
  const children = [];
  const stopped = [];
  const exits = [];
  const mainSource = source.slice(source.indexOf('async function main('), source.indexOf('\nmain().catch('));
  const main = runInNewContext(`${mainSource}; main`, {
    process: { env: {}, on() {}, exit(code) { exits.push(code); } },
    console: { log() {}, warn() {} },
    path: { join: (...parts) => parts.join('/') },
    electronDir: 'electron',
    preferredHmrApiPort: 3901,
    preferredHmrUiPort: 5173,
    ensureElectronInstalled() {},
    async runProcess() {},
    resolveAgentRuntime: () => ({ env: {} }),
    findAvailablePort: async (port) => port,
    spawnProcess(command, args, options) {
      const child = new EventEmitter();
      children.push({ command, args, options, child });
      return child;
    },
    async stopChildTree(child) { stopped.push(child); },
  });
  await main();
  assert.equal(children.length, 2);
  children[1].child.emit('exit', 75, null);
  assert.equal(children.length, 3);
  assert.deepEqual(stopped, []);
  assert.equal(children[2].options.env.OPENCHAMBER_HMR_UI_PORT, '5173');
  assert.equal(children[2].options.env.OPENCHAMBER_HMR_API_PORT, '3901');
  children[2].child.emit('exit', 0, null);
  await new Promise(setImmediate);
  assert.deepEqual(stopped, [children[2].child, children[0].child]);
  assert.deepEqual(exits, [0]);
});
