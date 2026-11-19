import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;

const within = (root, relative) => {
  const resolved = path.resolve(root, relative);
  if (!comparable(resolved).startsWith(comparable(`${path.resolve(root)}${path.sep}`))) {
    throw new Error(`Agent dependency escapes resource directory: ${relative}`);
  }
  return resolved;
};

const realTarget = (root, target) => {
  const resolved = fs.realpathSync(target);
  const resolvedRoot = fs.realpathSync(root);
  within(resolvedRoot, path.relative(resolvedRoot, resolved));
  return resolved;
};

export function verifyWindowsAgentLinks(root, manifest, { create = false } = {}) {
  for (const item of manifest.junctions ?? []) {
    const link = within(root, item.path);
    const target = within(root, item.target);
    const resolvedTarget = realTarget(root, target);
    if (!fs.statSync(target).isDirectory()) {
      throw new Error(`Agent dependency target mismatch: ${item.path}`);
    }
    let existing;
    try { existing = fs.lstatSync(link); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (existing) {
      if (!existing.isSymbolicLink() || comparable(fs.realpathSync(link)) !== comparable(resolvedTarget)) {
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
    const resolvedTarget = realTarget(root, target);
    if (!fs.lstatSync(link).isSymbolicLink() || comparable(fs.realpathSync(path.resolve(path.dirname(link), fs.readlinkSync(link)))) !== comparable(resolvedTarget)) {
      throw new Error(`Agent dependency link mismatch: ${item.path}`);
    }
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
