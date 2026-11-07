import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { useCleanseStore } from '@/stores/useCleanseStore';

interface CleanseStatusBoardProps {
  status: 'discovering' | 'repairing' | 'verifying' | 'completed' | 'failed' | 'cancelled';
  activeCheckers: string[];
  completedCheckers: string[];
  repairedFiles: string[];
  summary?: string;
  className?: string;
  onDismiss?: () => void;
}
export const CleanseStatusBoard: React.FC<CleanseStatusBoardProps> = ({
  status,
  activeCheckers,
  completedCheckers,
  repairedFiles,
  summary,
  className = '',
  onDismiss,
}) => {
  const { t } = useI18n();
  const isRunning = status === 'discovering' || status === 'repairing' || status === 'verifying';
  const isSuccess = status === 'completed';
  const isFailed = status === 'failed';

  const statusColor = isSuccess
    ? 'text-success bg-success/15 border-success/30'
    : isFailed
      ? 'text-destructive bg-destructive/15 border-destructive/30'
      : isRunning
        ? 'text-info bg-info/15 border-info/30'
        : 'text-muted-foreground bg-muted border-border';

  return (
    <div
      className={`rounded-xl border border-border/80 bg-card p-3 my-2 text-xs shadow-sm ${className}`}
      data-testid="cleanse-status-board"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 font-medium text-foreground">
          <Icon name="tools" className="size-4 text-primary" />
          <span>{t('chat.cleanseStatusBoard.title')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${statusColor}`}
          >
            {status}
          </span>
          {onDismiss && !isRunning && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors inline-flex items-center justify-center cursor-pointer"
              aria-label={t('chat.cleanseStatusBoard.dismiss')}
              data-testid="cleanse-status-board-dismiss"
            >
              <Icon name="close" className="size-3" />
            </button>
          )}
        </div>
      </div>

      {summary && (
        <p className="text-muted-foreground mb-2 leading-relaxed">
          {summary}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-border/40">
        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground">
            {t('chat.cleanseStatusBoard.checkers', { count: completedCheckers.length + activeCheckers.length })}
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {completedCheckers.map((checker) => (
              <span
                key={checker}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] text-foreground font-mono"
              >
                <Icon name="checkbox-circle" className="size-2.5 text-success" />
                {checker}
              </span>
            ))}
            {activeCheckers.map((checker) => (
              <span
                key={checker}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px] font-mono"
              >
                <Icon name="loader-4" className="size-2.5 animate-spin" />
                {checker}
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] uppercase font-semibold text-muted-foreground">
            {t('chat.cleanseStatusBoard.repairedFiles', { count: repairedFiles.length })}
          </span>
          <div className="flex flex-wrap gap-1 mt-1">
            {repairedFiles.length === 0 ? (
              <span className="text-[10px] text-muted-foreground italic">{t('chat.cleanseStatusBoard.noRepairedFiles')}</span>
            ) : (
              repairedFiles.map((file) => (
                <span
                  key={file}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px] text-foreground font-mono"
                >
                  <Icon name="file" className="size-2.5 text-muted-foreground" />
                  {file}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CleanseTimelineBoardProps {
  sessionId: string | null;
  directory?: string;
  className?: string;
}

export const CleanseTimelineBoard: React.FC<CleanseTimelineBoardProps> = ({
  sessionId,
  className = '',
}) => {
  const cleanse = useCleanseStore(
    React.useCallback((state) => (sessionId ? state.bySession[sessionId] : undefined), [sessionId]),
  );

  const handleDismiss = React.useCallback(() => {
    if (sessionId) {
      useCleanseStore.getState().clearSessionCleanse(sessionId);
    }
  }, [sessionId]);

  if (!cleanse) return null;

  return (
    <div className={`chat-message-column ${className}`} data-testid="cleanse-timeline-container">
      <CleanseStatusBoard
        status={cleanse.status}
        activeCheckers={cleanse.activeCheckers}
        completedCheckers={cleanse.completedCheckers}
        repairedFiles={cleanse.repairedFiles}
        summary={cleanse.summary}
        onDismiss={handleDismiss}
      />
    </div>
  );
};
