import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureAgentRuntimeSymlinks,
  resolveWebAgentRuntime,
  createHostAgentRuntime,
} from './agent-runtime.js';

describe('agent-runtime resolution and supervisor creation', () => {
  it('returns null when no bundled agent runtime directory exists', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-empty-'));
    try {
      expect(resolveWebAgentRuntime(emptyDir)).toBeNull();
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('throws on platform or architecture mismatch in manifest', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-mismatch-'));
    const runtimeDir = path.join(fixtureDir, 'resources', 'agent-runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'manifest.json'),
      JSON.stringify({ platform: 'other-os', architecture: 'other-arch', files: [] }),
    );
    try {
      expect(() => resolveWebAgentRuntime(fixtureDir)).toThrow(
        /Packaged Agent runtime does not match this platform and architecture/,
      );
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('throws if required runtime files are missing', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-missing-files-'));
    const runtimeDir = path.join(fixtureDir, 'resources', 'agent-runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      path.join(runtimeDir, 'manifest.json'),
      JSON.stringify({ platform: process.platform, architecture: process.arch, files: [] }),
    );
    try {
      expect(() => resolveWebAgentRuntime(fixtureDir)).toThrow(/Missing Agent runtime file/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('resolves bundled runtime and restores missing symlinks from manifest', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-valid-'));
    const runtimeDir = path.join(fixtureDir, 'resources', 'agent-runtime');
    fs.mkdirSync(path.join(runtimeDir, 'service', 'dist', 'worker'), { recursive: true });
    fs.mkdirSync(path.join(runtimeDir, 'packages', '0'), { recursive: true });

    const bunFile = path.join(runtimeDir, process.platform === 'win32' ? 'bun.exe' : 'bun');
    const entrypointFile = path.join(runtimeDir, 'service', 'dist', 'index.js');
    const workerFile = path.join(runtimeDir, 'service', 'dist', 'worker', 'index.js');
    fs.writeFileSync(bunFile, 'dummy-bun');
    fs.writeFileSync(entrypointFile, 'dummy-entry');
    fs.writeFileSync(workerFile, 'dummy-worker');
    fs.writeFileSync(path.join(runtimeDir, 'packages', '0', 'index.js'), 'export const pkg = 0;');

    // Manifest with a relative symlink that is not yet on disk
    const manifest = {
      platform: process.platform,
      architecture: process.arch,
      bunVersion: '1.4.4',
      files: [
        { path: 'service/dist/index.js', sha256: 'mock' },
        { path: 'service/node_modules/dep-zero', link: '../../packages/0' },
      ],
    };
    fs.writeFileSync(path.join(runtimeDir, 'manifest.json'), JSON.stringify(manifest));

    try {
      const resolved = resolveWebAgentRuntime(fixtureDir);
      expect(resolved).not.toBeNull();
      expect(resolved.bunPath).toBe(bunFile);
      expect(resolved.entrypoint).toBe(entrypointFile);
      expect(resolved.worker).toBe(workerFile);

      // Verify that ensureAgentRuntimeSymlinks created the missing symlink
      const linkPath = path.join(runtimeDir, 'service', 'node_modules', 'dep-zero');
      expect(fs.lstatSync(linkPath).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(linkPath)).toBe('../../packages/0');
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('createHostAgentRuntime respects explicit bunPath and entrypoint', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-rt-data-'));
    try {
      const runtime = createHostAgentRuntime({
        dataDir,
        scopeRuntime: {
          resolveWorkspaceScope: async () => null,
          resolveWorkspaceDirectory: async () => null,
          resolveSessionScope: async () => null,
          resolveRepositoryWorkspace: async () => null,
          resolveRelocationSourceScope: async () => null,
        },
        validateDirectoryPath: () => true,
        getEnvironmentForDirectory: async () => ({}),
        invokeHostAction: async () => null,
        enterprisePolicyOptions: {},
        bunPath: '/custom/bin/bun',
        entrypoint: '/custom/service/index.js',
      });
      expect(runtime).toBeDefined();
      expect(runtime.service).toBeDefined();
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('ensureAgentRuntimeSymlinks does nothing if manifest.json is absent', () => {
    const dummy = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-nosym-'));
    try {
      expect(() => ensureAgentRuntimeSymlinks(dummy)).not.toThrow();
    } finally {
      fs.rmSync(dummy, { recursive: true, force: true });
    }
  });

  it.each([
    ['EROFS', 'read-only mount'],
    ['ENOTDIR', 'a packed asar path whose parent is the archive file'],
  ])('ensureAgentRuntimeSymlinks tolerates an unrepairable runtime root (%s: %s)', (code) => {
    // A packaged AppImage mounts its payload read-only and packs this module
    // inside app.asar, so the repair pass must not fail the boot when the links
    // it would create are already present in the payload.
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-rt-unrepairable-'));
    const runtimeDir = path.join(fixtureDir, 'resources', 'agent-runtime');
    fs.mkdirSync(path.join(runtimeDir, 'packages', '0'), { recursive: true });
    fs.writeFileSync(path.join(runtimeDir, 'packages', '0', 'index.js'), 'export const pkg = 0;');
    fs.writeFileSync(path.join(runtimeDir, 'manifest.json'), JSON.stringify({
      platform: process.platform,
      architecture: process.arch,
      files: [{ path: 'service/node_modules/dep-zero', link: '../../packages/0' }],
    }));
    const mkdirSync = fs.mkdirSync;
    const spy = vi.spyOn(fs, 'mkdirSync').mockImplementation((target, options) => {
      if (String(target).includes('service/node_modules')) {
        throw Object.assign(new Error(code), { code });
      }
      return mkdirSync(target, options);
    });
    try {
      expect(() => ensureAgentRuntimeSymlinks(runtimeDir)).not.toThrow();
    } finally {
      spy.mockRestore();
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
