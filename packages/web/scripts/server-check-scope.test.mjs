import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { linkFixtureNodeModules } from './fixture-node-modules.mjs';
import { writeServerCheckProjects } from './server-check-scope.mjs';

const compiler = fileURLToPath(new URL('../../../node_modules/typescript/bin/tsc', import.meta.url));
const base = fileURLToPath(new URL('../tsconfig.server-check.json', import.meta.url));

test('only explicit legacy roots use declarations; new roots stay strict even across a legacy import cycle', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-server-check-scope-'));
  try {
    fs.mkdirSync(path.join(root, 'server'));
    linkFixtureNodeModules(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(root, 'node_modules'));
    fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    fs.writeFileSync(path.join(root, 'tsconfig.server-check.json'), JSON.stringify({ extends: base }));
    const legacy = path.join(root, 'server/legacy.ts');
    const current = path.join(root, 'server/current.ts');
    fs.writeFileSync(path.join(root, 'server/ambient.d.ts'), 'type FixtureNumber = number;');
    fs.writeFileSync(legacy, "import { value } from './current.js'; export function old(value) { return value; } export const dependency = value;");
    fs.writeFileSync(current, "import { old } from './legacy.js'; export const value = 42; export const result: number = old(value); export const invalid: number = 'bad';");
    const projects = writeServerCheckProjects(root, [legacy, current], ['server/legacy.ts']);
    const run = (...args) => spawnSync(process.execPath, [compiler, ...args], { encoding: 'utf8' });
    const built = run('-b', projects.legacyProject);
    expect(built.status, built.stdout + built.stderr).toBe(0);
    const invalid = run('-p', projects.strictProject);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stdout).toContain('TS2322');
    expect(invalid.stdout).not.toContain('TS7006');
    fs.writeFileSync(current, "import { old } from './legacy.js'; export const value = 42; export const result: FixtureNumber = old(value);");
    const valid = run('-p', projects.strictProject);
    expect(valid.status, valid.stdout + valid.stderr).toBe(0);
    const adjacent = path.join(root, 'server/legacy-neighbor.ts');
    fs.writeFileSync(adjacent, 'export function newFunction(value) { return value; }');
    const expanded = writeServerCheckProjects(root, [legacy, current, adjacent], ['server/legacy.ts']);
    const newModule = run('-p', expanded.strictProject);
    expect(newModule.status).not.toBe(0);
    expect(newModule.stdout).toContain('TS7006');
    expect(JSON.parse(fs.readFileSync(expanded.strictProject, 'utf8')).files).toEqual([current, adjacent]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

test('an empty legacy set leaves the original strict project unchanged', () => {
  expect(writeServerCheckProjects('/not-written', [], [])).toEqual({
    strictProject: path.join('/not-written', 'tsconfig.server-check.json'), legacyProject: null,
  });
});
