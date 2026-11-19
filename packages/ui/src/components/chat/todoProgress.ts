import type { TodoItem, TodoPhase } from './todoData';

/** A task that no longer needs work: OMP counts completed and abandoned alike. */
export const isClosedTodo = (task: TodoItem): boolean => task.status === 'completed' || task.status === 'abandoned';

/** Whether any phase carries a task at all; an empty plan is not a todo list. */
export const hasTodoTasks = (phases: readonly TodoPhase[]): boolean =>
    phases.some((phase) => phase.tasks.length > 0);

/** Whether any task still needs work: completed and abandoned ones do not. */
export const hasOpenTodo = (phases: readonly TodoPhase[]): boolean =>
    phases.some((phase) => phase.tasks.some((task) => !isClosedTodo(task)));

interface TodoProgress {
    closed: number;
    total: number;
}

export const todoProgress = (phases: readonly TodoPhase[]): TodoProgress => {
    let closed = 0;
    let total = 0;
    for (const phase of phases) {
        for (const task of phase.tasks) {
            total += 1;
            if (isClosedTodo(task)) closed += 1;
        }
    }
    return { closed, total };
};

/**
 * The task named on the card's folded row: the one being worked on, else the
 * next one waiting, else the last task that closed. A finished plan no longer
 * reaches a tray, but the tool card still
 * names what it finished.
 */
export const activeTodoTask = (phases: readonly TodoPhase[]): TodoItem | null => {
    let firstPending: TodoItem | null = null;
    let lastClosed: TodoItem | null = null;
    for (const phase of phases) {
        for (const task of phase.tasks) {
            if (task.status === 'in_progress') return task;
            if (!firstPending && task.status === 'pending') firstPending = task;
            if (isClosedTodo(task)) lastClosed = task;
        }
    }
    return firstPending ?? lastClosed;
};
