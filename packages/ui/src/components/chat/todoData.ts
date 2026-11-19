import { z } from 'zod';
import { TodoStatusSchema, type TodoItem, type TodoPhase } from '@openchamber/agent-contract';

export type { TodoItem, TodoPhase };

const TodoDetailsSchema = z.object({
  phases: z.array(z.object({
    name: z.string(),
    tasks: z.array(z.object({
      content: z.string(),
      status: z.preprocess(status => status === 'blocked' ? 'pending' : status, TodoStatusSchema),
    })),
  })),
});

/** OMP todo details are parsed defensively because transcript data may predate the current result shape. */
export function extractTodoPhases(value: unknown): TodoPhase[] | null {
  const parsed = TodoDetailsSchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data.phases.map((phase) => ({
    name: phase.name,
    tasks: phase.tasks.map((task) => ({
      content: task.content,
      status: task.status,
    })),
  }));
}
