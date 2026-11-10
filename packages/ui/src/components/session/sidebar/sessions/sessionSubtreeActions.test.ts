import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useSessionUIStore } from '@/sync/session-ui-store';
import {
<<<<<<< HEAD
=======
  buildActiveSessionTreeFromCache,
  collectParentIdDescendantIds,
  collectSessionMoveDescendants,
>>>>>>> bc50ba56a
  collectSessionSubtreeIds,
  runSessionSubtreeAction,
  undoArchive,
  type SessionSubtreeStore,
} from './sessionSubtreeActions';
import type { SessionNode } from '../types';

const session = (sessionId: string): Session => ({
  sessionId, rootSessionId: sessionId,
  projectId: 'project', workspaceId: 'workspace', displayPath: '.',
  createdAt: 1, updatedAt: 1, epoch: '1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

const t = (key: I18nKey) => key;

type Call = { method: keyof SessionSubtreeStore; ids: string[] };

const createStore = (failing: string[] = []) => {
  const calls: Call[] = [];
  const store: SessionSubtreeStore = {
    archiveSession: async (id) => {
      calls.push({ method: 'archiveSession', ids: [id] });
      return !failing.includes(id);
    },
    archiveSessions: async (ids) => {
      calls.push({ method: 'archiveSessions', ids });
      return {
        archivedIds: ids.filter((id) => !failing.includes(id)),
        failedIds: ids.filter((id) => failing.includes(id)),
      };
    },
    deleteSession: async (id) => {
      calls.push({ method: 'deleteSession', ids: [id] });
      return !failing.includes(id);
    },
    deleteSessions: async (ids) => {
      calls.push({ method: 'deleteSessions', ids });
      return {
        deletedIds: ids.filter((id) => !failing.includes(id)),
        failedIds: ids.filter((id) => failing.includes(id)),
      };
    },
  };
  return { calls, store };
};

describe('runSessionSubtreeAction', () => {
  test('archives a childless session through the single-session action', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('archive', session('root'), [], store, t);

    expect(calls).toEqual([{ method: 'archiveSession', ids: ['root'] }]);
    expect(outcome).toEqual({ succeededIds: ['root'], failedIds: [] });
  });

  test('reports a childless session the server refused to archive', async () => {
    const { store } = createStore(['root']);

    const outcome = await runSessionSubtreeAction('archive', session('root'), [], store, t);

    expect(outcome).toEqual({ succeededIds: [], failedIds: ['root'] });
  });

  test('archives the root together with every descendant in one batch', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('archive', session('root'), ['child', 'grandchild'], store, t);

    expect(calls).toEqual([{ method: 'archiveSessions', ids: ['root', 'child', 'grandchild'] }]);
    expect(outcome).toEqual({ succeededIds: ['root', 'child', 'grandchild'], failedIds: [] });
  });

  test('keeps the archived part of a subtree when one descendant fails', async () => {
    const { store } = createStore(['grandchild']);

    const outcome = await runSessionSubtreeAction('archive', session('root'), ['child', 'grandchild'], store, t);

    expect(outcome).toEqual({ succeededIds: ['root', 'child'], failedIds: ['grandchild'] });
  });

  test('deletes a childless session through the single-session action', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('delete', session('root'), [], store, t);

    expect(calls).toEqual([{ method: 'deleteSession', ids: ['root'] }]);
    expect(outcome).toEqual({ succeededIds: ['root'], failedIds: [] });
  });

  test('deletes the root together with every descendant in one batch', async () => {
    const { calls, store } = createStore();

    const outcome = await runSessionSubtreeAction('delete', session('root'), ['child', 'grandchild'], store, t);

    expect(calls).toEqual([{ method: 'deleteSessions', ids: ['root', 'child', 'grandchild'] }]);
    expect(outcome).toEqual({ succeededIds: ['root', 'child', 'grandchild'], failedIds: [] });
  });

  test('reports the descendant a subtree delete could not remove', async () => {
    const { store } = createStore(['grandchild']);

    const outcome = await runSessionSubtreeAction('delete', session('root'), ['child', 'grandchild'], store, t);

    expect(outcome).toEqual({ succeededIds: ['root', 'child'], failedIds: ['grandchild'] });
  });
});

describe('collectSessionSubtreeIds', () => {
  const linked = (id: string, parentSessionId: string | null, archivedAt?: number): Session => ({
    ...session(id), parentSessionId: parentSessionId ?? undefined,
    rootSessionId: parentSessionId ? 'root' : id, archivedAt,
  });

  beforeEach(() => {
    useGlobalSessionsStore.setState({
      activeSessions: [],
      archivedSessions: [],
      sessionsByDirectory: new Map(),
      entityById: new Map(),
      structure: {
        activeSessionIds: [],
        activeRootIds: [],
        activeChildrenByParentId: new Map(),
        activeIdsByDirectory: new Map(),
      },
      hasLoaded: false,
      status: 'idle',
    });
  });

  test('reaches an active session below an archived intermediate and skips the intermediate for archive', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('archived-child', 'root', 5),
      linked('leaf', 'archived-child'),
    ]);

    expect(collectSessionSubtreeIds('root', [], false)).toEqual(['leaf']);
  });

  test('includes archived descendants for delete', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('archived-child', 'root', 5),
      linked('leaf', 'archived-child'),
    ]);

    expect(collectSessionSubtreeIds('root', [], true)).toEqual(['archived-child', 'leaf']);
  });

  test('keeps descendants the surface already knows that the global cache has not seen', () => {
    useGlobalSessionsStore.getState().upsertSessions([linked('root', null), linked('cached-child', 'root')]);

    expect(collectSessionSubtreeIds('root', ['live-child', 'cached-child'], false)).toEqual(['live-child', 'cached-child']);
  });
});

<<<<<<< HEAD
=======
describe('collectParentIdDescendantIds', () => {
  beforeEach(resetGlobalSessions);

  const node = (session: Session, children: SessionNode[] = []): SessionNode => ({ session, children, worktree: null });

  const treeOf = () => {
    const root = node(linked('root', null));
    const subagent = node(linked('subagent', 'root'), [node(linked('grandchild', 'subagent'))]);
    const fork = node(linked('fork', null), [node(linked('fork-subagent', 'fork'))]);
    const review = node({ ...linked('review', null), metadata: { openchamber: { kind: 'review', originalSessionID: 'root' } } });
    const promoted = node({ ...linked('promoted', null), metadata: { openchamber: { btwPromoted: true } } });
    return node(root.session, [subagent, fork, review, promoted]);
  };

  test('takes the sessions OpenCode nests, not the ones the sidebar folds in', () => {
    expect(collectParentIdDescendantIds(treeOf())).toEqual(['subagent', 'grandchild']);
  });

  test('includes linked reviews while leaving forks and promoted btw sessions out of row actions', () => {
    const tree = treeOf();
    useGlobalSessionsStore.getState().upsertSessions([
      tree.session, ...tree.children.map((child) => child.session), linked('grandchild', 'subagent'),
    ]);

    expect(collectSessionSubtreeIds(tree.session.id, collectParentIdDescendantIds(tree), false))
      .toEqual(['subagent', 'grandchild', 'review']);
    expect(collectSessionSubtreeIds(tree.session.id, [], true))
      .toEqual(['subagent', 'grandchild', 'review']);
  });
});

describe('buildActiveSessionTreeFromCache', () => {
  beforeEach(resetGlobalSessions);

  test('builds the nested active tree a flat row does not render', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('grandchild', 'child'),
      linked('archived-child', 'root', 5),
      linked('below-archived', 'archived-child'),
    ]);

    const tree = buildActiveSessionTreeFromCache(linked('root', null));
    expect(tree.session.id).toBe('root');
    expect(tree.children.map((child) => child.session.id)).toEqual(['child']);
    expect(tree.children[0].children.map((child) => child.session.id)).toEqual(['grandchild']);
    expect(tree.children[0].children[0].children).toEqual([]);
  });
});

describe('collectSessionMoveDescendants', () => {
  const ids = (sessions: Session[]) => sessions.map((entry) => entry.id);

  beforeEach(resetGlobalSessions);

  test('a flat row with no rendered children still takes the whole active tree', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('grandchild', 'child'),
    ]);

    expect(ids(collectSessionMoveDescendants(linked('root', null), []))).toEqual(['child', 'grandchild']);
  });

  test('stops at an archived session, as the project tree does', () => {
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('child', 'root'),
      linked('archived-child', 'root', 5),
      linked('below-archived', 'archived-child'),
    ]);

    expect(ids(collectSessionMoveDescendants(linked('root', null), []))).toEqual(['child']);
  });

  test('keeps the rendered descendants and their order, adding what only the cache knows', () => {
    const rendered = linked('live-child', 'root');
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('live-child', 'root'),
      linked('cached-grandchild', 'live-child'),
    ]);

    const descendants = collectSessionMoveDescendants(linked('root', null), [rendered]);
    expect(ids(descendants)).toEqual(['live-child', 'cached-grandchild']);
    expect(descendants[0]).toBe(rendered);
  });
});

describe('the same root from the project tree and from a flat row', () => {
  const ids = (sessions: readonly Session[]) => sessions.map((entry) => entry.id);
  const sorted = (values: readonly string[]) => [...values].sort();

  beforeEach(resetGlobalSessions);

  test('resolves the same lineage for move, archive, and delete', () => {
    // root > a > b, root > archived > below-archived
    useGlobalSessionsStore.getState().upsertSessions([
      linked('root', null),
      linked('a', 'root'),
      linked('b', 'a'),
      linked('archived', 'root', 5),
      linked('below-archived', 'archived'),
    ]);
    const root = linked('root', null);
    // The project tree renders the active tree; a flat row renders no children.
    const treeDescendants = (function collect(node: ReturnType<typeof buildActiveSessionTreeFromCache>): Session[] {
      return node.children.flatMap((child) => [child.session, ...collect(child)]);
    })(buildActiveSessionTreeFromCache(root));
    expect(ids(treeDescendants)).toEqual(['a', 'b']);

    expect(ids(collectSessionMoveDescendants(root, treeDescendants))).toEqual(ids(collectSessionMoveDescendants(root, [])));
    expect(sorted(collectSessionSubtreeIds('root', ids(treeDescendants), false)))
      .toEqual(sorted(collectSessionSubtreeIds('root', [], false)));
    expect(sorted(collectSessionSubtreeIds('root', ids(treeDescendants), false))).toEqual(['a', 'b', 'below-archived']);
    expect(sorted(collectSessionSubtreeIds('root', ids(treeDescendants), true)))
      .toEqual(sorted(collectSessionSubtreeIds('root', [], true)));
  });
});

>>>>>>> bc50ba56a
describe('undoArchive', () => {
  const original = useSessionUIStore.getState();
  const restored: string[][] = [];
  const opened: Array<{ id: string | null; directory: string | null | undefined }> = [];

  beforeEach(() => {
    restored.length = 0;
    opened.length = 0;
    registerWorkspaceDirectory('workspace', '/workspace');
    useGlobalSessionsStore.getState().upsertSessions([session('root')]);
    useSessionUIStore.setState({
      currentSessionId: null,
      unarchiveSessions: async (ids) => {
        restored.push(ids);
        return { restoredIds: ids, failedIds: [] };
      },
      setCurrentSession: (id, directory) => {
        opened.push({ id, directory });
      },
    });
  });

  afterEach(() => {
    resetWorkspaceDirectories();
    useSessionUIStore.setState({
      currentSessionId: original.currentSessionId,
      unarchiveSessions: original.unarchiveSessions,
      setCurrentSession: original.setCurrentSession,
    });
  });

  const undo = (reopenId: string | null) => undoArchive(['root', 'child'], reopenId, getRuntimeKey(), t);

  test('restores exactly the archived sessions and reopens the session the archive closed', async () => {
    await undo('root');

    expect(restored).toEqual([['root', 'child']]);
    expect(opened).toEqual([{ id: 'root', directory: '/workspace' }]);
  });

  test('does not take the user away from a session opened after the archive', async () => {
    useSessionUIStore.setState({ currentSessionId: 'other' });

    await undo('root');

    expect(restored).toEqual([['root', 'child']]);
    expect(opened).toEqual([]);
  });
});
