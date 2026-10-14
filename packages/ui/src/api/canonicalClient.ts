import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { runtimeFetch } from '../lib/runtime-fetch';
import type {
  AgentCatalog, AgentCreateRequest, AgentDeleteRequest, AgentMutationResult, AgentUpdateRequest,
  ApprovalReply, ApprovalRequest, CanonicalEvent, FollowUpAck, FollowUpRequest, HistoryPage, HistoryPageRequest,
  ModelCatalog, ModelConfigureRequest, ModelDeleteRequest, ProviderCatalog, ProviderConfigureRequest,
  ProviderCredentialDeleteRequest, ProviderCredentialMutationResult, ProviderCredentialWriteRequest, ProviderDeleteRequest,
  ProviderMutationResult, QuestionReply, QuestionRequest, RunAbortAck, RunCreateRequest, Session, SessionCreateAck,
  SessionCreateRequest, SessionDeleteAck, SessionMetadataPatch, SessionMetadataState, SessionSnapshot, SessionBranchRequest, SessionBranchResult, SessionRelocateResult, ShellJob,
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
    return request(`/api/agent/v1/workspaces${query({ projectId })}`, C.WorkspaceListSchema);
  }
  listSessions(workspaceId?: string): Promise<SessionList> {
    const schema = z.strictObject({ items: z.array(C.SessionSchema), errors: C.DiscoveryErrorsSchema });
    return request(`/api/agent/v1/sessions${query({ workspaceId })}`, schema);
  }
  getSession(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}`, C.SessionSnapshotSchema); }
  getSnapshot(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}/snapshot`, C.SessionSnapshotSchema); }
  getHistory(sessionId: string, options: Omit<HistoryPageRequest, 'sessionId'> = {}): Promise<HistoryPage> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/history${query(options)}`, C.HistoryPageSchema);
  }
  getSessionMetadata(sessionId: string): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, C.SessionMetadataStateSchema);
  }
  patchSessionMetadata(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, C.SessionMetadataStateSchema, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
    });
  }
  selectSessionBranch(sessionId: string, input: SessionBranchRequest): Promise<SessionBranchResult> {
    const parsed = C.SessionBranchRequestSchema.parse(input);
    return request(`/api/agent/v1/sessions/${id(sessionId)}/branch`, C.SessionBranchResultSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed),
    }).then((result) => {
      if (result.sessionId !== sessionId || result.branch.branchId !== parsed.branchId || BigInt(result.branch.branchVersion) <= BigInt(parsed.branchVersion)
          || (parsed.action === 'revert' ? result.branch.revert?.messageId !== parsed.messageId : result.branch.revert !== undefined))
        throw new Error('Branch response does not match the requested branch owner and selection');
      return result;
    });
  }
  relocateSession(sessionId: string, workspaceId: string): Promise<SessionRelocateResult> {
    const input = C.SessionRelocateRequestSchema.parse({ workspaceId });
    return request(`/api/agent/v1/sessions/${id(sessionId)}/relocate`, C.SessionRelocateResultSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    }).then((result) => {
      const requested = result.sessions.find((session) => session.sessionId === sessionId);
      const root = requested && result.sessions.find((session) => session.sessionId === requested.rootSessionId && session.rootSessionId === requested.rootSessionId);
      const ids = new Set(result.sessions.map((session) => session.sessionId));
      if (!requested || !root || ids.size !== result.sessions.length || result.sessions.some((session) => session.workspaceId !== workspaceId || session.projectId !== root.projectId || session.rootSessionId !== root.rootSessionId))
        throw new Error('Relocation response does not match the requested destination session family');
      return result;
    });
  }
  createSession(input: SessionCreateRequest, commandId?: string): Promise<SessionCreateAck> {
    return request('/api/agent/v1/sessions', C.SessionCreateAckSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  deleteSession(sessionId: string, options: { force?: boolean; purgeWorkspaceFiles?: boolean; commandId?: string } = {}): Promise<SessionDeleteAck> {
    const { commandId, ...body } = options;
    return request(`/api/agent/v1/sessions/${id(sessionId)}`, C.SessionDeleteAckSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify({ sessionId, ...body }) });
  }
  archiveSessions(sessionIds: string[], archivedAt?: number | null): Promise<ArchiveAck> {
    return request('/api/openchamber/sessions/archive', z.strictObject({ archived: z.array(z.strictObject({ id: C.EntityIdSchema, archivedAt: z.number() })), failedIds: z.array(C.EntityIdSchema) }), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sessionIds, archivedAt: archivedAt ?? Date.now() }) });
  }
  unarchiveSessions(sessionIds: string[]): Promise<ArchiveAck> {
    return request('/api/openchamber/sessions/unarchive', z.strictObject({ restored: z.array(z.strictObject({ id: C.EntityIdSchema, archivedAt: z.nullable(z.number()) })), failedIds: z.array(C.EntityIdSchema) }), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: sessionIds }) });
  }
  forkSession(scope: Pick<Session, 'sessionId' | 'rootSessionId' | 'workspaceId' | 'projectId'>, input: { messageId?: string; mode: 'selected' | 'full' }, commandId?: string): Promise<SessionCreateAck> {
    return request(`/api/agent/v1/sessions/${id(scope.sessionId)}/fork`, C.SessionCreateAckSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  abortSession(sessionId: string, runId: string): Promise<RunAbortAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, C.RunAbortAckSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'abort', runId }) });
  }
  createRun(sessionId: string, input: RunCreateRequest, commandId?: string): Promise<RunCreateAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/runs`, z.strictObject({ run: C.RunSchema }), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  abortRun(sessionId: string, runId: string): Promise<RunAbortAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/runs/${id(runId)}/abort`, C.RunAbortAckSchema, { method: 'POST' });
  }
  steer(sessionId: string, requestBody: SteerRequest['request'], commandId?: string): Promise<SteerAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/steer`, C.SteerAckSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify({ sessionId, request: requestBody }) });
  }
  followUp(sessionId: string, requestBody: FollowUpRequest['request'], commandId?: string): Promise<C.FollowUpAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/follow-up`, C.FollowUpAckSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify({ sessionId, request: requestBody }) });
  }
  respondApproval(sessionId: string, approvalId: string, reply: ApprovalReply): Promise<ApprovalRequest> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/approvals/${id(approvalId)}/respond`, C.ApprovalRequestSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply) });
  }
  respondQuestion(sessionId: string, questionId: string, reply: QuestionReply): Promise<QuestionRequest> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/questions/${id(questionId)}/respond`, C.QuestionRequestSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reply) });
  }

  getQueue(sessionId: string): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue`, C.QueueStateSchema); }
  appendQueue(sessionId: string, input: QueueAppendRequest, commandId?: string): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue`, C.QueueStateSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) }); }
  reorderQueue(sessionId: string, input: QueueReorderRequest): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue/order`, C.QueueStateSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  deleteQueueItem(sessionId: string, queueItemId: string, input: QueueDeleteRequest): Promise<QueueState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue/${id(queueItemId)}`, C.QueueStateSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }

  getModels(workspaceId: string): Promise<ModelCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/models`, C.ModelCatalogSchema); }
  getProviders(workspaceId: string): Promise<ProviderCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers`, C.ProviderCatalogSchema); }
  getAgents(workspaceId: string): Promise<AgentCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, C.AgentCatalogSchema); }
  createAgent(workspaceId: string, input: AgentCreateRequest): Promise<AgentMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, C.AgentMutationResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  updateAgent(workspaceId: string, input: AgentUpdateRequest): Promise<AgentMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, C.AgentMutationResultSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  deleteAgent(workspaceId: string, input: AgentDeleteRequest): Promise<AgentMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, C.AgentMutationResultSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  configureProvider(workspaceId: string, providerId: string, input: ProviderConfigureRequest): Promise<ProviderMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/config`, C.ProviderMutationResultSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  deleteProvider(workspaceId: string, providerId: string, input: ProviderDeleteRequest): Promise<ProviderMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}`, C.ProviderMutationResultSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  configureModel(workspaceId: string, providerId: string, modelId: string, input: ModelConfigureRequest): Promise<C.ModelMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/models/${id(modelId)}`, C.ModelMutationResultSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  deleteModel(workspaceId: string, providerId: string, modelId: string, input: ModelDeleteRequest): Promise<C.ModelMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/models/${id(modelId)}`, C.ModelMutationResultSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  writeProviderCredential(workspaceId: string, providerId: string, input: ProviderCredentialWriteRequest): Promise<ProviderCredentialMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/credential`, C.ProviderCredentialMutationResultSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  deleteProviderCredential(workspaceId: string, providerId: string, input: ProviderCredentialDeleteRequest): Promise<ProviderCredentialMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/credential`, C.ProviderCredentialMutationResultSchema, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  getShellSnapshot(scope: { kind: 'session'; sessionId: string } | { kind: 'workspace'; workspaceId: string } | { kind: 'project'; projectId: string } | { kind: 'all' }): Promise<ShellSnapshot> {
    const path = scope.kind === 'session' ? `/api/agent/v1/sessions/${id(scope.sessionId)}/shell/jobs` : scope.kind === 'workspace' ? `/api/agent/v1/workspaces/${id(scope.workspaceId)}/shell/jobs` : scope.kind === 'project' ? `/api/agent/v1/projects/${id(scope.projectId)}/shell/jobs` : '/api/agent/v1/shell/jobs';
    return request(path, C.ShellSnapshotSchema);
  }
  startShell(sessionId: string, input: ShellStartRequest, commandId?: string): Promise<ShellJob> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs`, C.ShellJobSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  getShellOutput(sessionId: string, job: { jobId: string; epoch: string; workerGeneration: string }, cursor: string, tailBytes: number): Promise<ShellOutput> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(job.jobId)}/output${query({ epoch: job.epoch, workerGeneration: job.workerGeneration, cursor, tailBytes })}`, C.ShellOutputSchema);
  }
  stopShell(sessionId: string, job: ShellStopRequest): Promise<ShellJob> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(job.job.jobId)}/stop`, C.ShellStopResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job) }).then((result) => result.job);
  }
  getMcpCatalog(sessionId: string): Promise<MCPCatalogRead> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/catalog`, C.MCPCatalogReadSchema); }
  configureMcp(sessionId: string, input: MCPConfigureRequest): Promise<MCPApplyResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/config`, C.MCPApplyResultSchema, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  applyMcp(sessionId: string, input: MCPApplyRequest): Promise<MCPApplyResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/apply`, C.MCPApplyResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  reconnectMcp(sessionId: string, serverId: string, input: MCPReconnectRequest): Promise<MCPCatalogRead> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/servers/${id(serverId)}/reconnect`, C.MCPCatalogReadSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  getMcpOAuth(sessionId: string, serverId: string): Promise<MCPOAuthResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/servers/${id(serverId)}/oauth`, C.MCPOAuthResultSchema); }
  submitMcpOAuth(sessionId: string, serverId: string, input: MCPOAuthRequest): Promise<MCPOAuthResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/mcp/servers/${id(serverId)}/oauth`, C.MCPOAuthResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  getSkillsCatalog(sessionId: string): Promise<SkillsCatalogState> { return request(`/api/agent/v1/sessions/${id(sessionId)}/skills/catalog`, C.SkillsCatalogStateSchema); }
  applySkills(sessionId: string, input: SkillsApplyRequest): Promise<SkillsApplyResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/skills/apply`, C.SkillsApplyResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  expandSkill(sessionId: string, input: SkillExpandRequest): Promise<SkillExpandResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/skills/expand`, C.SkillExpandResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); }
  complete(workspaceId: string, input: CompletionRequest, commandId?: string): Promise<CompletionResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/completions`, C.CompletionResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  cancelCompletion(workspaceId: string, completionId: string, input: CompletionCancelRequest = { completionId }): Promise<CompletionCancelResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/completions/${id(completionId)}/cancel`, C.CompletionCancelResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  }

  subscribeSessionEvents(sessionId: string, cursor: string, onEvent: (event: CanonicalEvent) => void, onInvalidated: (event: C.StreamInvalidated) => void, onError: (error: unknown) => void): () => void {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await runtimeFetch(`/api/agent/v1/sessions/${id(sessionId)}/events`, { signal: controller.signal, headers: { Accept: 'text/event-stream', 'Last-Event-ID': cursor } });
        if (!response.ok || !response.body) {
          const payload = await readJson(response);
          const problem = C.ProblemDetailsSchema.safeParse(payload);
          if (problem.success) throw new CanonicalApiError(problem.data);
          throw new CanonicalApiError(C.ProblemDetailsSchema.parse({
            type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Agent event stream unavailable',
            status: response.status, detail: 'The canonical event stream failed.', code: 'SERVICE_UNAVAILABLE', retryable: response.status >= 500,
          }));
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let eventName = '';
        let data = '';
        const dispatch = () => {
          if (!data) return;
          try {
            const payload: unknown = JSON.parse(data);
            if (eventName === 'stream.invalidated' || (payload && typeof payload === 'object' && (payload as { type?: string }).type === 'stream.invalidated')) onInvalidated(C.StreamInvalidatedSchema.parse(payload));
            else onEvent(C.CanonicalEventSchema.parse(payload));
          } catch (error) { onError(error); }
          eventName = ''; data = '';
        };
        while (!controller.signal.aborted) {
          const next = await reader.read();
          if (next.done) break;
          buffer += next.value;
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            for (const line of frame.split(/\r?\n/)) {
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              else if (line.startsWith('data:')) data += `${line.slice(5).trim()}\n`;
            }
            data = data.replace(/\n$/, ''); dispatch();
          }
        }
        reader.releaseLock();
        if (!controller.signal.aborted) onError(new Error('Canonical event stream ended unexpectedly'));
      } catch (error) { if (!controller.signal.aborted) onError(error); }
    })();
    return () => controller.abort();
  }
}

export const canonicalClient = new CanonicalClient();
export type { SessionList, RunCreateAck, ArchiveAck };
