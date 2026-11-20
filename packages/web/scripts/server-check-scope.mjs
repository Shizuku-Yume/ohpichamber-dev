import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const legacy = JSON.parse(fs.readFileSync(new URL('./fork-owned-server-untyped.json', import.meta.url), 'utf8'));
const webRoot = fileURLToPath(new URL('../', import.meta.url));

export function writeServerCheckProjects(root, files, legacyFiles = legacy.files.map((entry) => entry.path)) {
  const legacyPaths = new Set(legacyFiles.map((file) => path.resolve(root, file)));
  const carried = files.filter((file) => legacyPaths.has(path.resolve(file)));
  const strict = files.filter((file) => !legacyPaths.has(path.resolve(file)));
  if (!carried.length) return { strictProject: path.join(root, 'tsconfig.server-check.json'), legacyProject: null };
  const directory = path.join(root, 'build/server-check');
  fs.mkdirSync(directory, { recursive: true });
  const legacyProject = path.join(directory, 'legacy.json');
  const strictProject = path.join(directory, 'strict.json');
  const declarations = ['server/**/*.d.ts', 'bin/**/*.d.ts'].map((pattern) => path.join(root, pattern).split(path.sep).join('/'));
  fs.writeFileSync(legacyProject, JSON.stringify({
    extends: path.join(root, 'tsconfig.server-check.json'),
    compilerOptions: {
      noEmit: false, noCheck: true, composite: true, declaration: true,
      emitDeclarationOnly: true, allowJs: false, rootDir: root,
      outDir: path.join(directory, 'declarations'),
      tsBuildInfoFile: path.join(directory, 'legacy.tsbuildinfo'),
    },
    files: carried,
    include: declarations,
  }, null, 2));
  fs.writeFileSync(strictProject, JSON.stringify({
    extends: path.join(root, 'tsconfig.server-check.json'),
    compilerOptions: { allowJs: true, checkJs: false },
    files: strict,
    include: declarations,
    references: [{ path: legacyProject }],
  }, null, 2));
  return { strictProject, legacyProject };
}

export const forkServerTypeScript = new Set(legacy.files.map((entry) => path.join(webRoot, entry.path)));
