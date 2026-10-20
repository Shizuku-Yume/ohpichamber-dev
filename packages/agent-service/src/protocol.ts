import { CapturedSendOptionsSchema, CounterSchema, EntityIdSchema, EpochSchema, FollowUpAckSchema, HistoryPageRequestSchema, HistoryPageSchema, JsonObjectSchema, JsonValueSchema, MCPConfigurationStateSchema, MCPServerConfigSchema, ProblemCodeSchema, PromptRequestSchema, RunSchema, SessionBranchRequestSchema, SessionBranchResultSchema, ShellStartRequestSchema, SkillSourceRevisionsSchema, SteerAckSchema } from '@openchamber/agent-contract';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ProjectionInputSchema, ProjectionSeedSchema } from './projection/protocol.ts';
import { CatalogOperationSchema, CatalogResultSchema } from './catalogs/protocol.ts';
import { McpOperationSchema, McpResultSchema } from './worker/mcp/protocol.ts';
import { ShellOperationSchema, ShellResultSchema } from './shell/protocol.ts';
import { CompletionOperationSchema, CompletionResultSchema } from './completion/protocol.ts';
import { UsageQuerySchema, UsageStatsSchema, UsageToolsResponseSchema } from '@openchamber/agent-contract';
import { NativePolicyContextSchema, HostActionRequestSchema, HostActionResultSchema, HostNativePolicySnapshotSchema } from './native-policy-protocol.ts';
import { WebSearchOperationSchema, WebSearchResultSchema } from './worker/websearch/protocol.ts';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
const AttachmentReferenceSchema = z.strictObject({ attachmentId: EntityIdSchema, path: PrivatePathSchema });
export const HostStreamingPromptRequestSchema = z.strictObject({ request: PromptRequestSchema, attachments: z.array(AttachmentReferenceSchema).optional() });
export const WorkerApprovalPolicySchema = z.strictObject({
  policyId: EntityIdSchema, revision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  scope: z.enum(['session', 'workspace']), decision: z.enum(['allow', 'deny']),
  target: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }),
});
export type WorkerApprovalPolicy = z.infer<typeof WorkerApprovalPolicySchema>;
export const WorkerBootstrapSchema = z.strictObject({
  rootSessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(), sessionFile: PrivatePathSchema.optional(),
  mcpConfigPath: PrivatePathSchema.optional(), options: CapturedSendOptionsSchema.optional(), env: z.record(z.string(), z.string()).optional(),
  agentDirectoryId: EntityIdSchema.optional(), observationEpoch: EpochSchema.optional(),
  catalogRevision: CounterSchema.optional(), mcpConfiguration: MCPConfigurationStateSchema.optional(),
  pluginRevision: CounterSchema.optional(),
  skillSources: SkillSourceRevisionsSchema.optional(),
});
export type WorkerBootstrap = z.infer<typeof WorkerBootstrapSchema>;
export const WorkerBootstrapMessageSchema = WorkerBootstrapSchema.omit({ env: true }).extend({
  type: z.literal('bootstrap'), workerGeneration: EntityIdSchema, approvalPolicies: z.array(WorkerApprovalPolicySchema).optional(),
});
export type WorkerBootstrapMessage = z.infer<typeof WorkerBootstrapMessageSchema>;

export const CompletionWorkerBootstrapSchema = z.strictObject({
  type: z.literal('completion.bootstrap'), workerGeneration: EntityIdSchema,
  authorizationRootId: EntityIdSchema,
  workspaceId: EntityIdSchema, projectId: EntityIdSchema, cwd: PrivatePathSchema,
  agentDirectory: PrivatePathSchema, agentDirectoryId: EntityIdSchema,
  catalogRevision: CounterSchema,
  mcpConfigPath: PrivatePathSchema.optional(),
});
export type CompletionWorkerBootstrap = z.infer<typeof CompletionWorkerBootstrapSchema>;

export const UsageWorkerBootstrapSchema = CompletionWorkerBootstrapSchema.extend({ type: z.literal('usage.bootstrap') });
export type UsageWorkerBootstrap = z.infer<typeof UsageWorkerBootstrapSchema>;
export const UsageSessionReferenceSchema = z.strictObject({
  sessionId: EntityIdSchema, rootSessionId: EntityIdSchema, workspaceId: EntityIdSchema, projectId: EntityIdSchema,
  sessionFile: PrivatePathSchema, cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(), parentSessionId: EntityIdSchema.optional(),
});
export type UsageSessionReference = z.infer<typeof UsageSessionReferenceSchema>;
export const UsageAuthorizationSchema = z.array(z.strictObject({ workspaceId: EntityIdSchema, projectId: EntityIdSchema }));

export const WorkerPolicyRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('provider-entry') }),
  z.strictObject({ type: z.literal('web-search') }),
  z.strictObject({ type: z.literal('mcp-server'), server: MCPServerConfigSchema }),
  z.strictObject({ type: z.literal('mcp-oauth'), server: MCPServerConfigSchema, configuration: JsonObjectSchema }),
  z.strictObject({ type: z.literal('shell'), request: ShellStartRequestSchema }),
  z.strictObject({ type: z.literal('tool'), toolName: z.string().min(1), input: JsonObjectSchema, agentId: EntityIdSchema.optional(), permissionPresetId: EntityIdSchema.optional(), approvalId: EntityIdSchema.optional(), toolCallId: EntityIdSchema.optional() }),
]);
export type WorkerPolicyRequest = z.infer<typeof WorkerPolicyRequestSchema>;
export const WorkerPolicyResultSchema = z.discriminatedUnion('allowed', [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({ allowed: z.literal(false), code: ProblemCodeSchema, status: z.number().int().min(400).max(599), approvalRequired: z.literal(true).optional() }),
]);
export type WorkerPolicyResult = z.infer<typeof WorkerPolicyResultSchema>;

export const WorkerOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), runId: EntityIdSchema, request: PromptRequestSchema, attachments: z.array(AttachmentReferenceSchema).optional() }),
  HostStreamingPromptRequestSchema.extend({ type: z.literal('steer') }),
  HostStreamingPromptRequestSchema.extend({ type: z.literal('follow-up') }),
  z.strictObject({ type: z.literal('abort'), runId: EntityIdSchema }),
  z.strictObject({ type: z.literal('approval.resolve'), approvalId: EntityIdSchema, decision: z.enum(['approve', 'reject']), policy: WorkerApprovalPolicySchema.optional() }),
  z.strictObject({ type: z.literal('question.resolve'), questionId: EntityIdSchema, action: z.enum(['answer', 'cancel']), response: JsonValueSchema.optional() }),
  z.strictObject({ type: z.literal('history'), request: HistoryPageRequestSchema }),
  z.strictObject({ type: z.literal('branch'), request: SessionBranchRequestSchema }),
  z.strictObject({ type: z.literal('delete') }),
  z.strictObject({ type: z.literal('catalog'), operation: CatalogOperationSchema, revision: CounterSchema }),
  z.strictObject({ type: z.literal('web-search'), operation: WebSearchOperationSchema }),
  z.strictObject({ type: z.literal('mcp'), operation: McpOperationSchema }),
  z.strictObject({ type: z.literal('shell'), operation: ShellOperationSchema }),
  z.strictObject({ type: z.literal('completion'), operation: CompletionOperationSchema }),
  z.strictObject({ type: z.literal('usage.stats'), query: UsageQuerySchema, references: z.array(UsageSessionReferenceSchema) }),
  z.strictObject({ type: z.literal('usage.tools'), query: UsageQuerySchema, references: z.array(UsageSessionReferenceSchema) }),
  z.strictObject({ type: z.literal('mcp.configuration.read') }),
]);
export type WorkerOperation = z.infer<typeof WorkerOperationSchema>;
const WorkerApprovalInteractionSchema = z.strictObject({
  kind: z.literal('approval'), approvalId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  actionType: z.enum(['bash_command', 'file_write', 'network_request', 'custom_tool']), commandSummary: z.string(),
  details: JsonObjectSchema, policyTarget: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }), turnId: EntityIdSchema,
});
const WorkerQuestionInteractionSchema = z.strictObject({
  kind: z.literal('question'), questionId: EntityIdSchema, turnId: EntityIdSchema, prompt: z.string(),
  schema: JsonObjectSchema,
});
export const WorkerInteractionSchema = z.discriminatedUnion('kind', [WorkerApprovalInteractionSchema, WorkerQuestionInteractionSchema]);
export type WorkerInteraction = z.infer<typeof WorkerInteractionSchema>;
const WorkerOperationResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), run: RunSchema }),
  z.strictObject({ type: z.literal('steer'), ack: SteerAckSchema }),
  z.strictObject({ type: z.literal('follow-up'), ack: FollowUpAckSchema }),
  z.strictObject({ type: z.literal('abort'), run: RunSchema }),
  z.strictObject({ type: z.literal('approval.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('question.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('history'), history: HistoryPageSchema }),
  z.strictObject({ type: z.literal('branch'), result: SessionBranchResultSchema, seed: ProjectionSeedSchema }),
  z.strictObject({ type: z.literal('delete'), deletedSessionIds: z.array(EntityIdSchema).min(1) }),
  z.strictObject({ type: z.literal('catalog'), result: CatalogResultSchema }),
  z.strictObject({ type: z.literal('web-search'), result: WebSearchResultSchema }),
  z.strictObject({ type: z.literal('mcp'), result: McpResultSchema }),
  z.strictObject({ type: z.literal('shell'), result: ShellResultSchema }),
  z.strictObject({ type: z.literal('completion'), result: CompletionResultSchema }),
  z.strictObject({ type: z.literal('usage.stats'), result: UsageStatsSchema }),
  z.strictObject({ type: z.literal('usage.tools'), result: UsageToolsResponseSchema }),
  z.strictObject({ type: z.literal('mcp.configuration'), configuration: MCPConfigurationStateSchema.nullable() }),
]);
export type WorkerOperationResult = z.infer<typeof WorkerOperationResultSchema>;
const WorkerOperationCommandSchema = z.strictObject({
  type: z.literal('operation'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, operation: WorkerOperationSchema,
});
export const WorkerCommandSchema = z.discriminatedUnion('type', [
  WorkerBootstrapMessageSchema,
  CompletionWorkerBootstrapSchema,
  UsageWorkerBootstrapSchema,
  z.strictObject({ type: z.literal('policy.result'), workerGeneration: EntityIdSchema, requestId: EntityIdSchema, result: WorkerPolicyResultSchema }),
  z.strictObject({ type: z.literal('action.result'), workerGeneration: EntityIdSchema, requestId: EntityIdSchema, result: HostActionResultSchema }),
  z.strictObject({ type: z.literal('stop'), workerGeneration: EntityIdSchema }),
  WorkerOperationCommandSchema,
]);
export const WorkerReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready'), workerGeneration: EntityIdSchema }),
  z.strictObject({ type: z.literal('error'), workerGeneration: EntityIdSchema, code: ProblemCodeSchema }),
  z.strictObject({ type: z.literal('operation.error'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, code: ProblemCodeSchema, status: z.number().int().min(400).max(599) }),
  z.strictObject({ type: z.literal('lifecycle'), workerGeneration: EntityIdSchema, state: z.enum(['initialized', 'closed']) }),
  z.strictObject({ type: z.literal('opened'), workerGeneration: EntityIdSchema, sessionFile: PrivatePathSchema, seed: ProjectionSeedSchema }),
  z.strictObject({ type: z.literal('subagent'), workerGeneration: EntityIdSchema, subagentId: EntityIdSchema, status: z.enum(['started', 'completed', 'failed', 'aborted']), role: z.string().min(1), solutionSpace: z.string().optional(), sessionFile: PrivatePathSchema.optional(), toolCallId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('events'), workerGeneration: EntityIdSchema, inputs: z.array(ProjectionInputSchema) }),
  z.strictObject({ type: z.literal('interaction'), workerGeneration: EntityIdSchema, request: WorkerInteractionSchema }),
  z.strictObject({ type: z.literal('policy.snapshot'), workerGeneration: EntityIdSchema, snapshot: HostNativePolicySnapshotSchema }),
  z.strictObject({ type: z.literal('policy.request'), workerGeneration: EntityIdSchema, requestId: EntityIdSchema, request: WorkerPolicyRequestSchema, nativeContext: NativePolicyContextSchema.optional() }),
  z.strictObject({ type: z.literal('action.request'), workerGeneration: EntityIdSchema, requestId: EntityIdSchema, request: HostActionRequestSchema }),
  z.strictObject({ type: z.literal('action.cancel'), workerGeneration: EntityIdSchema, requestId: EntityIdSchema }),
  z.strictObject({ type: z.literal('result'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, result: WorkerOperationResultSchema }),
]);
export type WorkerReply = z.infer<typeof WorkerReplySchema>;
const WorkerInfoSchema = z.strictObject({
  rootSessionId: EntityIdSchema, workerGeneration: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  state: z.enum(['starting', 'ready', 'stopping', 'stopped', 'crashed']),
});
export type WorkerInfo = z.infer<typeof WorkerInfoSchema>;
