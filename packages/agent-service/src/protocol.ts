import { CacheWarmingModeSchema, CapturedSendOptionsSchema, CounterSchema, EntityIdSchema, EpochSchema, FollowUpAckSchema, HistoryPageRequestSchema, HistoryPageSchema, JsonObjectSchema, JsonValueSchema, MCPConfigurationStateSchema, MCPServerConfigSchema, ProblemCodeSchema, PromptRequestSchema, RunSchema, SessionBranchRequestSchema, SessionBranchResultSchema, SessionBranchStateSchema, SessionModeSchema, SessionToolsCatalogSchema, ShellStartRequestSchema, SkillSourceRevisionsSchema, SteerAckSchema, TimestampSchema, type JsonValue } from '@openchamber/agent-contract';
import { GoalControlRequestSchema } from '@openchamber/agent-contract';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ProjectionInputSchema, ProjectionSeedSchema } from './projection/protocol.ts';
import { CatalogOperationSchema, CatalogResultSchema } from './catalogs/protocol.ts';
import { McpOperationSchema, McpResultSchema } from './worker/mcp/protocol.ts';
import { ShellOperationSchema, ShellResultSchema } from './shell/protocol.ts';
import { CompletionOperationSchema, CompletionResultSchema } from './completion/protocol.ts';
import { UsageAccountsSchema, UsageQuerySchema, UsageStatsSchema, UsageToolsResponseSchema } from '@openchamber/agent-contract';
import { SubagentSchema, SubagentTranscriptResponseSchema, SubagentTreeCostResponseSchema } from '@openchamber/agent-contract';
import { NativePolicyContextSchema, HostActionRequestSchema, HostActionResultSchema, HostNativePolicySnapshotSchema } from './native-policy-protocol.ts';
import { WebSearchOperationSchema, WebSearchResultSchema } from './worker/websearch/protocol.ts';

const PrivatePathSchema = z.string().min(1).refine(isAbsolute);
const AttachmentReferenceSchema = z.strictObject({ attachmentId: EntityIdSchema, path: PrivatePathSchema });
export const HostStreamingPromptRequestSchema = z.strictObject({ request: PromptRequestSchema, attachments: z.array(AttachmentReferenceSchema).optional() });
const WorkerApprovalPolicySchema = z.strictObject({
  policyId: EntityIdSchema, revision: z.string().regex(/^(0|[1-9][0-9]*)$/),
  scope: z.enum(['session', 'workspace']), decision: z.enum(['allow', 'deny']),
  target: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }),
});
export type WorkerApprovalPolicy = z.infer<typeof WorkerApprovalPolicySchema>;
export const WorkerBootstrapSchema = z.strictObject({
  rootSessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
  parentSessionId: EntityIdSchema.optional(),
  cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(), sessionFile: PrivatePathSchema.optional(),
  mcpConfigPath: PrivatePathSchema.optional(), options: CapturedSendOptionsSchema.optional(), env: z.record(z.string(), z.string()).optional(),
  agentDirectoryId: EntityIdSchema.optional(), observationEpoch: EpochSchema.optional(),
  catalogRevision: CounterSchema.optional(), mcpConfiguration: MCPConfigurationStateSchema.optional(),
  pluginRevision: CounterSchema.optional(),
  skillSources: SkillSourceRevisionsSchema.optional(),
  hostTools: z.record(z.string(), z.boolean()).optional(),
  sessionWarmingMode: CacheWarmingModeSchema.nullable().optional(),
});
export type WorkerBootstrap = z.infer<typeof WorkerBootstrapSchema>;
export const WorkerBootstrapMessageSchema = WorkerBootstrapSchema.omit({ env: true }).extend({
  retiredSessionIds: z.array(EntityIdSchema).optional(),
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
  hostTools: z.record(z.string(), z.boolean()).optional(),
});
export type CompletionWorkerBootstrap = z.infer<typeof CompletionWorkerBootstrapSchema>;

export const UsageWorkerBootstrapSchema = CompletionWorkerBootstrapSchema.extend({ type: z.literal('usage.bootstrap') });
export type UsageWorkerBootstrap = z.infer<typeof UsageWorkerBootstrapSchema>;
const UsageSessionReferenceSchema = z.strictObject({
  sessionId: EntityIdSchema, rootSessionId: EntityIdSchema, workspaceId: EntityIdSchema, projectId: EntityIdSchema,
  sessionFile: PrivatePathSchema, cwd: PrivatePathSchema, agentDirectory: PrivatePathSchema,
  sessionsDirectory: PrivatePathSchema.optional(), parentSessionId: EntityIdSchema.optional(),
});
export type UsageSessionReference = z.infer<typeof UsageSessionReferenceSchema>;
/** One authorized transcript: its session identity, and whether it is a root session or a subagent's. */
const UsageScopeFileSchema = z.strictObject({ file: PrivatePathSchema, sessionId: EntityIdSchema, role: z.enum(['root', 'subagent']) });
export type UsageScopeFile = z.infer<typeof UsageScopeFileSchema>;
export const UsageAuthorizationSchema = z.array(z.strictObject({ workspaceId: EntityIdSchema, projectId: EntityIdSchema }));

/** `proposed` marks a value the authorized operation itself introduces. The authorizer then
 * validates that candidate against the invariants the post-operation state must satisfy
 * instead of demanding it already appear in the pre-operation policy snapshot. */
export const WorkerPolicyRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('provider-entry') }),
  z.strictObject({ type: z.literal('web-search') }),
  z.strictObject({ type: z.literal('mcp-server'), server: MCPServerConfigSchema, proposed: z.literal(true).optional() }),
  z.strictObject({ type: z.literal('mcp-oauth'), server: MCPServerConfigSchema, configuration: JsonObjectSchema, proposed: z.literal(true).optional() }),
  z.strictObject({ type: z.literal('shell'), request: ShellStartRequestSchema }),
  z.strictObject({ type: z.literal('tool'), toolName: z.string().min(1), input: JsonObjectSchema, agentId: EntityIdSchema.optional(), approvalId: EntityIdSchema.optional(), toolCallId: EntityIdSchema.optional(), proposed: z.literal(true).optional() }),
]);
export type WorkerPolicyRequest = z.infer<typeof WorkerPolicyRequestSchema>;
export const WorkerPolicyResultSchema = z.discriminatedUnion('allowed', [
  z.strictObject({ allowed: z.literal(true) }),
  z.strictObject({ allowed: z.literal(false), code: ProblemCodeSchema, status: z.number().int().min(400).max(599), detail: z.string().min(1).max(300), approvalRequired: z.literal(true).optional() }),
]);
export type WorkerPolicyResult = z.infer<typeof WorkerPolicyResultSchema>;

export const WorkerOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), runId: EntityIdSchema, request: PromptRequestSchema, attachments: z.array(AttachmentReferenceSchema).optional() }),
  HostStreamingPromptRequestSchema.extend({ type: z.literal('steer') }),
  HostStreamingPromptRequestSchema.extend({ type: z.literal('follow-up') }),
  z.strictObject({ type: z.literal('btw.ask'), question: z.string().min(1), recordId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('btw.cancel'), recordId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('btw.branch'), recordId: EntityIdSchema }),
  z.strictObject({ type: z.literal('subagent.steer'), subagentId: EntityIdSchema, message: z.string().min(1) }),
  z.strictObject({ type: z.literal('subagent.cancel'), subagentId: EntityIdSchema }),
  z.strictObject({ type: z.literal('subagent.revive'), subagentId: EntityIdSchema, message: z.string().min(1).optional() }),
  z.strictObject({ type: z.literal('subagents.list') }),
  z.strictObject({ type: z.literal('subagents.transcript'), subagentId: EntityIdSchema }),
  z.strictObject({ type: z.literal('subagents.tree-cost') }),
  z.strictObject({ type: z.literal('loop.stop') }),
  z.strictObject({ type: z.literal('mode.set'), mode: z.enum(['main', 'plan', 'vibe']) }),
  z.strictObject({ type: z.literal('session.rename'), title: z.string().trim().min(1) }),
  GoalControlRequestSchema,
  z.strictObject({ type: z.literal('abort'), runId: EntityIdSchema }),
  z.strictObject({ type: z.literal('compact'), instructions: z.string().optional() }),
  z.strictObject({ type: z.literal('compact.abort') }),
  z.strictObject({ type: z.literal('command'), text: z.string().min(1) }),
  z.strictObject({ type: z.literal('approval.resolve'), approvalId: EntityIdSchema, decision: z.enum(['approve', 'approve-always', 'reject']), policy: WorkerApprovalPolicySchema.optional() }),
  z.strictObject({ type: z.literal('question.resolve'), questionId: EntityIdSchema, action: z.enum(['answer', 'cancel', 'update', 'timeout']), response: JsonValueSchema.optional() }),
  z.strictObject({ type: z.literal('history'), request: HistoryPageRequestSchema }),
  z.strictObject({ type: z.literal('branch'), request: SessionBranchRequestSchema }),
  z.strictObject({ type: z.literal('delete.prepare') }),
  z.strictObject({ type: z.literal('catalog'), operation: CatalogOperationSchema, revision: CounterSchema }),
  z.strictObject({ type: z.literal('web-search'), operation: WebSearchOperationSchema }),
  z.strictObject({ type: z.literal('mcp'), operation: McpOperationSchema }),
  z.strictObject({ type: z.literal('shell'), operation: ShellOperationSchema }),
  z.strictObject({ type: z.literal('completion'), operation: CompletionOperationSchema }),
  z.strictObject({ type: z.literal('usage.stats'), query: UsageQuerySchema, sessionFiles: z.array(UsageScopeFileSchema).optional() }),
  z.strictObject({ type: z.literal('usage.tools'), query: UsageQuerySchema, references: z.array(UsageSessionReferenceSchema) }),
  z.strictObject({ type: z.literal('usage.accounts'), query: UsageQuerySchema }),
  z.strictObject({ type: z.literal('mcp.configuration.read') }),
  z.strictObject({ type: z.literal('host-tools.toggle'), toolName: z.string().min(1), enabled: z.boolean() }),
  z.strictObject({ type: z.literal('host-tools.configure'), tools: z.record(z.string(), z.boolean()) }),
  z.strictObject({ type: z.literal('tools.catalog') }),
]);
export type WorkerOperation = z.infer<typeof WorkerOperationSchema> | { type: 'question.resolve'; questionId: string; action: 'answer' | 'cancel' | 'update' | 'timeout'; response?: JsonValue };
const WorkerApprovalInteractionSchema = z.strictObject({
  kind: z.literal('approval'), approvalId: EntityIdSchema, toolCallId: EntityIdSchema, toolName: z.string().min(1),
  actionType: z.enum(['bash_command', 'file_write', 'network_request', 'custom_tool']), commandSummary: z.string(),
  details: JsonObjectSchema, policyTarget: z.strictObject({ toolName: z.string().min(1), pattern: z.string() }), turnId: EntityIdSchema,
  sessionRuleKey: z.string().min(1).optional(), nativeGrant: z.literal(true).optional(),
  /**
   * A tool execution approval: the ACP permission gate and the native approval
   * extension's tool requests. The only approval a session mode may answer.
   */
  permissionRequest: z.literal(true).optional(),
});
const WorkerQuestionInteractionSchema = z.strictObject({
  kind: z.literal('question'), questionId: EntityIdSchema, turnId: EntityIdSchema, prompt: z.string(),
  schema: JsonObjectSchema, timeout: z.number().int().positive().optional(),
});
const WorkerCancelInteractionSchema = z.strictObject({
  kind: z.literal('cancel'), approvalId: EntityIdSchema.optional(), questionId: EntityIdSchema.optional(),
}).refine(value => (value.approvalId === undefined) !== (value.questionId === undefined));
const WorkerInteractionSchema = z.discriminatedUnion('kind', [WorkerApprovalInteractionSchema, WorkerQuestionInteractionSchema, WorkerCancelInteractionSchema]);
export type WorkerInteraction = z.infer<typeof WorkerInteractionSchema>;
const WorkerOperationResultSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('prompt'), run: RunSchema }),
  z.strictObject({ type: z.literal('steer'), ack: SteerAckSchema }),
  z.strictObject({ type: z.literal('follow-up'), ack: FollowUpAckSchema }),
  z.strictObject({ type: z.literal('abort'), run: RunSchema }),
  z.strictObject({ type: z.literal('compact'), compactionId: EntityIdSchema, tokensBefore: z.number().int().nonnegative(), completedAt: TimestampSchema }),
  z.strictObject({ type: z.literal('compact.abort'), aborted: z.boolean() }),
  z.strictObject({ type: z.literal('command'), output: z.string() }),
  z.strictObject({ type: z.literal('mode.set'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('session.rename'), title: z.string().min(1) }),
  z.strictObject({ type: z.literal('goal'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('btw.ask'), recordId: EntityIdSchema }),
  z.strictObject({ type: z.literal('btw.cancel'), cancelled: z.boolean() }),
  z.strictObject({ type: z.literal('btw.branch'), sessionFile: z.string().optional(), sessionId: EntityIdSchema.optional(), rootSessionId: EntityIdSchema.optional(), branch: SessionBranchStateSchema, seed: ProjectionSeedSchema.optional() }),
  z.strictObject({ type: z.literal('subagent.steer'), subagentId: EntityIdSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('subagent.cancel'), subagentId: EntityIdSchema, cancelled: z.boolean() }),
  z.strictObject({ type: z.literal('subagent.revive'), subagentId: EntityIdSchema, revived: z.boolean(), prompted: z.boolean() }),
  z.strictObject({ type: z.literal('subagents.list'), subagents: z.array(SubagentSchema) }),
  z.strictObject({ type: z.literal('subagents.transcript'), transcript: SubagentTranscriptResponseSchema }),
  z.strictObject({ type: z.literal('subagents.tree-cost'), cost: SubagentTreeCostResponseSchema }),
  z.strictObject({ type: z.literal('loop.stop'), stopped: z.boolean() }),
  z.strictObject({ type: z.literal('approval.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('question.resolve'), resolved: z.literal(true) }),
  z.strictObject({ type: z.literal('history'), history: HistoryPageSchema }),
  z.strictObject({ type: z.literal('branch'), result: SessionBranchResultSchema, seed: ProjectionSeedSchema }),
  z.strictObject({ type: z.literal('delete.prepare'), sessionFile: PrivatePathSchema }),
  z.strictObject({ type: z.literal('catalog'), result: CatalogResultSchema }),
  z.strictObject({ type: z.literal('web-search'), result: WebSearchResultSchema }),
  z.strictObject({ type: z.literal('mcp'), result: McpResultSchema }),
  z.strictObject({ type: z.literal('shell'), result: ShellResultSchema }),
  z.strictObject({ type: z.literal('completion'), result: CompletionResultSchema }),
  z.strictObject({ type: z.literal('usage.stats'), result: UsageStatsSchema }),
  z.strictObject({ type: z.literal('usage.accounts'), result: z.strictObject({ accounts: UsageAccountsSchema, errors: z.record(z.string().min(1), z.string()) }) }),
  z.strictObject({ type: z.literal('usage.tools'), result: UsageToolsResponseSchema }),
  z.strictObject({ type: z.literal('mcp.configuration'), configuration: MCPConfigurationStateSchema.nullable() }),
  z.strictObject({ type: z.literal('host-tools.toggle'), enabled: z.boolean() }),
  z.strictObject({ type: z.literal('host-tools.configure'), configured: z.literal(true) }),
  z.strictObject({ type: z.literal('tools.catalog'), catalog: SessionToolsCatalogSchema }),
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
/**
 * How much of a failure cause the wire carries. Most operations carry a short
 * sentence, but an OAuth failure is the provider's own diagnostic — a rejected
 * dynamic client registration names the endpoint, the HTTP status and the
 * `oauth.clientId` remedy — and a 200-character cut removes exactly the part the
 * sign-in panel shows. The bound lives beside the schema that enforces it, and
 * the sender truncates with the same function, so the two cannot disagree about
 * what fits.
 */
const DefaultOperationErrorDetailLimit = 200;
const McpOAuthOperationErrorDetailLimit = 1_000;
export function operationErrorDetail(code: string, detail: string): string {
  return detail.slice(0, code.startsWith('MCP_OAUTH_') ? McpOAuthOperationErrorDetailLimit : DefaultOperationErrorDetailLimit);
}

export const WorkerReplySchema = z.discriminatedUnion('type', [
  // A pre-warmed worker reports that its module graph is loaded and it is
  // waiting for a bootstrap. Only then is adopting it faster than spawning.
  z.strictObject({ type: z.literal('idle') }),
  // A spare that finished its background warm-up. Adoption still ranks by
  // `idle`; this only lets the supervisor prefer a spare with nothing left to pay.
  z.strictObject({ type: z.literal('warm') }),
  z.strictObject({ type: z.literal('ready'), workerGeneration: EntityIdSchema }),
  z.strictObject({ type: z.literal('error'), workerGeneration: EntityIdSchema, code: ProblemCodeSchema, status: z.number().int().min(400).max(599).optional(), detail: z.string().min(1).max(200).optional() }),
  z.strictObject({
    type: z.literal('operation.error'), workerGeneration: EntityIdSchema, commandId: EntityIdSchema, code: ProblemCodeSchema,
    status: z.number().int().min(400).max(599), detail: z.string().min(1).max(McpOAuthOperationErrorDetailLimit),
  }).refine(reply => reply.detail.length <= (reply.code.startsWith('MCP_OAUTH_') ? McpOAuthOperationErrorDetailLimit : DefaultOperationErrorDetailLimit), {
    path: ['detail'], message: 'Operation error detail exceeds the limit for its code',
  }),
  z.strictObject({ type: z.literal('lifecycle'), workerGeneration: EntityIdSchema, state: z.enum(['initialized', 'closed']) }),
  z.strictObject({ type: z.literal('opened'), workerGeneration: EntityIdSchema, sessionFile: PrivatePathSchema, seed: ProjectionSeedSchema }),
  z.strictObject({ type: z.literal('subagent'), workerGeneration: EntityIdSchema, subagentId: EntityIdSchema, status: z.enum(['started', 'completed', 'failed', 'aborted']), role: z.string().min(1), description: z.string().optional(), solutionSpace: z.string().optional(), sessionFile: PrivatePathSchema.optional(), toolCallId: EntityIdSchema.optional() }),
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
