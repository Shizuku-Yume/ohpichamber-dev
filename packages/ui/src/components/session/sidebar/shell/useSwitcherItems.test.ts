import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';

import {
  findSwitcherItemAncestorIds,
  selectSwitcherParents,
  type SwitcherItem,
} from './useSwitcherItems';

const session = (sessionId: string, options: { parentSessionId?: string; archived?: boolean; projectId?: string } = {}): Session => ({
  sessionId,
  parentSessionId: options.parentSessionId,
  rootSessionId: options.parentSessionId ?? sessionId,
  archivedAt: options.archived ? Date.now() : undefined,
  projectId: options.projectId ?? 'project-a',
  workspaceId: 'workspace-a', displayPath: '.',
  createdAt: 1, updatedAt: 1, epoch: '1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null,
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const selectParents = (sessions: Session[], currentSessionId: string | null, scopeProjectId: string | null = null): Session[] => (
  selectSwitcherParents(sessions, new Set(), new Map(), scopeProjectId, currentSessionId, (item) => item.projectId)
);

describe('session switcher initial selection', () => {
  test('finds all local ancestors for a current child session', () => {
    const items: SwitcherItem[] = [{
      node: { session: session('root'), worktree: null, children: [{ session: session('parent', { parentSessionId: 'root' }), worktree: null, children: [{ session: session('child', { parentSessionId: 'parent' }), worktree: null, children: [] }] }] },
      projectId: 'project-a', groupDirectory: null, secondaryMeta: null,
    }];

    expect(findSwitcherItemAncestorIds(items, 'child')).toEqual(['root', 'parent']);
    expect(findSwitcherItemAncestorIds(items, 'missing')).toBeNull();
  });

  test('replaces the final recent slot with the current root and excludes invalid current sessions', () => {
    const roots = Array.from({ length: 8 }, (_, index) => session(`root-${index}`));
    const child = session('child', { parentSessionId: 'root-7' });

    expect(selectParents([...roots, child], 'child').map((item) => item.sessionId)).toEqual([
      'root-0', 'root-1', 'root-2', 'root-3', 'root-4', 'root-5', 'root-7',
    ]);
    expect(selectParents([...roots, child], 'missing').map((item) => item.sessionId)).toEqual(roots.slice(0, 7).map((item) => item.sessionId));
    expect(selectParents([...roots, child], 'child', 'project-b').map((item) => item.sessionId)).toEqual([]);
    expect(selectParents([...roots.slice(0, 7), session('archived', { archived: true })], 'archived').map((item) => item.sessionId)).toEqual(roots.slice(0, 7).map((item) => item.sessionId));
    expect(selectParents([...roots, session('archived-child', { archived: true, parentSessionId: 'root-7' })], 'archived-child').map((item) => item.sessionId)).toEqual(roots.slice(0, 7).map((item) => item.sessionId));
  });
});
