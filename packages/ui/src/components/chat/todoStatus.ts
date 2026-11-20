import type { IconName } from '@/components/icon/icons';
import type { TodoStatus } from '@openchamber/agent-contract';

export const TODO_STATUS_ICON = {
  in_progress: { name: 'record-circle', color: 'var(--status-info)' },
  completed: { name: 'checkbox-circle', color: 'var(--status-success)' },
  pending: { name: 'time', color: undefined },
  abandoned: { name: 'close-circle', color: undefined },
} satisfies Record<TodoStatus, { name: IconName; color: string | undefined }>;
