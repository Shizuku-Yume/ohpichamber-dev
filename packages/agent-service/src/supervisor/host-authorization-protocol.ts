import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ApprovalRequestSchema, CounterSchema, DisplayPathSchema, EntityIdSchema, MCPServerConfigSchema, RuntimeSessionSchema } from '@openchamber/agent-contract';
import { WorkerBootstrapSchema, WorkerPolicyRequestSchema, WorkerPolicyResultSchema } from '../protocol.ts';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
import { NativeOperationDescriptorSchema, HostActionRequestSchema, HostActionResultSchema, type HostActionRequest } from '../native-policy-protocol.ts';
export { NativeOperationDescriptorSchema, NativeLspActionSchema, NativePolicyContextSchema, HostActionRequestSchema, HostActionResultSchema, HostNativePolicySnapshotSchema } from '../native-policy-protocol.ts';
export type { NativeOperationDescriptor, NativeLspAction, NativePolicyContext, HostActionRequest, HostActionResult, HostNativePolicySnapshot } from '../native-policy-protocol.ts';
export const hostActionTimeoutMs = (request: HostActionRequest): number | undefined =>
  request.toolName === 'openchamber_secret' && request.action === 'secret.run' ? undefined : 120_000;
export const CapturedHostBootstrapScopeSchema = z.strictObject({
  rootSessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema, agentDirectoryId: EntityIdSchema.optional(),
});
export type CapturedHostBootstrapScope = z.infer<typeof CapturedHostBootstrapScopeSchema>;
export const HostAuthorizationScopeSchema = CapturedHostBootstrapScopeSchema.extend({ workerGeneration: EntityIdSchema });
export type HostAuthorizationScope = z.infer<typeof HostAuthorizationScopeSchema>;
export const HostSessionBootstrapSchema = WorkerBootstrapSchema.extend({ displayPath: DisplayPathSchema, deferred: z.boolean().optional() });
export const HostWorkspaceBootstrapSchema = z.strictObject({ projectId: EntityIdSchema, cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema, agentDirectoryId: EntityIdSchema, env: z.record(z.string(), z.string()).optional(), hostTools: z.record(z.string(), z.boolean()).optional() });
export const HostWorkspaceRegisteredSchema = z.strictObject({ workspaceId: EntityIdSchema, projectId: EntityIdSchema, agentDirectoryId: EntityIdSchema, authorizationRootId: EntityIdSchema, catalogRevision: CounterSchema });
export const HostSessionRelocationPrepareSchema = z.strictObject({
  transactionId: EntityIdSchema, sourceWorkspaceId: EntityIdSchema,
  destination: HostSessionBootstrapSchema.omit({ sessionFile: true, sessionsDirectory: true }),
});
export type HostSessionRelocationPrepare = z.infer<typeof HostSessionRelocationPrepareSchema>;
export const HostSessionRelocationPreparedSchema = z.strictObject({ transactionId: EntityIdSchema, session: RuntimeSessionSchema });
export const HostSessionRelocationFinalizeSchema = z.strictObject({ transactionId: EntityIdSchema, action: z.enum(['commit', 'rollback']) });
export const HostSessionRelocationFinalizedSchema = z.strictObject({ session: RuntimeSessionSchema });
export const HostSessionRelocationPendingSchema = z.strictObject({
  relocation: z.strictObject({
    transactionId: EntityIdSchema, sourceWorkspaceId: EntityIdSchema, destinationWorkspaceId: EntityIdSchema,
  }).nullable()
});
export const HostApprovalPolicyListRequestSchema = z.strictObject({
  sessionId: EntityIdSchema, workspaceId: EntityIdSchema, forkOf: EntityIdSchema.optional(), forkTicketId: EntityIdSchema.optional(),
});
export const HostSessionForkAckSchema = z.strictObject({
  sessionId: EntityIdSchema, rootSessionId: EntityIdSchema, sessionFile: z.string().min(1),
  sourceSessionId: EntityIdSchema, entryId: EntityIdSchema.nullable(), mode: z.enum(['selected', 'full']),
});
export const HostWorkerAuthorizationRequestSchema = z.strictObject({ type: z.literal('worker.authorization.request'), requestId: EntityIdSchema, scope: HostAuthorizationScopeSchema, request: WorkerPolicyRequestSchema, descriptor: NativeOperationDescriptorSchema.optional() });
/** How a session answers the native ACP execution-permission gate. */
export const PERMISSION_MODES = ['ask', 'safety', 'auto'] as const;
export const PermissionModeSchema = z.enum(PERMISSION_MODES);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;
/** Host push of the authoritative mode for one captured session. */
export const HostSessionPermissionModeSchema = z.strictObject({ mode: PermissionModeSchema });
/**
 * Service -> Host: may this `safety` request be accepted without the user?
 * The classifier and its credentials live on the Host, so the service can only
 * ask. `hold` and `unavailable` both leave the request on screen.
 */
export const HostPermissionEvaluateRequestSchema = z.strictObject({
  type: z.literal('permission.evaluate'), requestId: EntityIdSchema,
  sessionId: EntityIdSchema, approval: ApprovalRequestSchema,
});
export type HostPermissionEvaluateRequest = z.infer<typeof HostPermissionEvaluateRequestSchema>;
export const HostPermissionVerdictSchema = z.strictObject({
  type: z.literal('permission.verdict'), requestId: EntityIdSchema,
  verdict: z.enum(['accept', 'hold', 'unavailable']),
});
export type HostPermissionVerdict = z.infer<typeof HostPermissionVerdictSchema>;
/** Service -> Host: the mode this session's lineage resolves to right now. */
export const HostPermissionModeLoadRequestSchema = z.strictObject({
  type: z.literal('permission.mode.load'), requestId: EntityIdSchema, sessionId: EntityIdSchema,
  directory: z.string().min(1).optional(),
});
export type HostPermissionModeLoadRequest = z.infer<typeof HostPermissionModeLoadRequestSchema>;
export const HostPermissionModeReplySchema = z.strictObject({
  type: z.literal('permission.mode'), requestId: EntityIdSchema, mode: PermissionModeSchema,
});
export const HostWorkerAuthorizationReplySchema = z.strictObject({ type: z.literal('worker.authorization.result'), requestId: EntityIdSchema, result: WorkerPolicyResultSchema });
export const HostWorkerAuthorizationCancelSchema = z.strictObject({ type: z.literal('worker.authorization.cancel'), requestId: EntityIdSchema });
export const HostWorkerActionRequestSchema = z.strictObject({ type: z.literal('worker.action.request'), requestId: EntityIdSchema, scope: HostAuthorizationScopeSchema, request: HostActionRequestSchema });
export const HostWorkerActionReplySchema = z.strictObject({ type: z.literal('worker.action.result'), requestId: EntityIdSchema, result: HostActionResultSchema });
export const HostWorkerActionCancelSchema = z.strictObject({ type: z.literal('worker.action.cancel'), requestId: EntityIdSchema });
export const HostWorkspacePolicySchema = z.strictObject({ projectId: EntityIdSchema, workspaceId: EntityIdSchema, agentDirectoryId: EntityIdSchema, cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema, providers: z.array(z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema, endpoint: z.string().url().optional() })), mcpServers: z.array(MCPServerConfigSchema), fileTools: z.array(z.enum(['read', 'write'])), shellCommands: z.array(z.string().min(1)), agentIds: z.array(EntityIdSchema), providerEntry: z.boolean() });
export type HostWorkspacePolicy = z.infer<typeof HostWorkspacePolicySchema>;
export { WorkerBootstrapSchema, WorkerPolicyRequestSchema, WorkerPolicyResultSchema };
export type { WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';
export * from '../catalogs/private-credentials.ts';
export * from './file-resources-host-protocol.ts';
