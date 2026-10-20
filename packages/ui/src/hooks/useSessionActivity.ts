import React from 'react';
import type { SessionRuntimeStatus } from '@openchamber/agent-contract';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionStatus, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
import type { State } from '@/sync/types';

/**
 * "unknown" means no authoritative status proves this session idle, yet a
 * native run binding still exists. It is deliberately not "busy": the client
 * must not invent streaming, timing, or activity text for it. It is not
 * "idle" either, because the stop control is the only safe action while an
 * acknowledged run may still be executing.
 */
type SessionActivityPhase = 'idle' | 'busy' | 'unknown';

export interface SessionActivityResult {
  phase: SessionActivityPhase;
  isWorking: boolean;
  isBusy: boolean;
  isCooldown: boolean;
  isUnknown: boolean;
}

const IDLE_RESULT: SessionActivityResult = {
  phase: 'idle',
  isWorking: false,
  isBusy: false,
  isCooldown: false,
  isUnknown: false,
};

const UNKNOWN_RESULT: SessionActivityResult = {
  phase: 'unknown',
  isWorking: false,
  isBusy: false,
  isCooldown: false,
  isUnknown: true,
};

const BUSY_RESULT: SessionActivityResult = {
  phase: 'busy',
  isWorking: true,
  isBusy: true,
  isCooldown: false,
  isUnknown: false,
};

const isLiveStatus = (status: SessionRuntimeStatus): boolean =>
  status === 'running' || status === 'awaiting_approval' || status === 'awaiting_input';

/**
 * The run binding that the stop control may act on. A materialized snapshot is
 * authoritative, including when it says no run is bound; the projected session
 * is only a fallback for a session whose snapshot has not loaded yet (the
 * native acknowledgement path). A stale projection cannot resurrect a run that
 * an authoritative snapshot already released.
 */
export function selectBoundRunId(state: Pick<State, 'snapshot' | 'session'>, sessionId: string): string | null {
  const snapshot = state.snapshot[sessionId];
  if (snapshot) return snapshot.session.activeRunId;
  return state.session.find((session) => session.sessionId === sessionId)?.activeRunId ?? null;
}

/**
 * Precedence is the composer contract:
 * 1. Pending permissions/forms own the send button, so the prompt can be
 *    superseded with a new message instead of a stop.
 * 2. A live runtime status is authoritative activity.
 * 3. An authoritative idle status is authoritative inactivity.
 * 4. Missing or unavailable status proves nothing. Only an existing native run
 *    binding ("unknown") keeps the stop control, because aborting is still
 *    possible; otherwise the session is idle.
 */
export function deriveSessionActivity(input: {
  sessionId: string | null | undefined;
  status: SessionRuntimeStatus | undefined;
  activeRunId: string | null;
  permissionsPending: boolean;
  formsPending: boolean;
}): SessionActivityResult {
  if (!input.sessionId) return IDLE_RESULT;
  if (input.permissionsPending || input.formsPending) return IDLE_RESULT;
  if (input.status !== undefined && isLiveStatus(input.status)) return BUSY_RESULT;
  if (input.status === 'idle') return IDLE_RESULT;
  return input.activeRunId !== null ? UNKNOWN_RESULT : IDLE_RESULT;
}

/**
 * Determines if a session is actively working.
 *
 * The directory status channel collapses to "unavailable" when its event
 * stream disconnects, and an accepted run can precede the event that reports
 * it. Both are "no proof of idle", not idle. The native run binding keeps that
 * distinction: `snapshot.session.activeRunId` is the last authoritative native
 * run record, and the projected session carries the same binding when no
 * snapshot is materialized yet.
 */
export function useSessionActivity(sessionId: string | null | undefined, directory?: string): SessionActivityResult {
  const status = useSessionStatus(sessionId ?? '', directory);
  const permissions = useSessionPermissions(sessionId ?? '', directory);
  const forms = useSessionForms(sessionId ?? '', directory);
  const activeRunId = useDirectorySync(
    React.useCallback((state) => sessionId ? selectBoundRunId(state, sessionId) : null, [sessionId]),
    directory,
  );

  return React.useMemo<SessionActivityResult>(() => deriveSessionActivity({
    sessionId,
    status,
    activeRunId,
    permissionsPending: permissions.length > 0,
    formsPending: forms.length > 0,
  }), [sessionId, status, activeRunId, permissions, forms]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);
  return useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);
}
