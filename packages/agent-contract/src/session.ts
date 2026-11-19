import { z } from 'zod';
import { SubagentControlAckSchema, SubagentControlRequestSchema } from './requests.ts';
import { CounterSchema, EntityIdSchema, EpochSchema, PositiveCounterSchema, TimestampSchema } from './primitives.ts';
import { CapturedSendOptionsSchema, PromptAttachmentSchema, PromptRequestSchema } from './prompt.ts';
import { SessionMetadataSchema } from './metadata.ts';

export const DisplayPathSchema = z.string().min(1).refine(
  (value) => !value.startsWith('/') && !value.startsWith('\\') && !/^[A-Za-z]:/.test(value),
  { message: 'Display path must be project-relative, never a Host absolute path' },
);
export const WorkspaceSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  projectId: EntityIdSchema,
  name: z.string().min(1),
  displayPath: DisplayPathSchema.optional(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
export const DiscoveryErrorsSchema = z.record(EntityIdSchema, z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/));
export const WorkspaceListSchema = z.strictObject({
  items: z.array(WorkspaceSchema),
  errors: DiscoveryErrorsSchema,
});
export type WorkspaceList = z.infer<typeof WorkspaceListSchema>;
export const ProjectSchema = z.strictObject({
  projectId: EntityIdSchema, name: z.string(), workspaceIds: z.array(EntityIdSchema),
  displayPath: DisplayPathSchema.optional(),
});
export type Project = z.infer<typeof ProjectSchema>;
export const ProjectListSchema = z.strictObject({
  items: z.array(ProjectSchema),
  errors: DiscoveryErrorsSchema,
});
export type ProjectList = z.infer<typeof ProjectListSchema>;
export const AgentThinkingLevelSchema = z.enum(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto', 'off']);
export type AgentThinkingLevel = z.infer<typeof AgentThinkingLevelSchema>;

export const AgentSchema = z.strictObject({
  agentId: EntityIdSchema, name: z.string().min(1), description: z.string(),
  model: z.strictObject({ providerId: EntityIdSchema, modelId: EntityIdSchema }).nullable(),
  allowedTools: z.array(z.string().min(1)).nullable(),
  systemPromptOverride: z.string().optional(),
  thinkingLevel: AgentThinkingLevelSchema.optional(),
  spawns: z.union([z.array(z.string().min(1)), z.literal('*')]).optional(),
  blocking: z.boolean().optional(),
  advisor: z.union([z.boolean(), z.string().min(1)]).optional(),
});
export type Agent = z.infer<typeof AgentSchema>;
export const AgentCreateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agent: AgentSchema });
export type AgentCreateRequest = z.infer<typeof AgentCreateRequestSchema>;
export const AgentUpdateRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agent: AgentSchema });
export type AgentUpdateRequest = z.infer<typeof AgentUpdateRequestSchema>;
export const AgentDeleteRequestSchema = z.strictObject({ expectedRevision: CounterSchema, agentId: EntityIdSchema });
export type AgentDeleteRequest = z.infer<typeof AgentDeleteRequestSchema>;
export const AgentMutationResultSchema = z.strictObject({
  revision: PositiveCounterSchema, agentId: EntityIdSchema, agent: AgentSchema.nullable(),
}).refine((result) => result.agent === null || result.agent.agentId === result.agentId, {
  message: 'Agent mutation result must identify the affected profile', path: ['agentId'],
});
export type AgentMutationResult = z.infer<typeof AgentMutationResultSchema>;
export const SessionRuntimeStatusSchema = z.enum(['idle', 'running', 'awaiting_approval', 'awaiting_input', 'unavailable']);
export type SessionRuntimeStatus = z.infer<typeof SessionRuntimeStatusSchema>;
export const SessionModeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('main') }),
  z.strictObject({
    kind: z.literal('plan'), status: z.enum(['active', 'paused', 'armed']),
    planReference: z.string().regex(/^local:\/\/[^\s]+$/, 'Plan references must use local:// URLs'),
  }),
  z.strictObject({ kind: z.literal('vibe') }),
  z.strictObject({
    kind: z.literal('goal'), status: z.enum(['active', 'paused', 'budget-limited', 'complete']),
    objective: z.string().min(1), tokenBudget: z.number().int().positive().nullable(), tokensUsed: z.number().int().nonnegative(),
  }),
]);
export type SessionMode = z.infer<typeof SessionModeSchema>;
export const LoopStateSchema = z.strictObject({
  active: z.boolean(),
  iteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive().optional(),
  condition: z.string().optional(),
  prompt: z.string().optional(),
});
export type LoopState = z.infer<typeof LoopStateSchema>;
export const RuntimeSessionSchema = z.strictObject({
  sessionId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema, displayPath: DisplayPathSchema,
  parentSessionId: EntityIdSchema.optional(), rootSessionId: EntityIdSchema,
  createdAt: TimestampSchema, updatedAt: TimestampSchema, epoch: EpochSchema, headSequence: CounterSchema,
  runtimeStatus: SessionRuntimeStatusSchema, activeRunId: EntityIdSchema.nullable(),
  mode: SessionModeSchema,
  /** OMP's session title; absent until OMP names the session. */
  title: z.string().min(1).optional(),
  continuationPending: z.boolean().optional(),
  loop: LoopStateSchema.optional(),
}).refine((session) => (session.runtimeStatus === 'idle' || session.runtimeStatus === 'unavailable') === (session.activeRunId === null), {
  message: 'Runtime activity must identify its outer run', path: ['activeRunId'],
});
export type RuntimeSession = z.infer<typeof RuntimeSessionSchema>;
export const SessionSchema = RuntimeSessionSchema.safeExtend({
  archivedAt: TimestampSchema.optional(), metadata: SessionMetadataSchema.nullable(),
  metadataRevision: CounterSchema, archiveRevision: CounterSchema,
}).refine((session) => (session.metadata === null) === (session.metadataRevision === '0'), {
  message: 'Confirmed missing metadata has revision 0', path: ['metadataRevision'],
});
export type Session = z.infer<typeof SessionSchema>;
export const RunStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatusSchema>;
export const RunOriginSchema = z.enum(['host', 'plan', 'goal']);
export type RunOrigin = z.infer<typeof RunOriginSchema>;
export const RunSchema = z.strictObject({
  runId: EntityIdSchema, sessionId: EntityIdSchema,
  status: RunStatusSchema, origin: RunOriginSchema.default('host'), createdAt: TimestampSchema, finishedAt: TimestampSchema.optional(), error: z.string().optional(),
}).refine((run) => {
  const terminal = run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled';
  return terminal === (run.finishedAt !== undefined);
}, { message: 'Only outer terminal runs have a finish time', path: ['finishedAt'] });
export type Run = z.infer<typeof RunSchema>;
export const SubagentSchema = z.strictObject({
  subagentId: EntityIdSchema, parentSessionId: EntityIdSchema, childSessionId: EntityIdSchema,
  toolCallId: EntityIdSchema.optional(),
  role: z.string(), solutionSpace: z.string().optional(), status: z.enum(['idle', 'running', 'parked', 'completed', 'failed', 'cancelled']),
  activeTool: z.string().optional(),
  tokens: z.number().int().nonnegative().optional(),
  cost: z.number().nonnegative().optional(),
  /** Own-session spend, excluding everything the subagent's own children spent. */
  directCost: z.number().nonnegative().optional(),
  /** Own spend plus every descendant's, so a row answers "what did this line cost". */
  treeCost: z.number().nonnegative().optional(),
  turnCount: z.number().int().nonnegative().optional(),
  retryCountdown: z.number().nonnegative().optional(),
  depth: z.number().int().min(0).max(8).optional(),
  parentSubagentId: EntityIdSchema.optional(),
  description: z.string().optional(),
  task: z.string().optional(),
  lastIntent: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
  createdAt: TimestampSchema.optional(),
  updatedAt: TimestampSchema.optional(),
  /** True when the row was rebuilt from a persisted transcript rather than a live run. */
  persisted: z.boolean().optional(),
  sessionFile: z.string().optional(),
  outputPath: z.string().optional(),
  patchPath: z.string().optional(),
});
export type Subagent = z.infer<typeof SubagentSchema>;
export const SubagentListResponseSchema = z.strictObject({
  subagents: z.array(SubagentSchema),
});
export type SubagentListResponse = z.infer<typeof SubagentListResponseSchema>;
export const SubagentTranscriptEntrySchema = z.strictObject({
  entryId: EntityIdSchema,
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  createdAt: TimestampSchema,
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  toolCalls: z.array(z.string().min(1)),
});
export type SubagentTranscriptEntry = z.infer<typeof SubagentTranscriptEntrySchema>;
export const SubagentTranscriptResponseSchema = z.strictObject({
  subagentId: EntityIdSchema,
  sessionFile: z.string(),
  entries: z.array(SubagentTranscriptEntrySchema),
});
export type SubagentTranscriptResponse = z.infer<typeof SubagentTranscriptResponseSchema>;
export const SubagentTreeCostResponseSchema = z.strictObject({
  sessionId: EntityIdSchema,
  /** Direct (own-session) spend of every listed subagent. */
  directCost: z.number().nonnegative(),
  /** Direct spend rolled up over the whole subagent tree. */
  treeCost: z.number().nonnegative(),
});
export type SubagentTreeCostResponse = z.infer<typeof SubagentTreeCostResponseSchema>;
export const SessionRecapEntrySchema = z.strictObject({
  sessionId: EntityIdSchema,
  cwd: z.string(),
  recap: z.string().min(1),
  /** Epoch milliseconds, converted from the native index's UNIX seconds. */
  createdAt: TimestampSchema,
});
export type SessionRecapEntry = z.infer<typeof SessionRecapEntrySchema>;
export const SessionRecapListResponseSchema = z.strictObject({
  recaps: z.array(SessionRecapEntrySchema),
});
export type SessionRecapListResponse = z.infer<typeof SessionRecapListResponseSchema>;
export const SessionCreateRequestSchema = z.strictObject({
  projectId: EntityIdSchema, workspaceId: EntityIdSchema, options: CapturedSendOptionsSchema,
  title: z.string().trim().min(1).optional(),
  metadata: SessionMetadataSchema.optional(),
  parentSessionId: EntityIdSchema.optional(),
});
export type SessionCreateRequest = z.infer<typeof SessionCreateRequestSchema>;
export const SessionCreateAckSchema = z.strictObject({ session: SessionSchema });
export type SessionCreateAck = z.infer<typeof SessionCreateAckSchema>;
export const SessionTitleRequestSchema = z.strictObject({
  workspaceId: EntityIdSchema, title: z.string().trim().min(1),
});
export type SessionTitleRequest = z.infer<typeof SessionTitleRequestSchema>;
export const SessionDeleteRequestSchema = z.strictObject({
  sessionId: EntityIdSchema, force: z.boolean().optional(), purgeWorkspaceFiles: z.boolean().optional(),
});
export type SessionDeleteRequest = z.infer<typeof SessionDeleteRequestSchema>;
export const SessionDeleteAckSchema = z.strictObject({ sessionId: EntityIdSchema, deletedSessionIds: z.array(EntityIdSchema).min(1) })
  .refine((ack) => ack.deletedSessionIds.includes(ack.sessionId), { message: 'Deletion acknowledgement must include the requested session' });
export type SessionDeleteAck = z.infer<typeof SessionDeleteAckSchema>;
export const RunCreateRequestSchema = PromptRequestSchema;
export type RunCreateRequest = z.infer<typeof RunCreateRequestSchema>;
export const RunAbortRequestSchema = z.strictObject({ sessionId: EntityIdSchema, runId: EntityIdSchema });
export type RunAbortRequest = z.infer<typeof RunAbortRequestSchema>;
export const GoalControlRequestSchema = z.strictObject({
  type: z.literal('goal'), op: z.enum(['create', 'resume', 'pause', 'drop']), objective: z.string().trim().min(1).optional(), tokenBudget: z.number().int().positive().nullable().optional(),
  providerId: EntityIdSchema.optional(), modelId: EntityIdSchema.optional(), variant: z.string().nullable().optional(), reasoningEffort: z.string().nullable().optional(),
}).refine(request => request.op !== 'create' || request.objective !== undefined, {
  message: 'Goal creation requires an objective', path: ['objective'],
});
export type GoalControlRequest = z.infer<typeof GoalControlRequestSchema>;
export const SessionBranchStateSchema = z.strictObject({
  branchId: EntityIdSchema, branchVersion: CounterSchema, leafMessageId: EntityIdSchema.nullable(),
  revert: z.strictObject({ messageId: EntityIdSchema }).optional(),
});
export type SessionBranchState = z.infer<typeof SessionBranchStateSchema>;
export const SessionControlRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('abort'), runId: EntityIdSchema }),
  z.strictObject({ type: z.literal('mode.set'), mode: z.enum(['main', 'plan', 'vibe']) }),
  GoalControlRequestSchema,
  z.strictObject({ type: z.literal('compact'), instructions: z.string().optional() }),
  z.strictObject({ type: z.literal('command'), text: z.string().min(1) }),
  z.strictObject({ type: z.literal('btw.ask'), question: z.string().min(1), recordId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('btw.cancel'), recordId: EntityIdSchema.optional() }),
  z.strictObject({ type: z.literal('btw.branch'), recordId: EntityIdSchema }),
  ...SubagentControlRequestSchema.options,
  z.strictObject({ type: z.literal('loop.stop') }),
]);
export type SessionControlRequest = z.infer<typeof SessionControlRequestSchema>;
export const SessionControlAckSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('mode.set'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('goal'), mode: SessionModeSchema }),
  z.strictObject({ type: z.literal('compact'), compactionId: EntityIdSchema, tokensBefore: z.number().int().nonnegative(), completedAt: TimestampSchema }),
  z.strictObject({ type: z.literal('command'), output: z.string() }),
  z.strictObject({ type: z.literal('btw.ask'), recordId: EntityIdSchema }),
  z.strictObject({ type: z.literal('btw.cancel'), cancelled: z.boolean() }),
  z.strictObject({ type: z.literal('btw.branch'), sessionFile: z.string().optional(), sessionId: EntityIdSchema.optional(), rootSessionId: EntityIdSchema.optional(), branch: SessionBranchStateSchema }),
  ...SubagentControlAckSchema.options,
  z.strictObject({ type: z.literal('loop.stop'), stopped: z.boolean() }),
]);
export type SessionControlAck = z.infer<typeof SessionControlAckSchema>;
export const RunAbortAckSchema = z.strictObject({ run: RunSchema });
export type RunAbortAck = z.infer<typeof RunAbortAckSchema>;
export const SteerRequestSchema = z.strictObject({ sessionId: EntityIdSchema, request: PromptRequestSchema });
export type SteerRequest = z.infer<typeof SteerRequestSchema>;
export const SteerAckSchema = z.strictObject({ sessionId: EntityIdSchema, runId: EntityIdSchema, acceptedAt: TimestampSchema });
export type SteerAck = z.infer<typeof SteerAckSchema>;
export const FollowUpRequestSchema = z.strictObject({ sessionId: EntityIdSchema, request: PromptRequestSchema });
export type FollowUpRequest = z.infer<typeof FollowUpRequestSchema>;
export const FollowUpAckSchema = z.strictObject({ sessionId: EntityIdSchema, followUpId: EntityIdSchema, acceptedAt: TimestampSchema });
export type FollowUpAck = z.infer<typeof FollowUpAckSchema>;

const BranchOwnerSchema = z.strictObject({ branchId: EntityIdSchema, branchVersion: CounterSchema });
export const SessionBranchRequestSchema = z.discriminatedUnion('action', [
  BranchOwnerSchema.extend({ action: z.literal('revert'), messageId: EntityIdSchema }),
  BranchOwnerSchema.extend({ action: z.literal('restore') }),
]);
export type SessionBranchRequest = z.infer<typeof SessionBranchRequestSchema>;
export const SessionBranchResultSchema = z.strictObject({
  sessionId: EntityIdSchema,
  branch: SessionBranchStateSchema,
  draft: z.strictObject({ text: z.string(), attachments: z.array(PromptAttachmentSchema) }).nullable(),
});
export type SessionBranchResult = z.infer<typeof SessionBranchResultSchema>;
export const SessionRelocateRequestSchema = z.strictObject({ workspaceId: EntityIdSchema });
export type SessionRelocateRequest = z.infer<typeof SessionRelocateRequestSchema>;
export const SessionRelocateResultSchema = z.strictObject({ sessions: z.array(SessionSchema).min(1) });
export type SessionRelocateResult = z.infer<typeof SessionRelocateResultSchema>;

/**
 * git and the filesystem forbid control characters in a folder name, so one
 * worktree name is checked against them beside the separators and the
 * reserved symbols git rejects.
 */
const isWorktreeFolderName = (value: string): boolean => {
  if (value === '.' || value === '..') return false;
  if (/[\\/]/.test(value)) return false;
  // oxlint-disable-next-line no-control-regex -- git and the filesystem forbid control characters in a folder name
  return !/[\x00-\x1f<>:"|?*]/.test(value);
};
/** One relative folder name: never an absolute path, traversal or a separator. */
const WorktreeNameSchema = z.string().min(1).max(200).refine(isWorktreeFolderName, {
  message: 'Worktree name must be one folder name, relative to the worktree root',
});
/**
 * A file whose uncommitted changes move with the session. It names a path
 * inside the session's workspace, so it is relative and never absolute.
 */
const WorktreeCarryPathSchema = z.string().min(1).refine(
  (value) => !pathIsAbsolute(value) && !value.startsWith('..') && value.trim() === value,
  { message: 'Carried changes are workspace-relative file paths' },
);
const pathIsAbsolute = (value: string): boolean => value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value);
/**
 * A session moved into a new worktree of its repository. The Host names the
 * folder and, optionally, the branch it starts from; `carry` lists the files
 * whose uncommitted changes go along. A branch that already exists is taken
 * as it is, so it never combines with a branch name or a start ref.
 */
export const SessionMoveToWorktreeRequestSchema = z.strictObject({
  worktree: z.strictObject({
    name: WorktreeNameSchema,
    branchName: WorktreeNameSchema.optional(),
    startRef: z.string().min(1).optional(),
    existingBranch: z.string().min(1).optional(),
  }).refine(
    (worktree) => !(worktree.existingBranch && (worktree.branchName || worktree.startRef)),
    { message: 'existingBranch checks out that branch as it is; do not combine it with branchName or startRef' },
  ),
  /** Workspace-relative files whose uncommitted changes move with the session. */
  carry: z.array(WorktreeCarryPathSchema).default([]),
});
export type SessionMoveToWorktreeRequest = z.infer<typeof SessionMoveToWorktreeRequestSchema>;
export const SessionMoveToWorktreeResultSchema = z.strictObject({
  sessionId: EntityIdSchema,
  /** The folder the session now runs in, inside the new worktree. */
  directory: z.string().min(1),
  previousDirectory: z.string().min(1),
  worktree: z.strictObject({
    name: z.string().min(1),
    branch: z.string().min(1),
    path: z.string().min(1),
    startRef: z.string().min(1).optional(),
    existingBranch: z.string().min(1).optional(),
  }),
  changesMoved: z.boolean(),
  carried: z.array(z.string()),
  /** The relocated session family, when the Host answered with it. */
  sessions: z.array(SessionSchema).min(1).optional(),
  startDirectoryFallback: z.string().min(1).optional(),
  untrustedSetupCommandsSkipped: z.array(z.string()).optional(),
});
export type SessionMoveToWorktreeResult = z.infer<typeof SessionMoveToWorktreeResultSchema>;

export const TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'abandoned']);
export type TodoStatus = z.infer<typeof TodoStatusSchema>;
export const TodoItemSchema = z.strictObject({
  content: z.string(),
  status: TodoStatusSchema,
});
export type TodoItem = z.infer<typeof TodoItemSchema>;
export const TodoPhaseSchema = z.strictObject({
  name: z.string(),
  tasks: z.array(TodoItemSchema),
});
export type TodoPhase = z.infer<typeof TodoPhaseSchema>;
export const CompactionMethodSchema = z.enum(['soft-compacted', 'snap-compacted', 'shaken', 'remote-compacted', 'handed-off', 'compacted']);
export type CompactionMethod = z.infer<typeof CompactionMethodSchema>;
