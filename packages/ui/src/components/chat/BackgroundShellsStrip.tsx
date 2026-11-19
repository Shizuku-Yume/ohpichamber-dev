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
<<<<<<< HEAD
import { JobsSheetDialog } from './JobsSheetDialog';
||||||| bc50ba56aa
import { backgroundImagesOfSessions, useBackgroundImagesStore } from '@/sync/background-images';
import type { RunningImageJob } from '@/lib/opencode/background-image';
=======
import { isForegroundShellStopping, useForegroundShellStopping, useForegroundShellStoppingIds } from './message/parts/foregroundShellStop';
import { backgroundImagesOfSessions, useBackgroundImagesStore } from '@/sync/background-images';
import type { RunningImageJob } from '@/lib/opencode/background-image';
>>>>>>> upstream/main

interface BackgroundShellsStripProps {
  sessionId: string | null;
}

const COMMAND_TOOLTIP_DELAY_MS = 500;

<<<<<<< HEAD
/**
 * Commands of this session and of its subagents. The tree is resolved only
 * for sessions that run something, and the result is compared as a string, so
 * the session list changing during a stream re-renders nothing here.
 */
||||||| bc50ba56aa
/**
 * Which sessions with background work belong to this session's tree. The tree
 * is resolved only for sessions that run something, and the result is
 * compared as a string, so the session list changing during a stream
 * re-renders nothing here.
 */
const useTreeIds = (sessionId: string, workingSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
  const treeKey = useGlobalSessionsStore(React.useCallback((state) => (
    workingSessionIds.size === 0
      ? ''
      : sessionsInTree(workingSessionIds, sessionId, (id) => state.entityById.get(id)?.parentID ?? undefined).join('\n')
  ), [sessionId, workingSessionIds]));
  return React.useMemo(() => new Set(treeKey ? treeKey.split('\n') : []), [treeKey]);
};

/** Commands of this session and of its subagents. */
=======
const useTreeIds = (sessionId: string, workingSessionIds: ReadonlySet<string>): ReadonlySet<string> => {
  const treeKey = useGlobalSessionsStore(React.useCallback((state) => (
    workingSessionIds.size === 0
      ? ''
      : sessionsInTree(workingSessionIds, sessionId, (id) => state.entityById.get(id)?.parentID ?? undefined).join('\n')
  ), [sessionId, workingSessionIds]));
  return React.useMemo(() => new Set(treeKey ? treeKey.split('\n') : []), [treeKey]);
};

>>>>>>> upstream/main
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

<<<<<<< HEAD
/** Its own leaf, so the once-a-second tick re-renders this text alone. */
||||||| bc50ba56aa
/** Images this session and its subagents are generating. */
const useSessionTreeImages = (sessionId: string): RunningImageJob[] => {
  const treeIds = useTreeIds(sessionId, useBackgroundImagesStore((state) => state.sessionIds));
  return useBackgroundImagesStore(useShallow(React.useCallback((state) => (
    treeIds.size === 0 ? [] : backgroundImagesOfSessions(state.byId, treeIds)
  ), [treeIds])));
};

/** Its own leaf, so the once-a-second tick re-renders this text alone. */
=======
const useSessionTreeImages = (sessionId: string): RunningImageJob[] => {
  const treeIds = useTreeIds(sessionId, useBackgroundImagesStore((state) => state.sessionIds));
  return useBackgroundImagesStore(useShallow(React.useCallback((state) => (
    treeIds.size === 0 ? [] : backgroundImagesOfSessions(state.byId, treeIds)
  ), [treeIds])));
};

>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
const STOP_BUTTON_CLASS = 'shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error';

/**
 * Stops commands through the same flow as a command's row in the chat: the
 * agent is told first, then the commands are removed. Commands of one session
 * go in one call, so stopping several tells that agent once and its
 * completions arrive together. A row stays disabled until OpenCode reports
 * its command ended and it leaves the list.
 */
const useStopShells = (rootSessionId: string, rootDirectory: string | undefined) => {
  const { t } = useI18n();
  const [stoppingIds, setStoppingIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const stop = React.useCallback((shells: readonly TrackedShell[]) => {
    const pending = shells.filter((shell) => !stoppingIds.has(shell.id));
    if (pending.length === 0) return;
    setStoppingIds((current) => new Set([...current, ...pending.map((shell) => shell.id)]));
    const bySession = new Map<string, [TrackedShell, ...TrackedShell[]]>();
    for (const shell of pending) {
      const group = bySession.get(shell.sessionID);
      if (group) group.push(shell);
      else bySession.set(shell.sessionID, [shell]);
    }
    for (const [sessionID, [first, ...rest]] of bySession) {
      const sessionDirectory = sessionID === rootSessionId
        ? rootDirectory
        : useGlobalSessionsStore.getState().entityById.get(sessionID)?.directory ?? first.directory;
      const toStop = (shell: TrackedShell) => ({ shellID: shell.id, shellDirectory: shell.directory, command: shell.command });
      opencodeClient.stopBackgroundShells({
        sessionID,
        sessionDirectory,
        shells: [toStop(first), ...rest.map(toStop)],
      }).catch(() => {
        // A command whose kill went through leaves the list on its own; the
        // rest become stoppable again.
        setStoppingIds((current) => {
          const next = new Set(current);
          for (const shell of [first, ...rest]) next.delete(shell.id);
          return next;
        });
        toast.error(t('chat.toolPart.background.stopFailed'));
      });
    }
  }, [rootDirectory, rootSessionId, stoppingIds, t]);

  return { stoppingIds, stop };
};

=======
const STOP_BUTTON_CLASS = 'shrink-0 text-status-error/80 hover:bg-transparent hover:text-status-error';

const useStopShells = (rootSessionId: string, rootDirectory: string | undefined) => {
  const { t } = useI18n();
  const [stoppingIds, setStoppingIds] = React.useState<ReadonlySet<string>>(() => new Set());

  const stop = React.useCallback((shells: readonly TrackedShell[]) => {
    const pending = shells.filter((shell) => !stoppingIds.has(shell.id) && !isForegroundShellStopping(shell.id));
    if (pending.length === 0) return;
    setStoppingIds((current) => new Set([...current, ...pending.map((shell) => shell.id)]));
    const bySession = new Map<string, [TrackedShell, ...TrackedShell[]]>();
    for (const shell of pending) {
      const group = bySession.get(shell.sessionID);
      if (group) group.push(shell);
      else bySession.set(shell.sessionID, [shell]);
    }
    for (const [sessionID, [first, ...rest]] of bySession) {
      const sessionDirectory = sessionID === rootSessionId
        ? rootDirectory
        : useGlobalSessionsStore.getState().entityById.get(sessionID)?.directory ?? first.directory;
      const toStop = (shell: TrackedShell) => ({ shellID: shell.id, shellDirectory: shell.directory, command: shell.command });
      opencodeClient.stopBackgroundShells({
        sessionID,
        sessionDirectory,
        shells: [toStop(first), ...rest.map(toStop)],
      }).catch(() => {
        setStoppingIds((current) => {
          const next = new Set(current);
          for (const shell of [first, ...rest]) next.delete(shell.id);
          return next;
        });
        toast.error(t('chat.toolPart.background.stopFailed'));
      });
    }
  }, [rootDirectory, rootSessionId, stoppingIds, t]);

  return { stoppingIds, stop };
};

>>>>>>> upstream/main
const ShellRow: React.FC<{
  shell: TrackedShell;
  rootSessionId: string;
  onSelect?: (shell: TrackedShell) => void;
}> = ({ shell, rootSessionId, onSelect }) => {
  const { t } = useI18n();
<<<<<<< HEAD
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
||||||| bc50ba56aa
=======
  const stoppingFromRow = useForegroundShellStopping(shell.id);
>>>>>>> upstream/main

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
<<<<<<< HEAD
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
||||||| bc50ba56aa
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={stopping}
              onClick={() => onStop(shell)}
              onMouseDown={(event) => event.preventDefault()}
              aria-label={t('chat.backgroundShells.stopAria', { command: shell.command })}
              className={STOP_BUTTON_CLASS}
            >
              {t('chat.backgroundShells.stop')}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.shellStop')}</TooltipContent>
      </Tooltip>
    </div>
  );
};

/** The name an image gets, without its folder; the path has no extension yet. */
const imageName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/**
 * An image being generated. OpenCode has no route that cancels an image job,
 * so the row has no Stop.
 */
const ImageRow: React.FC<{ job: RunningImageJob; fromSubagent: boolean }> = ({ job, fromSubagent }) => {
  const { t } = useI18n();

  return (
    <div className="flex oc-composer-row items-center gap-2 ps-3 pe-3">
      <Icon name="image" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 typography-ui-label text-foreground">{t('chat.backgroundImages.generating')}</span>
      <Tooltip delayDuration={COMMAND_TOOLTIP_DELAY_MS}>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate font-mono typography-code text-muted-foreground">
            {imageName(job.path)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[min(36rem,90vw)] break-words">
          <div className="font-mono typography-code">{job.path}</div>
          <div className="typography-meta text-muted-foreground">{job.model}</div>
        </TooltipContent>
      </Tooltip>
      {fromSubagent ? (
        <span className="shrink-0 typography-meta text-muted-foreground">{t('chat.backgroundShells.subagent')}</span>
      ) : null}
      <ShellElapsed startedAt={job.startedAt} />
=======
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={stopping || stoppingFromRow}
              onClick={() => onStop(shell)}
              onMouseDown={(event) => event.preventDefault()}
              aria-label={t('chat.backgroundShells.stopAria', { command: shell.command })}
              className={STOP_BUTTON_CLASS}
            >
              {t('chat.backgroundShells.stop')}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.shellStop')}</TooltipContent>
      </Tooltip>
    </div>
  );
};

const imageName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

const ImageRow: React.FC<{ job: RunningImageJob; fromSubagent: boolean }> = ({ job, fromSubagent }) => {
  const { t } = useI18n();

  return (
    <div className="flex oc-composer-row items-center gap-2 ps-3 pe-3">
      <Icon name="image" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 typography-ui-label text-foreground">{t('chat.backgroundImages.generating')}</span>
      <Tooltip delayDuration={COMMAND_TOOLTIP_DELAY_MS}>
        <TooltipTrigger asChild>
          <span className="min-w-0 flex-1 truncate font-mono typography-code text-muted-foreground">
            {imageName(job.path)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[min(36rem,90vw)] break-words">
          <div className="font-mono typography-code">{job.path}</div>
          <div className="typography-meta text-muted-foreground">{job.model}</div>
        </TooltipContent>
      </Tooltip>
      {fromSubagent ? (
        <span className="shrink-0 typography-meta text-muted-foreground">{t('chat.backgroundShells.subagent')}</span>
      ) : null}
      <ShellElapsed startedAt={job.startedAt} />
>>>>>>> upstream/main
    </div>
  );
};

<<<<<<< HEAD
/**
 * Commands the agent left running in the background (dev servers, watchers,
 * test pages), as a top row of the composer next to the "looks done" hint.
 * One command is its own row; several collapse into a count that expands in
 * place, so the composer grows by one row unless the user asks for the list.
 */
export const BackgroundShellsStrip: React.FC<BackgroundShellsStripProps> = React.memo(({ sessionId }) => {
||||||| bc50ba56aa
/**
 * Commands the agent left running in the background (dev servers, watchers,
 * test pages) and images it is generating, as a top row of the composer next
 * to the "looks done" hint. One item is its own row; several collapse into a
 * count that expands in place, so the composer grows by one row unless the
 * user asks for the list.
 */
export const BackgroundShellsStrip: React.FC<BackgroundShellsStripProps> = React.memo(({ sessionId, directory }) => {
=======
export const BackgroundShellsStrip: React.FC<BackgroundShellsStripProps> = React.memo(({ sessionId, directory }) => {
>>>>>>> upstream/main
  const { t } = useI18n();
  const shells = useSessionTreeShells(sessionId ?? '');
  const [expanded, setExpanded] = React.useState(false);
  const [selectedShell, setSelectedShell] = React.useState<TrackedShell | null>(null);
  const listId = React.useId();
<<<<<<< HEAD
||||||| bc50ba56aa
  const { stoppingIds, stop } = useStopShells(sessionId ?? '', directory);
  const stopOne = React.useCallback((shell: TrackedShell) => stop([shell]), [stop]);
=======
  const { stoppingIds, stop } = useStopShells(sessionId ?? '', directory);
  const stopOne = React.useCallback((shell: TrackedShell) => stop([shell]), [stop]);
  const foregroundStoppingIds = useForegroundShellStoppingIds();
>>>>>>> upstream/main

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

<<<<<<< HEAD
  // The whole header toggles the list, as the queue header does.
||||||| bc50ba56aa
  // The header toggles the list, as the queue header does, and stops every
  // command in it at once.
=======
>>>>>>> upstream/main
  return (
<<<<<<< HEAD
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
||||||| bc50ba56aa
    <div role="group" className="border-b border-edge" aria-label={ariaLabel}>
      <div className="flex oc-composer-row items-center gap-2 ps-3 pe-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
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
              <Icon name={shells.length === 0 ? 'image' : 'terminal-box'} className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-start">
                {images.length === 0
                  ? t('chat.backgroundShells.count', { count })
                  : t('chat.backgroundWork.count', { count })}
              </span>
              <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t(expanded ? 'contextTooltips.chat.shellsHide' : 'contextTooltips.chat.shellsShow')}</TooltipContent>
        </Tooltip>
        {/* Stops the commands only: an image job cannot be cancelled. */}
        {shells.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={shells.every((shell) => stoppingIds.has(shell.id))}
                  onClick={() => stop(shells)}
                  onMouseDown={(event) => event.preventDefault()}
                  className={STOP_BUTTON_CLASS}
                >
                  {t('chat.backgroundShells.stopAll')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.shellStopAll')}</TooltipContent>
          </Tooltip>
        ) : null}
=======
    <div role="group" className="border-b border-edge" aria-label={ariaLabel}>
      <div className="flex oc-composer-row items-center gap-2 ps-3 pe-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
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
              <Icon name={shells.length === 0 ? 'image' : 'terminal-box'} className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-start">
                {images.length === 0
                  ? t('chat.backgroundShells.count', { count })
                  : t('chat.backgroundWork.count', { count })}
              </span>
              <Icon name={expanded ? 'arrow-up-s' : 'arrow-down-s'} className="size-4 shrink-0" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>{t(expanded ? 'contextTooltips.chat.shellsHide' : 'contextTooltips.chat.shellsShow')}</TooltipContent>
        </Tooltip>
        {shells.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={shells.every((shell) => stoppingIds.has(shell.id) || foregroundStoppingIds.has(shell.id))}
                  onClick={() => stop(shells)}
                  onMouseDown={(event) => event.preventDefault()}
                  className={STOP_BUTTON_CLASS}
                >
                  {t('chat.backgroundShells.stopAll')}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('contextTooltips.chat.shellStopAll')}</TooltipContent>
          </Tooltip>
        ) : null}
>>>>>>> upstream/main
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
