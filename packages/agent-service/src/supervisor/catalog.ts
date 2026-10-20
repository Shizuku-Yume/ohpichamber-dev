import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CatalogWorkerIdentitySchema, CounterSchema, EntityIdSchema,
  MCPConfigurationStateSchema, MCPConfigSchema,
  MCPConfigureRequestSchema, MCPApplyRequestSchema, MCPReconnectRequestSchema,
  SkillsApplyRequestSchema, SkillExpandRequestSchema, SkillSourceRevisionsSchema,
  MCPWorkerApplyOutcomeSchema, SkillsWorkerApplyOutcomeSchema,
  MCPOAuthRequestSchema, MCPOAuthResultSchema,
} from '@openchamber/agent-contract';
import type {
  CatalogWorkerIdentity as ContractCatalogWorkerIdentity, MCPConfigurationState,
  MCPConfigureRequest, MCPApplyRequest, MCPReconnectRequest, MCPCatalogRead,
  MCPWorkerApplyOutcome, MCPApplyResult, SkillsCatalogState, SkillsApplyResult,
  SkillsWorkerApplyOutcome, SkillExpandRequest, SkillExpandResult, SkillSourceRevisions,
  SkillInstallResult, SkillSourceScope, CatalogOperationError, MCPOAuthRequest, MCPOAuthResult,
} from '@openchamber/agent-contract';
import { MCPWorkspaceReconnectResultSchema } from '@openchamber/agent-contract';
import type { MCPConnectionTestResult, MCPWorkspaceReconnectResult } from '@openchamber/agent-contract';
import { WorkerOperationError } from './workers.ts';
import { PluginWorkerApplyOutcomeSchema, type PluginWorkerApplyOutcome, type PluginRuntimeState } from '@openchamber/agent-contract';
import type { HostSkillSourceCommit } from './file-resources-host-protocol.ts';
interface SkillSourcePublication { scope: 'workspace' | 'agent'; sourceRevision: string; expectedSourceRevision: string; agentDirectoryId?: string; }
type SkillSourceReconciler = (workspaceId: string, agentDirectoryId: string) => Promise<SkillSourceRevisions>;

const CatalogWorkerIdentityWithOwnerSchema = CatalogWorkerIdentitySchema.extend({ agentDirectoryId: EntityIdSchema });
export type CatalogWorkerIdentity = z.infer<typeof CatalogWorkerIdentityWithOwnerSchema>;

export interface CatalogWorker {
  identity: CatalogWorkerIdentity;
  isLive(): boolean | Promise<boolean>;
  mcp: {
    read(configuration: MCPConfigurationState): Promise<MCPCatalogRead>;
    apply(request: MCPApplyRequest, configuration: MCPConfigurationState): Promise<MCPWorkerApplyOutcome>;
    reconnect(serverId: string, request: MCPReconnectRequest, configuration: MCPConfigurationState): Promise<MCPCatalogRead>;
    oauthStatus(serverId: string, configuration: MCPConfigurationState): Promise<MCPOAuthResult>;
    oauth(serverId: string, request: MCPOAuthRequest, configuration: MCPConfigurationState): Promise<MCPOAuthResult>;
  };
  skills: {
    read(sources: SkillSourceRevisions): Promise<SkillsCatalogState>;
    apply(sources: SkillSourceRevisions, catalogRevision: string): Promise<SkillsWorkerApplyOutcome>;
    expand(request: SkillExpandRequest): Promise<SkillExpandResult>;
  };
}

export interface CatalogCoordinatorOptions {
  readMcpConfiguration(workspaceId: string): Promise<MCPConfigurationState | null>;
  commitMcp(workspaceId: string, request: MCPConfigureRequest, configuration: MCPConfigurationState): Promise<void>;
}

export interface CatalogBootstrap {
  workspaceId: string;
  agentDirectoryId: string;
  mcpConfiguration: MCPConfigurationState;
  skillSources: SkillSourceRevisions;
  catalogRevision: string;
}

export interface CatalogBootstrapInput {
  workspaceId: string;
  agentDirectoryId: string;
  catalogRevision: string;
}
export type CatalogAdmission = <T>(input: CatalogBootstrapInput, reconcile: () => Promise<SkillSourceRevisions>, launch: (bootstrap: CatalogBootstrap) => Promise<T>) => Promise<T>;

export type CatalogCoordinatorErrorCode =
  | 'CATALOG_CONFLICT' | 'MCP_CONFIG_WRITE_FAILED' | 'MCP_APPLY_FAILED'
  | 'MCP_RECONNECT_FAILED' | 'SKILL_APPLY_FAILED' | 'SERVICE_UNAVAILABLE' | 'WORKER_GENERATION_CONFLICT';

export class CatalogCoordinatorError extends Error {
  constructor(
    readonly status: 409 | 503,
    readonly code: CatalogCoordinatorErrorCode,
    readonly details: { result?: MCPApplyResult | SkillsApplyResult | (MCPWorkspaceReconnectResult & { kind?: never }); currentRevision?: string },
  ) {
    super(code);
    this.name = 'CatalogCoordinatorError';
  }
}

const WorkspaceStateSchema = z.strictObject({
  workspaceId: EntityIdSchema,
  agentDirectoryIds: z.array(EntityIdSchema),
  configuration: MCPConfigurationStateSchema,
  workspaceSourceRevision: CounterSchema,
});
const AgentStateSchema = z.strictObject({ agentDirectoryId: EntityIdSchema, sourceRevision: CounterSchema });
const StateSchema = z.strictObject({ workspaces: z.array(WorkspaceStateSchema), agents: z.array(AgentStateSchema) });
type WorkspaceState = z.infer<typeof WorkspaceStateSchema>;
type AgentState = z.infer<typeof AgentStateSchema>;

function aggregate(outcomes: Array<{ outcome: string }>): 'applied' | 'partial' | 'failed' | 'no-active-workers' {
  const applied = outcomes.some(item => item.outcome === 'applied');
  const failed = outcomes.some(item => item.outcome === 'failed');
  return applied ? (failed ? 'partial' : 'applied') : (failed ? 'failed' : 'no-active-workers');
}

function nextRevision(revision: string): string {
  CounterSchema.parse(revision);
  return (BigInt(revision) + 1n).toString();
}

function ownerIdentity(worker: CatalogWorker): ContractCatalogWorkerIdentity {
  return {
    rootSessionId: worker.identity.rootSessionId,
    workspaceId: worker.identity.workspaceId,
    workerGeneration: worker.identity.workerGeneration,
  };
}

function operationError(error: Error | undefined, fallbackCode: string, detail: string): CatalogOperationError {
  if (error instanceof WorkerOperationError || error instanceof CatalogCoordinatorError) {
    return { code: error.code, detail, retryable: error.status >= 500 };
  }
  return { code: fallbackCode, detail, retryable: true };
}

export class CatalogCoordinator {
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly agents = new Map<string, AgentState>();
  private readonly workers = new Map<string, CatalogWorker>();
  private readonly mcpSnapshots = new Map<string, MCPCatalogRead>();
  private readonly skillSnapshots = new Map<string, SkillsCatalogState>();
  private readonly pluginSnapshots = new Map<string, PluginRuntimeState>();
  private readonly hydrating = new Map<string, Promise<void>>();
  private tail: Promise<void> = Promise.resolve();
  private initialized = false;
  private readonly file: string;

  constructor(private readonly stateDirectory: string, private readonly options: CatalogCoordinatorOptions) {
    this.file = join(stateDirectory, 'catalog-state.json');
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      for (const agent of state.agents) {
        if (this.agents.has(agent.agentDirectoryId)) throw new Error('Duplicate catalog agent owner');
        this.agents.set(agent.agentDirectoryId, agent);
      }
      for (const workspace of state.workspaces) {
        if (this.workspaces.has(workspace.workspaceId) || workspace.agentDirectoryIds.length === 0
          || workspace.agentDirectoryIds.some(agentDirectoryId => !this.agents.has(agentDirectoryId))) {
          throw new Error('Invalid catalog workspace owner');
        }
        if (workspace.configuration.workspaceId !== workspace.workspaceId) throw new Error('Invalid catalog configuration owner');
        this.workspaces.set(workspace.workspaceId, workspace);
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
    }
    this.initialized = true;
  }

  /** Durable private mapping only. Native MCP state is hydrated lazily after Host admission. */
  async registerWorkspace(workspaceId: string, agentDirectoryId: string): Promise<void> {
    return this.serial(async () => {
      EntityIdSchema.parse(workspaceId);
      EntityIdSchema.parse(agentDirectoryId);
      const existing = this.workspaces.get(workspaceId);
      const agent = this.agents.get(agentDirectoryId);
      if (!agent) this.agents.set(agentDirectoryId, { agentDirectoryId, sourceRevision: '0' });
      if (existing) {
        if (existing.agentDirectoryIds.includes(agentDirectoryId)) return;
        existing.agentDirectoryIds.push(agentDirectoryId);
        try { await this.persist(); }
        catch {
          existing.agentDirectoryIds.pop();
          if (!agent) this.agents.delete(agentDirectoryId);
          throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
        }
        return;
      }
      this.workspaces.set(workspaceId, {
        workspaceId,
        agentDirectoryIds: [agentDirectoryId],
        configuration: { workspaceId, persistedRevision: '0', config: { servers: [] } },
        workspaceSourceRevision: '0',
      });
      try { await this.persist(); }
      catch (error) {
        this.workspaces.delete(workspaceId);
        if (!agent) this.agents.delete(agentDirectoryId);
        throw error;
      }
    });
  }

  /** Holds workspace admission behind all serialized owner updates. */
  async admit<T>(input: CatalogBootstrapInput, reconcile: () => Promise<SkillSourceRevisions>, launch: (bootstrap: CatalogBootstrap) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.reconcileSourcesNow(input.workspaceId, input.agentDirectoryId, await reconcile());
      return launch(await this.prepareBootstrapNow(input));
    });
  }

  async prepareBootstrap(input: CatalogBootstrapInput): Promise<CatalogBootstrap> {
    return this.serial(() => this.prepareBootstrapNow(input));
  }

  async register(worker: CatalogWorker): Promise<void> {
    CatalogWorkerIdentityWithOwnerSchema.parse(worker.identity);
    const workspace = this.workspaces.get(worker.identity.workspaceId);
    if (!workspace || !workspace.agentDirectoryIds.includes(worker.identity.agentDirectoryId)) {
      throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
    }
    const previous = this.workers.get(worker.identity.rootSessionId);
    if (previous && previous.identity.workerGeneration !== worker.identity.workerGeneration) this.dropWorker(previous);
    this.workers.set(worker.identity.rootSessionId, worker);
    try {
      await this.ensureHydrated(worker.identity.workspaceId, worker.identity.agentDirectoryId);
      const configuration = workspace.configuration;
      const sources = this.sourcesFor(worker);
      const generation = worker.identity.workerGeneration;
      const [mcp, skills] = await Promise.all([worker.mcp.read(configuration), worker.skills.read(sources)]);
      if (this.workers.get(worker.identity.rootSessionId)?.identity.workerGeneration !== generation || !await this.live(worker)) {
        this.dropWorker(worker);
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      this.mcpSnapshots.set(worker.identity.rootSessionId, mcp);
      this.skillSnapshots.set(worker.identity.rootSessionId, skills);
    } catch {
      this.dropWorker(worker);
      throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
    }
  }

  retire(rootSessionId: string, generation: string): void {
    const worker = this.workers.get(rootSessionId);
    if (worker?.identity.workerGeneration === generation) this.dropWorker(worker);
  }

  async readMcp(rootSessionId: string): Promise<MCPCatalogRead> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      const generation = worker.identity.workerGeneration;
      const result = await worker.mcp.read(this.workspace(worker.identity.workspaceId).configuration);
      if (this.workers.get(rootSessionId)?.identity.workerGeneration !== generation || !await this.live(worker)) {
        this.dropWorker(worker);
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      this.mcpSnapshots.set(rootSessionId, result);
      return result;
    });
  }
  async readSkills(rootSessionId: string): Promise<SkillsCatalogState> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      const generation = worker.identity.workerGeneration;
      const result = await worker.skills.read(this.sourcesFor(worker));
      if (this.workers.get(rootSessionId)?.identity.workerGeneration !== generation || !await this.live(worker)) {
        this.dropWorker(worker);
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      this.skillSnapshots.set(rootSessionId, result);
      return result;
    });
  }
  async pluginRuntime(workspaceId: string): Promise<PluginRuntimeState[]> {
    const targets = await this.snapshotWorkers(worker => worker.identity.workspaceId === workspaceId);
    return targets.map(worker => this.pluginSnapshots.get(worker.identity.rootSessionId) ?? {
      worker: ownerIdentity(worker), status: 'unavailable', appliedRevision: null,
      error: { code: 'RELOAD_REQUIRED', detail: 'Plugin runtime application has not been confirmed for this session.', retryable: false },
    });
  }
  async pluginTargets(): Promise<ContractCatalogWorkerIdentity[]> {
    return (await this.snapshotWorkers(() => true)).map(ownerIdentity);
  }

  publishPluginRuntime(worker: ContractCatalogWorkerIdentity, revision: string): void {
    CounterSchema.parse(revision);
    const current = this.workers.get(worker.rootSessionId);
    if (current?.identity.workerGeneration !== worker.workerGeneration) return;
    this.pluginSnapshots.set(worker.rootSessionId, { worker, status: 'ready', appliedRevision: revision, error: null });
  }
  runPluginOperation<T>(operation: () => Promise<T>): Promise<T> {
    return this.serial(operation);
  }
  runPluginApplication<T>(operation: (admit: CatalogAdmission) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      const admit: CatalogAdmission = async (input, reconcile, launch) => {
        await this.reconcileSourcesNow(input.workspaceId, input.agentDirectoryId, await reconcile());
        return launch(await this.prepareBootstrapNow(input));
      };
      return operation(admit);
    });
  }

  async pluginsChanged(input: { revision: string; rootSessionIds: string[] },
    apply: (worker: ContractCatalogWorkerIdentity) => Promise<PluginWorkerApplyOutcome>): Promise<PluginWorkerApplyOutcome[]> {
      const selectedRoots = new Set(input.rootSessionIds);
      const targets = await this.snapshotWorkers(worker => selectedRoots.has(worker.identity.rootSessionId));
      const outcomes: PluginWorkerApplyOutcome[] = [];
      for (const worker of targets) {
        const identity = ownerIdentity(worker);
        let outcome: PluginWorkerApplyOutcome;
        try { outcome = PluginWorkerApplyOutcomeSchema.parse(await apply(identity)); }
        catch (error) { outcome = { worker: identity, outcome: 'failed', appliedRevision: this.pluginSnapshots.get(identity.rootSessionId)?.appliedRevision ?? null,
          error: operationError(error instanceof Error ? error : undefined, 'PLUGIN_APPLY_FAILED', 'Plugin configuration is committed but active runtime application failed.') }; }
        if (outcome.worker.rootSessionId !== identity.rootSessionId || outcome.worker.workspaceId !== identity.workspaceId
          || outcome.worker.workerGeneration !== identity.workerGeneration) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
        if (!await this.live(worker) || this.workers.get(identity.rootSessionId)?.identity.workerGeneration !== identity.workerGeneration) {
          this.dropWorker(worker);
          outcome = { worker: identity, outcome: 'retired' };
        } else if (outcome.outcome === 'applied') {
          if (outcome.appliedRevision !== input.revision) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
          this.pluginSnapshots.set(identity.rootSessionId, { worker: identity, status: 'ready', appliedRevision: outcome.appliedRevision, error: null });
        } else if (outcome.outcome === 'failed') {
          const appliedRevision = this.pluginSnapshots.get(identity.rootSessionId)?.appliedRevision ?? outcome.appliedRevision;
          outcome = { ...outcome, appliedRevision };
          this.pluginSnapshots.set(identity.rootSessionId, { worker: identity, status: 'unavailable', appliedRevision, error: outcome.error });
        }
        outcomes.push(outcome);
      }
      for (let index = 0; index < outcomes.length; index++) {
        const outcome = outcomes[index];
        const current = this.workers.get(outcome.worker.rootSessionId);
        if (!current || current.identity.workerGeneration !== outcome.worker.workerGeneration || !await this.live(current)) {
          if (current?.identity.workerGeneration === outcome.worker.workerGeneration) this.dropWorker(current);
          outcomes[index] = { worker: outcome.worker, outcome: 'retired' };
        }
      }
      return outcomes;
  }



  async configure(rootSessionId: string, request: MCPConfigureRequest): Promise<MCPApplyResult> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      return this.configureMcpNow(worker.identity.workspaceId, request);
    });
  }

  async applyMcp(rootSessionId: string, request: MCPApplyRequest): Promise<MCPApplyResult> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      return this.applyMcpNow(worker.identity.workspaceId, request);
    });
  }

  /** Workspace Settings has a real stateless owner, not an admitted transcript worker. */
  async withWorkspaceMcp<T>(workspaceId: string, revision: string | undefined, operation: (configuration: MCPConfigurationState) => Promise<T>): Promise<T> {
    return this.serial(async () => {
      EntityIdSchema.parse(workspaceId);
      const owner = this.workspace(workspaceId);
      await this.ensureHydrated(workspaceId, owner.agentDirectoryIds[0]);
      if (revision !== undefined && revision !== owner.configuration.persistedRevision) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: owner.configuration.persistedRevision });
      }
      return operation(owner.configuration);
    });
  }

  async workspaceOAuth(serverId: string, workspaceId: string, revision: string | undefined, workerGeneration: string | undefined, operation: (configuration: MCPConfigurationState) => Promise<MCPOAuthResult>): Promise<MCPOAuthResult> {
    EntityIdSchema.parse(serverId);
    const configuration = await this.withWorkspaceMcp(workspaceId, revision, async current => current);
    const result = await operation(configuration);
    return this.serial(async () => {
      const current = this.workspace(workspaceId).configuration;
      if (current.persistedRevision !== configuration.persistedRevision) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: current.persistedRevision });
      }
      const parsed = MCPOAuthResultSchema.parse(result);
      if (parsed.serverId !== serverId || parsed.persistedRevision !== configuration.persistedRevision || parsed.worker.workspaceId !== workspaceId
        || (workerGeneration !== undefined && parsed.worker.workerGeneration !== workerGeneration)) {
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      return parsed;
    });
  }

  readWorkspaceMcpConfig(workspaceId: string): Promise<MCPConfigurationState> {
    return this.withWorkspaceMcp(workspaceId, undefined, async configuration => configuration);
  }

  configureWorkspaceMcp(workspaceId: string, request: MCPConfigureRequest): Promise<MCPApplyResult> {
    return this.withWorkspaceMcp(workspaceId, request.expectedPersistedRevision, () => this.configureMcpNow(workspaceId, request));
  }

  applyWorkspaceMcp(workspaceId: string, request: MCPApplyRequest): Promise<MCPApplyResult> {
    return this.withWorkspaceMcp(workspaceId, request.persistedRevision, () => this.applyMcpNow(workspaceId, request));
  }

  private async configureMcpNow(workspaceId: string, request: MCPConfigureRequest): Promise<MCPApplyResult> {
    const input = MCPConfigureRequestSchema.parse(request);
    const owner = this.workspace(workspaceId);
    const current = owner.configuration;
    if (input.expectedPersistedRevision !== current.persistedRevision) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: current.persistedRevision });
    const next: MCPConfigurationState = { workspaceId, persistedRevision: nextRevision(current.persistedRevision), config: MCPConfigSchema.parse(input.config) };
    try { await this.options.commitMcp(workspaceId, input, next); }
    catch (error) {
      if (error instanceof WorkerOperationError) throw error;
      throw new CatalogCoordinatorError(503, 'MCP_CONFIG_WRITE_FAILED', {});
    }
    owner.configuration = next;
    try { await this.persist(); }
    catch { throw new CatalogCoordinatorError(503, 'MCP_CONFIG_WRITE_FAILED', {}); }
    return this.applyMcpNow(workspaceId, { persistedRevision: next.persistedRevision });
  }

  reconnectWorkspaceMcp(workspaceId: string, serverId: string, request: MCPApplyRequest, probe: (configuration: MCPConfigurationState) => Promise<MCPConnectionTestResult>): Promise<MCPWorkspaceReconnectResult> {
    return this.withWorkspaceMcp(workspaceId, MCPApplyRequestSchema.parse(request).persistedRevision, async configuration => {
      EntityIdSchema.parse(serverId);
      if (!configuration.config.servers.some(server => server.serverId === serverId && server.enabled)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
      const outcomes: MCPWorkerApplyOutcome[] = [];
      for (const worker of await this.snapshotWorkers(item => item.identity.workspaceId === workspaceId)) {
        let previous: MCPCatalogRead;
        try { previous = await this.cachedMcp(worker, configuration); }
        catch { previous = { configuration, workerCatalog: { worker: ownerIdentity(worker), runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } }; }
        try {
          const result = await worker.mcp.reconnect(serverId, { persistedRevision: configuration.persistedRevision, expectedCatalogRevision: previous.workerCatalog.catalogRevision, workerGeneration: worker.identity.workerGeneration }, configuration);
          if (!await this.live(worker)) { this.dropWorker(worker); outcomes.push({ worker: ownerIdentity(worker), outcome: 'retired' }); continue; }
          this.mcpSnapshots.set(worker.identity.rootSessionId, result);
          const { runtimeStatus, appliedRevision, catalogRevision } = result.workerCatalog;
          outcomes.push({ worker: ownerIdentity(worker), outcome: 'applied', revisions: { runtimeStatus, appliedRevision, catalogRevision } });
        } catch (error) {
          if (!await this.live(worker)) { this.dropWorker(worker); outcomes.push({ worker: ownerIdentity(worker), outcome: 'retired' }); continue; }
          const { runtimeStatus, appliedRevision, catalogRevision } = previous.workerCatalog;
          outcomes.push({ worker: ownerIdentity(worker), outcome: 'failed', revisions: { runtimeStatus, appliedRevision, catalogRevision }, error: operationError(error instanceof Error ? error : undefined, 'MCP_RECONNECT_FAILED', 'MCP reconnect failed; the prior catalog is retained.') });
        }
      }
      await this.finalizeMcpOutcomes(outcomes);
      const status = aggregate(outcomes);
      const payload: MCPWorkspaceReconnectResult = { workspaceId, serverId, persistedRevision: configuration.persistedRevision, status, workers: outcomes };
      if (status === 'no-active-workers') payload.probe = await probe(configuration);
      const result = MCPWorkspaceReconnectResultSchema.parse(payload);
      if (status === 'partial' || status === 'failed') throw new CatalogCoordinatorError(503, 'MCP_RECONNECT_FAILED', { result });
      return result;
    });
  }

  private async applyMcpNow(workspaceId: string, request: MCPApplyRequest): Promise<MCPApplyResult> {
    const input = MCPApplyRequestSchema.parse(request);
    const configuration = this.workspace(workspaceId).configuration;
    if (input.persistedRevision !== configuration.persistedRevision) {
      throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: configuration.persistedRevision });
    }
    const outcomes: MCPWorkerApplyOutcome[] = [];
    for (const worker of await this.snapshotWorkers(item => item.identity.workspaceId === workspaceId)) {
      outcomes.push(await this.applyMcpWorker(worker, input, configuration));
    }
    await this.finalizeMcpOutcomes(outcomes);
    const result = { kind: 'mcp' as const, status: aggregate(outcomes), configuration, workers: outcomes } satisfies MCPApplyResult;
    if (result.status === 'partial' || result.status === 'failed') throw new CatalogCoordinatorError(503, 'MCP_APPLY_FAILED', { result });
    return result;
  }

  async reconnect(rootSessionId: string, serverId: string, request: MCPReconnectRequest): Promise<MCPCatalogRead> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      const input = MCPReconnectRequestSchema.parse(request);
      const configuration = this.workspace(worker.identity.workspaceId).configuration;
      if (input.persistedRevision !== configuration.persistedRevision || input.workerGeneration !== worker.identity.workerGeneration) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
      }
      if (!await this.live(worker)) {
        this.dropWorker(worker);
        throw new CatalogCoordinatorError(503, 'MCP_RECONNECT_FAILED', {});
      }
      try {
        const result = await worker.mcp.reconnect(serverId, input, configuration);
        if (!await this.live(worker)) {
          this.dropWorker(worker);
          throw new CatalogCoordinatorError(503, 'MCP_RECONNECT_FAILED', {});
        }
        this.mcpSnapshots.set(rootSessionId, result);
        return result;
      } catch (error) {
        throw new CatalogCoordinatorError(error instanceof CatalogCoordinatorError ? error.status : 503,
          error instanceof CatalogCoordinatorError ? error.code : 'MCP_RECONNECT_FAILED', {});
      }
    });
  }

  async oauthStatus(rootSessionId: string, serverId: string): Promise<MCPOAuthResult> {
    const target = await this.oauthTarget(rootSessionId, serverId);
    const result = await target.worker.mcp.oauthStatus(serverId, target.configuration);
    return this.finishOAuth(target.worker, target.configuration, serverId, result);
  }

  async oauth(rootSessionId: string, serverId: string, request: MCPOAuthRequest): Promise<MCPOAuthResult> {
    const input = MCPOAuthRequestSchema.parse(request);
    const target = await this.oauthTarget(rootSessionId, serverId, input);
    // Browser callbacks must not prevent cancellation, configuration changes or root admission.
    const result = await target.worker.mcp.oauth(serverId, input, target.configuration);
    return this.finishOAuth(target.worker, target.configuration, serverId, result);
  }

  private oauthTarget(rootSessionId: string, serverId: string, request?: MCPOAuthRequest) {
    return this.serial(async () => {
      EntityIdSchema.parse(serverId);
      const captured = this.workers.get(rootSessionId);
      if (request && (!captured || request.workerGeneration !== captured.identity.workerGeneration || !await this.live(captured))) {
        throw new CatalogCoordinatorError(409, 'WORKER_GENERATION_CONFLICT', {});
      }
      const worker = await this.resolveWorker(rootSessionId);
      const configuration = this.workspace(worker.identity.workspaceId).configuration;
      if (request && request.persistedRevision !== configuration.persistedRevision) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: configuration.persistedRevision });
      }
      return { worker, configuration };
    });
  }

  private finishOAuth(worker: CatalogWorker, configuration: MCPConfigurationState, serverId: string, result: MCPOAuthResult): Promise<MCPOAuthResult> {
    return this.serial(async () => {
      if (!await this.live(worker)) throw new CatalogCoordinatorError(409, 'WORKER_GENERATION_CONFLICT', {});
      const current = this.workspace(worker.identity.workspaceId).configuration;
      if (current.persistedRevision !== configuration.persistedRevision) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: current.persistedRevision });
      }
      const parsed = MCPOAuthResultSchema.parse(result);
      if (parsed.serverId !== serverId || parsed.persistedRevision !== configuration.persistedRevision
        || parsed.worker.rootSessionId !== worker.identity.rootSessionId || parsed.worker.workspaceId !== worker.identity.workspaceId
        || parsed.worker.workerGeneration !== worker.identity.workerGeneration) {
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      return parsed;
    });
  }


  async publishSources(workspaceId: string, input: SkillSourcePublication): Promise<SkillInstallResult> {
    return this.serial(() => this.publishSourcesNow(workspaceId, input));
  }

  private async publishSourcesNow(workspaceId: string, input: SkillSourcePublication): Promise<SkillInstallResult> {
    const workspace = this.workspace(workspaceId);
    const selectedAgentDirectoryId = input.agentDirectoryId ?? workspace.agentDirectoryIds[0];
    if (!selectedAgentDirectoryId || !workspace.agentDirectoryIds.includes(selectedAgentDirectoryId)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
    const scope: SkillSourceScope = input.scope === 'workspace' ? { kind: 'workspace', workspaceId } : { kind: 'agent', agentDirectoryId: selectedAgentDirectoryId };
    const owner = input.scope === 'workspace' ? workspace.workspaceSourceRevision : this.agent(selectedAgentDirectoryId).sourceRevision;
    CounterSchema.parse(input.sourceRevision);
    CounterSchema.parse(input.expectedSourceRevision);
    if (owner === input.sourceRevision) return { scope, sourceRevision: input.sourceRevision, persistence: 'committed', apply: null };
    if (owner !== input.expectedSourceRevision || BigInt(input.sourceRevision) <= BigInt(owner)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: owner });
    if (input.scope === 'workspace') workspace.workspaceSourceRevision = input.sourceRevision;
    else this.agent(selectedAgentDirectoryId).sourceRevision = input.sourceRevision;
    try { await this.persist(); }
    catch (error) {
      if (input.scope === 'workspace') workspace.workspaceSourceRevision = owner;
      else this.agent(selectedAgentDirectoryId).sourceRevision = owner;
      throw error;
    }
    return { scope, sourceRevision: input.sourceRevision, persistence: 'committed', apply: null };
  }

  async reconcileSkillSources(workspaceId: string, agentDirectoryId: string, reconcile: () => Promise<SkillSourceRevisions>): Promise<SkillSourceRevisions> {
    return this.serial(async () => this.reconcileSourcesNow(workspaceId, agentDirectoryId, await reconcile()));
  }

  private async reconcileSourcesNow(workspaceId: string, agentDirectoryId: string, input: SkillSourceRevisions): Promise<SkillSourceRevisions> {
    const workspace = this.workspace(workspaceId);
    if (!workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
    const sources = SkillSourceRevisionsSchema.parse(input);
    const agent = this.agent(agentDirectoryId);
    const previous = { workspace: workspace.workspaceSourceRevision, agent: agent.sourceRevision };
    if (BigInt(sources.workspace) < BigInt(previous.workspace) || BigInt(sources.agent) < BigInt(previous.agent)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
    if (sources.workspace === previous.workspace && sources.agent === previous.agent) return sources;
    workspace.workspaceSourceRevision = sources.workspace;
    agent.sourceRevision = sources.agent;
    try { await this.persist(); }
    catch (error) { workspace.workspaceSourceRevision = previous.workspace; agent.sourceRevision = previous.agent; throw error; }
    return sources;
  }

  async commitSkillFiles(workspaceId: string, input: HostSkillSourceCommit, callbacks: {
    reconcile: SkillSourceReconciler; commit(): Promise<string>;
  }): Promise<SkillInstallResult> {
    return this.serial(async () => {
      const sources = await this.reconcileSourcesNow(workspaceId, input.agentDirectoryId, await callbacks.reconcile(workspaceId, input.agentDirectoryId));
      const current = sources[input.scope];
      if (current !== input.expectedSourceRevision) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: current });
      const sourceRevision = CounterSchema.parse(await callbacks.commit());
      if (BigInt(sourceRevision) !== BigInt(current) + 1n) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      const result = await this.publishSourcesNow(workspaceId, { scope: input.scope, sourceRevision, expectedSourceRevision: current, agentDirectoryId: input.agentDirectoryId });
      const apply = await this.applySkillsScope(workspaceId, input.agentDirectoryId, { scope: input.scope, sourceRevision }, callbacks.reconcile);
      return { ...result, apply };
    });
  }

  async applySkills(rootSessionId: string, request: { scope: 'workspace' | 'agent'; sourceRevision: string }, reconcile: SkillSourceReconciler): Promise<SkillsApplyResult> {
    return this.serial(async () => {
      const root = await this.resolveWorker(rootSessionId);
      return this.applySkillsScope(root.identity.workspaceId, root.identity.agentDirectoryId, request, reconcile);
    });
  }

  async applySkillsWorkspace(workspaceId: string, agentDirectoryId: string, request: { scope: 'workspace' | 'agent'; sourceRevision: string }, reconcile: SkillSourceReconciler): Promise<SkillsApplyResult> {
    return this.serial(() => this.applySkillsScope(workspaceId, agentDirectoryId, request, reconcile));
  }

  private async applySkillsScope(workspaceId: string, agentDirectoryId: string, request: { scope: 'workspace' | 'agent'; sourceRevision: string }, reconcile: SkillSourceReconciler): Promise<SkillsApplyResult> {
    const workspace = this.workspace(workspaceId);
    if (!workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
    const input = SkillsApplyRequestSchema.parse(request);
    const targets = await this.snapshotWorkers(item => input.scope === 'workspace'
      ? item.identity.workspaceId === workspaceId : item.identity.agentDirectoryId === agentDirectoryId);
    const pairs = new Map<string, { workspaceId: string; agentDirectoryId: string }>();
    pairs.set(JSON.stringify([workspaceId, agentDirectoryId]), { workspaceId, agentDirectoryId });
    for (const worker of targets) pairs.set(JSON.stringify([worker.identity.workspaceId, worker.identity.agentDirectoryId]), worker.identity);
    for (const pair of pairs.values()) await this.reconcileSourcesNow(pair.workspaceId, pair.agentDirectoryId, await reconcile(pair.workspaceId, pair.agentDirectoryId));
    const sourceOwner = input.scope === 'workspace' ? workspace.workspaceSourceRevision : this.agent(agentDirectoryId).sourceRevision;
    if (sourceOwner !== input.sourceRevision) throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', { currentRevision: sourceOwner });
    const scope: SkillSourceScope = input.scope === 'workspace' ? { kind: 'workspace', workspaceId } : { kind: 'agent', agentDirectoryId };
    const outcomes: SkillsWorkerApplyOutcome[] = [];
    for (const worker of targets) outcomes.push(await this.applySkillsWorker(worker));
    const lifetimes = await Promise.all(targets.map(worker => this.live(worker)));
    for (const [index, worker] of targets.entries()) {
      if (!lifetimes[index] || this.workers.get(worker.identity.rootSessionId)?.identity.workerGeneration !== worker.identity.workerGeneration) {
        this.dropWorker(worker);
        outcomes[index] = { worker: ownerIdentity(worker), outcome: 'retired' };
      }
    }
    const result = { kind: 'skills' as const, status: aggregate(outcomes), scope, sourceRevision: input.sourceRevision, workers: outcomes } satisfies SkillsApplyResult;
    if (result.status === 'partial' || result.status === 'failed') throw new CatalogCoordinatorError(503, 'SKILL_APPLY_FAILED', { result });
    return result;
  }

  async expand(rootSessionId: string, request: SkillExpandRequest): Promise<SkillExpandResult> {
    return this.serial(async () => {
      const worker = await this.resolveWorker(rootSessionId);
      const input = SkillExpandRequestSchema.parse(request);
      if (input.workerGeneration !== worker.identity.workerGeneration || !await this.live(worker)) {
        throw new CatalogCoordinatorError(409, 'CATALOG_CONFLICT', {});
      }
      const result = await worker.skills.expand(input);
      if (this.workers.get(rootSessionId)?.identity.workerGeneration !== worker.identity.workerGeneration || !await this.live(worker)) {
        this.dropWorker(worker);
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
      return result;
    });
  }

  private async prepareBootstrapNow(input: CatalogBootstrapInput): Promise<CatalogBootstrap> {
    EntityIdSchema.parse(input.workspaceId);
    EntityIdSchema.parse(input.agentDirectoryId);
    CounterSchema.parse(input.catalogRevision);
    const workspace = await this.ensureHydrated(input.workspaceId, input.agentDirectoryId);
    return {
      workspaceId: input.workspaceId,
      agentDirectoryId: input.agentDirectoryId,
      mcpConfiguration: workspace.configuration,
      skillSources: this.sourcesForOwner(workspace.workspaceId, input.agentDirectoryId),
      catalogRevision: input.catalogRevision,
    };
  }
  private async ensureHydrated(workspaceId: string, agentDirectoryId: string): Promise<WorkspaceState> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace || !workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
    const pending = this.hydrating.get(workspaceId);
    if (pending) {
      await pending;
      return workspace;
    }
    const hydration = (async () => {
      let native: MCPConfigurationState | null;
      try { native = await this.options.readMcpConfiguration(workspaceId); }
      catch { throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {}); }
      if (native !== null) {
        if (native.workspaceId !== workspaceId) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
        workspace.configuration = MCPConfigurationStateSchema.parse(native);
        await this.persist();
      } else if (workspace.configuration.persistedRevision !== '0') {
        throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
      }
    })();
    this.hydrating.set(workspaceId, hydration);
    try { await hydration; }
    finally { if (this.hydrating.get(workspaceId) === hydration) this.hydrating.delete(workspaceId); }
    return workspace;
  }

  private workspace(workspaceId: string): WorkspaceState {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
    return workspace;
  }

  private agent(agentDirectoryId: string): AgentState {
    const agent = this.agents.get(agentDirectoryId);
    if (!agent) throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
    return agent;
  }

  private sourcesForOwner(workspaceId: string, agentDirectoryId: string): SkillSourceRevisions {
    return { workspace: this.workspace(workspaceId).workspaceSourceRevision, agent: this.agent(agentDirectoryId).sourceRevision };
  }

  private sourcesFor(worker: CatalogWorker): SkillSourceRevisions {
    return this.sourcesForOwner(worker.identity.workspaceId, worker.identity.agentDirectoryId);
  }

  private async resolveWorker(rootSessionId: string): Promise<CatalogWorker> {
    const worker = this.workers.get(rootSessionId);
    if (!worker || !await this.live(worker)) {
      if (worker) this.dropWorker(worker);
      throw new CatalogCoordinatorError(503, 'SERVICE_UNAVAILABLE', {});
    }
    await this.ensureHydrated(worker.identity.workspaceId, worker.identity.agentDirectoryId);
    return worker;
  }

  private async snapshotWorkers(predicate: (worker: CatalogWorker) => boolean): Promise<CatalogWorker[]> {
    const selected: CatalogWorker[] = [];
    for (const worker of this.workers.values()) {
      if (!predicate(worker)) continue;
      if (await this.live(worker)) selected.push(worker);
      else this.dropWorker(worker);
    }
    return selected;
  }

  private async applyMcpWorker(worker: CatalogWorker, request: MCPApplyRequest, configuration: MCPConfigurationState): Promise<MCPWorkerApplyOutcome> {
    let previous: MCPCatalogRead;
    try { previous = await this.cachedMcp(worker, configuration); }
    catch {
      previous = { configuration, workerCatalog: { worker: ownerIdentity(worker), runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } };
    }
    if (!await this.live(worker)) {
      this.dropWorker(worker);
      return { worker: ownerIdentity(worker), outcome: 'retired' };
    }
    try {
      const outcome = MCPWorkerApplyOutcomeSchema.parse(await worker.mcp.apply(request, configuration));
      if (!await this.live(worker)) {
        this.dropWorker(worker);
        return { worker: ownerIdentity(worker), outcome: 'retired' };
      }
      try {
        const snapshot = await worker.mcp.read(configuration);
        if (this.workers.get(worker.identity.rootSessionId)?.identity.workerGeneration !== worker.identity.workerGeneration || !await this.live(worker)) {
          this.dropWorker(worker);
          return { worker: ownerIdentity(worker), outcome: 'retired' };
        }
        this.mcpSnapshots.set(worker.identity.rootSessionId, snapshot);
      } catch {}
      return outcome;
    } catch (error) {
      if (!await this.live(worker)) {
        this.dropWorker(worker);
        return { worker: ownerIdentity(worker), outcome: 'retired' };
      }
      return MCPWorkerApplyOutcomeSchema.parse({ worker: ownerIdentity(worker), outcome: 'failed',
        revisions: { runtimeStatus: previous.workerCatalog.runtimeStatus, appliedRevision: previous.workerCatalog.appliedRevision, catalogRevision: previous.workerCatalog.catalogRevision },
        error: operationError(error instanceof Error ? error : undefined, 'MCP_APPLY_FAILED', 'MCP runtime application failed; the prior catalog is retained.') });
    }
  }

  private async applySkillsWorker(worker: CatalogWorker): Promise<SkillsWorkerApplyOutcome> {
    const sources = this.sourcesFor(worker);
    let previous: SkillsCatalogState;
    try { previous = await this.cachedSkills(worker, sources); }
    catch {
      previous = { worker: ownerIdentity(worker), agentDirectoryId: worker.identity.agentDirectoryId, runtimeStatus: 'unavailable', persistedSources: sources, appliedSources: null, catalogRevision: '0', skills: [] };
    }
    if (!await this.live(worker)) {
      this.dropWorker(worker);
      return { worker: ownerIdentity(worker), outcome: 'retired' };
    }
    const catalogRevision = nextRevision(previous.catalogRevision);
    try {
      const outcome = SkillsWorkerApplyOutcomeSchema.parse(await worker.skills.apply(sources, catalogRevision));
      if (!await this.live(worker)) {
        this.dropWorker(worker);
        return { worker: ownerIdentity(worker), outcome: 'retired' };
      }
      try {
        const snapshot = await worker.skills.read(sources);
        if (this.workers.get(worker.identity.rootSessionId)?.identity.workerGeneration !== worker.identity.workerGeneration || !await this.live(worker)) {
          this.dropWorker(worker);
          return { worker: ownerIdentity(worker), outcome: 'retired' };
        }
        this.skillSnapshots.set(worker.identity.rootSessionId, snapshot);
      } catch {}
      return outcome;
    } catch (error) {
      if (!await this.live(worker)) {
        this.dropWorker(worker);
        return { worker: ownerIdentity(worker), outcome: 'retired' };
      }
      return SkillsWorkerApplyOutcomeSchema.parse({ worker: ownerIdentity(worker), outcome: 'failed', revisions: {
        runtimeStatus: previous.runtimeStatus,
        persistedSources: sources,
        appliedSources: previous.appliedSources,
        catalogRevision: previous.catalogRevision,
      }, error: operationError(error instanceof Error ? error : undefined, 'SKILL_APPLY_FAILED', 'Skill application failed; the prior catalog is retained.') });
    }
  }

  private async cachedMcp(worker: CatalogWorker, configuration: MCPConfigurationState): Promise<MCPCatalogRead> {
    const cached = this.mcpSnapshots.get(worker.identity.rootSessionId);
    if (cached && cached.workerCatalog.worker.workerGeneration === worker.identity.workerGeneration) return cached;
    const current = await worker.mcp.read(configuration);
    this.mcpSnapshots.set(worker.identity.rootSessionId, current);
    return current;
  }

  private async cachedSkills(worker: CatalogWorker, sources: SkillSourceRevisions): Promise<SkillsCatalogState> {
    const cached = this.skillSnapshots.get(worker.identity.rootSessionId);
    if (cached && cached.worker.workerGeneration === worker.identity.workerGeneration) return cached;
    const current = await worker.skills.read(sources);
    this.skillSnapshots.set(worker.identity.rootSessionId, current);
    return current;
  }

  private async finalizeMcpOutcomes(outcomes: MCPWorkerApplyOutcome[]): Promise<void> {
    for (let index = 0; index < outcomes.length; index++) {
      const outcome = outcomes[index];
      if (outcome.outcome === 'retired') continue;
      const worker = this.workers.get(outcome.worker.rootSessionId);
      if (!worker || worker.identity.workerGeneration !== outcome.worker.workerGeneration || !await this.live(worker)) {
        if (worker?.identity.workerGeneration === outcome.worker.workerGeneration) this.dropWorker(worker);
        outcomes[index] = { worker: outcome.worker, outcome: 'retired' };
      }
    }
  }
  private async live(worker: CatalogWorker): Promise<boolean> {
    try { return await worker.isLive(); } catch { return false; }
  }

  private dropWorker(worker: CatalogWorker): void {
    if (this.workers.get(worker.identity.rootSessionId)?.identity.workerGeneration !== worker.identity.workerGeneration) return;
    this.workers.delete(worker.identity.rootSessionId);
    this.mcpSnapshots.delete(worker.identity.rootSessionId);
    this.skillSnapshots.delete(worker.identity.rootSessionId);
    this.pluginSnapshots.delete(worker.identity.rootSessionId);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private async persist(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify({ workspaces: [...this.workspaces.values()], agents: [...this.agents.values()] })); }
      finally { await handle.close(); }
      await rename(temporary, this.file);
    } finally { try { await unlink(temporary); } catch {} }
  }
}
