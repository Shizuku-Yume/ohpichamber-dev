import React from 'react';
import type { SessionRuntimeStatus } from '@openchamber/agent-contract';
import { useSessionUIStore } from '@/sync/session-ui-store';
<<<<<<< HEAD
import { useDirectorySync, useSessionStatus, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
import type { State } from '@/sync/types';
||||||| bc50ba56aa
import { useSessionStatus, useSessionMessagesSelector, useSessionPermissions, useSessionForms } from '@/sync/sync-context';
=======
import { formTurnHold, useRecoverableQuestionsStore } from '@/sync/recoverable-questions';
import { readUnloadedFormToolLinks } from '@/sync/session-actions';
import { useDirectorySync, useSessionStatus, useSessionStatusSnapshotReady, useSessionMessagesSelector, useSessionPermissions } from '@/sync/sync-context';
>>>>>>> upstream/main

<<<<<<< HEAD
/**
 * "unknown" means no authoritative status proves this session idle, yet a
 * native run binding still exists. It is deliberately not "busy": the client
 * must not invent streaming, timing, or activity text for it. It is not
 * "idle" either, because the stop control is the only safe action while an
 * acknowledged run may still be executing.
 */
type SessionActivityPhase = 'idle' | 'busy' | 'unknown';
||||||| bc50ba56aa
// Mirrors OpenCode SessionStatus: busy|retry|idle.
type SessionActivityPhase = 'idle' | 'busy' | 'retry';
=======
type SessionActivityPhase = 'idle' | 'busy' | 'retry';
>>>>>>> upstream/main

export interface SessionActivityResult {
  phase: SessionActivityPhase;
  isWorking: boolean;
  isBusy: boolean;
  isUnknown: boolean;
}

<<<<<<< HEAD
||||||| bc50ba56aa
// Only the trailing turn matters, so the subscription re-renders the caller
// when that flag flips rather than on every streamed message update.
// Plumbing roles are transparent here: a synthetic or switch message landing
// after the streaming assistant must not read as the turn ending.
const selectHasPendingAssistant = (messages: Message[]): boolean => (
  isIncompleteAssistantTurn(getLastConversationMessage(messages))
);

=======
const selectHasPendingAssistant = (messages: Message[]): boolean => (
  isIncompleteAssistantTurn(getLastConversationMessage(messages))
);

>>>>>>> upstream/main
const IDLE_RESULT: SessionActivityResult = {
  phase: 'idle',
  isWorking: false,
  isBusy: false,
  isUnknown: false,
};

const UNKNOWN_RESULT: SessionActivityResult = {
  phase: 'unknown',
  isWorking: false,
  isBusy: false,
  isUnknown: true,
};

const BUSY_RESULT: SessionActivityResult = {
  phase: 'busy',
  isWorking: true,
  isBusy: true,
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
 * The phase a status and a run binding prove, before pending approvals are
 * considered. `unavailable` is a settled session unless a native run binding
 * still exists: the Agent Service reports it for a session it does not hold
 * (a restart, a reload, a cold journal read), which is not work in progress.
 */
export const sessionActivityPhase = (
  status: SessionRuntimeStatus | undefined,
  activeRunId: string | null,
): SessionActivityPhase => {
  if (status !== undefined && isLiveStatus(status)) return 'busy';
  if (status === 'idle') return 'idle';
  return activeRunId !== null ? 'unknown' : 'idle';
};

<<<<<<< HEAD
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
  const phase = sessionActivityPhase(input.status, input.activeRunId);
  return phase === 'busy' ? BUSY_RESULT : phase === 'unknown' ? UNKNOWN_RESULT : IDLE_RESULT;
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
||||||| bc50ba56aa
/**
 * Determines if a session is actively working.
 * Checks session_status and, only when status is missing, falls back to the
 * trailing assistant message when its completion update has not landed yet.
 * Returns idle when permissions or forms are pending (the permission /
 * form indicator takes priority, and the send button must stay available so
 * the user can supersede the prompt with a new message).
 */
=======
>>>>>>> upstream/main
export function useSessionActivity(sessionId: string | null | undefined, directory?: string): SessionActivityResult {
  const status = useSessionStatus(sessionId ?? '', directory);
<<<<<<< HEAD
||||||| bc50ba56aa
  const hasPendingAssistant = useSessionMessagesSelector(sessionId ?? '', directory, selectHasPendingAssistant);
=======
  const statusSnapshotReady = useSessionStatusSnapshotReady(directory, sessionId ?? '');
  const hasPendingAssistant = useSessionMessagesSelector(sessionId ?? '', directory, selectHasPendingAssistant);
>>>>>>> upstream/main
  const permissions = useSessionPermissions(sessionId ?? '', directory);
<<<<<<< HEAD
  const forms = useSessionForms(sessionId ?? '', directory);
  const activeRunId = useDirectorySync(
    React.useCallback((state) => sessionId ? selectBoundRunId(state, sessionId) : null, [sessionId]),
    directory,
  );
||||||| bc50ba56aa
  const forms = useSessionForms(sessionId ?? '', directory);
=======
  const releasedForms = useRecoverableQuestionsStore((state) => state.releasedForms);
  const formHoldsTurn = useDirectorySync(React.useCallback((state) => (
    state.form[sessionId ?? '']?.some((form) => formTurnHold(form, state.part, releasedForms) !== 'released') ?? false
  ), [sessionId, releasedForms]), directory);
  const unloadedForms = useDirectorySync(React.useCallback((state) => (
    (state.form[sessionId ?? ''] ?? [])
      .filter((form) => formTurnHold(form, state.part, releasedForms) === 'unknown')
      .map((form) => form.id)
      .join('\n')
  ), [sessionId, releasedForms]), directory);
  const sessionForms = useDirectorySync(React.useCallback((state) => state.form[sessionId ?? ''], [sessionId]), directory);
  React.useEffect(() => {
    if (sessionId && unloadedForms) readUnloadedFormToolLinks(sessionId);
  }, [sessionId, unloadedForms, sessionForms]);
>>>>>>> upstream/main

<<<<<<< HEAD
  return React.useMemo<SessionActivityResult>(() => deriveSessionActivity({
    sessionId,
    status,
    activeRunId,
    permissionsPending: permissions.length > 0,
    formsPending: forms.length > 0,
  }), [sessionId, status, activeRunId, permissions, forms]);
||||||| bc50ba56aa
  return React.useMemo<SessionActivityResult>(() => {
    if (!sessionId) return IDLE_RESULT;

    // Permissions or forms pending → idle (the blocking indicator takes
    // priority and the send button must remain a send, not a stop).
    if (permissions.length > 0 || forms.length > 0) return IDLE_RESULT;

    const phase: SessionActivityPhase = (status?.type ?? 'idle') as SessionActivityPhase;

    // Only trust the trailing assistant message as a transient fallback while
    // waiting for session.status/message.updated to settle.
    const hasAuthoritativeStatus = status !== undefined;
    const statusWorking = hasAuthoritativeStatus && phase !== 'idle';
    const isWorking = statusWorking || hasPendingAssistant;

    if (hasAuthoritativeStatus && !statusWorking) return IDLE_RESULT;

    if (!isWorking) return IDLE_RESULT;

    return {
      phase: statusWorking ? phase : 'busy',
      isWorking: true,
      isBusy: phase === 'busy' || (!statusWorking && hasPendingAssistant),
      isCooldown: false,
    };
  }, [sessionId, status, hasPendingAssistant, permissions, forms]);
=======
  return React.useMemo<SessionActivityResult>(() => {
    if (!sessionId) return IDLE_RESULT;

    if (permissions.length > 0 || formHoldsTurn) return IDLE_RESULT;

    const phase: SessionActivityPhase = (status?.type ?? 'idle') as SessionActivityPhase;

    const hasAuthoritativeStatus = status !== undefined || statusSnapshotReady;
    const statusWorking = hasAuthoritativeStatus && phase !== 'idle';
    const isWorking = statusWorking || hasPendingAssistant;

    if (hasAuthoritativeStatus && !statusWorking) return IDLE_RESULT;

    if (!isWorking) return IDLE_RESULT;

    return {
      phase: statusWorking ? phase : 'busy',
      isWorking: true,
      isBusy: phase === 'busy' || (!statusWorking && hasPendingAssistant),
      isCooldown: false,
    };
  }, [sessionId, status, statusSnapshotReady, hasPendingAssistant, permissions, formHoldsTurn]);
>>>>>>> upstream/main
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);
  return useSessionActivity(currentSessionId, currentSessionDirectory ?? undefined);
}
