import React from 'react';
import type { Message, Part } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { ErrorResponseDetails } from '@/components/chat/ErrorResponseDetails';
import { useI18n } from '@/lib/i18n';
import { showRuntimeStatus } from '@/lib/runtimeStatus';
import { useLatestSessionError, type ErrorNotification } from '@/sync/notification-store';
import { useDirectoryStore, useDirectorySync, useSessionStatus, useSessionStatusSnapshotReady } from '@/sync/sync-context';
import { summarizeSessionError } from '@/sync/session-error-log';
import { refetchSessionMessages } from '@/sync/session-actions';
import { LongErrorText } from './LongErrorText';
import { scheduleUnansweredRechecks } from './sessionErrorNoticeState';

interface SessionErrorNoticeProps {
  sessionId: string;
  directory?: string;
}

type LastMessageState = {
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  hasError: boolean;
} | null;

// How long a user message may sit unanswered on an idle session before the
// notice calls it a reply that never began.
const UNANSWERED_AFTER_MS = 5_000;

const useLastMessageState = (sessionId: string, directory?: string): LastMessageState => {
  const store = useDirectoryStore(directory);
  const cacheRef = React.useRef<LastMessageState>(null);
  const getSnapshot = React.useCallback((): LastMessageState => {
    if (!sessionId) return null;
    const messages: Message[] = store.getState().message[sessionId] ?? [];
    let last: Message | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message: Message = messages[index];
      if (message.role === 'user' || message.role === 'assistant') {
        last = message;
        break;
      }
    }
    const next: LastMessageState = last ? { role: last.role, timestamp: last.createdAt, hasError: last.parts.some((part: Part) => part.type === 'tool_result' && part.isError) } : null;
    if (!next) {
      cacheRef.current = null;
      return null;
    }
    const cached = cacheRef.current;
    if (cached && cached.role === next.role && cached.timestamp === next.timestamp && cached.hasError === next.hasError) {
      return cached;
    }
    cacheRef.current = next;
    return next;
  }, [sessionId, store]);
  const subscribe = React.useCallback((notify: () => void) => {
    if (!sessionId) return () => undefined;
    return store.subscribe(notify);
  }, [sessionId, store]);
  return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

/**
 * Shows what the canonical runtime reported when it stopped a turn without
 * producing a reply. Rendered under the last message, only while that turn is
 * the latest one: sending again moves the last message past the error and
 * hides it. Canonical turn failures survive reloads without replaying live
 * notifications or reconstructing legacy outcome metadata.
 */
export const SessionErrorNotice: React.FC<SessionErrorNoticeProps> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const liveError = useLatestSessionError(sessionId);
  const latestTurn = useDirectorySync(React.useCallback((state) => state.snapshot[sessionId]?.turns.at(-1) ?? null, [sessionId]), directory);
  const storedError = React.useMemo<ErrorNotification | null>(() => latestTurn?.status === 'failed'
    ? { time: latestTurn.finishedAt ?? latestTurn.startedAt, error: summarizeSessionError(latestTurn.error) }
    : null, [latestTurn]);
  const latestError = liveError && (!storedError || liveError.time >= storedError.time) ? liveError : storedError;
  const status = useSessionStatus(sessionId, directory);
  const statusSnapshotReady = useSessionStatusSnapshotReady(directory, sessionId);
  const lastMessage = useLastMessageState(sessionId, directory);

  // An omitted status means idle only after a successful status snapshot:
  // after a reload the last prompt is hydrated before the runtime reports
  // that the session is still busy.
  const isIdle = status === 'idle' || (status === undefined && statusSnapshotReady);
  const reportedError = latestError && isIdle
    && (!lastMessage || latestError.time >= lastMessage.timestamp)
    && !(lastMessage?.role === 'assistant' && lastMessage.hasError)
    ? latestError
    : null;
  // A user message that the session is idle on, with nothing after it for a
  // while, is a reply that never began: the send was accepted but OpenCode
  // produced neither a message nor an error for it.
  const unansweredSince = !reportedError && isIdle
    && lastMessage?.role === 'user' && lastMessage.timestamp > 0
    ? lastMessage.timestamp
    : null;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (unansweredSince === null) return undefined;
    const remaining = UNANSWERED_AFTER_MS - (Date.now() - unansweredSince);
    if (remaining <= 0) return undefined;
    const timer = window.setTimeout(() => setNow(Date.now()), remaining + 50);
    return () => window.clearTimeout(timer);
  }, [unansweredSince]);
  const unansweredDue = unansweredSince !== null && Math.max(now, Date.now()) - unansweredSince >= UNANSWERED_AFTER_MS;
  // Looking unanswered is only a guess: the live stream may have dropped the
  // reply. Re-read the session first and show the notice only once a read has
  // settled with the prompt still last. The key ties that verdict to this
  // session and prompt, so a new send or a session switch starts unverified.
  const unansweredKey = unansweredDue && sessionId ? `${sessionId}:${unansweredSince}` : null;
  const [verifiedKey, setVerifiedKey] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!unansweredKey || !sessionId) return undefined;
    return scheduleUnansweredRechecks(
      () => refetchSessionMessages(sessionId),
      window,
      () => setVerifiedKey(unansweredKey),
    );
  }, [unansweredKey, sessionId]);
  const unanswered = unansweredKey !== null && verifiedKey === unansweredKey;

  if (!reportedError && !unanswered) return null;

  let title: string;
  let detail: string;
  let hasDetails = true;
  let responseBody: string | null = null;
  if (reportedError) {
    title = t('chat.sessionError.title');
    hasDetails = Boolean(reportedError.error?.message);
    const message = reportedError.error?.message ?? t('chat.sessionError.noDetails');
    detail = reportedError.error?.name ? `${reportedError.error.name}: ${message}` : message;
    responseBody = reportedError.error?.responseBody ?? null;
  } else {
    title = t('chat.sessionError.noReply');
    hasDetails = false;
    detail = t('chat.sessionError.noDetails');
  }

  return (
    <div className="chat-message-column">
      <div
        role="status"
        className="mt-2 max-w-full rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-background)] px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Icon name="error-warning" className="size-3.5 shrink-0 text-[var(--status-error)]" />
          <span className="typography-meta font-medium text-foreground">{title}</span>
        </div>
        <LongErrorText text={detail} buttonClassName="ml-[0.875rem]">
          {(visibleText) => (
            <div className="mt-1 pl-[1.375rem] typography-meta text-muted-foreground break-words">{visibleText}</div>
          )}
        </LongErrorText>
        {!hasDetails ? (
          <div className="pl-[1.375rem]">
            <Button
              variant="link"
              size="xs"
              onClick={() => { void showRuntimeStatus(); }}
              className="-ml-2 normal-case"
            >
              {t('chat.sessionError.showRuntimeStatus')}
            </Button>
          </div>
        ) : null}
        {responseBody ? <ErrorResponseDetails body={responseBody} className="pl-[1.375rem]" /> : null}
      </div>
    </div>
  );
};
