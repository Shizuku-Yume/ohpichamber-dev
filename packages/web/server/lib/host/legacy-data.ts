import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface OpenCodeDataDirectoryOptions {
  env?: NodeJS.ProcessEnv | undefined;
  homeDirectory?: string | undefined;
}

export interface LegacyOpenCodeDataOptions extends OpenCodeDataDirectoryOptions {
  existsSync?: ((target: string) => boolean) | undefined;
}

export const openCodeDataDirectory = ({
  env = process.env,
  homeDirectory = os.homedir(),
}: OpenCodeDataDirectoryOptions = {}): string | null => {
  const dataHome = env.XDG_DATA_HOME || (homeDirectory ? path.join(homeDirectory, '.local', 'share') : null);
  return dataHome ? path.join(dataHome, 'opencode') : null;
};

export const hasLegacyOpenCodeData = ({
  existsSync = fs.existsSync,
  ...options
}: LegacyOpenCodeDataOptions = {}): boolean => {
  const directory = openCodeDataDirectory(options);
  return directory !== null && existsSync(directory);
};
