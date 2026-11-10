import React, { memo } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useI18n } from '@/lib/i18n';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';
import { useUIStore } from '@/stores/useUIStore';
import { useChatSessionSelection } from './chatColumnSession';
import { useSessionDirectory } from '@/sync/sync-context';
import { selectAutoReviewRun } from '@/stores/useAutoReviewStore';

/**
 * A running review loop, as a top row of the composer next to the background
 * commands: what it waits for, Open for the read-only review session, Stop.
 */
export const AutoReviewStrip = memo(() => {
  const { t } = useI18n();
  const currentSessionId = useChatSessionSelection().sessionId;
  const directory = useSessionDirectory(currentSessionId);
  const run = useAutoReviewStore(selectAutoReviewRun(currentSessionId, directory));
  const removeRun = useAutoReviewStore((state) => state.removeRun);
  const openContextPanelTab = useUIStore((state) => state.openContextPanelTab);

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
