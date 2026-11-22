import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(packageDirectory, '../..');
const outputDirectory = join(packageDirectory, 'node_modules/.cache/omp-types');
const rootSchema = z.object({ overrides: z.record(z.string(), z.string()) });
const exportSchema = z.union([
  z.string().transform(types => ({ types })),
  z.object({ types: z.string().optional(), import: z.string().optional() }),
]);
const packageSchema = z.object({
  name: z.string(), types: z.string().optional(),
  exports: z.record(z.string(), exportSchema).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
});
const root = rootSchema.parse(JSON.parse(await readFile(join(repository, 'package.json'), 'utf8')));
const packageNames = Object.entries(root.overrides)
  .filter(([name, input]) => name.startsWith('@oh-my-pi/') && input.endsWith('.tgz'))
  .map(([name]) => name);
const sdkEntry = Bun.resolveSync('@oh-my-pi/pi-coding-agent/sdk', packageDirectory);
const installations = [];
const resolvedNames = new Set();
const pending = [{ name: '@oh-my-pi/pi-coding-agent', entry: sdkEntry }];
for (const { name, entry } of pending) {
  if (resolvedNames.has(name)) continue;
  let directory = dirname(entry);
  while (!await Bun.file(join(directory, 'package.json')).exists()) directory = dirname(directory);
  const manifest = packageSchema.parse(JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')));
  if (manifest.name !== name) throw new Error('SDK declaration package identity mismatch');
  installations.push({ name, directory, manifest });
  resolvedNames.add(name);
  for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    if (packageNames.includes(dependency) && !resolvedNames.has(dependency)) {
      pending.push({ name: dependency, entry: Bun.resolveSync(dependency, directory) });
    }
  }
}
if (installations.length !== packageNames.length) throw new Error('SDK declaration dependency owners are incomplete');
const sourceRoot = repository;

/** Every declaration-bearing source file of one package, minus its tests and test fixtures. */
function packageSources(directory) {
  const sources = [];
  const sourceDirectory = join(directory, 'src');
  // Native add-on packages ship no TypeScript sources.
  if (!existsSync(sourceDirectory)) return sources;
  const pattern = new Bun.Glob('**/*.{ts,tsx}');
  for (const entry of pattern.scanSync({ cwd: sourceDirectory })) {
    if (/\.test\.tsx?$/.test(entry) || entry.split('/').includes('test')) continue;
    sources.push(join(sourceDirectory, entry));
  }
  return sources;
}

/** A paths entry TS 7 accepts: relative to the config that declares it. */
function configPath(from, to) {
  const path = relative(from, to);
  return path.startsWith('.') ? path : `./${path}`;
}

const roots = installations.flatMap(({ directory }) => packageSources(directory));
function sourceType(entry) {
  const candidates = [entry.import, entry.types];
  return candidates.find(path => path?.endsWith('.ts') && !path.endsWith('.d.ts'));
}
const sourcePaths = {};
for (const { name, directory, manifest } of installations) {
  const exports = manifest.exports ?? { '.': { types: manifest.types } };
  for (const [key, entry] of Object.entries(exports)) {
    const source = sourceType(entry);
    if (!source) continue;
    sourcePaths[key === '.' ? name : `${name}/${key.slice(2)}`] = [join(directory, source)];
  }
}
const emitPaths = Object.fromEntries(
  Object.entries(sourcePaths).map(([name, [source]]) => [name, [configPath(outputDirectory, source)]]),
);
await mkdir(outputDirectory, { recursive: true });
const emitConfig = join(outputDirectory, 'emit.json');
await writeFile(emitConfig, `${JSON.stringify({
  compilerOptions: {
    target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler',
    noCheck: true, declaration: true, emitDeclarationOnly: true,
    allowArbitraryExtensions: true, resolveJsonModule: true, skipLibCheck: true,
    rootDir: sourceRoot, outDir: outputDirectory, paths: emitPaths,
  },
  files: roots,
}, null, 2)}\n`);
const emit = Bun.spawnSync({
  cmd: ['node', join(repository, 'node_modules/typescript/bin/tsc'), '-p', emitConfig, '--pretty', 'false'],
  cwd: repository, stdout: 'pipe', stderr: 'pipe',
});
const emitOutput = `${emit.stdout.toString()}${emit.stderr.toString()}`;
// A no-check declaration emit still reports TS2883 for the vendored UI components
// whose JSX return type cannot be named in a .d.ts without importing React. The
// declarations are emitted and the agent service never type-checks those
// components, so that one diagnostic is tolerated; every other one fails the run.
const emitErrors = emitOutput.split('\n').filter(line => /error TS\d+/.test(line));
const fatal = emitErrors.filter(line => !/error TS2883:/.test(line) || !line.includes('/node_modules/'));
if (emit.exitCode !== 0 && fatal.length > 0) {
  console.error(emitOutput);
  throw new Error('SDK declaration emit failed');
}
const paths = {};
for (const { name, directory, manifest } of installations) {
  const exports = manifest.exports ?? { '.': { types: manifest.types } };
  for (const [key, entry] of Object.entries(exports)) {
    const source = sourceType(entry);
    if (!source) continue;
    const moduleName = key === '.' ? name : `${name}/${key.slice(2)}`;
    const emittedPath = join(outputDirectory, relative(sourceRoot, directory), source.replace(/\.ts$/, '.d.ts'));
    paths[moduleName] = [configPath(outputDirectory, emittedPath)];
  }
}
await writeFile(join(outputDirectory, 'tsconfig.json'), `${JSON.stringify({
  extends: relative(outputDirectory, join(packageDirectory, 'tsconfig.json')),
  compilerOptions: { paths },
  include: [relative(outputDirectory, join(packageDirectory, 'src'))],
  exclude: [relative(outputDirectory, join(packageDirectory, 'src/**/*.test.ts'))],
}, null, 2)}\n`);
console.log(`Prepared source-derived declarations for ${installations.length} OMP packages`);
