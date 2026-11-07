import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { AdvisorNote } from '@openchamber/agent-contract';
import { useAdvisorStore } from '@/stores/useAdvisorStore';

interface AdvisorMessageProps {
  notes: AdvisorNote[];
  className?: string;
  onDismiss?: () => void;
}

export const AdvisorMessage: React.FC<AdvisorMessageProps> = ({ notes, className = '', onDismiss }) => {
  const { t } = useI18n();
  if (!notes || notes.length === 0) return null;

  return (
    <div
      className={`rounded-xl border border-border/80 bg-card p-3 my-2 text-xs shadow-sm ${className}`}
      data-testid="advisor-message-card"
    >
      <div className="flex items-center justify-between gap-2 mb-2 font-medium text-foreground">
        <div className="flex items-center gap-2">
          <Icon name="ai-agent" className="size-4 text-primary" />
          <span>{t('chat.advisorMessage.title')}</span>
          <span className="text-muted-foreground text-[11px]">{t('chat.advisorMessage.notes', { count: notes.length })}</span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors inline-flex items-center justify-center cursor-pointer ms-auto"
            aria-label={t('chat.advisorMessage.dismiss')}
            data-testid="advisor-message-dismiss"
          >
            <Icon name="close" className="size-3" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {notes.map((note) => {
          const isBlocker = note.severity === 'blocker';
          const isConcern = note.severity === 'concern';
          const severityClass = isBlocker
            ? 'bg-destructive/15 text-destructive border-destructive/30'
            : isConcern
              ? 'bg-warning/15 text-warning border-warning/30'
              : 'bg-muted text-muted-foreground border-border/50';

          return (
            <div
              key={note.noteId}
              className={`border-s-2 ps-2.5 py-1 ${isBlocker
                  ? 'border-s-destructive'
                  : isConcern
                    ? 'border-s-warning'
                    : 'border-s-muted-foreground'
                }`}
              data-testid={`advisor-note-${note.noteId}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${severityClass}`}
                >
                  {t(`chat.advisorMessage.severity.${note.severity}`)}
                </span>
                {note.advisorName && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    @{note.advisorName}
                  </span>
                )}
              </div>
              <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                {note.text}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface AdvisorTimelineCardProps {
  sessionId: string | null;
  directory?: string;
  className?: string;
}

export const AdvisorTimelineCard: React.FC<AdvisorTimelineCardProps> = ({
  sessionId,
  className = '',
}) => {
  const advisor = useAdvisorStore(
    React.useCallback((state) => (sessionId ? state.bySession[sessionId] : undefined), [sessionId]),
  );

  const handleDismiss = React.useCallback(() => {
    if (sessionId) {
      useAdvisorStore.getState().clearSessionAdvisor(sessionId);
    }
  }, [sessionId]);

  if (!advisor || !advisor.notes || advisor.notes.length === 0) return null;

  return (
    <div className={`chat-message-column ${className}`} data-testid="advisor-timeline-container">
      <AdvisorMessage notes={advisor.notes} onDismiss={handleDismiss} />
    </div>
  );
};
