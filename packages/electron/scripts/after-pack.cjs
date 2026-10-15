const fs = require('node:fs');
const path = require('node:path');

module.exports = async (context) => {
  const resourcesPath = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const { verifyAgentPayload } = await import('./verify-agent-runtime.mjs');
  const architecture = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][context.arch];
  verifyAgentPayload(path.join(resourcesPath, 'agent-runtime'), {
    platform: context.electronPlatformName,
    architecture,
  });
  if (context.electronPlatformName !== 'darwin') return;

  const sourceAssetsPath = path.join(__dirname, '..', 'resources', 'icons', 'Assets.car');

  if (!fs.existsSync(sourceAssetsPath)) {
    throw new Error(`Missing compiled app icon asset catalog at ${sourceAssetsPath}`);
  }

  fs.copyFileSync(sourceAssetsPath, path.join(resourcesPath, 'Assets.car'));
};
