import React, { memo } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';
import { useUIStore } from '@/stores/useUIStore';
import { useChatSessionSelection } from './chatColumnSession';
import { useSessionDirectory } from '@/sync/sync-context';
import { selectAutoReviewRun } from '@/stores/useAutoReviewStore';

<<<<<<< HEAD
/**
 * A running review loop, as a top row of the composer next to the background
 * commands: what it waits for, Open for the read-only review session, Stop.
 */
||||||| bc50ba56aa
/**
 * The session's review loop as a top row of the composer. While it runs: what
 * it waits for, Open for the read-only review session, Stop. Once it ends, the
 * row stays with the result until dismissed, so a finished, contested or
 * failed review is never just a row that disappeared.
 */
=======
>>>>>>> upstream/main
export const AutoReviewStrip = memo(() => {
  const { t } = useI18n();
  const currentSessionId = useChatSessionSelection().sessionId;
  const directory = useSessionDirectory(currentSessionId);
  const run = useAutoReviewStore(selectAutoReviewRun(currentSessionId, directory));
  const removeRun = useAutoReviewStore((state) => state.removeRun);
  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);
<<<<<<< HEAD
||||||| bc50ba56aa
  // Which run's dispute is unfolded, so another chat or a new run starts folded.
  const [unfoldedRun, setUnfoldedRun] = React.useState<string | null>(null);
  const disputeId = React.useId();
=======
  const [unfoldedRun, setUnfoldedRun] = React.useState<string | null>(null);
  const disputeId = React.useId();
>>>>>>> upstream/main

  if (!currentSessionId || !run || run.status !== 'running') {
    return null;
  }

  const statusLabel = run.step === 'review'
    ? t('chat.autoReview.status.waitingForReviewer')
    : t('chat.autoReview.status.waitingForImplementer');

  const handleOpenReviewSession = () => {
    openContextPanelTab(run.directory, {
      mode: 'chat',
      dedupeKey: `session:${run.reviewSessionID}`,
      label: t('chat.autoReview.reviewSessionLabel'),
      readOnly: true,
    });
  };

<<<<<<< HEAD
||||||| bc50ba56aa
  const handleRemove = () => {
    void removeRun(run.originalSessionID, run.directory).catch((error) => {
      console.warn('[auto-review] failed to stop or dismiss the review', error);
      toast.error(t('chat.autoReview.toast.removeFailed'));
    });
  };

  const openButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpenReviewSession}
          onMouseDown={(event) => event.preventDefault()}
          className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {t('chat.autoReview.actions.open')}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.reviewOpen')}</TooltipContent>
    </Tooltip>
  );

  if (run.status === 'running') {
    const statusLabel = run.step === 'review'
      ? t('chat.autoReview.status.waitingForReviewer')
      : t('chat.autoReview.status.waitingForImplementer');
    return (
      <div role="status" className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-edge ps-3 pe-1.5">
        <Spinner className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {t('chat.autoReview.title')}
          <span className="text-muted-foreground"> · {statusLabel}</span>
        </span>
        {openButton}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              onMouseDown={(event) => event.preventDefault()}
              className="shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error"
            >
              {t('chat.autoReview.actions.stop')}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.reviewStop')}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const result = RESULT[run.status];
  const label = (
    <span className="min-w-0 flex-1 truncate text-start text-sm text-foreground" title={run.error}>
      {t(result.labelKey)}
      {run.error ? <span className="text-muted-foreground"> · {run.error}</span> : null}
    </span>
  );
  // A dispute unfolds in place, as the queue does: both positions, without
  // opening two sessions to find out what the disagreement is about.
  const runId = `${run.originalSessionID}:${run.startedAt}`;
  const unfolded = Boolean(run.dispute) && unfoldedRun === runId;
=======
  const handleRemove = () => {
    void removeRun(run.originalSessionID, run.directory).catch((error) => {
      console.warn('[auto-review] failed to stop or dismiss the review', error);
      toast.error(t('chat.autoReview.toast.removeFailed'));
    });
  };

  const openButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpenReviewSession}
          onMouseDown={(event) => event.preventDefault()}
          className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
        >
          {t('chat.autoReview.actions.open')}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.reviewOpen')}</TooltipContent>
    </Tooltip>
  );

  if (run.status === 'running') {
    const statusLabel = run.step === 'review'
      ? t('chat.autoReview.status.waitingForReviewer')
      : t('chat.autoReview.status.waitingForImplementer');
    return (
      <div role="status" className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-edge ps-3 pe-1.5">
        <Spinner className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {t('chat.autoReview.title')}
          <span className="text-muted-foreground"> · {statusLabel}</span>
        </span>
        {openButton}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              onMouseDown={(event) => event.preventDefault()}
              className="shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error"
            >
              {t('chat.autoReview.actions.stop')}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.reviewStop')}</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  const result = RESULT[run.status];
  const label = (
    <span className="min-w-0 flex-1 truncate text-start text-sm text-foreground" title={run.error}>
      {t(result.labelKey)}
      {run.error ? <span className="text-muted-foreground"> · {run.error}</span> : null}
    </span>
  );
  const runId = `${run.originalSessionID}:${run.startedAt}`;
  const unfolded = Boolean(run.dispute) && unfoldedRun === runId;
>>>>>>> upstream/main
  return (
    <div role="status" className="flex oc-composer-row min-w-0 items-center gap-2 border-b border-border/60 ps-3 pe-1.5">
      <Spinner className="size-3.5 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {t('chat.autoReview.title')}
        <span className="text-muted-foreground"> · {statusLabel}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleOpenReviewSession}
        onMouseDown={(event) => event.preventDefault()}
        className="shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        {t('chat.autoReview.actions.open')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => { if (currentSessionId && directory) void removeRun(currentSessionId, directory); }}
        onMouseDown={(event) => event.preventDefault()}
        className="shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error"
      >
        {t('chat.autoReview.actions.stop')}
      </Button>
    </div>
  );
});

AutoReviewStrip.displayName = 'AutoReviewStrip';
