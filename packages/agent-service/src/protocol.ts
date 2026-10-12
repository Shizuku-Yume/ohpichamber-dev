import { EntityIdSchema } from '@openchamber/agent-contract';
import { isAbsolute } from 'node:path';
import { z } from 'zod';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);

export const WorkerBootstrapSchema = z.strictObject({
  rootSessionId: EntityIdSchema,
  projectId: EntityIdSchema,
  workspaceId: EntityIdSchema,
  cwd: PrivatePathSchema,
  agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(),
  env: z.record(z.string(), z.string()).optional(),
});
export type WorkerBootstrap = z.infer<typeof WorkerBootstrapSchema>;

const WorkerInfoSchema = z.strictObject({
  rootSessionId: EntityIdSchema,
  workerGeneration: EntityIdSchema,
  projectId: EntityIdSchema,
  workspaceId: EntityIdSchema,
  state: z.enum(['starting', 'ready', 'stopping', 'stopped', 'crashed']),
});
export type WorkerInfo = z.infer<typeof WorkerInfoSchema>;

export const WorkerBootstrapMessageSchema = z.strictObject({
  type: z.literal('bootstrap'),
  rootSessionId: EntityIdSchema,
  workerGeneration: EntityIdSchema,
  cwd: PrivatePathSchema,
  agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(),
});
export type WorkerBootstrapMessage = z.infer<typeof WorkerBootstrapMessageSchema>;

const WorkerControlSchema = z.strictObject({
  type: z.literal('stop'),
  workerGeneration: EntityIdSchema,
});
export const WorkerCommandSchema = z.discriminatedUnion('type', [
  WorkerBootstrapMessageSchema,
  WorkerControlSchema,
]);

export const WorkerReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), workerGeneration: EntityIdSchema }),
  z.strictObject({ type: z.literal('error'), workerGeneration: EntityIdSchema }),
  z.strictObject({
    type: z.literal('lifecycle'),
    workerGeneration: EntityIdSchema,
    state: z.enum(['initialized', 'closed']),
  }),
]);
export type WorkerReply = z.infer<typeof WorkerReplySchema>;
