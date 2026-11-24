import React from 'react';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { StatusBadge, ToolMarkdownText } from './SharedCardPrimitives';
import {
    CARD_SHELL_CLASS,
    inputTextField,
    nonEmptyText,
    statusIconForState,
    statusToneForState,
    type StatusTone,
    type StructuredCardBodyProps,
} from './shared';

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

export const DebugCard: React.FC<StructuredCardBodyProps> = ({ input, details, output }) => {
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
                                            {job.steps.map((step, stepIndex) => {
                                                const stepState = nonEmptyText(step.conclusion) ?? nonEmptyText(step.status);
                                                return (
                                                    <li key={step.number ?? stepIndex} className="flex items-center gap-1.5 typography-micro text-muted-foreground">
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

export const GithubCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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
