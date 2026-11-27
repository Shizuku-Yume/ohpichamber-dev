
import { z } from 'zod';
import type { SessionRuntimeStatus } from '@openchamber/agent-contract';

export interface CanonicalSessionSummary {
  sessionId: string;
  parentSessionId?: string | null | undefined;
  runtimeStatus: SessionRuntimeStatus | string;
}

export interface CanonicalSessionSnapshot {
  session?: {
    sessionId: string;
    runtimeStatus: SessionRuntimeStatus | string;
    workspaceId: string;
  } | null | undefined;
}

export interface CanonicalSessionList {
  items: CanonicalSessionSummary[];
}

export interface CanonicalSessionService {
  open: (sessionId: string) => Promise<CanonicalSessionSnapshot>;
  list: (workspaceId?: string) => Promise<CanonicalSessionList>;
}

export interface CanonicalSessionStateDependencies {
  sessionService: CanonicalSessionService;
}

export type CanonicalSessionState =
  | { kind: 'running' }
  | { kind: 'subagents' }
  | { kind: 'idle' }
  | { kind: 'deleted' };

export interface CanonicalSessionStateReader {
  read: (sessionID: string) => Promise<CanonicalSessionState | null>;
}

export interface CanonicalSessionLease {
  release: () => Promise<void> | void;
}

export interface CanonicalSessionHub {
  retainSession: (sessionId: string, leaseKey: string) => Promise<CanonicalSessionLease>;
}

const ACTIVE_STATUSES = {
  running: true,
  awaiting_approval: true,
  awaiting_input: true,
} as const;

const isActiveStatus = (status: string): boolean => Object.hasOwn(ACTIVE_STATUSES, status);

const ErrorStatusSchema = z.object({
  statusCode: z.number().optional(),
  status: z.number().optional(),
});

const hasRunningDescendant = (sessionID: string, items: readonly CanonicalSessionSummary[]): boolean => {
  const children = new Map<string, CanonicalSessionSummary[]>();
  for (const item of items) {
    if (!item.parentSessionId) continue;
    children.set(item.parentSessionId, [...(children.get(item.parentSessionId) ?? []), item]);
  }
  const seen = new Set<string>([sessionID]);
  const pending: string[] = [sessionID];
  while (pending.length > 0) {
    const next = pending.shift();
    if (next === undefined) continue;
    for (const child of children.get(next) ?? []) {
      if (isActiveStatus(child.runtimeStatus)) return true;
      if (seen.has(child.sessionId)) continue;
      seen.add(child.sessionId);
      pending.push(child.sessionId);
    }
  }
  return false;
};

export const createCanonicalSessionState = ({ sessionService }: CanonicalSessionStateDependencies): CanonicalSessionStateReader => {
  if (!sessionService || !(sessionService.open instanceof Function) || !(sessionService.list instanceof Function)) {
    throw new TypeError('session state requires the canonical session service');
  }
  return {
    async read(sessionID: string): Promise<CanonicalSessionState | null> {
      let snapshot: CanonicalSessionSnapshot;
      try {
        snapshot = await sessionService.open(sessionID);
      } catch (error) {
        const parsed = ErrorStatusSchema.safeParse(error);
        const notFound = parsed.success && (parsed.data.statusCode === 404 || parsed.data.status === 404);
        return notFound ? { kind: 'deleted' } : null;
      }
      const session = snapshot?.session;
      if (!session) return null;
      if (isActiveStatus(session.runtimeStatus)) return { kind: 'running' };
      let listed: CanonicalSessionList;
      try {
        listed = await sessionService.list(session.workspaceId);
      } catch {
        return null;
      }
      if (!Array.isArray(listed?.items)) return null;
      return { kind: hasRunningDescendant(sessionID, listed.items) ? 'subagents' : 'idle' };
    },
  };
};

export const retainSessions = async (
  hub: CanonicalSessionHub,
  leaseKey: string,
  sessionIDs: readonly string[],
): Promise<() => Promise<void>> => {
  const acquired: CanonicalSessionLease[] = [];
  try {
    for (const sessionID of sessionIDs) acquired.push(await hub.retainSession(sessionID, leaseKey));
  } catch (error) {
    await Promise.all(acquired.map((lease) => lease.release()));
    throw error;
  }
  return () => Promise.all(acquired.map((lease) => lease.release())).then(() => undefined, () => undefined);
};
