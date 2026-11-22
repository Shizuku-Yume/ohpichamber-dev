import React from 'react';
import { cn } from '@/lib/utils';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { Icon } from '@/components/icon/Icon';

import type { TodoItem, TodoPhase } from '../../todoData';
import { activeTodoTask, hasTodoTasks, isClosedTodo, todoProgress } from '../../todoProgress';

const STATUS_LABEL_KEY = {
    pending: 'chat.todoTray.status.pending',
    in_progress: 'chat.todoTray.status.inProgress',
    completed: 'chat.todoTray.status.completed',
    abandoned: 'chat.todoTray.status.abandoned',
} as const satisfies Record<TodoItem['status'], I18nKey>;

const statusDotClass = (task: TodoItem): string => {
    if (task.status === 'completed') return 'bg-status-success';
    if (task.status === 'abandoned') return 'bg-status-error';
    if (task.status === 'in_progress') return 'bg-status-info';
    return 'bg-muted-foreground';
};

/**
 * OMP's todo checklist. Folded, it is one row: the task in progress (or the
 * next pending one) and `closed/total`; opened, it lists every phase, as the
 * terminal's checklist does. The composer's tray opens folded; a tool result's
 * body opens already unfolded, since the reader expanded that row to read it.
 */
export const TodoCard: React.FC<{ phases: TodoPhase[]; defaultExpanded?: boolean }> = React.memo(({ phases, defaultExpanded = false }) => {
    const { t } = useI18n();
    const [expanded, setExpanded] = React.useState(defaultExpanded);
    const contentId = React.useId();
    if (!hasTodoTasks(phases)) return null;
    const progress = todoProgress(phases);
    const active = activeTodoTask(phases);
    const progressText = `${progress.closed}/${progress.total}`;

    return (
        <div className="my-1" data-testid="todo-card">
            <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                onMouseDown={(event) => event.preventDefault()}
                aria-expanded={expanded}
                aria-controls={expanded ? contentId : undefined}
                aria-label={t(expanded ? 'chat.todoTray.collapseAria' : 'chat.todoTray.expandAria')}
                className="flex w-full min-w-0 items-center gap-2 rounded-md px-1 py-0.5 text-start hover:bg-muted/20"
            >
                <span
                    aria-hidden="true"
                    className={cn('size-1.5 shrink-0 rounded-full', active ? statusDotClass(active) : 'bg-muted-foreground')}
                />
                {active ? (
                    <span
                        className={cn(
                            'min-w-0 flex-1 truncate typography-meta text-muted-foreground',
                            isClosedTodo(active) && 'line-through opacity-70',
                        )}
                    >
                        {active.content}
                    </span>
                ) : <span className="min-w-0 flex-1" />}
                <span
                    className="shrink-0 typography-meta tabular-nums text-muted-foreground"
                    aria-label={t('chat.todoTray.progressAria', { done: progress.closed, total: progress.total })}
                >
                    {progressText}
                </span>
                <Icon
                    name="arrow-right-s"
                    className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-150', expanded && 'rotate-90 rtl:-rotate-90')}
                    aria-hidden="true"
                />
            </button>
            {expanded ? (
                <div id={contentId} className="mt-1 rounded-lg border border-border/60 bg-muted/10 px-3 py-2">
                    {phases.map((phase) => (
                        <section key={phase.name} className="mb-2 last:mb-0">
                            <h4 className="typography-meta font-medium text-foreground [overflow-wrap:anywhere]">{phase.name}</h4>
                            <ul className="mt-1 space-y-0.5">
                                {phase.tasks.map((task) => (
                                    <li
                                        key={`${phase.name}:${task.content}`}
                                        data-status={task.status}
                                        aria-label={`${t(STATUS_LABEL_KEY[task.status])}: ${task.content}`}
                                        className="flex items-start gap-2 typography-meta text-muted-foreground"
                                    >
                                        <span aria-hidden="true" className={cn('mt-1 size-1.5 shrink-0 rounded-full', statusDotClass(task))} />
                                        <span className={cn('min-w-0 [overflow-wrap:anywhere]', isClosedTodo(task) && 'line-through opacity-70')}>{task.content}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            ) : null}
        </div>
    );
});
TodoCard.displayName = 'TodoCard';
