import { findExecutableOnPath } from '../tunnels/executable-search.js';
import { isExecutable } from './executable.js';
import { pathLooksUserConfigured, mergePathValues } from './path-utils.js';

export const createServerUtilsRuntime = (dependencies) => {
  const {
    os,
    path,
    process,
    getLoginShellPath = () => process.env.PATH || '',
  } = dependencies;

  const getEnvValue = (name) => {
    const env = process.env || {};
    if (typeof env[name] === 'string') return env[name];
    const key = Object.keys(env).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key && typeof env[key] === 'string' ? env[key] : '';
  };

  const buildAugmentedPath = () => {
    const currentPath = getEnvValue('PATH');
    const loginShellPath = getLoginShellPath();
    const home = os.homedir();
    const currentPathLooksUserConfigured = pathLooksUserConfigured(currentPath, home, path.delimiter);
    const primaryPath = currentPathLooksUserConfigured ? currentPath : loginShellPath;
    const fallbackPath = currentPathLooksUserConfigured ? loginShellPath : currentPath;

    return mergePathValues(primaryPath, fallbackPath, path.delimiter);
  };

  const searchPathFor = (binaryName, searchPath = getEnvValue('PATH')) =>
    findExecutableOnPath(binaryName, { env: { ...process.env, PATH: searchPath } });

  return {
    buildAugmentedPath,
    searchPathFor,
    isExecutable,
  };
};
