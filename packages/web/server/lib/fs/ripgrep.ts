<<<<<<< HEAD:packages/web/server/lib/fs/ripgrep.js
// Where the ripgrep binary comes from. Content search runs `rg`, and
// OpenChamber ships it instead of relying on one being installed:
//
// 1. A packaged desktop build stages the target architecture's binary in
//    `Resources/ripgrep` (`packages/electron/scripts/prepare-ripgrep.mjs`).
//    The one npm installs matches the build host, which is the wrong
//    architecture for a cross-built app.
// 2. The `@vscode/ripgrep` platform package, an optional dependency of
//    `ohpichamber` that npm and Bun install for the current platform:
//    web installs, the Docker image and desktop development.
// 3. `rg` on the PATH, for an install whose platform package is missing.
//
// A successful lookup is kept for the process lifetime. A failed one is not,
// so installing ripgrep later makes the next search work without a restart.
||||||| bc50ba56aa:packages/web/server/lib/fs/ripgrep.js
// Where the ripgrep binary comes from. Content search runs `rg`, and
// OpenChamber ships it instead of relying on one being installed:
//
// 1. A packaged desktop build stages the target architecture's binary in
//    `Resources/ripgrep` (`packages/electron/scripts/prepare-ripgrep.mjs`).
//    The one npm installs matches the build host, which is the wrong
//    architecture for a cross-built app.
// 2. The `@vscode/ripgrep` platform package, an optional dependency of
//    `@openchamber/web` that npm and Bun install for the current platform:
//    web installs, the Docker image and desktop development.
// 3. `rg` on the PATH, for an install whose platform package is missing.
//
// A successful lookup is kept for the process lifetime. A failed one is not,
// so installing ripgrep later makes the next search work without a restart.
=======
import type nodeFs from 'node:fs';
import type nodePath from 'node:path';

interface RipgrepResolverOptions {
  fs: Pick<typeof nodeFs, 'accessSync' | 'statSync' | 'constants'>;
  path: Pick<typeof nodePath, 'join' | 'delimiter'>;
  resourcesPath?: string | undefined;
  buildSearchPath?: () => string;
  loadPackagedBinaryPath?: () => Promise<string>;
}

const desktopProcess: NodeJS.Process & { resourcesPath?: string } = process;
>>>>>>> upstream/main:packages/web/server/lib/fs/ripgrep.ts

const BINARY_NAME = process.platform === 'win32' ? 'rg.exe' : 'rg';

const isExecutableFile = (fs: RipgrepResolverOptions['fs'], candidate: string) => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

export const createRipgrepResolver = ({
  fs,
  path,
  resourcesPath = desktopProcess.resourcesPath,
  buildSearchPath = () => process.env.PATH || '',
  loadPackagedBinaryPath = async () => (await import('@vscode/ripgrep')).rgPath,
}: RipgrepResolverOptions) => {
  let resolved: string | null = null;

  const stagedDesktopBinary = () => {
    if (!resourcesPath) return null;
    const candidate = path.join(resourcesPath, 'ripgrep', BINARY_NAME);
    return isExecutableFile(fs, candidate) ? candidate : null;
  };

  const packagedBinary = async () => {
    try {
      const candidate = await loadPackagedBinaryPath();
      return isExecutableFile(fs, candidate) ? candidate : null;
    } catch {
      return null;
    }
  };

  const binaryOnPath = () => {
    for (const dir of buildSearchPath().split(path.delimiter)) {
      if (!dir) continue;
      const candidate = path.join(dir, BINARY_NAME);
      if (isExecutableFile(fs, candidate)) return candidate;
    }
    return null;
  };

  const resolveRipgrepBinary = async () => {
    if (resolved) return resolved;
    resolved = stagedDesktopBinary() || await packagedBinary() || binaryOnPath();
    return resolved;
  };

  return { resolveRipgrepBinary };
};
