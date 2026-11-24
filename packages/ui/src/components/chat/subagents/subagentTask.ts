import { z } from 'zod';

import type { Message } from '@openchamber/agent-contract';
import { isSubagentTool } from '@/lib/toolPresentation';

type SubagentTaskTarget = {
  subagentId: string;
  childSessionId?: string | null;
  toolCallId?: string | null;
  name?: string | null;
  role?: string | null;
  task?: string | null;
  solutionSpace?: string | null;
};

const singleTaskSchema = z.object({
  name: z.string().trim().min(1).optional(),
  agent: z.string().trim().min(1).optional(),
  task: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1).optional(),
  steps: z.array(z.string().trim().min(1)).min(1).optional(),
});

const batchTaskSchema = z.object({
  context: z.string().trim().optional(),
  tasks: z.array(singleTaskSchema).min(1),
});

const formatSinglePrompt = (item: z.infer<typeof singleTaskSchema>): string | null => {
  if (item.task) return item.task;
  if (item.prompt) return item.prompt;
  if (item.steps && item.steps.length > 0) {
    return item.steps.map((step, index) => `${index + 1}. ${step}`).join('\n');
  }
  return null;
};

const matchesBatchItem = (
  item: z.infer<typeof singleTaskSchema>,
  target: SubagentTaskTarget,
  items: readonly z.infer<typeof singleTaskSchema>[],
): boolean => {
  const candidates = [target.name, target.subagentId]
    .flatMap((value) => {
      const text = z.string().safeParse(value).data?.trim();
      return text ? [text] : [];
    });
  if (item.name) {
    if (candidates.includes(item.name)) return true;
    // OutputManager disambiguates colliding names with a numeric suffix (e.g. `Scout-2`).
    if (candidates.some((candidate) => candidate.startsWith(`${item.name}-`))) return true;
  }
  if (items.length === 1) return true;
  if (target.role && item.agent === target.role) {
    return items.filter((entry) => entry.agent === target.role).length === 1;
  }
  return false;
};

export const findSubagentTask = (
  parentMessages: readonly Message[] | undefined,
  childMessages: readonly Message[] | undefined,
  target: SubagentTaskTarget,
): string | null => {
  for (const message of parentMessages ?? []) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts) {
      if (part.type !== 'tool_call' || !isSubagentTool(part.toolName)) continue;
      const toolMatches = Boolean(target.toolCallId && part.toolCallId === target.toolCallId);

      const batch = batchTaskSchema.safeParse(part.input);
      if (batch.success) {
        if (target.toolCallId && !toolMatches) continue;
        const matchedItem = batch.data.tasks.find((item) => matchesBatchItem(item, target, batch.data.tasks));
        if (matchedItem) {
          const itemPrompt = formatSinglePrompt(matchedItem);
          if (itemPrompt) {
            const context = batch.data.context?.trim();
            return context ? `${context}\n\n${itemPrompt}` : itemPrompt;
          }
        }
        continue;
      }

      const single = singleTaskSchema.safeParse(part.input);
      if (single.success) {
        const nameMatches = Boolean(
          single.data.name && (single.data.name === target.name || single.data.name === target.subagentId),
        );
        if (toolMatches || (!target.toolCallId && nameMatches)) {
          const prompt = formatSinglePrompt(single.data);
          if (prompt) return prompt;
        }
      }
    }
  }

  const storedTask = (target.task ?? target.solutionSpace)?.trim();
  if (storedTask) return storedTask;

  const first = childMessages?.find((message) => message.role === 'user');
  if (!first) return null;
  const text = first.parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('\n')
    .trim();
  return text || null;
};
