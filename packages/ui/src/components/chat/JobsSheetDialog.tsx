import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { formatSessionActivityDuration } from '@/components/session/sessionActivityDurationFormat';
import { useDurationTickerNow } from '@/hooks/useDurationTicker';
import { useI18n } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import type {
  JobWidgetBlock,
  JobWidgetView,
} from '@openchamber/agent-contract';
import type { EndedShell, TrackedShell } from '@/sync/background-shells';
import { problemMessage } from '@/lib/problemMessage';

interface JobsSheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shell: TrackedShell | EndedShell | null;
  rootSessionId: string;
}

function toneToColorClass(tone?: string): string {
  switch (tone) {
    case 'success':
      return 'text-status-success bg-status-success/10 border-status-success/20';
    case 'error':
      return 'text-status-error bg-status-error/10 border-status-error/20';
    case 'warning':
      return 'text-status-warning bg-status-warning/10 border-status-warning/20';
    case 'info':
      return 'text-status-info bg-status-info/10 border-status-info/20';
    case 'accent':
      return 'text-accent-foreground bg-accent/20 border-accent/30';
    case 'muted':
    default:
      return 'text-muted-foreground bg-muted border-border';
  }
}

function toneToProgressClass(tone?: string): string {
  switch (tone) {
    case 'success':
      return 'bg-status-success';
    case 'error':
      return 'bg-status-error';
    case 'warning':
      return 'bg-status-warning';
    case 'info':
      return 'bg-status-info';
    case 'accent':
      return 'bg-accent';
    case 'muted':
    default:
      return 'bg-primary';
  }
}

const JobWidgetBlockRenderer: React.FC<{ block: JobWidgetBlock }> = ({ block }) => {
  const { t } = useI18n();
  switch (block.kind) {
    case 'spark': {
      const { label, values, min, max, last, tone } = block;
      const width = 240;
      const height = 48;
      const range = max - min || 1;
      const points = values.map((val: number, idx: number) => {
        const x = (idx / Math.max(values.length - 1, 1)) * (width - 8) + 4;
        const y = height - 4 - ((val - min) / range) * (height - 8);
        return `${x},${y}`;
      }).join(' ');

      return (
        <div className="flex flex-col gap-1 p-3 rounded-lg border border-border/50 bg-[var(--surface-subtle)]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{label}</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-mono font-medium border ${toneToColorClass(tone)}`}>
              {last}
            </span>
          </div>
          {values.length > 1 ? (
            <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
              <polyline
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
                className={tone === 'error' ? 'text-status-error' : tone === 'success' ? 'text-status-success' : 'text-primary'}
              />
            </svg>
          ) : (
            <div className="h-8 flex items-center justify-center text-xs text-muted-foreground font-mono">
              {last}
            </div>
          )}
          <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>{t('chat.jobsSheet.min', { value: min })}</span>
            <span>{t('chat.jobsSheet.max', { value: max })}</span>
          </div>
        </div>
      );
    }

    case 'bars': {
      const { label, items, max } = block;
      return (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-border/50 bg-[var(--surface-subtle)]">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <div className="flex flex-col gap-1.5">
            {items.map((item: { label: string; value: number; text: string; tone?: string }, idx: number) => {
              const pct = max > 0 ? Math.min(100, Math.max(0, (item.value / max) * 100)) : 0;
              return (
                <div key={idx} className="flex flex-col gap-0.5 text-xs">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{item.label}</span>
                    <span className="font-mono">{item.text}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${toneToProgressClass(item.tone)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    case 'meter': {
      const { label, value, text: meterText, tone } = block;
      const pct = Math.min(100, Math.max(0, Math.round(value * 100)));
      return (
        <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/50 bg-[var(--surface-subtle)]">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">{label}</span>
            <span className="font-mono text-muted-foreground">{meterText} ({pct}%)</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${toneToProgressClass(tone)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    }

    case 'grid': {
      const { label, items } = block;
      return (
        <div className="flex flex-col gap-1.5 p-3 rounded-lg border border-border/50 bg-[var(--surface-subtle)]">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {items.map((item: { label: string; text: string; tone: string }, idx: number) => (
              <div
                key={idx}
                className={`flex items-center gap-2 p-2 rounded border text-xs font-mono ${toneToColorClass(item.tone)}`}
              >
                <div className={`size-1.5 rounded-full ${toneToProgressClass(item.tone)}`} />
                <span className="font-medium truncate">{item.label}</span>
                <span className="text-[10px] ms-auto opacity-80">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'stat': {
      const { items } = block;
      return (
        <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-border/50 bg-[var(--surface-subtle)]">
          {items.map((item: { label: string; text: string; tone?: string; trend?: { text: string; tone: string } }, idx: number) => (
            <div key={idx} className="flex items-baseline gap-1.5 px-2.5 py-1 rounded bg-[var(--surface-elevated)] border border-border/40 text-xs">
              <span className="text-muted-foreground">{item.label}:</span>
              <span className={`font-mono font-medium ${toneToColorClass(item.tone).split(' ')[0]}`}>{item.text}</span>
              {item.trend ? (
                <span className={`text-[10px] ${item.trend.tone === 'success' ? 'text-status-success' : item.trend.tone === 'error' ? 'text-status-error' : 'text-muted-foreground'}`}>
                  {item.trend.text}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      );
    }

    case 'text': {
      return (
        <div className="p-2.5 rounded-lg border border-border/50 bg-[var(--surface-subtle)] font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
          {block.text}
        </div>
      );
    }

    default:
      return null;
  }
};

export const JobWidgetViewRenderer: React.FC<{ widget: JobWidgetView }> = ({ widget }) => {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-[var(--surface-subtle)] p-3.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="pulse" className="size-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">{widget.title}</span>
        </div>
        {widget.headline ? (
          <div className="flex items-baseline gap-1.5">
            {widget.headline.label ? (
              <span className="text-xs text-muted-foreground">{widget.headline.label}:</span>
            ) : null}
            <span className="font-mono font-semibold text-sm text-foreground">{widget.headline.text}</span>
            {widget.headline.trend ? (
              <span className={`text-xs ${widget.headline.trend.tone === 'success' ? 'text-status-success' : 'text-status-error'}`}>
                {widget.headline.trend.text}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {widget.stage ? (
        <div className="text-xs text-muted-foreground font-mono truncate">
          {t('chat.jobsSheet.stage', { stage: widget.stage })}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {widget.blocks.map((block: JobWidgetBlock, idx: number) => (
          <JobWidgetBlockRenderer key={idx} block={block} />
        ))}
      </div>
    </div>
  );
};

export const JobsSheetDialog: React.FC<JobsSheetDialogProps> = ({
  open,
  onOpenChange,
  shell,
}) => {
  const { t } = useI18n();
  const isRunning = shell?.status === 'running';
  const tickerNow = useDurationTickerNow(isRunning);
  const [activeTab, setActiveTab] = useState<'output' | 'streams'>('output');
  const [selectedStreamId, setSelectedStreamId] = useState<number | null>(null);
  const [outputLogs, setOutputLogs] = useState<string>('');
  const [streamLogs, setStreamLogs] = useState<string>('');
  const [outputError, setOutputError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [stdinInput, setStdinInput] = useState<string>('');
  const [sendingStdin, setSendingStdin] = useState(false);
  const [stopping, setStopping] = useState(false);
  const logsContainerRef = useRef<HTMLPreElement>(null);

  const sessionId = shell?.sessionId;
  const jobId = shell?.jobId;
  const epoch = shell?.epoch;
  const workerGeneration = shell?.workerGeneration;
  const canReceiveStdin = Boolean(shell?.canReceiveStdin || shell?.serviceName);

  const durationLabel = shell ? formatSessionActivityDuration(tickerNow - shell.startedAt, t) : '';

  // Reset state on job identity change
  useEffect(() => {
    setOutputLogs('');
    setStreamLogs('');
    setOutputError(null);
    setStreamError(null);
    setSelectedStreamId(null);
    setStdinInput('');
  }, [sessionId, jobId, epoch, workerGeneration, open]);

  // Auto-scroll logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [outputLogs, streamLogs, activeTab]);

  // Load and poll stdout/stderr with recursive setTimeout and cursor pagination
  useEffect(() => {
    if (!open || !sessionId || !jobId || !epoch || !workerGeneration) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let currentCursor = '0';

    const fetchOutput = async () => {
      try {
        const res = await canonicalClient.getShellOutput(
          sessionId,
          { jobId, epoch, workerGeneration },
          currentCursor,
          65536,
        );
        if (!cancelled) {
          if (currentCursor === '0') {
            setOutputLogs(res.output);
          } else if (res.output) {
            setOutputLogs((prev) => prev + res.output);
          }
          currentCursor = res.cursor;
          setOutputError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setOutputError(err instanceof Error ? err.message : t('chat.jobsSheet.loadOutputFailed'));
        }
      } finally {
        if (!cancelled && isRunning) {
          pollTimer = setTimeout(() => { void fetchOutput(); }, 2000);
        }
      }
    };

    void fetchOutput();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [open, sessionId, jobId, epoch, workerGeneration, isRunning, t]);

  // Load selected stream with recursive setTimeout and offset pagination
  useEffect(() => {
    if (!open || !sessionId || !jobId || !epoch || !workerGeneration || activeTab !== 'streams' || selectedStreamId === null) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let fromOffset: number | undefined;

    const fetchStream = async () => {
      try {
        const res = await canonicalClient.getShellStream(
          sessionId,
          { jobId, epoch, workerGeneration },
          selectedStreamId,
          fromOffset,
        );
        if (!cancelled) {
          if (fromOffset === undefined) {
            setStreamLogs(res.chunk);
          } else if (res.chunk) {
            setStreamLogs((prev) => prev + res.chunk);
          }
          fromOffset = res.end;
          setStreamError(null);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStreamError(err instanceof Error ? err.message : t('chat.jobsSheet.inspectStreamFailed'));
        }
      } finally {
        if (!cancelled && isRunning) {
          pollTimer = setTimeout(() => { void fetchStream(); }, 2000);
        }
      }
    };

    void fetchStream();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer);
    };
  }, [open, sessionId, jobId, epoch, workerGeneration, activeTab, selectedStreamId, isRunning, t]);

  // Set default stream when tab changes to streams
  useEffect(() => {
    if (activeTab === 'streams' && shell?.streams && shell.streams.length > 0 && selectedStreamId === null) {
      setSelectedStreamId(shell.streams[0]!.id);
    }
  }, [activeTab, shell?.streams, selectedStreamId]);

  const handleSendStdin = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!shell || sendingStdin || !isRunning || !canReceiveStdin) return;
    setSendingStdin(true);
    const sentText = stdinInput;
    try {
      await canonicalClient.writeShellStdin(shell.sessionId, {
        job: {
          sessionId: shell.sessionId,
          jobId: shell.jobId,
          epoch: shell.epoch,
          workerGeneration: shell.workerGeneration,
        },
        input: sentText,
      });
      setStdinInput((prev) => (prev.startsWith(sentText) ? prev.slice(sentText.length) : ''));
      toast.success(t('chat.backgroundShells.stdinSent'));
    } catch (error) {
      toast.error(problemMessage(error, t('chat.backgroundShells.stdinFailed')));
    } finally {
      setSendingStdin(false);
    }
  };

  const handleStop = async () => {
    if (!shell || stopping || !isRunning) return;
    setStopping(true);
    try {
      await canonicalClient.stopShell(shell.sessionId, {
        job: {
          sessionId: shell.sessionId,
          jobId: shell.jobId,
          epoch: shell.epoch,
          workerGeneration: shell.workerGeneration,
        },
      });
      toast.success(t('chat.backgroundShells.stopped'));
    } catch (error) {
      toast.error(problemMessage(error, t('chat.toolPart.background.stopFailed')));
    } finally {
      setStopping(false);
    }
  };

  if (!shell) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] flex flex-col p-6 gap-4">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Icon name="terminal-box" className="size-5 text-primary" />
              <span>{shell.caption || shell.intent || t('chat.backgroundShells.sheetTitle')}</span>
            </DialogTitle>
            <div className="flex items-center gap-2">
              {isRunning ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border text-status-success border-status-success/30 bg-status-success/10 gap-1">
                  <span className="size-1.5 rounded-full bg-status-success" />
                  {t('chat.backgroundShells.running')}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border text-muted-foreground border-border bg-muted">
                  {t('chat.backgroundShells.ended')}
                </span>
              )}
              <span className="text-xs font-mono text-muted-foreground tabular-nums">
                {durationLabel}
              </span>
            </div>
          </div>
          <DialogDescription className="font-mono text-xs text-muted-foreground break-all line-clamp-2">
            {shell.command}
          </DialogDescription>
          {shell.pids && shell.pids.length > 0 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{t('chat.jobsSheet.pids', { pids: shell.pids.join(', ') })}</span>
            </div>
          ) : null}
        </DialogHeader>

        {/* Live Widget View if present */}
        {shell.widget ? (
          <JobWidgetViewRenderer widget={shell.widget} />
        ) : null}

        {/* Tabs for Stdout vs Streams */}
        <div className="flex items-center gap-2 border-b border-border pb-1">
          <button
            type="button"
            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${activeTab === 'output'
              ? 'border-b-2 border-primary text-foreground font-semibold'
              : 'text-muted-foreground hover:text-foreground'
              }`}
            onClick={() => setActiveTab('output')}
          >
            {t('chat.jobsSheet.outputTail')}
          </button>
          {shell.streams && shell.streams.length > 0 ? (
            <button
              type="button"
              className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors flex items-center gap-1.5 ${activeTab === 'streams'
                ? 'border-b-2 border-primary text-foreground font-semibold'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => setActiveTab('streams')}
            >
              <span>{t('chat.backgroundShells.pipeStreams')}</span>
              <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-mono border border-border">
                {shell.streams.length}
              </span>
            </button>
          ) : null}
        </div>

        {/* Active tab content */}
        <div className="flex-1 min-h-[160px] max-h-[300px] flex flex-col rounded-lg border border-border bg-[var(--surface-elevated)] overflow-hidden">
          {activeTab === 'output' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {outputError ? (
                <div role="alert" className="px-3 py-1.5 text-xs font-mono text-status-error bg-status-error/10 border-b border-status-error/20 flex items-center justify-between shrink-0">
                  <span>{outputError}</span>
                </div>
              ) : null}
              <pre
                ref={logsContainerRef}
                className="flex-1 p-3 font-mono text-xs text-foreground overflow-y-auto whitespace-pre-wrap break-all select-text"
              >
                {outputLogs || t('chat.backgroundShells.noOutput')}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center gap-1.5 p-2 border-b border-border/60 bg-[var(--surface-elevated)] overflow-x-auto shrink-0">
                {shell.streams?.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors whitespace-nowrap ${selectedStreamId === s.id
                      ? 'bg-interactive-selection text-interactive-selection-foreground font-medium'
                      : 'bg-[var(--surface-elevated)] hover:bg-muted text-muted-foreground'
                      }`}
                    onClick={() => setSelectedStreamId(s.id)}
                  >
                    pipe:{s.id} ({s.producer} → {s.consumer})
                  </button>
                ))}
              </div>
              {streamError ? (
                <div role="alert" className="px-3 py-1.5 text-xs font-mono text-status-error bg-status-error/10 border-b border-status-error/20 flex items-center justify-between shrink-0">
                  <span>{streamError}</span>
                </div>
              ) : null}
              <pre
                ref={logsContainerRef}
                className="flex-1 p-3 font-mono text-xs text-foreground overflow-y-auto whitespace-pre-wrap break-all select-text"
              >
                {streamLogs || t('chat.backgroundShells.selectStream')}
              </pre>
            </div>
          )}
        </div>

        {/* Stdin Input Bar (for named services only) */}
        {isRunning && canReceiveStdin ? (
          <form onSubmit={handleSendStdin} className="flex items-center gap-2">
            <Input
              type="text"
              value={stdinInput}
              onChange={(e) => setStdinInput(e.target.value)}
              placeholder={t('chat.backgroundShells.stdinPlaceholder')}
              className="font-mono text-xs h-9 flex-1"
              disabled={sendingStdin}
            />
            <Button
              type="submit"
              size="sm"
              disabled={sendingStdin}
              className="h-9 gap-1.5"
            >
              <Icon name="arrow-right" className="size-3.5" />
              <span>{t('chat.backgroundShells.send')}</span>
            </Button>
          </form>
        ) : null}

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full mt-2">
          {isRunning ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleStop}
              disabled={stopping}
              className="gap-1.5"
            >
              <Icon name="close" className="size-3.5" />
              <span>{t('chat.backgroundShells.terminate')}</span>
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('chat.backgroundShells.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
