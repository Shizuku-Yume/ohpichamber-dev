import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { stageDependencyClosure } from './prepare-agent-runtime.mjs';

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
