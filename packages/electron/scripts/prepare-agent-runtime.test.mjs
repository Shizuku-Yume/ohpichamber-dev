import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { assertNativeRuntimePackageAvailable, stageDependencyClosure } from './prepare-agent-runtime.mjs';

test('requires an exact registry pin for the selected native target', () => {
  const target = { platform: 'linux', architecture: 'x64' };
  const name = '@oh-my-pi/pi-natives-linux-x64';
  assert.doesNotThrow(() => assertNativeRuntimePackageAvailable({ overrides: { [name]: '19.0.0' } }, target));
  for (const pin of [undefined, '', '^19.0.0', 'latest', 'file:vendor/native.tgz']) {
    assert.throws(() => assertNativeRuntimePackageAvailable({ overrides: { [name]: pin } }, target), /requires an exact registry version/);
  }
  assert.throws(() => assertNativeRuntimePackageAvailable({}, target), /requires an exact registry version/);
});

const fixture = t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkg = (directory, manifest, source = 'module.exports = {};') => {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ main: 'index.cjs', ...manifest }));
    fs.writeFileSync(path.join(directory, 'index.cjs'), source);
  };
  return { root, pkg, source: path.join(root, 'input'), output: path.join(root, 'payload') };
};

test('relocated closure resolves conflicting versions, cycles, peers and native assets without source node_modules', t => {
  const { root, pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', dependencies: { a: '1', b: '1' } }, 'module.exports = [require("a"), require("b")];');
  pkg(path.join(source, 'node_modules/a'), { name: 'a', version: '1', dependencies: { shared: '1' }, peerDependencies: { b: '1' } }, 'module.exports = require("shared");');
  pkg(path.join(source, 'node_modules/b'), { name: 'b', version: '1', dependencies: { shared: '2', a: '1' } }, 'module.exports = require("shared");');
  pkg(path.join(source, 'node_modules/shared'), { name: 'shared', version: '1' }, 'module.exports = 1;');
  pkg(path.join(source, 'node_modules/b/node_modules/shared'), { name: 'shared', version: '2' }, 'module.exports = 2;');
  fs.writeFileSync(path.join(source, 'node_modules/a/addon.node'), 'native-bytes');
  const packages = stageDependencyClosure(source, output);
  assert.equal(packages.filter(item => item.name === 'shared').length, 2);
  fs.rmSync(source, { recursive: true });
  const relocated = path.join(root, 'relocated');
  fs.renameSync(output, relocated);
  const require = createRequire(path.join(relocated, 'service/package.json'));
  assert.deepEqual(require('./index.cjs'), [1, 2]);
  const a = packages.find(item => item.name === 'a');
  assert.equal(fs.readFileSync(path.join(relocated, a.path, 'addon.node'), 'utf8'), 'native-bytes');
});

test('links platform N-API assets beside the loader package in the relocated closure', t => {
  const { root, pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', dependencies: { '@oh-my-pi/pi-natives': '1' } });
  pkg(path.join(source, 'node_modules/@oh-my-pi/pi-natives'), {
    name: '@oh-my-pi/pi-natives', version: '1', optionalDependencies: { '@oh-my-pi/pi-natives-linux-x64': '1' },
  });
  const platformPackage = path.join(source, 'node_modules/@oh-my-pi/pi-natives-linux-x64');
  pkg(platformPackage, { name: '@oh-my-pi/pi-natives-linux-x64', version: '1' });
  fs.writeFileSync(path.join(platformPackage, 'pi_natives.linux-x64-modern.node'), 'native-bytes');
  stageDependencyClosure(source, output, { platform: 'linux', architecture: 'x64' });
  const link = path.join(output, 'packages/1/native/pi_natives.linux-x64-modern.node');
  assert.equal(fs.readlinkSync(link), '../../2/pi_natives.linux-x64-modern.node');
  assert.equal(fs.readFileSync(link, 'utf8'), 'native-bytes');
});

test('prunes non-target ONNX bindings for every N-API ABI and keeps the selected Linux target', t => {
  const { pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', dependencies: { 'onnxruntime-node': '1', other: '1' } });
  const onnx = path.join(source, 'node_modules/onnxruntime-node');
  pkg(onnx, { name: 'onnxruntime-node', version: '1' });
  const bindings = [
    'bin/napi-v3/darwin/x64/onnxruntime_binding.node',
    'bin/napi-v3/linux/arm64/onnxruntime_binding.node',
    'bin/napi-v3/linux/x64/onnxruntime_binding.node',
    'bin/napi-v6/darwin/arm64/onnxruntime_binding.node',
    'bin/napi-v6/linux/x64/onnxruntime_binding.node',
  ];
  for (const binding of bindings) {
    fs.mkdirSync(path.dirname(path.join(onnx, binding)), { recursive: true });
    fs.writeFileSync(path.join(onnx, binding), binding);
  }
  const other = path.join(source, 'node_modules/other');
  pkg(other, { name: 'other', version: '1' });
  fs.mkdirSync(path.join(other, 'bin/napi-v3/darwin/x64'), { recursive: true });
  fs.writeFileSync(path.join(other, 'bin/napi-v3/darwin/x64/keep.node'), 'keep');
  const packages = stageDependencyClosure(source, output, { platform: 'linux', architecture: 'x64' });
  const staged = path.join(output, packages.find(item => item.name === 'onnxruntime-node').path);
  for (const foreign of bindings.filter(binding => !binding.includes('/linux/x64/'))) {
    assert.equal(fs.existsSync(path.join(staged, foreign)), false, foreign);
  }
  for (const selected of bindings.filter(binding => binding.includes('/linux/x64/'))) {
    assert.equal(fs.readFileSync(path.join(staged, selected), 'utf8'), selected);
  }
  const stagedOther = path.join(output, packages.find(item => item.name === 'other').path);
  assert.equal(fs.readFileSync(path.join(stagedOther, 'bin/napi-v3/darwin/x64/keep.node'), 'utf8'), 'keep');
});

test('fails on missing required runtime dependencies rather than emitting a partial success', t => {
  const { pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', dependencies: { absent: '1' } });
  assert.throws(() => stageDependencyClosure(source, output), /Missing installed runtime dependency absent/);
});

test('omits absent optional and incompatible optional platform packages', t => {
  const { pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', optionalDependencies: { absent: '1', wrong: '1' } });
  pkg(path.join(source, 'node_modules/wrong'), { name: 'wrong', version: '1', os: ['win32'] });
  assert.deepEqual(stageDependencyClosure(source, output, { platform: 'linux' }).map(item => item.name), ['service']);
});

test('stages installed packages shadowed by Bun builtins from their actual nearest owner', t => {
  const { root, pkg, source, output } = fixture(t);
  pkg(source, { name: 'service', version: '1', dependencies: { puppeteer: '1', ws: 'outer' } });
  const installed = path.join(root, 'store', 'puppeteer', 'node_modules');
  const puppeteer = path.join(installed, 'puppeteer');
  pkg(puppeteer, { name: 'puppeteer', version: '1', dependencies: { ws: 'inner' } });
  pkg(path.join(installed, 'ws'), { name: 'ws', version: 'inner' }, 'module.exports = "inner-owner";');
  pkg(path.join(source, 'node_modules/ws'), { name: 'ws', version: 'outer' }, 'module.exports = "outer-owner";');
  fs.symlinkSync(path.relative(path.join(source, 'node_modules'), puppeteer), path.join(source, 'node_modules/puppeteer'), 'dir');
  const packages = stageDependencyClosure(source, output);
  assert.deepEqual(packages.filter(item => item.name === 'ws').map(item => item.version).sort(), ['inner', 'outer']);
  const stagedPuppeteer = packages.find(item => item.name === 'puppeteer');
  const stagedWs = path.join(output, stagedPuppeteer.path, 'node_modules/ws');
  assert.equal(JSON.parse(fs.readFileSync(path.join(stagedWs, 'package.json'), 'utf8')).version, 'inner');
  fs.rmSync(source, { recursive: true });
  fs.rmSync(path.join(root, 'store'), { recursive: true });
  assert.equal(fs.readFileSync(path.join(stagedWs, 'index.cjs'), 'utf8'), 'module.exports = "inner-owner";');
});
