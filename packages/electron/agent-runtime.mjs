import fs from 'node:fs';
import path from 'node:path';

// Bun must read physical files, never Electron's virtual ASAR filesystem.
export function resolveAgentRuntime(resourcesDirectory, platform = process.platform) {
  const root = path.join(resourcesDirectory, 'agent-runtime');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.architecture !== process.arch) {
    throw new Error('Packaged Agent runtime does not match this platform and architecture');
  }
  const bunPath = path.join(root, platform === 'win32' ? 'bun.exe' : 'bun');
  const entrypoint = path.join(root, 'service', 'dist', 'index.js');
  for (const file of [bunPath, entrypoint, path.join(root, 'service', 'dist', 'worker', 'index.js')]) {
    if (!fs.statSync(file).isFile()) throw new Error(`Missing Agent runtime file: ${file}`);
  }
  return { bunPath, entrypoint };
}
