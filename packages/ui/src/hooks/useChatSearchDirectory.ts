import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import { resolveCommandDirectory } from '@/stores/useCommandsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionWorktreeStore } from '@/sync/session-worktree-store';
import { getAttachedSessionDirectory } from '@/sync/session-worktree-contract';
import { useSessions } from '@/sync/sync-context';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

export const useChatSearchDirectory = (): string | undefined => {
  // Inside a chat the session is its column's, so a chat pinned in the side
  // panel searches its own session's project.
<<<<<<< HEAD
  const { sessionId: currentSessionId, directory: currentSessionDirectory } = useChatSessionSelection();
  const sessions = useSessions(currentSessionDirectory ?? undefined);
=======
  const { sessionId: currentSessionId } = useChatSessionSelection();
  const currentSessionOwnDirectory = useSessionDirectory(currentSessionId);
>>>>>>> bc50ba56a
  const worktreeAttachment = useSessionWorktreeStore((state) =>
    currentSessionId ? state.getAttachment(currentSessionId) : undefined
  );
  const worktreeMap = useSessionUIStore((state) => state.worktreeMetadata);
  const newSessionDraft = useSessionUIStore((state) => state.newSessionDraft);

  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projects = useProjectsStore((state) => state.projects);

  const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);

  if (currentSessionId) {
    if (currentSessionOwnDirectory) {
      return currentSessionOwnDirectory;
    }
    const attachmentDirectory = getAttachedSessionDirectory(worktreeAttachment);
    if (attachmentDirectory) {
      return attachmentDirectory;
    }
    const worktreeMetadata = worktreeMap.get(currentSessionId);
    if (worktreeMetadata?.path) {
      return worktreeMetadata.path;
    }
<<<<<<< HEAD

    const currentSession = sessions.find((session) => session.sessionId === currentSessionId);
    const sessionDirectory = currentSession ? resolveGlobalSessionDirectory(currentSession) : null;
    if (sessionDirectory) {
      return sessionDirectory;
    }
=======
>>>>>>> bc50ba56a
  }

  const draftDirectory = newSessionDraft?.open
    ? newSessionDraft.bootstrapPendingDirectory || newSessionDraft.directoryOverride
    : null;
  if (!currentSessionId && newSessionDraft?.open && draftDirectory) {
    const target = resolveCommandDirectory(draftDirectory, newSessionDraft);
    return target.status === 'resolved' ? target.directory ?? undefined : undefined;
  }

  if (activeProjectId) {
    const activeProject = projects.find((project) => project.id === activeProjectId);
    if (activeProject?.path) {
      return activeProject.path;
    }
  }

  return fallbackDirectory ?? undefined;
};
