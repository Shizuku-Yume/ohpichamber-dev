import { z } from 'zod';
import { CounterSchema, EntityIdSchema, SkillSourceRevisionsSchema } from '@openchamber/agent-contract';

const owner = { projectId: EntityIdSchema, workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema };
export const HostSkillSourceCommitSchema = z.strictObject({
  scope: z.enum(['workspace', 'agent']), agentDirectoryId: EntityIdSchema,
  expectedSourceRevision: CounterSchema, operationId: EntityIdSchema,
});
export type HostSkillSourceCommit = z.infer<typeof HostSkillSourceCommitSchema>;
export const HostSkillSourceOperationSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('commit'), ...owner, scope: z.enum(['workspace', 'agent']), expectedSourceRevision: CounterSchema, operationId: EntityIdSchema }),
  z.strictObject({ action: z.literal('reconcile'), ...owner }),
]);
export type HostSkillSourceOperation = z.infer<typeof HostSkillSourceOperationSchema>;
export const HostSkillSourceResultSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('committed'), sourceRevision: CounterSchema }),
  z.strictObject({ status: z.literal('reconciled'), sources: SkillSourceRevisionsSchema }),
  z.strictObject({ status: z.literal('failed'), code: z.enum(['INVALID_REQUEST', 'UNAUTHORIZED', 'NOT_FOUND', 'CATALOG_CONFLICT', 'SKILL_INSTALL_FAILED', 'SERVICE_UNAVAILABLE']), currentRevision: CounterSchema.optional() }),
]);
export type HostSkillSourceResult = z.infer<typeof HostSkillSourceResultSchema>;
export const HostSkillSourceRequestSchema = z.strictObject({ type: z.literal('host.skill-source.request'), requestId: EntityIdSchema, operation: HostSkillSourceOperationSchema });
export const HostSkillSourceReplySchema = z.strictObject({ type: z.literal('host.skill-source.result'), requestId: EntityIdSchema, result: HostSkillSourceResultSchema });
