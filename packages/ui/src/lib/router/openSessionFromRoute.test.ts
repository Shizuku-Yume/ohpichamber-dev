import { beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';

import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

import { openSessionFromRoute } from './openSessionFromRoute';

const SESSION_ID = 'ses_linear_open';
const PROJECT_DIR = '/projects/linear-from-url';
const OTHER_DIR = '/projects/linear-from-url-other';

const buildSession = (sessionId: string, displayPath: string): Session => ({
  sessionId,
  projectId: 'project-linear',
  workspaceId: 'workspace-linear',
  displayPath,
  rootSessionId: sessionId,
  createdAt: 1,
  updatedAt: 2,
  epoch: 'epoch-linear',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
});

describe('openSessionFromRoute', () => {
  beforeEach(() => {
    useSessionUIStore.getState().setCurrentSession(null);
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      hasLoaded: true,
      status: 'ready',
    });
  });

  test('selects the routed session once the global list knows its directory', async () => {
    useGlobalSessionsStore.setState({
      activeSessions: [buildSession(SESSION_ID, PROJECT_DIR)],
      archivedSessions: [],
      hasLoaded: true,
      status: 'ready',
    });

    await openSessionFromRoute(SESSION_ID);

    expect(useSessionUIStore.getState().currentSessionId).toBe(SESSION_ID);
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(PROJECT_DIR);
  });

  test('replaces a guessed directory once the global list knows the owner', async () => {
    const id = 'ses_linear_guessed';
    useSessionUIStore.getState().setCurrentSession(id);
    const guessed = useSessionUIStore.getState().currentSessionDirectory;

    useGlobalSessionsStore.setState({
      activeSessions: [buildSession(id, OTHER_DIR)],
      archivedSessions: [],
      hasLoaded: true,
      status: 'ready',
    });

    await openSessionFromRoute(id);

    expect(useSessionUIStore.getState().currentSessionId).toBe(id);
    expect(useSessionUIStore.getState().currentSessionDirectory).toBe(OTHER_DIR);
    expect(guessed).not.toBe(OTHER_DIR);
  });
});
