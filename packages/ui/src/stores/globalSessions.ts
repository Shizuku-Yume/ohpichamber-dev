<<<<<<< HEAD
import type { Session } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey } from '@/lib/runtime-switch';
=======
import type { Session } from "@/lib/opencode/model";
import type { SessionListOptions, SessionPage } from "@/lib/opencode/client";
import type { SpaceMark } from "@/lib/spaces/spaces-store";
import { runSessionListNetworkTask } from '@/lib/background-network';
import { captureRuntimeInstance } from '@/lib/runtime-switch';
import { retry } from "@/sync/retry";
import { stripSessionListDetails } from "@/sync/sanitize";
import { startSessionLoadPerformanceEvent } from "@/sync/session-load-performance";
import { isChatDirectoryPath } from '@/lib/chatDirectories';
>>>>>>> bc50ba56a

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
<<<<<<< HEAD
=======

/** One page request. Injected so callers and tests can supply their own transport. */
export type SessionPageLister = (options: SessionListOptions) => Promise<SessionPage>;

/**
 * Walks every page of a session list and returns the records.
 *
 * v2 lists sessions newest-first and pages by an opaque cursor. Callers take
 * the whole list and split it with `splitGlobalSessionsByArchived`: OpenCode's
 * archived filter cannot see sessions the server's archive file marks.
 */
export async function listGlobalSessionPages(
    listPage: SessionPageLister,
    options: {
        directory?: string;
        /** Only the direct children of this session. */
        parentID?: string;
        pageSize: number;
        onPage?: (sessions: GlobalSessionRecord[]) => void;
        /** Stop after accepting this page, while retaining every record it returned. */
        stopAfterPage?: (sessions: GlobalSessionRecord[]) => boolean;
        /** The first page's isolated-space marks: `null` when the page carried none. */
        onSpaces?: (spaces: SpaceMark[] | null) => void;
    },
): Promise<GlobalSessionRecord[]> {
    const all: GlobalSessionRecord[] = [];
    const isCurrent = captureRuntimeInstance();
    const seenIds = new Set<string>();
    let cursor: string | undefined;
    const operation = options.directory ? "bootstrap.sessions.all" : "global-sessions.all";

    while (true) {
        let attempts = 0;
        const finishPerformanceEvent = startSessionLoadPerformanceEvent({
            operation,
            caller: cursor === undefined ? "initial-page" : "pagination",
        });
        const page = await retry(
            () => runSessionListNetworkTask(async () => {
                if (!isCurrent()) throw new Error('Runtime instance changed');
                attempts += 1;
                return await listPage({
                    ...(options.directory ? { directory: options.directory } : { global: true }),
                    parentID: options.parentID,
                    limit: options.pageSize,
                    ...(cursor !== undefined ? { cursor } : {}),
                });
            }),
            { attempts: 3, delay: 500, retryIf: () => isCurrent() },
        ).catch((error) => {
            finishPerformanceEvent("error", { retryCount: Math.max(0, attempts - 1) });
            throw error;
        });

        if (page === undefined) {
            finishPerformanceEvent("error", { retryCount: Math.max(0, attempts - 1) });
            throw new Error('Runtime instance changed');
        }
        if (cursor === undefined) options.onSpaces?.(page.spaces ?? null);
        const payload = page.sessions.map((session) => stripSessionListDetails(session) as GlobalSessionRecord);
        finishPerformanceEvent("complete", {
            retryCount: Math.max(0, attempts - 1),
            recordCount: payload.length,
        });

        const accepted: GlobalSessionRecord[] = [];
        for (const session of payload) {
            if (!session?.id || seenIds.has(session.id)) continue;
            seenIds.add(session.id);
            all.push(session);
            accepted.push(session);
        }
        if (accepted.length > 0) {
            options.onPage?.(accepted);
        }

        const next = page.cursor.next;
        // No next cursor, or a page that added nothing new: stop rather than spin.
        if (!next || next === cursor || accepted.length === 0 || options.stopAfterPage?.(accepted)) break;
        cursor = next;
    }

    return all;
}
>>>>>>> bc50ba56a
