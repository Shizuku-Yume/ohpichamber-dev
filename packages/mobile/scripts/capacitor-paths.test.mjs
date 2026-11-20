import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const cliRoot = dirname(require.resolve('@capacitor/cli/package.json'));
const { resolveNode } = require(join(cliRoot, 'dist/util/node.js'));

test('Capacitor keeps local and hoisted package symlinks instead of Bun store paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'capacitor-paths-'));
  try {
    const mobile = join(root, 'packages/mobile');
    const store = join(root, 'node_modules/.bun/plugin@1.0.0+hash/node_modules/plugin');
    mkdirSync(mobile, { recursive: true });
    mkdirSync(store, { recursive: true });
    writeFileSync(join(store, 'package.json'), '{"name":"plugin"}');
    symlinkSync(store, join(root, 'node_modules/plugin'));
    assert.equal(resolveNode(mobile, 'plugin', 'package.json'), join(root, 'node_modules/plugin/package.json'));
    mkdirSync(join(mobile, 'node_modules'));
    symlinkSync(store, join(mobile, 'node_modules/plugin'));
    assert.equal(resolveNode(mobile, 'plugin', 'package.json'), join(mobile, 'node_modules/plugin/package.json'));
    assert.equal(resolveNode(mobile, 'missing-capacitor-path-test-package', 'package.json'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('installed Capacitor packages resolve through stable mobile dependency links', () => {
  const mobile = resolve(import.meta.dirname, '..');
  for (const name of ['@capacitor/ios', '@capacitor/android', '@capacitor/app', '@capacitor-mlkit/barcode-scanning']) {
    assert.equal(resolveNode(mobile, name, 'package.json'), join(mobile, 'node_modules', name, 'package.json'));
  }
});

test('native dependency manifests contain existing package links rather than Bun store paths', () => {
  const mobile = resolve(import.meta.dirname, '..');
  for (const manifest of ['ios/App/Podfile', 'android/capacitor.settings.gradle']) {
    const path = join(mobile, manifest);
    const content = readFileSync(path, 'utf8');
    assert.ok(!content.includes('.bun/'), manifest);
    const paths = [...content.matchAll(/'([^']*node_modules[^']*)'/g)];
    assert.ok(paths.length > 0, manifest);
    for (const [, dependency] of paths) {
      const resolved = resolve(dirname(path), dependency);
      assert.ok(existsSync(resolved) || existsSync(`${resolved}.rb`), dependency);
    }
  }
});
