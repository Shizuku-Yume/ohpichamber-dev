import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(electronRoot, '../..');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const compatible = (values, actual) => !values || (!values.includes(`!${actual}`)
  && (values.every(value => value.startsWith('!')) || values.includes(actual)));

function installedDependency(name, owner) {
  // Resolve installed package directories, not runtime entrypoints. Bun treats
  // names such as "ws" as builtins (resolve.paths returns null), but those
  // names still represent real declared packages in the installed SDK closure.
  let directory = owner;
  while (true) {
    if (path.basename(directory) !== 'node_modules') {
      const candidate = path.join(directory, 'node_modules', name, 'package.json');
      if (fs.existsSync(candidate)) return fs.realpathSync(path.dirname(candidate));
    }
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

// Preserve each installed package's own dependency resolution, including multiple
// versions and cycles. All links remain relative and entirely inside the payload.
export function stageDependencyClosure(source, destination, { platform = process.platform, architecture = process.arch } = {}) {
  const seen = new Map();
  const packages = [];
  const copy = (directory, target) => {
    const real = fs.realpathSync(directory);
    if (seen.has(real)) return seen.get(real);
    const manifest = json(path.join(real, 'package.json'));
    if (!compatible(manifest.os, platform) || !compatible(manifest.cpu, architecture)) return null;
    const output = target ?? path.join(destination, 'packages', String(packages.length));
    seen.set(real, output);
    packages.push({ name: manifest.name, version: manifest.version, path: path.relative(destination, output).split(path.sep).join('/') });
    fs.cpSync(real, output, {
      filter: file => {
        const relative = path.relative(real, file).split(path.sep);
        if (relative[0] === 'node_modules') return false;
        if (manifest.name === 'onnxruntime-node' && relative[0] === 'bin' && /^napi-v\d+$/.test(relative[1] ?? '')) {
          if (relative[2] && relative[2] !== platform) return false;
          if (relative[3] && relative[3] !== architecture) return false;
        }
        return true;
      },
      recursive: true, dereference: true,
    });
    const dependencies = { ...manifest.peerDependencies, ...manifest.dependencies, ...manifest.optionalDependencies };
    for (const name of Object.keys(dependencies).sort()) {
      const optional = Object.hasOwn(manifest.optionalDependencies ?? {}, name)
        || manifest.peerDependenciesMeta?.[name]?.optional === true;
      const installed = installedDependency(name, real);
      if (!installed) {
        if (optional) continue;
        throw new Error(`Missing installed runtime dependency ${name} required by ${manifest.name}`);
      }
      const child = copy(installed);
      if (!child) {
        if (optional) continue;
        throw new Error(`Runtime dependency ${name} does not support ${platform}-${architecture}`);
      }
      const link = path.join(output, 'node_modules', name);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(path.relative(path.dirname(link), child), link, 'dir');
    }
    return output;
  };
  copy(source, path.join(destination, 'service'));
  const platformNatives = packages.find(item => item.name === `@oh-my-pi/pi-natives-${platform}-${architecture}`);
  const nativeLoader = packages.find(item => item.name === '@oh-my-pi/pi-natives');
  if (platformNatives && nativeLoader) {
    const nativeDirectory = path.join(destination, nativeLoader.path, 'native');
    fs.mkdirSync(nativeDirectory, { recursive: true });
    const platformDirectory = path.join(destination, platformNatives.path);
    for (const entry of fs.readdirSync(platformDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.node')) continue;
      const link = path.join(nativeDirectory, entry.name);
      fs.symlinkSync(path.relative(path.dirname(link), path.join(platformDirectory, entry.name)), link, 'file');
    }
  }
  return packages;

}
export function prepareAgentRuntime({ bunPath = process.execPath, output = path.join(electronRoot, 'resources', 'agent-runtime') } = {}) {
  const target = resolveTargetArchitecture({ builderArgs: process.argv.slice(2) });
  if (target.node !== process.arch) throw new Error('Agent runtime staging requires a native target host');
  const rootManifest = json(path.join(workspaceRoot, 'package.json'));
  const expectedBunVersion = rootManifest.packageManager.replace(/^bun@/, '');
  const version = spawnSync(bunPath, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (version.status !== 0 || version.stdout.trim() !== expectedBunVersion) {
    throw new Error(`Stage with pinned Bun ${expectedBunVersion}; received ${version.stdout?.trim() || version.error || 'no version'}`);
  }
  const run = (args, cwd) => {
    const result = spawnSync(bunPath, args, { cwd, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw result.error ?? new Error(`Bun ${args.join(' ')} failed`);
  };
  run(['run', 'build'], path.join(workspaceRoot, 'packages', 'agent-contract'));
  run(['run', 'build'], path.join(workspaceRoot, 'packages', 'agent-service'));
  const temporary = `${output}.staging`;
  fs.rmSync(temporary, { recursive: true, force: true });
  fs.mkdirSync(temporary, { recursive: true });
  try {
    const packages = stageDependencyClosure(path.join(workspaceRoot, 'packages', 'agent-service'), temporary);
    const native = packages.find(item => item.name === `@oh-my-pi/pi-natives-${process.platform}-${process.arch}`);
    if (!native) throw new Error('Install the pinned platform pi-natives package before staging');
    const onnx = packages.find(item => item.name === 'onnxruntime-node');
    const onnxAddon = onnx && path.join(temporary, onnx.path, 'bin', 'napi-v6', process.platform, process.arch, 'onnxruntime_binding.node');
    if (!onnxAddon || !fs.existsSync(onnxAddon)) throw new Error('Installed ONNX runtime native addon is missing');
    const binary = path.join(temporary, process.platform === 'win32' ? 'bun.exe' : 'bun');
    fs.copyFileSync(fs.realpathSync(bunPath), binary);
    fs.chmodSync(binary, 0o755);
    const files = [];
    const visit = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const file = path.join(directory, entry.name);
        const relative = path.relative(temporary, file).split(path.sep).join('/');
        if (entry.isDirectory()) visit(file);
        else if (entry.isSymbolicLink()) files.push({ path: relative, link: fs.readlinkSync(file) });
        else files.push({ path: relative, sha256: digest(file) });
      }
    };
    visit(temporary);
    fs.writeFileSync(path.join(temporary, 'manifest.json'), `${JSON.stringify({ platform: process.platform, architecture: target.node, bunVersion: expectedBunVersion, packages, files }, null, 2)}\n`);
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(temporary, output);
    return output;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(`[electron] staged Agent runtime: ${prepareAgentRuntime()}`);
}
