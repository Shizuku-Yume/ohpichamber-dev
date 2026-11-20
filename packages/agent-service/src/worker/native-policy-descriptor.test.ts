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
  test('browser launch fields never become file grants or bypass the declared execution tier', async () => {
    const cwd = await workspace();
    for (const input of [
      { action: 'open', app: '/browser', argv: ['--private'], target: 'new-tab', insecure: true },
      { action: 'open', app: { executable: '/browser' }, argv: 'invalid', target: [], insecure: 'invalid' },
      {},
    ]) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'browser', input }, { editMode: 'none', declaredTier: 'exec' });
      expect(descriptor).toMatchObject({ toolName: 'browser', declaredTier: 'exec', sourcePaths: [], destinationPaths: [] });
    }
  });
  for (const { mode, input } of cases) test(`derives ${mode} targets without writing or executing the edit`, async () => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input }, { editMode: mode, declaredTier: 'exec' });
    expect(descriptor?.effectiveMode).toBe(mode); expect(descriptor?.sourcePaths).toContain(join(cwd, 'src/a.ts')); expect(descriptor?.destinationPaths).toContain(join(cwd, 'src/a.ts'));
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
  test.each([
    ['patch', { path: 'src/a.ts', edits: [{ op: 'update', rename: '../outside.ts', diff: '@@\n-old\n+new\n' }] }],
    ['apply_patch', { input: '*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: ../outside.ts\n@@\n-old\n+new\n*** End Patch\n' }],
    ['hashline', { input: '[src/a.ts#0000]\nMV ../outside.ts\n' }],
  ] satisfies [NativePolicyContext['editMode'], JsonObject][])('includes %s rename destinations outside the source root', async (mode, input) => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input }, { editMode: mode, declaredTier: 'exec' });
    expect(descriptor?.destinationPaths).toContain(join(cwd, '../outside.ts')); expect(descriptor?.fileOps.some(operation => operation.to === join(cwd, '../outside.ts'))).toBe(true);
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
  test('does not use a tool-input mode to replace initialized SDK mode', async () => {
    const cwd = await workspace();
    const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input: { ...cases[0]!.input, mode: 'apply_patch' } }, { editMode: 'replace', declaredTier: 'write' });
    expect(descriptor?.effectiveMode).toBe('replace'); expect(descriptor?.sourcePaths).toContain(join(cwd, 'src/a.ts'));
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'edit', input: cases[0]!.input })).rejects.toThrow('effective edit mode');
  });
  test('carries the declared tier into the descriptor for pathless and path tools alike', async () => {
    const cwd = await workspace();
    const pathless = await describeNativeOperation(cwd, { type: 'tool', toolName: 'vibe_spawn', input: { prompt: 'do work' } }, { editMode: 'none', declaredTier: 'exec' });
    expect(pathless?.declaredTier).toBe('exec');
    expect(pathless?.sourcePaths).toEqual([]);
    const read = await describeNativeOperation(cwd, { type: 'tool', toolName: 'vibe_list', input: {} }, { editMode: 'none', declaredTier: 'read' });
    expect(read?.declaredTier).toBe('read');
    const shell = await describeNativeOperation(cwd, { type: 'shell', request: { command: 'printf x', background: true } });
    expect(shell?.declaredTier).toBeUndefined();
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
  test('passes only allowlisted OMP internal URL reads through to the SDK grammar', async () => {
    const cwd = await workspace();
    for (const url of ['agent://native', 'history://native', 'local://3.log', 'local://3.log:1-2', 'local://notes.md:1-2', 'proc://job', 'skill://flow-start', 'xd://memory', 'mcp://server/resource', 'omp://help', 'issue://42', 'pr://7/diff']) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path: url } });
      expect(descriptor?.sourcePaths).toEqual([]);
      expect(descriptor?.internalReadUrls).toEqual([url]);
    }
    const mixed = await describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path: 'agent://native;src/a.ts:1-2' } });
    expect(mixed?.internalReadUrls).toEqual(['agent://native']);
    expect(mixed?.sourcePaths).toContain(join(cwd, 'src/a.ts'));

    for (const [path, normalized] of [['local:/notes.md', 'local://notes.md'], [`${cwd}/local://notes.md`, 'local://notes.md']]) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path } });
      expect(descriptor?.sourcePaths).toEqual([]);
      expect(descriptor?.internalReadUrls).toEqual([normalized]);
    }
  });

  test('passes local:// write targets as internal write URLs and keeps other schemes filesystem-only', async () => {
    const cwd = await workspace();
    for (const [path, normalized] of [['local://add-helper-plan.md', 'local://add-helper-plan.md'], ['local:/notes.md', 'local://notes.md']]) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path, content: 'plan' } });
      expect(descriptor?.destinationPaths).toEqual([]);
      expect(descriptor?.internalWriteUrls).toEqual([normalized]);
      expect(descriptor?.internalReadUrls).toBeUndefined();
    }
    // A real filesystem destination is still exactly that, never an internal URL.
    const filesystem = await describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path: 'src/a.ts', content: 'new' } });
    expect(filesystem?.destinationPaths).toEqual([join(cwd, 'src/a.ts')]);
    expect(filesystem?.internalWriteUrls).toBeUndefined();
  });

  test('refuses non-OMP schemes, NUL bytes and every non-read tool', async () => {
    const cwd = await workspace();
    for (const path of ['file:///etc/passwd', 'https://example.com/a', 'attachment://upload']) {
      await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path } })).rejects.toThrow('separate Host capability');
    }
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'read', input: { path: 'agent://native\0ignored' } })).rejects.toThrow('invalid byte');
    // Only the `local://` session sandbox is writable; every other internal
    // scheme stays a read source or a device transport.
    for (const path of ['agent://native', 'history://native', 'xd://memory', 'skill://flow-start']) {
      await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path, content: 'x' } })).rejects.toThrow('separate Host capability');
    }
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path: 'file:///etc/passwd', content: 'x' } })).rejects.toThrow('separate Host capability');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'grep', input: { path: 'agent://native', pattern: 'x' } })).rejects.toThrow('separate Host capability');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'glob', input: { path: 'local://*' } })).rejects.toThrow('separate Host capability');
  });

  test('derives write containers and hashline-header destinations without performing writes', async () => {
    const cwd = await workspace();
    for (const [path, target] of [['[src/a.ts#0000]', 'src/a.ts'], ['archive.zip:member.ts', 'archive.zip'], ['db.sqlite:table:key', 'db.sqlite']]) {
      const descriptor = await describeNativeOperation(cwd, { type: 'tool', toolName: 'write', input: { path, content: 'new' } });
      expect(descriptor?.destinationPaths).toContain(join(cwd, target));
    }
    expect(await readFile(join(cwd, 'src/a.ts'), 'utf8')).toBe('old\n');
  });
  test('describes read-only LSP actions and resolves exact workspace targets', async () => {
    const cwd = await workspace();
    const filePath = join(cwd, 'src/a.ts');
    const fileUri = Bun.pathToFileURL(filePath).href;

    // hover, definition, type_definition, implementation, references with path
    for (const action of ['hover', 'definition', 'type_definition', 'implementation', 'references']) {
      const descPath = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action, file: 'src/a.ts', line: 1 } });
      expect(descPath?.toolName).toBe('lsp');
      expect(descPath?.lspAction).toBe(action);
      expect(descPath?.sourcePaths).toEqual([filePath]);
      expect(descPath?.destinationPaths).toEqual([]);
      expect(descPath?.fileOps).toEqual([]);

      // With file:// URI
      const descUri = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action, file: fileUri, line: 1 } });
      expect(descUri?.sourcePaths).toEqual([filePath]);
    }

    // status action targets cwd
    const statusDesc = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'status' } });
    expect(statusDesc?.lspAction).toBe('status');
    expect(statusDesc?.lspMethod).toBe('status');
    expect(statusDesc?.sourcePaths).toEqual([cwd]);
    expect(statusDesc?.destinationPaths).toEqual([]);

    // capabilities with/without file
    const capAll = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'capabilities' } });
    expect(capAll?.sourcePaths).toEqual([cwd]);
    const capFile = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'capabilities', file: 'src/a.ts' } });
    expect(capFile?.sourcePaths).toEqual([filePath]);

    // diagnostics with '*' vs specific file
    const diagAll = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'diagnostics', file: '*' } });
    expect(diagAll?.sourcePaths).toEqual([cwd]);
    expect(diagAll?.lspMethod).toBe('workspace/diagnostic');
    const diagFile = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'diagnostics', file: 'src/a.ts' } });
    expect(diagFile?.sourcePaths).toEqual([filePath]);
    expect(diagFile?.lspMethod).toBe('textDocument/diagnostic');

    // symbols with '*' or omitted vs specific file
    const symAll = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'symbols' } });
    expect(symAll?.sourcePaths).toEqual([cwd]);
    expect(symAll?.lspMethod).toBe('workspace/symbol');
    const symFile = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'symbols', file: 'src/a.ts' } });
    expect(symFile?.sourcePaths).toEqual([filePath]);
    expect(symFile?.lspMethod).toBe('textDocument/documentSymbol');

    // code_actions query (apply !== true)
    const codeActionQuery = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'code_actions', file: 'src/a.ts' } });
    expect(codeActionQuery?.lspAction).toBe('code_actions');
    expect(codeActionQuery?.sourcePaths).toEqual([filePath]);
    expect(codeActionQuery?.destinationPaths).toEqual([]);
  });

  test('describes LSP mutations with explicit destination paths and fileOps', async () => {
    const cwd = await workspace();
    const filePath = join(cwd, 'src/a.ts');
    const newFilePath = join(cwd, 'src/b.ts');

    // code_actions with apply: true
    const codeActionApply = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'code_actions', file: 'src/a.ts', apply: true } });
    expect(codeActionApply?.lspAction).toBe('code_actions');
    expect(codeActionApply?.sourcePaths).toEqual([filePath]);
    expect(codeActionApply?.destinationPaths).toEqual([filePath]);

    // rename
    const renameDesc = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'rename', file: 'src/a.ts', new_name: 'b' } });
    expect(renameDesc?.lspAction).toBe('rename');
    expect(renameDesc?.sourcePaths).toEqual([filePath]);
    expect(renameDesc?.destinationPaths).toEqual([filePath]);

    // rename_file
    const renameFileDesc = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'rename_file', file: 'src/a.ts', new_name: 'src/b.ts' } });
    expect(renameFileDesc?.lspAction).toBe('rename_file');
    expect(renameFileDesc?.sourcePaths).toEqual([filePath]);
    expect(renameFileDesc?.destinationPaths).toEqual([newFilePath]);
    expect(renameFileDesc?.fileOps).toEqual([{ kind: 'rename', path: filePath, to: newFilePath }]);
  });

  test('rejects malformed LSP params, escaped paths, and unauthorized URIs', async () => {
    const cwd = await workspace();

    // Missing / invalid action
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: {} })).rejects.toThrow('action is missing');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: '' } })).rejects.toThrow('action is missing');

    // Missing file for file-requiring action
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover' } })).rejects.toThrow('requires a valid file target');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: '*' } })).rejects.toThrow('requires a valid file target');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'rename', file: 'src/a.ts' } })).rejects.toThrow('requires a new name');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'rename_file', file: 'src/a.ts' } })).rejects.toThrow('requires file and new_name');

    // Nul byte in path
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: 'src/a\0.ts' } })).rejects.toThrow('invalid byte');

    // Non-file URL
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: 'https://example.com/a.ts' } })).rejects.toThrow('separate Host capability');
    await expect(describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: 'agent://something' } })).rejects.toThrow('separate Host capability');

    // Client cannot spoof cwd via payload
    const fakeCwdDesc = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: 'src/a.ts', cwd: '/spoofed/path' } });
    expect(fakeCwdDesc?.sourcePaths).toEqual([join(cwd, 'src/a.ts')]);

    // Escaped paths are recorded as absolute escaped paths (for authorizer rejection)
    const escapedDesc = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: '../../outside.ts' } });
    expect(escapedDesc?.sourcePaths).toEqual([join(cwd, '../../outside.ts')]);
    const fileUrlEscape = await describeNativeOperation(cwd, { type: 'tool', toolName: 'lsp', input: { action: 'hover', file: 'file:///etc/passwd' } });
    expect(fileUrlEscape?.sourcePaths).toEqual(['/etc/passwd']);
  });
});
