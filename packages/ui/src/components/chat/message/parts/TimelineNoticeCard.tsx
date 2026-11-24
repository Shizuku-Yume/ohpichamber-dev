import React from 'react';
import type { NoticePart, Subagent } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { useOpenChildSession } from '@/components/chat/work-status/useOpenChildSession';
import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';

const EMPTY_SUBAGENTS: Subagent[] = [];

interface TimelineNoticeCardProps {
  notice: NoticePart;
  sessionId?: string;
  directory?: string | null;
  defaultExpanded?: boolean;
  className?: string;
}

export const TimelineNoticeCard: React.FC<TimelineNoticeCardProps> = ({
  notice,
  sessionId,
  directory,
  defaultExpanded = false,
  className,
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const isMobile = useUIStore((state) => state.isMobile);
  const activeSessionId = useSessionUIStore((state) => state.currentSessionId);
  const activeSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);
  const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);
  const effectiveSessionId = sessionId ?? activeSessionId;
  const effectiveDirectory = directory ?? activeSessionDirectory ?? fallbackDirectory ?? null;
  const subagents = useSubagentsStore(
    React.useCallback((state) => (effectiveSessionId ? (state.byParent[effectiveSessionId] ?? EMPTY_SUBAGENTS) : EMPTY_SUBAGENTS), [effectiveSessionId]),
  );
  const openChildSession = useOpenChildSession(effectiveDirectory);

  const { noticeType, level } = notice;
  const isTaskAsyncDelivery = notice.noticeType === 'async_job_result'
    && notice.details.jobs.some((job) => job.type === 'task' || Boolean(job.subagentId || job.childSessionId));

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
      case 'async_job_result':
        return isTaskAsyncDelivery ? 'ai-agent' as const : 'terminal-box' as const;
      default:
        return level === 'error' ? 'alert' as const : 'information' as const;
    }
  }, [isTaskAsyncDelivery, noticeType, level]);

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
      case 'async_job_result': {
        const jobs = notice.details.jobs;
        if (jobs.length === 1) {
          const job = jobs[0]!;
          const matchingSubagent = subagents.find(
            (candidate) => candidate.subagentId === (job.subagentId ?? job.jobId) || (job.subagentId ? candidate.name === job.subagentId : false),
          );
          const name = job.label?.trim() || matchingSubagent?.name?.trim() || job.subagentId || job.jobId;
          const isSubagent = job.type === 'task' || Boolean(job.subagentId || job.childSessionId || matchingSubagent);
          if (isSubagent) {
            return job.status === 'failed'
              ? t('chat.notice.asyncJobResultSubagentFailed', { name })
              : t('chat.notice.asyncJobResultSubagent', { name });
          }
          return job.status === 'failed'
            ? t('chat.notice.asyncJobResultJobFailed', { name })
            : t('chat.notice.asyncJobResultJob', { name });
        }
        return isTaskAsyncDelivery
          ? t('chat.notice.asyncJobResultSubagents', { count: jobs.length })
          : t('chat.notice.asyncJobResultJobs', { count: jobs.length });
      }
    }
  }, [isTaskAsyncDelivery, notice, subagents, t]);

  const hasDetails = Boolean(notice.message || notice.details);
  const showSubagentsPanelAction = isTaskAsyncDelivery && Boolean(effectiveDirectory) && !isMobile && !isVSCodeRuntime();
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
        <div className="flex items-center gap-1.5 shrink-0">
          {showSubagentsPanelAction && effectiveDirectory ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={(event) => {
                event.stopPropagation();
                openSubagentsPanel(effectiveDirectory);
              }}
              aria-label={t('chat.workStatus.subagent.openPanel')}
              title={t('chat.workStatus.subagent.openPanel')}
              className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <Icon name="ai-agent" className="size-3" />
            </Button>
          ) : null}
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

          {notice.noticeType === 'async_job_result' && (
            <div className="space-y-2">
              {notice.details.jobs.map((job) => {
                const matchingSubagent = subagents.find(
                  (candidate) => candidate.subagentId === (job.subagentId ?? job.jobId) || (job.subagentId ? candidate.name === job.subagentId : false),
                );
                const childSessionId = job.childSessionId ?? matchingSubagent?.childSessionId;
                const jobName = job.label?.trim() || matchingSubagent?.name?.trim() || job.subagentId || job.jobId;
                const statusIcon = job.status === 'failed'
                  ? { name: 'close-circle' as const, style: { color: 'var(--status-error)' } }
                  : job.status === 'running'
                    ? { name: 'record-circle' as const, style: { color: 'var(--status-info)' } }
                    : job.status === 'cancelled'
                      ? { name: 'close-circle' as const, style: undefined }
                      : { name: 'checkbox-circle' as const, style: { color: 'var(--status-success)' } };
                const reportBody = job.reportText.trim();
                return (
                  <div key={job.jobId} className="space-y-1.5 rounded-lg border border-border/20 bg-muted/15 p-2">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon
                          name={statusIcon.name}
                          className={cn('size-3.5 shrink-0', !statusIcon.style && 'text-muted-foreground')}
                          style={statusIcon.style}
                        />
                        <span className="font-medium text-foreground truncate" dir="auto">{jobName}</span>
                        {job.durationMs !== undefined ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                            {formatSessionActivityDuration(job.durationMs, t)}
                          </span>
                        ) : null}
                      </div>
                      {childSessionId && effectiveDirectory ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            openChildSession(childSessionId, jobName);
                          }}
                          aria-label={t('chat.toolPart.openSubtask', { type: matchingSubagent?.role ?? jobName })}
                          className="h-5 px-1.5 text-[11px] shrink-0"
                        >
                          <Icon name="external-link" className="size-3" />
                          <span>{t('subagents.panel.openSession')}</span>
                        </Button>
                      ) : null}
                    </div>
                    {reportBody ? (
                      <div className="text-foreground/90 max-h-60 overflow-y-auto">
                        <SimpleMarkdownRenderer
                          content={reportBody}
                          variant="tool"
                          fallbackContent={<div className="whitespace-pre-wrap">{reportBody}</div>}
                        />
                      </div>
                    ) : (
                      <div className="text-muted-foreground/70">{t('chat.notice.asyncJobResultEmpty')}</div>
                    )}
                  </div>
                );
              })}
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
