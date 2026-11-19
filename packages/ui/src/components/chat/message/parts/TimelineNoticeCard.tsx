import React from 'react';
import type { NoticePart } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';

interface TimelineNoticeCardProps {
  notice: NoticePart;
  className?: string;
}

export const TimelineNoticeCard: React.FC<TimelineNoticeCardProps> = ({ notice, className }) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const { noticeType, level } = notice;

  // Icon mapping
  const iconName = React.useMemo(() => {
    switch (noticeType) {
      case 'todo_reminder':
        return 'checkbox' as const;
      case 'ttsr_triggered':
        return 'arrow-go-back' as const;
      case 'auto_retry_start':
        return 'refresh' as const;
      case 'retry_fallback_applied':
        return 'arrow-right' as const;
      case 'served_model_mismatch':
        return 'alert' as const;
      case 'cache_invalidation':
        return 'database-2' as const;
      default:
        return level === 'error' ? 'alert' as const : 'information' as const;
    }
  }, [noticeType, level]);

  // Tone styling
  const toneClasses = React.useMemo(() => {
    if (level === 'error') {
      return {
        card: 'border-status-error/30 bg-status-error/5 text-status-error',
        icon: 'text-status-error',
        badge: 'bg-status-error/10 text-status-error border-status-error/20',
      };
    }
    if (level === 'info') {
      return {
        card: 'border-accent/30 bg-accent/5 text-foreground',
        icon: 'text-accent',
        badge: 'bg-accent/10 text-accent border-accent/20',
      };
    }
    // Default warning
    return {
      card: 'border-status-warning/30 bg-status-warning/5 text-foreground',
      icon: 'text-status-warning',
      badge: 'bg-status-warning/10 text-status-warning border-status-warning/20',
    };
  }, [level]);

  // Localized title
  const title = React.useMemo(() => {
    if (notice.title) return notice.title;
    switch (notice.noticeType) {
      case 'todo_reminder': {
        const incompleteCount = notice.details.todos.filter(
          tItem => tItem.status === 'pending' || tItem.status === 'in_progress'
        ).length;
        return incompleteCount === 1
          ? t('chat.notice.todoReminderSingle', { count: incompleteCount, attempt: notice.details.attempt, maxAttempts: notice.details.maxAttempts })
          : t('chat.notice.todoReminder', { count: incompleteCount, attempt: notice.details.attempt, maxAttempts: notice.details.maxAttempts });
      }
      case 'ttsr_triggered': {
        const count = notice.details.rules.length;
        return count === 1
          ? t('chat.notice.ttsrTriggered', { name: notice.details.rules[0]?.name ?? '' })
          : t('chat.notice.ttsrTriggeredMulti', { count });
      }
      case 'auto_retry_start':
        return t('chat.notice.autoRetryStart', { attempt: notice.details.attempt, maxAttempts: notice.details.maxAttempts });
      case 'retry_fallback_applied':
        return t('chat.notice.retryFallbackApplied', { from: notice.details.from, to: notice.details.to, role: notice.details.role });
      case 'served_model_mismatch':
        return t('chat.notice.servedModelMismatch', { requested: notice.details.requested, served: notice.details.served });
      case 'cache_invalidation':
        return t('chat.notice.cacheInvalidation');
    }
  }, [notice, t]);

  const hasDetails = Boolean(notice.message || notice.details);

  return (
    <div
      data-timeline-notice=""
      data-notice-type={noticeType}
      className={cn(
        'group/notice my-2 rounded-xl border p-3 text-xs transition-colors',
        toneClasses.card,
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name={iconName} className={cn('size-4 shrink-0', toneClasses.icon)} />
          <span className="font-medium tracking-tight truncate">{title}</span>
        </div>

        {hasDetails && (
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? t('chat.notice.hideDetailsAria') : t('chat.notice.showDetailsAria')}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
          >
            <span>{isExpanded ? t('chat.notice.hide') : t('chat.notice.details')}</span>
            <Icon
              name="arrow-down-s"
              className={cn('size-3.5 transition-transform duration-200', isExpanded && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {isExpanded && (
        <div className="mt-2.5 pt-2 border-t border-border/20 text-muted-foreground text-[11px] space-y-1.5 animate-in fade-in-50 duration-150">
          {notice.noticeType === 'todo_reminder' && (
            <ul className="space-y-1">
              {notice.details.todos.map((todo, idx) => {
                const isDone = todo.status === 'completed';
                return (
                  <li key={idx} className="flex items-center gap-1.5">
                    <Icon
                      name={isDone ? 'checkbox-circle' : 'checkbox-blank-circle'}
                      className={cn('size-3.5 shrink-0', isDone ? 'text-status-success' : 'text-status-warning')}
                    />
                    <span className={isDone ? 'line-through opacity-70' : ''}>{todo.content}</span>
                    <span className="text-[10px] opacity-60">({todo.status})</span>
                  </li>
                );
              })}
            </ul>
          )}

          {notice.noticeType === 'ttsr_triggered' && (
            <div className="space-y-1">
              {notice.details.rules.map((rule, idx) => (
                <div key={idx} className="p-1.5 rounded bg-muted/20 border border-border/10">
                  <div className="font-mono font-medium text-foreground">{rule.name}</div>
                  {rule.description && <div className="text-[10px] text-muted-foreground mt-0.5">{rule.description}</div>}
                </div>
              ))}
            </div>
          )}

          {notice.noticeType === 'auto_retry_start' && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{t('chat.notice.attempt')}</span>
                <span className="font-mono">{notice.details.attempt} / {notice.details.maxAttempts}</span>
                {notice.details.delayMs > 0 && (
                  <span className="text-[10px] text-muted-foreground">({t('chat.notice.retryDelay', { seconds: Math.round(notice.details.delayMs / 1000) })})</span>
                )}
              </div>
              {notice.details.errorMessage && (
                <div className="font-mono text-[10px] p-1.5 rounded bg-muted/20 whitespace-pre-wrap">
                  {notice.details.errorMessage}
                </div>
              )}
            </div>
          )}

          {notice.noticeType === 'retry_fallback_applied' && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-mono">
                <span>{notice.details.from}</span>
                <span>→</span>
                <span className="text-foreground font-semibold">{notice.details.to}</span>
                <span className="text-[10px] text-muted-foreground">({notice.details.role})</span>
              </div>
              {notice.details.reason && (
                <div className="text-[10px]">{notice.details.reason}</div>
              )}
            </div>
          )}

          {notice.noticeType === 'served_model_mismatch' && (
            <div className="space-y-1 font-mono text-[10px]">
              <div>{t('chat.notice.requested')} <span className="text-foreground">{notice.details.requested}</span></div>
              <div>{t('chat.notice.served')} <span className="text-status-warning font-semibold">{notice.details.served}</span></div>
              {notice.details.provider ? (
                <div>
                  {notice.details.upstreamProvider
                    ? t('chat.notice.providerVia', { provider: notice.details.provider, upstream: notice.details.upstreamProvider })
                    : t('chat.notice.provider', { provider: notice.details.provider })}
                </div>
              ) : null}
            </div>
          )}

          {notice.noticeType === 'cache_invalidation' && (
            <div className="flex items-center gap-2">
              <span>{t('chat.notice.reprocessedTokens')}</span>
              <span className="font-mono font-semibold text-foreground">
                {notice.details.reprocessedTokens.toLocaleString()}
              </span>
            </div>
          )}

          {notice.message && notice.noticeType !== 'auto_retry_start' && notice.noticeType !== 'retry_fallback_applied' && (
            <div className="whitespace-pre-wrap leading-relaxed">{notice.message}</div>
          )}
        </div>
      )}
    </div>
  );
};
