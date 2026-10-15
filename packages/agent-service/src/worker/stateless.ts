import { CounterSchema, PositiveCounterSchema, JsonObjectSchema, MCPOAuthPublicConfigurationSchema, type MCPConfigurationState } from '@openchamber/agent-contract';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { CatalogOperationSchema, CatalogResultSchema, type CatalogOperation, type CatalogResult } from '../catalogs/protocol.ts';
import type { CompletionWorkerBootstrap, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerCompletion } from './completion.ts';
import type { NativeModels } from './catalog-models.ts';
import { NativeAgents } from './catalog-agents.ts';
import { NativeCredentials } from './catalog-credentials.ts';
import { WorkerMcp, NativeMcpError, readNativeMcpConfigurationIfPresent, writeNativeMcpConfiguration } from './mcp.ts';
import { NativeMcpCredentials } from './mcp-credentials.ts';
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
  private readonly mcp: WorkerMcp | undefined;
  private readonly mcpCredentials: NativeMcpCredentials;
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
    this.mcpCredentials = new NativeMcpCredentials(runtime.authStorage, input.workspaceId);
    this.mcp = input.mcpConfigPath ? new WorkerMcp({
      cwd: input.cwd, configPath: input.mcpConfigPath, authStorage: runtime.authStorage,
      worker: { rootSessionId: input.authorizationRootId, workspaceId: input.workspaceId, workerGeneration: input.workerGeneration },
      resolveCredentialRef: reference => this.mcpCredentials.resolve(reference),
      resolveCommand: async transport => transport.command,
      authorizeServer: server => authorize({ type: 'mcp-server', server }),
      authorizeOAuth: (server, configuration) => authorize({ type: 'mcp-oauth', server, configuration: JsonObjectSchema.parse(Object.fromEntries(Object.entries(MCPOAuthPublicConfigurationSchema.parse(configuration)).filter(([, value]) => value !== undefined))) }),
      sanitizeTool: tool => tool,
      onCatalog: () => {},
      onRuntimeFailure: error => { process.stderr.write(`${JSON.stringify({ type: 'mcp.runtime.failure', error })}\n`); },
      isCurrent: () => !this.closed,
    }) : undefined;
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
      for (const server of configuration.config.servers) {
        await this.authorize({ type: 'mcp-server', server });
        const references = server.transport.type === 'stdio' ? Object.values(server.transport.envCredentialRefs ?? {})
          : [...Object.values(server.transport.headerCredentialRefs ?? {}), ...(server.transport.credentialRef ? [server.transport.credentialRef] : [])];
        for (const reference of references) await this.mcpCredentials.resolve(reference);
      }
      return { type: 'mcp', result: { type: 'persisted', configuration: await writeNativeMcpConfiguration(path, configuration) } };
    }
    if (operation.type === 'mcp') {
      if (!this.mcp) throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP storage ownership is unavailable.', true);
      const request = operation.operation;
      const configuration = await this.readConfiguration();
      if (!configuration || JSON.stringify(configuration) !== JSON.stringify(request.configuration)) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      switch (request.type) {
        case 'test': return { type: 'mcp', result: { type: 'tested', result: await this.mcp.test(request.serverId, configuration) } };
        case 'oauth.status': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthRead(request.serverId, configuration) } };
        case 'oauth': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthExecute(request.serverId, request.request, configuration) } };
        case 'secret.write': {
          if (request.request.persistedRevision !== configuration.persistedRevision) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
          const server = configuration.config.servers.find(candidate => candidate.serverId === request.serverId);
          if (!server) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP server is not configured.', false);
          await this.authorize({ type: 'mcp-server', server });
          return { type: 'mcp', result: { type: 'secret.written', result: await this.mcpCredentials.write(request.serverId, configuration.persistedRevision, request.request.value) } };
        }
        default: throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'MCP operation requires a live session worker');
      }
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
    return readNativeMcpConfigurationIfPresent(path, this.input.workspaceId);
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
      case 'catalog.credential.resolve':
        result = { type: 'catalog.credential.resolved', result: await this.credentials.resolve(operation.request) }; break;
      case 'catalog.credential.handoff':
        await providerEntry();
        result = { type: 'catalog.credential.handed-off', result: await this.credentials.handoff(operation.request, revision) }; break;
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
      await this.mcp?.close();
    } finally { this.runtime.authStorage.close(); }
  }
}
