import React from 'react';
import { cn } from '@/lib/utils';

import { Icon } from '@/components/icon/Icon';
import { WalkthroughView } from '@/components/views/walkthrough/WalkthroughView';
import { useI18n } from '@/lib/i18n';
import type { WalkthroughTarget } from '@/lib/walkthrough/types';
<<<<<<< HEAD
=======
import { diffCommentOriginFromTarget } from '@/lib/diffCommentOrigin';
>>>>>>> bc50ba56a
import { MOBILE_HEADER_BUTTON_CLASS, MOBILE_HEADER_CLASS, MOBILE_HEADER_TITLE_CLASS } from '@/components/ui/mobileHeader';

/**
 * The walkthrough of what the phone's Changes shows, pushed over its list the
 * way a file's diff is. Wraps the real workbench WalkthroughView with mobile
 * header chrome and back navigation.
 */
export const MobileWalkthroughScreen: React.FC<{
 directory: string;
 target?: WalkthroughTarget;
 /** What is being walked through, such as "Commit · e1d7e102". */
 subtitle?: string;
 /** Moves when the subject's content moves, so the walkthrough reads again. */
 revision?: string;
 visible?: boolean;
 onBack: () => void;
}> = ({ directory, subtitle, visible = true, onBack }) => {
 const { t } = useI18n();

<<<<<<< HEAD
 return (
  <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
   <header className={cn(MOBILE_HEADER_CLASS, 'border-b border-edge text-foreground')}>
    <button
     type="button"
     className={MOBILE_HEADER_BUTTON_CLASS}
     aria-label={t('header.actions.backAria')}
     onClick={onBack}
    >
     <Icon name="arrow-left" className="size-5" />
    </button>
    <div className="min-w-0 flex-1 px-1">
     <h2 className={cn('truncate', MOBILE_HEADER_TITLE_CLASS)}>{t('contextPanel.mode.walkthrough')}</h2>
     {subtitle ? <p className="truncate typography-meta text-muted-foreground">{subtitle}</p> : null}
=======
  const openStop = (stopId: string) => {
    review.handleSelectStop(stopId);
    setReadingAt(generatedAt);
  };
  const goBack = () => {
    if (reading) setReadingAt(null);
    else onBack();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <header className={cn(MOBILE_HEADER_CLASS, 'border-b border-edge text-foreground')}>
        <button type="button" className={MOBILE_HEADER_BUTTON_CLASS} aria-label={t('header.actions.backAria')} onClick={goBack}>
          <Icon name="arrow-left" className="size-5" />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className={cn('truncate', MOBILE_HEADER_TITLE_CLASS)}>{t('contextPanel.mode.walkthrough')}</h2>
          <p className="truncate typography-meta text-muted-foreground">{subtitle}</p>
        </div>
        {reading && view ? (
          <>
            <button type="button" className={MOBILE_HEADER_BUTTON_CLASS} aria-label={t('walkthrough.action.previous')} onClick={() => review.step(-1)}>
              <Icon name="arrow-right-s" className="size-5 rotate-180" />
            </button>
            <WalkthroughStepMenu review={review} view={view} size="mobile" />
            <button type="button" className={MOBILE_HEADER_BUTTON_CLASS} aria-label={t('walkthrough.action.next')} onClick={() => review.step(1)}>
              <Icon name="arrow-right-s" className="size-5" />
            </button>
          </>
        ) : view || review.blocked || review.showStages ? (
          <button
            type="button"
            className={MOBILE_HEADER_BUTTON_CLASS}
            aria-label={t('walkthrough.options.moreAria')}
            aria-haspopup="dialog"
            onClick={() => setOptionsOpen(true)}
          >
            <Icon name="more" className="size-5" />
          </button>
        ) : null}
      </header>

      <WalkthroughBanners review={review} view={view} />

      <div className="flex min-h-0 flex-1 flex-col">
        {review.blocked ? (
          <WalkthroughBlocker
            reason={review.blocked.reason}
            model={review.blocked.model}
            requiredChars={review.blocked.requiredChars}
            availableChars={review.blocked.availableChars}
            onRetry={review.retry}
          />
        ) : review.showStages ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <WalkthroughStages progress={review.stageProgress} />
          </div>
        ) : view && reading ? (
          <WalkthroughStream
            view={view}
            activeStopId={review.activeStopId}
            scrollToStopId={review.scrollToStopId}
            onActiveStopChange={review.handleActiveStopChange}
            onScrollHandled={review.clearScrollRequest}
            renderSideBySide={false}
            wrapLines
            commentOrigin={commentOrigin}
          />
        ) : view ? (
          <WalkthroughToc
            view={view}
            activeStopId={review.activeStopId}
            visitedStopIds={review.visitedStopIds}
            onSelectStop={openStop}
          />
        ) : (
          <WalkthroughEmptyState review={review} size="mobile" />
        )}
      </div>

      <MobileOverlayPanel open={optionsOpen} onClose={() => setOptionsOpen(false)} title={t('walkthrough.options.title')}>
        <WalkthroughOptions review={review} hasView={view !== null} size="mobile" onActed={() => setOptionsOpen(false)} />
      </MobileOverlayPanel>
>>>>>>> bc50ba56a
    </div>
   </header>

   <div className="min-h-0 flex-1 overflow-hidden">
    <WalkthroughView directory={directory} visible={visible} />
   </div>
  </div>
 );
};
