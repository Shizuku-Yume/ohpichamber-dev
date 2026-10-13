import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { z } from 'zod';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(packageDirectory, '../..');
const outputDirectory = join(packageDirectory, 'node_modules/.cache/omp-types');
const rootSchema = z.object({ overrides: z.record(z.string(), z.string()) });
const exportSchema = z.union([
  z.string().transform(types => ({ types })),
  z.object({ types: z.string().optional() }),
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
const roots = installations.flatMap(({ directory }) => ts.sys.readDirectory(join(directory, 'src'), ['.ts', '.tsx'], ['**/*.test.ts', '**/test/**'], ['**/*']));
const sourcePaths = {};
for (const { name, directory, manifest } of installations) {
  const exports = manifest.exports ?? { '.': { types: manifest.types } };
  for (const [key, entry] of Object.entries(exports)) {
    if (!entry.types?.endsWith('.ts')) continue;
    sourcePaths[key === '.' ? name : `${name}/${key.slice(2)}`] = [join(directory, entry.types)];
  }
}
const program = ts.createProgram(roots, {
  target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: repository, paths: sourcePaths,
  declaration: true, emitDeclarationOnly: true, noCheck: true,
  allowArbitraryExtensions: true, resolveJsonModule: true,
  skipLibCheck: true, rootDir: sourceRoot, outDir: outputDirectory,
});
const emitted = program.emit();
if (emitted.emitSkipped || emitted.diagnostics.length) {
  throw new Error(ts.formatDiagnosticsWithColorAndContext(emitted.diagnostics, {
    getCurrentDirectory: () => repository, getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
}
const paths = {};
for (const { name, directory, manifest } of installations) {
  const exports = manifest.exports ?? { '.': { types: manifest.types } };
  for (const [key, entry] of Object.entries(exports)) {
    if (!entry.types?.endsWith('.ts')) continue;
    const moduleName = key === '.' ? name : `${name}/${key.slice(2)}`;
    const emittedPath = join(outputDirectory, relative(sourceRoot, directory), entry.types.replace(/\.ts$/, '.d.ts'));
    paths[moduleName] = [relative(outputDirectory, emittedPath)];
  }
}
await mkdir(outputDirectory, { recursive: true });
await writeFile(join(outputDirectory, 'tsconfig.json'), `${JSON.stringify({
  extends: relative(outputDirectory, join(packageDirectory, 'tsconfig.json')),
  compilerOptions: { baseUrl: '.', paths },
  include: [relative(outputDirectory, join(packageDirectory, 'src'))],
  exclude: [relative(outputDirectory, join(packageDirectory, 'src/**/*.test.ts'))],
}, null, 2)}\n`);
console.log(`Prepared source-derived declarations for ${installations.length} OMP packages`);
