import { expect, test } from 'bun:test';
import { computeTurnDiff, contentSum, parseJournalRecords, unifiedDiff } from './turn-diff-core.ts';
import type { TurnDiffChangeRecord } from './turn-diff-core.ts';

function gzip(text: string): Uint8Array {
  return Bun.gzipSync(new TextEncoder().encode(text));
}

function blobs(entries: Record<string, string>): (key: string) => Promise<Uint8Array | undefined> {
  const store = new Map(Object.entries(entries).map(([key, text]) => [key, gzip(text)]));
  return async key => store.get(key);
}

type Delta = [number, number, string[]][];

function delta(...regions: [number, number, string[]][]): Delta {
  return regions;
}

function journalLine(record: Partial<TurnDiffChangeRecord> & { path: string; at: number }): string {
  return JSON.stringify({ type: 'change', agent: 'Main', tool: 'edit', ...record });
}

const WINDOW = { turnId: 'turn-1', startedAt: 1000, finishedAt: 2000 };
const ownsRoot = (record: { agent: string; parent?: string }) => record.parent === undefined;

test('parseJournalRecords tolerates a torn trailing line and rejects non-change records', () => {
  const lines = [
    journalLine({ path: '/w/a.ts', at: 1 }),
    '{"type":"commit","at":2}',
    '{"type":"change","agent":"Main"', // torn tail — cut mid-write
    '',
  ].join('\n');
  const records = parseJournalRecords(lines);
  expect(records.length).toBe(1);
  expect(records[0]?.path).toBe('/w/a.ts');
});

test('computeTurnDiff reconstructs before/after across an edit chain inside the window', async () => {
  const baseKey = 'basekey1';
  const record = {
    path: '/w/a.ts', at: 1500, base: baseKey,
    edit: delta([1, 1, ['BETA']]),
    sum: contentSum('alpha\nBETA\n'),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({ [baseKey]: 'alpha\nbeta\n' }),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  expect(result.files.length).toBe(1);
  const file = result.files[0]!;
  expect(file.path).toBe('a.ts');
  expect(file.status).toBe('modified');
  expect(file.before).toBe('alpha\nbeta\n');
  expect(file.after).toBe('alpha\nBETA\n');
  expect(file.additions).toBe(1);
  expect(file.deletions).toBe(1);
  expect(file.patch).toContain('-beta');
  expect(file.patch).toContain('+BETA');
  expect(file.incomplete).toBe(false);
});

test('a created file inside the window diffs as added with /dev/null base', async () => {
  const record = {
    path: '/w/new.ts', at: 1500, base: null,
    edit: delta([0, 0, ['one', 'two', '']]),
    sum: contentSum('one\ntwo\n'),
  };
  const result = await computeTurnDiff({
    journalText: journalLine({ ...record, tool: 'write' }) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  const file = result.files[0]!;
  expect(file.status).toBe('added');
  expect(file.before).toBeNull();
  expect(file.after).toBe('one\ntwo\n');
  expect(file.additions).toBe(2);
  expect(file.patch).toContain('--- /dev/null');
});

test('writes outside the window boundaries are excluded by timestamp', async () => {
  const record = { path: '/w/a.ts', at: 999, base: null, edit: delta([0, 0, ['x']]), sum: contentSum('x') };
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: false,
  });
  expect(result.state).toBe('empty');
});
test('out-of-window writes with mutation evidence inside the turn read unsupported', async () => {
  const record = { path: '/w/a.ts', at: 999, base: null, edit: delta([0, 0, ['x']]), sum: contentSum('x') };
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('unsupported');
});

test('a turn with mutation evidence but no journal records is unsupported, never empty', async () => {
  const result = await computeTurnDiff({
    journalText: null,
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('unsupported');
  expect(result.files.length).toBe(0);
  expect(result.error).toBeUndefined();
});

test('a turn without any mutation evidence and no records is a valid empty', async () => {
  const result = await computeTurnDiff({
    journalText: null,
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: false,
  });
  expect(result.state).toBe('empty');
});

test('subagent records carry parent and never surface under root ownership', async () => {
  const sub = { path: '/w/sub.ts', at: 1500, base: null, agent: 'worker-1', parent: 'Main', edit: delta([0, 0, ['s']]), sum: contentSum('s') };
  const rootView = await computeTurnDiff({
    journalText: journalLine(sub) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: false,
  });
  expect(rootView.state).toBe('empty');
  const childView = await computeTurnDiff({
    journalText: journalLine(sub) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: record => record.agent === 'worker-1',
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(childView.state).toBe('ready');
  const provenance = childView.files[0]!.provenance[0]!;
  expect(provenance.agent).toBe('subagent');
  expect(provenance.subagentId).toBe('worker-1');
});

test('mixed root and subagent writes in one turn attribute per writer identity', async () => {
  const rootWrite = { path: '/w/root.ts', at: 1400, base: null, edit: delta([0, 0, ['r']]), sum: contentSum('r') };
  const subWrite = { path: '/w/sub.ts', at: 1500, base: null, agent: 'worker-7', parent: 'Main', edit: delta([0, 0, ['s']]), sum: contentSum('s') };
  const rootView = await computeTurnDiff({
    journalText: journalLine(rootWrite) + '\n' + journalLine(subWrite) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(rootView.state).toBe('ready');
  expect(rootView.files.length).toBe(1);
  expect(rootView.files[0]!.path).toBe('root.ts');
  expect(rootView.files[0]!.provenance[0]!.agent).toBe('session');
  expect(rootView.files[0]!.provenance[0]!.subagentId).toBeUndefined();
  const childView = await computeTurnDiff({
    journalText: journalLine(rootWrite) + '\n' + journalLine(subWrite) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: record => record.agent === 'worker-7',
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(childView.state).toBe('ready');
  expect(childView.files.length).toBe(1);
  expect(childView.files[0]!.path).toBe('sub.ts');
});

test('writes outside the workspace are excluded entirely; with mutation evidence the state reads unsupported', async () => {
  const outside = { path: '/elsewhere/x.ts', at: 1500, base: null, edit: delta([0, 0, ['x']]), sum: contentSum('x') };
  const result = await computeTurnDiff({
    journalText: journalLine(outside) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('unsupported');
  expect(result.files.length).toBe(0);
  const silent = await computeTurnDiff({
    journalText: journalLine(outside) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: false,
  });
  expect(silent.state).toBe('empty');
  expect(silent.files.length).toBe(0);
});
test('a chain broken before the window yields incomplete rows with no content and zero counts', async () => {
  const record = {
    path: '/w/a.ts', at: 1500,
    edit: delta([0, 1, ['y']]),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  const file = result.files[0]!;
  expect(file.incomplete).toBe(true);
  expect(file.before).toBeUndefined();
  expect(file.after).toBeUndefined();
  expect(file.patch).toBeUndefined();
  expect(file.additions).toBe(0);
  expect(file.deletions).toBe(0);
  expect(file.provenance.length).toBeGreaterThan(0);
});

test('a missing base blob breaks replay into incomplete rows, not fabricated content', async () => {
  const record = {
    path: '/w/a.ts', at: 1500, base: 'missing-blob-key',
    edit: delta([0, 0, ['z']]),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({}), // blob absent on disk
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  expect(result.files[0]!.incomplete).toBe(true);
});

test('the workspace is never consulted: mutating the file after the write changes nothing', async () => {
  const baseKey = 'k';
  const record = {
    path: '/w/a.ts', at: 1500, base: baseKey,
    edit: delta([0, 1, ['two']]),
    sum: contentSum('two\n'),
  };
  const input = {
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({ [baseKey]: 'one\n' }),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  };
  const first = await computeTurnDiff(input);
  const second = await computeTurnDiff(input);
  expect(first.state).toBe('ready');
  expect(second.state).toBe('ready');
  expect(first.files[0]!.after).toBe('two\n');
  expect(second.files[0]!.after).toBe('two\n');
});

test('a rename merges into one row when the same content leaves one path and appears at another', async () => {
  const baseKey = 'rb';
  const content = 'same content\n';
  const deletion = {
    path: '/w/old.ts', at: 1400, base: baseKey,
    edit: delta([0, 2, []]),
    sum: contentSum(null),
  };
  const creation = {
    path: '/w/new.ts', at: 1500, base: null,
    edit: delta([0, 0, ['same content', '']]),
    sum: contentSum(content),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(deletion) + '\n' + journalLine(creation) + '\n',
    loadBlob: blobs({ [baseKey]: content }),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  expect(result.files.length).toBe(1);
  const file = result.files[0]!;
  expect(file.status).toBe('renamed');
  expect(file.previousPath).toBe('old.ts');
  expect(file.path).toBe('new.ts');
});

test('unified diff output matches git for terminator edge cases', () => {
  const plain = unifiedDiff('f.txt', 'a\nb\n', 'a\nc\n');
  expect(plain.patch).toContain('@@ -1,2 +1,2 @@');
  expect(plain.patch).toContain('-b');
  expect(plain.patch).toContain('+c');
  expect(plain.additions).toBe(1);
  expect(plain.deletions).toBe(1);
  const added = unifiedDiff('f.txt', 'a\nb', 'a\nb\n');
  expect(added.patch).toContain('\\ No newline at end of file');
  const same = unifiedDiff('f.txt', 'a\n', 'a\n');
  expect(same.patch).toBe('');
  expect(same.additions).toBe(0);
});

test('content truncation caps row content but keeps the row complete-flag accurate', async () => {
  const big = 'x'.repeat(300_000) + '\n';
  const baseKey = 'big';
  const record = {
    path: '/w/big.ts', at: 1500, base: null,
    edit: delta([0, 0, big.split('\n').slice(0, -1).concat([''])]),
    sum: contentSum(big),
  };
  void baseKey;
  const result = await computeTurnDiff({
    journalText: journalLine(record) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  const file = result.files[0]!;
  expect(file.truncated).toBe(true);
  expect(file.after).toBeUndefined();
  expect(file.before).toBeUndefined();
  expect(file.incomplete).toBe(false);
});

test('a file created then deleted within one turn produces no row at all', async () => {
  const create = {
    path: '/w/temp.ts', at: 1400, base: null,
    edit: delta([0, 0, ['scratch', '']]),
    sum: contentSum('scratch\n'),
  };
  const deletion = {
    path: '/w/temp.ts', at: 1500, tool: 'write',
    edit: delta([0, 2, []]),
    sum: contentSum(null),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(create) + '\n' + journalLine(deletion) + '\n',
    loadBlob: blobs({}),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('empty');
  expect(result.files.length).toBe(0);
  expect(result.files.every(file => file.status !== 'added' || file.after !== null)).toBe(true);
});

test('a create-before-delete pair with matching content is not a rename', async () => {
  const baseKey = 'cbd';
  const content = 'copied content\n';
  const creation = {
    path: '/w/copy.ts', at: 1400, base: null,
    edit: delta([0, 0, ['copied content', '']]),
    sum: contentSum(content),
  };
  const deletion = {
    path: '/w/original.ts', at: 1500, base: baseKey,
    edit: delta([0, 2, []]),
    sum: contentSum(null),
  };
  const result = await computeTurnDiff({
    journalText: journalLine(creation) + '\n' + journalLine(deletion) + '\n',
    loadBlob: blobs({ [baseKey]: content }),
    window: WINDOW,
    ownsRecord: ownsRoot,
    workspaceCwd: '/w',
    turnHasMutationEvidence: true,
  });
  expect(result.state).toBe('ready');
  expect(result.files.length).toBe(2);
  expect(result.files.every(file => file.status !== 'renamed')).toBe(true);
  expect(result.files.map(file => file.status).sort()).toEqual(['added', 'deleted']);
});

test('the no-newline annotation matches git byte-for-byte for final-line edits and shared context', () => {
  const modified = unifiedDiff('f.txt', 'line1\nline2', 'line1\nline2x');
  const modifiedRows = modified.patch.split('\n');
  const annotationPositions = modifiedRows.map((row, index) => row.startsWith('\\') ? index : -1).filter(index => index >= 0);
  expect(annotationPositions.length).toBe(2);
  const minusIndex = modifiedRows.findIndex(row => row === '-line2');
  const plusIndex = modifiedRows.findIndex(row => row === '+line2x');
  expect(annotationPositions[0]).toBe(minusIndex + 1);
  expect(annotationPositions[1]).toBe(plusIndex + 1);
  const shared = unifiedDiff('f.txt', 'line1\nline2', 'line1x\nline2');
  const sharedRows = shared.patch.split('\n');
  const sharedAnnotations = sharedRows.map((row, index) => row.startsWith('\\') ? index : -1).filter(index => index >= 0);
  expect(sharedAnnotations.length).toBe(1);
  const contextIndex = sharedRows.findIndex(row => row === ' line2');
  expect(sharedAnnotations[0]).toBe(contextIndex + 1);
  expect(contextIndex).toBeGreaterThan(sharedRows.findIndex(row => row === '+line1x'));
});

test('content appended after a newline-less final line diffs byte-identically to git', () => {
  const appended = unifiedDiff('f.txt', 'a\nb', 'a\nb\nc\n');
  expect(appended.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n');
  const appendedNoNewline = unifiedDiff('f.txt', 'a\nb', 'a\nb\nc');
  expect(appendedNoNewline.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n\\ No newline at end of file\n');
  const prependShared = unifiedDiff('f.txt', 'a\nb', 'x\na\nb');
  expect(prependShared.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,3 @@\n+x\n a\n b\n\\ No newline at end of file\n');
  const prependGaining = unifiedDiff('f.txt', 'a\nb', 'x\na\nb\n');
  expect(prependGaining.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,3 @@\n+x\n a\n-b\n\\ No newline at end of file\n+b\n');
  const losingNewline = unifiedDiff('f.txt', 'a\nb\n', 'a\nb');
  expect(losingNewline.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n');
  const gainingNewline = unifiedDiff('f.txt', 'a\nb', 'a\nb\n');
  expect(gainingNewline.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n');
  const removedFinal = unifiedDiff('f.txt', 'a\nb\nc', 'a\nb\n');
  expect(removedFinal.patch).toBe('--- a/f.txt\n+++ b/f.txt\n@@ -1,3 +1,2 @@\n a\n b\n-c\n\\ No newline at end of file\n');
});
