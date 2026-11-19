import React from 'react';
import { useI18n } from '@/lib/i18n';
import { SessionNodeItem } from './SessionNodeItem';
import type { SessionNodeItemProps } from './SessionNodeItem';
import type { SessionNode } from '../types';
import { listedChildren } from '../listedChildren';
import type { SessionSidebarRenderContext } from '../sessionSidebarRowModel';
import type { SessionNodeRenderExtras } from './sessionNodeItemUtils';
import { useSessionActions, type DeleteSessionConfirmState } from './useSessionActions';
import { collectParentIdDescendantIds } from './sessionSubtreeActions';
import { useSessionFoldersStore } from '@/stores/useSessionFoldersStore';
import { useUIStore } from '@/stores/useUIStore';
import { SessionDeleteConfirmDialog } from '../shell/ConfirmDialogs';
import { streamPerfCount } from '@/stores/utils/streamDebug';
import { sameMultiRunIdentity } from '@/lib/multirun/identity';
import { normalizePath } from '../utils';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

type Context = {
  groupDirectory?: string | null;
  projectId?: string | null;
  folderOwnerKey?: string | null;
  ownerProjectId?: string | null;
  selectionScopeKey?: string | null;
  archivedBucket?: boolean;
  secondaryMeta?: { projectLabel?: string | null; branchLabel?: string | null; inSpace?: boolean } | null;
  renderContext?: SessionSidebarRenderContext;
  detailed?: boolean;
  repeat?: boolean;
  rowKey?: string;
  dragKey?: string;
};

type SessionTreeItemRenderProps = Context & Pick<SessionNodeItemProps,
  | 'expandedParents'
  | 'editingId'
  | 'editingRowKey'
  | 'editTitle'
  | 'openSidebarMenuKey'
  | 'mobileVariant'
  | 'alwaysShowActions'
> & {
  node: SessionNode;
  pinnedSessionIds: Set<string>;
  depth?: number;
  ownsWork?: boolean;
  renderExtras?: SessionNodeRenderExtras;
};

export type SessionTreeItemProps = SessionTreeItemRenderProps & Pick<SessionNodeItemProps,
  | 'setEditingId'
  | 'setEditingRowKey'
  | 'setEditTitle'
  | 'toggleParent'
  | 'setOpenSidebarMenuKey'
  | 'startSessionWorktreeMenuLoad'
> & {
  allowReselect: boolean;
  onSessionSelected?: (sessionId: string) => void;
  deleteSessionConfirm: DeleteSessionConfirmState;
  setDeleteSessionConfirm: (value: DeleteSessionConfirmState) => void;
  startFolderRename: (scopeKey: string, folder: { id: string; name: string }) => void;
  renderChildren?: boolean;
};

const EMPTY_SUBTREE_CONTAINS_EDITING: Set<string> = new Set();

function SessionTreeItemComponent({
  node,
  depth = 0,
  ownsWork = true,
  groupDirectory,
  projectId,
  folderOwnerKey,
  ownerProjectId,
  selectionScopeKey,
  archivedBucket = false,
  secondaryMeta,
  renderContext = 'project',
  detailed = false,
  repeat = false,
  rowKey,
  dragKey,
  renderExtras,
  pinnedSessionIds,
  expandedParents,
  editingId,
  editingRowKey,
  setEditingId,
  setEditingRowKey,
  editTitle,
  setEditTitle,
  toggleParent,
  openSidebarMenuKey,
  setOpenSidebarMenuKey,
  allowReselect,
  onSessionSelected,
  deleteSessionConfirm,
  setDeleteSessionConfirm,
  startFolderRename,
  startSessionWorktreeMenuLoad,
  mobileVariant,
  alwaysShowActions,
  renderChildren = true,
}: SessionTreeItemProps): React.ReactNode {
  streamPerfCount('ui.sidebar_tree_item.render');
  const { t } = useI18n();
  const effectiveRowKey = rowKey ?? `${renderContext}:${archivedBucket ? 'archived' : 'active'}:${node.session.sessionId}`;
  const createFolder = useSessionFoldersStore((state) => state.createFolder);
  const toggleFolderCollapse = useSessionFoldersStore((state) => state.toggleFolderCollapse);
  const showDeletionDialog = useUIStore((state) => state.showDeletionDialog);
  const setShowDeletionDialog = useUIStore((state) => state.setShowDeletionDialog);
  const descendantIdsKey = React.useMemo(
    () => collectParentIdDescendantIds(node).join('\n'),
    [node],
  );
  const descendantIds = React.useMemo(
    () => (descendantIdsKey ? descendantIdsKey.split('\n') : []),
    [descendantIdsKey],
  );
  const createFolderAndStartRename = React.useCallback((scopeKey: string, parentId?: string | null) => {
    if (!scopeKey) return null;
    if (parentId && useSessionFoldersStore.getState().collapsedFolderIds.has(parentId)) toggleFolderCollapse(parentId);
    const folder = createFolder(scopeKey, t('sessions.sidebar.folders.newFolderTitle'), parentId);
    startFolderRename(scopeKey, folder);
    return folder;
  }, [createFolder, startFolderRename, t, toggleFolderCollapse]);
  const sessionActions = useSessionActions({
    mobileVariant,
    allowReselect,
    onSessionSelected,
    descendantIds,
    showDeletionDialog,
    setDeleteSessionConfirm,
    deleteSessionConfirm,
    editingId,
    setEditingId,
    setEditingRowKey,
    editingSessionId: node.session.sessionId,
    editingOccurrenceKey: effectiveRowKey,
    editTitle,
    setEditTitle,
  });
  const childRenderExtrasFor = renderExtras?.childRenderExtrasFor;
  const childContext: Context = {
    groupDirectory: resolveGlobalSessionDirectory(node.session) ?? groupDirectory,
    projectId,
    archivedBucket,
    renderContext,
  };
  return <>
    <SessionNodeItem
      expandedParents={expandedParents}
      editingId={editingId}
      editingRowKey={editingRowKey}
      setEditingId={setEditingId}
      setEditingRowKey={setEditingRowKey}
      editTitle={editTitle}
      setEditTitle={setEditTitle}
       handleSaveEdit={sessionActions.handleSaveEdit}
       handleCancelEdit={sessionActions.handleCancelEdit}
      toggleParent={toggleParent}
       handleSessionSelect={sessionActions.handleSessionSelect}
       handleSessionDoubleClick={sessionActions.handleSessionDoubleClick}
      openSidebarMenuKey={openSidebarMenuKey}
      setOpenSidebarMenuKey={setOpenSidebarMenuKey}
      createFolderAndStartRename={createFolderAndStartRename}
        handleDeleteSession={sessionActions.handleDeleteSession}
        handleRestoreSession={sessionActions.handleRestoreSession}
       startSessionWorktreeMenuLoad={startSessionWorktreeMenuLoad}
       mobileVariant={mobileVariant}
       alwaysShowActions={alwaysShowActions}
        pinnedSessionIds={pinnedSessionIds}
      node={node}
      depth={depth}
      ownsWork={ownsWork}
      groupDirectory={groupDirectory}
      projectId={projectId}
      folderOwnerKey={folderOwnerKey}
      ownerProjectId={ownerProjectId}
      selectionScopeKey={selectionScopeKey}
      archivedBucket={archivedBucket}
      secondaryMeta={secondaryMeta}
      renderContext={renderContext}
      detailed={detailed}
      repeat={repeat}
      rowKey={effectiveRowKey}
      dragKey={dragKey ?? rowKey ?? node.session.sessionId}
      subtreeContainsEditing={renderExtras?.subtreeContainsEditing ?? EMPTY_SUBTREE_CONTAINS_EDITING}
      menuOpenSessionId={renderExtras?.menuOpenSessionId ?? null}
      nodeStructureKey={renderExtras?.nodeStructureKey ?? ''}
      blockingBadgeSessionScopes={renderExtras?.blockingBadgeSessionScopes}
      relativeTimeTick={renderExtras?.relativeTimeTick}
    >
      {renderChildren ? listedChildren(node).map((child) => (
        <SessionTreeItem
          key={child.session.sessionId}
           node={child}
           pinnedSessionIds={pinnedSessionIds}
          expandedParents={expandedParents}
          editingId={editingId}
          editingRowKey={editingRowKey}
          setEditingId={setEditingId}
          setEditingRowKey={setEditingRowKey}
           editTitle={editTitle}
          setEditTitle={setEditTitle}
           toggleParent={toggleParent}
           openSidebarMenuKey={openSidebarMenuKey}
           setOpenSidebarMenuKey={setOpenSidebarMenuKey}
           allowReselect={allowReselect}
           onSessionSelected={onSessionSelected}
           deleteSessionConfirm={deleteSessionConfirm}
           setDeleteSessionConfirm={setDeleteSessionConfirm}
            startFolderRename={startFolderRename}
            startSessionWorktreeMenuLoad={startSessionWorktreeMenuLoad}
           mobileVariant={mobileVariant}
           alwaysShowActions={alwaysShowActions}
           depth={depth + 1}
           ownsWork={false}
           folderOwnerKey={folderOwnerKey}
           ownerProjectId={ownerProjectId}
           selectionScopeKey={selectionScopeKey}
          {...childContext}
          renderExtras={childRenderExtrasFor?.(child)}
        />
      )) : null}
    </SessionNodeItem>
    {deleteSessionConfirm?.session.sessionId === node.session.sessionId ? <SessionDeleteConfirmDialog
      value={deleteSessionConfirm}
      setValue={setDeleteSessionConfirm}
      showDeletionDialog={showDeletionDialog}
      setShowDeletionDialog={setShowDeletionDialog}
      onConfirm={sessionActions.confirmDeleteSession}
    /> : null}
  </>;
}

const isSameSessionForRow = (prev: SessionNode, next: SessionNode): boolean => (
  prev.session.sessionId === next.session.sessionId
  && prev.session.title === next.session.title
  && resolveGlobalSessionDirectory(prev.session) === resolveGlobalSessionDirectory(next.session)
  && prev.session.parentSessionId === next.session.parentSessionId
  && prev.session.createdAt === next.session.createdAt
  && prev.session.updatedAt === next.session.updatedAt
  && (prev.session.archivedAt !== undefined) === (next.session.archivedAt !== undefined)
  && sameMultiRunIdentity(prev.session, next.session)
  && normalizePath(prev.worktree?.path ?? null) === normalizePath(next.worktree?.path ?? null)
  && prev.worktree?.branch === next.worktree?.branch
  && prev.children.length === next.children.length
);

const areSessionTreeItemPropsEqual = (prev: SessionTreeItemProps, next: SessionTreeItemProps): boolean => {
  if (prev.node !== next.node && !isSameSessionForRow(prev.node, next.node)) return false;
  if ((prev.renderExtras?.nodeStructureKey ?? '') !== (next.renderExtras?.nodeStructureKey ?? '')) return false;
  if ((prev.renderExtras?.menuOpenSessionId ?? null) !== (next.renderExtras?.menuOpenSessionId ?? null)) return false;
  if (prev.renderExtras?.relativeTimeTick !== next.renderExtras?.relativeTimeTick) return false;
  const id = next.node.session.sessionId;
  if ((prev.renderExtras?.subtreeContainsEditing?.has(id) ?? false) !== (next.renderExtras?.subtreeContainsEditing?.has(id) ?? false)) return false;
  if ((prev.secondaryMeta?.projectLabel ?? null) !== (next.secondaryMeta?.projectLabel ?? null)) return false;
  if ((prev.secondaryMeta?.branchLabel ?? null) !== (next.secondaryMeta?.branchLabel ?? null)) return false;
  if ((prev.secondaryMeta?.inSpace ?? false) !== (next.secondaryMeta?.inSpace ?? false)) return false;
  const scalarKeys = [
    'depth', 'ownsWork', 'groupDirectory', 'projectId', 'folderOwnerKey', 'ownerProjectId', 'selectionScopeKey', 'archivedBucket',
    'renderContext', 'detailed', 'repeat', 'rowKey', 'dragKey', 'renderChildren',
    'editingId', 'editingRowKey', 'editTitle', 'openSidebarMenuKey',
    'mobileVariant', 'alwaysShowActions', 'allowReselect',
    'pinnedSessionIds', 'expandedParents', 'deleteSessionConfirm',
    'setEditingId', 'setEditingRowKey', 'setEditTitle', 'toggleParent', 'setOpenSidebarMenuKey',
    'startSessionWorktreeMenuLoad', 'onSessionSelected',
    'setDeleteSessionConfirm', 'startFolderRename',
  ] as const;
  for (const key of scalarKeys) {
    if (prev[key] !== next[key]) return false;
  }
  return true;
};

export const SessionTreeItem = React.memo(SessionTreeItemComponent, areSessionTreeItemPropsEqual);
