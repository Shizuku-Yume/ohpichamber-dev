import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { runtimeFetch } from '../lib/runtime-fetch';
import type {
  AgentCatalog, AgentCreateRequest, AgentDeleteRequest, AgentMutationResult, AgentUpdateRequest,
  ApprovalReply, ApprovalRequest, CanonicalEvent, FollowUpRequest, HistoryPage, HistoryPageRequest,
  ModelCatalog, ModelConfigureRequest, ModelDeleteRequest, ProviderCatalog, ProviderConfigureRequest,
  ProviderCredentialDeleteRequest, ProviderCredentialMutationResult, ProviderCredentialWriteRequest, ProviderDeleteRequest,
  ProviderMutationResult, QuestionReply, QuestionRequest, RunAbortAck, RunCreateRequest, Session, SessionCreateAck,
  SessionCreateRequest, SessionDeleteAck, SessionMetadataPatch, SessionMetadataState, SessionSnapshot, ShellJob,
  ShellOutput, ShellSnapshot, ShellStartRequest, ShellStopRequest, SkillsApplyRequest, SkillsApplyResult,
  SkillsCatalogState, SkillExpandRequest, SkillExpandResult, CompletionRequest, CompletionResult, CompletionCancelRequest, CompletionCancelResult,
  MCPCatalogRead, MCPConfigureRequest, MCPApplyRequest, MCPApplyResult, MCPReconnectRequest, MCPOAuthRequest, MCPOAuthResult, SteerAck, SteerRequest, Workspace,
  WorkspaceList, ProjectList, QueueAppendRequest, QueueDeleteRequest, QueueReorderRequest, QueueState,
} from '@openchamber/agent-contract';

export class CanonicalApiError extends Error {
  readonly problem: C.ProblemDetails;
  constructor(problem: C.ProblemDetails) {
    super(problem.detail);
    this.name = 'CanonicalApiError';
    this.problem = problem;
  }
}

type SessionList = { items: Session[]; errors: Record<string, string> };
type RunCreateAck = { run: C.Run };
type CanonicalSessionScope = Pick<C.RuntimeSession, 'sessionId' | 'rootSessionId' | 'workspaceId' | 'projectId'>;
type CanonicalSkillsScope = CanonicalSessionScope & Pick<C.SkillsCatalogState, 'agentDirectoryId'>;
type ArchiveAck =
  | { archived: Array<{ id: string; archivedAt: number }>; failedIds: string[]; restored?: never }
  | { restored: Array<{ id: string; archivedAt: number | null }>; failedIds: string[]; archived?: never };

const id = (value: string): string => encodeURIComponent(value);
const query = (entries: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) params.set(key, String(value));
  const result = params.toString();
  return result ? `?${result}` : '';
};

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function request<T>(path: string, schema: { parse(value: unknown): T }, init: RequestInit = {}): Promise<T> {
  const response = await runtimeFetch(path, init);
  const payload = await readJson(response);
  if (!response.ok) {
    const problem = C.ProblemDetailsSchema.safeParse(payload);
    if (problem.success) throw new CanonicalApiError(problem.data);
    throw new CanonicalApiError(C.ProblemDetailsSchema.parse({
      type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Agent Service unavailable',
      status: response.status, detail: 'The canonical operation failed.', code: 'SERVICE_UNAVAILABLE', retryable: response.status >= 500,
    }));
  }
  return schema.parse(payload);
}

const scoped = <T>(schema: z.ZodType<T>, matches: (value: T) => boolean): z.ZodType<T> =>
  schema.refine(matches, 'Canonical response identity does not match the requested scope');

function bodyFor<T>(schema: z.ZodType<T>, input: T, matches: (value: T) => boolean = () => true): string {
  const body = schema.parse(input);
  if (!matches(body)) throw new Error('Canonical request identity does not match the route');
  return JSON.stringify(body);
}

const sameWorker = (worker: C.CatalogWorkerIdentity, session: CanonicalSessionScope): boolean =>
  worker.rootSessionId === session.rootSessionId && worker.workspaceId === session.workspaceId;

const sameJob = (actual: C.ShellJobIdentity, expected: C.ShellJobIdentity): boolean =>
  actual.sessionId === expected.sessionId && actual.jobId === expected.jobId
  && actual.epoch === expected.epoch && actual.workerGeneration === expected.workerGeneration;

const headersFor = (commandId?: string): HeadersInit => commandId ? { 'Idempotency-Key': commandId } : {};

export class CanonicalClient {
  resolveWorkspace(directory: string): Promise<Workspace> {
    return request('/api/agent/v1/workspaces/resolve', C.WorkspaceSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory }),
    });
  }

  uploadAttachment(workspaceId: string, metadata: Pick<C.Attachment, 'name' | 'mediaType' | 'size'>, data: string): Promise<C.Attachment> {
    return request('/api/agent/v1/attachments', C.AttachmentSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, metadata, data }),
    });
  }

  listProjects(): Promise<ProjectList> { return request('/api/agent/v1/projects', C.ProjectListSchema); }
  listWorkspaces(projectId?: string): Promise<WorkspaceList> {
    return request(`/api/agent/v1/workspaces${query({ projectId })}`, scoped(C.WorkspaceListSchema, result => projectId === undefined || result.items.every(workspace => workspace.projectId === projectId)));
  }
  listSessions(workspaceId?: string): Promise<SessionList> {
    const schema = z.strictObject({ items: z.array(C.SessionSchema), errors: C.DiscoveryErrorsSchema });
    return request(`/api/agent/v1/sessions${query({ workspaceId })}`, scoped(schema, result => workspaceId === undefined || result.items.every(session => session.workspaceId === workspaceId)));
  }
  getSession(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}`, scoped(C.SessionSnapshotSchema, result => result.session.sessionId === sessionId)); }
  getSnapshot(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}/snapshot`, scoped(C.SessionSnapshotSchema, result => result.session.sessionId === sessionId)); }
  getHistory(sessionId: string, options: Omit<HistoryPageRequest, 'sessionId'> = {}): Promise<HistoryPage> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/history${query(options)}`, scoped(C.HistoryPageSchema, result => result.sessionId === sessionId));
  }
  getSessionMetadata(sessionId: string): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, scoped(C.SessionMetadataStateSchema, result => result.sessionId === sessionId));
  }
  patchSessionMetadata(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, scoped(C.SessionMetadataStateSchema, result => result.sessionId === sessionId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SessionMetadataPatchSchema, patch),
    });
  }
  createSession(input: SessionCreateRequest, commandId?: string): Promise<SessionCreateAck> {
    const { projectId, workspaceId } = input;
    return request('/api/agent/v1/sessions', scoped(C.SessionCreateAckSchema, result => result.session.projectId === projectId && result.session.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.SessionCreateRequestSchema, input) });
  }
  deleteSession(sessionId: string): Promise<SessionDeleteAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}`, scoped(C.SessionDeleteAckSchema, result => result.sessionId === sessionId), { method: 'DELETE' });
  }
  archiveSessions(sessionIds: string[], archivedAt?: number | null): Promise<ArchiveAck> {
    return request('/api/openchamber/sessions/archive', scoped(z.strictObject({ archived: z.array(z.strictObject({ id: C.EntityIdSchema, archivedAt: z.number() })), failedIds: z.array(C.EntityIdSchema) }), result => [...result.archived.map(session => session.id), ...result.failedIds].every(sessionId => sessionIds.includes(sessionId))), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sessionIds, archivedAt: archivedAt ?? Date.now() }) });
  }
  unarchiveSessions(sessionIds: string[]): Promise<ArchiveAck> {
    return request('/api/openchamber/sessions/unarchive', scoped(z.strictObject({ restored: z.array(z.strictObject({ id: C.EntityIdSchema, archivedAt: z.nullable(z.number()) })), failedIds: z.array(C.EntityIdSchema) }), result => [...result.restored.map(session => session.id), ...result.failedIds].every(sessionId => sessionIds.includes(sessionId))), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sessionIds }) });
  }
  forkSession(scope: CanonicalSessionScope, input: { messageId?: string; entryId?: string; mode: 'selected' | 'full' }, commandId?: string): Promise<SessionCreateAck> {
    const { sessionId, workspaceId, projectId } = scope;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/fork`, scoped(C.SessionCreateAckSchema, result => result.session.projectId === projectId && result.session.workspaceId === workspaceId && result.session.sessionId !== sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  abortSession(sessionId: string, runId: string): Promise<RunAbortAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.RunAbortAckSchema, result => result.run.sessionId === sessionId && result.run.runId === runId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'abort', runId }) });
  }
  createRun(sessionId: string, input: RunCreateRequest, commandId?: string): Promise<RunCreateAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/runs`, scoped(z.strictObject({ run: C.RunSchema }), result => result.run.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.RunCreateRequestSchema, input) });
  }
  abortRun(sessionId: string, runId: string): Promise<RunAbortAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/runs/${id(runId)}/abort`, scoped(C.RunAbortAckSchema, result => result.run.sessionId === sessionId && result.run.runId === runId), { method: 'POST' });
  }
  steer(sessionId: string, requestBody: SteerRequest['request'], commandId?: string): Promise<SteerAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/steer`, scoped(C.SteerAckSchema, result => result.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.SteerRequestSchema, { sessionId, request: requestBody }) });
  }
  followUp(sessionId: string, requestBody: FollowUpRequest['request'], commandId?: string): Promise<C.FollowUpAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/follow-up`, scoped(C.FollowUpAckSchema, result => result.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.FollowUpRequestSchema, { sessionId, request: requestBody }) });
  }
  respondApproval(sessionId: string, approvalId: string, reply: ApprovalReply): Promise<ApprovalRequest> {
    const { epoch, workerGeneration } = reply;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/approvals/${id(approvalId)}/respond`, scoped(C.ApprovalRequestSchema, result => result.sessionId === sessionId && result.approvalId === approvalId && result.epoch === epoch && result.workerGeneration === workerGeneration), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ApprovalReplySchema, reply) });
  }
  respondQuestion(sessionId: string, questionId: string, reply: QuestionReply): Promise<QuestionRequest> {
    const { epoch, workerGeneration } = reply;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/questions/${id(questionId)}/respond`, scoped(C.QuestionRequestSchema, result => result.sessionId === sessionId && result.questionId === questionId && result.epoch === epoch && result.workerGeneration === workerGeneration), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.QuestionReplySchema, reply) });
  }

  getQueue(sessionId: string): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue`, scoped(C.QueueStateSchema, result => result.sessionId === sessionId)); }
  appendQueue(sessionId: string, input: QueueAppendRequest, commandId?: string): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue`, scoped(C.QueueStateSchema, result => result.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.QueueAppendRequestSchema, input) }); }
  reorderQueue(sessionId: string, input: QueueReorderRequest): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue/order`, scoped(C.QueueStateSchema, result => result.sessionId === sessionId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.QueueReorderRequestSchema, input) }); }
  deleteQueueItem(sessionId: string, queueItemId: string, input: QueueDeleteRequest): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue/${id(queueItemId)}`, scoped(C.QueueStateSchema, result => result.sessionId === sessionId), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.QueueDeleteRequestSchema, input, body => body.queueItemId === queueItemId) }); }

  getModels(workspaceId: string): Promise<ModelCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/models`, scoped(C.ModelCatalogSchema, result => result.workspaceId === workspaceId)); }
  getProviders(workspaceId: string): Promise<ProviderCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers`, scoped(C.ProviderCatalogSchema, result => result.workspaceId === workspaceId)); }
  getAgents(workspaceId: string): Promise<AgentCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, scoped(C.AgentCatalogSchema, result => result.workspaceId === workspaceId)); }
  createAgent(workspaceId: string, input: AgentCreateRequest): Promise<AgentMutationResult> {
    const agentId = input.agent.agentId;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, scoped(C.AgentMutationResultSchema, result => result.agentId === agentId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.AgentCreateRequestSchema, input) });
  }
  updateAgent(workspaceId: string, input: AgentUpdateRequest): Promise<AgentMutationResult> {
    const agentId = input.agent.agentId;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents/${id(agentId)}`, scoped(C.AgentMutationResultSchema, result => result.agentId === agentId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.AgentUpdateRequestSchema, input) });
  }
  deleteAgent(workspaceId: string, input: AgentDeleteRequest): Promise<AgentMutationResult> {
    const agentId = input.agentId;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents/${id(agentId)}`, scoped(C.AgentMutationResultSchema, result => result.agentId === agentId), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.AgentDeleteRequestSchema, input) });
  }
  configureProvider(workspaceId: string, providerId: string, input: ProviderConfigureRequest): Promise<ProviderMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/config`, scoped(C.ProviderMutationResultSchema, result => result.providerId === providerId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderConfigureRequestSchema, input, body => body.configuration.providerId === providerId) }); }
  deleteProvider(workspaceId: string, providerId: string, input: ProviderDeleteRequest): Promise<ProviderMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}`, scoped(C.ProviderMutationResultSchema, result => result.providerId === providerId), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderDeleteRequestSchema, input, body => body.providerId === providerId) }); }
  configureModel(workspaceId: string, providerId: string, modelId: string, input: ModelConfigureRequest): Promise<C.ModelMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/models/${id(modelId)}`, scoped(C.ModelMutationResultSchema, result => result.selection.providerId === providerId && result.selection.modelId === modelId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ModelConfigureRequestSchema, input, body => body.model.provider === providerId && body.model.modelId === modelId) }); }
  deleteModel(workspaceId: string, providerId: string, modelId: string, input: ModelDeleteRequest): Promise<C.ModelMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/models/${id(modelId)}`, scoped(C.ModelMutationResultSchema, result => result.selection.providerId === providerId && result.selection.modelId === modelId), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ModelDeleteRequestSchema, input, body => body.selection.providerId === providerId && body.selection.modelId === modelId) }); }
  writeProviderCredential(workspaceId: string, providerId: string, input: ProviderCredentialWriteRequest): Promise<ProviderCredentialMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/credential`, scoped(C.ProviderCredentialMutationResultSchema, result => result.providerId === providerId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderCredentialWriteRequestSchema, input, body => body.providerId === providerId) }); }
  deleteProviderCredential(workspaceId: string, providerId: string, input: ProviderCredentialDeleteRequest): Promise<ProviderCredentialMutationResult> {
    const credentialRef = input.credentialRef;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/credential/${id(credentialRef)}`, scoped(C.ProviderCredentialMutationResultSchema, result => result.providerId === providerId && (result.auth.status === 'missing' || result.auth.credentialRef !== credentialRef)), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderCredentialDeleteRequestSchema, input, body => body.providerId === providerId) });
  }
  getShellSnapshot(scope: { kind: 'session'; sessionId: string } | { kind: 'workspace'; workspaceId: string } | { kind: 'project'; projectId: string } | { kind: 'all' }): Promise<ShellSnapshot> {
    const path = scope.kind === 'session' ? `/api/agent/v1/sessions/${id(scope.sessionId)}/shell/jobs` : scope.kind === 'workspace' ? `/api/agent/v1/workspaces/${id(scope.workspaceId)}/shell/jobs` : scope.kind === 'project' ? `/api/agent/v1/projects/${id(scope.projectId)}/shell/jobs` : '/api/agent/v1/shell/jobs';
    return request(path, scoped(C.ShellSnapshotSchema, result => {
      if (scope.kind === 'all') return result.scope.kind === 'global';
      if (scope.kind === 'session') return result.scope.kind === 'session' && result.scope.sessionId === scope.sessionId && [...result.running, ...result.ended].every(job => job.sessionId === scope.sessionId);
      if (scope.kind === 'workspace') return result.scope.kind === 'workspace' && result.scope.workspaceId === scope.workspaceId;
      return result.scope.kind === 'project' && result.scope.projectId === scope.projectId;
    }));
  }
  startShell(sessionId: string, input: ShellStartRequest, commandId?: string): Promise<ShellJob> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs`, scoped(C.ShellJobSchema, result => result.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.ShellStartRequestSchema, input) });
  }
  getShellOutput(sessionId: string, job: { jobId: string; epoch: string; workerGeneration: string }, cursor: string, tailBytes: number): Promise<ShellOutput> {
    const expected = { ...job, sessionId };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(job.jobId)}/output${query({ epoch: job.epoch, workerGeneration: job.workerGeneration, cursor, tailBytes })}`, scoped(C.ShellOutputSchema, result => sameJob(result.job, expected) && result.requestedCursor === cursor));
  }
  stopShell(sessionId: string, job: ShellStopRequest): Promise<ShellJob> {
    const expected = { ...job.job };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(expected.jobId)}/stop`, scoped(C.ShellStopResultSchema, result => sameJob(result.job, expected)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ShellStopRequestSchema, job, body => body.job.sessionId === sessionId) }).then((result) => result.job);
  }
  getMcpCatalog(scope: CanonicalSessionScope): Promise<MCPCatalogRead> {
    const session = { ...scope };
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/mcp/catalog`, scoped(C.MCPCatalogReadSchema, result => sameWorker(result.workerCatalog.worker, session)));
  }
  configureMcp(scope: CanonicalSessionScope, input: MCPConfigureRequest): Promise<MCPApplyResult> {
    const { sessionId, workspaceId } = scope;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/config`, scoped(C.MCPApplyResultSchema, result => result.configuration.workspaceId === workspaceId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPConfigureRequestSchema, input) });
  }
  applyMcp(scope: CanonicalSessionScope, input: MCPApplyRequest): Promise<MCPApplyResult> {
    const { sessionId, workspaceId } = scope;
    const { persistedRevision } = input;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/apply`, scoped(C.MCPApplyResultSchema, result => result.configuration.workspaceId === workspaceId && result.configuration.persistedRevision === persistedRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPApplyRequestSchema, input) });
  }
  reconnectMcp(scope: CanonicalSessionScope, serverId: string, input: MCPReconnectRequest): Promise<MCPCatalogRead> {
    const session = { ...scope };
    const { persistedRevision, workerGeneration } = input;
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/mcp/servers/${id(serverId)}/reconnect`, scoped(C.MCPCatalogReadSchema, result => sameWorker(result.workerCatalog.worker, session) && result.workerCatalog.worker.workerGeneration === workerGeneration && result.configuration.persistedRevision === persistedRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPReconnectRequestSchema, input) });
  }
  getMcpOAuth(scope: CanonicalSessionScope, serverId: string): Promise<MCPOAuthResult> {
    const session = { ...scope };
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/mcp/servers/${id(serverId)}/oauth`, scoped(C.MCPOAuthResultSchema, result => result.serverId === serverId && sameWorker(result.worker, session)));
  }
  submitMcpOAuth(scope: CanonicalSessionScope, serverId: string, input: MCPOAuthRequest): Promise<MCPOAuthResult> {
    const session = { ...scope };
    const { persistedRevision, workerGeneration } = input;
    const flowId = input.action === 'complete' || input.action === 'cancel' ? input.flowId : undefined;
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/mcp/servers/${id(serverId)}/oauth`, scoped(C.MCPOAuthResultSchema, result => result.serverId === serverId && sameWorker(result.worker, session) && result.worker.workerGeneration === workerGeneration && result.persistedRevision === persistedRevision && (flowId === undefined || result.status !== 'pending' || result.pendingFlow.flowId === flowId)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPOAuthRequestSchema, input) });
  }
  getSkillsCatalog(scope: CanonicalSessionScope): Promise<SkillsCatalogState> {
    const session = { ...scope };
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/skills/catalog`, scoped(C.SkillsCatalogStateSchema, result => sameWorker(result.worker, session)));
  }
  applySkills(session: CanonicalSkillsScope, input: SkillsApplyRequest): Promise<SkillsApplyResult> {
    const { sessionId, workspaceId, agentDirectoryId } = session;
    const { sourceRevision, scope } = input;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/skills/apply`, scoped(C.SkillsApplyResultSchema, result => result.sourceRevision === sourceRevision && (scope === 'workspace'
      ? result.scope.kind === 'workspace' && result.scope.workspaceId === workspaceId
      : result.scope.kind === 'agent' && result.scope.agentDirectoryId === agentDirectoryId)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillsApplyRequestSchema, input) });
  }
  expandSkill(scope: CanonicalSessionScope, input: SkillExpandRequest): Promise<SkillExpandResult> {
    const session = { ...scope };
    const { workerGeneration, skillId, catalogRevision } = input;
    return request(`/api/agent/v1/sessions/${id(session.sessionId)}/skills/expand`, scoped(C.SkillExpandResultSchema, result => sameWorker(result.worker, session) && result.worker.workerGeneration === workerGeneration && result.skillId === skillId && result.catalogRevision === catalogRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillExpandRequestSchema, input) });
  }
  complete(workspaceId: string, input: CompletionRequest, commandId?: string): Promise<CompletionResult> {
    const { completionId } = input;
    const { providerId, modelId } = input.selection;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/completions`, scoped(C.CompletionResultSchema, result => result.completionId === completionId && result.selection.providerId === providerId && result.selection.modelId === modelId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.CompletionRequestSchema, input, body => body.workspaceId === workspaceId) });
  }
  cancelCompletion(workspaceId: string, completionId: string, input: CompletionCancelRequest = { completionId }): Promise<CompletionCancelResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/completions/${id(completionId)}/cancel`, scoped(C.CompletionCancelResultSchema, result => result.completionId === completionId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.CompletionCancelRequestSchema, input, body => body.completionId === completionId) });
  }

  subscribeSessionEvents(sessionId: string, cursor: string, onEvent: (event: CanonicalEvent) => void, onInvalidated: (event: C.StreamInvalidated) => void, onError: (error: unknown) => void): () => void {
    const controller = new AbortController();
    void (async () => {
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancel = () => { void reader?.cancel().catch(() => {}); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        response = await runtimeFetch(`/api/agent/v1/sessions/${id(sessionId)}/events`, { signal: controller.signal, headers: { Accept: 'text/event-stream', 'Last-Event-ID': cursor } });
        if (controller.signal.aborted) return;
        if (!response.ok || !response.body) {
          const payload = await readJson(response);
          const problem = C.ProblemDetailsSchema.safeParse(payload);
          if (problem.success) throw new CanonicalApiError(problem.data);
          throw new CanonicalApiError(C.ProblemDetailsSchema.parse({
            type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Agent event stream unavailable',
            status: response.status, detail: 'The canonical event stream failed.', code: 'SERVICE_UNAVAILABLE', retryable: response.status >= 500,
          }));
        }
        if (response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
          throw new Error('Canonical event stream has an invalid content type');
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        const schema = scoped(z.union([C.CanonicalEventSchema, C.StreamInvalidatedSchema]), event => event.sessionId === sessionId);
        const sessionEvent = (event: CanonicalEvent): boolean => {
          switch (event.type) {
            case 'session.updated': return event.session === undefined || event.session.sessionId === sessionId && event.session.epoch === event.epoch;
            case 'approval.requested': case 'approval.resolved': return event.approval.sessionId === sessionId && event.approval.epoch === event.epoch;
            case 'question.requested': case 'question.resolved': return event.question.sessionId === sessionId && event.question.epoch === event.epoch;
            case 'queue.updated': return event.queue.sessionId === sessionId;
            case 'shell.updated': return event.job.sessionId === sessionId && event.job.epoch === event.epoch;
            default: return true;
          }
        };
        let buffer = '';
        let afterCR = false;
        let eventName = '';
        let data: string[] = [];
        const line = (value: string): boolean => {
          if (value === '') {
            const name = eventName;
            const parts = data;
            eventName = ''; data = [];
            if (parts.length === 0) return false;
            const payload: unknown = JSON.parse(parts.join('\n'));
            const event = schema.parse(payload);
            if (event.type !== 'stream.invalidated' && !sessionEvent(event)) throw new Error('Canonical event entity does not match the subscribed session');
            if (name && name !== event.type) throw new Error('Canonical event name does not match its payload');
            if (event.type === 'stream.invalidated') { onInvalidated(event); return true; }
            onEvent(event);
            return false;
          }
          if (value.startsWith(':')) return false;
          const colon = value.indexOf(':');
          const field = colon < 0 ? value : value.slice(0, colon);
          const content = colon < 0 ? '' : value.slice(colon + 1).replace(/^ /, '');
          if (field === 'event') eventName = content;
          else if (field === 'data') data.push(content);
          return false;
        };
        while (!controller.signal.aborted) {
          const next = await reader.read();
          if (next.done) break;
          buffer += decoder.decode(next.value, { stream: true });
          let boundary;
          while (buffer.length > 0) {
            // CR ends a line immediately; a following LF (even in the next read) belongs to that same newline.
            if (afterCR) { if (buffer[0] === '\n') buffer = buffer.slice(1); afterCR = false; }
            boundary = buffer.search(/[\r\n]/);
            if (boundary < 0) break;
            const value = buffer.slice(0, boundary);
            afterCR = buffer[boundary] === '\r';
            buffer = buffer.slice(boundary + 1);
            if (line(value) || controller.signal.aborted) return;
          }
        }
        if (!controller.signal.aborted) throw new Error('Canonical event stream ended unexpectedly');
      } catch (error) {
        if (!controller.signal.aborted) onError(error);
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        if (reader) {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        } else {
          await response?.body?.cancel().catch(() => {});
        }
      }
    })();
    return () => controller.abort();
  }
}

export const canonicalClient = new CanonicalClient();
export type { SessionList, RunCreateAck, ArchiveAck, CanonicalSessionScope, CanonicalSkillsScope };
