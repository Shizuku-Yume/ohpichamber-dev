const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Arch } = require('electron-builder');
const { setExecutableUuid } = require('./macos-executable-uuid.cjs');
const { verifyPackagedAppContents } = require('./packaged-app-contents.cjs');

module.exports = async (context) => {
  const { appInfo } = context.packager;
  const contentsPath = path.join(context.appOutDir, `${appInfo.productFilename}.app`, 'Contents');
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(contentsPath, 'Resources')
    : path.join(context.appOutDir, 'resources');

  const { verifyAgentPayload } = await import('./verify-agent-runtime.mjs');
  if (context.electronPlatformName === 'win32') {
    const { prepareWindowsAgentLinks } = await import('../windows-agent-links.mjs');
    prepareWindowsAgentLinks(path.join(resourcesPath, 'agent-runtime'));
  }
  const architecture = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch];
  verifyAgentPayload(path.join(resourcesPath, 'agent-runtime'), {
    platform: context.electronPlatformName,
    architecture,
  });
  verifyPackagedAppContents(resourcesPath, { platform: context.electronPlatformName, arch: Arch[context.arch] });
  if (context.electronPlatformName !== 'darwin') return;

  const executablePath = path.join(contentsPath, 'MacOS', appInfo.productFilename);
  setExecutableUuid(executablePath, appInfo.id);
  if (context.arch === Arch.arm64) {
    execFileSync('codesign', ['--force', '--sign', '-', executablePath], { stdio: 'inherit' });
  }

<<<<<<< HEAD
  // The compiled catalog sits with the other icons of the build.
  const sourceAssetsPath = path.join(__dirname, '..', 'resources', 'icons', 'Assets.car');
||||||| bc50ba56aa
  // The compiled catalog sits with the other icons of the build's channel.
  const iconsDir = process.env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary' ? 'icons-canary' : 'icons';
  const sourceAssetsPath = path.join(__dirname, '..', 'resources', iconsDir, 'Assets.car');
=======
  const iconsDir = process.env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary' ? 'icons-canary' : 'icons';
  const sourceAssetsPath = path.join(__dirname, '..', 'resources', iconsDir, 'Assets.car');
>>>>>>> upstream/main

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
