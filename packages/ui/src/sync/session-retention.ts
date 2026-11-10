import { create } from 'zustand';
import type { Session } from '@openchamber/agent-contract';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { isSessionPinned, useSessionPinnedStore } from '@/stores/useSessionPinnedStore';
import { resolveGlobalSessionDirectory, useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore, type SessionRetentionAction } from '@/stores/useUIStore';
import { useSessionUIStore } from './session-ui-store';
import { useGlobalSessionStatusStore } from './global-session-status';
import { archiveSession, deleteSession } from './session-actions';

const DAY_MS = 86_400_000;
export const RETENTION_KEEP_RECENT = 5;
export const RETENTION_INTERVAL_MS = DAY_MS;

const retentionTimestamp = (session: Session, onlyArchived: boolean): number => (
  onlyArchived ? session.archivedAt ?? 0 : session.updatedAt
);
const isArchived = (session: Session): boolean => session.archivedAt !== undefined;

const isOlderThanCutoff = (session: Session, cutoff: number, onlyArchived: boolean): boolean => {
  const timestamp = retentionTimestamp(session, onlyArchived);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp < cutoff;
};

/** Sessions the user asked to keep: pinned on this client, or in the In work block. */
/** In work keeps a session unless retention was told to take those too. */
export const inWorkKeepsSessions = (settings: { sessionWorkEnabled: boolean; sessionRetentionIncludeInWork: boolean }): boolean => (
  settings.sessionWorkEnabled && !settings.sessionRetentionIncludeInWork
);

export const isSessionKeptByUser = (
  session: Session,
  pinnedIds: Set<string> = useSessionPinnedStore.getState().ids,
  directory: string | null = resolveGlobalSessionDirectory(session),
  workKeeps: boolean = inWorkKeepsSessions(useUIStore.getState()),
): boolean => (
  (workKeeps && session.metadata?.openchamber?.work?.state === 'open')
  || session.metadata?.isPinned === true
  || isSessionPinned(pinnedIds, directory, session.sessionId)
);

type CandidateOptions = {
  sessions: readonly Session[];
  currentSessionId: string | null;
  cutoffDays: number;
  action: SessionRetentionAction;
  onlyArchived?: boolean;
  activeSessionIds: ReadonlySet<string>;
  isKept?: (session: Session) => boolean;
  now?: number;
};

/** The unselected scope stays protected, including from cascading parent deletion. */
export function buildSessionRetentionCandidates({
  sessions, currentSessionId, cutoffDays, action, onlyArchived = false, activeSessionIds, isKept, now = Date.now(),
}: CandidateOptions): string[] {
  if (!Number.isFinite(cutoffDays) || cutoffDays < 1) return [];
  const cutoff = now - cutoffDays * DAY_MS;
  const byId = new Map(sessions.map((session) => [session.sessionId, session]));
  const sorted = sessions.filter((session) => isArchived(session) === onlyArchived)
    .sort((a, b) => retentionTimestamp(b, onlyArchived) - retentionTimestamp(a, onlyArchived));
  const protectedIds = new Set(sorted.slice(0, RETENTION_KEEP_RECENT).map((session) => session.sessionId));
  for (const session of sessions) {
    if (isArchived(session) !== onlyArchived || session.sessionId === currentSessionId
      || activeSessionIds.has(session.sessionId) || session.runtimeStatus === 'running' || session.runtimeStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_input'
      || isKept?.(session) || !isOlderThanCutoff(session, cutoff, onlyArchived)) {
      protectedIds.add(session.sessionId);
    }
  }
  if (action === 'delete' || onlyArchived) {
    for (const id of protectedIds) {
      const parentId = byId.get(id)?.parentSessionId;
      if (parentId) protectedIds.add(parentId);
    }
  }
  const candidates = sorted.filter((session) => !protectedIds.has(session.sessionId));
  if (action === 'archive' && !onlyArchived) return candidates.map((session) => session.sessionId);

  const ids = new Set(candidates.map((session) => session.sessionId));
  const childrenLeft = new Map<string, number>();
  for (const session of candidates) {
    if (session.parentSessionId && ids.has(session.parentSessionId)) {
      childrenLeft.set(session.parentSessionId, (childrenLeft.get(session.parentSessionId) ?? 0) + 1);
    }
  }
  const ordered = candidates.filter((session) => !childrenLeft.has(session.sessionId)).map((session) => session.sessionId);
  for (let index = 0; index < ordered.length; index += 1) {
    const parentId = byId.get(ordered[index])?.parentSessionId;
    if (!parentId || !ids.has(parentId)) continue;
    const remaining = (childrenLeft.get(parentId) ?? 0) - 1;
    childrenLeft.set(parentId, remaining);
    if (remaining === 0) ordered.push(parentId);
  }
  return ordered;
}

type SessionRetentionResult = {
  completedIds: string[];
  failedIds: string[];
  action: SessionRetentionAction;
  skippedReason?: 'disabled' | 'loading' | 'cooldown' | 'no-candidates' | 'running' | 'runtime-changed';
};

export const useSessionRetentionRunStore = create(() => ({ isRunning: false }));

export async function runSessionRetentionCleanup({ force = false } = {}): Promise<SessionRetentionResult> {
  const settings = useUIStore.getState();
  const onlyArchived = settings.sessionRetentionOnlyArchived;
  const action = onlyArchived ? 'delete' : settings.sessionRetentionAction;
  const result: SessionRetentionResult = { completedIds: [], failedIds: [], action };
  if (useSessionRetentionRunStore.getState().isRunning) return { ...result, skippedReason: 'running' };
  if (!Number.isFinite(settings.autoDeleteAfterDays) || settings.autoDeleteAfterDays < 1
    || (!force && !settings.autoDeleteEnabled)) return { ...result, skippedReason: 'disabled' };
  if (!force && useSessionUIStore.getState().isLoading) return { ...result, skippedReason: 'loading' };
  const now = Date.now();
  if (!force && settings.autoDeleteLastRunAt && now - settings.autoDeleteLastRunAt < RETENTION_INTERVAL_MS) {
    return { ...result, skippedReason: 'cooldown' };
  }

  const runtimeKey = getRuntimeKey();
  let runtimeChanged = false;
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => { runtimeChanged = true; });
  const isCurrentRuntime = () => !runtimeChanged && getRuntimeKey() === runtimeKey;
  useSessionRetentionRunStore.setState({ isRunning: true });
  try {
    await useGlobalSessionsStore.getState().loadSessions();
    if (!isCurrentRuntime()) return { ...result, skippedReason: 'runtime-changed' };
    if (useGlobalSessionsStore.getState().status !== 'ready') throw new Error('Session retention requires a complete session list');
    const globalState = useGlobalSessionsStore.getState();
    const candidateIds = buildSessionRetentionCandidates({
      sessions: [...globalState.entityById.values()],
      currentSessionId: useSessionUIStore.getState().currentSessionId,
      cutoffDays: settings.autoDeleteAfterDays,
      action,
      onlyArchived,
      activeSessionIds: useGlobalSessionStatusStore.getState().activeSessionIds,
      isKept: (session) => isSessionKeptByUser(session),
      now,
    });
    if (candidateIds.length === 0) return { ...result, skippedReason: 'no-candidates' };

    const failedIds = new Set<string>();
    let archivedSnapshot: readonly Session[] | undefined;
    let archivedChildrenByParentId = new Map<string, string[]>();
    for (const [index, id] of candidateIds.entries()) {
      if (!isCurrentRuntime()) {
        result.failedIds.push(...candidateIds.slice(index));
        break;
      }
      const state = useGlobalSessionsStore.getState();
      const session = state.entityById.get(id);
      if (!session) continue;
      if (isArchived(session) !== onlyArchived || session.sessionId === useSessionUIStore.getState().currentSessionId
        || useGlobalSessionStatusStore.getState().activeSessionIds.has(id)
        || session.runtimeStatus === 'running' || session.runtimeStatus === 'awaiting_approval' || session.runtimeStatus === 'awaiting_input'
        || isSessionKeptByUser(session)
        || !isOlderThanCutoff(session, now - settings.autoDeleteAfterDays * DAY_MS, onlyArchived)) continue;
      if (action === 'delete') {
        if (archivedSnapshot !== state.archivedSessions) {
          archivedSnapshot = state.archivedSessions;
          archivedChildrenByParentId = new Map();
          for (const archived of archivedSnapshot) {
            if (!archived.parentSessionId) continue;
            const children = archivedChildrenByParentId.get(archived.parentSessionId);
            if (children) children.push(archived.sessionId);
            else archivedChildrenByParentId.set(archived.parentSessionId, [archived.sessionId]);
          }
        }
        const children = [
          ...(state.structure.activeChildrenByParentId.get(id) ?? []),
          ...(archivedChildrenByParentId.get(id) ?? []),
        ];
        if (children.length > 0) {
          if (children.some((childId) => failedIds.has(childId))) {
            failedIds.add(id);
            result.failedIds.push(id);
          }
          continue;
        }
      }
      const completed = action === 'archive'
        ? await archiveSession(id, runtimeKey)
        : await deleteSession(id, { expectedRuntimeKey: runtimeKey });
      if (completed) result.completedIds.push(id);
      else {
        failedIds.add(id);
        result.failedIds.push(id);
      }
    }
    return result;
  } finally {
    if (isCurrentRuntime()) settings.setAutoDeleteLastRunAt(Date.now());
    unsubscribe();
    useSessionRetentionRunStore.setState({ isRunning: false });
  }
}
