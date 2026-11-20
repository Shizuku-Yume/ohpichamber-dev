import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_EXTENSIONS = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
  .split(';')
  .map((extension) => extension.trim().toLowerCase())
  .filter(Boolean)
  .map((extension) => extension.startsWith('.') ? extension : `.${extension}`);

export function searchPathFor(command: string) {
  const extensions = process.platform === 'win32' ? WINDOWS_EXTENSIONS : [''];
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      try {
        if (!fs.statSync(candidate).isFile()) continue;
        if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  }
  return null;
}
