import React from 'react';

import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import type { TodoItem } from '@openchamber/agent-contract';
import { useSessionTodos } from '@/sync/sync-context';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { TODO_STATUS_ICON } from '../todoStatus';
import { isClosedTodo } from '../todoProgress';
import { WorkStatusCollapsibleSection, WorkStatusRow } from './WorkStatusPrimitives';
import { useReportWorkStatusPresence } from './presenceContext';

type Props = {
  sessionId: string | null;
  directory?: string | null;
};

const STATUS_RANK = {
  in_progress: 0,
  pending: 2,
  completed: 3,
  abandoned: 4,
} satisfies Record<TodoItem['status'], number>;

const TaskRow: React.FC<{ todo: TodoItem }> = ({ todo }) => {
  const done = isClosedTodo(todo);
  const icon = TODO_STATUS_ICON[todo.status];
  return (
    <WorkStatusRow
      leading={(
        <span className="flex size-[13px] shrink-0 items-center justify-center">
          <Icon name={icon.name} className="size-3" style={icon.color ? { color: icon.color } : undefined} />
        </span>
      )}
      muted={done}
      label={<span className={done ? 'line-through' : undefined}>{todo.content}</span>}
      tooltip={todo.content}
    />
  );
};

export const WorkStatusTasksSection: React.FC<Props> = ({ sessionId, directory }) => {
  const { t } = useI18n();
  const phases = useSessionTodos(sessionId, directory ?? undefined);

  const visibleTodos = React.useMemo(() => phases.flatMap((phase) => phase.tasks)
    .map((todo, index) => ({ todo, index }))
    .sort((left, right) => (STATUS_RANK[left.todo.status] - STATUS_RANK[right.todo.status]) || left.index - right.index)
    .map(({ todo }) => todo), [phases]);

  useReportWorkStatusPresence('tasks', visibleTodos.length > 0);
  if (visibleTodos.length === 0) return null;

  const doneCount = visibleTodos.filter(isClosedTodo).length;
  const activeTodo = visibleTodos.find((todo) => todo.status === 'in_progress');

  return (
    <WorkStatusCollapsibleSection
      id="tasks"
      title={t('chat.workStatus.section.tasks')}
      icon="list-check-2"
      summary={`${doneCount}/${visibleTodos.length}`}
      defaultExpanded
      collapsedContent={activeTodo ? <TaskRow todo={activeTodo} /> : null}
    >
      <ScrollableOverlay outerClassName="max-h-72" disableHorizontal>
        {visibleTodos.map((todo, index) => (
          <TaskRow key={`${index}-${todo.content}`} todo={todo} />
        ))}
      </ScrollableOverlay>
    </WorkStatusCollapsibleSection>
  );
};
