import { z } from 'zod';

import type { Message, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { isSubagentTool, toolBaseName } from '@/lib/toolPresentation';
import { nativeToolResultContent } from '@/lib/toolResultContent';

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

const vibeSpawnSchema = z.object({
  cli: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
});

const vibeSendSchema = z.object({
  session: z.string().trim().min(1),
  message: z.string().trim().min(1),
});

const vibeResultDetailsSchema = z.object({
  spawned: z.object({ id: z.string().trim().min(1) }).optional(),
  send: z.object({ id: z.string().trim().min(1) }).optional(),
});

const VIBE_GENERIC_DESCRIPTION_RE = /^vibe\s+(?:fast|good)\s+session$/i;

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

const extractVibeResultDetails = (
  result: ToolResultPart | undefined,
): z.infer<typeof vibeResultDetailsSchema> | null => {
  if (!result) return null;
  const native = nativeToolResultContent(result);
  if (native.details !== undefined) {
    const parsed = vibeResultDetailsSchema.safeParse(native.details);
    if (parsed.success) return parsed.data;
  }
  const direct = vibeResultDetailsSchema.safeParse(result.output);
  return direct.success ? direct.data : null;
};

const buildTargetIds = (target: SubagentTaskTarget): ReadonlySet<string> => {
  const ids = new Set<string>();
  const subagentId = target.subagentId.trim();
  if (subagentId) ids.add(subagentId);
  const name = target.name?.trim();
  const role = target.role?.trim();
  if (name && (name !== role || subagentId === role)) {
    ids.add(name);
  }
  return ids;
};

const extractTaskCallPrompt = (
  part: ToolCallPart,
  target: SubagentTaskTarget,
  allowNameFallback: boolean,
): string | null => {
  const toolMatches = Boolean(target.toolCallId && part.toolCallId === target.toolCallId);

  const batch = batchTaskSchema.safeParse(part.input);
  if (batch.success) {
    if (target.toolCallId && !toolMatches) return null;
    const matchedItem = batch.data.tasks.find((item) => matchesBatchItem(item, target, batch.data.tasks));
    if (matchedItem) {
      const itemPrompt = formatSinglePrompt(matchedItem);
      if (itemPrompt) {
        const context = batch.data.context?.trim();
        return context ? `${context}\n\n${itemPrompt}` : itemPrompt;
      }
    }
    return null;
  }

  const single = singleTaskSchema.safeParse(part.input);
  if (single.success) {
    const nameMatches = Boolean(
      single.data.name && (single.data.name === target.name || single.data.name === target.subagentId),
    );
    if (toolMatches || (allowNameFallback && !target.toolCallId && nameMatches)) {
      return formatSinglePrompt(single.data);
    }
  }
  return null;
};

export const findSubagentTask = (
  parentMessages: readonly Message[] | undefined,
  childMessages: readonly Message[] | undefined,
  target: SubagentTaskTarget,
): string | null => {
  const resultsByCallId = new Map<string, ToolResultPart>();
  const toolCalls: ToolCallPart[] = [];

  for (const message of parentMessages ?? []) {
    for (const part of message.parts) {
      if (part.type === 'tool_result') {
        resultsByCallId.set(part.toolCallId, part);
      } else if (message.role === 'assistant' && part.type === 'tool_call') {
        toolCalls.push(part);
      }
    }
  }

  const targetIds = buildTargetIds(target);

  // 1. Exact toolCallId match wins across `task`, `vibe_spawn`, and `vibe_send`.
  if (target.toolCallId) {
    for (const part of toolCalls) {
      if (part.toolCallId !== target.toolCallId) continue;
      if (isSubagentTool(part.toolName)) {
        const prompt = extractTaskCallPrompt(part, target, false);
        if (prompt) return prompt;
      }
      const base = toolBaseName(part.toolName);
      if (base === 'vibe_spawn') {
        const spawn = vibeSpawnSchema.safeParse(part.input);
        if (spawn.success) return spawn.data.prompt;
      }
      if (base === 'vibe_send') {
        const send = vibeSendSchema.safeParse(part.input);
        if (send.success) return send.data.message;
      }
    }
  }

  // 2. Match `task` calls by name when no toolCallId narrowed the call.
  if (!target.toolCallId) {
    for (const part of toolCalls) {
      if (!isSubagentTool(part.toolName)) continue;
      const prompt = extractTaskCallPrompt(part, target, true);
      if (prompt) return prompt;
    }
  }

  // 3. Match `vibe_spawn` by `details.spawned.id` (unique worker identity).
  for (const part of toolCalls) {
    if (toolBaseName(part.toolName) !== 'vibe_spawn') continue;
    const spawn = vibeSpawnSchema.safeParse(part.input);
    if (!spawn.success) continue;
    const spawnedId = extractVibeResultDetails(resultsByCallId.get(part.toolCallId))?.spawned?.id;
    if (spawnedId && targetIds.has(spawnedId)) {
      return spawn.data.prompt;
    }
  }

  // 4. Match `vibe_spawn` by `input.name` when `details.spawned.id` did not claim another worker.
  for (const part of toolCalls) {
    if (toolBaseName(part.toolName) !== 'vibe_spawn') continue;
    const spawn = vibeSpawnSchema.safeParse(part.input);
    if (!spawn.success || !spawn.data.name) continue;
    const spawnedId = extractVibeResultDetails(resultsByCallId.get(part.toolCallId))?.spawned?.id;
    if (spawnedId && !targetIds.has(spawnedId)) continue;
    if (targetIds.has(spawn.data.name)) {
      return spawn.data.prompt;
    }
    if (!spawnedId) {
      for (const id of targetIds) {
        if (id.startsWith(`${spawn.data.name}-`)) {
          return spawn.data.prompt;
        }
      }
    }
  }

  // 5. Match `vibe_send` by `details.send.id` or `input.session`.
  for (const part of toolCalls) {
    if (toolBaseName(part.toolName) !== 'vibe_send') continue;
    const send = vibeSendSchema.safeParse(part.input);
    if (!send.success) continue;
    const sendId = extractVibeResultDetails(resultsByCallId.get(part.toolCallId))?.send?.id;
    if ((sendId && targetIds.has(sendId)) || targetIds.has(send.data.session)) {
      return send.data.message;
    }
  }

  const storedTask = (target.task ?? target.solutionSpace)?.trim();
  if (storedTask && !VIBE_GENERIC_DESCRIPTION_RE.test(storedTask)) return storedTask;

  const first = childMessages?.find((message) => message.role === 'user');
  if (!first) return null;
  const text = first.parts
    .flatMap((part) => (part.type === 'text' ? [part.content] : []))
    .join('\n')
    .trim();
  return text || null;
};
