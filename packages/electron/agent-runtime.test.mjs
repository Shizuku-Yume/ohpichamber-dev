import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

import { resolveAgentRuntime } from './agent-runtime.mjs';
import {
  detectSystemOmpRuntime,
  findSystemOmpCandidates,
  findSystemBunCandidates,
  probeSystemBun,
  probeSystemOmp,
} from 'ohpichamber/server/lib/host/system-omp-runtime.js';

function createMockRuntimeFixture(platform = process.platform) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-agent-runtime-'));
  const runtimeDir = path.join(root, 'agent-runtime');
  const serviceDir = path.join(runtimeDir, 'service', 'dist');
  const workerDir = path.join(serviceDir, 'worker');
  fs.mkdirSync(workerDir, { recursive: true });

  const manifest = {
    platform,
    architecture: process.arch,
    bunVersion: '1.1.0',
    files: [],
  };
  fs.writeFileSync(path.join(runtimeDir, 'manifest.json'), JSON.stringify(manifest), 'utf8');

  const bunPath = path.join(runtimeDir, platform === 'win32' ? 'bun.exe' : 'bun');
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
    const resolved = resolveAgentRuntime(fixture.root, { env: { OHPICHAMBER_PREFER_BUNDLED_RUNTIME: '1' } });
    assert.equal(typeof resolved.bunPath, 'string');
    assert.equal(typeof resolved.entrypoint, 'string');
    assert.equal(resolved.root, fixture.runtimeDir);
    assert.equal(resolved.source, 'bundled');
    assert.equal(resolved.reason, 'PREFER_BUNDLED');
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('desktop resolves an installed OMP SDK only when it matches the shipped SDK', { skip: process.platform === 'win32' }, () => {
  const fixture = createMockRuntimeFixture();
  const sdk = '@oh-my-pi/pi-coding-agent';
  const patchedFiles = ['src/sdk.ts', 'src/async/job-manager.ts', 'src/tools/bash.ts'];
  const writeSdk = (root, version, unpatchedFile) => {
    fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: sdk, version, bin: { omp: 'dist/cli.js' } }));
    for (const file of patchedFiles) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file === unpatchedFile ? '// unpatched' : '// patched');
    }
    const cli = path.join(root, 'dist', 'cli.js');
    fs.writeFileSync(cli, '#!/bin/sh\necho omp/' + version + '\n', { mode: 0o755 });
    return cli;
  };
  try {
    const manifestPath = path.join(fixture.runtimeDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.packages = [{ name: sdk, version: '19.0.0' }];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    writeSdk(path.join(fixture.runtimeDir, 'service', 'node_modules', sdk), '19.0.0');
    const localSdk = path.join(fixture.root, 'global', 'node_modules', sdk);
    const bin = path.join(fixture.root, 'bin');
    const localServiceDir = path.join(fixture.root, 'overlay');
    fs.mkdirSync(bin);
    fs.symlinkSync(writeSdk(localSdk, '19.0.0'), path.join(bin, 'omp'));
    const options = { localServiceDir, home: fixture.root, env: { PATH: bin } };
    const selected = resolveAgentRuntime(fixture.root, options);
    assert.equal(selected.source, 'system');
    assert.equal(selected.ompVersion, '19.0.0');
    assert.equal(selected.entrypoint, path.join(localServiceDir, 'dist', 'index.js'));
    assert.equal(fs.realpathSync(path.join(localServiceDir, 'node_modules', sdk)), fs.realpathSync(localSdk));

    writeSdk(localSdk, '20.0.0');
    const fallback = resolveAgentRuntime(fixture.root, options);
    assert.equal(fallback.source, 'bundled');
    assert.equal(fallback.ompVersion, '19.0.0');
    assert.equal(fallback.entrypoint, fixture.entrypoint);

    for (const file of patchedFiles) {
      writeSdk(localSdk, '19.0.0', file);
      assert.equal(resolveAgentRuntime(fixture.root, options).entrypoint, fixture.entrypoint, file);
    }

    writeSdk(localSdk, '19.0.0');
    fs.writeFileSync(fixture.bunPath, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.equal(resolveAgentRuntime(fixture.root, options).entrypoint, fixture.entrypoint);
    assert.equal(fs.existsSync(localServiceDir), false);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('Windows local SDK probes allow cold imports and preserve SDK rejection reasons', (t) => {
  const fixture = createMockRuntimeFixture('win32');
  const sdk = '@oh-my-pi/pi-coding-agent';
  const bin = path.join(fixture.root, 'bin');
  const localSdk = path.join(bin, 'node_modules', sdk);
  const overlay = path.join(fixture.root, 'overlay');
  const files = ['src/sdk.ts', 'src/async/job-manager.ts', 'src/tools/bash.ts'];
  const writeSdk = (directory, version = '19.0.0') => {
    fs.mkdirSync(path.join(directory, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: sdk, version, bin: { omp: 'dist/cli.js' } }));
    fs.writeFileSync(path.join(directory, 'dist', 'cli.js'), '');
    for (const file of files) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      fs.writeFileSync(path.join(directory, file), '// patched');
    }
  };
  let failure;
  let probes = 0;
  const mock = t.mock.method(childProcess, 'execFileSync', (binary, args, options) => {
    assert.equal(binary, fixture.bunPath);
    assert.equal(args[0], '--no-env-file');
    assert.ok(options.timeout > 2500 && options.timeout <= 30000);
    probes += 1;
    if (failure) throw failure;
    return '';
  });
  syncBuiltinESMExports();
  try {
    const manifestPath = path.join(fixture.runtimeDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.packages = [{ name: sdk, version: '19.0.0' }];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    writeSdk(path.join(fixture.runtimeDir, 'service', 'node_modules', sdk));
    writeSdk(localSdk);
    fs.writeFileSync(path.join(bin, 'omp.cmd'), '@echo off');
    const options = { platform: 'win32', env: { PATH: bin }, home: fixture.root, localServiceDir: overlay };
    assert.equal(resolveAgentRuntime(fixture.root, options).source, 'system');
    assert.equal(probes, 1);

    failure = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    let rejected = resolveAgentRuntime(fixture.root, options);
    assert.equal(rejected.source, 'bundled');
    assert.equal(rejected.reason, 'LOCAL_SDK_PROBE_TIMEOUT');
    assert.equal(fs.existsSync(overlay), false);

    failure = new Error('import failed');
    rejected = resolveAgentRuntime(fixture.root, options);
    assert.equal(rejected.reason, 'LOCAL_SDK_PROBE_FAILED');
    assert.equal(fs.existsSync(overlay), false);

    const beforeMismatch = probes;
    fs.writeFileSync(path.join(localSdk, files[0]), '// stock');
    assert.equal(resolveAgentRuntime(fixture.root, options).reason, 'LOCAL_SDK_PATCH_MISMATCH');
    writeSdk(localSdk, '20.0.0');
    assert.equal(resolveAgentRuntime(fixture.root, options).reason, 'LOCAL_SDK_VERSION_MISMATCH');
    writeSdk(localSdk);
    fs.writeFileSync(path.join(localSdk, 'package.json'), JSON.stringify({ name: sdk, version: '19.0.0', bin: { omp: 'other.js' } }));
    assert.equal(resolveAgentRuntime(fixture.root, options).reason, 'LOCAL_SDK_LAYOUT_MISMATCH');
    assert.equal(probes, beforeMismatch);
    const empty = resolveAgentRuntime(fixture.root, { ...options, env: {} });
    assert.equal(empty.source, 'bundled');
    assert.equal(empty.reason, 'NO_SYSTEM_OMP');
  } finally {
    mock.mock.restore();
    syncBuiltinESMExports();
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
