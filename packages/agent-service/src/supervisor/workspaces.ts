import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import { CounterSchema, EntityIdSchema, CacheWarmingApplyResultSchema, CacheWarmingUpdateRequestSchema, type CacheWarmingState, type CacheWarmingUpdateRequest, type CacheWarmingApplyResult, type CacheWarmingWorkerApplyOutcome } from '@openchamber/agent-contract';
import { CacheWarmingPartialWriteDetailsSchema } from '@openchamber/agent-contract';
import type { CatalogOperation, CatalogResult } from '../catalogs/protocol.ts';
import { WorkerOperationError, type WorkerRegistry } from './workers.ts';
import { HostWorkspaceBootstrapSchema } from './host-authorization-protocol.ts';
import { PluginMutationResultSchema, type PluginApplyRequest, type PluginMutationResult, type CatalogWorkerIdentity, type PluginWorkerApplyOutcome, type PluginRuntimeState } from '@openchamber/agent-contract';
import type { CatalogCoordinator, CatalogAdmission } from './catalog.ts';
import { NativePluginOperationSchema, type NativePluginOperation } from '../catalogs/plugins.ts';

export type PrivateWorkspaceRegistration = z.infer<typeof HostWorkspaceBootstrapSchema>;
const WorkspaceSchema = HostWorkspaceBootstrapSchema.omit({ env: true }).extend({
  workspaceId: EntityIdSchema, authorizationRootId: EntityIdSchema,
  agentDirectoryIds: z.array(EntityIdSchema).min(1),
});
type Workspace = z.infer<typeof WorkspaceSchema>;
const OwnerSchema = z.strictObject({ agentDirectoryId: EntityIdSchema, agentDirectory: z.string().min(1).refine(isAbsolute), revision: CounterSchema });
const PluginOwnerSchema = z.strictObject({ rootPath: z.string().min(1).refine(isAbsolute), revision: CounterSchema });
const PluginBindingSchema = PluginOwnerSchema.omit({ revision: true }).extend({ workspaceId: EntityIdSchema,
  localSourcePath: z.string().min(1).refine(isAbsolute), projectRegistryPath: z.string().min(1).refine(isAbsolute).nullable() });
const StateSchema = z.strictObject({ workspaces: z.array(WorkspaceSchema), owners: z.array(OwnerSchema),
  pluginOwners: z.array(PluginOwnerSchema).default([]), pluginBindings: z.array(PluginBindingSchema).default([]) });

/** Private Host mappings and model/provider/profile CAS belong to their actual agent-directory owner. */
export class WorkspaceCatalogs {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly owners = new Map<string, z.infer<typeof OwnerSchema>>();
  private readonly pluginOwners = new Map<string, z.infer<typeof PluginOwnerSchema>>();
  private readonly pluginBindings = new Map<string, z.infer<typeof PluginBindingSchema>>();
  private readonly environments = new Map<string, Record<string, string>>();
  private readonly tails = new Map<string, Promise<void>>();
  private stateTail: Promise<void> = Promise.resolve();
  private readonly file: string;
  constructor(private readonly stateDirectory: string, private readonly workers: WorkerRegistry, private readonly pluginCoordinator?: () => CatalogCoordinator) {
    this.file = join(stateDirectory, 'workspace-catalog-owners.json');
  }
  async initialize(): Promise<void> {
    try {
      const state = StateSchema.parse(JSON.parse(await readFile(this.file, 'utf8')));
      for (const owner of state.owners) {
        if (this.owners.has(owner.agentDirectoryId) || [...this.owners.values()].some(item => item.agentDirectory === owner.agentDirectory)) throw new Error('Duplicate catalog owner');
        this.owners.set(owner.agentDirectoryId, owner);
      }
      for (const owner of state.pluginOwners) {
        if (this.pluginOwners.has(owner.rootPath)) throw new Error('Duplicate native plugin owner');
        this.pluginOwners.set(owner.rootPath, owner);
      }
      for (const workspace of state.workspaces) {
        const owner = this.owners.get(workspace.agentDirectoryId);
        if (!owner || owner.agentDirectory !== workspace.agentDirectory || this.workspaces.has(workspace.workspaceId) || workspace.agentDirectoryIds.some(id => !this.owners.has(id)) || !workspace.agentDirectoryIds.includes(workspace.agentDirectoryId)) throw new Error('Invalid workspace owner');
        this.workspaces.set(workspace.workspaceId, workspace);
      }
      for (const binding of state.pluginBindings) {
        if (this.pluginBindings.has(binding.workspaceId) || !this.workspaces.has(binding.workspaceId) || !this.pluginOwners.has(binding.rootPath)) throw new Error('Invalid native plugin binding');
        this.pluginBindings.set(binding.workspaceId, binding);
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    }
  }
  async register(workspaceId: string, input: PrivateWorkspaceRegistration) {
    return this.stateMutation(async () => {
      const existing = this.workspaces.get(workspaceId);
      const owner = this.owners.get(input.agentDirectoryId);
      if (owner && owner.agentDirectory !== input.agentDirectory) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if ([...this.owners.values()].some(item => item.agentDirectory === input.agentDirectory && item.agentDirectoryId !== input.agentDirectoryId)) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (existing && (existing.projectId !== input.projectId || existing.cwd !== input.cwd || existing.agentDirectory !== input.agentDirectory || existing.agentDirectoryId !== input.agentDirectoryId)) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      const workspace: Workspace = existing ?? { workspaceId, projectId: input.projectId, cwd: input.cwd, agentDirectory: input.agentDirectory, agentDirectoryId: input.agentDirectoryId, agentDirectoryIds: [input.agentDirectoryId], authorizationRootId: randomUUID() };
      if (!existing) {
        this.workspaces.set(workspaceId, workspace);
        if (!owner) this.owners.set(input.agentDirectoryId, { agentDirectoryId: input.agentDirectoryId, agentDirectory: input.agentDirectory, revision: '0' });
        try { await this.persist(); }
        catch (error) { this.workspaces.delete(workspaceId); if (!owner) this.owners.delete(input.agentDirectoryId); throw error; }
      }
      this.environments.set(workspaceId, input.env ?? {});
      return { workspaceId, projectId: workspace.projectId, agentDirectoryId: workspace.agentDirectoryId, authorizationRootId: workspace.authorizationRootId, catalogRevision: this.revision(workspaceId) };
    });
  }
  async registerRoot(input: { workspaceId: string; projectId: string; cwd: string; agentDirectory: string; agentDirectoryId?: string }): Promise<string> {
    const workspace = this.get(input.workspaceId);
    if (workspace.projectId !== input.projectId || workspace.cwd !== input.cwd) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    const agentDirectoryId = input.agentDirectoryId ?? (input.agentDirectory === workspace.agentDirectory ? workspace.agentDirectoryId : undefined);
    if (agentDirectoryId === undefined) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    await this.stateMutation(async () => {
      const owner = this.owners.get(agentDirectoryId);
      if (owner && owner.agentDirectory !== input.agentDirectory) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if ([...this.owners.values()].some(item => item.agentDirectory === input.agentDirectory && item.agentDirectoryId !== agentDirectoryId)) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
      if (workspace.agentDirectoryIds.includes(agentDirectoryId)) return;
      if (!owner) this.owners.set(agentDirectoryId, { agentDirectoryId, agentDirectory: input.agentDirectory, revision: '0' });
      const previous = workspace.agentDirectoryIds;
      workspace.agentDirectoryIds = [...previous, agentDirectoryId];
      try { await this.persist(); }
      catch (error) { workspace.agentDirectoryIds = previous; if (!owner) this.owners.delete(agentDirectoryId); throw error; }
    });
    return agentDirectoryId;
  }
  get(workspaceId: string): Workspace {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    return workspace;
  }
  revision(workspaceId: string, agentDirectoryId = this.get(workspaceId).agentDirectoryId): string {
    const workspace = this.get(workspaceId);
    if (!workspace.agentDirectoryIds.includes(agentDirectoryId)) throw new WorkerOperationError(403, 'UNAUTHORIZED');
    const owner = this.owners.get(agentDirectoryId);
    if (!owner) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return owner.revision;
  }
  matches(input: { workspaceId: string; projectId: string; cwd: string; agentDirectory: string; agentDirectoryId?: string }): boolean {
    const workspace = this.workspaces.get(input.workspaceId);
    const agentDirectoryId = input.agentDirectoryId ?? workspace?.agentDirectoryId;
    const owner = agentDirectoryId === undefined ? undefined : this.owners.get(agentDirectoryId);
    return workspace !== undefined && workspace.projectId === input.projectId && workspace.cwd === input.cwd && agentDirectoryId !== undefined && workspace.agentDirectoryIds.includes(agentDirectoryId) && owner?.agentDirectory === input.agentDirectory;
  }
  async stateless(workspaceId: string): Promise<string> {
    const workspace = this.get(workspaceId);
    // Environments are refreshed only by authenticated Host admission, never restored from disk.
    const env = this.environments.get(workspaceId);
    if (!env) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    await this.workers.startStateless({ rootSessionId: workspace.authorizationRootId, projectId: workspace.projectId, workspaceId, cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId, catalogRevision: this.revision(workspaceId), mcpConfigPath: join(workspace.cwd, '.omp', 'mcp.json'), env });
    return workspace.authorizationRootId;
  }
  async operation(workspaceId: string, operation: CatalogOperation): Promise<CatalogResult> {
    const pluginOperation = NativePluginOperationSchema.safeParse(operation);
    if (pluginOperation.success) return this.pluginOperation(workspaceId, pluginOperation.data);
    const workspace = this.get(workspaceId);
    return this.serial(workspace.agentDirectoryId, () => this.operationNow(workspaceId, operation));
  }

  async readCacheWarming(workspaceId: string): Promise<CacheWarmingState> {
    const result = await this.operation(workspaceId, { type: 'catalog.warming.read' });
    if (result.type !== 'catalog.warming') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
    return result.state;
  }

  async updateCacheWarming(workspaceId: string, input: CacheWarmingUpdateRequest): Promise<CacheWarmingApplyResult> {
    const request = CacheWarmingUpdateRequestSchema.parse(input);
    const workspace = this.get(workspaceId);
    return this.serial(workspace.agentDirectoryId, async () => {
      const result = await this.operationNow(workspaceId, { type: 'catalog.warming.persist', request });
      if (result.type !== 'catalog.warming') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      const persisted = result.state;
      // Capture generations after persistence; never restart cold workers just to warm them.
      const active = this.workers.list().filter(worker => worker.kind === 'session' && worker.workspaceId === workspaceId && (worker.state === 'ready' || worker.state === 'starting'));
      const workers = await Promise.all(active.map(async (worker): Promise<CacheWarmingWorkerApplyOutcome> => {
        const identity = { workspaceId, rootSessionId: worker.rootSessionId, workerGeneration: worker.workerGeneration };
        try {
          const applied = await this.workers.request(worker.rootSessionId, { type: 'catalog', revision: persisted.revision, operation: { type: 'catalog.warming.apply', mode: persisted.mode } }, worker.workerGeneration);
          const current = this.workers.info(worker.rootSessionId);
          if (applied.type !== 'catalog' || applied.result.type !== 'catalog.warming.applied' || applied.result.mode !== persisted.mode || current?.workerGeneration !== worker.workerGeneration || current.state !== 'ready') throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
          return { worker: identity, outcome: 'applied', mode: persisted.mode };
        } catch {
          return { worker: identity, outcome: 'failed', mode: persisted.mode, error: { code: 'SERVICE_UNAVAILABLE', detail: 'The active worker did not confirm the configured cache-warming mode.', retryable: true } };
        }
      }));
      const applied = workers.filter(worker => worker.outcome === 'applied').length;
      const status = workers.length === 0 ? 'no-active-workers' : applied === workers.length ? 'applied' : applied === 0 ? 'failed' : 'partial';
      return CacheWarmingApplyResultSchema.parse({ persisted, status, workers });
    });
  }

  private async operationNow(workspaceId: string, operation: CatalogOperation): Promise<CatalogResult> {
      const workspace = this.get(workspaceId);
      const owner = this.owners.get(workspace.agentDirectoryId);
      if (!owner) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
      const requestOperation = operation.type === 'fileResources' ? operation.operation : operation;
      const expectedRevision = 'request' in requestOperation && 'expectedRevision' in requestOperation.request ? requestOperation.request.expectedRevision : undefined;
      const mutation = expectedRevision !== undefined && (operation.type !== 'catalog.provider.oauth' || operation.request.action === 'commit');
      if (expectedRevision !== undefined && expectedRevision !== owner.revision) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', { currentRevision: owner.revision });
      const revision = mutation ? CounterSchema.parse((BigInt(owner.revision) + 1n).toString()) : owner.revision;
      const root = await this.stateless(workspaceId);
      const result = await this.workers.request(root, { type: 'catalog', operation, revision });
      if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      const committed = mutation && (operation.type === 'fileResources' || result.result.type !== 'catalog.credential.handed-off' || result.result.result.outcome.status === 'imported');
      if (committed) {
        await this.stateMutation(async () => {
          const previous = owner.revision;
          owner.revision = revision;
          try { await this.persist(); }
          catch (error) {
            owner.revision = previous;
            if (operation.type === 'catalog.warming.persist' && result.result.type === 'catalog.warming') {
              throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', CacheWarmingPartialWriteDetailsSchema.parse({
                workspaceId, configuredMode: result.result.state.mode, currentRevision: previous,
                nativeConfigurationCommitted: true, liveApplication: 'not-started',
              }));
            }
            throw error;
          }
        });
      }
      return result.result;
  }
  private async readPluginOwner(rootSessionId: string, workerGeneration?: string) {
    const result = await this.workers.request(rootSessionId, { type: 'catalog', revision: '0', operation: { type: 'plugins.owner' } }, workerGeneration);
    if (result.type !== 'catalog' || result.result.type !== 'plugins.owner'
      || !isAbsolute(result.result.rootPath) || !isAbsolute(result.result.localSourcePath) || (result.result.projectRegistryPath !== null && !isAbsolute(result.result.projectRegistryPath))) {
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    }
    return result.result;
  }

  private async pluginBinding(workspaceId: string) {
    const rootSessionId = await this.stateless(workspaceId);
    const identity = await this.readPluginOwner(rootSessionId);
    await this.stateMutation(async () => {
      const previous = this.pluginBindings.get(workspaceId);
      const existingOwner = this.pluginOwners.get(identity.rootPath);
      if (existingOwner && previous?.rootPath === identity.rootPath && previous.localSourcePath === identity.localSourcePath && previous.projectRegistryPath === identity.projectRegistryPath) return;
      if (!existingOwner) this.pluginOwners.set(identity.rootPath, { rootPath: identity.rootPath, revision: '0' });
      this.pluginBindings.set(workspaceId, { workspaceId, rootPath: identity.rootPath, localSourcePath: identity.localSourcePath, projectRegistryPath: identity.projectRegistryPath });
      try { await this.persist(); }
      catch (error) {
        if (!existingOwner) this.pluginOwners.delete(identity.rootPath);
        if (previous) this.pluginBindings.set(workspaceId, previous); else this.pluginBindings.delete(workspaceId);
        throw error;
      }
    });
    const owner = this.pluginOwners.get(identity.rootPath);
    if (!owner) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return { rootSessionId, identity, owner };
  }

  async pluginRevision(workspaceId: string): Promise<string> {
    return (await this.pluginBinding(workspaceId)).owner.revision;
  }

  private async pluginOperation(workspaceId: string, operation: NativePluginOperation): Promise<CatalogResult> {
    const binding = await this.pluginBinding(workspaceId);
    const coordinator = this.pluginCoordinator?.();
    if (!coordinator) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return this.serial(`plugins:${binding.identity.rootPath}`, async () => {
      const expectedRevision = 'request' in operation ? operation.request.expectedRevision : undefined;
      const execute = async (): Promise<CatalogResult> => {
        if (expectedRevision !== undefined && expectedRevision !== binding.owner.revision) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', { currentRevision: binding.owner.revision });
        const nativeOwner = await this.readPluginOwner(binding.rootSessionId);
        if (nativeOwner.rootPath !== binding.identity.rootPath) throw new WorkerOperationError(409, 'CATALOG_CONFLICT');
        const revision = expectedRevision === undefined ? binding.owner.revision : CounterSchema.parse((BigInt(binding.owner.revision) + 1n).toString());
        const global = (operation.type === 'plugins.configure' && operation.request.settings !== undefined)
          || (operation.type === 'plugins.update' && operation.request.target.kind === 'marketplace')
          || (operation.type === 'plugins.install' ? operation.request.source.kind === 'package' || operation.request.source.scope === 'user'
            : operation.type === 'plugins.uninstall' || operation.type === 'plugins.configure' || operation.type === 'plugins.update'
              ? operation.request.target.kind === 'package' || operation.request.target.scope === 'user' : false);
        const project = operation.type === 'plugins.install' ? operation.request.source.kind === 'marketplace' && operation.request.source.scope === 'project'
          : operation.type === 'plugins.configure' ? operation.request.enabled !== undefined && operation.request.target.kind === 'marketplace' && operation.request.target.scope === 'project'
            : operation.type === 'plugins.uninstall' || operation.type === 'plugins.update'
              ? operation.request.target.kind === 'marketplace' && operation.request.target.scope === 'project' : false;
        const targets: CatalogWorkerIdentity[] = [];
        const affectedRootPaths = new Set([binding.identity.rootPath]);
        if (expectedRevision !== undefined) {
          for (const known of this.pluginBindings.values()) {
            if ((project && known.projectRegistryPath !== null && known.projectRegistryPath === nativeOwner.projectRegistryPath)
              || (!global && !project && known.localSourcePath === nativeOwner.localSourcePath)) affectedRootPaths.add(known.rootPath);
          }
          for (const worker of await coordinator.pluginTargets()) {
            const identity = await this.readPluginOwner(worker.rootSessionId, worker.workerGeneration);
            if ((global && identity.rootPath === binding.identity.rootPath)
              || (project && identity.projectRegistryPath !== null && identity.projectRegistryPath === nativeOwner.projectRegistryPath)
              || (!global && !project && identity.localSourcePath === nativeOwner.localSourcePath)) {
              targets.push(worker);
              affectedRootPaths.add(identity.rootPath);
            }
          }
        }
        const updates = expectedRevision === undefined ? [] : [...affectedRootPaths].map(rootPath => {
          const previous = this.pluginOwners.get(rootPath);
          return { rootPath, previous, previousRevision: previous?.revision,
            revision: rootPath === binding.identity.rootPath ? revision : CounterSchema.parse((BigInt(previous?.revision ?? '0') + 1n).toString()) };
        });
        const result = await this.workers.request(binding.rootSessionId, { type: 'catalog', operation, revision });
        if (result.type !== 'catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        if (expectedRevision === undefined) {
          return result.result.type === 'plugins.catalog' ? { type: 'plugins.catalog', catalog: { ...result.result.catalog,
            workers: await this.pluginRuntimeForOwner(workspaceId, binding.identity.rootPath, coordinator) } } : result.result;
        }
        if (result.result.type !== 'plugins.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
        const committedIdentity = await this.readPluginOwner(binding.rootSessionId);
        await this.stateMutation(async () => {
          const previousBinding = this.pluginBindings.get(workspaceId);
          for (const update of updates) {
            if (update.previous) update.previous.revision = update.revision;
            else this.pluginOwners.set(update.rootPath, { rootPath: update.rootPath, revision: update.revision });
          }
          this.pluginBindings.set(workspaceId, { workspaceId, rootPath: committedIdentity.rootPath,
            localSourcePath: committedIdentity.localSourcePath, projectRegistryPath: committedIdentity.projectRegistryPath });
          try { await this.persist(); }
          catch (error) {
            for (const update of updates) {
              if (update.previous && update.previousRevision !== undefined) update.previous.revision = update.previousRevision;
              else this.pluginOwners.delete(update.rootPath);
            }
            if (previousBinding) this.pluginBindings.set(workspaceId, previousBinding); else this.pluginBindings.delete(workspaceId);
            throw error;
          }
        });
        const outcomes = await coordinator.pluginsChanged({ revision,
          rootSessionIds: targets.map(worker => worker.rootSessionId) }, async worker => {
          const response = await this.workers.request(worker.rootSessionId, { type: 'catalog', revision,
            operation: { type: 'plugins.apply', persistedRevision: revision } }, worker.workerGeneration);
          if (response.type !== 'catalog' || response.result.type !== 'plugins.applied') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
          return response.result.result;
        });
        const applied = outcomes.some(outcome => outcome.outcome === 'applied');
        const failed = outcomes.some(outcome => outcome.outcome === 'failed');
        return { type: 'plugins.mutated', result: PluginMutationResultSchema.parse({ workspaceId, revision, persistence: 'committed',
          catalog: { ...result.result.catalog, workers: await this.pluginRuntimeForOwner(workspaceId, binding.identity.rootPath, coordinator) }, workers: outcomes,
          status: applied ? failed ? 'partial' : 'applied' : failed ? 'failed' : 'no-active-workers' }) };
      };
      return coordinator.runPluginOperation(execute);
    });
  }

  async applyPlugins(workspaceId: string, request: PluginApplyRequest,
    restart: (targets: CatalogWorkerIdentity[], revision: string, admit: CatalogAdmission) => Promise<PluginWorkerApplyOutcome[]>): Promise<PluginMutationResult> {
    const binding = await this.pluginBinding(workspaceId);
    const coordinator = this.pluginCoordinator?.();
    if (!coordinator) throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE');
    return this.serial(`plugins:${binding.identity.rootPath}`, () => coordinator.runPluginApplication(async admit => {
      const revision = binding.owner.revision;
      if (revision !== request.expectedRevision) throw new WorkerOperationError(409, 'CATALOG_CONFLICT', { currentRevision: revision });
      const targets: CatalogWorkerIdentity[] = [];
      for (const worker of await coordinator.pluginTargets()) {
        const identity = await this.readPluginOwner(worker.rootSessionId, worker.workerGeneration);
        if (identity.rootPath === binding.identity.rootPath) targets.push(worker);
      }
      const workers = await restart(targets, revision, admit);
      const response = await this.workers.request(binding.rootSessionId, { type: 'catalog', revision, operation: { type: 'plugins.read' } });
      if (response.type !== 'catalog' || response.result.type !== 'plugins.catalog') throw new WorkerOperationError(503, 'INTERNAL_ERROR');
      const applied = workers.some(worker => worker.outcome === 'applied');
      const failed = workers.some(worker => worker.outcome === 'failed');
      return PluginMutationResultSchema.parse({ workspaceId, revision, persistence: 'committed',
        catalog: { ...response.result.catalog, workers: await this.pluginRuntimeForOwner(workspaceId, binding.identity.rootPath, coordinator) }, workers,
        status: applied ? failed ? 'partial' : 'applied' : failed ? 'failed' : 'no-active-workers' });
    }));
  }

  private async pluginRuntimeForOwner(workspaceId: string, rootPath: string, coordinator: CatalogCoordinator): Promise<PluginRuntimeState[]> {
    const states = await coordinator.pluginRuntime(workspaceId);
    return Promise.all(states.map(async state => {
      try {
        const identity = await this.readPluginOwner(state.worker.rootSessionId, state.worker.workerGeneration);
        if (identity.rootPath === rootPath) return state;
        return { ...state, status: 'unavailable' as const, error: { code: 'PLUGIN_OWNER_CHANGED',
          detail: 'This active session belongs to a different native plugin profile than the selected workspace catalog.', retryable: false } };
      } catch {
        return { ...state, status: 'unavailable' as const, error: { code: 'SERVICE_UNAVAILABLE',
          detail: 'The active session native plugin owner could not be confirmed.', retryable: true } };
      }
    }));
  }
  private serial<T>(owner: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.tails.get(owner) ?? Promise.resolve()).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.tails.set(owner, tail);
    void tail.then(() => { if (this.tails.get(owner) === tail) this.tails.delete(owner); });
    return result;
  }
  private stateMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.stateTail.then(operation);
    this.stateTail = result.then(() => undefined, () => undefined);
    return result;
  }
  private async persist(): Promise<void> {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(JSON.stringify({ workspaces: [...this.workspaces.values()], owners: [...this.owners.values()],
        pluginOwners: [...this.pluginOwners.values()], pluginBindings: [...this.pluginBindings.values()] })); } finally { await file.close(); }
      await rename(temporary, this.file);
    } finally { try { await unlink(temporary); } catch {} }
  }
}
