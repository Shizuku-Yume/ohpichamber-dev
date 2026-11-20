
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
/**
 * Resolves a workspace's relative `displayPath` against its admitted project
 * root directory. Absolute inputs or paths escaping the filesystem root return
 * null so only verified Host-relative paths reach workspace admission.
 */
export const resolveWorkspaceDisplayPath = (root: string, displayPath: string): string | null => {
  const normalizedRoot = normalizePath(root);
  if (!normalizedRoot) return null;
  const trimmed = displayPath.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed === '.') return normalizedRoot;
  if (trimmed.startsWith('/') || /^[A-Za-z]:/.test(trimmed)) return null;
  const driveMatch = /^([A-Za-z]:)(?:\/(.*))?$/.exec(normalizedRoot);
  const prefix = driveMatch ? driveMatch[1]! : normalizedRoot.startsWith('/') ? '/' : null;
  if (!prefix) return null;
  const baseBody = driveMatch ? (driveMatch[2] ?? '') : normalizedRoot.slice(1);
  const stack = baseBody.split('/').filter(Boolean);
  for (const segment of trimmed.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return prefix === '/' ? `/${stack.join('/')}` : `${prefix}/${stack.join('/')}`;
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

/** Discovery errors identify an individual session or native project/workspace scope. */
export const isSessionDiscoveryFailed = (session: Session, errors: Readonly<Record<string, string>>): boolean => (
  Object.hasOwn(errors, session.sessionId)
  || Object.hasOwn(errors, session.workspaceId)
  || Object.hasOwn(errors, session.projectId)
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

export type SessionPageLister = (options: SessionListOptions) => Promise<SessionPage>;
