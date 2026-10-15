import { describe, expect, test } from 'bun:test';

import type { Session } from '@openchamber/agent-contract';
import type { SessionGroup, SessionNode } from '../types';
import { selectArchiveAllSessionIds } from './archiveAllSessions';

const session = (sessionId: string, archivedAt?: number): Session => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: 'p',
  workspaceId: 'workspace',
  displayPath: '/repo',
  createdAt: 1,
  updatedAt: 1,
  epoch: 'epoch',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  archivedAt,
});
 

const node = (value: Session, children: SessionNode[] = []): SessionNode => ({ session: value, children, worktree: null });

const group = (id: string, sessions: SessionNode[], isArchivedBucket = false): SessionGroup => ({
  id,
  label: id,
  branch: null,
  description: null,
  isMain: id === 'root',
  isArchivedBucket,
  worktree: null,
  directory: '/repo',
  sessions,
});

describe('selectArchiveAllSessionIds', () => {
  test('takes top-level sessions from every group and skips kept ones', () => {
    const groups = [
      group('root', [node(session('a'), [node(session('a-child'))]), node(session('pinned'))]),
      group('wt', [node(session('b')), node(session('running'))]),
    ];
    const kept = new Set(['pinned', 'running']);

    expect(selectArchiveAllSessionIds(groups, (s) => kept.has(s.sessionId))).toEqual(['a', 'b']);
  });

  test('ignores the archived bucket and already archived sessions', () => {
    const groups = [
      group('root', [node(session('old', 5)), node(session('live'))]),
      group('archived', [node(session('gone', 9))], true),
    ];

    expect(selectArchiveAllSessionIds(groups, () => false)).toEqual(['live']);
  });
});
