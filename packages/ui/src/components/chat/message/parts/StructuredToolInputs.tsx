import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { StatusBadge } from './structuredCards/SharedCardPrimitives';
import { CARD_SHELL_CLASS } from './structuredCards/shared';
import { ToolScalarInputRows } from './ToolStructuredBody';
import type { ResolvedStructuredToolInput } from './toolDisplayContent';

const TaskInputCard: React.FC<{
    parsed: Extract<ResolvedStructuredToolInput, { kind: 'task' }>;
}> = ({ parsed }) => {
    const { t } = useI18n();

    return (
        <div data-testid="task-input-card" className={CARD_SHELL_CLASS}>
            {parsed.context ? (
                <div className="space-y-1">
                    <div className="typography-micro font-medium text-muted-foreground">
                        {t('chat.toolPart.task.context')}
                    </div>
                    <div
                        dir="auto"
                        className="rounded-lg border border-border/40 bg-background/50 p-2 typography-meta text-foreground/90 whitespace-pre-wrap break-words"
                    >
                        {parsed.context}
                    </div>
                </div>
            ) : null}
            {parsed.items.length > 0 ? (
                <div className="space-y-2">
                    {parsed.items.map((item, index) => (
                        <div
                            key={`${item.name ?? 'task'}-${index}`}
                            data-testid="task-input-item"
                            className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1.5 min-w-0"
                        >
                            {item.name || item.agent || item.isolated || item.effort || item.model ? (
                                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                                    <Icon name="ai-agent" className="size-3.5 shrink-0 text-muted-foreground" />
                                    {item.name ? (
                                        <span className="typography-meta font-medium text-foreground truncate" dir="auto">
                                            {item.name}
                                        </span>
                                    ) : null}
                                    {item.agent ? <StatusBadge label={item.agent} tone="neutral" /> : null}
                                    {item.isolated ? <StatusBadge label={t('chat.toolPart.task.isolated')} tone="info" /> : null}
                                    {item.effort ? <StatusBadge label={item.effort} tone="neutral" /> : null}
                                    {item.model ? (
                                        <span className="typography-micro text-muted-foreground truncate" title={item.model}>
                                            {item.model}
                                        </span>
                                    ) : null}
                                </div>
                            ) : null}

                            {item.description ? (
                                <div className="typography-meta text-muted-foreground break-words" dir="auto">
                                    {item.description}
                                </div>
                            ) : null}

                            {item.assignment ? (
                                <div className="space-y-0.5">
                                    <div className="typography-micro font-medium text-muted-foreground">
                                        {t('chat.toolPart.task.assignment')}
                                    </div>
                                    <div
                                        dir="auto"
                                        className="oc-tile-inset rounded-lg border-l-2 border-[var(--interactive-border)] px-2.5 py-1.5 typography-meta text-foreground/90 whitespace-pre-wrap break-words"
                                    >
                                        {item.assignment}
                                    </div>
                                </div>
                            ) : null}

                            {item.extraTask ? (
                                <div
                                    dir="auto"
                                    className="oc-tile-inset rounded-lg border-l-2 border-[var(--interactive-border)] px-2.5 py-1.5 typography-meta text-foreground/90 whitespace-pre-wrap break-words"
                                >
                                    {item.extraTask}
                                </div>
                            ) : null}

                            {item.steps.length > 0 ? (
                                <ol className="list-decimal ps-5 space-y-0.5 typography-meta text-foreground/90">
                                    {item.steps.map((step, stepIndex) => (
                                        <li key={stepIndex} className="break-words" dir="auto">
                                            {step}
                                        </li>
                                    ))}
                                </ol>
                            ) : null}

                            {item.solutionSpace ? (
                                <div className="flex flex-wrap items-baseline gap-1.5 typography-micro text-muted-foreground">
                                    <span className="font-medium">{t('chat.toolPart.task.solutionSpace')}:</span>
                                    <span className="text-foreground/80 break-words" dir="auto">
                                        {item.solutionSpace}
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

const AstEditInputCard: React.FC<{
    parsed: Extract<ResolvedStructuredToolInput, { kind: 'ast_edit' }>;
}> = ({ parsed }) => (
    <div data-testid="ast-edit-input-card" className={CARD_SHELL_CLASS}>
        {parsed.ops.length > 0 ? (
            <div className="space-y-1">
                {parsed.ops.map((op, index) => (
                    <div
                        key={index}
                        className="rounded-lg border border-border/40 bg-background/50 px-2 py-1 font-mono typography-micro text-foreground break-all"
                    >
                        {op.pat} → {op.out}
                    </div>
                ))}
            </div>
        ) : null}
        {parsed.paths.length > 0 ? (
            <div className="flex flex-wrap gap-1">
                {parsed.paths.map((filePath, index) => (
                    <span
                        key={`${filePath}-${index}`}
                        className="oc-tile-inset rounded px-1.5 py-0.5 font-mono typography-micro text-muted-foreground break-all"
                    >
                        {filePath}
                    </span>
                ))}
            </div>
        ) : null}
    </div>
);

const TodoInputCard: React.FC<{
    parsed: Extract<ResolvedStructuredToolInput, { kind: 'todo' }>;
}> = ({ parsed }) => {
    const { t } = useI18n();
    return (
        <div data-testid="todo-input-card" className={CARD_SHELL_CLASS}>
            {parsed.op || parsed.phase ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    {parsed.op ? <StatusBadge label={parsed.op} tone="info" /> : null}
                    {parsed.phase ? (
                        <span className="typography-meta font-medium text-foreground" dir="auto">
                            {t('chat.toolPart.openchamber.field.phase')}: {parsed.phase}
                        </span>
                    ) : null}
                </div>
            ) : null}
            {parsed.tasks.length > 0 ? (
                <ul className="list-disc ps-5 space-y-0.5 typography-meta text-foreground/90">
                    {parsed.tasks.map((item, index) => (
                        <li key={index} className="break-words" dir="auto">
                            {item}
                        </li>
                    ))}
                </ul>
            ) : null}
            {parsed.list.length > 0 ? (
                <div className="space-y-1.5">
                    {parsed.list.map((entry, index) => (
                        <div key={`${entry.phase}-${index}`} className="rounded-lg border border-border/40 bg-background/50 p-2 space-y-1">
                            {entry.phase ? (
                                <div className="typography-micro font-medium text-muted-foreground" dir="auto">
                                    {entry.phase}
                                </div>
                            ) : null}
                            {entry.items.length > 0 ? (
                                <ul className="list-disc ps-5 space-y-0.5 typography-meta text-foreground/90">
                                    {entry.items.map((item, itemIndex) => (
                                        <li key={itemIndex} className="break-words" dir="auto">
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
};

const GenerateImageInputCard: React.FC<{
    parsed: Extract<ResolvedStructuredToolInput, { kind: 'generate_image' }>;
}> = ({ parsed }) => {
    const { t } = useI18n();
    return (
        <div data-testid="generate-image-input-card" className={CARD_SHELL_CLASS}>
            {parsed.scalarRows.length > 0 ? <ToolScalarInputRows rows={parsed.scalarRows} /> : null}
            {parsed.changes.length > 0 ? (
                <ul className="list-disc ps-5 space-y-0.5 typography-meta text-foreground/90">
                    {parsed.changes.map((change, index) => (
                        <li key={index} className="break-words" dir="auto">
                            {change}
                        </li>
                    ))}
                </ul>
            ) : null}
            {parsed.referencePaths.length > 0 || parsed.unnamedReferenceCount > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    {parsed.referencePaths.map((refPath, index) => (
                        <span
                            key={`${refPath}-${index}`}
                            className="oc-tile-inset rounded px-1.5 py-0.5 font-mono typography-micro text-muted-foreground break-all"
                        >
                            {refPath}
                        </span>
                    ))}
                    {parsed.unnamedReferenceCount > 0 ? (
                        <StatusBadge
                            label={t(
                                parsed.unnamedReferenceCount === 1
                                    ? 'chat.toolPart.structured.referenceImagesSingle'
                                    : 'chat.toolPart.structured.referenceImagesPlural',
                                { count: parsed.unnamedReferenceCount },
                            )}
                            tone="neutral"
                        />
                    ) : null}
                </div>
            ) : null}
        </div>
    );
};

export const StructuredToolInputPreview: React.FC<{
    resolved: ResolvedStructuredToolInput;
}> = React.memo(({ resolved }) => {
    switch (resolved.kind) {
        case 'task':
            return <TaskInputCard parsed={resolved} />;
        case 'ast_edit':
            return <AstEditInputCard parsed={resolved} />;
        case 'todo':
            return <TodoInputCard parsed={resolved} />;
        case 'generate_image':
            return <GenerateImageInputCard parsed={resolved} />;
    }
});

StructuredToolInputPreview.displayName = 'StructuredToolInputPreview';
