import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';

import { linuxAppImageArchSuffix, readElfArchitecture, verifyExtractedPayload } from './verify-linux-appimage.mjs';

const writeElf = (filePath, architecture) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = Buffer.alloc(20);
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
  header.writeUInt16LE(architecture === 'x64' ? 62 : 183, 18);
  fs.writeFileSync(filePath, header, { mode: 0o755 });
};

const writeIcon = (root, relativePath) => {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), 'icon');
  fs.rmSync(path.join(root, '.DirIcon'), { force: true });
  fs.symlinkSync(relativePath, path.join(root, '.DirIcon'));
};

const createPayload = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpichamber-payload-test-'));
  fs.writeFileSync(path.join(root, 'ohpichamber.desktop'), [
    '[Desktop Entry]', 'Name=OhPiChamber', 'Exec=AppRun --no-sandbox %U', 'Icon=ohpichamber', 'StartupWMClass=ohpichamber', '',
  ].join('\n'));
  writeElf(path.join(root, 'ohpichamber'), 'x64');
  const agent = path.join(root, 'resources/agent-runtime');
  writeElf(path.join(agent, 'bun'), 'x64');
  writeElf(path.join(agent, 'packages/native/addon.node'), 'x64');
  fs.mkdirSync(path.join(agent, 'service/dist/worker'), { recursive: true });
  fs.writeFileSync(path.join(agent, 'service/dist/index.js'), 'service');
  fs.writeFileSync(path.join(agent, 'service/dist/worker/index.js'), 'worker');
  const files = ['bun', 'service/dist/index.js', 'service/dist/worker/index.js', 'packages/native/addon.node'].map(file => ({
    path: file, sha256: createHash('sha256').update(fs.readFileSync(path.join(agent, file))).digest('hex'),
  }));
  fs.writeFileSync(path.join(agent, 'manifest.json'), JSON.stringify({
    platform: 'linux', architecture: 'x64', bunVersion: '1.4.4', files,
    packages: ['@oh-my-pi/pi-coding-agent', '@oh-my-pi/pi-natives-linux-x64', 'onnxruntime-node', 'fastembed'].map(name => ({ name })),
  }));
  for (const name of ['pty.node', 'sherpa-onnx.node']) {
    writeElf(path.join(root, 'resources/app.asar.unpacked/node_modules', name), 'x64');
  }
  writeIcon(root, 'usr/share/icons/hicolor/512x512/apps/ohpichamber.png');
  return root;
};

const addAgentNative = (root, relativePath, architecture) => {
  const agent = path.join(root, 'resources/agent-runtime');
  const file = path.join(agent, relativePath);
  writeElf(file, architecture);
  const manifestPath = path.join(agent, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.files.push({ path: relativePath, sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
};

const addUnpackedNative = (root, relativePath, architecture) => {
  const file = path.join(root, 'resources/app.asar.unpacked/node_modules', relativePath);
  writeElf(file, architecture);
  return file;
};

const verify = (root) => verifyExtractedPayload({
  root,
  targetArchitecture: 'x64',
  runBunVersion: () => '1.4.4',
});

test('reads supported ELF architectures', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpichamber-elf-test-'));
  try {
    writeElf(path.join(root, 'x64'), 'x64');
    writeElf(path.join(root, 'arm64'), 'arm64');
    assert.equal(readElfArchitecture(path.join(root, 'x64')), 'x64');
    assert.equal(readElfArchitecture(path.join(root, 'arm64')), 'arm64');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AppImage artifact names use electron-builder arch suffixes', () => {
  assert.equal(linuxAppImageArchSuffix('x64'), 'x86_64');
  assert.equal(linuxAppImageArchSuffix('arm64'), 'arm64');
});

test('verifies identity, version, and native payload architecture', () => {
  const root = createPayload();
  try {
    const result = verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    });
    assert.equal(result.nativeModuleCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('checks the selected ONNX addon for every Native ABI and skips foreign targets', () => {
  const root = createPayload();
  try {
    addAgentNative(root, 'packages/1/bin/napi-v3/darwin/arm64/onnxruntime_binding.node', 'x64');
    addAgentNative(root, 'packages/2/bin/napi-v3/win32/x64/onnxruntime_binding.node', 'x64');
    addAgentNative(root, 'packages/3/bin/napi-v3/linux/arm64/onnxruntime_binding.node', 'arm64');
    addAgentNative(root, 'packages/4/bin/napi-v3/linux/x64/onnxruntime_binding.node', 'x64');
    addAgentNative(root, 'packages/5/bin/napi-v6/darwin/arm64/onnxruntime_binding.node', 'arm64');
    const result = verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    });
    assert.equal(result.nativeModuleCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when a selected ONNX addon has the wrong architecture for every ABI', () => {
  for (const abi of ['napi-v3', 'napi-v6']) {
    const root = createPayload();
    try {
      addAgentNative(root, `packages/1/bin/${abi}/linux/x64/onnxruntime_binding.node`, 'arm64');
      assert.throws(() => verifyExtractedPayload({
        root,
        targetArchitecture: 'x64',
        runBunVersion: () => '1.4.4',
      }), /Agent native module architecture mismatch/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('fails when the selected ONNX addon is missing', () => {
  const root = createPayload();
  try {
    addAgentNative(root, 'packages/1/bin/napi-v3/linux/x64/onnxruntime_binding.node', 'x64');
    fs.rmSync(path.join(root, 'resources/agent-runtime/packages/1/bin/napi-v3/linux/x64/onnxruntime_binding.node'));
    assert.throws(() => verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    }), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('skips foreign ONNX addons in unpacked host modules and checks the selected one', () => {
  const root = createPayload();
  try {
    addUnpackedNative(root, 'onnxruntime-node/bin/napi-v6/darwin/arm64/onnxruntime_binding.node', 'arm64');
    addUnpackedNative(root, 'onnxruntime-node/bin/napi-v3/win32/x64/onnxruntime_binding.node', 'x64');
    const selected = addUnpackedNative(root, 'onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node', 'x64');
    const result = verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    });
    assert.equal(result.nativeModuleCount, 5);
    writeElf(selected, 'arm64');
    assert.throws(() => verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    }), /Native module architecture mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails on a missing native module', () => {
  const root = createPayload();
  try {
    fs.rmSync(path.join(root, 'resources/app.asar.unpacked/node_modules/pty.node'));
    assert.throws(() => verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    }), /Missing packaged native module: pty\.node/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails on wrong Bun version or native architecture', () => {
  const root = createPayload();
  try {
    assert.throws(() => verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.1',
    }), /Bun version mismatch/);
    writeElf(path.join(root, 'resources/app.asar.unpacked/node_modules/pty.node'), 'arm64');
    assert.throws(() => verifyExtractedPayload({
      root,
      targetArchitecture: 'x64',
      runBunVersion: () => '1.4.4',
    }), /Native module architecture mismatch/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a scalable theme icon', () => {
  const root = createPayload();
  try {
    fs.rmSync(path.join(root, 'usr/share/icons/hicolor/512x512'), { recursive: true });
    writeIcon(root, 'usr/share/icons/hicolor/scalable/apps/ohpichamber.svg');
    assert.equal(verify(root).nativeModuleCount, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('fails when the theme cannot resolve Icon=ohpichamber', () => {
  for (const relativePath of [
    'usr/share/icons/hicolor/scalable/ohpichamber.svg',
    'usr/share/icons/hicolor/1024x1024/apps/ohpichamber.png',
  ]) {
    const root = createPayload();
    try {
      fs.rmSync(path.join(root, 'usr/share/icons/hicolor/512x512'), { recursive: true });
      writeIcon(root, relativePath);
      assert.throws(() => verify(root), /Missing theme icon/, relativePath);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('fails when .DirIcon is dangling', () => {
  const root = createPayload();
  try {
    fs.rmSync(path.join(root, '.DirIcon'));
    fs.symlinkSync('usr/share/icons/hicolor/scalable/ohpichamber.svg', path.join(root, '.DirIcon'));
    assert.throws(() => verify(root), /\.DirIcon does not resolve/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
