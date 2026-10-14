import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { selectNewChildSessions } from './child-session-discovery';

const session = (sessionId: string, parentSessionId?: string, archivedAt?: number): Session => ({
  sessionId, parentSessionId, projectId: 'project', workspaceId: 'workspace', displayPath: 'repo',
  rootSessionId: parentSessionId ?? sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, ...(archivedAt === undefined ? {} : { archivedAt }),
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

describe('selectNewChildSessions', () => {
  test('adds unknown children of watched parents', () => {
    const listed = [session('child', 'root'), session('known', 'root'), session('stranger', 'other'), session('orphan')];
    const added = selectNewChildSessions(listed, new Set(['known']), new Set(['root']), () => false);
    expect(added.map((entry) => entry.sessionId)).toEqual(['child']);
  });
  test('drops a child known to be archived', () => {
    const listed = [session('stale', 'root'), session('fresh', 'root')];
    const added = selectNewChildSessions(listed, new Set(), new Set(['root']), (sessionId) => sessionId === 'stale');
    expect(added.map((entry) => entry.sessionId)).toEqual(['fresh']);
  });
  test('never introduces an archived child from a complete listing', () => {
    const added = selectNewChildSessions([session('archived', 'root', 0), session('fresh', 'root')], new Set(), new Set(['root']), () => false);
    expect(added.map((entry) => entry.sessionId)).toEqual(['fresh']);
  });
});
