import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { resetSessionOrdering } from '@/sync/session-ordering';
import { SyncProvider, useDirectoryStore } from '@/sync/sync-context';
import { installHookTestDom } from '../test-utils/testDom';
import { useSessionProjectCollection } from './sessionCollection';

const DIRECTORY = '/project';
const KNOWN_DIRECTORIES = new Set([DIRECTORY]);
const ARCHIVED_ID = 'ses_archived';
const ACTIVE_ID = 'ses_active';
const UNKNOWN_ID = 'ses_unknown';

/** Each fixture directory is its own workspace, so a session in a deleted worktree stays out. */
const session = (id: string, updated: number, archived = false, directory = DIRECTORY): Session => {
  const workspaceId = `workspace:${directory}`;
  registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId: id,
    projectId: 'project',
    workspaceId,
  displayPath: directory,
  rootSessionId: id,
  createdAt: 1,
  updatedAt: updated,
  archivedAt: archived ? updated : undefined,
  epoch: 'epoch-1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  title: id,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  };
};

type Collection = ReturnType<typeof useSessionProjectCollection>;

let directoryStore: ReturnType<typeof useDirectoryStore> | null = null;
let collection: Collection | null = null;

const Probe = () => {
  directoryStore = useDirectoryStore(DIRECTORY, { bootstrap: false });
  collection = useSessionProjectCollection({ knownDirectories: KNOWN_DIRECTORIES, isVSCode: false, isVisible: false });
  return null;
};

const collectionIds = (key: 'sessions' | 'rootSessions' | 'orderedSessions'): string[] => (
  collection?.[key].map((entry) => entry.sessionId) ?? []
);

describe('useSessionProjectCollection archive coverage', () => {
  let dom: ReturnType<typeof installHookTestDom>;
  let root: Root;
  let restoreSpies: Array<() => void>;
  let restoreWarmingRefresh: () => void;
  let initialGlobalState: ReturnType<typeof useGlobalSessionsStore.getState>;
  let previousSurface: typeof window.__OPENCHAMBER_SURFACE__;

  const render = async () => {
    await act(async () => root.render(
      <SyncProvider directory="">
        <Probe />
      </SyncProvider>,
    ));
  };

  const seedDirectory = async (sessions: Session[]) => {
    await act(async () => directoryStore!.setState({ session: sessions }));
  };

  const seedGlobal = async (activeSessions: Session[], archivedSessions: Session[]) => {
    await act(async () => useGlobalSessionsStore.getState().applySnapshot(activeSessions, archivedSessions));
  };

  beforeEach(() => {
    dom = installHookTestDom();
    previousSurface = window.__OPENCHAMBER_SURFACE__;
    window.__OPENCHAMBER_SURFACE__ = 'desktop';
    initialGlobalState = useGlobalSessionsStore.getState();
    resetSessionOrdering();
    restoreSpies = [];
    restoreWarmingRefresh = () => { };
    root = createRoot(dom.container);
    directoryStore = null;
    collection = null;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    useGlobalSessionsStore.setState(initialGlobalState, true);
    resetSessionOrdering();
    restoreSpies.forEach((restore) => restore());
    restoreWarmingRefresh();
    window.__OPENCHAMBER_SURFACE__ = previousSurface;
    dom.restore();
  });

  test('omits an archived global session when a directory store retains its active copy', async () => {
    await render();
    await seedGlobal([session(ACTIVE_ID, 20)], [session(ARCHIVED_ID, 30, true)]);
    await seedDirectory([session(ARCHIVED_ID, 30), session(UNKNOWN_ID, 40)]);

    for (const key of ['sessions', 'rootSessions', 'orderedSessions'] as const) {
      expect(collectionIds(key)).not.toContain(ARCHIVED_ID);
      expect(collectionIds(key)).toContain(ACTIVE_ID);
      expect(collectionIds(key)).toContain(UNKNOWN_ID);
      expect(collectionIds(key)).toHaveLength(2);
    }
  });

  test('uses raw archive membership when the archived display excludes a deleted worktree', async () => {
    await render();
    await seedGlobal(
      [session(ACTIVE_ID, 20)],
      [session(ARCHIVED_ID, 30, true, '/fixture/deleted-worktree')],
    );
    await seedDirectory([session(ARCHIVED_ID, 30), session(UNKNOWN_ID, 40)]);

    expect(useGlobalSessionsStore.getState().archivedSessions.map((entry) => entry.sessionId)).toContain(ARCHIVED_ID);
    expect(collection?.archivedSessions).toEqual([]);
    for (const key of ['sessions', 'rootSessions', 'orderedSessions'] as const) {
      expect(collectionIds(key)).not.toContain(ARCHIVED_ID);
      expect(collectionIds(key)).toContain(UNKNOWN_ID);
    }
  });

  test('updates the live gap when archive membership arrives and restores one authoritative row', async () => {
    await render();
    await seedGlobal([session(ACTIVE_ID, 20)], []);
    await seedDirectory([session(ARCHIVED_ID, 30), session(UNKNOWN_ID, 40)]);
    expect(collectionIds('sessions')).toContain(ARCHIVED_ID);

    await seedGlobal([session(ACTIVE_ID, 20)], [session(ARCHIVED_ID, 30, true)]);
    expect(collectionIds('sessions')).not.toContain(ARCHIVED_ID);

    await seedGlobal([session(ACTIVE_ID, 20), session(ARCHIVED_ID, 50)], []);
    expect(collectionIds('sessions').filter((id) => id === ARCHIVED_ID)).toHaveLength(1);
  });

  test('keeps the collection stable for time-only updates to a globally covered directory record', async () => {
    await render();
    await seedGlobal([session(ACTIVE_ID, 20)], []);
    await seedDirectory([session(ACTIVE_ID, 20), session(UNKNOWN_ID, 40)]);
    const sessions = collection?.sessions;
    const rootSessions = collection?.rootSessions;
    const orderedSessions = collection?.orderedSessions;

    await seedDirectory([session(ACTIVE_ID, 21), session(UNKNOWN_ID, 40)]);

    expect(collection?.sessions).toBe(sessions);
    expect(collection?.rootSessions).toBe(rootSessions);
    expect(collection?.orderedSessions).toBe(orderedSessions);
  });
});
