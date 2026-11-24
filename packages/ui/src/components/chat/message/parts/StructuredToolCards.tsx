import React from 'react';
import type { JsonObject, JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { toolBaseName } from '@/lib/toolPresentation';
import { cn } from '@/lib/utils';
import { SimpleMarkdownRenderer } from '../../MarkdownRenderer';
import type { ToolPopupContent } from '../types';


export interface StructuredToolCardProps {
    toolName: string | undefined;
    input?: JsonObject;
    details?: JsonValue;
    output?: string;
    onShowPopup?: (content: ToolPopupContent) => void;
}

type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

const STATUS_BADGE_STYLE = {
    neutral: {
        color: 'var(--muted-foreground)',
        backgroundColor: 'color-mix(in srgb, var(--surface-muted) 50%, transparent)',
        borderColor: 'var(--border)',
    },
    info: {
        color: 'var(--status-info-text)',
        backgroundColor: 'var(--status-info-background)',
        borderColor: 'var(--status-info-border)',
    },
    success: {
        color: 'var(--status-success-text)',
        backgroundColor: 'var(--status-success-background)',
        borderColor: 'var(--status-success-border)',
    },
    warning: {
        color: 'var(--status-warning-text)',
        backgroundColor: 'var(--status-warning-background)',
        borderColor: 'var(--status-warning-border)',
    },
    error: {
        color: 'var(--status-error-text)',
        backgroundColor: 'var(--status-error-background)',
        borderColor: 'var(--status-error-border)',
    },
};

const StatusBadge: React.FC<{ label: string; tone?: StatusTone; icon?: IconName; testId?: string }> = ({
    label,
    tone = 'neutral',
    icon,
    testId,
}) => (
    <span
        data-testid={testId}
        dir="auto"
        className="inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 typography-micro font-medium"
        style={STATUS_BADGE_STYLE[tone]}
    >
        {icon ? <Icon name={icon} className="size-3 shrink-0" /> : null}
        <span className="truncate">{label}</span>
    </span>
);
const ToolMarkdownText: React.FC<{
    content: string;
    variant?: 'tool' | 'reasoning';
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({ content, variant = 'tool', onShowPopup }) => (
    <SimpleMarkdownRenderer
        content={content}
        variant={variant}
        onShowPopup={onShowPopup}
        fallbackContent={<div className="typography-meta whitespace-pre-wrap break-words text-foreground/90">{content}</div>}
    />
);


const CARD_SHELL_CLASS = 'rounded-xl border border-border/50 bg-[var(--surface-elevated)]/60 p-2.5 space-y-2 text-start';

const formatFieldLabel = (key: string): string =>
    key
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim()
        .replace(/^./, (char) => char.toUpperCase());

const formatTokenCount = (count: number): string => count.toLocaleString('en-US');

const nonEmptyText = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : null;
};

const inputTextField = (input: JsonObject | undefined, key: string): string | null => {
    if (!input) return null;
    const parsed = z.string().safeParse(input[key]);
    return parsed.success ? nonEmptyText(parsed.data) : null;
};

const jsonObjectSchema = z.record(z.string(), z.json());
const jsonArraySchema = z.array(z.json());

const statusToneForState = (value: string | undefined): StatusTone => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return 'neutral';
    if (['success', 'complete', 'completed', 'validated', 'passed', 'apply', 'applied', 'neutral', 'skipped'].includes(normalized)) {
        return 'success';
    }
    if (['failure', 'failed', 'error', 'aborted', 'timed_out', 'cancelled', 'canceled', 'rejected', 'action_required', 'startup_failure'].includes(normalized)) {
        return 'error';
    }
    if (['paused', 'partial', 'budget-limited', 'stopped', 'warning', 'discard', 'discarded', 'queued', 'waiting', 'pending', 'requested'].includes(normalized)) {
        return 'warning';
    }
    if (['running', 'active', 'in_progress', 'watching', 'preparing', 'reviewing', 'publishing'].includes(normalized)) {
        return 'info';
    }
    return 'neutral';
};

const statusIconForState = (value: string | undefined): IconName => {
    const normalized = value?.trim().toLowerCase();
    if (!normalized) return 'information';
    if (['success', 'complete', 'completed', 'validated', 'passed', 'apply', 'applied', 'skipped'].includes(normalized)) {
        return 'checkbox-circle';
    }
    if (['failure', 'failed', 'error', 'aborted', 'timed_out', 'cancelled', 'canceled', 'rejected', 'action_required', 'startup_failure'].includes(normalized)) {
        return 'close-circle';
    }
    if (['running', 'active', 'in_progress', 'watching', 'preparing', 'reviewing', 'publishing'].includes(normalized)) {
        return 'record-circle';
    }
    if (['queued', 'waiting', 'pending', 'requested', 'paused', 'stopped'].includes(normalized)) {
        return 'time';
    }
    return 'information';
};


const debugSnapshotSchema = z.object({
    id: z.string().optional(),
    adapter: z.string().optional(),
    status: z.string().optional(),
    cwd: z.string().optional(),
    program: z.string().optional(),
    stopReason: z.string().optional(),
    frameName: z.string().optional(),
    instructionPointerReference: z.string().optional(),
    source: z.object({ path: z.string().optional() }).optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    needsConfigurationDone: z.boolean().optional(),
    exitCode: z.number().optional(),
});

const debugDetailsSchema = z.object({
    action: z.string().optional(),
    success: z.boolean().optional(),
    snapshot: debugSnapshotSchema.optional(),
});

const DebugCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output }) => {
    const { t } = useI18n();
    const parsedDetails = debugDetailsSchema.safeParse(details).data;
    const snapshot = parsedDetails?.snapshot;
    const action = nonEmptyText(parsedDetails?.action) ?? inputTextField(input, 'action');
    const outputText = nonEmptyText(output);

    const location = (() => {
        const sourcePath = nonEmptyText(snapshot?.source?.path);
        if (!sourcePath) return null;
        if (snapshot?.line !== undefined) {
            return snapshot.column !== undefined
                ? `${sourcePath}:${snapshot.line}:${snapshot.column}`
                : `${sourcePath}:${snapshot.line}`;
        }
        return sourcePath;
    })();

    const statusLabel = nonEmptyText(snapshot?.status)
        ?? (parsedDetails?.success === false ? 'failed' : parsedDetails?.success === true ? 'ok' : null);
    const statusTone: StatusTone = parsedDetails?.success === false
        ? 'error'
        : snapshot?.exitCode !== undefined && snapshot.exitCode !== 0
            ? 'error'
            : statusToneForState(statusLabel ?? undefined);

    return (
        <div data-testid="structured-card-debug" className={CARD_SHELL_CLASS}>
            <div data-testid="debug-snapshot-bar" className="flex flex-wrap items-center gap-1.5">
                <Icon name="bug" className="size-3.5 shrink-0 text-muted-foreground" />
                {action ? (
                    <span className="typography-meta font-medium text-foreground">
                        {action.replaceAll('_', ' ')}
                    </span>
                ) : (
                    <span className="typography-meta font-medium text-foreground">
                        {t('chat.toolPart.structured.debugSession')}
                    </span>
                )}
                {statusLabel ? <StatusBadge label={statusLabel} tone={statusTone} testId="debug-status-badge" /> : null}
                {nonEmptyText(snapshot?.stopReason) ? (
                    <StatusBadge
                        label={`${t('chat.toolPart.structured.stopReason')}: ${snapshot?.stopReason}`}
                        tone="warning"
                        testId="debug-stop-reason"
                    />
                ) : null}
                {snapshot?.exitCode !== undefined ? (
                    <StatusBadge
                        label={t('chat.toolPart.structured.exitCode', { code: snapshot.exitCode })}
                        tone={snapshot.exitCode === 0 ? 'success' : 'error'}
                    />
                ) : null}
                {nonEmptyText(snapshot?.adapter) ? (
                    <span className="typography-micro text-muted-foreground">{snapshot?.adapter}</span>
                ) : null}
            </div>

            {location || nonEmptyText(snapshot?.frameName) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border/40 bg-background/50 px-2.5 py-1.5 typography-micro">
                    {location ? (
                        <div className="flex min-w-0 items-center gap-1">
                            <span className="text-muted-foreground">{t('chat.toolPart.structured.location')}:</span>
                            <code className="truncate font-mono text-foreground" title={location}>{location}</code>
                        </div>
                    ) : null}
                    {nonEmptyText(snapshot?.frameName) ? (
                        <div className="flex min-w-0 items-center gap-1">
                            <span className="text-muted-foreground">{t('chat.toolPart.structured.frame')}:</span>
                            <code className="truncate font-mono text-foreground">{snapshot?.frameName}</code>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {outputText ? (
                <pre className="whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-background/50 p-2 typography-code text-foreground/90 m-0 max-h-64 overflow-y-auto">
                    {outputText}
                </pre>
            ) : !snapshot ? (
                <div className="typography-meta text-muted-foreground">{t('chat.toolPart.awaitingResponse')}</div>
            ) : null}
        </div>
    );
};


const ghWatchStepSchema = z.object({
    number: z.number().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    conclusion: z.string().optional(),
    durationSeconds: z.number().optional(),
});

const ghWatchJobSchema = z.object({
    id: z.number().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    conclusion: z.string().optional(),
    durationSeconds: z.number().optional(),
    url: z.string().optional(),
    steps: z.array(ghWatchStepSchema).optional(),
});

const ghWatchRunSchema = z.object({
    id: z.number().optional(),
    workflowName: z.string().optional(),
    displayTitle: z.string().optional(),
    status: z.string().optional(),
    conclusion: z.string().optional(),
    branch: z.string().optional(),
    headSha: z.string().optional(),
    url: z.string().optional(),
    jobs: z.array(ghWatchJobSchema).optional(),
});

const ghWatchFailedLogSchema = z.object({
    runId: z.number().optional(),
    workflowName: z.string().optional(),
    jobName: z.string().optional(),
    conclusion: z.string().optional(),
    tail: z.string().optional(),
    available: z.boolean().optional(),
    unavailableReason: z.string().optional(),
});

const ghWatchViewSchema = z.object({
    mode: z.enum(['run', 'commit']).optional(),
    state: z.enum(['watching', 'completed']).optional(),
    repo: z.string().optional(),
    branch: z.string().optional(),
    headSha: z.string().optional(),
    pollCount: z.number().optional(),
    note: z.string().optional(),
    run: ghWatchRunSchema.optional(),
    runs: z.array(ghWatchRunSchema).optional(),
    failedLogs: z.array(ghWatchFailedLogSchema).optional(),
});

const ghDetailsSchema = z.object({
    repo: z.string().optional(),
    branch: z.string().optional(),
    headSha: z.string().optional(),
    runId: z.number().optional(),
    status: z.string().optional(),
    conclusion: z.string().optional(),
    failedJobs: z.array(z.string()).optional(),
    watch: ghWatchViewSchema.optional(),
});

type GhWatchRun = z.infer<typeof ghWatchRunSchema>;

const GhRunTree: React.FC<{ run: GhWatchRun }> = ({ run }) => {
    const { t } = useI18n();
    const runState = nonEmptyText(run.conclusion) ?? nonEmptyText(run.status);
    const runTitle = nonEmptyText(run.workflowName) ?? nonEmptyText(run.displayTitle) ?? `#${run.id ?? '?'}`;
    const runJobs = run.jobs ?? [];
    return (
        <div className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
                <span className="typography-meta font-medium text-foreground">{runTitle}</span>
                {run.id !== undefined ? (
                    <span className="typography-micro text-muted-foreground">#{run.id}</span>
                ) : null}
                {runState ? (
                    <StatusBadge
                        label={runState.replaceAll('_', ' ')}
                        tone={statusToneForState(runState)}
                        icon={statusIconForState(runState)}
                    />
                ) : null}
                {nonEmptyText(run.headSha) ? (
                    <code className="typography-micro font-mono text-muted-foreground">
                        {run.headSha?.slice(0, 7)}
                    </code>
                ) : null}
            </div>

            {runJobs.length > 0 ? (
                <div className="space-y-1.5">
                    <div className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.structured.githubJobs')}
                    </div>
                    <ul className="space-y-1.5">
                        {runJobs.map((job, index) => {
                            const jobState = nonEmptyText(job.conclusion) ?? nonEmptyText(job.status);
                            return (
                                <li key={job.id ?? index} className="space-y-1 rounded-md border border-border/30 bg-muted/15 px-2 py-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5 typography-meta">
                                        <Icon
                                            name={statusIconForState(jobState ?? undefined)}
                                            className="size-3.5 shrink-0"
                                        />
                                        {job.name ? (
                                            <span className="font-medium text-foreground">{job.name}</span>
                                        ) : null}
                                        {jobState ? (
                                            <StatusBadge label={jobState.replaceAll('_', ' ')} tone={statusToneForState(jobState)} />
                                        ) : null}
                                        {job.durationSeconds !== undefined ? (
                                            <span className="typography-micro tabular-nums text-muted-foreground">
                                                {job.durationSeconds}s
                                            </span>
                                        ) : null}
                                    </div>
                                    {job.steps && job.steps.length > 0 ? (
                                        <ul className="space-y-0.5 border-s border-border/50 ps-3 ms-1.5">
                                            {job.steps.map((step, index) => {
                                                const stepState = nonEmptyText(step.conclusion) ?? nonEmptyText(step.status);
                                                return (
                                                    <li key={step.number ?? index} className="flex items-center gap-1.5 typography-micro text-muted-foreground">
                                                        <Icon name={statusIconForState(stepState ?? undefined)} className="size-3 shrink-0" />
                                                        {step.number !== undefined ? (
                                                            <span className="tabular-nums opacity-75">{step.number}.</span>
                                                        ) : null}
                                                        {step.name ? (
                                                            <span className="min-w-0 truncate text-foreground/90">{step.name}</span>
                                                        ) : null}
                                                        {stepState ? (
                                                            <span className="shrink-0 opacity-80">· {stepState.replaceAll('_', ' ')}</span>
                                                        ) : null}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </div>
    );
};

const GithubCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = ghDetailsSchema.safeParse(details).data;
    const watch = parsedDetails?.watch;
    const repo = nonEmptyText(parsedDetails?.repo) ?? nonEmptyText(watch?.repo) ?? inputTextField(input, 'repo');
    const branch = nonEmptyText(parsedDetails?.branch)
        ?? nonEmptyText(watch?.branch)
        ?? nonEmptyText(watch?.run?.branch)
        ?? inputTextField(input, 'branch');
    const stateLabel = nonEmptyText(parsedDetails?.conclusion)
        ?? nonEmptyText(parsedDetails?.status)
        ?? nonEmptyText(watch?.run?.conclusion)
        ?? nonEmptyText(watch?.run?.status)
        ?? nonEmptyText(watch?.state);
    const failedJobs = parsedDetails?.failedJobs ?? [];
    const watchRuns: GhWatchRun[] = watch?.run ? [watch.run] : (watch?.runs ?? []);
    const failedLogs = (watch?.failedLogs ?? []).map((log, index) => ({ ...log, key: `${log.runId ?? '?'}:${log.jobName ?? 'job'}:${index}` }));
    const outputText = nonEmptyText(output);

    return (
        <div data-testid="structured-card-github" className={CARD_SHELL_CLASS}>
            <div data-testid="github-header" className="flex flex-wrap items-center gap-2">
                <Icon name="github" className="size-3.5 shrink-0 text-muted-foreground" />
                {repo ? <span className="typography-meta font-medium text-foreground">{repo}</span> : null}
                {branch ? (
                    <span className="inline-flex items-center gap-1 rounded border border-border/50 bg-background/50 px-1.5 py-0.5 typography-micro text-muted-foreground">
                        <Icon name="git-branch" className="size-3 shrink-0" />
                        <span>{branch}</span>
                    </span>
                ) : null}
                {stateLabel ? (
                    <StatusBadge
                        label={stateLabel.replaceAll('_', ' ')}
                        tone={statusToneForState(stateLabel)}
                        icon={statusIconForState(stateLabel)}
                        testId="github-status-badge"
                    />
                ) : null}
                {parsedDetails?.runId !== undefined ? (
                    <span className="typography-micro text-muted-foreground">#{parsedDetails.runId}</span>
                ) : null}
            </div>

            {failedJobs.length > 0 ? (
                <div data-testid="github-failed-jobs" className="flex flex-wrap items-center gap-1.5">
                    <span className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.structured.githubFailedJobs')}:
                    </span>
                    {failedJobs.map((jobName) => (
                        <StatusBadge key={jobName} label={jobName} tone="error" icon="close-circle" />
                    ))}
                </div>
            ) : null}

            {watchRuns.length > 0 ? (
                <div data-testid="github-watch-tree" className="space-y-2">
                    {watchRuns.map((run, index) => (
                        <GhRunTree key={run.id ?? index} run={run} />
                    ))}
                </div>
            ) : null}

            {failedLogs.length > 0 ? (
                <div className="space-y-1.5">
                    {failedLogs.map((log) => (
                        <div key={log.key} className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1">
                            {log.jobName ? (
                                <div className="flex items-center gap-1.5 typography-micro font-medium text-foreground">
                                    <Icon name="close-circle" className="size-3.5 shrink-0" style={{ color: 'var(--status-error)' }} />
                                    <span>{log.jobName}</span>
                                </div>
                            ) : null}
                            {nonEmptyText(log.tail) ? (
                                <pre className="whitespace-pre-wrap break-words typography-code text-muted-foreground m-0 max-h-40 overflow-y-auto">
                                    {log.tail}
                                </pre>
                            ) : nonEmptyText(log.unavailableReason) ? (
                                <div className="typography-micro text-muted-foreground">{log.unavailableReason}</div>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}

            {outputText ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2 max-h-72 overflow-y-auto">
                    <ToolMarkdownText content={outputText} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};


const goalSchema = z.object({
    id: z.string().optional(),
    objective: z.string().optional(),
    status: z.enum(['active', 'paused', 'budget-limited', 'complete', 'dropped']).optional(),
    tokenBudget: z.number().optional(),
    tokensUsed: z.number().optional(),
    timeUsedSeconds: z.number().optional(),
    createdAt: z.number().optional(),
    updatedAt: z.number().optional(),
});

const goalDetailsSchema = z.object({
    op: z.enum(['create', 'get', 'complete', 'pause', 'resume', 'drop']).optional(),
    goal: goalSchema.nullable().optional(),
    remainingTokens: z.number().nullable().optional(),
    completionBudgetReport: z.string().nullable().optional(),
});

const GoalCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = goalDetailsSchema.safeParse(details).data;
    const goal = parsedDetails?.goal ?? null;
    const op = parsedDetails?.op ?? inputTextField(input, 'op');
    const objective = nonEmptyText(goal?.objective) ?? inputTextField(input, 'objective');
    const report = nonEmptyText(parsedDetails?.completionBudgetReport ?? undefined);
    const outputText = nonEmptyText(output);

    const tokensUsed = goal?.tokensUsed ?? 0;
    const budgetProgress = goal && goal.tokenBudget !== undefined && goal.tokenBudget > 0 && goal.tokensUsed !== undefined
        ? Math.min(100, Math.round((goal.tokensUsed / goal.tokenBudget) * 100))
        : null;

    return (
        <div data-testid="structured-card-goal" className={CARD_SHELL_CLASS}>
            <div className="flex flex-wrap items-center gap-2">
                <Icon name="flag" className="size-3.5 shrink-0 text-muted-foreground" />
                {op ? <span className="typography-meta font-medium text-foreground capitalize">{op}</span> : null}
                {goal?.status ? (
                    <StatusBadge
                        label={goal.status}
                        tone={statusToneForState(goal.status)}
                        icon={statusIconForState(goal.status)}
                        testId="goal-status-badge"
                    />
                ) : parsedDetails && parsedDetails.goal === null ? (
                    <StatusBadge label={t('chat.toolPart.structured.goalNoActive')} tone="warning" />
                ) : null}
            </div>

            {objective ? (
                <div className="typography-meta text-foreground break-words">
                    {objective}
                </div>
            ) : null}

            {goal ? (
                <div data-testid="goal-budget" className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 typography-micro text-muted-foreground tabular-nums">
                        {goal.tokenBudget !== undefined ? (
                            <>
                                <span>
                                    {t('chat.toolPart.structured.goalTokensBudget', {
                                        used: formatTokenCount(tokensUsed),
                                        budget: formatTokenCount(goal.tokenBudget),
                                    })}
                                </span>
                                <span>
                                    · {t('chat.toolPart.structured.goalTokensRemaining', {
                                        remaining: formatTokenCount(Math.max(0, parsedDetails?.remainingTokens ?? (goal.tokenBudget - tokensUsed))),
                                    })}
                                </span>
                            </>
                        ) : goal.tokensUsed !== undefined ? (
                            <span>
                                {t('chat.toolPart.structured.goalTokensUsed', {
                                    used: formatTokenCount(tokensUsed),
                                })}
                            </span>
                        ) : null}
                        {(goal.timeUsedSeconds ?? 0) > 0 ? (
                            <span>
                                · {t('chat.toolPart.structured.goalElapsed', { seconds: Math.round(goal.timeUsedSeconds ?? 0) })}
                            </span>
                        ) : null}
                    </div>
                    {budgetProgress !== null ? (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
                            <div
                                className="h-full rounded-full transition-all"
                                style={{
                                    width: `${budgetProgress}%`,
                                    backgroundColor: goal.status === 'budget-limited' ? 'var(--status-warning)' : 'var(--status-info)',
                                }}
                            />
                        </div>
                    ) : null}
                </div>
            ) : outputText && !objective ? (
                <div className="typography-meta text-muted-foreground whitespace-pre-wrap break-words">{outputText}</div>
            ) : null}

            {report ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                    <ToolMarkdownText content={report} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};


const securityOperationSchema = z.object({
    operationId: z.string().optional(),
    planId: z.string().optional(),
    scanId: z.string().optional(),
    phase: z.string().optional(),
    findingCount: z.number().optional(),
    error: z.string().optional(),
});

const securityCloudStatsSchema = z.object({
    configurationId: z.string().optional(),
    currentStep: z.string().optional(),
    pendingCommits: z.number().optional(),
    finishedCommits: z.number().optional(),
    failedCommits: z.number().optional(),
    findingCounts: z.record(z.string(), z.number()).optional(),
});

const securityCloudConfigSchema = z.object({
    id: z.string().optional(),
    repositoryId: z.string().optional(),
    repositoryUrl: z.string().optional(),
    environmentId: z.string().optional(),
    currentStep: z.string().optional(),
});

const securityScanDetailsSchema = z.object({
    action: z.string().optional(),
    plan: z.object({ id: z.string().optional(), fingerprint: z.string().optional() }).optional(),
    operation: securityOperationSchema.optional(),
    cancelled: z.boolean().optional(),
    finding: z.object({ id: z.string().optional(), validationStatus: z.string().optional() }).optional(),
    cloudConfigurations: z.array(securityCloudConfigSchema).optional(),
    cloudStats: securityCloudStatsSchema.optional(),
    cloudScan: z.object({ id: z.string().optional(), repositoryUrl: z.string().optional() }).optional(),
    importedScan: z.object({ id: z.string().optional(), findingCount: z.number().optional() }).optional(),
});

const SecurityScanCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output }) => {
    const { t } = useI18n();
    const parsedDetails = securityScanDetailsSchema.safeParse(details).data;
    const action = nonEmptyText(parsedDetails?.action) ?? inputTextField(input, 'action');
    const operation = parsedDetails?.operation;
    const plan = parsedDetails?.plan;
    const finding = parsedDetails?.finding;
    const cloudStats = parsedDetails?.cloudStats;
    const cloudScan = parsedDetails?.cloudScan;
    const importedScan = parsedDetails?.importedScan;
    const cloudConfigs = parsedDetails?.cloudConfigurations;
    const outputText = nonEmptyText(output);

    const statusBadge: { label: string; tone: StatusTone; icon: IconName } | null = (() => {
        if (operation?.phase) {
            return {
                label: operation.phase,
                tone: statusToneForState(operation.phase),
                icon: statusIconForState(operation.phase),
            };
        }
        if (parsedDetails?.cancelled) {
            return {
                label: t('chat.toolPart.structured.securityCancelled'),
                tone: 'warning',
                icon: 'close-circle',
            };
        }
        if (finding?.validationStatus) {
            return {
                label: finding.validationStatus,
                tone: statusToneForState(finding.validationStatus),
                icon: statusIconForState(finding.validationStatus),
            };
        }
        if (cloudStats?.currentStep) {
            return {
                label: cloudStats.currentStep,
                tone: statusToneForState(cloudStats.currentStep),
                icon: statusIconForState(cloudStats.currentStep),
            };
        }
        if (plan) {
            return {
                label: 'ready',
                tone: 'info',
                icon: 'checkbox-circle',
            };
        }
        return null;
    })();

    const findingTotal = operation?.findingCount ?? importedScan?.findingCount;

    return (
        <div data-testid="structured-card-security-scan" className={CARD_SHELL_CLASS}>
            <div className="flex flex-wrap items-center gap-2">
                <Icon name="shield-check" className="size-3.5 shrink-0 text-muted-foreground" />
                {action ? (
                    <span className="typography-meta font-medium text-foreground">
                        {action.replaceAll('_', ' ')}
                    </span>
                ) : null}
                {statusBadge ? (
                    <StatusBadge
                        label={statusBadge.label}
                        tone={statusBadge.tone}
                        icon={statusBadge.icon}
                        testId="security-status-badge"
                    />
                ) : null}
                {findingTotal !== undefined ? (
                    <StatusBadge
                        label={
                            findingTotal === 1
                                ? t('chat.toolPart.structured.securityFindingsSingle', { count: findingTotal })
                                : t('chat.toolPart.structured.securityFindingsPlural', { count: findingTotal })
                        }
                        tone={findingTotal > 0 ? 'warning' : 'success'}
                        testId="security-findings-badge"
                    />
                ) : null}
            </div>

            {plan && (plan.id || plan.fingerprint) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
                    {plan.id ? <span>{t('chat.toolPart.structured.securityPlan', { id: plan.id })}</span> : null}
                    {plan.fingerprint ? <code className="font-mono opacity-80">{plan.fingerprint.slice(0, 12)}</code> : null}
                </div>
            ) : null}

            {operation && (operation.scanId || operation.planId) ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 typography-micro text-muted-foreground">
                    {operation.scanId ? <span>{t('chat.toolPart.structured.securityScanId', { id: operation.scanId })}</span> : null}
                    {operation.planId ? <span>{t('chat.toolPart.structured.securityPlan', { id: operation.planId })}</span> : null}
                </div>
            ) : null}

            {finding?.id ? (
                <div className="typography-micro text-muted-foreground">
                    {t('chat.toolPart.structured.securityFindingStatus', { id: finding.id })}
                </div>
            ) : null}

            {cloudScan && (cloudScan.repositoryUrl || cloudScan.id) ? (
                <div className="typography-micro text-muted-foreground break-all">
                    {[cloudScan.repositoryUrl, cloudScan.id].filter(Boolean).join(' · ')}
                </div>
            ) : null}

            {importedScan?.id ? (
                <div className="typography-micro text-muted-foreground">
                    {t('chat.toolPart.structured.securityScanId', { id: importedScan.id })}
                </div>
            ) : null}

            {cloudStats && (cloudStats.finishedCommits !== undefined || cloudStats.pendingCommits !== undefined || cloudStats.failedCommits !== undefined) ? (
                <div className="flex flex-wrap items-center gap-2 typography-micro text-muted-foreground tabular-nums">
                    <span>
                        {t('chat.toolPart.structured.securityCommits', {
                            finished: cloudStats.finishedCommits ?? 0,
                            pending: cloudStats.pendingCommits ?? 0,
                        })}
                    </span>
                    {(cloudStats.failedCommits ?? 0) > 0 ? (
                        <span style={{ color: 'var(--status-error-text)' }}>
                            · {t('chat.toolPart.structured.securityCommitsFailed', { failed: cloudStats.failedCommits ?? 0 })}
                        </span>
                    ) : null}
                </div>
            ) : null}

            {cloudConfigs && cloudConfigs.length > 0 ? (
                <ul className="space-y-1">
                    {cloudConfigs.map((cfg, index) => (
                        <li key={cfg.id ?? index} className="flex flex-wrap items-center gap-1.5 typography-micro text-muted-foreground">
                            {cfg.repositoryUrl ? <span className="font-medium text-foreground">{cfg.repositoryUrl}</span> : null}
                            {cfg.currentStep ? <StatusBadge label={cfg.currentStep} tone={statusToneForState(cfg.currentStep)} /> : null}
                        </li>
                    ))}
                </ul>
            ) : null}

            {operation?.error ? (
                <div
                    className="rounded-lg border px-2.5 py-1.5 typography-meta break-words"
                    style={{
                        color: 'var(--status-error-text)',
                        backgroundColor: 'var(--status-error-background)',
                        borderColor: 'var(--status-error-border)',
                    }}
                >
                    {operation.error}
                </div>
            ) : null}

            {outputText && !operation?.error ? (
                <div className="typography-meta text-muted-foreground whitespace-pre-wrap break-words">
                    {outputText}
                </div>
            ) : null}
        </div>
    );
};


const checkpointDetailsSchema = z.object({
    goal: z.string().optional(),
    startedAt: z.string().optional(),
});

const rewindDetailsSchema = z.object({
    report: z.string().optional(),
    rewound: z.boolean().optional(),
});

const CheckpointCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = checkpointDetailsSchema.safeParse(details).data;
    const goal = nonEmptyText(parsedDetails?.goal) ?? inputTextField(input, 'goal') ?? nonEmptyText(output);

    return (
        <div data-testid="structured-card-checkpoint" className={CARD_SHELL_CLASS}>
            <div className="flex items-center gap-2">
                <Icon name="history" className="size-3.5 shrink-0 text-muted-foreground" />
                <StatusBadge label={t('chat.toolPart.structured.checkpointActive')} tone="info" />
            </div>
            {goal ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                    <ToolMarkdownText content={goal} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};

const RewindCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = rewindDetailsSchema.safeParse(details).data;
    const report = nonEmptyText(parsedDetails?.report) ?? inputTextField(input, 'report') ?? nonEmptyText(output);
    const rewound = parsedDetails?.rewound === true;

    return (
        <div data-testid="structured-card-rewind" className={CARD_SHELL_CLASS}>
            <div className="flex items-center gap-2">
                <Icon name="history" className="size-3.5 shrink-0 text-muted-foreground" />
                <StatusBadge
                    label={rewound ? t('chat.toolPart.structured.rewindCompleted') : t('chat.toolPart.structured.rewindPending')}
                    tone={rewound ? 'success' : 'info'}
                    icon={rewound ? 'checkbox-circle' : undefined}
                />
            </div>
            {report ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                    <ToolMarkdownText content={report} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};


const yieldDetailsSchema = z.object({
    data: z.json().optional(),
    status: z.enum(['success', 'aborted']).optional(),
    error: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    complete: z.boolean().optional(),
});

const StructuredValueView: React.FC<{
    value: JsonValue;
    depth?: number;
    onShowPopup?: (content: ToolPopupContent) => void;
}> = ({ value, depth = 0, onShowPopup }) => {
    const str = z.string().safeParse(value);
    if (str.success) {
        const text = str.data;
        if (text.includes('\n') || depth === 0) {
            return <ToolMarkdownText content={text} onShowPopup={onShowPopup} />;
        }
        return <span className="typography-meta text-foreground break-words">{text}</span>;
    }

    const num = z.number().safeParse(value);
    if (num.success) {
        return <span className="typography-meta tabular-nums text-foreground">{num.data}</span>;
    }

    const bool = z.boolean().safeParse(value);
    if (bool.success) {
        return <span className="typography-meta text-foreground">{bool.data ? 'true' : 'false'}</span>;
    }

    if (value === null) {
        return <span className="typography-meta text-muted-foreground">—</span>;
    }

    const arr = jsonArraySchema.safeParse(value);
    if (arr.success) {
        if (arr.data.length === 0) {
            return <span className="typography-meta text-muted-foreground">—</span>;
        }
        return (
            <ul className="space-y-1 ps-4 list-disc">
                {arr.data.map((item, index) => (
                    <li key={index} className="min-w-0">
                        <StructuredValueView value={item} depth={depth + 1} onShowPopup={onShowPopup} />
                    </li>
                ))}
            </ul>
        );
    }

    const obj = jsonObjectSchema.safeParse(value);
    if (obj.success) {
        const entries = Object.entries(obj.data);
        if (entries.length === 0) {
            return <span className="typography-meta text-muted-foreground">—</span>;
        }
        return (
            <div className={cn('space-y-1.5', depth > 0 && 'border-s border-border/50 ps-2.5')}>
                {entries.map(([key, entryValue]) => (
                    <div key={key} className="grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-3 items-baseline">
                        <span className="typography-micro font-medium text-muted-foreground">{formatFieldLabel(key)}</span>
                        <div className="min-w-0">
                            <StructuredValueView value={entryValue} depth={depth + 1} onShowPopup={onShowPopup} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return null;
};

const YieldCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = yieldDetailsSchema.safeParse(details).data;
    const status = parsedDetails?.status;
    const errorMessage = nonEmptyText(parsedDetails?.error) ?? inputTextField(input, 'error');
    const rawType = parsedDetails?.type ?? input?.type;
    const typeLabels: string[] = (() => {
        const single = z.string().safeParse(rawType);
        if (single.success && single.data.trim()) return [single.data.trim()];
        const multi = z.array(z.string()).safeParse(rawType);
        if (multi.success) return multi.data.map((item) => item.trim()).filter(Boolean);
        return [];
    })();

    const dataValue = parsedDetails?.data !== undefined ? parsedDetails.data : input?.data;
    const outputText = nonEmptyText(output);

    return (
        <div data-testid="structured-card-yield" className={CARD_SHELL_CLASS}>
            <div className="flex flex-wrap items-center gap-1.5">
                <Icon name="send-plane" className="size-3.5 shrink-0 text-muted-foreground" />
                {status ? (
                    <StatusBadge
                        label={status}
                        tone={statusToneForState(status)}
                        icon={statusIconForState(status)}
                        testId="yield-status-badge"
                    />
                ) : null}
                {typeLabels.map((label) => (
                    <StatusBadge key={label} label={label} tone="neutral" />
                ))}
                {parsedDetails?.complete ? (
                    <StatusBadge label={t('chat.toolPart.structured.yieldComplete')} tone="success" />
                ) : null}
            </div>

            {errorMessage ? (
                <div
                    role="alert"
                    className="rounded-lg border px-2.5 py-1.5 typography-meta break-words"
                    style={{
                        color: 'var(--status-error-text)',
                        backgroundColor: 'var(--status-error-background)',
                        borderColor: 'var(--status-error-border)',
                    }}
                >
                    {errorMessage}
                </div>
            ) : null}

            {dataValue !== undefined ? (
                <div data-testid="yield-data-body" className="rounded-lg border border-border/40 bg-background/50 p-2.5">
                    <StructuredValueView value={dataValue} onShowPopup={onShowPopup} />
                </div>
            ) : outputText && !errorMessage ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                    <ToolMarkdownText content={outputText} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};


const thinkDetailsSchema = z.object({
    recorded: z.boolean().optional(),
});

const ThinkCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, details, output, onShowPopup }) => {
    const { t } = useI18n();
    const parsedDetails = thinkDetailsSchema.safeParse(details).data;
    const thoughts = inputTextField(input, 'thoughts');
    const outputFallback = output && output.trim() !== '------' ? nonEmptyText(output) : null;
    const body = thoughts ?? outputFallback;

    return (
        <div data-testid="structured-card-think" className={CARD_SHELL_CLASS}>
            <div className="flex items-center gap-2">
                <Icon name="brain-ai-3" className="size-3.5 shrink-0 text-muted-foreground" />
                {parsedDetails?.recorded ? (
                    <StatusBadge label={t('chat.toolPart.structured.thinkRecorded')} tone="success" icon="checkbox-circle" />
                ) : null}
            </div>
            {body ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2.5">
                    <ToolMarkdownText content={body} variant="reasoning" onShowPopup={onShowPopup} />
                </div>
            ) : (
                <div className="typography-meta text-muted-foreground">{t('chat.toolPart.structured.empty')}</div>
            )}
        </div>
    );
};


const ReportIssueCard: React.FC<Omit<StructuredToolCardProps, 'toolName'>> = ({ input, output, onShowPopup }) => {
    const { t } = useI18n();
    const report = inputTextField(input, 'report');
    const ack = nonEmptyText(output);

    return (
        <div data-testid="structured-card-report-issue" className={CARD_SHELL_CLASS}>
            <div className="flex flex-wrap items-center gap-2">
                <Icon name="bug" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="typography-meta font-medium text-foreground">
                    {t('chat.toolPart.structured.reportIssueLabel')}
                </span>
                {ack ? <StatusBadge label={ack} tone="success" icon="checkbox-circle" /> : null}
            </div>
            {report ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2.5">
                    <ToolMarkdownText content={report} onShowPopup={onShowPopup} />
                </div>
            ) : !ack ? (
                <div className="typography-meta text-muted-foreground">{t('chat.toolPart.structured.empty')}</div>
            ) : null}
        </div>
    );
};


const resolveDetailsSchema = z.object({
    action: z.string().optional(),
    reason: z.string().optional(),
    sourceToolName: z.string().optional(),
    label: z.string().optional(),
});

const ResolveActionCard: React.FC<Omit<StructuredToolCardProps, 'toolName'> & { variant: 'resolve' | 'reject' | 'propose' }> = ({
    variant,
    input,
    details,
    output,
    onShowPopup,
}) => {
    const { t } = useI18n();
    const parsedDetails = resolveDetailsSchema.safeParse(details).data;
    const action = nonEmptyText(parsedDetails?.action)
        ?? (variant === 'resolve' ? 'apply' : variant === 'reject' ? 'discard' : null);
    const reasonOrTitle = nonEmptyText(parsedDetails?.reason)
        ?? inputTextField(input, 'reason')
        ?? inputTextField(input, 'title');
    const sourceLabel = nonEmptyText(parsedDetails?.label) ?? nonEmptyText(parsedDetails?.sourceToolName);
    const outputText = nonEmptyText(output);

    return (
        <div data-testid={`structured-card-${variant}`} className={CARD_SHELL_CLASS}>
            <div className="flex flex-wrap items-center gap-2">
                <Icon
                    name={variant === 'reject' ? 'close-circle' : 'checkbox-circle'}
                    className="size-3.5 shrink-0 text-muted-foreground"
                />
                {action ? (
                    <StatusBadge
                        label={action}
                        tone={statusToneForState(action)}
                        icon={statusIconForState(action)}
                        testId="resolve-action-badge"
                    />
                ) : variant === 'propose' ? (
                    <StatusBadge label={t('chat.toolPart.structured.proposePlan')} tone="info" />
                ) : null}
                {sourceLabel ? <span className="typography-micro text-muted-foreground">{sourceLabel}</span> : null}
            </div>

            {reasonOrTitle ? (
                <div className="typography-meta text-foreground break-words">
                    {reasonOrTitle}
                </div>
            ) : null}

            {outputText && outputText !== reasonOrTitle ? (
                <div className="rounded-lg border border-border/40 bg-background/50 p-2">
                    <ToolMarkdownText content={outputText} onShowPopup={onShowPopup} />
                </div>
            ) : null}
        </div>
    );
};


export const StructuredToolCard: React.FC<StructuredToolCardProps> = React.memo(({
    toolName,
    input,
    details,
    output,
    onShowPopup,
}) => {
    const base = toolBaseName(toolName);
    switch (base) {
        case 'debug':
            return <DebugCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'github':
            return <GithubCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'goal':
            return <GoalCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'security_scan':
            return <SecurityScanCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'checkpoint':
            return <CheckpointCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'rewind':
            return <RewindCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'yield':
            return <YieldCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'think':
            return <ThinkCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'report_issue':
            return <ReportIssueCard input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'resolve':
            return <ResolveActionCard variant="resolve" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'reject':
            return <ResolveActionCard variant="reject" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        case 'propose':
            return <ResolveActionCard variant="propose" input={input} details={details} output={output} onShowPopup={onShowPopup} />;
        default:
            return null;
    }
});

StructuredToolCard.displayName = 'StructuredToolCard';
