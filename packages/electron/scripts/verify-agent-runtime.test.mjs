import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyAgentPayload } from './verify-agent-runtime.mjs';
import { resolveAgentRuntime } from '../agent-runtime.mjs';

function fixture(t) {
  const resources = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-resource-'));
  t.after(() => fs.rmSync(resources, { recursive: true, force: true }));
  const root = path.join(resources, 'agent-runtime');
  fs.mkdirSync(path.join(root, 'service/dist/worker'), { recursive: true });
  const paths = ['service/dist/index.js', 'service/dist/worker/index.js', process.platform === 'win32' ? 'bun.exe' : 'bun'];
  const files = paths.map(file => {
    fs.writeFileSync(path.join(root, file), file, { mode: 0o755 });
    return { path: file, sha256: createHash('sha256').update(file).digest('hex') };
  });
  const manifest = {
    platform: process.platform, architecture: process.arch, bunVersion: '1.4.4', files,
    packages: ['@oh-my-pi/pi-coding-agent', `@oh-my-pi/pi-natives-${process.platform}-${process.arch}`, 'onnxruntime-node', 'fastembed'].map(name => ({ name })),
  };
  const save = () => fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest));
  save();
  return { root, resources, manifest, save };
}

test('resolves a relocated physical runtime and verifies its exact executable version and bytes', t => {
  const { root, resources } = fixture(t);
  assert.equal(verifyAgentPayload(root, { runBunVersion: () => '1.4.4' }).packageCount, 4);
  const runtime = resolveAgentRuntime(resources);
  assert.equal(runtime.entrypoint, path.join(root, 'service/dist/index.js'));
  fs.writeFileSync(runtime.entrypoint, 'damaged');
  assert.throws(() => verifyAgentPayload(root, { runBunVersion: () => '1.4.4' }), /checksum mismatch/);
});

test('fails closed on wrong target, wrong Bun and missing SDK closure', t => {
  const { root, resources, manifest, save } = fixture(t);
  assert.throws(() => verifyAgentPayload(root, { runBunVersion: () => '1.3.14' }), /Bun version mismatch/);
  manifest.architecture = 'wrong'; save();
  assert.throws(() => resolveAgentRuntime(resources), /does not match/);
  manifest.architecture = process.arch;
  manifest.packages = manifest.packages.filter(item => item.name !== 'fastembed'); save();
  assert.throws(() => verifyAgentPayload(root), /Agent dependency missing: fastembed/);
});

test('refuses dependency symlinks escaping the staged resource directory', t => {
  const { root, resources, manifest, save } = fixture(t);
  fs.writeFileSync(path.join(resources, 'outside'), 'outside');
  const link = path.join('..', 'outside');
  fs.symlinkSync(link, path.join(root, 'escape'));
  manifest.files.push({ path: 'escape', link }); save();
  assert.throws(() => verifyAgentPayload(root), /escapes resource directory/);
});
