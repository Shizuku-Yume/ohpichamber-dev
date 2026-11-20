import React from 'react';
import { useSessionTurnActivity } from '@/sync/global-session-status';
import { useSessionBlockingRequests } from '@/sync/sync-context';
import { useSessionMarkedUnread, useSessionUnread } from '@/sync/session-unread';
import { useHasSessionTurnDuration } from '@/sync/session-turn-duration';
import { useIsSessionAiRenamePending } from '@/sync/use-session-ai-rename';
import { useViewportStore, viewportSessionKey } from '@/sync/viewport-store';
import { useIsSessionWorktreeMovePending } from '@/lib/worktrees/sessionWorktreeMove';
import type { SessionNode } from '../types';
import { selectBlockingBadgeSessionScopes, type BlockingBadgeSessionScope } from './sessionNodeItemUtils';

type SessionRowLiveStateInput = {
  node: SessionNode;
  sessionDirectory: string | null;
  isExpanded: boolean;
  isActive: boolean;
  timelineBadgeSessionScopes: readonly BlockingBadgeSessionScope[] | undefined;
};

export function useSessionRowLiveState({
  node,
  sessionDirectory,
  isExpanded,
  isActive,
  timelineBadgeSessionScopes,
}: SessionRowLiveStateInput) {
  const session = node.session;
  const isZombie = useViewportStore(
    React.useCallback((state) => Boolean(state.sessionMemoryState.get(viewportSessionKey(session.sessionId))?.isZombie), [session.sessionId]),
  );
  const turnActivity = useSessionTurnActivity(session.sessionId);
  const isStreaming = turnActivity !== null;
  const hasActivityDuration = useHasSessionTurnDuration(session.sessionId, isStreaming);
  const isMovingToWorktree = useIsSessionWorktreeMovePending(session.sessionId);
  const isAiRenaming = useIsSessionAiRenamePending(session.sessionId, sessionDirectory);
  const isSessionActionPending = isMovingToWorktree || isAiRenaming;
  const blockingBadgeSessionScopes = React.useMemo(
    () => timelineBadgeSessionScopes ?? selectBlockingBadgeSessionScopes(node, isExpanded, sessionDirectory),
    [isExpanded, node, sessionDirectory, timelineBadgeSessionScopes],
  );
  const {
    hasPermission: hasPendingPermission,
    hasForm: hasPendingForm,
  } = useSessionBlockingRequests(blockingBadgeSessionScopes);
  const needsAttention = useSessionUnread(session.sessionId);
  const markedUnread = useSessionMarkedUnread(session.sessionId);
  const showUnreadStatus = !isSessionActionPending && !isStreaming && needsAttention && (!isActive || markedUnread);
  const showStatusMarker = isStreaming || showUnreadStatus;
  const showActivityDuration = (isStreaming || showUnreadStatus) && hasActivityDuration;
  const waitingOnUser = hasPendingPermission || hasPendingForm;
  return {
    isZombie,
    turnActivity,
    isStreaming,
    isAiRenaming,
    isSessionActionPending,
    hasPendingPermission,
    hasPendingForm,
    needsAttention,
    showUnreadStatus,
    showStatusMarker,
    showActivityDuration,
    waitingOnUser,
  };
}
