import { beforeEach, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from './globalSessions';
import { applyGlobalSessionStructureMutations, buildGlobalSessionStructure, resolveGlobalSessionDirectory } from './globalSessionStructure';

const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'pro_one', workspaceId: 'wsp_one', displayPath: 'repo',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, metadata: null, metadataRevision: '0', archiveRevision: '0', ...extra,
});

beforeEach(() => {
  resetWorkspaceDirectories();
  registerWorkspaceDirectory('wsp_one', '/repo');
  registerWorkspaceDirectory('wsp_other', '/other');
});

test('indexes native parents, roots and authorized directories', () => {
  const parent = session('ses_parent');
  const child = session('ses_child', { parentSessionId: 'ses_parent', rootSessionId: 'ses_parent' });
  const unknown = session('ses_unknown', { workspaceId: 'wsp_unknown', displayPath: 'repo/subdir' });
  const structure = buildGlobalSessionStructure([parent, child, unknown]);
  expect(structure.activeRootIds).toEqual(['ses_parent', 'ses_unknown']);
  expect(structure.activeChildrenByParentId.get('ses_parent')).toEqual(['ses_child']);
  expect(structure.activeIdsByDirectory.get('/repo')).toEqual(['ses_parent', 'ses_child']);
  expect(resolveGlobalSessionDirectory(unknown)).toBeNull();
});

test('metadata-only changes preserve structural references', () => {
  const record = session('ses_one');
  const structure = buildGlobalSessionStructure([record]);
  expect(applyGlobalSessionStructureMutations(structure, [{ sessionId: 'ses_one', previous: record, next: { ...record, metadata: { title: 'New' }, metadataRevision: '1' } }])).toBe(structure);
});

test('a workspace move changes only addressed directory buckets', () => {
  const moved = session('ses_moved');
  const unrelated = session('ses_unrelated', { workspaceId: 'wsp_unrelated' });
  registerWorkspaceDirectory('wsp_unrelated', '/unrelated');
  const structure = buildGlobalSessionStructure([moved, unrelated]);
  const next = applyGlobalSessionStructureMutations(structure, [{ sessionId: moved.sessionId, previous: moved, next: { ...moved, workspaceId: 'wsp_other' } }]);
  expect(next.activeIdsByDirectory.has('/repo')).toBe(false);
  expect(next.activeIdsByDirectory.get('/other')).toEqual(['ses_moved']);
  expect(next.activeIdsByDirectory.get('/unrelated')).toBe(structure.activeIdsByDirectory.get('/unrelated'));
  expect(next.activeRootIds).toBe(structure.activeRootIds);
});

test('archive and delete remove native hierarchy membership', () => {
  const parent = session('ses_parent');
  const child = session('ses_child', { parentSessionId: 'ses_parent', rootSessionId: 'ses_parent' });
  const structure = buildGlobalSessionStructure([parent, child]);
  const next = applyGlobalSessionStructureMutations(structure, [
    { sessionId: child.sessionId, previous: child, next: { ...child, archivedAt: 0 } },
    { sessionId: parent.sessionId, previous: parent, next: null },
  ]);
  expect(next.activeSessionIds).toEqual([]);
  expect(next.activeRootIds).toEqual([]);
  expect(next.activeChildrenByParentId.size).toBe(0);
  expect(next.activeIdsByDirectory.size).toBe(0);
});
