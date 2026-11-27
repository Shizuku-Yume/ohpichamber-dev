import { z } from 'zod';
import * as C from '@openchamber/agent-contract';
import { runtimeFetch } from '../lib/runtime-fetch';
import type {
  AgentCatalog, AgentCreateRequest, AgentDeleteRequest, AgentMutationResult, AgentUpdateRequest,
  ApprovalReply, ApprovalRequest, CanonicalEvent, FollowUpRequest, HistoryPage, HistoryPageRequest, PromptReceiptResult,
  ModelCatalog, ModelConfigureRequest, ModelDeleteRequest, ProviderCatalog, ProviderConfigureRequest,
  ProviderCredentialDeleteRequest, ProviderCredentialMutationResult, ProviderCredentialWriteRequest, ProviderDeleteRequest,
  ProviderMutationResult, QuestionReply, QuestionRequest, RunAbortAck, RunCreateRequest, Session, SessionCreateAck,
  SessionCreateRequest, SessionDeleteAck, SessionMetadataPatch, SessionMetadataState, SessionSnapshot, SessionBranchRequest, SessionBranchResult, SessionRelocateResult, SessionMoveToWorktreeRequest, SessionMoveToWorktreeResult, ShellJob,
  ShellOutput, ShellSnapshot, ShellStartRequest, ShellStdinRequest, ShellStdinResult, ShellStopRequest, ShellStreamResponse, SkillsApplyRequest, SkillsApplyResult,
  SkillsCatalogState, SkillExpandRequest, SkillExpandResult, CompletionRequest, CompletionResult, CompletionCancelRequest, CompletionCancelResult,
  MCPCatalogRead, MCPConfigureRequest, MCPApplyRequest, MCPApplyResult, MCPReconnectRequest, MCPOAuthRequest, MCPOAuthResult, SteerAck, SteerRequest, Workspace,
  WorkspaceList, ProjectList, QueueAppendRequest, QueueDeleteRequest, QueueReorderRequest, QueueState, QueueTakeRequest, QueueTakeResult, Subagent,
  OmpSettingsState, OmpSettingsUpdateRequest,
  ImageModel, ImageGenerateRequest, ImageGenerateResult,
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

async function readJson<T>(response: Response, schema: z.ZodType<T>) {
  return schema.safeParse(await response.json().catch(() => null));
}

async function requestResponse(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await runtimeFetch(path, init);
  if (!response.ok) {
    const problem = await readJson(response, C.ProblemDetailsSchema);
    if (problem.success) throw new CanonicalApiError(problem.data);
    throw new CanonicalApiError(C.ProblemDetailsSchema.parse({
      type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Agent Service unavailable',
      status: response.status, detail: `The Host answered HTTP ${response.status} without a problem document.`,
      code: 'SERVICE_UNAVAILABLE', retryable: response.status >= 500,
    }));
  }
  return response;
}

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const response = await requestResponse(path, init);
  const result = await readJson(response, schema);
  if (!result.success) throw result.error;
  return result.data;
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

// The Host's OpenRouter model-info route is Host-owned, not part of the agent
// contract: it answers ModelCatalogInfo blocks for the ids it recognises.
const OpenRouterModelInfoRequestSchema = z.strictObject({
  modelIds: z.array(z.string().trim().min(1).max(256)).min(1).max(200),
});
const OpenRouterModelInfoResultSchema = z.strictObject({
  models: z.array(z.strictObject({ modelId: C.EntityIdSchema, catalog: C.ModelCatalogInfoSchema })),
});
export type OpenRouterModelInfoResult = z.infer<typeof OpenRouterModelInfoResultSchema>;

export class CanonicalClient {
  readonly plugins = {
    list: (workspaceId: string): Promise<C.PluginCatalogState> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins`, scoped(C.PluginCatalogStateSchema, result => result.workspaceId === workspaceId)),
    lifecycle: (workspaceId: string): Promise<C.PluginLifecycleState> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/lifecycle`, scoped(C.PluginLifecycleStateSchema, result => result.workspaceId === workspaceId)),
    install: (workspaceId: string, input: C.PluginInstallRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/install`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginInstallRequestSchema, input) }),
    uninstall: (workspaceId: string, input: C.PluginUninstallRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/uninstall`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginUninstallRequestSchema, input) }),
    configure: (workspaceId: string, input: C.PluginConfigureRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/${id(input.target.name)}`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginConfigureRequestSchema, input) }),
    update: (workspaceId: string, input: C.PluginUpgradeRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/${id(input.target.name)}/update`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginUpgradeRequestSchema, input) }),
    apply: (workspaceId: string, input: C.PluginApplyRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/apply`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginApplyRequestSchema, input) }),
    marketplace: (workspaceId: string): Promise<C.PluginMarketplaceState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace`, scoped(C.PluginMarketplaceStateSchema, result => result.workspaceId === workspaceId)),
    /** `list` is a read and answers with sources; every other action commits a new catalog. */
    manageMarketplace: (workspaceId: string, input: C.PluginMarketplaceMutationRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace/manage`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginMarketplaceManageRequestSchema, input) }),
    listMarketplaceSources: (workspaceId: string): Promise<C.PluginMarketplaceSources> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace/manage`, scoped(C.PluginMarketplaceSourcesSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginMarketplaceManageRequestSchema, { action: 'list' }) }),
    checkUpdates: (workspaceId: string): Promise<C.PluginUpdateCheckResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace/updates`, scoped(C.PluginUpdateCheckResultSchema, result => result.workspaceId === workspaceId)),
    previewUpgrade: (workspaceId: string, input: C.PluginPreviewUpgradeRequest): Promise<C.PluginUpgradePreviewResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace/preview-upgrade`, scoped(C.PluginUpgradePreviewResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginPreviewUpgradeRequestSchema, input) }),
    upgradeAll: (workspaceId: string, input: C.PluginUpgradeAllRequest): Promise<C.PluginMutationResult> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/marketplace/upgrade-all`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PluginUpgradeAllRequestSchema, input) }),
    doctor: (workspaceId: string): Promise<C.PluginDoctorResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/doctor`, scoped(C.PluginDoctorResultSchema, result => result.workspaceId === workspaceId)),
    readLocal: (workspaceId: string, extensionId: string): Promise<C.LocalExtensionSource> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/local/${id(extensionId)}`, scoped(C.LocalExtensionSourceSchema, result => result.workspaceId === workspaceId && result.extension.extensionId === extensionId)),
    writeLocal: (workspaceId: string, input: C.LocalExtensionWriteRequest): Promise<C.PluginMutationResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/local/${id(input.extensionId)}`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.LocalExtensionWriteRequestSchema, input) }),
    deleteLocal: (workspaceId: string, input: C.LocalExtensionDeleteRequest): Promise<C.PluginMutationResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/plugins/local/${id(input.extensionId)}`, scoped(C.PluginMutationResultSchema, result => result.workspaceId === workspaceId), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.LocalExtensionDeleteRequestSchema, input) }),
  };
  /** Native capability control: discovery providers and their toggled items. */
  readonly extensions = {
    inventory: (workspaceId: string): Promise<C.ExtensionInventoryState> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/extensions`, scoped(C.ExtensionInventoryStateSchema, result => result.workspaceId === workspaceId)),
    toggle: (workspaceId: string, input: C.ExtensionToggleRequest): Promise<C.ExtensionInventoryState> =>
      request(`/api/agent/v1/workspaces/${id(workspaceId)}/extensions`, scoped(C.ExtensionInventoryStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ExtensionToggleRequestSchema, input) }),
  };
  readonly fileResources = {
    getBehaviorFiles: (workspaceId: string): Promise<C.BehaviorFileCatalog> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/behavior-files`, scoped(C.BehaviorFileCatalogSchema, result => result.workspaceId === workspaceId)),
    writeBehaviorFile: (workspaceId: string, input: C.BehaviorFileWrite): Promise<C.BehaviorFileCatalog> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/behavior-files`, scoped(C.BehaviorFileCatalogSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.BehaviorFileWriteSchema, input) }),
    deleteBehaviorFile: (workspaceId: string, input: C.BehaviorFileDelete): Promise<C.BehaviorFileCatalog> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/behavior-files`, scoped(C.BehaviorFileCatalogSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.BehaviorFileDeleteSchema, input) }),
    getCommands: (workspaceId: string): Promise<C.CommandCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands`, scoped(C.CommandCatalogStateSchema, result => result.workspaceId === workspaceId)),
    createCommand: (workspaceId: string, input: C.CommandCreateRequest): Promise<C.CommandCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands`, scoped(C.CommandCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.CommandCreateRequestSchema, input) }),
    updateCommand: (workspaceId: string, input: C.CommandUpdateRequest): Promise<C.CommandCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands/${id(input.commandId)}`, scoped(C.CommandCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.CommandUpdateRequestSchema, input) }),
    deleteCommand: (workspaceId: string, input: C.CommandDeleteRequest): Promise<C.CommandCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands/${id(input.commandId)}`, scoped(C.CommandCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.CommandDeleteRequestSchema, input) }),
    expandCommand: (workspaceId: string, input: C.CommandExpandRequest): Promise<C.FileResourceExpandResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands/expand`, C.FileResourceExpandResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.CommandExpandRequestSchema, input) }),
    expandPromptInput: (workspaceId: string, input: C.FileResourceExpandTextRequest): Promise<C.FileResourcePromptInputResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/commands/expand-text`, C.FileResourcePromptInputResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.FileResourceExpandTextRequestSchema, input) }),
    getPromptTemplates: (workspaceId: string): Promise<C.PromptTemplateCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates`, scoped(C.PromptTemplateCatalogStateSchema, result => result.workspaceId === workspaceId)),
    createPromptTemplate: (workspaceId: string, input: C.PromptTemplateCreateRequest): Promise<C.PromptTemplateCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates`, scoped(C.PromptTemplateCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PromptTemplateCreateRequestSchema, input) }),
    updatePromptTemplate: (workspaceId: string, input: C.PromptTemplateUpdateRequest): Promise<C.PromptTemplateCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates/${id(input.templateId)}`, scoped(C.PromptTemplateCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PromptTemplateUpdateRequestSchema, input) }),
    deletePromptTemplate: (workspaceId: string, input: C.PromptTemplateDeleteRequest): Promise<C.PromptTemplateCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates/${id(input.templateId)}`, scoped(C.PromptTemplateCatalogStateSchema, result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(input.expectedRevision) + 1n), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PromptTemplateDeleteRequestSchema, input) }),
    expandPromptTemplate: (workspaceId: string, input: C.PromptTemplateExpandRequest): Promise<C.FileResourceExpandResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates/expand`, C.FileResourceExpandResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.PromptTemplateExpandRequestSchema, input) }),
    expandPromptText: (workspaceId: string, input: C.FileResourceExpandTextRequest): Promise<C.FileResourceExpandResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/prompt-templates/expand-text`, C.FileResourceExpandResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.FileResourceExpandTextRequestSchema, input) }),
    getSkills: (workspaceId: string): Promise<C.FileResourceSkillCatalog> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/catalog`, scoped(C.FileResourceSkillCatalogSchema, result => result.workspaceId === workspaceId)),
    expandSkills: (workspaceId: string, input: C.FileResourceSkillExpandRequest): Promise<C.FileResourceExpandResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/expand`, C.FileResourceExpandResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.FileResourceSkillExpandRequestSchema, input) }),
    getSkillFileCatalog: (workspaceId: string): Promise<C.SkillFileCatalogState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files`, scoped(C.SkillFileCatalogStateSchema, result => result.workspaceId === workspaceId)),
    getSkillFiles: (workspaceId: string, skillId: string, scope: C.FileResourceScope): Promise<C.SkillFilesState> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}?scope=${encodeURIComponent(scope)}`, scoped(C.SkillFilesStateSchema, result => result.workspaceId === workspaceId && result.skillId === skillId && result.scope === scope)),
    readSkillFile: (workspaceId: string, skillId: string, filePath: string, scope: C.FileResourceScope): Promise<C.SkillFileRead> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}/${filePath.split('/').map(id).join('/')}?scope=${encodeURIComponent(scope)}`, scoped(C.SkillFileReadSchema, result => result.workspaceId === workspaceId && result.skillId === skillId && result.filePath === filePath && result.scope === scope)),
    writeSkillFile: (workspaceId: string, skillId: string, filePath: string, input: C.SkillFileWriteRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}/${filePath.split('/').map(id).join('/')}`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileWriteRequestSchema, input) }),
    renameSkill: (workspaceId: string, skillId: string, input: C.SkillFileRenameRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}/rename`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileRenameRequestSchema, input) }),
    deleteSkill: (workspaceId: string, skillId: string, input: C.SkillFileDeleteRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileDeleteRequestSchema, input) }),
    writeSupportingFile: (workspaceId: string, skillId: string, filePath: string, input: C.SkillFileWriteRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}/${filePath.split('/').map(id).join('/')}`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileWriteRequestSchema, input) }),
    deleteSkillFile: (workspaceId: string, skillId: string, filePath: string, input: C.SkillFileDeleteRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/${id(skillId)}/${filePath.split('/').map(id).join('/')}`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision) + 1n), { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileDeleteRequestSchema, input) }),
    applySkillFiles: (workspaceId: string, input: C.SkillFileDeleteRequest): Promise<C.SkillInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/files/apply`, scoped(C.SkillInstallResultSchema, result => result.scope.kind === input.scope && (result.scope.kind !== 'workspace' || result.scope.workspaceId === workspaceId) && BigInt(result.sourceRevision) === BigInt(input.expectedSourceRevision)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillFileDeleteRequestSchema, input) }),
  };
  readonly skillRepositories = {
    catalog: (workspaceId: string): Promise<C.SkillRepositoryCatalog> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/repositories`, scoped(C.SkillRepositoryCatalogSchema, result => result.workspaceId === workspaceId)),
    source: (workspaceId: string, input: C.SkillRepositorySourceRequest, options?: { signal?: AbortSignal }): Promise<C.SkillRepositoryItems> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/repositories/source`, scoped(C.SkillRepositoryItemsSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillRepositorySourceRequestSchema, input), signal: options?.signal }),
    scan: (workspaceId: string, input: C.SkillRepositoryScanRequest, options?: { signal?: AbortSignal }): Promise<C.SkillRepositoryItems> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/repositories/scan`, scoped(C.SkillRepositoryItemsSchema, result => result.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillRepositoryScanRequestSchema, input), signal: options?.signal }),
    install: (workspaceId: string, input: C.SkillRepositoryInstallRequest): Promise<C.SkillRepositoryInstallResult> => request(`/api/agent/v1/workspaces/${id(workspaceId)}/skills/repositories/install`, scoped(C.SkillRepositoryInstallResultSchema, result => !result.ok || (result.workspaceId === workspaceId && (!result.commit || (result.commit.scope.kind === input.scope && (result.commit.scope.kind !== 'workspace' || result.commit.scope.workspaceId === workspaceId) && BigInt(result.commit.sourceRevision) > BigInt(input.expectedSourceRevision))))), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SkillRepositoryInstallRequestSchema, input) }),
  };

  async checkReady(options: { signal?: AbortSignal } = {}): Promise<boolean> {
    const response = await runtimeFetch('/api/agent/v1/ready', { signal: options.signal, cache: 'no-store' });
    if (!response.ok) return false;
    return C.AgentServiceReadySchema.safeParse(await response.json().catch(() => null)).success;
  }
  resolveWorkspace(directory: string, options: { signal?: AbortSignal } = {}): Promise<Workspace> {
    return request('/api/agent/v1/workspaces/resolve', C.WorkspaceSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ directory }), signal: options.signal,
    });
  }

  getUsageStats(input: C.UsageQuery, options: { signal?: AbortSignal } = {}): Promise<C.UsageStats> {
    const parsed = C.UsageQuerySchema.parse(input);
    return request(`/api/agent/v1/usage${query(parsed)}`, C.UsageStatsSchema, { signal: options.signal });
  }

  getUsageTools(input: C.UsageQuery, options: { signal?: AbortSignal } = {}): Promise<C.UsageToolsResponse> {
    const parsed = C.UsageQuerySchema.parse(input);
    return request(`/api/agent/v1/usage/tools${query(parsed)}`, C.UsageToolsResponseSchema, { signal: options.signal });
  }

  getWebSearch(workspaceId: string, options: { signal?: AbortSignal } = {}): Promise<C.WebSearchConfigState> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/web-search`, scoped(C.WebSearchConfigStateSchema, state => state.workspaceId === workspaceId), { signal: options.signal });
  }
  updateWebSearch(workspaceId: string, input: C.WebSearchUpdateRequest, options: { signal?: AbortSignal } = {}): Promise<C.WebSearchMutationResult> {
    const parsed = C.WebSearchUpdateRequestSchema.parse(input);
    const expected = BigInt(parsed.expectedRevision);
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/web-search`, scoped(C.WebSearchMutationResultSchema, result => {
      if (result.state.workspaceId !== workspaceId) return false;
      const revision = BigInt(result.state.revision);
      return result.persistence === 'persisted' ? revision === expected + 1n : revision === expected || revision === expected + 1n;
    }), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.WebSearchUpdateRequestSchema, parsed), signal: options.signal,
    });
  }
  writeWebSearchCredential(workspaceId: string, input: C.WebSearchCredentialWriteRequest, options: { signal?: AbortSignal } = {}): Promise<C.WebSearchMutationResult> {
    const parsed = C.WebSearchCredentialWriteRequestSchema.parse(input);
    const expected = BigInt(parsed.expectedRevision);
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/web-search/credentials/${id(parsed.providerId)}`, scoped(C.WebSearchMutationResultSchema, result => {
      if (result.state.workspaceId !== workspaceId) return false;
      const revision = BigInt(result.state.revision);
      return result.persistence === 'persisted' ? revision === expected + 1n : revision === expected || revision === expected + 1n;
    }), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.WebSearchCredentialWriteRequestSchema, parsed), signal: options.signal,
    });
  }
  deleteWebSearchCredential(workspaceId: string, input: C.WebSearchCredentialDeleteRequest, options: { signal?: AbortSignal } = {}): Promise<C.WebSearchMutationResult> {
    const parsed = C.WebSearchCredentialDeleteRequestSchema.parse(input);
    const expected = BigInt(parsed.expectedRevision);
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/web-search/credentials/${id(parsed.providerId)}`, scoped(C.WebSearchMutationResultSchema, result => {
      if (result.state.workspaceId !== workspaceId) return false;
      const revision = BigInt(result.state.revision);
      return result.persistence === 'persisted' ? revision === expected + 1n : revision === expected || revision === expected + 1n;
    }), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.WebSearchCredentialDeleteRequestSchema, parsed), signal: options.signal,
    });
  }


  uploadAttachment(workspaceId: string, metadata: Pick<C.Attachment, 'name' | 'mediaType' | 'size'>, data: string): Promise<C.Attachment> {
    return request('/api/agent/v1/attachments', C.AttachmentSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, metadata, data }),
    });
  }

  async readAttachment(workspaceId: string, attachmentId: string): Promise<Blob> {
    const response = await requestResponse(`/api/agent/v1/attachments/${id(attachmentId)}${query({ workspaceId })}`);
    return response.blob();
  }

  listProjects(): Promise<ProjectList> { return request('/api/agent/v1/projects', C.ProjectListSchema); }
  listWorkspaces(projectId?: string): Promise<WorkspaceList> {
    return request(`/api/agent/v1/workspaces${query({ projectId })}`, scoped(C.WorkspaceListSchema, result => projectId === undefined || result.items.every(workspace => workspace.projectId === projectId)));
  }
  listSessions(workspaceId?: string): Promise<SessionList> {
    const schema = z.strictObject({ items: z.array(C.SessionSchema), errors: C.DiscoveryErrorsSchema });
    return request(`/api/agent/v1/sessions${query({ workspaceId })}`, scoped(schema, result => workspaceId === undefined || result.items.every(session => session.workspaceId === workspaceId)));
  }
  listSubagents(sessionId: string): Promise<Subagent[]> {
    return request(`/api/agent/v1/subagents${query({ sessionId })}`, z.array(C.SubagentSchema), {
    }).then(result => result.filter(subagent => subagent.parentSessionId === sessionId));
  }
  getSession(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}`, scoped(C.SessionSnapshotSchema, result => result.session.sessionId === sessionId)); }
  getSnapshot(sessionId: string): Promise<SessionSnapshot> { return request(`/api/agent/v1/sessions/${id(sessionId)}/snapshot`, scoped(C.SessionSnapshotSchema, result => result.session.sessionId === sessionId)); }
  getHistory(sessionId: string, options: Omit<HistoryPageRequest, 'sessionId'> = {}): Promise<HistoryPage> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/history${query(options)}`, scoped(C.HistoryPageSchema, result => result.sessionId === sessionId));
  }
  getTurnDiff(sessionId: string, turnId: string): Promise<C.TurnDiff> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/turns/${id(turnId)}/diff`, scoped(C.TurnDiffSchema, result => result.sessionId === sessionId && result.turnId === turnId));
  }
  getPromptReceipt(sessionId: string, correlationId: string): Promise<PromptReceiptResult> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/prompt-receipts/${id(correlationId)}`, scoped(C.PromptReceiptResultSchema, result =>
      result.status === 'unknown'
        ? result.sessionId === sessionId && result.correlationId === correlationId
        : result.receipt.sessionId === sessionId && result.receipt.correlationId === correlationId
    ));
  }
  getSessionMetadata(sessionId: string): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, scoped(C.SessionMetadataStateSchema, result => result.sessionId === sessionId));
  }
  patchSessionMetadata(sessionId: string, patch: SessionMetadataPatch): Promise<SessionMetadataState> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/metadata`, scoped(C.SessionMetadataStateSchema, result => result.sessionId === sessionId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SessionMetadataPatchSchema, patch),
    });
  }
  renameSession(sessionId: string, workspaceId: string, title: string): Promise<Session> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/title`, scoped(C.SessionSchema, result => result.sessionId === sessionId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionTitleRequestSchema, { workspaceId, title }),
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
  /**
   * Moves this session into a new worktree of its repository. The Host makes
   * the checkout, carries the named files' uncommitted changes, and relocates
   * the session last; a failure removes the checkout and restores the changes,
   * or names the stash that keeps them.
   */
  moveSessionToWorktree(sessionId: string, input: SessionMoveToWorktreeRequest, commandId?: string): Promise<SessionMoveToWorktreeResult> {
    const parsed = C.SessionMoveToWorktreeRequestSchema.parse(input);
    return request(`/api/agent/v1/sessions/${id(sessionId)}/move-to-worktree`, scoped(C.SessionMoveToWorktreeResultSchema, result => result.sessionId === sessionId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headersFor(commandId) },
      body: bodyFor(C.SessionMoveToWorktreeRequestSchema, parsed),
    });
  }
  createSession(input: SessionCreateRequest, commandId?: string): Promise<SessionCreateAck> {
    const { projectId, workspaceId } = input;
    return request('/api/agent/v1/sessions', scoped(C.SessionCreateAckSchema, result => result.session.projectId === projectId && result.session.workspaceId === workspaceId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: bodyFor(C.SessionCreateRequestSchema, input) });
  }
  prepareSession(input: { projectId: string; workspaceId: string }): Promise<{ ok: boolean; sessionId?: string }> {
    return request('/api/agent/v1/sessions/prepare', z.object({ ok: z.boolean(), sessionId: z.string().optional() }), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
    });
  }
  discardPreparedSession(input: { workspaceId: string }): Promise<{ ok: boolean }> {
    return request('/api/agent/v1/sessions/prepare', z.object({ ok: z.boolean() }), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input)
    });
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
  forkSession(scope: CanonicalSessionScope, input: { messageId?: string; mode: 'selected' | 'full' }, commandId?: string): Promise<SessionCreateAck> {
    const { sessionId, workspaceId, projectId } = scope;
    return request(`/api/agent/v1/sessions/${id(sessionId)}/fork`, scoped(C.SessionCreateAckSchema, result => result.session.projectId === projectId && result.session.workspaceId === workspaceId && result.session.sessionId !== sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json', ...headersFor(commandId) }, body: JSON.stringify(input) });
  }
  setMode(sessionId: string, mode: 'main' | 'plan' | 'vibe'): Promise<Extract<C.SessionControlAck, { type: 'mode.set' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'mode.set'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'mode.set', mode }),
    }).then((result) => {
      if (result.type !== 'mode.set') throw new Error('Mode response identified another control');
      return result;
    });
  }
  goal(sessionId: string, input: Omit<C.GoalControlRequest, 'type'>): Promise<Extract<C.SessionControlAck, { type: 'goal' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'goal'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'goal', ...input }),
    }).then(result => {
      if (result.type !== 'goal') throw new Error('Goal response identified another control');
      return result;
    });
  }
  abortSession(sessionId: string, runId: string): Promise<RunAbortAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.RunAbortAckSchema, result => result.run.sessionId === sessionId && result.run.runId === runId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.SessionControlRequestSchema, { type: 'abort', runId }) });
  }
  compactSession(sessionId: string, instructions?: string): Promise<C.SessionControlAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'compact'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'compact', ...(instructions === undefined ? {} : { instructions }) }),
    });
  }
  abortCompaction(sessionId: string): Promise<C.SessionControlAck> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'compact.abort'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'compact.abort' }),
    });
  }
  runBuiltinCommand(sessionId: string, text: string): Promise<Extract<C.SessionControlAck, { type: 'command' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'command'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'command', text }),
    }).then(result => {
      if (result.type !== 'command') throw new Error('Command response identified another control');
      return result;
    });
  }
  askBtw(sessionId: string, question: string): Promise<{ recordId: string }> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(z.strictObject({ type: z.literal('btw.ask'), recordId: C.EntityIdSchema }), result => result.type === 'btw.ask'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'btw.ask', question }),
    });
  }
  cancelBtw(sessionId: string): Promise<{ cancelled: boolean }> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(z.strictObject({ type: z.literal('btw.cancel'), cancelled: z.boolean() }), result => result.type === 'btw.cancel'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'btw.cancel' }),
    });
  }
  branchFromBtw(sessionId: string, recordId: string): Promise<Extract<C.SessionControlAck, { type: 'btw.branch' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'btw.branch'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'btw.branch', recordId }),
    }).then(result => {
      if (result.type !== 'btw.branch') throw new Error('BTW branch response identified another control');
      return result;
    });
  }
  steerSubagent(sessionId: string, subagentId: string, message: string): Promise<Extract<C.SessionControlAck, { type: 'subagent.steer' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'subagent.steer'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'subagent.steer', subagentId, message }),
    }).then(result => {
      if (result.type !== 'subagent.steer') throw new Error('Subagent steer response identified another control');
      return result;
    });
  }
  cancelSubagent(sessionId: string, subagentId: string): Promise<Extract<C.SessionControlAck, { type: 'subagent.cancel' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'subagent.cancel'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'subagent.cancel', subagentId }),
    }).then(result => {
      if (result.type !== 'subagent.cancel') throw new Error('Subagent cancel response identified another control');
      return result;
    });
  }
  stopLoop(sessionId: string): Promise<Extract<C.SessionControlAck, { type: 'loop.stop' }>> {
    return request(`/api/agent/v1/sessions/${id(sessionId)}/control`, scoped(C.SessionControlAckSchema, result => result.type === 'loop.stop'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: bodyFor(C.SessionControlRequestSchema, { type: 'loop.stop' }),
    }).then(result => {
      if (result.type !== 'loop.stop') throw new Error('Loop stop response identified another control');
      return result;
    });
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
  takeQueueItem(sessionId: string, queueItemId: string, input: QueueTakeRequest): Promise<QueueTakeResult> { return request(`/api/agent/v1/sessions/${id(sessionId)}/queue/${id(queueItemId)}/take`, scoped(C.QueueTakeResultSchema, result => result.queue.sessionId === sessionId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.QueueTakeRequestSchema, input, body => body.queueItemId === queueItemId) }); }

  getModels(workspaceId: string): Promise<ModelCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/models`, scoped(C.ModelCatalogSchema, result => result.workspaceId === workspaceId)); }
  async listImageModels(workspaceId: string): Promise<ImageModel[]> {
    const catalog = await this.getModels(workspaceId);
    return catalog.imageModels;
  }
  generateImage(workspaceId: string, input: Omit<ImageGenerateRequest, 'workspaceId'>, signal?: AbortSignal): Promise<ImageGenerateResult> {
    const payload = C.ImageGenerateRequestSchema.parse({ ...input, workspaceId });
    return request(
      `/api/agent/v1/workspaces/${id(workspaceId)}/images/generate`,
      scoped(C.ImageGenerateResultSchema, result => result.model.providerId === payload.selection.providerId && result.model.modelId === payload.selection.modelId),
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal },
    );
  }

  getOmpSettings(workspaceId: string, signal?: AbortSignal): Promise<OmpSettingsState> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/settings`, scoped(C.OmpSettingsStateSchema, result => result.workspaceId === workspaceId), { signal });
  }
  updateOmpSettings(workspaceId: string, input: OmpSettingsUpdateRequest, signal?: AbortSignal): Promise<OmpSettingsState> {
    const parsed = C.OmpSettingsUpdateRequestSchema.parse(input);
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/settings`, scoped(C.OmpSettingsStateSchema,
      result => result.workspaceId === workspaceId && BigInt(result.revision) === BigInt(parsed.expectedRevision) + 1n), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed), signal,
    });
  }

  readCacheWarming(workspaceId: string, signal?: AbortSignal): Promise<C.CacheWarmingState> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/cache-warming`, scoped(C.CacheWarmingStateSchema, result => result.workspaceId === workspaceId), { signal });
  }
  updateCacheWarming(workspaceId: string, input: C.CacheWarmingUpdateRequest, signal?: AbortSignal): Promise<C.CacheWarmingApplyResult> {
    const parsed = C.CacheWarmingUpdateRequestSchema.parse(input);
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/cache-warming`, scoped(C.CacheWarmingApplyResultSchema, result => result.persisted.workspaceId === workspaceId && result.persisted.mode === parsed.mode && BigInt(result.persisted.revision) === BigInt(parsed.expectedRevision) + 1n), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed), signal,
    });
  }
  readSessionCacheWarming(sessionId: string, signal?: AbortSignal): Promise<C.SessionCacheWarmingState> {
    return request(
      `/api/agent/v1/sessions/${id(sessionId)}/cache-warming`,
      C.SessionCacheWarmingStateSchema,
      { signal },
    );
  }
  updateSessionCacheWarming(sessionId: string, input: C.SessionCacheWarmingUpdateRequest, signal?: AbortSignal): Promise<C.SessionCacheWarmingApplyResult> {
    const parsed = C.SessionCacheWarmingUpdateRequestSchema.parse(input);
    return request(
      `/api/agent/v1/sessions/${id(sessionId)}/cache-warming`,
      scoped(
        C.SessionCacheWarmingApplyResultSchema,
        result => result.persisted.mode === parsed.mode && BigInt(result.persisted.revision) === BigInt(parsed.expectedRevision) + 1n,
      ),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed), signal },
    );
  }
  getProviders(workspaceId: string): Promise<ProviderCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers`, scoped(C.ProviderCatalogSchema, result => result.workspaceId === workspaceId)); }
  providerAccounts(workspaceId: string, providerId: string): Promise<C.ProviderAccounts> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/accounts`, scoped(C.ProviderAccountsSchema, result => result.providerId === providerId));
  }
  async providerAccountSelection(workspaceId: string, providerId: string): Promise<C.ProviderAccountSelection | null> {
    try {
      return await request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/account-selection`,
        scoped(C.ProviderAccountSelectionSchema, result => result.providerId === providerId));
    } catch (error) {
      if (error instanceof CanonicalApiError && error.problem.status === 404 && error.problem.code === 'NOT_IMPLEMENTED') return null;
      throw error;
    }
  }
  mutateProviderAccount(workspaceId: string, providerId: string, input: C.ProviderAccountMutationRequest): Promise<C.ProviderAccounts> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/accounts`, scoped(C.ProviderAccountsSchema, result => result.providerId === providerId), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderAccountMutationRequestSchema, input),
    });
  }
  providerOAuthMethods(workspaceId: string): Promise<C.ProviderOAuthMethods> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/oauth-methods`, C.ProviderOAuthMethodsSchema);
  }
  providerOAuth(workspaceId: string, methodId: string, input: C.ProviderOAuthRequest): Promise<C.ProviderOAuthResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(methodId)}/oauth`, scoped(C.ProviderOAuthResultSchema, result => input.action === 'start'
      ? result.revision === input.expectedRevision : result.flowId === input.flowId && result.generation === input.generation), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderOAuthRequestSchema, input),
    });
  }
  discoverProviderModels(workspaceId: string, input: C.ProviderModelDiscoveryRequest): Promise<C.ProviderModelDiscoveryResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/discover`, C.ProviderModelDiscoveryResultSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderModelDiscoveryRequestSchema, input),
    });
  }
  /** Reads OMP's bundled catalog for these ids. Offline; no endpoint or key involved. */
  enrichProviderModels(workspaceId: string, input: C.ProviderModelEnrichRequest): Promise<C.ProviderModelEnrichResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/enrich`, C.ProviderModelEnrichResultSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderModelEnrichRequestSchema, input),
    });
  }
  /**
   * The Host's OpenRouter model info for these ids (a Host route, not the
   * agent contract). The route answers 403 `enterprise_mode` instead of making
   * the outbound request; only ids travel, never keys or the endpoint.
   */
  openRouterModelInfo(modelIds: string[], signal?: AbortSignal): Promise<OpenRouterModelInfoResult> {
    const body = OpenRouterModelInfoRequestSchema.parse({ modelIds });
    return request('/api/openchamber/openrouter/model-info', OpenRouterModelInfoResultSchema, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
  }
  providerConfiguration(workspaceId: string, providerId: string): Promise<C.ProviderConfigurationRead> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/config`, scoped(C.ProviderConfigurationReadSchema, result => (result.configuration ? result.configuration.providerId === providerId : true) && (result.native ? result.native.providerId === providerId : true)));
  }
  getAgents(workspaceId: string): Promise<AgentCatalog> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/agents`, scoped(C.AgentCatalogSchema, result => result.workspaceId === workspaceId)); }
  getTools(scope: { sessionId?: string; workspaceId?: string } | string): Promise<C.SessionToolsCatalog> {
    const sessionId = typeof scope === 'string' ? scope : scope.sessionId;
    const workspaceId = typeof scope === 'string' ? undefined : scope.workspaceId;
    const path = sessionId
      ? `/api/agent/v1/sessions/${id(sessionId)}/tools`
      : `/api/agent/v1/workspaces/${id(workspaceId!)}/tools`;
    return request(path, C.SessionToolsCatalogSchema);
  }
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
  configureProvider(workspaceId: string, providerId: string, input: ProviderConfigureRequest): Promise<ProviderMutationResult> { return request(`/api/agent/v1/workspaces/${id(workspaceId)}/providers/${id(providerId)}/config`, scoped(C.ProviderMutationResultSchema, result => result.providerId === providerId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ProviderConfigureRequestSchema, input, body => (body.configuration ? body.configuration.providerId === providerId : true) && (body.native ? body.native.providerId === providerId : true)) }); }
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
  getShellOutput(sessionId: string, job: { jobId: string; epoch: string; workerGeneration: string }, cursor: string, tailBytes: number, signal?: AbortSignal): Promise<ShellOutput> {
    const expected = { ...job, sessionId };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(job.jobId)}/output${query({ epoch: job.epoch, workerGeneration: job.workerGeneration, cursor, tailBytes })}`, scoped(C.ShellOutputSchema, result => sameJob(result.job, expected) && result.requestedCursor === cursor), { signal });
  }
  stopShell(sessionId: string, job: ShellStopRequest, signal?: AbortSignal): Promise<ShellJob> {
    const expected = { ...job.job };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(expected.jobId)}/stop`, scoped(C.ShellStopResultSchema, result => sameJob(result.job, expected)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ShellStopRequestSchema, job, body => body.job.sessionId === sessionId), signal }).then((result) => result.job);
  }
  getShellStream(sessionId: string, job: { jobId: string; epoch: string; workerGeneration: string }, streamId: number, from?: number, signal?: AbortSignal): Promise<ShellStreamResponse> {
    const expected = { ...job, sessionId };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(job.jobId)}/stream${query({ epoch: job.epoch, workerGeneration: job.workerGeneration, streamId, from })}`, scoped(C.ShellStreamResponseSchema, result => sameJob(result.job, expected) && result.streamId === streamId), { signal });
  }
  writeShellStdin(sessionId: string, input: ShellStdinRequest, signal?: AbortSignal): Promise<ShellStdinResult> {
    const expected = { ...input.job };
    return request(`/api/agent/v1/sessions/${id(sessionId)}/shell/jobs/${id(expected.jobId)}/stdin`, scoped(C.ShellStdinResultSchema, result => sameJob(result.job, expected)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.ShellStdinRequestSchema, input, body => body.job.sessionId === sessionId), signal });
  }
  getWorkspaceMcpConfig(workspaceId: string): Promise<C.MCPConfigurationState> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/config`, scoped(C.MCPConfigurationStateSchema, result => result.workspaceId === workspaceId));
  }
  configureWorkspaceMcp(workspaceId: string, input: MCPConfigureRequest): Promise<MCPApplyResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/config`, scoped(C.MCPApplyResultSchema, result => result.configuration.workspaceId === workspaceId), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPConfigureRequestSchema, input) });
  }
  applyWorkspaceMcp(workspaceId: string, input: MCPApplyRequest): Promise<MCPApplyResult> {
    const { persistedRevision } = input;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/apply`, scoped(C.MCPApplyResultSchema, result => result.configuration.workspaceId === workspaceId && result.configuration.persistedRevision === persistedRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPApplyRequestSchema, input) });
  }
  testWorkspaceMcpServer(workspaceId: string, serverId: string, input: C.MCPApplyRequest): Promise<C.MCPConnectionTestResult> {
    const { persistedRevision } = input;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/servers/${id(serverId)}/test`, scoped(C.MCPConnectionTestResultSchema, result => result.workspaceId === workspaceId && result.serverId === serverId && result.persistedRevision === persistedRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPApplyRequestSchema, input) });
  }
  reconnectWorkspaceMcpServer(workspaceId: string, serverId: string, input: C.MCPApplyRequest): Promise<C.MCPWorkspaceReconnectResult> {
    const { persistedRevision } = input;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/servers/${id(serverId)}/reconnect`, scoped(C.MCPWorkspaceReconnectResultSchema, result => result.workspaceId === workspaceId && result.serverId === serverId && result.persistedRevision === persistedRevision), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPApplyRequestSchema, input) });
  }
  writeWorkspaceMcpCredential(workspaceId: string, serverId: string, input: C.MCPSecretWriteRequest): Promise<C.MCPSecretWriteResult> {
    const { persistedRevision } = input;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/servers/${id(serverId)}/credentials`, scoped(C.MCPSecretWriteResultSchema, result => result.workspaceId === workspaceId && result.serverId === serverId && result.persistedRevision === persistedRevision), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPSecretWriteRequestSchema, input) });
  }
  getWorkspaceMcpOAuth(workspaceId: string, serverId: string): Promise<MCPOAuthResult> {
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/servers/${id(serverId)}/oauth`, scoped(C.MCPOAuthResultSchema, result => result.serverId === serverId && result.worker.workspaceId === workspaceId));
  }
  submitWorkspaceMcpOAuth(workspaceId: string, serverId: string, input: MCPOAuthRequest): Promise<MCPOAuthResult> {
    const { persistedRevision, workerGeneration } = input;
    const flowId = input.action === 'complete' || input.action === 'cancel' ? input.flowId : undefined;
    return request(`/api/agent/v1/workspaces/${id(workspaceId)}/mcp/servers/${id(serverId)}/oauth`, scoped(C.MCPOAuthResultSchema, result => result.serverId === serverId && result.worker.workspaceId === workspaceId && result.worker.workerGeneration === workerGeneration && result.persistedRevision === persistedRevision && (flowId === undefined || result.status !== 'pending' || result.pendingFlow.flowId === flowId)), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: bodyFor(C.MCPOAuthRequestSchema, input) });
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

  subscribeSessionEvents(sessionId: string, cursor: string, onEvent: (event: CanonicalEvent) => void, onInvalidated: (event: C.StreamInvalidated) => void, onError: (error: Error) => void): () => void {
    const controller = new AbortController();
    void (async () => {
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      const cancel = () => { void reader?.cancel().catch(() => { }); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        response = await runtimeFetch(`/api/agent/v1/sessions/${id(sessionId)}/events`, { signal: controller.signal, headers: { Accept: 'text/event-stream', 'Last-Event-ID': cursor } });
        if (controller.signal.aborted) return;
        if (!response.ok || !response.body) {
          const problem = await readJson(response, C.ProblemDetailsSchema);
          if (problem.success) throw new CanonicalApiError(problem.data);
          throw new CanonicalApiError(C.ProblemDetailsSchema.parse({
            type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Agent event stream unavailable',
            status: response.status, detail: `The Host answered the event stream request with HTTP ${response.status} without a problem document.`,
            code: 'SERVICE_UNAVAILABLE', retryable: response.status >= 500,
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
        if (!controller.signal.aborted) onError(error instanceof Error ? error : new Error(String(error)));
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        if (reader) {
          await reader.cancel().catch(() => { });
          reader.releaseLock();
        } else {
          await response?.body?.cancel().catch(() => { });
        }
      }
    })();
    return () => controller.abort();
  }
}

export const canonicalClient = new CanonicalClient();
export type { SessionList };
