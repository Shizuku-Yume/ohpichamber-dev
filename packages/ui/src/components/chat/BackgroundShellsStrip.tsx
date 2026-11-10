import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { useDurationTickerNow } from '@/hooks/useDurationTicker';
import { useI18n } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import {
  sessionsInTree,
  backgroundShellsOfSessions,
  useBackgroundShellsStore,
  type TrackedShell,
} from '@/sync/background-shells';
import { JobsSheetDialog } from './JobsSheetDialog';

interface BackgroundShellsStripProps {
  sessionId: string | null;
}

const COMMAND_TOOLTIP_DELAY_MS = 500;

/**
 * Commands of this session and of its subagents. The tree is resolved only
 * for sessions that run something, and the result is compared as a string, so
 * the session list changing during a stream re-renders nothing here.
 */
const useSessionTreeShells = (sessionId: string): TrackedShell[] => {
  const shellSessionIds = useBackgroundShellsStore((state) => state.sessionIds);
  const treeKey = useGlobalSessionsStore(React.useCallback((state) => (
    shellSessionIds.size === 0
      ? ''
      : sessionsInTree(shellSessionIds, sessionId, (id) => state.entityById.get(id)?.parentSessionId ?? undefined).join('\n')
  ), [sessionId, shellSessionIds]));
  const treeIds = React.useMemo(() => new Set(treeKey ? treeKey.split('\n') : []), [treeKey]);
  return useBackgroundShellsStore(useShallow(React.useCallback((state) => (
    treeIds.size === 0 ? [] : backgroundShellsOfSessions(state.byId, treeIds)
  ), [treeIds])));
};

/** Its own leaf, so the once-a-second tick re-renders this text alone. */
const ShellElapsed: React.FC<{ startedAt: number }> = ({ startedAt }) => {
  const { t } = useI18n();
  const now = useDurationTickerNow(true);
  const label = formatSessionActivityDuration(now - startedAt, t);
  return (
    <span className="shrink-0 typography-meta tabular-nums text-muted-foreground" title={t('chat.backgroundShells.elapsed', { duration: label })}>
      {label}
    </span>
  );
};

const ShellRow: React.FC<{
  shell: TrackedShell;
  rootSessionId: string;
  onSelect?: (shell: TrackedShell) => void;
}> = ({ shell, rootSessionId, onSelect }) => {
  const { t } = useI18n();
  const [stopping, setStopping] = React.useState(false);
  const fromSubagent = shell.sessionId !== rootSessionId;

  // Completion is authoritative only when the canonical shell event arrives.
  const stop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (stopping) return;
    setStopping(true);
    const sessionId = shell.sessionId;
    canonicalClient.stopShell(sessionId, {
      job: {
        sessionId,
        jobId: shell.jobId,
        epoch: shell.epoch,
        workerGeneration: shell.workerGeneration,
      },
    }).catch(() => {
      setStopping(false);
      toast.error(t('chat.toolPart.background.stopFailed'));
    });
  };

  const widget = shell.widget;
  const firstBlock = widget?.blocks[0];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(shell)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect?.(shell); }}
      className="flex h-10 items-center gap-2 ps-3 pe-1.5 hover:bg-[var(--interactive-hover)]/60 transition-colors cursor-pointer select-none"
    >
      <span className="size-2 rounded-full bg-status-success shrink-0" title={t('chat.backgroundShells.running')} />
      <Icon name="terminal-box" className="size-3.5 shrink-0 text-muted-foreground" />
      <Tooltip delayDuration={COMMAND_TOOLTIP_DELAY_MS}>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate font-mono typography-meta text-foreground flex items-baseline gap-1.5">
            {shell.caption ? (
              <>
                <span className="font-sans font-medium text-foreground truncate">{shell.caption}</span>
                <span className="font-mono text-muted-foreground text-xs truncate">({shell.command})</span>
              </>
            ) : shell.intent ? (
              <>
                <span className="font-sans font-medium text-foreground truncate">{shell.intent}</span>
                <span className="font-mono text-muted-foreground text-xs truncate">({shell.command})</span>
              </>
            ) : (
              <span className="truncate">{shell.command}</span>
            )}
          </span>
        </TooltipTrigger>
        {/* The row shows one truncated line; the tooltip keeps the command's
            own line breaks and indentation and wraps only overlong lines. */}
        <TooltipContent side="top" sideOffset={6} className="max-w-[min(36rem,90vw)] [text-wrap:wrap]">
          <ScrollableOverlay as="pre" outerClassName="max-h-[50vh]" className="whitespace-pre-wrap break-words font-mono typography-meta" disableHorizontal>
            {shell.command}
          </ScrollableOverlay>
        </TooltipContent>
      </Tooltip>

      {/* Mini Widget Pill */}
      {widget?.headline ? (
        <span className="font-mono font-medium text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
          {widget.headline.text}
        </span>
      ) : firstBlock?.kind === 'meter' ? (
        <span className="font-mono text-[11px] text-status-success bg-status-success/10 px-1.5 py-0.5 rounded border border-status-success/20 shrink-0">
          {Math.round(firstBlock.value * 100)}%
        </span>
      ) : firstBlock?.kind === 'spark' ? (
        <span className="font-mono text-[11px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20 shrink-0">
          {firstBlock.last}
        </span>
      ) : null}

      {fromSubagent ? (
        <span className="shrink-0 typography-meta text-muted-foreground">{t('chat.backgroundShells.subagent')}</span>
      ) : null}
      <ShellElapsed startedAt={shell.startedAt} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={stopping}
        onClick={stop}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={t('chat.backgroundShells.stopAria', { command: shell.command })}
        className="shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error"
      >
        {t('chat.backgroundShells.stop')}
      </Button>
    </div>
  );
};

/**
 * Commands the agent left running in the background (dev servers, watchers,
 * test pages), as a top row of the composer next to the "looks done" hint.
 * One command is its own row; several collapse into a count that expands in
 * place, so the composer grows by one row unless the user asks for the list.
 */
export const BackgroundShellsStrip: React.FC<BackgroundShellsStripProps> = React.memo(({ sessionId }) => {
  const { t } = useI18n();
  const shells = useSessionTreeShells(sessionId ?? '');
  const [expanded, setExpanded] = React.useState(false);
  const [selectedShell, setSelectedShell] = React.useState<TrackedShell | null>(null);
  const listId = React.useId();

  if (!sessionId || shells.length === 0) return null;

  if (shells.length === 1) {
    return (
      <>
        <div role="group" className="border-b border-edge" aria-label={t('chat.backgroundShells.aria')}>
          <ShellRow shell={shells[0]!} rootSessionId={sessionId} onSelect={setSelectedShell} />
        </div>
        <JobsSheetDialog
          open={Boolean(selectedShell)}
          onOpenChange={(open) => { if (!open) setSelectedShell(null); }}
          shell={selectedShell}
          rootSessionId={sessionId}
        />
      </>
    );
  }

  // The whole header toggles the list, as the queue header does.
  return (
    <div role="group" className="border-b border-edge" aria-label={t('chat.backgroundShells.aria')}>
      <div className="flex h-10 items-center ps-3 pe-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((value) => !value)}
          onMouseDown={(event) => event.preventDefault()}
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          className="min-w-0 flex-1 shrink justify-start gap-2 px-0 text-sm font-normal normal-case text-muted-foreground hover:!bg-transparent hover:text-foreground has-[>svg]:px-0"
        >
          <Icon name="terminal-box" className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-start">
            {t('chat.backgroundShells.count', { count: shells.length })}
          </span>
          <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
      {expanded ? (
        <div id={listId}>
          {shells.map((shell) => (
            <ShellRow key={`${shell.sessionId}:${shell.jobId}:${shell.epoch}:${shell.workerGeneration}`} shell={shell} rootSessionId={sessionId} onSelect={setSelectedShell} />
          ))}
        </div>
      ) : null}
      <JobsSheetDialog
        open={Boolean(selectedShell)}
        onOpenChange={(open) => { if (!open) setSelectedShell(null); }}
        shell={selectedShell}
        rootSessionId={sessionId}
      />
    </div>
  );
});

BackgroundShellsStrip.displayName = 'BackgroundShellsStrip';
