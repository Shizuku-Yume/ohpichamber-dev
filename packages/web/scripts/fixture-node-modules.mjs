import fs from 'node:fs';
import path from 'node:path';

export function linkFixtureNodeModules(source, destination) {
  if (process.platform !== 'win32') {
    fs.symlinkSync(source, destination, 'dir');
    return;
  }

  fs.mkdirSync(destination);
  const linkPackage = (from, to) => {
    if (!fs.statSync(from).isDirectory()) return;
    fs.symlinkSync(fs.realpathSync(from), to, 'junction');
  };
  for (const name of fs.readdirSync(source)) {
    if (name.startsWith('.')) continue;
    const from = path.join(source, name);
    const to = path.join(destination, name);
    if (name.startsWith('@')) {
      fs.mkdirSync(to);
      for (const pkg of fs.readdirSync(from)) {
        linkPackage(path.join(from, pkg), path.join(to, pkg));
      }
    } else {
      linkPackage(from, to);
    }
  }
}
