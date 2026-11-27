import { accessSync, constants, statSync } from 'node:fs';

export const isExecutable = (filePath: string): boolean => {
  try {
    const stat = statSync(filePath);
    if (!stat.isFile()) return false;
    if (process.platform !== 'win32') accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
