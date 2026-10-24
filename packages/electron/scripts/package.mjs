import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const env = { ...process.env };
const builderArgs = process.argv.slice(2);
const targetArchitecture = resolveTargetArchitecture({ environment: env, builderArgs });

// Release builds must be signed. The Windows release job sets
// OPENCHAMBER_REQUIRE_WINDOWS_SIGNING=1 and maps the WINDOWS_CSC_LINK /
// WINDOWS_CSC_KEY_PASSWORD repository secrets to electron-builder's
// CSC_LINK / CSC_KEY_PASSWORD. Local and smoke builds leave the flag unset
// and may stay unsigned.
if (!env.CSC_LINK && env.WINDOWS_CSC_LINK) env.CSC_LINK = env.WINDOWS_CSC_LINK;
if (!env.CSC_KEY_PASSWORD && env.WINDOWS_CSC_KEY_PASSWORD) env.CSC_KEY_PASSWORD = env.WINDOWS_CSC_KEY_PASSWORD;

if (env.OPENCHAMBER_REQUIRE_WINDOWS_SIGNING === '1') {
  if (!env.CSC_LINK || !env.CSC_KEY_PASSWORD) {
    console.error(
      '[electron] Windows release signing is required, but signing material is missing. '
      + 'Set the WINDOWS_CSC_LINK (base64 PFX) and WINDOWS_CSC_KEY_PASSWORD repository secrets; '
      + 'the release job maps them to CSC_LINK and CSC_KEY_PASSWORD.',
    );
    process.exit(1);
  }
  console.log('[electron] Windows release signing enabled; packaging a signed installer.');
} else if ((process.platform === 'win32' || builderArgs.includes('--win')) && !env.CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  // verifyUpdateCodeSignature defaults to true for signed releases. An unsigned
  // local or smoke build has no certificate, so electron-builder cannot derive
  // the publisher name it would record in app-update.yml; keep the previous
  // unsigned behavior for this build only.
  builderArgs.push('--config.win.verifyUpdateCodeSignature=false');
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
  }
  return false;
}) || (process.platform === 'win32' ? 'bun.exe' : 'bun');

if (process.platform === 'linux' && !builderArgs.some((argument) => (
  argument === '--x64' || argument === '--arm64' || argument === '--arch' || argument.startsWith('--arch=')
))) {
  builderArgs.push(`--${targetArchitecture.electronBuilder}`);
}

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
