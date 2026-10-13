import { CounterSchema, PositiveCounterSchema, type MCPConfigurationState } from '@openchamber/agent-contract';
import { lstat } from 'node:fs/promises';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { CatalogOperationSchema, CatalogResultSchema, type CatalogOperation, type CatalogResult } from '../catalogs/protocol.ts';
import type { CompletionWorkerBootstrap, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerCompletion } from './completion.ts';
import type { NativeModels } from './catalog-models.ts';
import { NativeAgents } from './catalog-agents.ts';
import { NativeCredentials } from './catalog-credentials.ts';
import { NativeMcpError, readNativeMcpConfiguration, writeNativeMcpConfiguration } from './mcp.ts';
import { nativeExtensionRoots, nativeModelsContext, openNativeRuntime, type NativeWorkerRuntime } from './native-runtime.ts';
import type { WorkerAuthorize } from './policy.ts';
import { captureNativePolicy } from './native-policy-snapshot.ts';
import type { HostNativePolicySnapshot } from '../native-policy-protocol.ts';

/** A workspace process owns native catalogs and completion, never a session or transcript. */
export class StatelessWorker {
  private readonly completion: WorkerCompletion;
  private readonly models: NativeModels;
  private readonly agents: NativeAgents;
  private readonly credentials: NativeCredentials;
  private readonly operations = new Set<Promise<WorkerOperationResult>>();
  private credentialScopeId: string;
  private activeCompletionId: string | undefined;
  private closed = false;
  private constructor(private readonly runtime: NativeWorkerRuntime, private readonly input: CompletionWorkerBootstrap, private readonly authorize: WorkerAuthorize) {
    this.credentialScopeId = input.workerGeneration;
    nativeModelsContext(runtime, () => this.credentialScopeId);
    const models = runtime.models;
    this.models = models;
    this.credentials = new NativeCredentials(runtime.authStorage, models, input.workspaceId, input.agentDirectoryId);
    this.agents = new NativeAgents({
      cwd: input.cwd, agentDirectory: input.agentDirectory, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      get extensionRoots() { return nativeExtensionRoots(runtime.settings); },
      availableToolNames: () => BUILTIN_TOOL_NAMES,
      permissionPreset: presetId => authorize({ type: 'tool', toolName: 'permission.preset', input: { presetId }, permissionPresetId: presetId }),
    });
    this.completion = new WorkerCompletion(runtime.modelRegistry, input.workspaceId, async (selection, controls) => {
      const resolved = await models.selection(selection, controls);
      await authorize({ type: 'tool', toolName: 'provider.use', input: { providerId: selection.providerId, modelId: selection.modelId, endpoint: resolved.nativeModel.baseUrl } });
      return resolved;
    });
  }

  static async open(input: CompletionWorkerBootstrap, authorize: WorkerAuthorize): Promise<StatelessWorker> {
    const runtime = await openNativeRuntime(input);
    try { return new StatelessWorker(runtime, input, authorize); }
    catch (error) { runtime.authStorage.close(); throw error; }
  }
  async authorizationPolicy(): Promise<HostNativePolicySnapshot> {
    const configuration = this.input.mcpConfigPath ? await this.readConfiguration() : null;
    return captureNativePolicy({ projectId: this.input.projectId, workspaceId: this.input.workspaceId, cwd: this.input.cwd, agentDirectory: this.input.agentDirectory, agentDirectoryId: this.input.agentDirectoryId }, this.runtime, this.agents, configuration?.config.servers ?? []);
  }

  operation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    const task = this.executeOperation(operation);
    this.operations.add(task);
    void task.then(() => this.operations.delete(task), () => this.operations.delete(task));
    return task;
  }

  private async executeOperation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Workspace worker is closed');
    if (operation.type === 'mcp.configuration.read') return { type: 'mcp.configuration', configuration: await this.readConfiguration() };
    if (operation.type === 'catalog') return { type: 'catalog', result: await this.catalog(operation.operation, operation.revision) };
    if (operation.type === 'mcp' && operation.operation.type === 'persist') {
      const { request, configuration } = operation.operation;
      const path = this.input.mcpConfigPath;
      if (!path) throw new ProjectionError(503, 'MCP_CONFIG_WRITE_FAILED', 'MCP storage ownership is unavailable');
      if (configuration.workspaceId !== this.input.workspaceId) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP workspace does not match worker identity');
      const current = await this.readConfiguration();
      const previousRevision = current?.persistedRevision ?? '0';
      if (request.expectedPersistedRevision !== previousRevision
        || BigInt(configuration.persistedRevision) !== BigInt(previousRevision) + 1n
        || JSON.stringify(configuration.config) !== JSON.stringify(request.config)) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      }
      for (const server of configuration.config.servers) await this.authorize({ type: 'mcp-server', server });
      return { type: 'mcp', result: { type: 'persisted', configuration: await writeNativeMcpConfiguration(path, configuration) } };
    }
    if (operation.type !== 'completion') throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Operation requires a live session worker');
    if (operation.operation.type === 'completion.cancel') return { type: 'completion', result: await this.completion.operation(operation.operation) };
    if (this.activeCompletionId !== undefined) throw new ProjectionError(409, 'INVALID_REQUEST', 'Completion is already active');
    this.activeCompletionId = operation.operation.request.completionId;
    this.credentialScopeId = this.activeCompletionId;
    try { return { type: 'completion', result: await this.completion.operation(operation.operation) }; }
    finally { this.activeCompletionId = undefined; }
  }

  private async readConfiguration(): Promise<MCPConfigurationState | null> {
    const path = this.input.mcpConfigPath;
    if (!path) throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP storage ownership is unavailable.', true);
    try { await lstat(path); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration could not be read.', true);
    }
    return readNativeMcpConfiguration(path, this.input.workspaceId);
  }

  private async catalog(input: CatalogOperation, revision: string): Promise<CatalogResult> {
    const operation = CatalogOperationSchema.parse(input);
    CounterSchema.parse(revision);
    if ('request' in operation && 'expectedRevision' in operation.request) {
      PositiveCounterSchema.parse(revision);
      if (BigInt(revision) !== BigInt(operation.request.expectedRevision) + 1n) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Mutation revision does not follow its expected owning revision');
    }
    const providerEntry = () => this.authorize({ type: 'provider-entry' });
    const workspaceId = this.input.workspaceId;
    let result: CatalogResult;
    switch (operation.type) {
      case 'catalog.models.read': result = { type: 'catalog.models', catalog: await this.models.readModels(workspaceId, revision) }; break;
      case 'catalog.providers.read': result = { type: 'catalog.providers', catalog: await this.models.readProviders(workspaceId, revision) }; break;
      case 'catalog.agents.read': result = { type: 'catalog.agents', catalog: await this.agents.read(workspaceId, revision) }; break;
      case 'catalog.provider.configure':
        await providerEntry();
        result = { type: 'catalog.provider.mutated', result: await this.models.configureProvider(operation.request, revision) }; break;
      case 'catalog.provider.delete': result = { type: 'catalog.provider.mutated', result: await this.models.deleteProvider(operation.request, revision) }; break;
      case 'catalog.model.configure':
        await providerEntry();
        result = { type: 'catalog.model.mutated', result: await this.models.configureModel(operation.request, revision) }; break;
      case 'catalog.model.delete': result = { type: 'catalog.model.mutated', result: await this.models.deleteModel(operation.request, revision) }; break;
      case 'catalog.credential.write':
        await providerEntry();
        result = { type: 'catalog.credential.mutated', result: await this.credentials.write(operation.request, revision) }; break;
      case 'catalog.credential.delete': result = { type: 'catalog.credential.mutated', result: await this.credentials.delete(operation.request, revision) }; break;
      case 'catalog.agent.create': result = { type: 'catalog.agent.mutated', result: await this.agents.create(operation.request, revision) }; break;
      case 'catalog.agent.update': result = { type: 'catalog.agent.mutated', result: await this.agents.update(operation.request, revision) }; break;
      case 'catalog.agent.delete': result = { type: 'catalog.agent.mutated', result: await this.agents.delete(operation.request, revision) }; break;
      case 'skills.read': case 'skills.apply': case 'skills.expand':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Skills require a live session runtime');
      default:
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Catalog operation is unavailable');
    }
    return CatalogResultSchema.parse(result);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.completion.close();
      await Promise.allSettled(this.operations);
    } finally { this.runtime.authStorage.close(); }
  }
}
