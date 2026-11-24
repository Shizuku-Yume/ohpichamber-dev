import React from 'react';
import type { JsonValue } from '@openchamber/agent-contract';
import { z } from 'zod';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ToolPopupContent } from '../../types';
import { StatusBadge, ToolMarkdownText } from './SharedCardPrimitives';
import {
    CARD_SHELL_CLASS,
    formatFieldLabel,
    inputTextField,
    jsonArraySchema,
    jsonObjectSchema,
    nonEmptyText,
    statusIconForState,
    statusToneForState,
    type StructuredCardBodyProps,
} from './shared';

const checkpointDetailsSchema = z.object({
    goal: z.string().optional(),
    startedAt: z.string().optional(),
});

const rewindDetailsSchema = z.object({
    report: z.string().optional(),
    rewound: z.boolean().optional(),
});

export const CheckpointCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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

export const RewindCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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

export const YieldCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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

export const ThinkCard: React.FC<StructuredCardBodyProps> = ({ input, details, output, onShowPopup }) => {
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

export const ReportIssueCard: React.FC<StructuredCardBodyProps> = ({ input, output, onShowPopup }) => {
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

export const ResolveActionCard: React.FC<StructuredCardBodyProps & { variant: 'resolve' | 'reject' | 'propose' }> = ({
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
