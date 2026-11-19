import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeTargetArchitecture } from './target-architecture.mjs';
<<<<<<< HEAD
import { verifyAgentPayload } from './verify-agent-runtime.mjs';
||||||| bc50ba56aa
import { parseOpenCodeCliVersion, readPinnedOpenCodeCliVersion } from './opencode-cli-version.mjs';
=======
import { readElfArchitecture } from './binary-architecture.mjs';
import { readPinnedOpenCodeServerVersion, verifyOpenCodeServer } from './opencode-server-staging.mjs';

export { readElfArchitecture };
>>>>>>> upstream/main

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(electronRoot, '../..');
const REQUIRED_NATIVE_MODULES = ['pty.node', 'sherpa-onnx.node'];

export const linuxAppImageArchSuffix = (architecture) => (
  architecture === 'x64' ? 'x86_64' : 'arm64'
);

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

export const assertElfArchitecture = (filePath, expectedArchitecture, label) => {
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${label}: ${filePath}`);
  const actual = readElfArchitecture(filePath);
  if (actual !== expectedArchitecture) {
    throw new Error(`${label} architecture mismatch: expected ${expectedArchitecture}, got ${actual} (${filePath})`);
  }
};

const collectFiles = (root, predicate) => {
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile() && predicate(entry.name, fullPath)) matches.push(fullPath);
    }
  };
  visit(root);
  return matches;
};

<<<<<<< HEAD
const ONNX_ADDON_TARGET = /(?:^|\/)bin\/napi-v\d+\/([^/]+)\/([^/]+)\/onnxruntime_binding\.node$/;
const PI_NATIVES_ADDON_TARGET = /(?:^|\/)@oh-my-pi\/pi-natives-([^-]+)-([^/]+)\//;

// Launchers resolve `Icon=ohpichamber` through the hicolor theme, which only
// reads `<size>/apps/` directories it declares: `scalable` and square sizes up
// to 512. A file one level up, or at 1024x1024, is never found (#4766, #2934).
||||||| bc50ba56aa
// Launchers resolve `Icon=openchamber` through the hicolor theme, which only
// reads `<size>/apps/` directories it declares: `scalable` and square sizes up
// to 512. A file one level up, or at 1024x1024, is never found (#4766, #2934).
=======
>>>>>>> upstream/main
const isHicolorAppsDirectory = (sizeName) => {
  if (sizeName === 'scalable') return true;
  const match = /^(\d+)x\1$/.exec(sizeName);
  return match !== null && Number(match[1]) <= 512;
};

const assertThemeIcon = (root) => {
  const hicolorRoot = path.join(root, 'usr', 'share', 'icons', 'hicolor');
  const sizeNames = fs.existsSync(hicolorRoot) ? fs.readdirSync(hicolorRoot) : [];
  const themeIcon = sizeNames.filter(isHicolorAppsDirectory).some((sizeName) => (
    ['ohpichamber.png', 'ohpichamber.svg'].some((fileName) => (
      fs.existsSync(path.join(hicolorRoot, sizeName, 'apps', fileName))
    ))
  ));
  if (!themeIcon) throw new Error('Missing theme icon: no ohpichamber icon under usr/share/icons/hicolor/<size>/apps');
  if (!fs.existsSync(path.join(root, '.DirIcon'))) throw new Error('Missing AppImage icon: .DirIcon does not resolve');
};

<<<<<<< HEAD
||||||| bc50ba56aa
const defaultCliVersion = (binaryPath) => {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
  });
  if (result.status !== 0) throw new Error(`Failed to run packaged OpenCode CLI: ${binaryPath}`);
  return parseOpenCodeCliVersion(result.stdout);
};

=======
const defaultServerCheck = ({ root, targetArchitecture, expectedOpenCodeVersion }) => verifyOpenCodeServer(
  path.join(root, 'resources', 'opencode-server'),
  { platform: 'linux', arch: targetArchitecture, version: expectedOpenCodeVersion, runtime: process.execPath },
);

>>>>>>> upstream/main
export const verifyExtractedPayload = ({
  root,
  targetArchitecture,
<<<<<<< HEAD
  runBunVersion,
||||||| bc50ba56aa
  expectedOpenCodeVersion,
  runCliVersion = defaultCliVersion,
=======
  expectedOpenCodeVersion,
  checkOpenCodeServer = defaultServerCheck,
>>>>>>> upstream/main
}) => {
  const desktopPath = path.join(root, 'ohpichamber.desktop');
  if (!fs.existsSync(desktopPath)) throw new Error(`Missing desktop entry: ${desktopPath}`);
  const desktop = fs.readFileSync(desktopPath, 'utf8');
  for (const entry of ['Name=OhPiChamber', 'Icon=ohpichamber', 'StartupWMClass=ohpichamber']) {
    if (!desktop.split(/\r?\n/).includes(entry)) throw new Error(`Desktop identity mismatch: missing ${entry}`);
  }
  if (!/^Exec=AppRun(?:\s|$)/m.test(desktop)) throw new Error('Desktop identity mismatch: expected AppImage AppRun entrypoint');
  assertThemeIcon(root);

<<<<<<< HEAD
  assertElfArchitecture(path.join(root, 'ohpichamber'), targetArchitecture, 'Electron executable');
  const agentRoot = path.join(root, 'resources', 'agent-runtime');
  assertElfArchitecture(path.join(agentRoot, 'bun'), targetArchitecture, 'Bun executable');
  const agent = verifyAgentPayload(agentRoot, { platform: 'linux', architecture: targetArchitecture, runBunVersion });
  const manifest = readJson(path.join(agentRoot, 'manifest.json'));
  const agentNativeModules = manifest.files.filter(item => item.path.endsWith('.node'));
  if (!agentNativeModules.length) throw new Error('Agent native payload is empty');
  for (const item of agentNativeModules) {
    // ONNX ships one addon per Native ABI, platform, and architecture, and the
    // runtime loads only the selected target's binding. Enforce ELF architecture
    // for that binding; skip the copies this host cannot execute.
    const onnxTarget = ONNX_ADDON_TARGET.exec(item.path);
    if (onnxTarget && (onnxTarget[1] !== 'linux' || onnxTarget[2] !== targetArchitecture)) continue;
    assertElfArchitecture(path.join(agentRoot, item.path), targetArchitecture, 'Agent native module');
  }
||||||| bc50ba56aa
  assertElfArchitecture(path.join(root, 'openchamber'), targetArchitecture, 'Electron executable');
  const cliPath = path.join(root, 'resources', 'opencode-cli', 'opencode');
  assertElfArchitecture(cliPath, targetArchitecture, 'OpenCode CLI');
  const actualVersion = runCliVersion(cliPath);
  if (actualVersion !== expectedOpenCodeVersion) {
    throw new Error(`OpenCode CLI version mismatch: expected ${expectedOpenCodeVersion}, got ${actualVersion || '(empty)'}`);
  }
  assertElfArchitecture(path.join(root, 'resources', 'ripgrep', 'rg'), targetArchitecture, 'ripgrep');
=======
  assertElfArchitecture(path.join(root, 'openchamber'), targetArchitecture, 'Electron executable');
  const { version: actualVersion } = checkOpenCodeServer({ root, targetArchitecture, expectedOpenCodeVersion });
  assertElfArchitecture(path.join(root, 'resources', 'ripgrep', 'rg'), targetArchitecture, 'ripgrep');
>>>>>>> upstream/main

  const unpackedModules = path.join(root, 'resources', 'app.asar.unpacked', 'node_modules');
  if (!fs.existsSync(unpackedModules)) throw new Error(`Missing unpacked native modules: ${unpackedModules}`);
  const nativeModules = collectFiles(unpackedModules, (name, fullPath) => {
    if (!name.endsWith('.node')) return false;
    const normalizedPath = fullPath.split(path.sep).join('/');
    const piNativesTarget = PI_NATIVES_ADDON_TARGET.exec(normalizedPath);
    if (piNativesTarget && (piNativesTarget[1] !== 'linux' || piNativesTarget[2] !== targetArchitecture)) {
      return false;
    }
    if (!normalizedPath.includes('/prebuilds/')) return true;
    return normalizedPath.includes(`/prebuilds/linux-${targetArchitecture}/`);
  });
  for (const requiredName of REQUIRED_NATIVE_MODULES) {
    if (!nativeModules.some((modulePath) => path.basename(modulePath) === requiredName)) {
      throw new Error(`Missing packaged native module: ${requiredName}`);
    }
  }
  for (const modulePath of nativeModules) {
    const normalizedPath = modulePath.split(path.sep).join('/');
    const onnxTarget = ONNX_ADDON_TARGET.exec(normalizedPath);
    if (onnxTarget && (onnxTarget[1] !== 'linux' || onnxTarget[2] !== targetArchitecture)) continue;
    const piNativesTarget = PI_NATIVES_ADDON_TARGET.exec(normalizedPath);
    if (piNativesTarget && (piNativesTarget[1] !== 'linux' || piNativesTarget[2] !== targetArchitecture)) continue;
    assertElfArchitecture(modulePath, targetArchitecture, 'Native module');
  }
  return { nativeModuleCount: nativeModules.length, ...agent };
};

const findAppImage = (version, architecture) => {
  const suffix = linuxAppImageArchSuffix(architecture);
  const expected = path.join(electronRoot, 'dist', `OhPiChamber-${version}-linux-${suffix}.AppImage`);
  if (!fs.existsSync(expected)) throw new Error(`Linux AppImage not found: ${expected}`);
  return expected;
};

const extractAppImage = (appImagePath, destination) => {
  fs.chmodSync(appImagePath, fs.statSync(appImagePath).mode | 0o100);
  const result = spawnSync(appImagePath, ['--appimage-extract'], {
    cwd: destination,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to extract AppImage: ${appImagePath}\n${(result.stderr || '').trim()}`);
  }
  return path.join(destination, 'squashfs-root');
};

const main = () => {
  const rootPackage = readJson(path.join(workspaceRoot, 'package.json'));
  const target = normalizeTargetArchitecture(process.env.OPENCHAMBER_TARGET_ARCH || process.arch).node;
  const appImagePath = process.argv[2] ? path.resolve(process.argv[2]) : findAppImage(rootPackage.version, target);
  assertElfArchitecture(appImagePath, target, 'AppImage');

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpichamber-appimage-'));
  try {
    const result = verifyExtractedPayload({
      root: extractAppImage(appImagePath, temporaryDirectory),
      targetArchitecture: target,
<<<<<<< HEAD
||||||| bc50ba56aa
      expectedOpenCodeVersion: readPinnedOpenCodeCliVersion(),
=======
      expectedOpenCodeVersion: readPinnedOpenCodeServerVersion(),
>>>>>>> upstream/main
    });
    console.log(`[electron] verified Linux ${target} AppImage: ${appImagePath}`);
<<<<<<< HEAD
    console.log(`[electron] verified Bun ${result.bunVersion}, ${result.packageCount} Agent packages and ${result.nativeModuleCount} Host native modules`);
||||||| bc50ba56aa
    console.log(`[electron] verified OpenCode CLI ${result.openCodeVersion} and ${result.nativeModuleCount} native modules`);
=======
    console.log(`[electron] verified OpenCode server ${result.openCodeVersion} and ${result.nativeModuleCount} native modules`);
>>>>>>> upstream/main
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
