import type * as nodeOs from 'node:os';
import type * as nodePath from 'node:path';
import { findExecutableOnPath } from '../tunnels/executable-search.js';
import { isExecutable } from './executable.js';
import { pathLooksUserConfigured, mergePathValues } from './path-utils.js';
import { isString } from '../shared/guards.js';

export interface ServerUtilsDependencies {
  os: Pick<typeof nodeOs, 'homedir'>;
  path: Pick<typeof nodePath, 'delimiter'>;
  process: Pick<NodeJS.Process, 'env'>;
  getLoginShellPath?: () => string;
}

export const createServerUtilsRuntime = (dependencies: ServerUtilsDependencies) => {
  const {
    os,
    path,
    process,
    getLoginShellPath = () => process.env.PATH || '',
  } = dependencies;

  const getEnvValue = (name: string): string => {
    const env = process.env || {};
    const direct = env[name];
    if (isString(direct)) return direct;
    const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const matched = key ? env[key] : undefined;
    return isString(matched) ? matched : '';
  };

  const buildAugmentedPath = (): string => {
    const currentPath = getEnvValue('PATH');
    const loginShellPath = getLoginShellPath();
    const home = os.homedir();
    const currentPathLooksUserConfigured = pathLooksUserConfigured(currentPath, home, path.delimiter);
    const primaryPath = currentPathLooksUserConfigured ? currentPath : loginShellPath;
    const fallbackPath = currentPathLooksUserConfigured ? loginShellPath : currentPath;

    return mergePathValues(primaryPath, fallbackPath, path.delimiter);
  };

  const searchPathFor = (binaryName: string, searchPath = getEnvValue('PATH')) =>
    findExecutableOnPath(binaryName, { env: { ...process.env, PATH: searchPath } });

  return {
    buildAugmentedPath,
    searchPathFor,
    isExecutable,
  };
};
