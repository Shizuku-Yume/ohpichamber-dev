import React from 'react';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { useI18n } from '@/lib/i18n';
import { StatusBadge, ToolMarkdownText } from './SharedCardPrimitives';
import {
    CARD_SHELL_CLASS,
    formatTokenCount,
    inputTextField,
    nonEmptyText,
    statusIconForState,
    statusToneForState,
    type StatusTone,
    type StructuredCardBodyProps,
} from './shared';

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

export const GoalCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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
                                className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
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

export const SecurityScanCard: React.FC<StructuredCardBodyProps> = ({ input, details, output }) => {
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
