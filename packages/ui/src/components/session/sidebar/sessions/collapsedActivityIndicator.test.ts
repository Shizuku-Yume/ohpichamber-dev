import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { getSessionNodesActivityState } from './collapsedActivityState';
import type { SessionNode } from '../types';

const node = (sessionId: string, parentSessionId?: string, children: SessionNode[] = []): SessionNode => ({
  session: {
    sessionId, parentSessionId, rootSessionId: parentSessionId ?? sessionId,
    projectId: 'project-a', workspaceId: 'workspace-a', displayPath: '.',
    createdAt: 1, updatedAt: 1, epoch: '1', headSequence: '0',
    runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    metadata: null, metadataRevision: '0', archiveRevision: '0',
  } satisfies Session,
  children,
  worktree: null,
});

describe('getSessionNodesActivityState', () => {
  test('prioritizes active descendants over unread descendants', () => {
    const nodes = [node('unread'), node('root', undefined, [node('active-child', 'root')])];

    expect(getSessionNodesActivityState(
      nodes,
      new Set(['active-child']),
      new Set(['unread']),
    )).toBe('active');
  });

  test('reads an unread descendant from the session records alone', () => {
    const nodes = [node('root', undefined, [node('unread-child', 'root')])];
    const unread = new Set(['unread-child']);

    expect(getSessionNodesActivityState(nodes, new Set(), unread)).toBe('unread');
  });

  test('returns null when no descendant has activity', () => {
    expect(getSessionNodesActivityState([node('idle')], new Set(), new Set())).toBeNull();
  });
});
