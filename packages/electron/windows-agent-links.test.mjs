import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareWindowsAgentLinks, verifyWindowsAgentLinks } from './windows-agent-links.mjs';

function fixture(t, platform = 'win32') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-agent-links-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'payload');
  fs.mkdirSync(path.join(root, 'packages/1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'service/node_modules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'packages/1/index.cjs'), 'module.exports = 42;');
  fs.symlinkSync(path.join(root, 'packages/1'), path.join(root, 'service/node_modules/dep'), 'dir');
  fs.symlinkSync(path.join(root, 'packages/1/index.cjs'), path.join(root, 'native.node'), 'file');
  if (process.platform === 'win32') {
    fs.unlinkSync(path.join(root, 'native.node'));
    fs.symlinkSync(path.join(root, 'packages/1/index.cjs'), path.join(root, 'native.node'), 'junction');
  }
  const manifest = { platform, files: [
    { path: 'service/node_modules/dep', link: '../../packages/1' },
    { path: 'native.node', link: 'packages/1/index.cjs' },
  ] };
  const save = () => fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  save();
  return { directory, root, manifest, save };
}

test('Windows ships no links, restores relocated junctions and materializes native files', t => {
  const { directory, root } = fixture(t);
  prepareWindowsAgentLinks(root);
  assert.equal(fs.existsSync(path.join(root, 'service/node_modules/dep')), false);
  assert.equal(fs.lstatSync(path.join(root, 'native.node')).isSymbolicLink(), false);
  const relocated = path.join(directory, 'installed');
  fs.cpSync(root, relocated, { recursive: true });
  fs.rmSync(root, { recursive: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(relocated, 'manifest.json')));
  assert.deepEqual(manifest.junctions, [{ path: 'service/node_modules/dep', target: 'packages/1' }]);
  verifyWindowsAgentLinks(relocated, manifest, { create: true });
  verifyWindowsAgentLinks(relocated, manifest, { create: true });
  assert.equal(fs.realpathSync(path.join(relocated, 'service/node_modules/dep')), path.join(relocated, 'packages/1'));
  assert.equal(fs.readFileSync(path.join(relocated, 'native.node'), 'utf8'), 'module.exports = 42;');
});

test('rejects a copied link pointing at a genuinely wrong in-payload target', t => {
  const { root } = fixture(t);
  const link = path.join(root, 'service/node_modules/dep');
  fs.unlinkSync(link);
  fs.symlinkSync(path.join(root, 'service'), link, 'dir');
  assert.throws(() => prepareWindowsAgentLinks(root), /link mismatch/);
});

test('rejects incorrect existing junctions, escaping paths and missing targets', t => {
  const { root } = fixture(t);
  prepareWindowsAgentLinks(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  const link = path.join(root, 'service/node_modules/dep');
  fs.symlinkSync(path.join(root, 'service'), link, 'junction');
  assert.throws(() => verifyWindowsAgentLinks(root, manifest), /link mismatch/);
  fs.unlinkSync(link);
  manifest.junctions[0].target = '../outside';
  assert.throws(() => verifyWindowsAgentLinks(root, manifest), /escapes resource directory/);
  manifest.junctions[0].target = 'missing';
  assert.throws(() => verifyWindowsAgentLinks(root, manifest), /ENOENT/);
});

test('empty graphs and non-Windows payloads remain unchanged', t => {
  const { root, manifest, save } = fixture(t, 'linux');
  const before = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  prepareWindowsAgentLinks(root);
  assert.equal(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'), before);
  assert.equal(fs.lstatSync(path.join(root, 'native.node')).isSymbolicLink(), true);
  manifest.platform = 'win32';
  manifest.files = [];
  save();
  prepareWindowsAgentLinks(root);
  verifyWindowsAgentLinks(root, JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'))));
});
