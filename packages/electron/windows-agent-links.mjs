import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const within = (root, relative) => {
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`Agent dependency escapes resource directory: ${relative}`);
  }
  return resolved;
};

export function verifyWindowsAgentLinks(root, manifest, { create = false } = {}) {
  for (const item of manifest.junctions ?? []) {
    const link = within(root, item.path);
    const target = within(root, item.target);
    if (fs.realpathSync(target) !== target || !fs.statSync(target).isDirectory()) {
      throw new Error(`Agent dependency target mismatch: ${item.path}`);
    }
    let existing;
    try { existing = fs.lstatSync(link); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
      if (!existing.isSymbolicLink() || fs.realpathSync(link) !== target) {
        throw new Error(`Agent dependency link mismatch: ${item.path}`);
      }
    } else if (create) {
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(target, link, 'junction');
    }
  }
}

// NSIS ships physical files only; directory junctions are created at the installed path.
export function prepareWindowsAgentLinks(root) {
  const manifestPath = path.join(root, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.platform !== 'win32') return;
  const files = [];
  const junctions = [];
  for (const item of manifest.files) {
    if (item.link === undefined) {
      files.push(item);
      continue;
    }
    const link = within(root, item.path);
    const target = within(root, path.relative(root, path.resolve(path.dirname(link), item.link)));
    if (!fs.lstatSync(link).isSymbolicLink() || path.resolve(path.dirname(link), fs.readlinkSync(link)) !== target) {
      throw new Error(`Agent dependency link mismatch: ${item.path}`);
    }
    if (fs.realpathSync(target) !== target) throw new Error(`Agent dependency target mismatch: ${item.path}`);
    const directory = fs.statSync(target).isDirectory();
    fs.unlinkSync(link);
    if (directory) {
      junctions.push({ path: item.path, target: path.relative(root, target).split(path.sep).join('/') });
    } else {
      fs.copyFileSync(target, link);
      files.push({ path: item.path, sha256: createHash('sha256').update(fs.readFileSync(link)).digest('hex') });
    }
  }
  manifest.files = files;
  manifest.junctions = [...(manifest.junctions ?? []), ...junctions];
  verifyWindowsAgentLinks(root, manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
