import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeNativeOperation } from './native-policy-descriptor.ts';
import type { NativePolicyContext } from '../native-policy-protocol.ts';
import type { JsonObject } from '@openchamber/agent-contract';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'native-policy-parser-')); roots.push(root);
  await mkdir(join(root, 'src')); await writeFile(join(root, 'src', 'a.ts'), 'old\n');
  return root;
}
const cases: { mode: NativePolicyContext['editMode']; input: JsonObject }[] = [
  { mode: 'replace', input: { path: 'src/a.ts', old_string: 'old', new_string: 'new' } },
  { mode: 'patch', input: { path: 'src/a.ts', edits: [{ op: 'update', diff: '@@\n-old\n+new\n' }] } },
  { mode: 'apply_patch', input: { input: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n-old\n+new\n*** Add File: src/new.ts\n+new\n*** Delete File: src/obsolete.ts\n*** End Patch\n' } },
  { mode: 'hashline', input: { input: '[src/a.ts#0000]\nPUT 1.=1:\n+new\n[src/obsolete.ts#0000]\nREM\n' } },
  { mode: 'sloppy', input: { input: '*** Edit File: src/a.ts\n*** Find\nold\n*** Replace\nnew\n*** Edit File: src/new.ts\n*** Find\nold\n*** Replace\nnew\n' } },
];

describe('trusted execution-free first-party target inspection', () => {
  for (const { mode, input } of cases) test(`derives ${mode} targets without writing or executing the edit`, async () => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input }, { editMode: mode });
    expect(descriptor?.effectiveMode).toBe(mode); expect(descriptor?.sourcePaths).toContain(join(cwd, 'src/a.ts')); expect(descriptor?.destinationPaths).toContain(join(cwd, 'src/a.ts'));
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
  test.each([
    ['patch', { path: 'src/a.ts', edits: [{ op: 'update', rename: '../outside.ts', diff: '@@\n-old\n+new\n' }] }],
    ['apply_patch', { input: '*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: ../outside.ts\n@@\n-old\n+new\n*** End Patch\n' }],
    ['hashline', { input: '[src/a.ts#0000]\nMV ../outside.ts\n' }],
  ] satisfies [NativePolicyContext['editMode'], JsonObject][])('includes %s rename destinations outside the source root', async (mode, input) => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input }, { editMode: mode });
    expect(descriptor?.destinationPaths).toContain(join(cwd, '../outside.ts')); expect(descriptor?.fileOps.some(operation => operation.to === join(cwd, '../outside.ts'))).toBe(true);
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
  test('does not use a tool-input mode to replace initialized SDK mode', async () => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input: { ...cases[0]!.input, mode: 'apply_patch' } }, { editMode: 'replace' });
    expect(descriptor?.effectiveMode).toBe('replace'); expect(descriptor?.sourcePaths).toContain(join(cwd, 'src/a.ts'));
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input: cases[0]!.input })).rejects.toThrow('effective edit mode');
  });
  test('retains literal selector-shaped filenames and derives all read backing containers', async () => {
    const cwd = await workspace(); await writeFile(join(cwd, 'literal:1-2'), 'literal');
    const literal = await describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path: 'literal:1-2' } });
    expect(literal?.sourcePaths).toContain(join(cwd, 'literal:1-2'));
    const list = await describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path: 'src/a.ts:raw:1-2;archive.zip:member/a.ts;db.sqlite:table:key;data.json?q=.name;clip.mp4:90s' } });
    for (const target of ['src/a.ts', 'archive.zip', 'db.sqlite', 'data.json', 'clip.mp4']) expect(list?.sourcePaths).toContain(join(cwd, target));
  });
  test('includes actual grep selector target and every glob root, including symlink roots', async () => {
    const cwd = await workspace(); const outside = await workspace(); await symlink(outside, join(cwd, 'foreign'));
    const grep = await describeNativeOperation(cwd, { type: 'tool', toolName: 'grep', input: { path: 'src/a.ts:1-2;foreign/**/*.ts', pattern: 'old' } });
    expect(grep?.sourcePaths).toContain(join(cwd, 'src/a.ts')); expect(grep?.sourcePaths).toContain(join(cwd, 'foreign'));
    const glob = await describeNativeOperation(cwd, { type: 'tool', toolName: 'glob', input: { path: 'src/*.ts;../**/*.ts' } });
    expect(glob?.sourcePaths).toContain(join(cwd, 'src')); expect(glob?.sourcePaths).toContain(join(cwd, '..'));
  });
  test('derives write containers and hashline-header destinations without performing writes', async () => {
    const cwd = await workspace();
    for (const [path, target] of [['[src/a.ts#0000]', 'src/a.ts'], ['archive.zip:member.ts', 'archive.zip'], ['db.sqlite:table:key', 'db.sqlite']]) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path, content: 'new' } });
      expect(descriptor?.destinationPaths).toContain(join(cwd, target));
    }
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
});
