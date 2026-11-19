import type { Session } from '@openchamber/agent-contract';
import { toast } from '@/components/ui';
import { createSessionOwnershipIndex } from '@/components/session/sidebar/sessions/sessionOwnership';
import { formatMessage, useI18nStore } from '@/lib/i18n';
import { hostFilesystem } from '@/lib/host-filesystem';
import { normalizePath } from '@/lib/pathNormalization';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { moveSessionToDirectory } from '@/sync/session-actions';
import { useSessionUIStore } from '@/sync/session-ui-store';

export type RestoredSessionRelocation =
  | { outcome: 'kept' }
  | { outcome: 'moved'; projectRoot: string }
  | { outcome: 'failed'; error: Error };

type RelocationDeps = {
  getSession: (sessionId: string) => Session | undefined;
  getActiveSessions: () => readonly Session[];
  getDirectoryAvailability: (directory: string) => Promise<'available' | 'missing' | 'unknown'>;
  resolveProjectRoot: (session: Session) => string | null;
  moveSession: (session: Session, sourceDirectory: string, destinationDirectory: string) => Promise<void>;
};

const resolveProjectRootFromStores = (session: Session): string | null => {
  const projects = useProjectsStore.getState().projects.flatMap((project) => {
    const normalizedPath = normalizePath(project.path);
    return normalizedPath ? [{ id: project.id, normalizedPath }] : [];
  });
  const ownership = createSessionOwnershipIndex(
    [session],
    projects,
    useSessionUIStore.getState().availableWorktreesByProject,
    [],
    Array.from(useSpacesStore.getState().spaces.values()),
  );
  return ownership.bySessionId.get(session.sessionId)?.projectRoot ?? null;
};

const defaultDeps: RelocationDeps = {
  getSession: (sessionId) => useGlobalSessionsStore.getState().entityById.get(sessionId),
  getActiveSessions: () => useGlobalSessionsStore.getState().activeSessions,
  getDirectoryAvailability: (directory) => hostFilesystem.getDirectoryAvailability(directory),
  resolveProjectRoot: resolveProjectRootFromStores,
  moveSession: moveSessionToDirectory,
};

const collectDescendantsInDirectory = (
  root: Session,
  sessions: readonly Session[],
  directory: string,
): Session[] => {
  const childrenByParent = new Map<string, Session[]>();
  for (const session of sessions) {
    if (!session.parentSessionId) continue;
    const siblings = childrenByParent.get(session.parentSessionId) ?? [];
    siblings.push(session);
    childrenByParent.set(session.parentSessionId, siblings);
  }
  const descendants: Session[] = [];
  const visit = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      visit(child.sessionId);
      if (normalizePath(child.displayPath) === directory) descendants.push(child);
    }
  };
  visit(root.sessionId);
  return descendants;
};

export async function relocateRestoredSessionIfDirectoryMissing(
  sessionId: string,
  deps: RelocationDeps = defaultDeps,
): Promise<RestoredSessionRelocation> {
  const session = deps.getSession(sessionId);
  const sourceDirectory = normalizePath(session?.displayPath ?? null);
  if (!session || !sourceDirectory) return { outcome: 'kept' };
  if (await deps.getDirectoryAvailability(sourceDirectory) !== 'missing') return { outcome: 'kept' };

  const projectRoot = normalizePath(deps.resolveProjectRoot(session));
  if (!projectRoot || projectRoot === sourceDirectory) return { outcome: 'kept' };
  if (await deps.getDirectoryAvailability(projectRoot) !== 'available') return { outcome: 'kept' };

  try {
    const tree = [...collectDescendantsInDirectory(session, deps.getActiveSessions(), sourceDirectory), session];
    for (const member of tree) {
      await deps.moveSession(member, sourceDirectory, projectRoot);
    }
    return { outcome: 'moved', projectRoot };
  } catch (error) {
    return { outcome: 'failed', error: error instanceof Error ? error : new Error(String(error)) };
  }
}

const projectLabelFor = (projectRoot: string): string => {
  const project = useProjectsStore.getState().projects.find((entry) => normalizePath(entry.path) === projectRoot);
  return project?.label?.trim() || projectRoot.split('/').filter(Boolean).pop() || projectRoot;
};

export async function relocateRestoredSessionWithNotice(sessionId: string): Promise<void> {
  const result = await relocateRestoredSessionIfDirectoryMissing(sessionId);
  const dictionary = useI18nStore.getState().dictionary;
  if (result.outcome === 'moved') {
    toast.info(formatMessage(dictionary, 'sessions.sidebar.session.restore.relocatedTitle'), {
      description: formatMessage(dictionary, 'sessions.sidebar.session.restore.relocatedDescription', {
        project: projectLabelFor(result.projectRoot),
      }),
    });
    return;
  }
  if (result.outcome === 'failed') {
    toast.error(formatMessage(dictionary, 'sessions.sidebar.session.restore.relocateFailed'), {
      description: result.error.message,
    });
  }
}
