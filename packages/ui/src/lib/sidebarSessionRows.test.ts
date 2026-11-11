import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { sessionHasSidebarRow } from './sidebarSessionRows';

const session: Session = {
  sessionId: 'row', projectId: 'project', workspaceId: 'workspace', displayPath: '/repo',
  rootSessionId: 'row', createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: { openchamber: { work: { state: 'open' } } }, metadataRevision: '1', archiveRevision: '0',
};

describe('sidebar row admission and section visibility', () => {
  test('placement, pins and work each admit a top-level session', () => {
    expect(sessionHasSidebarRow(session, { isPlaced: false, isPinned: false })).toBe(true);
    expect(sessionHasSidebarRow(session, { isPlaced: true, isPinned: false })).toBe(true);
    expect(sessionHasSidebarRow(session, { isPlaced: false, isPinned: true })).toBe(true);
  });

  test('a subagent and an archived session never have a row', () => {
    expect(sessionHasSidebarRow({ ...session, parentSessionId: 'parent' }, { isPlaced: true, isPinned: true })).toBe(false);
    expect(sessionHasSidebarRow({ ...session, archivedAt: 5 }, { isPlaced: true, isPinned: true })).toBe(false);
  });

  test('without placement, a pin or work there is no row', () => {
    expect(sessionHasSidebarRow({ ...session, metadata: null }, { isPlaced: false, isPinned: false })).toBe(false);
  });
});
