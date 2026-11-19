import React from 'react';
import type { ChildStoreManager } from '@/sync/child-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { normalizePath } from '../utils';
import type { SessionGroup } from '../types';
import type { ProjectSection } from '../projects/sessionProjectRender';
import { getSessionFolderScopes } from '../sessions/sessionFolderIdentity';
import type { SessionSidebarGroupStatus } from '../sessionSidebarRowModel';

export interface SidebarGroupStatusResult {
  groupStatusByKey: Map<string, SessionSidebarGroupStatus>;
  bootstrapSnapshot: string;
}

export const useSidebarGroupStatus = ({
  childStores,
  sections,
  chatGroup,
  canGrantAccess,
}: {
  childStores: ChildStoreManager;
  sections: readonly ProjectSection[];
  chatGroup: SessionGroup | null;
  canGrantAccess: boolean;
}): SidebarGroupStatusResult => {
  const globalRefreshFailed = useGlobalSessionsStore((state) => state.globalRefreshFailed);
  const hasLoadedGlobalSessions = useGlobalSessionsStore((state) => state.hasLoaded);
  const discoveryErrors = useGlobalSessionsStore((state) => state.discoveryErrors);
  const groups = React.useMemo(() => [
    ...sections.flatMap((section) => section.groups.map((group) => ({ key: `${section.project.id}:${group.id}`, group, projectId: section.project.id }))),
    ...(chatGroup ? [{ key: 'activity:chats', group: chatGroup, projectId: 'chats' }] : []),
  ].map(({ key, group, projectId }) => ({
    key,
    archived: group.isArchivedBucket === true,
    projectId,
    directories: getSessionFolderScopes(group).map((scope) => normalizePath(scope.directory))
      .filter((directory): directory is string => Boolean(directory)),
    // Exact workspace IDs mapped from sessions in this group when available,
    // avoiding reliance on directory registration.
    groupSessionWorkspaceIds: new Set(
      group.sessions
        .map((node) => node.session.workspaceId)
        .filter((id) => Boolean(id)),
    ),
  })), [chatGroup, sections]);
  const directories = React.useMemo(() => [...new Set(groups.flatMap((group) => group.directories))], [groups]);
  const bootstrapSnapshot = React.useSyncExternalStore(
    React.useCallback((notify) => directories.length > 0 ? childStores.subscribeBootstrap(notify) : () => undefined, [childStores, directories.length]),
    React.useCallback(() => directories.map((directory) => (
      `${directory}\u0000${childStores.getBootstrapState(directory) ?? ''}\u0000${childStores.getBootstrapFailure(directory) ?? ''}\u0000${childStores.getInitializationState(directory) ?? ''}\u0000${childStores.getInitializationFailure(directory) ?? ''}`
    )).join('\u0001'), [childStores, directories]),
    React.useCallback(() => '', []),
  );
  const groupStatusByKey = React.useMemo(() => {
    // The snapshot invalidates these reads; the directory stores own their state.
    void bootstrapSnapshot;
    const statuses = new Map<string, SessionSidebarGroupStatus>();
    for (const { key, archived, directories: groupDirectories, groupSessionWorkspaceIds } of groups) {
      const failedDirectory = groupDirectories.find((directory) => (
        childStores.getBootstrapState(directory) === 'failed' || childStores.getInitializationState(directory) === 'failed'
      ));
      if (failedDirectory) {
        const listFailed = childStores.getBootstrapState(failedDirectory) === 'failed';
        const failure = listFailed ? childStores.getBootstrapFailure(failedDirectory) : childStores.getInitializationFailure(failedDirectory);
        statuses.set(key, {
          state: failure === 'os-permission' ? 'permission-denied' : listFailed ? 'load-failed' : 'initialization-failed',
          directory: failedDirectory,
          canGrantAccess: failure === 'os-permission' && canGrantAccess,
        });
      } else {
        // Group-scoped errors match either directly by exact workspace IDs present
        // in group sessions, by directory path, or by directory resolved concurrently
        // via bindKnownWorkspaceDirectories in loadSessions.
        const hasGroupScopedError = Boolean(
          discoveryErrors && discoveryErrors.size > 0 && (
            [...groupSessionWorkspaceIds].some((id) => discoveryErrors.has(id))
            || groupDirectories.some((dir) => discoveryErrors.has(dir)
              || [...discoveryErrors.keys()].some((k) => resolveWorkspaceDirectory(k) === dir))
          ),
        );
        if (hasGroupScopedError) {
          // The global list owns this failure even when it names one directory.
          statuses.set(key, {
            state: 'load-failed',
            directory: null,
            canGrantAccess: false,
          });
        } else {
          // Unopened directories rely on the global list. A previous complete
          // list keeps empty groups ready during background refreshes.
          const complete = hasLoadedGlobalSessions || (!archived && groupDirectories.length > 0
            && groupDirectories.every((directory) => childStores.getBootstrapState(directory) === 'complete'));
          const globalFailure = globalRefreshFailed && !complete;
          statuses.set(key, {
            state: complete ? 'ready' : globalFailure ? 'load-failed' : 'loading',
            // A null directory retries the global list, without initializing a location.
            directory: complete ? groupDirectories[0] ?? null : null,
            canGrantAccess: false,
          });
        }
      }
    }
    return statuses;
  }, [bootstrapSnapshot, canGrantAccess, childStores, groups, globalRefreshFailed, hasLoadedGlobalSessions, discoveryErrors]);
  return { groupStatusByKey, bootstrapSnapshot };
};
