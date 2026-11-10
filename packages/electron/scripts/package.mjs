import { canaryBuildConfig } from './canary-build-config.mjs';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
<<<<<<< HEAD
import { resolveTargetArchitecture } from './target-architecture.mjs';

const addArgIfMissing = (builderArgs, prefix, fullArg) => {
  if (!builderArgs.some((arg) => arg.startsWith(prefix))) {
    builderArgs.push(fullArg);
=======
import { canaryBuildConfig } from './canary-build-config.mjs';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const env = { ...process.env };
const builderArgs = process.argv.slice(2);

if (env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary') {
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).build;
  const configPath = path.join(packageDir, '.cache', 'canary-builder-config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(canaryBuildConfig(releaseConfig), null, 2)}\n`);
  builderArgs.unshift('--config', configPath);
  console.log('[electron] building Canary: the release app with the Canary icons');
}
const targetArchitecture = resolveTargetArchitecture({ environment: env, builderArgs });

if (process.platform === 'win32' && !env.CSC_LINK && !env.WINDOWS_CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('[electron] Windows code signing disabled; building unsigned installer.');
}

const bunBinaryCandidates = [
  process.env.npm_execpath,
  process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun') : null,
  process.platform === 'win32' ? 'bun.exe' : 'bun',
].filter(Boolean);

const bunBinary = bunBinaryCandidates.find((candidate) => {
  if (path.basename(candidate).toLowerCase().startsWith('bun')) {
    return candidate === 'bun' || candidate === 'bun.exe' || fs.existsSync(candidate);
>>>>>>> bc50ba56a
  }
};

export const configurePackageBuild = ({
  env: inputEnv = process.env,
  builderArgs: inputArgs = process.argv.slice(2),
  platform = process.platform,
} = {}) => {
  const env = { ...inputEnv };
  const builderArgs = [...inputArgs];

  if (env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary') {
    const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const releaseConfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).build;
    const configPath = path.join(packageDir, '.cache', 'canary-builder-config.json');
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify(canaryBuildConfig(releaseConfig), null, 2)}\n`);
    builderArgs.unshift('--config', configPath);
    console.log('[electron] building Canary: the release app with the Canary icons');
  }

  if (!env.CSC_LINK && env.WINDOWS_CSC_LINK) env.CSC_LINK = env.WINDOWS_CSC_LINK;
  if (!env.CSC_KEY_PASSWORD && env.WINDOWS_CSC_KEY_PASSWORD) env.CSC_KEY_PASSWORD = env.WINDOWS_CSC_KEY_PASSWORD;

  const isWindows = platform === 'win32' || builderArgs.some((arg) => (
    arg === '--win' || arg === '-w' || arg.startsWith('--win=') || arg.startsWith('-w=')
  ));
  const isMac = platform === 'darwin' || builderArgs.some((arg) => (
    arg === '--mac' || arg === '-m' || arg.startsWith('--mac=') || arg.startsWith('-m=')
  ));
  const isLinux = platform === 'linux' || builderArgs.some((arg) => (
    arg === '--linux' || arg === '-l' || arg.startsWith('--linux=') || arg.startsWith('-l=')
  ));

  const hasWindowsSigning = Boolean(env.CSC_LINK && env.CSC_KEY_PASSWORD);
  const hasMacSigning = Boolean(env.CSC_LINK || env.APPLE_CERTIFICATE || env.CSC_NAME);
  const hasAppleNotarization = Boolean(
    (env.APPLE_ID && (env.APPLE_APP_SPECIFIC_PASSWORD || env.APPLE_PASSWORD))
    || (env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER),
  );

  if (env.OPENCHAMBER_REQUIRE_WINDOWS_SIGNING === '1') {
    if (!hasWindowsSigning) {
      throw new Error(
        '[electron] Windows release signing is required, but signing material is missing. '
        + 'Set the WINDOWS_CSC_LINK (base64 PFX) and WINDOWS_CSC_KEY_PASSWORD repository secrets; '
        + 'the release job maps them to CSC_LINK and CSC_KEY_PASSWORD.',
      );
    }
    addArgIfMissing(builderArgs, '--config.win.verifyUpdateCodeSignature=', '--config.win.verifyUpdateCodeSignature=true');
  } else if (isWindows) {
    if (hasWindowsSigning) {
      addArgIfMissing(builderArgs, '--config.win.verifyUpdateCodeSignature=', '--config.win.verifyUpdateCodeSignature=true');
    } else {
      env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
      addArgIfMissing(builderArgs, '--config.win.verifyUpdateCodeSignature=', '--config.win.verifyUpdateCodeSignature=false');
    }
  }

  if (isMac) {
    if (hasMacSigning && hasAppleNotarization) {
      addArgIfMissing(builderArgs, '--config.mac.notarize=', '--config.mac.notarize=true');
      addArgIfMissing(builderArgs, '--config.dmg.sign=', '--config.dmg.sign=true');
    } else {
      if (!hasMacSigning) {
        env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
      }
      addArgIfMissing(builderArgs, '--config.mac.notarize=', '--config.mac.notarize=false');
      addArgIfMissing(builderArgs, '--config.dmg.sign=', '--config.dmg.sign=false');
    }
  }

  if (isLinux) {
    if (!env.CSC_LINK) {
      env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
    }
    if (platform === 'linux' && !builderArgs.some((arg) => (
      arg === '--x64' || arg === '--arm64' || arg === '--arch' || arg.startsWith('--arch=')
    ))) {
      const targetArchitecture = resolveTargetArchitecture({ platform, environment: env, builderArgs });
      builderArgs.push(`--${targetArchitecture.electronBuilder}`);
    }
  }
  if (!builderArgs.some((arg) => (
    arg === '--publish' || arg.startsWith('--publish=') || arg === '-p' || arg.startsWith('-p=')
  ))) {
    builderArgs.push('--publish=never');
  }


  return {
    env,
    builderArgs,
    isWindows,
    isMac,
    isLinux,
    hasWindowsSigning,
    hasMacSigning,
    hasAppleNotarization,
  };
};

const run = () => {
  let configured;
  try {
    configured = configurePackageBuild();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  const { env, builderArgs, isWindows, isMac, hasWindowsSigning, hasMacSigning, hasAppleNotarization } = configured;

  if (env.OPENCHAMBER_REQUIRE_WINDOWS_SIGNING === '1' || hasWindowsSigning) {
    console.log('[electron] Windows release signing enabled; packaging a signed installer.');
  } else if (isWindows) {
    console.log('[electron] Windows code signing disabled; building unsigned installer.');
  }

  if (isMac) {
    if (hasMacSigning && hasAppleNotarization) {
      console.log('[electron] macOS release signing and notarization enabled; packaging a signed bundle.');
    } else {
      console.log('[electron] macOS code signing/notarization disabled; building unsigned bundle.');
    }
  }

  const bunBinaryCandidates = [
    process.env.npm_execpath,
    process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun') : null,
    process.platform === 'win32' ? 'bun.exe' : 'bun',
  ].filter(Boolean);

  const bunBinary = bunBinaryCandidates.find((candidate) => {
    if (path.basename(candidate).toLowerCase().startsWith('bun')) {
      return candidate === 'bun' || candidate === 'bun.exe' || fs.existsSync(candidate);
    }
    return false;
  }) || (process.platform === 'win32' ? 'bun.exe' : 'bun');

  const child = spawn(bunBinary, ['x', 'electron-builder', ...builderArgs], {
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error('[electron] failed to start electron-builder:', error);
    process.exit(1);
  });
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
