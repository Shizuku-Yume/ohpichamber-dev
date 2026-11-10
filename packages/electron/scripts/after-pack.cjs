const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Arch } = require('electron-builder');
const { setExecutableUuid } = require('./macos-executable-uuid.cjs');
const { verifyPackagedAppContents } = require('./packaged-app-contents.cjs');

<<<<<<< HEAD
module.exports = async (context) => {
=======
module.exports = (context) => {
>>>>>>> bc50ba56a
  const { appInfo } = context.packager;
  const contentsPath = path.join(context.appOutDir, `${appInfo.productFilename}.app`, 'Contents');
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(contentsPath, 'Resources')
    : path.join(context.appOutDir, 'resources');
<<<<<<< HEAD

  const { verifyAgentPayload } = await import('./verify-agent-runtime.mjs');
  const architecture = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch];
  verifyAgentPayload(path.join(resourcesPath, 'agent-runtime'), {
    platform: context.electronPlatformName,
    architecture,
  });
=======
>>>>>>> bc50ba56a
  verifyPackagedAppContents(resourcesPath, { platform: context.electronPlatformName, arch: Arch[context.arch] });
  if (context.electronPlatformName !== 'darwin') return;

  const executablePath = path.join(contentsPath, 'MacOS', appInfo.productFilename);
  setExecutableUuid(executablePath, appInfo.id);
  // The new UUID breaks Electron's ad-hoc signature, and arm64 kills an
  // executable with a broken one. Re-sign ad hoc so builds that skip signing
  // still launch; electron-builder's own signing replaces this. Only arm64:
  // Electron's x64 framework carries no ad-hoc signature, so codesign refuses
  // the executable there, and x64 runs an unsigned one anyway.
  if (context.arch === Arch.arm64) {
    execFileSync('codesign', ['--force', '--sign', '-', executablePath], { stdio: 'inherit' });
  }

  // The compiled catalog sits with the other icons of the build's channel.
  const iconsDir = process.env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary' ? 'icons-canary' : 'icons';
  const sourceAssetsPath = path.join(__dirname, '..', 'resources', iconsDir, 'Assets.car');

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
