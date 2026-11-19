import type { Session } from '@openchamber/agent-contract';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

export const sessionTabChatsScope = (runtimeKey: string): string => `${runtimeKey}|chats`;

export const sessionTabScopeFor = (runtimeKey: string, directory: string | null): string | null => {
  if (isChatDirectoryPath(directory)) return sessionTabChatsScope(runtimeKey);
  const normalized = normalizePath(directory);
  return normalized ? `${runtimeKey}|${normalized}` : null;
};

export const sessionTabSeedFor = (
  directory: string | null,
  sessions: readonly Session[],
  projectRoots: readonly string[],
): string[] => {
  const normalized = normalizePath(directory);
  if (!normalized || isChatDirectoryPath(normalized)) return [];
  if (projectRoots.some((root) => normalizePath(root) === normalized)) return [];
  return sessions
    .filter((session) => !session.parentSessionId && !session.archivedAt && normalizePath(resolveGlobalSessionDirectory(session)) === normalized)
    // A canonical session's `updatedAt` is its last activity; `displayPath` is
    // project-relative and cannot name the folder it runs in.
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((session) => session.sessionId);
};
