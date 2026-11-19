import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyWindowsAgentLinks } from './windows-agent-links.mjs';
import { detectSystemOmpRuntime, findSystemOmpCandidates } from 'ohpichamber/server/lib/host/system-omp-runtime.js';
import { withoutInjectedEnv } from 'ohpichamber/server/lib/injected-env.js';

const CODING_AGENT = '@oh-my-pi/pi-coding-agent';
const readManifest = (directory) => JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));

// Bun must read physical files, never Electron's virtual ASAR filesystem.
export function readBundledAgentRuntime(resourcesDirectory, platform = process.platform) {
  const root = path.resolve(resourcesDirectory, 'agent-runtime');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.architecture !== process.arch) {
    throw new Error('Packaged Agent runtime does not match this platform and architecture');
  }
  if (platform === 'win32') verifyWindowsAgentLinks(root, manifest, { create: true });
  const bunPath = path.join(root, platform === 'win32' ? 'bun.exe' : 'bun');
  const entrypoint = path.join(root, 'service', 'dist', 'index.js');
  for (const file of [bunPath, entrypoint, path.join(root, 'service', 'dist', 'worker', 'index.js')]) {
    if (!fs.statSync(file).isFile()) throw new Error(`Missing Agent runtime file: ${file}`);
  }
  return {
    bunPath, entrypoint, root, manifest, source: 'bundled',
    bunVersion: manifest.bunVersion,
    ompVersion: manifest.packages?.find(({ name }) => name === CODING_AGENT)?.version,
  };
}

function localSdkCandidates(executable, platform) {
  const binDir = path.dirname(executable);
  const candidates = [path.resolve(path.dirname(fs.realpathSync(executable)), '..')];
  if (platform === 'win32') {
    candidates.push(
      path.join(binDir, 'node_modules', CODING_AGENT),
      path.resolve(binDir, '../install/global/node_modules', CODING_AGENT),
    );
  }
  return candidates;
}

function resolveLocalPackage(requireFromSdk, name, expectedVersion) {
  for (const directory of requireFromSdk.resolve.paths(name) ?? []) {
    const candidate = path.join(directory, name);
    const metadata = path.join(candidate, 'package.json');
    if (!fs.existsSync(metadata)) continue;
    const manifest = readManifest(candidate);
    if (manifest.name === name && manifest.version === expectedVersion) return fs.realpathSync(candidate);
    break;
  }
  throw new Error(`Local OMP SDK has no compatible ${name}`);
}

function prepareLocalSdk(bundled, sdkRoot, destination, platform, timeout, env) {
  const service = path.dirname(path.dirname(bundled.entrypoint));
  const nodeModules = path.join(service, 'node_modules');
  const targetModules = path.join(destination, 'node_modules');
  const requireFromSdk = createRequire(path.join(sdkRoot, 'package.json'));
  const local = new Map();
  for (const name of fs.readdirSync(path.join(nodeModules, '@oh-my-pi'))) {
    const specifier = `@oh-my-pi/${name}`;
    const expected = readManifest(path.join(nodeModules, specifier)).version;
    local.set(name, specifier === CODING_AGENT ? sdkRoot : resolveLocalPackage(requireFromSdk, specifier, expected));
  }

  // Copy the app-owned entrypoints only. Links make Bun resolve package internals in
  // the original installations and keep the signed application tree untouched.
  fs.cpSync(path.join(service, 'dist'), path.join(destination, 'dist'), { recursive: true });
  fs.mkdirSync(path.join(targetModules, '@oh-my-pi'), { recursive: true });
  const link = (source, target) => fs.symlinkSync(source, target, platform === 'win32' ? 'junction' : 'dir');
  for (const scope of fs.readdirSync(nodeModules)) {
    if (scope === '@oh-my-pi') {
      for (const [name, source] of local) link(source, path.join(targetModules, scope, name));
    } else {
      link(path.join(nodeModules, scope), path.join(targetModules, scope));
    }
  }

  const entrypoint = path.join(destination, 'dist', 'index.js');
  const worker = path.join(destination, 'dist', 'worker', 'index.js');
  const script = `await import(${JSON.stringify(entrypoint)}); await import(${JSON.stringify(worker)}); await import('@oh-my-pi/pi-natives');`;
  execFileSync(bundled.bunPath, ['--no-env-file', '-e', script], {
    cwd: destination, env, timeout, windowsHide: true, stdio: 'ignore',
  });
  return entrypoint;
}

export function resolveAgentRuntime(resourcesDirectory, {
  platform = process.platform, env = withoutInjectedEnv(process.env), home = os.homedir(), localServiceDir,
} = {}) {
  const bundled = readBundledAgentRuntime(resourcesDirectory, platform);
  const preference = detectSystemOmpRuntime({ bundledRuntime: bundled, env, platform, candidatePaths: [] });
  if (preference.source === 'operator') return { ...bundled, ...preference };
  if (preference.reason === 'PREFER_BUNDLED') return { ...bundled, reason: preference.reason };

  const candidates = findSystemOmpCandidates({ env, platform, home });
  const deadline = Date.now() + 2500;
  if (localServiceDir && bundled.ompVersion) {
    for (const executable of candidates) {
      if (Date.now() >= deadline) break;
      try {
        for (const sdkRoot of localSdkCandidates(executable, platform)) {
          const metadata = path.join(sdkRoot, 'package.json');
          if (!fs.existsSync(metadata)) continue;
          const manifest = readManifest(sdkRoot);
          if (manifest.name !== CODING_AGENT || manifest.version !== bundled.ompVersion || manifest.bin?.omp !== 'dist/cli.js') continue;
          const cli = path.join(sdkRoot, 'dist', 'cli.js');
          if (!fs.existsSync(cli) || (platform !== 'win32' && fs.realpathSync(executable) !== cli)) continue;
          fs.rmSync(localServiceDir, { recursive: true, force: true });
          const entrypoint = prepareLocalSdk(bundled, sdkRoot, localServiceDir, platform, Math.max(1, deadline - Date.now()), env);
          return { ...bundled, entrypoint, source: 'system', path: executable };
        }
      } catch {
        try {
          fs.rmSync(localServiceDir, { recursive: true, force: true });
        } catch {
          return { ...bundled, reason: 'LOCAL_SDK_STAGING_FAILED' };
        }
      }
    }
  }

  const detected = detectSystemOmpRuntime({
    bundledRuntime: bundled, env, platform, home, candidatePaths: candidates,
    preferOmpInterpreter: true,
  });
  // A compiled OMP executable can supply Bun, but cannot export its embedded SDK.
  if (detected.source === 'system' && detected.env?.BUN_BE_BUN === '1') {
    return { ...bundled, bunPath: detected.bunPath, bunVersion: detected.bunVersion,
      path: detected.path, env: detected.env, reason: 'SYSTEM_OMP_INTERPRETER_ONLY' };
  }
  return {
    ...bundled,
    reason: detected.source === 'system' ? 'NO_COMPATIBLE_SYSTEM_SDK' : detected.reason,
  };
}
