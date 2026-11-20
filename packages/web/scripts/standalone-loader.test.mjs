import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test, expect } from 'vitest';

test('the exported standalone loader locates package resources from source and compiled layouts', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-loader-layout-'));
  try {
    const manifest = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify(manifest));
    for (const directory of ['scripts', 'build/scripts', 'resources/agent-runtime']) {
      await fs.mkdir(path.join(root, directory), { recursive: true });
    }
    await fs.writeFile(path.join(root, 'resources/agent-runtime/manifest.json'), JSON.stringify({ files: [], packages: [] }));
    for (const directory of ['scripts', 'build/scripts']) {
      await fs.copyFile(new URL('./standalone-loader.mjs', import.meta.url), path.join(root, directory, 'standalone-loader.mjs'));
    }
    const compiled = pathToFileURL(path.join(root, 'build/scripts/standalone-loader.mjs')).href;
    const source = pathToFileURL(path.join(root, 'scripts/standalone-loader.mjs')).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      const compiled = await import(${JSON.stringify(compiled)});
      assert.equal(compiled.findRuntimeRoot(), ${JSON.stringify(path.join(root, 'resources/agent-runtime'))});
      const exported = import.meta.resolve('ohpichamber/scripts/standalone-loader.mjs', ${JSON.stringify(compiled)});
      assert.equal(exported, ${JSON.stringify(source)});
      const source = await import(${JSON.stringify(source)});
      assert.equal(source.findRuntimeRoot(), compiled.findRuntimeRoot());
      assert.equal(source.findRuntimeRoot(${JSON.stringify(path.join(root, 'missing'))}), null);
    `], { cwd: root, env: process.env, encoding: 'utf8', timeout: 10000 });
    expect(result.status, result.stderr).toBe(0);
    expect(manifest.exports['./scripts/standalone-loader.mjs']).toBe('./scripts/standalone-loader.mjs');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
