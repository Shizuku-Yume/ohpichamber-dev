import type { ExternalToast } from 'sonner';
import type { Session } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { takeSessionActionFailure } from '@/sync/session-action-failures';
import { describeSessionActionError } from './sessionActionError';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { readGlobalSessionLineage } from '@/stores/sessionLineage';
import { useSessionUIStore, type SessionUIState } from '@/sync/session-ui-store';
import { buildActiveSessionNode } from '../list/sessionCollection';
import type { SessionNode } from '../types';

type Translate = (key: I18nKey, params?: I18nParams) => string;

export type SessionSubtreeAction = 'archive' | 'delete';

export type SessionSubtreeStore = Pick<
 SessionUIState,
 'archiveSession' | 'archiveSessions' | 'deleteSession' | 'deleteSessions'
>;

type SessionSubtreeOutcome = {
 succeededIds: string[];
 failedIds: string[];
};

<<<<<<< HEAD
/**
 * Every descendant an archive or delete should reach, resolved when the user
 * acts rather than while rows render.
 *
 * `knownDescendantIds` is what the surface already sees: a row's `parentID`
 * children on desktop, the active list on mobile. Both stop at an archived child, so an
 * active subagent under an archived intermediate stayed behind (an edge #2580
 * pointed out). The global cache holds active and archived sessions together,
 * so walking it from the root reaches through archived intermediates. Archived
 * sessions are then dropped for archive, which must not retimestamp them, and
 * kept for delete, which removes the whole subtree.
 */
||||||| bc50ba56aa
/**
 * Every descendant an archive or delete should reach, resolved when the user
 * acts rather than while rows render.
 *
 * `knownDescendantIds` is what the surface already sees: a row's `parentID`
 * children on desktop, the active list on mobile. Both stop at an archived child, so an
 * active subagent under an archived intermediate stayed behind (an edge #2580
 * pointed out). The global lineage reaches through archived intermediates:
 * archive takes the active sessions below, since it must not restamp archived
 * ones, and delete takes the whole subtree.
 */
=======
>>>>>>> upstream/main
export const collectSessionSubtreeIds = (
 rootId: string,
 knownDescendantIds: readonly string[],
 includeArchived: boolean,
): string[] => {
 const ids = new Set(knownDescendantIds);
 const descendants = readGlobalSessionLineage().descendantsOf(rootId, includeArchived ? 'all' : 'activeThroughArchived');
 for (const descendant of descendants) ids.add(descendant.sessionId);
 ids.delete(rootId);
 return [...ids];
};

export const collectParentIdDescendantIds = (root: SessionNode): string[] => {
 const ids: string[] = [];
 const visit = (node: SessionNode): void => {
  for (const child of node.children) {
   if (child.session.parentSessionId !== node.session.sessionId) continue;
   ids.push(child.session.sessionId);
   visit(child);
  }
 };
 visit(root);
 return ids;
};

export const buildActiveSessionTreeFromCache = (root: Session): SessionNode => {
 const childrenByParentId = new Map<string, Session[]>();
 for (const session of readGlobalSessionLineage().descendantsOf(root.sessionId, 'active')) {
  const parentId = session.parentSessionId;
  if (!parentId) continue;
  const siblings = childrenByParentId.get(parentId) ?? [];
  siblings.push(session);
  childrenByParentId.set(parentId, siblings);
 }
 return buildActiveSessionNode(childrenByParentId, root);
};

export const collectSessionMoveDescendants = (root: Session, knownDescendants: readonly Session[]): Session[] => {
 const descendants = new Map(knownDescendants.map((session) => [session.sessionId, session]));
 for (const descendant of readGlobalSessionLineage().descendantsOf(root.sessionId, 'active')) {
  if (!descendants.has(descendant.sessionId)) descendants.set(descendant.sessionId, descendant);
 }
 descendants.delete(root.sessionId);
 return [...descendants.values()];
};

const failureDescription = (ids: readonly string[], t: Translate): { description: string } | undefined => {
 const error = takeSessionActionFailure(ids);
 return error ? { description: describeSessionActionError(error, t) } : undefined;
};

export const undoArchive = async (
 archivedIds: readonly string[],
 reopenId: string | null,
 runtimeKey: string,
 t: Translate,
): Promise<void> => {
 const { restoredIds, failedIds } = await useSessionUIStore.getState()
  .unarchiveSessions([...archivedIds], { expectedRuntimeKey: runtimeKey, undo: true });
 if (failedIds.length > 0) {
  toast.error(t('sessions.sidebar.session.restore.error'), failureDescription(failedIds, t));
 }
 if (!reopenId || !restoredIds.includes(reopenId)) return;
 const ui = useSessionUIStore.getState();
 if (ui.currentSessionId !== null || getRuntimeKey() !== runtimeKey) return;
 const session = useGlobalSessionsStore.getState().entityById.get(reopenId);
 if (session) ui.setCurrentSession(reopenId, resolveGlobalSessionDirectory(session));
};

export const archiveUndoToastOptions = (
 archivedIds: readonly string[],
 reopenId: string | null,
 t: Translate,
): ExternalToast => {
 const runtimeKey = getRuntimeKey();
 return {
  action: {
   label: t('sessions.sidebar.session.archive.undo'),
   onClick: () => { void undoArchive(archivedIds, reopenId, runtimeKey, t); },
  },
 };
};

<<<<<<< HEAD
/**
 * Archive or hard-delete a session together with its descendants.
 *
 * The server does not cascade archive state, so a parent archived on its own
 * leaves its subagents active as orphan roots. Desktop sidebar rows, Recent,
 * managed Chats, and the mobile sessions sheet resolve the subtree first and
 * run it through here, so the calls made and the outcome the user sees stay
 * the same: a lone session keeps the singular copy, a subtree reports counts,
 * and a partial failure says how many sessions were left behind.
 */
||||||| bc50ba56aa
/**
 * Archive or hard-delete a session together with its descendants.
 *
 * The server does not cascade `time.archived`, so a parent archived on its own
 * leaves its subagents active as orphan roots. Desktop sidebar rows, Recent,
 * managed Chats, and the mobile sessions sheet resolve the subtree first and
 * run it through here, so the calls made and the outcome the user sees stay
 * the same: a lone session keeps the singular copy, a subtree reports counts,
 * and a partial failure says how many sessions were left behind.
 */
=======
>>>>>>> upstream/main
export const runSessionSubtreeAction = async (
 action: SessionSubtreeAction,
 session: Session,
 descendantIds: readonly string[],
 store: SessionSubtreeStore,
 t: Translate,
): Promise<SessionSubtreeOutcome> => {
 const hardDelete = action === 'delete';
 const reopenId = useSessionUIStore.getState().currentSessionId === session.sessionId ? session.sessionId : null;
 if (descendantIds.length === 0) {
  const success = hardDelete
   ? await store.deleteSession(session.sessionId)
   : await store.archiveSession(session.sessionId);
  if (success) {
   if (hardDelete) toast.success(t('sessions.sidebar.session.delete.success'));
   else toast.success(t('sessions.sidebar.session.archive.success'), archiveUndoToastOptions([session.sessionId], reopenId, t));
   return { succeededIds: [session.sessionId], failedIds: [] };
  }
  toast.error(hardDelete
   ? t('sessions.sidebar.session.delete.error')
   : t('sessions.sidebar.session.archive.error'), failureDescription([session.sessionId], t));
  return { succeededIds: [], failedIds: [session.sessionId] };
 }

<<<<<<< HEAD
 const ids = [session.sessionId, ...descendantIds];
 if (hardDelete) {
  // Delete root + all descendants individually. If the server
  // cascade-deletes some children before we get to them, 404 is
  // treated as success by deleteSession and no rollback occurs.
  const { deletedIds, failedIds } = await store.deleteSessions(ids);
  if (failedIds.length === 0) {
   const totalDeleted = deletedIds.length;
   toast.success(totalDeleted === 1
    ? t('sessions.sidebar.bulkActions.deletedSingle', { count: totalDeleted })
    : t('sessions.sidebar.bulkActions.deletedPlural', { count: totalDeleted }));
  } else {
   toast.error(t('sessions.sidebar.session.delete.error'), failureDescription(failedIds, t));
||||||| bc50ba56aa
  const ids = [session.id, ...descendantIds];
  if (hardDelete) {
    // Delete root + all descendants individually. If the server
    // cascade-deletes some children before we get to them, 404 is
    // treated as success by deleteSession and no rollback occurs.
    const { deletedIds, failedIds } = await store.deleteSessions(ids);
    if (failedIds.length === 0) {
      const totalDeleted = deletedIds.length;
      toast.success(totalDeleted === 1
        ? t('sessions.sidebar.bulkActions.deletedSingle', { count: totalDeleted })
        : t('sessions.sidebar.bulkActions.deletedPlural', { count: totalDeleted }));
    } else {
      toast.error(t('sessions.sidebar.session.delete.error'), failureDescription(failedIds, t));
    }
    return { succeededIds: deletedIds, failedIds };
=======
  const ids = [session.id, ...descendantIds];
  if (hardDelete) {
    const { deletedIds, failedIds } = await store.deleteSessions(ids);
    if (failedIds.length === 0) {
      const totalDeleted = deletedIds.length;
      toast.success(totalDeleted === 1
        ? t('sessions.sidebar.bulkActions.deletedSingle', { count: totalDeleted })
        : t('sessions.sidebar.bulkActions.deletedPlural', { count: totalDeleted }));
    } else {
      toast.error(t('sessions.sidebar.session.delete.error'), failureDescription(failedIds, t));
    }
    return { succeededIds: deletedIds, failedIds };
>>>>>>> upstream/main
  }
  return { succeededIds: deletedIds, failedIds };
 }

 const { archivedIds, failedIds } = await store.archiveSessions(ids);
 if (archivedIds.length > 0) {
  toast.success(archivedIds.length === 1
   ? t('sessions.sidebar.bulkActions.archivedSingle', { count: archivedIds.length })
   : t('sessions.sidebar.bulkActions.archivedPlural', { count: archivedIds.length }),
   archiveUndoToastOptions(archivedIds, reopenId, t));
 }
 if (failedIds.length > 0) {
  toast.error(failedIds.length === 1
   ? t('sessions.sidebar.bulkActions.failedArchiveSingle', { count: failedIds.length })
   : t('sessions.sidebar.bulkActions.failedArchivePlural', { count: failedIds.length }), failureDescription(failedIds, t));
 }
 return { succeededIds: archivedIds, failedIds };
};
