import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveAgentRuntime } from './agent-runtime.mjs';
import {
  detectSystemOmpRuntime,
  findSystemOmpCandidates,
  findSystemBunCandidates,
  probeSystemBun,
  probeSystemOmp,
} from 'ohpichamber/server/lib/host/system-omp-runtime.js';

function createMockRuntimeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-agent-runtime-'));
  const runtimeDir = path.join(root, 'agent-runtime');
  const serviceDir = path.join(runtimeDir, 'service', 'dist');
  const workerDir = path.join(serviceDir, 'worker');
  fs.mkdirSync(workerDir, { recursive: true });

  const manifest = {
    platform: process.platform,
    architecture: process.arch,
    bunVersion: '1.1.0',
    files: [],
  };
  fs.writeFileSync(path.join(runtimeDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

  const bunPath = path.join(runtimeDir, process.platform === 'win32' ? 'bun.exe' : 'bun');
  const entrypoint = path.join(serviceDir, 'index.js');
  const workerEntry = path.join(workerDir, 'index.js');

  fs.writeFileSync(bunPath, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(entrypoint, '// service entry\n');
  fs.writeFileSync(workerEntry, '// worker entry\n');

  return { root, runtimeDir, bunPath, entrypoint };
}

test('resolveAgentRuntime validates platform manifest and required files', () => {
  const fixture = createMockRuntimeFixture();
  try {
    const resolved = resolveAgentRuntime(fixture.root);
    assert.equal(typeof resolved.bunPath, 'string');
    assert.equal(typeof resolved.entrypoint, 'string');
    assert.equal(resolved.root, fixture.runtimeDir);
    assert.ok(resolved.source === 'bundled' || resolved.source === 'system' || resolved.source === 'operator');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('detectSystemOmpRuntime respects OHPICHAMBER_PREFER_BUNDLED_RUNTIME=1', () => {
  const fixture = createMockRuntimeFixture();
  try {
    const bundled = { bunPath: fixture.bunPath, entrypoint: fixture.entrypoint };
    const result = detectSystemOmpRuntime({
      bundledRuntime: bundled,
      env: { OHPICHAMBER_PREFER_BUNDLED_RUNTIME: '1' },
      candidatePaths: ['/bin/fake-omp'],
    });
    assert.equal(result.source, 'bundled');
    assert.equal(result.bunPath, fixture.bunPath);
    assert.equal(result.entrypoint, fixture.entrypoint);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('detectSystemOmpRuntime honors explicit operator path override', () => {
  const fixture = createMockRuntimeFixture();
  try {
    const bundled = { bunPath: fixture.bunPath, entrypoint: fixture.entrypoint };
    const customBun = '/opt/custom/bin/bun';
    const result = detectSystemOmpRuntime({
      bundledRuntime: bundled,
      env: { OHPICHAMBER_BUN: customBun },
      candidatePaths: [],
    });
    assert.equal(result.source, 'operator');
    assert.equal(result.bunPath, customBun);
    assert.equal(result.env, undefined);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('detectSystemOmpRuntime preserves Bun mode for an already-selected OMP binary', () => {
  const fixture = createMockRuntimeFixture();
  try {
    const result = detectSystemOmpRuntime({
      bundledRuntime: { bunPath: fixture.bunPath, entrypoint: fixture.entrypoint },
      env: {
        OHPICHAMBER_BUN: path.join(fixture.root, process.platform === 'win32' ? 'omp.exe' : 'omp'),
        OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT: fixture.entrypoint,
        BUN_BE_BUN: '1',
      },
    });
    assert.equal(result.source, 'operator');
    assert.deepEqual(result.env, { BUN_BE_BUN: '1' });
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('detectSystemOmpRuntime does not treat bundled default env as operator override', () => {
  const fixture = createMockRuntimeFixture();
  try {
    const bundled = { bunPath: fixture.bunPath, entrypoint: fixture.entrypoint };
    const result = detectSystemOmpRuntime({
      bundledRuntime: bundled,
      env: { OHPICHAMBER_BUN: fixture.bunPath },
      candidatePaths: [],
    });
    // With no system candidates, falls back to bundled without claiming operator
    assert.equal(result.source, 'bundled');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('detectSystemOmpRuntime searches PATH and standard locations for candidates', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-search-'));
  const binDir = path.join(tempDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const fakeOmp = path.join(binDir, process.platform === 'win32' ? 'omp.exe' : 'omp');
  fs.writeFileSync(fakeOmp, '#!/bin/sh\nexit 0\n', { mode: 0o755 });

  try {
    const candidates = findSystemOmpCandidates({
      env: { PATH: binDir },
      home: tempDir,
    });
    assert.ok(candidates.length > 0);
    assert.ok(candidates.some((c) => path.resolve(c) === path.resolve(fakeOmp)));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('probeSystemBun rejects version below minimum manifest requirement', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bun-probe-'));
  const fakeBun = path.join(tempDir, 'bun');
  // Script that prints an old version
  fs.writeFileSync(fakeBun, '#!/bin/sh\necho "0.6.0"\n', { mode: 0o755 });

  try {
    const probe = probeSystemBun(fakeBun, { minBunVersion: '1.1.0' });
    assert.equal(probe.ok, false);
    assert.equal(probe.reason, 'BUN_VERSION_BELOW_MINIMUM');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('probeSystemOmp rejects identity output that does not contain omp identifier', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omp-identity-'));
  const fakeOmp = path.join(tempDir, 'omp');
  // Prints a bare semver without "omp"
  fs.writeFileSync(fakeOmp, '#!/bin/sh\necho "1.2.3"\n', { mode: 0o755 });

  try {
    const probe = probeSystemOmp(fakeOmp);
    assert.equal(probe.ok, false);
    assert.equal(probe.reason, 'IDENTITY_MISMATCH');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('probeSystemOmp assigns BUN_BE_BUN when only the OMP interpreter is available', { skip: process.platform === 'win32' }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-omp-success-'));
  const fakeOmp = path.join(tempDir, 'omp');
  const scriptContent = `#!/bin/sh
case "$*" in
  *-e*)
    echo "__COMPAT_OK__"
    ;;
  *)
    if [ "$BUN_BE_BUN" = "1" ]; then
      echo "1.2.0"
    else
      echo "omp/18.16.0"
    fi
    ;;
esac
exit 0
`;
  fs.writeFileSync(fakeOmp, scriptContent, { mode: 0o755 });

  try {
    const fixture = createMockRuntimeFixture();
    try {
      const result = probeSystemOmp(fakeOmp, {
        bundledServiceDir: path.dirname(path.dirname(fixture.entrypoint)),
        env: { PATH: '' },
      });
      assert.equal(result.ok, true);
      assert.equal(result.bunPath, fakeOmp);
      assert.equal(result.ompVersion, '18.16.0');
      assert.equal(result.bunVersion, '1.2.0');
      assert.equal(result.env?.BUN_BE_BUN, '1');
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
