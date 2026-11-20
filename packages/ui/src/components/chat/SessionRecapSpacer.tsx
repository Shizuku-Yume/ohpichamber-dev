import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { useSessionAssistState } from '@/hooks/useSessionAssist';
import { useSessionCompacting } from '@/sync/sync-context';
import { useI18n } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface SessionRecapNoteProps {
  sessionId: string;
  directory?: string;
  isMobile: boolean;
}

const plainRecap = (recap: string): string => recap
  .replace(/`([^`]+)`/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1');

export const SessionRecapNote: React.FC<SessionRecapNoteProps> = React.memo(({ sessionId, directory, isMobile }) => {
  const { visibleRecap } = useSessionAssistState(sessionId, directory);
  const { t } = useI18n();

  if (!visibleRecap) {
    return null;
  }

  return (
    <div aria-label={t('chat.recap.aria')}>
      <span className={`typography-meta text-muted-foreground ${isMobile ? 'line-clamp-3' : 'line-clamp-2'}`}>
        <span className="italic text-muted-foreground">{t('chat.recap.label')} </span>
        {plainRecap(visibleRecap)}
      </span>
    </div>
  );
});

SessionRecapNote.displayName = 'SessionRecapNote';

interface CompactionDividerProps {
  method?: string;
  compacting?: boolean;
  tokensBefore?: number;
  tokensAfter?: number;
  summary?: string;
  warning?: string;
  className?: string;
}

const formatTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(tokens);
};

// Legacy spellings the server has used for the same method; canonical names
// pass through so their own copy applies.
const LEGACY_METHOD: Record<string, string> = {
  soft: 'soft-compacted',
  'context-full': 'soft-compacted',
  remote: 'remote-compacted',
  shake: 'shaken',
  snapcompact: 'snap-compacted',
  handoff: 'handed-off',
};

const COMPACTION_METHODS = ['soft-compacted', 'snap-compacted', 'shaken', 'remote-compacted', 'handed-off', 'compacted'] as const;

/**
 * The line a compaction leaves in the transcript: which method ran, how much
 * the conversation shrank, and the summary it replaced the old turns with.
 * Lives here beside the recap note because both describe the transcript's own
 * bookkeeping rather than a turn.
 */
export const CompactionDivider: React.FC<CompactionDividerProps> = React.memo(({
  method,
  compacting = false,
  tokensBefore,
  tokensAfter,
  summary,
  warning,
  className,
}) => {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = React.useState(false);
  const raw = (method ?? 'compacted').toLowerCase().trim();
  const normalized = LEGACY_METHOD[raw] ?? raw;
  const methodKey = COMPACTION_METHODS.some((entry) => entry === normalized) ? normalized : 'compacted';
  const beforeTokens = tokensBefore ?? 0;
  return (
    <div
      data-compaction-divider=""
      data-compaction-state={compacting ? 'running' : 'settled'}
      data-compaction-method={methodKey}
      className={cn('my-4 select-none', className)}
    >
      <div className="flex items-center gap-3 typography-meta text-muted-foreground">
        <div className="h-px flex-1 bg-border/40" />
        {compacting ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1 font-medium"
          >
            <Icon name="loader-4" className="size-3.5 animate-spin text-muted-foreground" />
            <span className="font-semibold text-foreground/80">
              {t('chat.compaction.running')}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={summary ? () => setIsExpanded((previous) => !previous) : undefined}
            aria-expanded={summary ? isExpanded : undefined}
            aria-label={summary ? (isExpanded ? t('chat.compaction.collapseSummary') : t('chat.compaction.expandSummary')) : undefined}
            className={cn('flex items-center gap-2 rounded-full border border-border/50 bg-background/80 px-3 py-1 font-medium', summary && 'hover:bg-interactive-hover')}
          >
            <Icon name="archive" className="size-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground/80">
              {tokensAfter === undefined
                ? t('chat.compaction.titleNoAfter', { method: t(`chat.compaction.method.${methodKey}` as I18nKey), before: formatTokens(beforeTokens) })
                : t('chat.compaction.title', { method: t(`chat.compaction.method.${methodKey}` as I18nKey), before: formatTokens(beforeTokens), after: formatTokens(tokensAfter) })}
            </span>
            {warning ? <Icon name="alert" className="size-3.5 text-status-warning" /> : null}
          </button>
        )}
        <div className="h-px flex-1 bg-border/40" />
      </div>
      {!compacting && isExpanded && summary ? (
        <div className="mx-auto mt-2.5 max-w-2xl rounded-xl border border-border/40 bg-card/60 p-4 shadow-xs">
          {warning ? (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-status-warning/20 bg-status-warning/5 p-2 text-status-warning">
              <Icon name="alert" className="size-3.5 shrink-0" />
              <span>{t('chat.compaction.warning', { warning })}</span>
            </div>
          ) : null}
          <div className="text-foreground/90 leading-relaxed">
            <SimpleMarkdownRenderer content={summary} />
          </div>
        </div>
      ) : null}
    </div>
  );
});

CompactionDivider.displayName = 'CompactionDivider';

interface LiveCompactionDividerProps {
  sessionId: string | null;
  directory?: string;
  className?: string;
}

export const LiveCompactionDivider: React.FC<LiveCompactionDividerProps> = React.memo(({
  sessionId,
  directory,
  className,
}) => {
  const compacting = useSessionCompacting(sessionId, directory);
  if (!compacting) return null;
  return <CompactionDivider compacting method={compacting.method} className={className} />;
});

LiveCompactionDivider.displayName = 'LiveCompactionDivider';
