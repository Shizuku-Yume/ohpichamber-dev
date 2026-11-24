import React from 'react';
import type { JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';

import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface WaitToolCardProps {
    details?: JsonValue;
    outputText?: string;
    isError?: boolean;
}
const jobStatusSchema = z.enum(['running', 'completed', 'failed', 'cancelled']);
const jobTypeSchema = z.enum(['bash', 'task', 'eval']);
const cancelStatusSchema = z.enum(['cancelled', 'not_found', 'already_completed']);

const jobSnapshotSchema = z.object({
    id: z.string(),
    type: jobTypeSchema,
    status: jobStatusSchema,
    label: z.string().default(''),
    intent: z.string().optional(),
    durationMs: z.number().optional(),
    exitCode: z.number().optional(),
    completionPercent: z.number().optional(),
    stage: z.string().optional(),
    errorText: z.string().optional(),
});

const agentActivitySnapshotSchema = z.object({
    id: z.string(),
    parentId: z.string().optional(),
    activity: z.string().optional(),
    ageMs: z.number().optional(),
    live: z.boolean().default(true),
});

const cancelOutcomeSchema = z.object({
    id: z.string(),
    status: cancelStatusSchema,
});

const coordinationDetailsSchema = z.object({
    op: z.enum(['send', 'wait', 'cancel']).optional(),
    jobs: z.array(jobSnapshotSchema).optional(),
    agents: z.array(agentActivitySnapshotSchema).optional(),
    cancelled: z.array(cancelOutcomeSchema).optional(),
    interrupted: z.boolean().optional(),
});

type JobStatus = z.infer<typeof jobStatusSchema>;
type CancelStatus = z.infer<typeof cancelStatusSchema>;

const JOB_STATUS_LABEL_KEY = {
    running: 'chat.toolPart.wait.status.running',
    completed: 'chat.toolPart.wait.status.completed',
    failed: 'chat.toolPart.wait.status.failed',
    cancelled: 'chat.toolPart.wait.status.cancelled',
} as const satisfies Record<JobStatus, string>;

const CANCEL_STATUS_LABEL_KEY = {
    cancelled: 'chat.toolPart.wait.cancelStatus.cancelled',
    not_found: 'chat.toolPart.wait.cancelStatus.notFound',
    already_completed: 'chat.toolPart.wait.cancelStatus.alreadyCompleted',
} as const satisfies Record<CancelStatus, string>;

interface JobStatusIconSpec {
    name: IconName;
    color: string;
}

const jobStatusIcon = (status: JobStatus): JobStatusIconSpec => {
    switch (status) {
        case 'running':
            return { name: 'record-circle', color: 'var(--status-info)' };
        case 'completed':
            return { name: 'checkbox-circle', color: 'var(--status-success)' };
        case 'failed':
            return { name: 'close-circle', color: 'var(--status-error)' };
        case 'cancelled':
            return { name: 'close-circle', color: 'var(--status-warning)' };
    }
};

const jobStatusBadgeClass = (status: JobStatus): string => {
    switch (status) {
        case 'running':
            return 'bg-[var(--status-info-background)] text-[var(--status-info-text)] border-[var(--status-info-border)]';
        case 'completed':
            return 'bg-[var(--status-success-background)] text-[var(--status-success-text)] border-[var(--status-success-border)]';
        case 'failed':
            return 'bg-[var(--status-error-background)] text-[var(--status-error-text)] border-[var(--status-error-border)]';
        case 'cancelled':
            return 'bg-[var(--status-warning-background)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]';
    }
};

const formatDurationMs = (ms: number | undefined): string | null => {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) return null;
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
};

export const WaitToolCard: React.FC<WaitToolCardProps> = React.memo(({
    details,
    outputText,
    isError = false,
}) => {
    const { t } = useI18n();
    const parsedResult = coordinationDetailsSchema.safeParse(details);
    const parsed = parsedResult.success ? parsedResult.data : undefined;

    const jobs = parsed?.jobs ?? [];
    const agents = parsed?.agents ?? [];
    const cancelled = parsed?.cancelled ?? [];
    const interrupted = parsed?.interrupted === true;

    const trimmedOutput = outputText?.trim() ?? '';
    const looksLikeJson = (trimmedOutput.startsWith('{') && trimmedOutput.endsWith('}'))
        || (trimmedOutput.startsWith('[') && trimmedOutput.endsWith(']'));
    const visibleOutput = trimmedOutput && !looksLikeJson ? trimmedOutput : '';

    const hasStructuredRows = interrupted || jobs.length > 0 || agents.length > 0 || cancelled.length > 0;
    const hasEmptyAuthoritativeWait = Boolean(parsed && parsed.jobs !== undefined && !hasStructuredRows);

    if (!hasStructuredRows && !hasEmptyAuthoritativeWait && !visibleOutput) {
        return null;
    }

    return (
        <div
            data-testid="wait-tool-card"
            className="oc-tile rounded-xl border border-border/60 p-3 space-y-2.5 text-start min-w-0"
        >
            {interrupted ? (
                <div
                    data-testid="wait-interrupted-banner"
                    className="flex items-center gap-2 rounded-lg border border-[var(--status-info-border)] bg-[var(--status-info-background)] px-2.5 py-1.5 typography-meta font-medium text-[var(--status-info-text)]"
                >
                    <Icon name="information" className="size-3.5 shrink-0" />
                    <span>{t('chat.toolPart.wait.interrupted')}</span>
                </div>
            ) : null}

            {jobs.length > 0 ? (
                <div data-testid="wait-jobs-section" className="space-y-1">
                    <div className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.wait.jobsHeading')}
                    </div>
                    <div className="space-y-1">
                        {jobs.map((job) => {
                            const icon = jobStatusIcon(job.status);
                            const primaryLabel = job.intent?.trim() || job.label.trim() || job.id;
                            const showDistinctId = primaryLabel !== job.id;
                            const duration = formatDurationMs(job.durationMs);
                            return (
                                <div
                                    key={job.id}
                                    data-testid={`wait-job-row-${job.id}`}
                                    data-job-status={job.status}
                                    className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 space-y-1 min-w-0"
                                >
                                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                        <Icon name={icon.name} className="size-3.5 shrink-0" style={{ color: icon.color }} />
                                        <span className="oc-tile-inset inline-flex items-center rounded px-1.5 py-0.5 typography-micro font-medium text-muted-foreground shrink-0">
                                            {job.type}
                                        </span>
                                        <span className="typography-meta font-medium text-foreground truncate min-w-0 flex-1" dir="auto" title={primaryLabel}>
                                            {primaryLabel}
                                        </span>
                                        {showDistinctId ? (
                                            <span className="font-mono typography-micro text-muted-foreground/80 shrink-0">
                                                {job.id}
                                            </span>
                                        ) : null}
                                        {job.status === 'running' && job.completionPercent !== undefined ? (
                                            <span className="typography-micro text-[var(--status-info-text)] tabular-nums shrink-0">
                                                {Math.round(job.completionPercent)}%
                                            </span>
                                        ) : null}
                                        {job.exitCode !== undefined ? (
                                            <span
                                                className={cn(
                                                    'typography-micro tabular-nums shrink-0',
                                                    job.exitCode === 0 ? 'text-muted-foreground' : 'text-[var(--status-error-text)]',
                                                )}
                                            >
                                                {t('chat.toolPart.wait.exitCode', { code: job.exitCode })}
                                            </span>
                                        ) : null}
                                        {duration ? (
                                            <span className="typography-micro text-muted-foreground tabular-nums shrink-0">
                                                {duration}
                                            </span>
                                        ) : null}
                                        <span
                                            className={cn(
                                                'inline-flex items-center rounded border px-1.5 py-0.5 typography-micro font-medium shrink-0',
                                                jobStatusBadgeClass(job.status),
                                            )}
                                        >
                                            {t(JOB_STATUS_LABEL_KEY[job.status])}
                                        </span>
                                    </div>
                                    {job.stage ? (
                                        <div className="typography-micro text-muted-foreground truncate pl-5" dir="auto">
                                            {job.stage}
                                        </div>
                                    ) : null}
                                    {job.errorText ? (
                                        <div className="typography-micro text-[var(--status-error-text)] whitespace-pre-wrap break-words pl-5" dir="auto">
                                            {job.errorText}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {agents.length > 0 ? (
                <div data-testid="wait-agents-section" className="space-y-1">
                    <div className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.wait.agentsHeading')}
                    </div>
                    <div className="space-y-1">
                        {agents.map((agent) => {
                            const age = formatDurationMs(agent.ageMs);
                            return (
                                <div
                                    key={agent.id}
                                    data-testid={`wait-agent-row-${agent.id}`}
                                    data-agent-live={String(agent.live)}
                                    className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 min-w-0"
                                >
                                    <Icon
                                        name={agent.live ? 'record-circle' : 'error-warning'}
                                        className="size-3.5 shrink-0"
                                        style={{ color: agent.live ? 'var(--status-info)' : 'var(--status-warning)' }}
                                    />
                                    <span className="font-mono typography-meta font-medium text-foreground shrink-0" dir="auto">
                                        {agent.id}
                                    </span>
                                    <span
                                        className={cn(
                                            'inline-flex items-center rounded border px-1.5 py-0.5 typography-micro font-medium shrink-0',
                                            agent.live
                                                ? 'bg-[var(--status-info-background)] text-[var(--status-info-text)] border-[var(--status-info-border)]'
                                                : 'bg-[var(--status-warning-background)] text-[var(--status-warning-text)] border-[var(--status-warning-border)]',
                                        )}
                                    >
                                        {t(agent.live ? 'chat.toolPart.wait.agentLive' : 'chat.toolPart.wait.agentNoTurn')}
                                    </span>
                                    {agent.activity ? (
                                        <span className="typography-meta text-muted-foreground truncate min-w-0 flex-1" dir="auto" title={agent.activity}>
                                            {agent.activity}
                                        </span>
                                    ) : <span className="flex-1" />}
                                    {agent.parentId ? (
                                        <span className="font-mono typography-micro text-muted-foreground/80 shrink-0">
                                            ← {agent.parentId}
                                        </span>
                                    ) : null}
                                    {age ? (
                                        <span className="typography-micro text-muted-foreground tabular-nums shrink-0">
                                            {age}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {cancelled.length > 0 ? (
                <div data-testid="wait-cancelled-section" className="space-y-1">
                    <div className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.wait.cancelledHeading')}
                    </div>
                    <div className="space-y-1">
                        {cancelled.map((item) => (
                            <div
                                key={item.id}
                                data-testid={`wait-cancelled-row-${item.id}`}
                                className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 min-w-0"
                            >
                                <Icon name="close-circle" className="size-3.5 shrink-0" style={{ color: 'var(--status-warning)' }} />
                                <span className="font-mono typography-meta text-foreground truncate flex-1 min-w-0" dir="auto">
                                    {item.id}
                                </span>
                                <span className="inline-flex items-center rounded border border-[var(--status-warning-border)] bg-[var(--status-warning-background)] px-1.5 py-0.5 typography-micro font-medium text-[var(--status-warning-text)] shrink-0">
                                    {t(CANCEL_STATUS_LABEL_KEY[item.status])}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {hasEmptyAuthoritativeWait && !visibleOutput ? (
                <div className="typography-meta text-muted-foreground">
                    {t('chat.toolPart.wait.nothingToWaitFor')}
                </div>
            ) : null}

            {visibleOutput ? (
                <div
                    data-testid="wait-output-text"
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
        </div>
    );
});

WaitToolCard.displayName = 'WaitToolCard';
