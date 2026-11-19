import { randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { z } from 'zod';
import { AgentServiceReadySchema, ApprovalReplySchema, CounterSchema, EntityIdSchema, HistoryPageRequestSchema, JsonObjectSchema, ProblemDetailsSchema, PromptRequestSchema, QuestionReplySchema, SessionBranchRequestSchema, SessionCacheWarmingUpdateRequestSchema, SessionTitleRequestSchema, MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPReconnectRequestSchema, MCPOAuthRequestSchema, SkillsApplyRequestSchema, SkillExpandRequestSchema, SessionControlRequestSchema, SessionControlAckSchema } from '@openchamber/agent-contract';
import type {
  SessionControlAck,
  AgentCatalog, AgentMutationResult, AgentServiceReady, ApprovalRequest,
  CompletionCancelResult, CompletionResult, HistoryPage, JsonObject, MCPCatalogRead,
  MCPConfigurationState, MCPConnectionTestResult, MCPWorkspaceReconnectResult, MCPSecretWriteResult,
  MCPApplyResult, MCPOAuthResult, ModelCatalog, ModelMutationResult, ProblemCode,
  ProblemDetails, ProviderCatalog, ProviderCredentialMutationResult, ProviderMutationResult,
  QuestionRequest, Run, RuntimeSession, SessionBranchResult, SessionDeleteAck, SessionSnapshot, SteerAck, FollowUpAck, Subagent,
  ShellJob, ShellSnapshot, ShellOutput, ShellStopResult, ShellStreamResponse, ShellStdinResult, SkillsCatalogState, SkillsApplyResult, SkillExpandResult, SkillInstallResult,
  ProviderAccounts, ProviderOAuthMethods, ProviderOAuthResult, ProviderModelDiscoveryResult, ProviderModelEnrichResult, ProviderConfigurationRead,
  CacheWarmingState, CacheWarmingApplyResult, SessionCacheWarmingState, SessionCacheWarmingApplyResult, OmpSettingsState,
  UsageStats, UsageToolsResponse, ImageGenerateResult, ImageModelMutationResult,
  WebSearchConfigState, WebSearchMutationResult,
  PluginCatalogState, PluginMutationResult, PluginDoctorResult, PluginMarketplaceState,
  PluginUpdateCheckResult, PluginUpgradePreviewResult, PluginMarketplaceSources,
  ExtensionInventoryState,
  SessionRecapListResponse, SubagentListResponse, SubagentTranscriptResponse, SubagentTreeCostResponse,
  SessionToolsCatalog,
} from '@openchamber/agent-contract';
import { HostStreamingPromptRequestSchema, WorkerBootstrapSchema, WorkerOperationSchema } from '../protocol.ts';
import type { WorkerBootstrap, WorkerInfo, WorkerPolicyRequest, WorkerPolicyResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { SessionRegistry, type NativeArchiveImported, type NativeArchiveInventory, type NativeEntryResult, type SessionForkResult, type SessionList } from '../sessions/registry.ts';
import type { ApprovalPolicyCommit, ApprovalPolicyLoad } from '../interaction/manager.ts';
import { SessionReferenceError } from '../sessions/references.ts';
import { ArchiveImportRequestSchema } from '../sessions/archive.ts';
import { sessionSurfaceRoute } from '../sessions/routes.ts';
import { WorkerOperationError, WorkerRegistry, type RegisteredWorkerInfo, type WorkerDiagnostic, type WorkerCapacityPolicy, type WorktreeLeaseAcquireResult } from './workers.ts';
import { deliverSessionStream } from './event-stream.ts';
import { CatalogCoordinator, CatalogCoordinatorError, type CatalogAdmission, type CatalogBootstrap } from './catalog.ts';
import { WorkspaceCatalogs } from './workspaces.ts';
import { SessionWarming } from './session-warming.ts';
import { WorkspaceRoutes } from './workspace-routes.ts';
import { WebSearchCoordinator } from './websearch.ts';
import { ShellCoordinator } from './shell.ts';
import type { PermissionMode } from './host-authorization-protocol.ts';
import { HostAuthorizationScopeSchema, HostSessionBootstrapSchema, HostSessionPermissionModeSchema, HostSessionForkAckSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationFinalizedSchema, HostSessionRelocationPendingSchema, HostSessionRelocationPrepareSchema, HostSessionRelocationPreparedSchema, HostWorkspaceBootstrapSchema, HostWorkspaceRegisteredSchema } from './host-authorization-protocol.ts';
import type { PrivateCredentialResolveResult, PrivateCredentialHandoffResult } from '../catalogs/private-credentials.ts';
import type { CommandCatalogState, PromptTemplateCatalogState, FileResourceSkillCatalog, FileResourceExpandResult, FileResourcePromptInputResult, SkillSourceRevisions } from '@openchamber/agent-contract';
import { HostSkillSourceCommitSchema, HostSkillSourceResultSchema, type HostSkillSourceOperation, type HostSkillSourceResult } from './file-resources-host-protocol.ts';
const SessionForkRequestSchema = z.strictObject({ sourceSessionId: EntityIdSchema, entryId: EntityIdSchema.nullable(), mode: z.enum(['selected', 'full']), forkTicketId: EntityIdSchema.optional() }).refine(input => input.mode === 'full' || input.entryId !== null, { message: 'Selected forks require an entry identity', path: ['entryId'] });
const SessionReopenRequestSchema = HostSessionBootstrapSchema.omit({ sessionFile: true });
import type { NativeOperationDescriptor, HostActionRequest, HostActionResult, HostNativePolicySnapshot } from './host-authorization-protocol.ts';
import type { PermissionAuthority } from '../interaction/manager.ts';
interface ServiceOptions {
  workerEntrypoint: string;
  workerRuntime?: string;
  internalSecret: string;
  stateDirectory: string;
  port?: number;
  approvalPolicyCommit?: ApprovalPolicyCommit;
  approvalPolicyLoad?: ApprovalPolicyLoad;
  permissionAuthority?: PermissionAuthority;
  policyCheck?: (rootSessionId: string, request: WorkerPolicyRequest, descriptor?: NativeOperationDescriptor) => Promise<WorkerPolicyResult>;
  invokeHostAction?: (rootSessionId: string, request: HostActionRequest, signal: AbortSignal) => Promise<HostActionResult>;
  hostSkillSource: (operation: HostSkillSourceOperation) => Promise<HostSkillSourceResult>;
  onDiagnostic?: (entry: WorkerDiagnostic) => void;
  /** Test seam; production uses the measured Task17 policy in WorkerRegistry. */
  workerCapacityPolicy?: WorkerCapacityPolicy;
}
const InternalSecretSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const HostSkillSourcePublicationSchema = z.strictObject({
  scope: z.enum(['workspace', 'agent']), sourceRevision: CounterSchema, expectedSourceRevision: CounterSchema, agentDirectoryId: EntityIdSchema.optional(),
}).refine(input => (input.scope === 'agent') === (input.agentDirectoryId !== undefined), 'Agent source publication selects its captured owner');
const HostSkillFilesApplySchema = z.strictObject({ scope: z.enum(['workspace', 'agent']), sourceRevision: CounterSchema, agentDirectoryId: EntityIdSchema });
const HostSkillSourceReconcileSchema = z.strictObject({ agentDirectoryId: EntityIdSchema });
const WorktreeLeaseRequestSchema = z.strictObject({ leaseId: z.string().min(1), directory: z.string().min(1) });
const ListeningAddressSchema = z.object({ address: z.literal('127.0.0.1'), port: z.number().int().min(1).max(65_535) });
class RequestError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string) { super(message); }
}
const capabilitiesResponse = { version: '1.0.0', engine: 'omp', capabilities: { streaming: true, casApprovals: true, midTurnSteering: true, followUpQueue: true, subagents: true, attachments: true, models: true, providers: true, agents: true, mcp: true, skills: true, statelessCompletion: true, shells: true } };
type ServiceHealthObservation = Pick<AgentServiceReady, 'engine' | 'version'> & { status: 'ready' | 'starting' };
type ServiceResponse =
  | ServiceHealthObservation
  | typeof capabilitiesResponse
  | HostNativePolicySnapshot
  | AgentServiceReady
  | z.infer<typeof HostAuthorizationScopeSchema | typeof HostWorkspaceRegisteredSchema | typeof HostSessionRelocationPreparedSchema | typeof HostSessionRelocationFinalizedSchema | typeof HostSessionRelocationPendingSchema>
  | WorkerInfo | { workers: RegisteredWorkerInfo[] }
  | SessionList | RuntimeSession | HistoryPage | SessionSnapshot | SessionDeleteAck | SessionForkResult | NativeEntryResult | Subagent[]
  | NativeArchiveInventory | NativeArchiveImported
  | ApprovalRequest | ApprovalRequest[] | QuestionRequest | QuestionRequest[] | { run: Run } | SessionControlAck
  | SteerAck | FollowUpAck
  | SessionBranchResult
  | MCPCatalogRead | MCPApplyResult | MCPOAuthResult
  | MCPConfigurationState | MCPConnectionTestResult | MCPWorkspaceReconnectResult | MCPSecretWriteResult
  | SkillsCatalogState | SkillsApplyResult | SkillExpandResult | SkillInstallResult
  | PluginCatalogState | PluginMutationResult | PluginDoctorResult | PluginMarketplaceState
  | PluginUpdateCheckResult | PluginUpgradePreviewResult | PluginMarketplaceSources
  | ExtensionInventoryState
  | ModelCatalog | ProviderCatalog | AgentCatalog
  | ProviderMutationResult | ModelMutationResult | ProviderCredentialMutationResult | AgentMutationResult
  | ProviderAccounts | ProviderOAuthMethods | ProviderOAuthResult | ProviderModelDiscoveryResult | ProviderModelEnrichResult
  | ProviderConfigurationRead
  | CacheWarmingState | CacheWarmingApplyResult | SessionCacheWarmingState | SessionCacheWarmingApplyResult | OmpSettingsState
  | WebSearchConfigState | WebSearchMutationResult
  | { sessionId: string; permissionMode: PermissionMode }
  | CompletionResult | CompletionCancelResult | UsageStats | UsageToolsResponse | ImageGenerateResult | ImageModelMutationResult
  | PrivateCredentialResolveResult | PrivateCredentialHandoffResult
  | CommandCatalogState | PromptTemplateCatalogState | FileResourceSkillCatalog | FileResourceExpandResult | FileResourcePromptInputResult
  | { sources: SkillSourceRevisions }
  | WorktreeLeaseAcquireResult
  | ShellJob | ShellSnapshot | ShellOutput | ShellStopResult | ShellStreamResponse | ShellStdinResult
  | SessionRecapListResponse | SubagentListResponse | SubagentTranscriptResponse | SubagentTreeCostResponse
  | SessionToolsCatalog;

function respondJson(response: ServerResponse, status: number, body: ServiceResponse): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}
function respondHealth(response: ServerResponse, ready: boolean): void {
  respondJson(response, 200, { status: ready ? 'ready' : 'starting', engine: 'omp', version: '1.0.0' });
}
function respondProblem(response: ServerResponse, status: number, code: ProblemCode, detail: string, details?: JsonObject): void {
  const problem: ProblemDetails = ProblemDetailsSchema.parse({
    type: `urn:ohpichamber:problem:${code}`, title: status >= 500 ? 'Agent Service unavailable' : 'Request refused',
    status, code, detail, retryable: status >= 500, details,
  });
  response.writeHead(status, { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(problem));
}
async function readBody<T>(request: IncomingMessage, schema: z.ZodType<T>): Promise<T> {
  const decoder = new StringDecoder('utf8');
  let bytes = 0;
  let text = '';
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 1_048_576) throw new RequestError(413, 'PAYLOAD_TOO_LARGE', 'Request exceeds the service limit');
    text += decoder.write(chunk);
  }
  text += decoder.end();
  try { return schema.parse(JSON.parse(text)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Request body is invalid'); }
}
function identity(value: string): string {
  try { return EntityIdSchema.parse(decodeURIComponent(value)); }
  catch { throw new RequestError(400, 'INVALID_REQUEST', 'Route identity is invalid'); }
}

export class AgentService {
  private readonly secret: Buffer;
  private readonly workers: WorkerRegistry;
  private readonly sessions: SessionRegistry;
  private readonly catalog: CatalogCoordinator;
  private readonly workspaceCatalogs: WorkspaceCatalogs;
  private readonly sessionWarming: SessionWarming;
  private readonly webSearch: WebSearchCoordinator;
  private readonly workspaceRoutes: WorkspaceRoutes;
  private readonly shell: ShellCoordinator;
  private readonly observationEpoch = randomUUID();
  private server: ReturnType<typeof createServer> | undefined;
  private ready = false;
  private closing = false;
  private stopping: Promise<void> | undefined;
  constructor(private readonly options: ServiceOptions) {
    this.secret = Buffer.from(InternalSecretSchema.parse(options.internalSecret), 'hex');
    this.workers = new WorkerRegistry({
      workerEntrypoint: options.workerEntrypoint, workerRuntime: options.workerRuntime, onDiagnostic: options.onDiagnostic, policyCheck: options.policyCheck, invokeHostAction: options.invokeHostAction,
      capacityPolicy: options.workerCapacityPolicy,
      isSessionIdle: rootSessionId => this.sessions?.isIdleForEviction(rootSessionId) ?? false,
      isSessionKeptWarm: rootSessionId => this.sessionWarming?.isKeptWarm(rootSessionId) ?? false,
      consumeApprovalGrant: (...args) => this.sessions.consumeApprovalGrant(...args),
      prepareBootstrap: async input => {
        this.sessions.assertBootstrapWritable(input);
        if (!this.ready) return input;
        if (!this.workspaceCatalogs.matches(input)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The session bootstrap does not match the admitted workspace');
        const workspace = this.workspaceCatalogs.get(input.workspaceId);
        const agentDirectoryId = input.agentDirectoryId ?? workspace.agentDirectoryId;
        return {
          ...input,
          agentDirectoryId,
          catalogRevision: this.workspaceCatalogs.revision(input.workspaceId, agentDirectoryId),
          observationEpoch: this.observationEpoch,
          sessionWarmingMode: this.sessionWarming.overrideMode(input.rootSessionId),
        };
      }, callbacks: {
        onOpened: (...args) => this.sessions.onOpened(...args),
        onEvents: (...args) => this.sessions.onEvents(...args),
        onInteraction: (...args) => this.sessions.onInteraction(...args),
        onExit: (...args) => { this.sessions.onExit(...args); this.catalog.retire(args[0], args[1]); },
        // Lifecycle projection failures must stay inside the offending worker: a
        // rejected child identity or persistence write stops that root instead of
        // becoming an unhandled rejection that exits the whole service.
        onSubagent: (...args) => {
          void this.sessions.onSubagent(...args).catch(() => { void this.workers.stop(args[0]).catch(() => { }); });
        },
      },
    });
    this.workspaceCatalogs = new WorkspaceCatalogs(
      options.stateDirectory,
      this.workers,
      () => this.catalog,
      rootSessionId => this.sessionWarming?.overrideMode(rootSessionId) ?? null,
    );
    this.sessionWarming = new SessionWarming(options.stateDirectory, this.workspaceCatalogs, this.workers);
    this.catalog = new CatalogCoordinator(options.stateDirectory, {
      readMcpConfiguration: async workspaceId => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp.configuration.read' });
        if (result.type !== 'mcp.configuration') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.configuration operation.');
        return result.configuration;
      },
      commitMcp: async (workspaceId, request, configuration) => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'persist', request, configuration } });
        if (result.type !== 'mcp' || result.result.type !== 'persisted' || result.result.configuration.persistedRevision !== configuration.persistedRevision) throw new WorkerOperationError(503, 'MCP_CONFIG_WRITE_FAILED', 'The persisted MCP configuration revision did not match the request');
      },
      probeMcp: async (workspaceId, serverId, configuration) => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'test', serverId, configuration } });
        if (result.type !== 'mcp' || result.result.type !== 'tested') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp connection test operation.');
        return result.result.result;
      },
      discoverMcpTools: async (workspaceId, configuration) => {
        const root = await this.workspaceCatalogs.stateless(workspaceId);
        const result = await this.workers.request(root, { type: 'mcp', operation: { type: 'discover', configuration } });
        if (result.type !== 'mcp' || result.result.type !== 'discovered') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp discovery operation.');
        return result.result.result;
      },
    });
    this.sessions = new SessionRegistry(
      options.stateDirectory,
      this.workers,
      options.approvalPolicyCommit,
      options.approvalPolicyLoad,
      options.permissionAuthority,
      sessionIds => this.sessionWarming.clear(sessionIds),
      // A completed /btw branch rekeys the session inside its worker. The
      // catalog and warming owners live outside the registry, so they follow
      // here; otherwise their root-addressed reads answer 503 after a Promote.
      async (previousSessionId, sessionId) => {
        this.catalog.rekey(previousSessionId, sessionId);
        await this.sessionWarming.rekey(previousSessionId, sessionId);
      },
    );
    this.webSearch = new WebSearchCoordinator(this.workspaceCatalogs, this.workers);
    this.workspaceRoutes = new WorkspaceRoutes(this.workspaceCatalogs, this.workers, this.catalog,
      this.sessions, options.stateDirectory, this.webSearch,
      (workspaceId, request) => this.workspaceCatalogs.applyPlugins(workspaceId, request, async (targets, revision, admission) => {
        const outcomes = await this.sessions.restartIdleSessions(targets, (input, launch) => this.admit(input, launch, admission));
        return outcomes.map((outcome, index) => {
          const target = targets[index];
          if (!target || target.rootSessionId !== outcome.rootSessionId) throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The restarted worker identity did not match the requested target');
          if (outcome.outcome === 'failed') return {
            worker: target, outcome: 'failed' as const, appliedRevision: null,
            error: { code: outcome.error.code, detail: 'The native session could not restart with the persisted plugin configuration.', retryable: outcome.error.status >= 500 }
          };
          const worker = { ...target, workerGeneration: outcome.workerGeneration };
          const appliedRevision = this.workers.bootstrap(outcome.rootSessionId)?.pluginRevision;
          if (appliedRevision === undefined || appliedRevision !== revision) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker did not apply the requested plugin revision');
          this.catalog.publishPluginRuntime(worker, appliedRevision);
          return { worker, outcome: 'applied' as const, appliedRevision };
        });
      }));
    this.shell = new ShellCoordinator(this.workers, this.sessions, this.observationEpoch, rootSessionId => {
      const input = this.workers.bootstrap(rootSessionId);
      return input !== undefined && this.workspaceCatalogs.matches(input);
    });
  }
  authorizationScope(rootSessionId: string) {
    const scope = this.workers.authorizationScope(rootSessionId);
    return scope === undefined ? undefined : HostAuthorizationScopeSchema.parse(scope);
  }
  private assertAdmissionScope(input: WorkerBootstrap): WorkerBootstrap | undefined {
    this.sessions.assertBootstrapWritable(input);
    const captured = this.workers.bootstrap(input.rootSessionId);
    if (captured && (captured.workspaceId !== input.workspaceId || captured.projectId !== input.projectId || captured.cwd !== input.cwd || captured.agentDirectory !== input.agentDirectory || (input.agentDirectoryId !== undefined && captured.agentDirectoryId !== input.agentDirectoryId))) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The captured admission scope does not match the requested bootstrap');
    return captured;
  }
  private async admit<T>(input: WorkerBootstrap, launch: (bootstrap: WorkerBootstrap) => Promise<T>, capturedAdmission?: CatalogAdmission): Promise<T> {
    const captured = this.assertAdmissionScope(input);
    // Fast refusal before any catalog work; `launch` checks again before spawn.
    this.workers.assertWorktreeLeaseAllows(input.cwd);
    if (capturedAdmission && (!captured || input.agentDirectoryId === undefined || !this.workspaceCatalogs.matches(input)))
      throw new WorkerOperationError(403, 'UNAUTHORIZED', 'A captured admission requires a matching agent directory');
    const agentDirectoryId = await this.workspaceCatalogs.registerRoot(input);
    if (!capturedAdmission) await this.catalog.registerWorkspace(input.workspaceId, agentDirectoryId);
    const load = async (authority: CatalogBootstrap): Promise<T> => this.webSearch.admit(agentDirectoryId, async () => {
      const pluginRevision = await this.workspaceCatalogs.pluginRevision(input.workspaceId);
      const bootstrap = WorkerBootstrapSchema.parse({
        ...input, ...authority, agentDirectoryId, pluginRevision,
        observationEpoch: this.observationEpoch, mcpConfigPath: join(input.cwd, '.omp', 'mcp.json'),
        sessionWarmingMode: this.sessionWarming.overrideMode(input.rootSessionId),
      });
      const result = await launch(bootstrap);
      try {
        const scope = this.workers.authorizationScope(bootstrap.rootSessionId);
        if (!scope || scope.agentDirectoryId !== agentDirectoryId) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The launched worker was not admitted under the expected agent directory');
        const generation = scope.workerGeneration;
        void this.registerCatalogWorker(bootstrap, generation).catch(async error => {
          const cause = error instanceof Error && error.message.trim() ? error.message : 'The worker catalogs could not be read';
          const code = error instanceof WorkerOperationError || error instanceof CatalogCoordinatorError ? error.code : 'SERVICE_UNAVAILABLE';
          this.sessions.registrationFailed(bootstrap.rootSessionId, generation, cause);
          this.options.onDiagnostic?.({ level: 'error', rootSessionId: bootstrap.rootSessionId, workerGeneration: generation, message: `Catalog registration failed (${code}): ${cause}` });
          await this.workers.stopGeneration(bootstrap.rootSessionId, generation).catch(() => { });
        });
        return result;
      } catch (error) {
        await this.workers.stop(bootstrap.rootSessionId);
        throw error;
      }
    });
    const authority = { workspaceId: input.workspaceId, agentDirectoryId, catalogRevision: this.workspaceCatalogs.revision(input.workspaceId, agentDirectoryId) };
    const reconcile = () => this.reconcileHostSkillSources(input.workspaceId, agentDirectoryId);
    return capturedAdmission ? capturedAdmission(authority, reconcile, load) : this.catalog.admit(authority, reconcile, load);
  }
  private async invokeHostSkillSource(operation: HostSkillSourceOperation): Promise<HostSkillSourceResult> {
    const result = HostSkillSourceResultSchema.parse(await this.options.hostSkillSource(operation));
    if (result.status === 'failed') {
      const status = result.code === 'INVALID_REQUEST' ? 400 : result.code === 'UNAUTHORIZED' ? 403 : result.code === 'NOT_FOUND' ? 404 : result.code === 'CATALOG_CONFLICT' ? 409 : 503;
      throw new WorkerOperationError(status, result.code === 'NOT_FOUND' ? 'SESSION_NOT_FOUND' : result.code, 'The Host skill source operation failed', result.currentRevision === undefined ? undefined : { currentRevision: result.currentRevision });
    }
    return result;
  }
  private async reconcileHostSkillSources(workspaceId: string, agentDirectoryId: string): Promise<SkillSourceRevisions> {
    const workspace = this.workspaceCatalogs.get(workspaceId);
    if (!workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The agent directory is not registered with this workspace');
    const result = await this.invokeHostSkillSource({ action: 'reconcile', projectId: workspace.projectId, workspaceId, agentDirectoryId });
    if (result.status !== 'reconciled') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The Host did not reconcile the skill sources');
    return result.sources;
  }
  private async registerCatalogWorker(input: WorkerBootstrap, generation: string): Promise<void> {
    // A completed `/btw` branch rekeys the session inside its worker, so these
    // closures must follow the live root instead of capturing the admitted one;
    // a captured root made the MCP and skill catalog routes answer 503 after a
    // Promote to Branch even though the worker was still serving the session.
    const admittedRoot = input.rootSessionId;
    const root = { current: admittedRoot, live: (): string => this.catalog.liveRoot(admittedRoot) };
    if (input.agentDirectoryId === undefined) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'A catalog worker requires an agent directory id');
    await this.catalog.register({
      identity: { rootSessionId: root.current, workspaceId: input.workspaceId, agentDirectoryId: input.agentDirectoryId, workerGeneration: generation },
      isLive: () => this.workers.authorizationScope(root.live())?.workerGeneration === generation,
      mcp: {
        read: async configuration => {
          const result = await this.workers.request(root.live(), { type: 'mcp', operation: { type: 'read', configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.catalog operation.');
          return result.result.catalog;
        },
        apply: async (request, configuration) => {
          const result = await this.workers.request(root.live(), { type: 'mcp', operation: { type: 'apply', request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.applied operation.');
          return result.result.result;
        },
        reconnect: async (serverId, request, configuration) => {
          const result = await this.workers.request(root.live(), { type: 'mcp', operation: { type: 'reconnect', serverId, request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.catalog operation.');
          return result.result.catalog;
        },
        oauthStatus: async (serverId, configuration) => {
          const result = await this.workers.request(root.live(), { type: 'mcp', operation: { type: 'oauth.status', serverId, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.oauth operation.');
          return result.result.result;
        },
        oauth: async (serverId, request, configuration) => {
          const result = await this.workers.request(root.live(), { type: 'mcp', operation: { type: 'oauth', serverId, request, configuration } }, generation);
          if (result.type !== 'mcp' || result.result.type !== 'oauth') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested mcp.oauth operation.');
          return result.result.result;
        },
      },
      skills: {
        read: async persistedSources => {
          const result = await this.workers.request(root.live(), { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.read', persistedSources } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested skills.catalog operation.');
          return result.result.catalog;
        },
        apply: async (sources, catalogRevision) => {
          const result = await this.workers.request(root.live(), { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.apply', request: { scope: 'workspace', sourceRevision: sources.workspace }, sources, catalogRevision } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested skills.applied operation.');
          return result.result.result;
        },
        expand: async request => {
          const result = await this.workers.request(root.live(), { type: 'catalog', revision: this.workspaceCatalogs.revision(input.workspaceId, input.agentDirectoryId), operation: { type: 'skills.expand', request } }, generation);
          if (result.type !== 'catalog' || result.result.type !== 'skills.expanded') throw new WorkerOperationError(503, 'INTERNAL_ERROR', 'The worker reply did not match the requested skills.expanded operation.');
          return result.result.result;
        },
      },
    });
    if (input.pluginRevision !== undefined) this.catalog.publishPluginRuntime({
      rootSessionId: root.live(),
      workspaceId: input.workspaceId, workerGeneration: generation
    }, input.pluginRevision);
  }
  async start(): Promise<void> {
    await this.catalog.initialize();
    await this.workspaceCatalogs.initialize();
    await this.sessions.initialize();
    await this.sessionWarming.initialize();
    const server = createServer((request, response) => { void this.handle(request, response); });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.options.port ?? 0, '127.0.0.1', resolve);
    });
    const address = ListeningAddressSchema.parse(server.address());
    process.stdout.write(`${JSON.stringify({ type: 'agent-service.listening', port: address.port })}\n`);
    let profile: string | undefined;
    try {
      profile = await mkdtemp(join(tmpdir(), 'ohpichamber-agent-ready-'));
      const cwd = join(profile, 'workspace');
      const agentDirectory = join(profile, 'agent');
      const sessionsDirectory = join(profile, 'sessions');
      await Promise.all([cwd, agentDirectory, sessionsDirectory].map(path => mkdir(path, { mode: 0o700 })));
      const rootSessionId = randomUUID();
      await this.workers.start({
        rootSessionId, projectId: randomUUID(), workspaceId: randomUUID(), cwd, agentDirectory, sessionsDirectory,
        env: { HOME: profile, XDG_CONFIG_HOME: join(profile, 'config'), XDG_DATA_HOME: join(profile, 'data') },
      });
      if (!await this.workers.stop(rootSessionId, { cooperativeGraceMs: process.platform === 'win32' ? 1_000 : 0 })) throw new Error('SDK readiness disposal failed');
      if (!this.closing) this.ready = true;
    } catch (error) { await this.stop(); throw error; }
    finally { if (profile) await rm(profile, { recursive: true, force: true }); }
  }
  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.ready = false;
    this.closing = true;
    this.stopping = (async () => {
      const server = this.server;
      this.server = undefined;
      // Close streams before waiting for HTTP shutdown or worker disposal.
      await this.sessions.close();
      const closed = server ? new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      }) : Promise.resolve();
      await this.workers.close();
      await closed;
    })();
    return this.stopping;
  }
  private authenticated(request: IncomingMessage): boolean {
    const peer = request.socket.remoteAddress;
    if (peer !== '127.0.0.1' && peer !== '::ffff:127.0.0.1') return false;
    const presented = InternalSecretSchema.safeParse(request.headers['x-internal-secret']);
    return presented.success && timingSafeEqual(Buffer.from(presented.data, 'hex'), this.secret);
  }
  private stream(request: IncomingMessage, response: ServerResponse, sessionId: string, url: URL): void {
    const header = request.headers['last-event-id'];
    if (Array.isArray(header)) throw new RequestError(400, 'INVALID_CURSOR', 'Only one event cursor is accepted');
    const cursors = url.searchParams.getAll('cursor');
    const cursor = cursors[0];
    if (cursors.length > 1 || (header !== undefined && cursor !== undefined && header !== cursor)) {
      throw new RequestError(400, 'INVALID_CURSOR', 'Event cursor sources disagree');
    }
    const journal = this.sessions.journal(sessionId);
    deliverSessionStream({ response, sessionId, journal, cursor: header ?? cursor });
  }
  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!this.authenticated(request)) { respondProblem(response, 403, 'UNAUTHORIZED', 'Private loopback authentication is required'); return; }
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/health') { respondHealth(response, this.ready && !this.closing); return; }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/ready') {
        if (!this.ready) respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'SDK initialization is unavailable');
        else respondJson(response, 200, AgentServiceReadySchema.parse({ ready: true, engine: 'omp', version: '1.0.0' }));
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/capabilities') {
        respondJson(response, 200, capabilitiesResponse);
        return;
      }
      if (!this.ready || this.closing) { respondProblem(response, 503, 'SERVICE_UNAVAILABLE', 'Agent Service is not admitting work'); return; }
      if (request.method === 'GET' && url.pathname === '/internal/archive/manifest') {
        respondJson(response, 200, await this.sessions.archiveManifest()); return;
      }
      const archiveExport = /^\/internal\/archive\/sessions\/([^/]+)$/.exec(url.pathname);
      if (request.method === 'GET' && archiveExport) {
        const controller = new AbortController();
        const cancel = () => { if (!response.writableEnded) controller.abort(); };
        response.once('close', cancel);
        try {
          const bundle = await this.sessions.exportArchive(identity(archiveExport[1]), controller.signal);
          response.writeHead(200, { 'Content-Type': 'application/x-tar', 'Content-Length': bundle.length, 'Cache-Control': 'no-store' });
          response.end(bundle);
        } finally { response.off('close', cancel); }
        return;
      }
      if (request.method === 'POST' && url.pathname === '/internal/archive/import') {
        const input = await readBody(request, ArchiveImportRequestSchema);
        const controller = new AbortController();
        const cancel = () => { if (!response.writableEnded) controller.abort(); };
        response.once('close', cancel);
        try { respondJson(response, 201, await this.sessions.importArchive(input, controller.signal)); }
        finally { response.off('close', cancel); }
        return;
      }
      // The Host holds its supervisor restarts before this call and releases the
      // id it supplied afterwards; the service never mints one.
      if (request.method === 'POST' && url.pathname === '/internal/worktree-leases') {
        const input = await readBody(request, WorktreeLeaseRequestSchema);
        respondJson(response, 201, await this.workers.acquireWorktreeLease(input.leaseId, input.directory));
        return;
      }
      const worktreeLease = /^\/internal\/worktree-leases\/([^/]+)$/.exec(url.pathname);
      if (worktreeLease && request.method === 'DELETE') {
        let leaseId: string;
        try { leaseId = decodeURIComponent(worktreeLease[1]); }
        catch { throw new RequestError(400, 'INVALID_REQUEST', 'Lease id is invalid'); }
        await this.workers.releaseWorktreeLease(leaseId);
        response.writeHead(204, { 'Cache-Control': 'no-store' });
        response.end();
        return;
      }
      // Admission must precede catalog, shell and direct worker paths, not merely public run routes.
      const sessionMutation = /^\/(?:api\/agent\/v1|internal)\/sessions\/([^/]+)/.exec(url.pathname);
      const archiveDeleteControl = request.method === 'POST' && /^\/internal\/sessions\/[^/]+\/worktree-archive-delete(?:\/retire)?$/.test(url.pathname);
      if (request.method !== 'GET' && request.method !== 'DELETE' && sessionMutation && !archiveDeleteControl) this.sessions.assertWritable(identity(sessionMutation[1]));
      const authorization = /^\/internal\/authorizations\/([^/]+)$/.exec(url.pathname);
      if (authorization && request.method === 'GET') {
        const scope = this.authorizationScope(identity(authorization[1]));
        if (!scope) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The session authorization scope is unavailable');
        respondJson(response, 200, scope); return;
      }
      const nativePolicy = /^\/internal\/workspaces\/([^/]+)\/authorization-policy$/.exec(url.pathname);
      if (nativePolicy && request.method === 'GET') {
        const workspaceId = identity(nativePolicy[1]);
        const workspace = this.workspaceCatalogs.get(workspaceId);
        const selectedAgentDirectoryId = url.searchParams.get('agentDirectoryId');
        const agentDirectoryId = selectedAgentDirectoryId === null ? workspace.agentDirectoryId : identity(selectedAgentDirectoryId);
        if (!workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The agent directory is not registered with this workspace');
        const selectedRoot = url.searchParams.get('rootSessionId');
        respondJson(response, 200, this.workers.authorizationPolicy(workspaceId, agentDirectoryId, selectedRoot === null ? undefined : identity(selectedRoot))); return;
      }
      const workspace = /^\/internal\/workspaces\/([^/]+)$/.exec(url.pathname);
      if (workspace && request.method === 'POST') {
        const workspaceId = identity(workspace[1]);
        const input = await readBody(request, HostWorkspaceBootstrapSchema);
        const registered = await this.workspaceCatalogs.register(workspaceId, input);
        await this.catalog.registerWorkspace(workspaceId, input.agentDirectoryId);
        respondJson(response, 201, HostWorkspaceRegisteredSchema.parse(registered)); return;
      }
      const skillSources = /^\/internal\/workspaces\/([^/]+)\/skill-sources$/.exec(url.pathname);
      if (skillSources && request.method === 'PUT') {
        const workspaceId = identity(skillSources[1]);
        const input = await readBody(request, HostSkillSourcePublicationSchema);
        const owner = this.workspaceCatalogs.get(workspaceId);
        if (input.agentDirectoryId !== undefined && !owner.agentDirectoryIds.includes(input.agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The skill source agent directory does not belong to the workspace');
        respondJson(response, 200, await this.catalog.publishSources(workspaceId, input)); return;
      }
      const skillFilesCommit = /^\/internal\/workspaces\/([^/]+)\/skill-files\/(commit|reconcile)$/.exec(url.pathname);
      if (skillFilesCommit && request.method === 'POST') {
        const workspaceId = identity(skillFilesCommit[1]);
        const workspace = this.workspaceCatalogs.get(workspaceId);
        if (skillFilesCommit[2] === 'reconcile') {
          const input = await readBody(request, HostSkillSourceReconcileSchema);
          if (!workspace.agentDirectoryIds.includes(input.agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The skill source agent directory does not belong to the workspace');
          const sources = await this.catalog.reconcileSkillSources(workspaceId, input.agentDirectoryId, () => this.reconcileHostSkillSources(workspaceId, input.agentDirectoryId));
          respondJson(response, 200, { sources }); return;
        }
        const input = await readBody(request, HostSkillSourceCommitSchema);
        if (!workspace.agentDirectoryIds.includes(input.agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The skill source agent directory does not belong to the workspace');
        const result = await this.catalog.commitSkillFiles(workspaceId, input, {
          reconcile: (workspaceId, agentDirectoryId) => this.reconcileHostSkillSources(workspaceId, agentDirectoryId),
          commit: async () => {
            const result = await this.invokeHostSkillSource({ action: 'commit', projectId: workspace.projectId, workspaceId, ...input });
            if (result.status !== 'committed') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The Host did not commit the skill files');
            return result.sourceRevision;
          },
        });
        respondJson(response, 200, result); return;
      }
      const skillFilesApply = /^\/internal\/workspaces\/([^/]+)\/skill-files\/apply$/.exec(url.pathname);
      if (skillFilesApply && request.method === 'POST') {
        const workspaceId = identity(skillFilesApply[1]);
        const input = await readBody(request, HostSkillFilesApplySchema);
        const owner = this.workspaceCatalogs.get(workspaceId);
        if (!owner.agentDirectoryIds.includes(input.agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED', 'The skill file agent directory does not belong to the workspace');
        respondJson(response, 200, await this.catalog.applySkillsWorkspace(workspaceId, input.agentDirectoryId, { scope: input.scope, sourceRevision: input.sourceRevision }, (workspaceId, agentDirectoryId) => this.reconcileHostSkillSources(workspaceId, agentDirectoryId))); return;
      }
      const privateBranch = /^\/internal\/sessions\/([^/]+)\/branch$/.exec(url.pathname);
      if (privateBranch && request.method === 'POST') {
        respondJson(response, 200, await this.sessions.branch(identity(privateBranch[1]), await readBody(request, SessionBranchRequestSchema))); return;
      }
      const pendingRelocation = /^\/internal\/sessions\/([^/]+)\/relocation$/.exec(url.pathname);
      if (pendingRelocation && request.method === 'GET') {
        respondJson(response, 200, HostSessionRelocationPendingSchema.parse(this.sessions.relocation(identity(pendingRelocation[1])))); return;
      }
      const prepareRelocation = /^\/internal\/sessions\/([^/]+)\/relocation\/prepare$/.exec(url.pathname);
      if (prepareRelocation && request.method === 'POST') {
        const sessionId = identity(prepareRelocation[1]);
        const input = await readBody(request, HostSessionRelocationPrepareSchema);
        if (input.destination.rootSessionId !== sessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity does not match the route');
        respondJson(response, 200, HostSessionRelocationPreparedSchema.parse(await this.sessions.prepareRelocation(sessionId, input,
          (bootstrap, launch) => this.admit(bootstrap, launch)))); return;
      }
      const finalizeRelocation = /^\/internal\/sessions\/([^/]+)\/relocation\/finalize$/.exec(url.pathname);
      if (finalizeRelocation && request.method === 'POST') {
        const input = await readBody(request, HostSessionRelocationFinalizeSchema);
        respondJson(response, 200, HostSessionRelocationFinalizedSchema.parse(await this.sessions.finalizeRelocation(identity(finalizeRelocation[1]), input,
          (bootstrap, launch) => this.admit(bootstrap, launch)))); return;
      }
      const privateReopen = /^\/internal\/sessions\/([^/]+)\/reopen$/.exec(url.pathname);
      if (privateReopen && request.method === 'POST') {
        const rootSessionId = identity(privateReopen[1]);
        const { displayPath, ...input } = await readBody(request, SessionReopenRequestSchema);
        if (input.rootSessionId !== rootSessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity does not match the route');
        this.assertAdmissionScope(input);
        // A healthy live root is already admitted: return it instead of registering and reconciling again.
        // A reopen without an agent-directory id keeps the admission path, which resolves the id it must compare.
        const pendingOpening = this.sessions.openingPromise(input.rootSessionId);
        if (pendingOpening) { respondJson(response, 200, await pendingOpening); return; }
        const live = input.agentDirectoryId === undefined ? undefined : await this.sessions.liveReopenRuntime({ ...input, displayPath });
        if (live) { respondJson(response, 200, live); return; }
        respondJson(response, 200, await this.admit(input, bootstrap => this.sessions.reopen({ ...bootstrap, displayPath })));
        return;
      }
      if (request.method === 'POST' && url.pathname === '/internal/sessions') {
        const { displayPath, deferred, ...input } = await readBody(request, HostSessionBootstrapSchema);
        this.workers.assertWorktreeLeaseAllows(input.cwd);
        if (deferred) {
          const session = await this.sessions.createInitialSession({ ...input, displayPath }, () =>
            this.admit(input, bootstrap => this.sessions.openWorker({ ...bootstrap, displayPath }))
          );
          respondJson(response, 201, session); return;
        }
        respondJson(response, 201, await this.admit(input, bootstrap => this.sessions.open({ ...bootstrap, displayPath }))); return;
      }
      if (request.method === 'GET' && url.pathname === '/api/agent/v1/sessions') {
        const workspaceId = EntityIdSchema.safeParse(url.searchParams.get('workspaceId'));
        if (!workspaceId.success) throw new RequestError(400, 'INVALID_REQUEST', 'Workspace identity is required');
        respondJson(response, 200, await this.sessions.list(this.workspaceCatalogs.get(workspaceId.data))); return;
      }
      const sessionTitle = /^\/api\/agent\/v1\/sessions\/([^/]+)\/title$/.exec(url.pathname);
      if (sessionTitle && request.method === 'PATCH') {
        const sessionId = identity(sessionTitle[1]);
        const input = await readBody(request, SessionTitleRequestSchema);
        respondJson(response, 200, await this.sessions.rename(sessionId, this.workspaceCatalogs.get(input.workspaceId), input.title)); return;
      }
      const subagents = /^\/api\/agent\/v1\/subagents$/.exec(url.pathname);
      if (subagents && request.method === 'GET') {
        const sessionId = EntityIdSchema.safeParse(url.searchParams.get('sessionId'));
        if (!sessionId.success) throw new RequestError(400, 'INVALID_REQUEST', 'Session identity is required');
        respondJson(response, 200, this.sessions.listSubagents(sessionId.data)); return;
      }
      const privateWorktreeDelete = /^\/internal\/sessions\/([^/]+)\/worktree-archive-delete$/.exec(url.pathname);
      if (privateWorktreeDelete && request.method === 'POST') {
        const input = await readBody(request, z.strictObject({
          operationId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
          agentDirectoryId: EntityIdSchema, sessionIds: z.array(EntityIdSchema).min(1)
        }));
        respondJson(response, 200, await this.sessions.deleteWorktreeArchiveFamily(identity(privateWorktreeDelete[1]), input)); return;
      }
      const privateWorktreeDeleteRetire = /^\/internal\/sessions\/([^/]+)\/worktree-archive-delete\/retire$/.exec(url.pathname);
      if (privateWorktreeDeleteRetire && request.method === 'POST') {
        const input = await readBody(request, z.strictObject({
          operationId: EntityIdSchema, projectId: EntityIdSchema, workspaceId: EntityIdSchema,
          agentDirectoryId: EntityIdSchema, sessionIds: z.array(EntityIdSchema).min(1)
        }));
        await this.sessions.retireWorktreeArchiveDelete(identity(privateWorktreeDeleteRetire[1]), input);
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      const privateEntry = /^\/internal\/sessions\/([^/]+)\/native-entry\/([^/]+)$/.exec(url.pathname);
      if (privateEntry && request.method === 'GET') { respondJson(response, 200, await this.sessions.resolveNativeEntry(identity(privateEntry[1]), identity(privateEntry[2]))); return; }
      const privateFork = /^\/internal\/sessions\/([^/]+)\/fork$/.exec(url.pathname);
      if (privateFork && request.method === 'POST') {
        const sourceSessionId = identity(privateFork[1]);
        const input = SessionForkRequestSchema.parse(await readBody(request, SessionForkRequestSchema));
        if (input.sourceSessionId !== sourceSessionId) throw new RequestError(400, 'INVALID_REQUEST', 'Fork source identity does not match the route');
        const ack = HostSessionForkAckSchema.parse(await this.sessions.fork(sourceSessionId, input.entryId, input.mode, input.forkTicketId));
        respondJson(response, 201, ack); return;
      }
      const privateRun = /^\/internal\/sessions\/([^/]+)\/runs$/.exec(url.pathname);
      if (privateRun && request.method === 'POST') {
        const operation = await readBody(request, WorkerOperationSchema.options[0]);
        respondJson(response, 202, { run: await this.sessions.prompt(identity(privateRun[1]), operation) }); return;
      }
      const streamingPrompt = /^\/internal\/sessions\/([^/]+)\/(steer|follow-up)$/.exec(url.pathname);
      if (streamingPrompt && request.method === 'POST') {
        const input = await readBody(request, HostStreamingPromptRequestSchema);
        const operation = streamingPrompt[2] === 'steer' ? { type: 'steer' as const, ...input } : { type: 'follow-up' as const, ...input };
        respondJson(response, 202, await this.sessions.streamingPrompt(identity(streamingPrompt[1]), operation)); return;
      }
      const approvalList = /^\/api\/agent\/v1\/sessions\/([^/]+)\/approvals$/.exec(url.pathname);
      if (approvalList && request.method === 'GET') { respondJson(response, 200, this.sessions.approvals(identity(approvalList[1]))); return; }
      const approvalRespond = /^\/api\/agent\/v1\/sessions\/([^/]+)\/approvals\/([^/]+)\/respond$/.exec(url.pathname);
      if (approvalRespond && request.method === 'POST') {
        const sessionId = identity(approvalRespond[1]);
        respondJson(response, 200, await this.sessions.resolveApproval(sessionId, identity(approvalRespond[2]), await readBody(request, ApprovalReplySchema))); return;
      }
      const questionList = /^\/api\/agent\/v1\/sessions\/([^/]+)\/questions$/.exec(url.pathname);
      if (questionList && request.method === 'GET') { respondJson(response, 200, this.sessions.questions(identity(questionList[1]))); return; }
      const questionRespond = /^\/api\/agent\/v1\/sessions\/([^/]+)\/questions\/([^/]+)\/respond$/.exec(url.pathname);
      if (questionRespond && request.method === 'POST') {
        const sessionId = identity(questionRespond[1]);
        respondJson(response, 200, await this.sessions.resolveQuestion(sessionId, identity(questionRespond[2]), await readBody(request, QuestionReplySchema))); return;
      }
      // The Host pushes a mode change here so a switch reaches approvals already waiting.
      const privatePermissionMode = /^\/internal\/sessions\/([^/]+)\/permission-mode$/.exec(url.pathname);
      if (privatePermissionMode && request.method === 'POST') {
        const sessionId = identity(privatePermissionMode[1]);
        const { mode } = await readBody(request, HostSessionPermissionModeSchema);
        this.sessions.reconsiderPermissions(sessionId);
        respondJson(response, 200, { sessionId, permissionMode: mode }); return;
      }
      const controlRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/control$/.exec(url.pathname);
      if (controlRoute && request.method === 'POST') {
        const sessionId = identity(controlRoute[1]);
        const control = SessionControlRequestSchema.parse(await readBody(request, SessionControlRequestSchema));
        if (control.type === 'abort') {
          respondJson(response, 200, { run: await this.sessions.abort(sessionId, control.runId) }); return;
        }
        if (control.type === 'mode.set') {
          respondJson(response, 200, SessionControlAckSchema.parse({ type: 'mode.set', mode: await this.sessions.setMode(sessionId, control.mode) })); return;
        }
        if (control.type === 'goal') {
          respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.goal(sessionId, control))); return;
        }
        if (control.type === 'compact') {
          respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.compact(sessionId, control.instructions))); return;
        }
        if (control.type === 'command') {
          respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.command(sessionId, control.text))); return;
        }
        if (control.type === 'btw.ask') { respondJson(response, 202, SessionControlAckSchema.parse(await this.sessions.btwAsk(sessionId, control.question, control.recordId))); return; }
        if (control.type === 'btw.cancel') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.btwCancel(sessionId, control.recordId))); return; }
        if (control.type === 'btw.branch') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.btwBranch(sessionId, control.recordId))); return; }
        if (control.type === 'subagent.steer') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.steerSubagent(sessionId, control.subagentId, control.message))); return; }
        if (control.type === 'subagent.cancel') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.cancelSubagent(sessionId, control.subagentId))); return; }
        if (control.type === 'subagent.revive') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.reviveSubagent(sessionId, control.subagentId, control.message))); return; }
        if (control.type === 'loop.stop') { respondJson(response, 200, SessionControlAckSchema.parse(await this.sessions.stopLoop(sessionId))); return; }
      }
      const sessionRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)(?:\/(snapshot|history|events)|\/(runs)(?:\/([^/]+)\/abort)?)?$/.exec(url.pathname);
      if (sessionRoute) {
        const sessionId = identity(sessionRoute[1]);
        const action = sessionRoute[2] ?? sessionRoute[3];
        if (action === undefined && request.method === 'GET') { respondJson(response, 200, this.sessions.runtime(sessionId)); return; }
        if (action === undefined && request.method === 'DELETE') { respondJson(response, 200, await this.sessions.delete(sessionId)); return; }
        if (action === 'snapshot' && request.method === 'GET') { respondJson(response, 200, await this.sessions.snapshot(sessionId)); return; }
        if (action === 'history' && request.method === 'GET') {
          const parsed = HistoryPageRequestSchema.safeParse({
            sessionId,
            cursor: url.searchParams.get('cursor') ?? undefined,
            leafTurnId: url.searchParams.get('leafTurnId') ?? undefined,
            limit: url.searchParams.has('limit') ? Number(url.searchParams.get('limit')) : undefined,
          });
          if (!parsed.success) throw new RequestError(400, 'INVALID_REQUEST', 'History request is invalid');
          respondJson(response, 200, await this.sessions.history(parsed.data)); return;
        }
        if (action === 'events' && request.method === 'GET') { this.stream(request, response, sessionId, url); return; }
        if (action === 'runs' && request.method === 'POST') {
          if (sessionRoute[4] !== undefined) { respondJson(response, 200, { run: await this.sessions.abort(sessionId, identity(sessionRoute[4])) }); return; }
          const prompt = await readBody(request, PromptRequestSchema);
          respondJson(response, 202, { run: await this.sessions.prompt(sessionId, { type: 'prompt', runId: randomUUID(), request: prompt }) }); return;
        }
      }
      const sessionWarmingRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/cache-warming$/.exec(url.pathname);
      if (sessionWarmingRoute) {
        const sessionId = identity(sessionWarmingRoute[1]);
        const scope = this.sessions.warmingScope(sessionId);
        if (request.method === 'GET') {
          respondJson(response, 200, await this.sessionWarming.read(scope.rootSessionId, scope.workspaceId));
          return;
        }
        if (request.method === 'PUT') {
          this.sessions.assertWritable(scope.rootSessionId);
          const body = await readBody(request, SessionCacheWarmingUpdateRequestSchema);
          respondJson(response, 200, await this.sessionWarming.update(scope.rootSessionId, scope.workspaceId, body));
          return;
        }
      }
      const surfaceResponse = await sessionSurfaceRoute(this.sessions, request, url);
      if (surfaceResponse) { respondJson(response, surfaceResponse.status, surfaceResponse.body); return; }
      const workspaceResponse = await this.workspaceRoutes.handle(request, url, readBody);
      if (workspaceResponse) { respondJson(response, workspaceResponse.status, workspaceResponse.body); return; }
      const shellResponse = await this.shell.handle(request, url, readBody);
      if (shellResponse) { respondJson(response, shellResponse.status, shellResponse.body); return; }
      const oauthRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/mcp\/servers\/([^/]+)\/oauth$/.exec(url.pathname);
      if (oauthRoute) {
        const addressedId = identity(oauthRoute[1]);
        const rootSessionId = this.workers.bootstrap(addressedId) ? addressedId : this.sessions.runtime(addressedId).rootSessionId;
        const serverId = identity(oauthRoute[2]);
        if (request.method === 'GET') { respondJson(response, 200, await this.catalog.oauthStatus(rootSessionId, serverId)); return; }
        if (request.method === 'POST') { respondJson(response, 200, await this.catalog.oauth(rootSessionId, serverId, await readBody(request, MCPOAuthRequestSchema))); return; }
      }
      const catalogRoute = /^\/api\/agent\/v1\/sessions\/([^/]+)\/(mcp|skills)\/(catalog|config|apply|expand|servers\/([^/]+)\/reconnect)$/.exec(url.pathname);
      if (catalogRoute) {
        const addressedId = identity(catalogRoute[1]);
        const sessionId = this.workers.bootstrap(addressedId) ? addressedId : this.sessions.runtime(addressedId).rootSessionId;
        const kind = catalogRoute[2];
        const action = catalogRoute[3];
        if (kind === 'mcp' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readMcp(sessionId)); return; }
        if (kind === 'mcp' && action === 'config' && request.method === 'PUT') { respondJson(response, 200, await this.catalog.configure(sessionId, await readBody(request, MCPConfigureRequestSchema))); return; }
        if (kind === 'mcp' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applyMcp(sessionId, await readBody(request, MCPApplyRequestSchema))); return; }
        if (kind === 'mcp' && catalogRoute[4] !== undefined && request.method === 'POST') { respondJson(response, 200, await this.catalog.reconnect(sessionId, identity(catalogRoute[4]), await readBody(request, MCPReconnectRequestSchema))); return; }
        if (kind === 'skills' && action === 'catalog' && request.method === 'GET') { respondJson(response, 200, await this.catalog.readSkills(sessionId)); return; }
        if (kind === 'skills' && action === 'apply' && request.method === 'POST') { respondJson(response, 200, await this.catalog.applySkills(sessionId, await readBody(request, SkillsApplyRequestSchema), (workspaceId, agentDirectoryId) => this.reconcileHostSkillSources(workspaceId, agentDirectoryId))); return; }
        if (kind === 'skills' && action === 'expand' && request.method === 'POST') { respondJson(response, 200, await this.catalog.expand(sessionId, await readBody(request, SkillExpandRequestSchema))); return; }
      }
      if (request.method === 'GET' && url.pathname === '/internal/workers') { respondJson(response, 200, { workers: this.workers.list() }); return; }
      if (request.method === 'POST' && url.pathname === '/internal/workers') {
        const input = await readBody(request, WorkerBootstrapSchema);
        respondJson(response, 201, await this.admit(input, bootstrap => this.workers.start(bootstrap))); return;
      }
      if (request.method === 'POST' && url.pathname === '/internal/workers/host-tools') {
        const input = await readBody(request, z.strictObject({ tools: z.record(z.string(), z.boolean()) }));
        await this.workers.broadcastOperation({ type: 'host-tools.configure', tools: input.tools });
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      const restart = /^\/internal\/workers\/([^/]+)\/restart$/.exec(url.pathname);
      if (restart && request.method === 'POST') {
        const input = await readBody(request, WorkerBootstrapSchema);
        if (input.rootSessionId !== identity(restart[1])) throw new RequestError(400, 'INVALID_REQUEST', 'Worker identity does not match the route');
        respondJson(response, 200, await this.admit(input, async bootstrap => {
          if (!await this.sessions.restart(bootstrap)) return this.workers.start(bootstrap, true);
          const info = this.workers.info(bootstrap.rootSessionId);
          if (!info || info.state !== 'ready') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker was not ready to restart');
          return info;
        })); return;
      }
      const stop = /^\/internal\/workers\/([^/]+)$/.exec(url.pathname);
      if (stop && request.method === 'DELETE') { await this.workers.evict(identity(stop[1])); response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return; }
      respondProblem(response, 404, 'NOT_IMPLEMENTED', 'No matching private route');
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (response.headersSent) { response.destroy(); return; }
      if (error instanceof CatalogCoordinatorError) {
        respondProblem(response, error.status, error.code, error.message, JsonObjectSchema.parse(error.details));
      } else if (error instanceof RequestError || error instanceof ProjectionError || error instanceof SessionReferenceError || error instanceof WorkerOperationError) {
        respondProblem(response, error.status, error.code, error.message, error instanceof WorkerOperationError || error instanceof ProjectionError ? error.details : undefined);
      } else respondProblem(response, 503, 'SERVICE_UNAVAILABLE', error instanceof Error && error.message ? error.message : 'The session request failed without a reported cause');
    }
  }
}
