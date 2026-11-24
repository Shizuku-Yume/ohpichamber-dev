import React from 'react';
import type { JsonValue, Subagent } from '@openchamber/agent-contract';
import { z } from 'zod';

import { useChatSessionSelection } from '@/components/chat/chatColumnSession';
import { openSubagentsPanel } from '@/components/chat/subagents/panel';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { Button } from '@/components/ui/button';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useI18n } from '@/lib/i18n';
import { normalizeIntent, toolBaseName } from '@/lib/toolPresentation';
import { cn } from '@/lib/utils';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSubagentsStore } from '@/stores/useSubagentsStore';

import { OpenSubtaskButton } from './toolRow/OpenSubtaskButton';

type VibeToolName = 'vibe_spawn' | 'vibe_send' | 'vibe_wait' | 'vibe_kill' | 'vibe_list';
type VibeOp = 'spawn' | 'send' | 'wait' | 'kill' | 'list';
type VibeSettledStatus = 'completed' | 'failed' | 'cancelled';

export interface VibeToolCardProps {
    toolName: string;
    toolCallId: string;
    input?: JsonValue;
    details?: JsonValue;
    outputText?: string;
    sessionId?: string;
    directory?: string | null;
    isMobile?: boolean;
    isError?: boolean;
}
const EMPTY_SUBAGENTS: Subagent[] = [];
const PROMPT_PREVIEW_LINE_LIMIT = 4;

const VIBE_OP_BY_TOOL = {
    vibe_spawn: 'spawn',
    vibe_send: 'send',
    vibe_wait: 'wait',
    vibe_kill: 'kill',
    vibe_list: 'list',
} as const satisfies Record<VibeToolName, VibeOp>;

const resolveVibeOpFromToolName = (toolName: string): VibeOp => {
    const base = toolBaseName(toolName);
    const match = Object.entries(VIBE_OP_BY_TOOL).find(([key]) => key === base);
    return match ? match[1] : 'list';
};
const vibeCliSchema = z.enum(['fast', 'good']);
const vibeOpSchema = z.enum(['spawn', 'send', 'wait', 'kill', 'list']);
const vibeSessionStateSchema = z.enum(['starting', 'running', 'idle', 'dead']);
const vibeSettledStatusSchema = z.enum(['completed', 'failed', 'cancelled']);

const vibeScreenSchema = z.object({
    id: z.string(),
    cli: vibeCliSchema,
    state: vibeSessionStateSchema,
    killed: z.boolean().optional(),
    model: z.string().optional(),
    turns: z.number().default(0),
    queued: z.number().default(0),
    turnStartedAt: z.number().optional(),
    turnMessage: z.string().optional(),
    currentTool: z.string().optional(),
    currentToolArgs: z.string().optional(),
    lastIntent: z.string().optional(),
    trace: z.array(z.string()).default([]),
    outputTail: z.array(z.string()).default([]),
    lastActivity: z.string().optional(),
    lastActivityAt: z.number().optional(),
});

const vibeToolDetailsSchema = z.object({
    op: vibeOpSchema.optional(),
    screens: z.array(vibeScreenSchema).default([]),
    hiddenKilled: z.array(z.string()).optional(),
    spawned: z.strictObject({
        id: z.string(),
        cli: vibeCliSchema,
        jobId: z.string(),
    }).optional(),
    send: z.strictObject({
        id: z.string(),
        mode: z.enum(['turn', 'steered', 'queued']),
        jobId: z.string().optional(),
    }).optional(),
    wait: z.strictObject({
        settled: z.array(z.strictObject({
            id: z.string(),
            jobId: z.string(),
            status: vibeSettledStatusSchema,
        })).default([]),
        stillRunning: z.array(z.string()).default([]),
        timedOut: z.boolean().default(false),
        waiting: z.boolean().optional(),
    }).optional(),
    killed: z.strictObject({
        id: z.string(),
        cancelledTurn: z.boolean(),
    }).optional(),
});

const vibeSpawnInputSchema = z.object({
    cli: vibeCliSchema.optional(),
    name: z.string().optional(),
    prompt: z.string().optional(),
});

const vibeSendInputSchema = z.object({
    session: z.string().optional(),
    message: z.string().optional(),
});

const vibeWaitInputSchema = z.object({
    sessions: z.array(z.string()).optional(),
    timeout: z.number().optional(),
});

const vibeKillInputSchema = z.object({
    session: z.string().optional(),
});

type ParsedVibeDetails = z.infer<typeof vibeToolDetailsSchema>;
type ParsedVibeScreen = z.infer<typeof vibeScreenSchema>;

type ScreenVisualState = 'starting' | 'running' | 'idle' | 'done' | 'failed' | 'killed' | 'cancelled';

const resolveScreenVisualState = (
    screen: ParsedVibeScreen,
    settledStatus: VibeSettledStatus | undefined,
): ScreenVisualState => {
    if (screen.killed) return 'killed';
    if (settledStatus === 'failed') return 'failed';
    if (settledStatus === 'cancelled') return 'cancelled';
    if (settledStatus === 'completed') return 'done';
    if (screen.state === 'dead') return 'done';
    return screen.state;
};

interface ScreenStatusIconSpec {
    name: IconName;
    color?: string;
}

const screenStatusIcon = (visual: ScreenVisualState): ScreenStatusIconSpec => {
    switch (visual) {
        case 'running':
            return { name: 'record-circle', color: 'var(--status-info)' };
        case 'starting':
            return { name: 'time', color: 'var(--status-info)' };
        case 'idle':
        case 'done':
            return { name: 'checkbox-circle', color: 'var(--status-success)' };
        case 'failed':
            return { name: 'close-circle', color: 'var(--status-error)' };
        case 'killed':
        case 'cancelled':
            return { name: 'close-circle', color: 'var(--status-warning)' };
    }
};

const screenStatusBadgeClass = (visual: ScreenVisualState): string => {
    switch (visual) {
        case 'running':
        case 'starting':
            return 'bg-[var(--status-info-background)] text-[var(--status-info-text)] border-[var(--status-info-border)]';
        case 'idle':
        case 'done':
            return 'bg-[var(--status-success-background)] text-[var(--status-success-text)] border-[var(--status-success-border)]';
        case 'failed':
            return 'bg-[var(--status-error-background)] text-[var(--status-error-text)] border-[var(--status-error-border)]';
        case 'killed':
        case 'cancelled':
            return 'bg-[var(--status-warning-background)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]';
    }
};

const SCREEN_STATUS_LABEL_KEY = {
    starting: 'chat.toolPart.vibe.status.starting',
    running: 'chat.toolPart.vibe.status.running',
    idle: 'chat.toolPart.vibe.status.idle',
    done: 'chat.toolPart.vibe.status.done',
    failed: 'chat.toolPart.vibe.status.failed',
    killed: 'chat.toolPart.vibe.status.killed',
    cancelled: 'chat.toolPart.vibe.status.cancelled',
} as const;

const SETTLED_STATUS_LABEL_KEY = {
    completed: 'chat.toolPart.vibe.status.done',
    failed: 'chat.toolPart.vibe.status.failed',
    cancelled: 'chat.toolPart.vibe.status.cancelled',
} as const;

const SEND_MODE_LABEL_KEY = {
    turn: 'chat.toolPart.vibe.sendMode.turn',
    steered: 'chat.toolPart.vibe.sendMode.steered',
    queued: 'chat.toolPart.vibe.sendMode.queued',
} as const;

const findSubagentForWorker = (
    subagents: readonly Subagent[],
    workerId: string | undefined,
    toolCallId: string,
    allowToolCallMatch: boolean,
): Subagent | undefined => {
    if (workerId) {
        const byName = subagents.find((item) => item.name === workerId && Boolean(item.childSessionId));
        if (byName) return byName;
        const byId = subagents.find((item) => item.subagentId === workerId && Boolean(item.childSessionId));
        if (byId) return byId;
    }
    if (allowToolCallMatch && toolCallId) {
        return subagents.find((item) => item.toolCallId === toolCallId && Boolean(item.childSessionId));
    }
    return undefined;
};

const QuotedMessageBlock: React.FC<{ text: string; testId: string }> = ({ text, testId }) => {
    const { t } = useI18n();
    const [expanded, setExpanded] = React.useState(false);
    const trimmed = text.trim();
    if (!trimmed) return null;
    const lines = trimmed.split(/\r?\n/);
    const isCollapsible = lines.length > PROMPT_PREVIEW_LINE_LIMIT;
    const visibleText = isCollapsible && !expanded ? lines.slice(0, PROMPT_PREVIEW_LINE_LIMIT).join('\n') : trimmed;

    return (
        <div
            data-testid={testId}
            className="oc-tile-inset rounded-lg border-l-2 border-[var(--interactive-border)] px-2.5 py-1.5 space-y-1"
        >
            <div dir="auto" className="typography-meta text-foreground/90 whitespace-pre-wrap break-words">
                {visibleText}
            </div>
            {isCollapsible ? (
                <Button
                    variant="ghost"
                    size="xs"
                    className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
                    aria-expanded={expanded}
                    onClick={(event) => {
                        event.stopPropagation();
                        setExpanded((current) => !current);
                    }}
                >
                    {t(expanded ? 'chat.toolPart.vibe.showLess' : 'chat.toolPart.vibe.showMore')}
                </Button>
            ) : null}
        </div>
    );
};

const VibeScreenRow: React.FC<{
    screen: ParsedVibeScreen;
    settledStatus?: VibeSettledStatus;
    matchedSubagent?: Subagent;
    directory?: string | null;
    isMobile: boolean;
}> = ({ screen, settledStatus, matchedSubagent, directory, isMobile }) => {
    const { t } = useI18n();
    const [traceExpanded, setTraceExpanded] = React.useState(false);

    const visual = resolveScreenVisualState(screen, settledStatus);
    const icon = screenStatusIcon(visual);
    const cliLabel = t(screen.cli === 'fast' ? 'chat.toolPart.vibe.cliFast' : 'chat.toolPart.vibe.cliGood');
    const turnsLabel = t(screen.turns === 1 ? 'chat.toolPart.vibe.turnsSingle' : 'chat.toolPart.vibe.turnsPlural', {
        count: screen.turns,
    });

    const isLive = screen.state === 'running' || screen.state === 'starting';
    const intentLabel = screen.lastIntent ? normalizeIntent(screen.lastIntent) : null;
    const liveToolDetail = screen.currentTool
        ? `${screen.currentTool}${intentLabel || screen.currentToolArgs ? `: ${intentLabel ?? screen.currentToolArgs}` : ''}`
        : (intentLabel ?? screen.lastActivity ?? null);
    const activityText = isLive ? liveToolDetail : (screen.lastActivity ?? intentLabel ?? null);

    const nonEmptyOutput = screen.outputTail.filter((line) => line.trim().length > 0);
    const traceCount = screen.trace.length + nonEmptyOutput.length;

    return (
        <div
            data-testid={`vibe-screen-${screen.id}`}
            data-screen-state={visual}
            className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2 space-y-1.5 min-w-0"
        >
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <Icon
                    name={icon.name}
                    className={cn('size-3.5 shrink-0', !icon.color && 'text-muted-foreground')}
                    style={icon.color ? { color: icon.color } : undefined}
                />
                <span className="font-mono typography-meta font-medium text-foreground truncate" dir="auto">
                    {screen.id}
                </span>
                <span className="oc-tile-inset inline-flex items-center rounded px-1.5 py-0.5 typography-micro font-medium text-muted-foreground shrink-0">
                    [{cliLabel}]
                </span>
                <span
                    className={cn(
                        'inline-flex items-center rounded border px-1.5 py-0.5 typography-micro font-medium shrink-0',
                        screenStatusBadgeClass(visual),
                    )}
                >
                    {t(SCREEN_STATUS_LABEL_KEY[visual])}
                </span>
                <span className="typography-micro text-muted-foreground tabular-nums shrink-0">
                    {turnsLabel}
                </span>
                {screen.queued > 0 ? (
                    <span className="inline-flex items-center rounded px-1.5 py-0.5 typography-micro bg-[var(--status-warning-background)] text-[var(--status-warning-text)] shrink-0">
                        +{t('chat.toolPart.vibe.queuedCount', { count: screen.queued })}
                    </span>
                ) : null}
                {screen.model ? (
                    <span className="typography-micro text-muted-foreground/80 truncate min-w-0" title={screen.model}>
                        {screen.model}
                    </span>
                ) : null}
                <span className="flex-1" />
                {matchedSubagent?.childSessionId ? (
                    <OpenSubtaskButton
                        sessionId={matchedSubagent.childSessionId}
                        agent={matchedSubagent.role}
                        label={screen.id}
                        directory={directory}
                        isMobile={isMobile}
                    />
                ) : null}
            </div>

            {isLive && screen.turnMessage ? (
                <div className="typography-micro text-muted-foreground/80 truncate pl-5" dir="auto" title={screen.turnMessage}>
                    &gt; {screen.turnMessage}
                </div>
            ) : null}

            {activityText ? (
                <div className="typography-meta text-muted-foreground truncate pl-5" dir="auto" title={activityText}>
                    {activityText}
                </div>
            ) : null}
            {traceCount > 0 ? (
                <div className="pl-5 space-y-1">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="h-5 px-1.5 text-muted-foreground hover:text-foreground"
                        aria-expanded={traceExpanded}
                        onClick={(event) => {
                            event.stopPropagation();
                            setTraceExpanded((current) => !current);
                        }}
                    >
                        <Icon name={traceExpanded ? 'arrow-down-s' : 'arrow-right-s'} className="size-3" />
                        {t(traceExpanded ? 'chat.toolPart.vibe.hideTrace' : 'chat.toolPart.vibe.showTrace', { count: traceCount })}
                    </Button>
                    {traceExpanded ? (
                        <div className="oc-tile-inset rounded-md px-2 py-1.5 space-y-1 font-mono typography-micro text-muted-foreground">
                            {screen.trace.map((entry, idx) => (
                                <div key={`trace-${idx}`} className="truncate" title={entry} dir="auto">
                                    {entry}
                                </div>
                            ))}
                            {nonEmptyOutput.map((line, idx) => (
                                <div key={`out-${idx}`} className="text-foreground/80 whitespace-pre-wrap break-words" dir="auto">
                                    {line}
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export const VibeToolCard: React.FC<VibeToolCardProps> = React.memo(({
    toolName,
    toolCallId,
    input,
    details,
    outputText,
    sessionId,
    directory,
    isMobile = false,
    isError = false,
}) => {
    const { t } = useI18n();
    const selection = useChatSessionSelection();
    const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);
    const effectiveSessionId = sessionId ?? selection.sessionId ?? undefined;
    const effectiveDirectory = directory ?? selection.directory ?? fallbackDirectory;

    const subagents = useSubagentsStore(
        React.useCallback(
            (state) => (effectiveSessionId ? (state.byParent[effectiveSessionId] ?? EMPTY_SUBAGENTS) : EMPTY_SUBAGENTS),
            [effectiveSessionId],
        ),
    );

    const parsedDetailsResult = vibeToolDetailsSchema.safeParse(details);
    const parsedDetails: ParsedVibeDetails | undefined = parsedDetailsResult.success ? parsedDetailsResult.data : undefined;
    const op: VibeOp = parsedDetails?.op ?? resolveVibeOpFromToolName(toolName);

    const spawnInput = op === 'spawn' ? vibeSpawnInputSchema.safeParse(input).data : undefined;
    const sendInput = op === 'send' ? vibeSendInputSchema.safeParse(input).data : undefined;
    const waitInput = op === 'wait' ? vibeWaitInputSchema.safeParse(input).data : undefined;
    const killInput = op === 'kill' ? vibeKillInputSchema.safeParse(input).data : undefined;

    const screens = parsedDetails?.screens ?? [];
    const settledById = new Map<string, VibeSettledStatus>();
    if (parsedDetails?.wait) {
        for (const item of parsedDetails.wait.settled) {
            settledById.set(item.id, item.status);
        }
    }

    const spawnedInfo = parsedDetails?.spawned;
    const spawnedSubagent = spawnedInfo
        ? findSubagentForWorker(subagents, spawnedInfo.id, toolCallId, true)
        : (op === 'spawn' ? findSubagentForWorker(subagents, spawnInput?.name, toolCallId, true) : undefined);

    const hasScreenForSpawned = spawnedInfo ? screens.some((screen) => screen.id === spawnedInfo.id) : false;
    const showPanelButton = !isMobile && !isVSCodeRuntime() && Boolean(effectiveDirectory) && (screens.length > 0 || Boolean(spawnedInfo));
    const hiddenKilledCount = parsedDetails?.hiddenKilled?.length ?? 0;

    const renderInputHeader = () => {
        if (op === 'spawn') {
            const cli = spawnInput?.cli ?? spawnedInfo?.cli;
            const targetName = spawnInput?.name ?? spawnedInfo?.id;
            const promptText = spawnInput?.prompt ?? '';
            if (!cli && !targetName && !promptText) return null;
            return (
                <div className="space-y-1.5">
                    {cli || targetName ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {cli ? (
                                <span
                                    data-testid="vibe-cli-pill"
                                    className="inline-flex items-center rounded border border-[var(--status-info-border)] bg-[var(--status-info-background)] px-1.5 py-0.5 typography-micro font-medium text-[var(--status-info-text)]"
                                >
                                    [{t(cli === 'fast' ? 'chat.toolPart.vibe.cliFast' : 'chat.toolPart.vibe.cliGood')}]
                                </span>
                            ) : null}
                            {targetName ? (
                                <span className="font-mono typography-meta font-medium text-foreground" dir="auto">
                                    {targetName}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    {promptText ? <QuotedMessageBlock text={promptText} testId="vibe-prompt-block" /> : null}
                </div>
            );
        }

        if (op === 'send') {
            const targetSession = sendInput?.session ?? parsedDetails?.send?.id;
            const messageText = sendInput?.message ?? '';
            if (!targetSession && !messageText) return null;
            return (
                <div className="space-y-1.5">
                    {targetSession ? (
                        <div className="flex items-center gap-1.5">
                            <span
                                data-testid="vibe-send-target-pill"
                                className="oc-tile-inset inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono typography-micro font-medium text-foreground"
                            >
                                <span>→</span>
                                <span>{targetSession}</span>
                            </span>
                        </div>
                    ) : null}
                    {messageText ? <QuotedMessageBlock text={messageText} testId="vibe-message-block" /> : null}
                </div>
            );
        }

        if (op === 'wait') {
            const sessions = waitInput?.sessions;
            const timeout = waitInput?.timeout;
            return (
                <div data-testid="vibe-meta-line" className="flex flex-wrap items-center gap-2 typography-micro text-muted-foreground">
                    <span>
                        {sessions && sessions.length > 0
                            ? t('chat.toolPart.vibe.waitSessions', { sessions: sessions.join(', ') })
                            : t('chat.toolPart.vibe.waitAllRunning')}
                    </span>
                    {timeout !== undefined ? (
                        <span>· {t('chat.toolPart.vibe.waitTimeout', { seconds: timeout })}</span>
                    ) : null}
                </div>
            );
        }

        if (op === 'kill') {
            const target = killInput?.session ?? parsedDetails?.killed?.id;
            if (!target) return null;
            return (
                <div data-testid="vibe-meta-line" className="typography-micro text-muted-foreground">
                    {t('chat.toolPart.vibe.killTarget', { session: target })}
                </div>
            );
        }

        return (
            <div data-testid="vibe-meta-line" className="typography-micro text-muted-foreground">
                {t('chat.toolPart.vibe.listSessions')}
            </div>
        );
    };

    const renderOpFooter = () => {
        if (!parsedDetails) return null;

        if (op === 'spawn' && spawnedInfo) {
            const cliLabel = t(spawnedInfo.cli === 'fast' ? 'chat.toolPart.vibe.cliFast' : 'chat.toolPart.vibe.cliGood');
            return (
                <div data-testid="vibe-spawn-footer" className="flex flex-wrap items-center gap-2 pt-0.5 typography-micro text-muted-foreground">
                    <Icon name="checkbox-circle" className="size-3.5 shrink-0" style={{ color: 'var(--status-success)' }} />
                    <span className="font-mono font-medium text-foreground">{spawnedInfo.id}</span>
                    <span className="oc-tile-inset rounded px-1.5 py-0.5">[{cliLabel}]</span>
                    <span className="font-mono">{t('chat.toolPart.vibe.spawnedJob', { jobId: spawnedInfo.jobId })}</span>
                    {!hasScreenForSpawned && spawnedSubagent?.childSessionId ? (
                        <OpenSubtaskButton
                            sessionId={spawnedSubagent.childSessionId}
                            agent={spawnedSubagent.role}
                            label={spawnedInfo.id}
                            directory={effectiveDirectory}
                            isMobile={isMobile}
                        />
                    ) : null}
                </div>
            );
        }

        if (op === 'send' && parsedDetails.send) {
            const sendOutcome = parsedDetails.send;
            const modeClass = sendOutcome.mode === 'queued'
                ? 'bg-[var(--status-warning-background)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]'
                : 'bg-[var(--status-success-background)] text-[var(--status-success-text)] border-[var(--status-success-border)]';
            return (
                <div data-testid="vibe-send-footer" className="flex flex-wrap items-center gap-2 pt-0.5 typography-micro text-muted-foreground">
                    <span className="font-mono font-medium text-foreground">{sendOutcome.id}</span>
                    <span className={cn('inline-flex items-center rounded border px-1.5 py-0.5 font-medium', modeClass)}>
                        {t(SEND_MODE_LABEL_KEY[sendOutcome.mode])}
                    </span>
                    {sendOutcome.jobId ? (
                        <span className="font-mono">{t('chat.toolPart.vibe.spawnedJob', { jobId: sendOutcome.jobId })}</span>
                    ) : null}
                </div>
            );
        }

        if (op === 'wait' && parsedDetails.wait) {
            const waitOutcome = parsedDetails.wait;
            if (!waitOutcome.waiting && waitOutcome.settled.length === 0 && waitOutcome.stillRunning.length === 0 && !waitOutcome.timedOut) {
                return null;
            }
            return (
                <div data-testid="vibe-wait-footer" className="space-y-1.5 pt-0.5">
                    {waitOutcome.waiting ? (
                        <div className="flex items-center gap-1.5 typography-micro text-[var(--status-info-text)]">
                            <Icon name="record-circle" className="size-3.5 shrink-0" style={{ color: 'var(--status-info)' }} />
                            <span>{t('chat.toolPart.vibe.waitWatching')}</span>
                        </div>
                    ) : null}
                    {waitOutcome.settled.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="typography-micro text-muted-foreground">{t('chat.toolPart.vibe.waitSettledLabel')}:</span>
                            {waitOutcome.settled.map((entry) => {
                                const visual: ScreenVisualState = entry.status === 'completed' ? 'done' : entry.status;
                                const icon = screenStatusIcon(visual);
                                return (
                                    <span
                                        key={`${entry.id}:${entry.jobId}`}
                                        data-testid={`vibe-wait-settled-${entry.id}`}
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 typography-micro font-medium',
                                            screenStatusBadgeClass(visual),
                                        )}
                                    >
                                        <Icon
                                            name={icon.name}
                                            className="size-3 shrink-0"
                                            style={icon.color ? { color: icon.color } : undefined}
                                        />
                                        <span className="font-mono">{entry.id}</span>
                                        <span>· {t(SETTLED_STATUS_LABEL_KEY[entry.status])}</span>
                                    </span>
                                );
                            })}
                        </div>
                    ) : null}
                    {waitOutcome.stillRunning.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="typography-micro text-muted-foreground">{t('chat.toolPart.vibe.waitStillRunningLabel')}:</span>
                            {waitOutcome.stillRunning.map((id) => (
                                <span
                                    key={id}
                                    data-testid={`vibe-wait-running-${id}`}
                                    className="inline-flex items-center rounded border border-[var(--status-info-border)] bg-[var(--status-info-background)] px-1.5 py-0.5 font-mono typography-micro text-[var(--status-info-text)]"
                                >
                                    {id}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {waitOutcome.timedOut ? (
                        <div
                            data-testid="vibe-wait-timeout-badge"
                            className="inline-flex items-center gap-1 rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] px-1.5 py-0.5 typography-micro font-medium text-[var(--status-warning-text)]"
                        >
                            <Icon name="time" className="size-3 shrink-0" />
                            <span>{t('chat.toolPart.vibe.waitTimedOut')}</span>
                        </div>
                    ) : null}
                </div>
            );
        }

        if (op === 'kill' && parsedDetails.killed) {
            const killOutcome = parsedDetails.killed;
            return (
                <div data-testid="vibe-kill-footer" className="flex flex-wrap items-center gap-2 pt-0.5 typography-micro">
                    <Icon name="close-circle" className="size-3.5 shrink-0" style={{ color: 'var(--status-warning)' }} />
                    <span className="font-mono font-medium text-foreground">{killOutcome.id}</span>
                    {killOutcome.cancelledTurn ? (
                        <span
                            data-testid="vibe-kill-cancelled-turn"
                            className="inline-flex items-center rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] px-1.5 py-0.5 font-medium text-[var(--status-warning-text)]"
                        >
                            {t('chat.toolPart.vibe.killCancelledTurn')}
                        </span>
                    ) : null}
                </div>
            );
        }

        if (op === 'list' && hiddenKilledCount > 0) {
            return (
                <div data-testid="vibe-list-hidden-killed" className="typography-micro text-muted-foreground pt-0.5">
                    {t(
                        hiddenKilledCount === 1
                            ? 'chat.toolPart.vibe.hiddenKilledSingle'
                            : 'chat.toolPart.vibe.hiddenKilledPlural',
                        { count: hiddenKilledCount },
                    )}
                </div>
            );
        }

        return null;
    };

    const trimmedOutput = outputText?.trim() ?? '';
    const looksLikeJson = (trimmedOutput.startsWith('{') && trimmedOutput.endsWith('}'))
        || (trimmedOutput.startsWith('[') && trimmedOutput.endsWith(']'));
    const humanOutput = trimmedOutput && !looksLikeJson ? trimmedOutput : '';
    const visibleOutput = humanOutput
        && (!parsedDetails || isError || op === 'wait' || screens.length === 0)
        ? humanOutput
        : '';

    return (
        <div
            data-testid="vibe-tool-card"
            data-vibe-op={op}
            className="oc-tile rounded-xl border border-border/60 p-3 space-y-2.5 text-start min-w-0"
        >
            {renderInputHeader()}

            {screens.length > 0 ? (
                <div data-testid="vibe-tv-wall" className="space-y-1.5">
                    {screens.map((screen) => (
                        <VibeScreenRow
                            key={screen.id}
                            screen={screen}
                            settledStatus={settledById.get(screen.id)}
                            matchedSubagent={findSubagentForWorker(subagents, screen.id, toolCallId, op === 'spawn')}
                            directory={effectiveDirectory}
                            isMobile={isMobile}
                        />
                    ))}
                </div>
            ) : op === 'list' && parsedDetails ? (
                <div className="typography-meta text-muted-foreground">
                    {t('chat.toolPart.vibe.noLiveSessions')}
                </div>
            ) : null}

            {renderOpFooter()}

            {visibleOutput ? (
                <div
                    data-testid="vibe-fallback-output"
                    className={cn(
                        'rounded-lg border px-2.5 py-2 typography-meta whitespace-pre-wrap break-words max-h-48 overflow-y-auto',
                        isError
                            ? 'border-[var(--status-error-border)] bg-[var(--status-error-background)] text-[var(--status-error-text)]'
                            : 'border-border/40 bg-background/40 text-muted-foreground',
                    )}
                >
                    {visibleOutput}
                </div>
            ) : null}

            {showPanelButton && effectiveDirectory ? (
                <div className="flex items-center justify-end">
                    <Button
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                            event.stopPropagation();
                            openSubagentsPanel(effectiveDirectory);
                        }}
                    >
                        <Icon name="ai-agent" className="size-3.5" />
                        {t('chat.workStatus.subagent.openPanel')}
                    </Button>
                </div>
            ) : null}
        </div>
    );
});

VibeToolCard.displayName = 'VibeToolCard';
