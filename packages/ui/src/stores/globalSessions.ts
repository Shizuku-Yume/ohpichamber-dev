import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type SessionDiscoveryResult = { items: Session[]; errors: Record<string, string> };

// A public workspace DTO intentionally does not contain a Host filesystem path.
// Only the directory which a caller passed to resolveWorkspace may bind its ID.
const directoriesByWorkspaceId = new Map<string, string>();
let directoryRuntimeKey = getRuntimeKey();
const directoryListeners = new Set<() => void>();

export const subscribeWorkspaceDirectories = (listener: () => void): (() => void) => {
  directoryListeners.add(listener);
  return () => { directoryListeners.delete(listener); };
};

const ensureDirectoryRuntime = (): void => {
  const runtimeKey = getRuntimeKey();
  if (runtimeKey === directoryRuntimeKey) return;
  directoriesByWorkspaceId.clear();
  directoryRuntimeKey = runtimeKey;
};

export const registerWorkspaceDirectory = (workspaceId: string, directory: string): void => {
  ensureDirectoryRuntime();
  const normalized = normalizePath(directory);
  if (!normalized || (!normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized))) return;
  if (directoriesByWorkspaceId.get(workspaceId) === normalized) return;
  directoriesByWorkspaceId.set(workspaceId, normalized);
  for (const listener of directoryListeners) listener();
};

export const resolveWorkspaceDirectory = (workspaceId: string): string | null => {
  ensureDirectoryRuntime();
  return directoriesByWorkspaceId.get(workspaceId) ?? null;
};

export const resetWorkspaceDirectories = (): void => {
  directoriesByWorkspaceId.clear();
  directoryRuntimeKey = getRuntimeKey();
};

export const splitGlobalSessionsByArchived = (sessions: Session[]): { active: Session[]; archived: Session[] } => {
  const active: Session[] = [];
  const archived: Session[] = [];
  for (const session of sessions) {
    if (session.archivedAt !== undefined) archived.push(session);
    else active.push(session);
  }
  return { active, archived };
};

/** Discovery errors identify an individual session or native workspace scope. */
export const isSessionDiscoveryFailed = (session: Session, errors: Readonly<Record<string, string>>): boolean => (
  Object.hasOwn(errors, session.sessionId)
  || Object.hasOwn(errors, session.workspaceId)
);

/** Host metadata and archives advance independently from runtime execution state. */
export const compareSessionRevision = (left: string, right: string): number => (
  left.length === right.length ? (left < right ? -1 : left > right ? 1 : 0) : left.length - right.length
);

export const mergeSessionDirectoryMetadata = (incoming: Session, existing?: Session | null): Session => {
  if (!existing || existing.sessionId !== incoming.sessionId) return incoming;
  const keepMetadata = compareSessionRevision(incoming.metadataRevision, existing.metadataRevision) < 0;
  const keepArchive = compareSessionRevision(incoming.archiveRevision, existing.archiveRevision) < 0;
  if (!keepMetadata && !keepArchive) return incoming;
  return {
    ...incoming,
    ...(keepMetadata ? { metadata: existing.metadata, metadataRevision: existing.metadataRevision } : {}),
    ...(keepArchive ? { archivedAt: existing.archivedAt, archiveRevision: existing.archiveRevision } : {}),
  };
};
