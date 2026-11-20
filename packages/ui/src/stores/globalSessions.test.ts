import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { compareSessionRevision, isSessionDiscoveryFailed, mergeSessionDirectoryMetadata, registerWorkspaceDirectory, resetWorkspaceDirectories, resolveWorkspaceDirectory, resolveWorkspaceDisplayPath, splitGlobalSessionsByArchived } from './globalSessions';

const session = (extra: Partial<Session> = {}): Session => ({
  sessionId: 'ses_one', projectId: 'pro_one', workspaceId: 'wsp_one', displayPath: 'repo',
  rootSessionId: 'ses_one', createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, title: 'One', metadata: {},
  metadataRevision: '1', archiveRevision: '0', ...extra,
});

beforeEach(resetWorkspaceDirectories);

describe('native global sessions', () => {
  test('splits active and archived native records by presence of archivedAt', () => {
    const active = session();
    const archived = session({ sessionId: 'ses_archived', archivedAt: 0 });
    const restored = session({ sessionId: 'ses_restored', archiveRevision: '2' });
    const split = splitGlobalSessionsByArchived([active, archived, restored]);
    expect(split.active).toEqual([active, restored]);
    expect(split.archived).toEqual([archived]);
  });

  test('binds only a resolved workspace identity and clears bindings on reset', () => {
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
    registerWorkspaceDirectory('wsp_one', '/repo/');
    expect(resolveWorkspaceDirectory('wsp_one')).toBe('/repo');
    resetWorkspaceDirectories();
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
  });

  test.each(['repo', './repo', 'C:repo'])('does not admit relative or display-path hint %s', (directory) => {
    registerWorkspaceDirectory('wsp_one', directory);
    expect(resolveWorkspaceDirectory('wsp_one')).toBeNull();
  });
  test('resolves relative workspace displayPath values against their project root and rejects absolute paths', () => {
    expect(resolveWorkspaceDisplayPath('/srv/chats', '.')).toBe('/srv/chats');
    expect(resolveWorkspaceDisplayPath('/srv/chats/', '2026-11-16/session-one')).toBe('/srv/chats/2026-11-16/session-one');
    expect(resolveWorkspaceDisplayPath('/srv/repo', '../repo-wt')).toBe('/srv/repo-wt');
    expect(resolveWorkspaceDisplayPath('C:\\repo', '.\\worktrees\\wt')).toBe('C:/repo/worktrees/wt');
    expect(resolveWorkspaceDisplayPath('/srv/chats', '/etc/passwd')).toBeNull();
    expect(resolveWorkspaceDisplayPath('/srv/chats', '../../..')).toBeNull();
  });

  test('matches native per-session, workspace and project failure scopes independently', () => {
    const record = session();
    expect(isSessionDiscoveryFailed(record, { ses_one: 'METADATA_READ_FAILED' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { wsp_one: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { pro_one: 'SERVICE_UNAVAILABLE' })).toBe(true);
    expect(isSessionDiscoveryFailed(record, { ses_sibling: 'METADATA_READ_FAILED' })).toBe(false);
    expect(isSessionDiscoveryFailed(record, { wsp_sibling: 'SERVICE_UNAVAILABLE' })).toBe(false);
    expect(isSessionDiscoveryFailed(record, { pro_sibling: 'SERVICE_UNAVAILABLE' })).toBe(false);
  });

  test('compares decimal uint64 revisions without numeric precision loss', () => {
    expect(compareSessionRevision('9007199254740993', '9007199254740992')).toBeGreaterThan(0);
    expect(compareSessionRevision('10', '9')).toBeGreaterThan(0);
    expect(compareSessionRevision('0', '0')).toBe(0);
  });

  test('keeps newer metadata while accepting independent native runtime and archive changes', () => {
    const existing = session({ metadataRevision: '9007199254740993', archivedAt: 3, archiveRevision: '1' });
    const incoming = session({ title: 'Stale', metadata: {}, metadataRevision: '9007199254740992', updatedAt: 5, archiveRevision: '2', workspaceId: 'wsp_moved' });
    const merged = mergeSessionDirectoryMetadata(incoming, existing);
    expect(merged.metadata).toBe(existing.metadata);
    expect(merged.metadataRevision).toBe('9007199254740993');
    expect(merged.updatedAt).toBe(5);
    expect(merged.workspaceId).toBe('wsp_moved');
    expect(merged.archivedAt).toBeUndefined();
  });

  test('keeps a newer archive revision while accepting new Host metadata', () => {
    const existing = session({ archivedAt: 3, archiveRevision: '9007199254740993' });
    const incoming = session({ title: 'Renamed', metadata: {}, metadataRevision: '2', archiveRevision: '9007199254740992' });
    const merged = mergeSessionDirectoryMetadata(incoming, existing);
    expect(merged.archivedAt).toBe(3);
    expect(merged.archiveRevision).toBe('9007199254740993');
    expect(merged.metadata).toBe(incoming.metadata);
  });

  test('confirmed missing Host metadata replaces older metadata', () => {
    const existing = session({ metadata: null, metadataRevision: '0' });
    const incoming = session({ metadata: null, metadataRevision: '0', updatedAt: 3 });
    expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
  });

  test('unchanged revisions do not deduplicate native execution changes', () => {
    const existing = session();
    const incoming = session({ runtimeStatus: 'running', activeRunId: 'run_one', headSequence: '1' });
    expect(mergeSessionDirectoryMetadata(incoming, existing)).toBe(incoming);
  });
});
