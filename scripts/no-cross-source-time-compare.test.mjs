// The rule that keeps freshness comparisons on one clock. It is vendored as an
// oxlint JS plugin, so the honest test is to run oxlint over a fixture and read
// what it reports: a unit-level call to the rule would not prove the plugin is
// wired, and the wiring is what silently broke once (the `Math.max` branch
// matched an identifier callee that a real `Math.max(...)` never is).
import { afterEach, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dir, '..');
const pluginPath = path.join(repoRoot, 'tools/oxlint/openchamber/index.ts');
const oxlintBin = path.join(repoRoot, 'node_modules/.bin/oxlint');

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true }))); });

const lint = async (source) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-time-rule-'));
  roots.push(root);
  await fs.writeFile(path.join(root, 'fixture.ts'), source);
  await fs.writeFile(path.join(root, 'oxlint.json'), JSON.stringify({
    jsPlugins: [{ name: 'openchamber', specifier: pluginPath }],
    overrides: [{ files: ['**/*.ts'], rules: { 'openchamber/no-cross-source-time-compare': 'error' } }],
  }));
  const result = spawnSync(oxlintBin, ['--format', 'unix', '-c', 'oxlint.json', 'fixture.ts'], { cwd: root, encoding: 'utf8' });
  return `${result.stdout}${result.stderr}`
    .split('\n')
    .filter((line) => line.includes('no-cross-source-time-compare'))
    .map((line) => Number(line.slice(line.indexOf('fixture.ts:') + 'fixture.ts:'.length).split(':')[0]));
};

const declaration = 'declare const session: { updatedAt: number };\ndeclare const event: { timestamp: number };\n';

describe('no-cross-source-time-compare', () => {
  test('a Math.max mixing the native mtime with a client clock is reported', async () => {
    // The motivating shape: a recency bump written as arithmetic, not a comparison.
    expect(await lint(`${declaration}export const a = Math.max(session.updatedAt, Date.now());\n`)).toEqual([3]);
    expect(await lint(`${declaration}export const a = Math.min(event.timestamp, session.updatedAt);\n`)).toEqual([3]);
  });

  test('a comparison across sources is reported', async () => {
    expect(await lint(`${declaration}export const a = event.timestamp >= session.updatedAt;\n`)).toEqual([3]);
    expect(await lint(`${declaration}export const a = Date.now() - session.updatedAt > 1000;\n`)).toEqual([3]);
  });

  test('two values from one source stay allowed', async () => {
    expect(await lint(`${declaration}export const a = Math.max(session.updatedAt, session.updatedAt);\n`)).toEqual([]);
    expect(await lint(`${declaration}declare const other: { updatedAt: number };\nexport const a = other.updatedAt > session.updatedAt;\n`)).toEqual([]);
    expect(await lint(`${declaration}export const a = event.timestamp >= session.createdAt;\n`)).toEqual([]);
  });
});
