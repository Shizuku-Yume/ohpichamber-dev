import type { Session } from '@openchamber/agent-contract';
import { isChatDirectoryPath } from '@/lib/chatDirectories';
import { normalizePath } from '@/lib/pathNormalization';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';

/**
 * Which working set of header tabs a place in the app shows, with separate
 * tabs per workspace on: one per project root, worktree and isolated space,
 * found by the folder sessions run in, and one for all chats, each per
 * instance, so switching servers never mixes their tabs. Tabs stay on the
 * device (`useSessionTabsStore`), so another browser keeps its own sets.
 */
export const sessionTabChatsScope = (runtimeKey: string): string => `${runtimeKey}|chats`;

export const sessionTabScopeFor = (runtimeKey: string, directory: string | null): string | null => {
  if (isChatDirectoryPath(directory)) return sessionTabChatsScope(runtimeKey);
  const normalized = normalizePath(directory);
  return normalized ? `${runtimeKey}|${normalized}` : null;
};

/**
 * The sessions a worktree or space opens with the first time it is shown:
 * the ones the user started there (no subagents, nothing archived), the most
 * recent first. A project root opens with none, since it can hold hundreds,
 * and so do chats.
 */
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
