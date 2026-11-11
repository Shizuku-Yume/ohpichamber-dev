import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { buildSidebarWorkFacts, EMPTY_SIDEBAR_LIVE_FACTS } from './workFacts';

/**
 * Metadata the server writes but the contract does not name yet (the
 * scheduled-run marker), handed over unparsed so the sidebar's own parser
 * reads it.
 */
const serverMetadata = (openchamber: Record<string, unknown>): SessionMetadata => ({
  // SAFETY: the fixture stands in for a server record the sidebar parses itself.
  openchamber,
} as unknown as SessionMetadata);

const session = (metadata: SessionMetadata): Session => {
  registerWorkspaceDirectory('workspace-p', '/p');
  return {
    sessionId: 's1',
    projectId: 'p',
    workspaceId: 'workspace-p',
    displayPath: '/p',
    rootSessionId: 's1',
    createdAt: 1,
    updatedAt: 2,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    title: 'Nightly triage',
    metadata,
    metadataRevision: '1',
    archiveRevision: '0',
  };
};

const factsFor = (record: Session) => buildSidebarWorkFacts(
  { kind: 'session', key: 'session:s1', projectId: 'p', rootSessionId: 's1' },
  { sessionById: new Map([['s1', record]]), childrenMap: new Map(), runKeyBySessionId: new Map(), live: EMPTY_SIDEBAR_LIVE_FACTS, planSessionIds: new Set(), folderByMember: new Map([['s1', { folderId: 'folder', projectId: 'p' }]]) },
);

describe('buildSidebarWorkFacts', () => {
  test('a session names the folder holding it', () => {
    expect(factsFor(session({})).folderId).toBe('folder');
  });

  test('a session updated into a new record is read again', () => {
    const before = session(serverMetadata({ kind: 'scheduled' }));
    expect(factsFor(before)).toMatchObject({ scheduled: true, inWork: false });
    expect(factsFor(before)).toMatchObject({ scheduled: true, inWork: false });
    const after = session(serverMetadata({ kind: 'scheduled', work: { state: 'open', openedAt: 3 } }));
    expect(factsFor(after)).toMatchObject({ scheduled: true, inWork: true });
  });
});
