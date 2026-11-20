import { dirname, join } from 'node:path';
import { NativeProviderOAuth } from './provider-oauth.ts';
import { CounterSchema, PositiveCounterSchema, JsonObjectSchema, MCPOAuthPublicConfigurationSchema, MCPConfigurationStateSchema, type MCPConfigurationState, type ToolCatalogEntry } from '@openchamber/agent-contract';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import {
  BUILTIN_TOOLS, HIDDEN_TOOLS,
  MemoryEditTool, MemoryRetainTool, MemoryRecallTool, MemoryReflectTool,
  LearnTool, ManageSkillTool, ContextNotesTool, NewContextTool, AskTool,
  resolveBuiltinToolPlan,
  type ToolSession,
} from '@oh-my-pi/pi-coding-agent/tools';
import { resolveToolTier } from '@oh-my-pi/pi-coding-agent/tools/approval';
type ToolMetadataSubject = Parameters<typeof resolveToolTier>[0] & { label?: string; description?: string };
import { HOST_TOOL_NAMES, HOST_TOOL_DESCRIPTIONS, normalizeHostToolEnablement } from './host-tool.ts';
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
import { NativePlugins } from './catalog-plugins.ts';
import { NativeExtensions } from './catalog-extensions.ts';
import { NativePluginOperationSchema } from '../catalogs/plugins.ts';
import { NativeExtensionOperationSchema } from '../catalogs/plugins.ts';
import { NativeFileResources } from './catalog-resources.ts';
import { nativeSkillOptions } from './native-runtime.ts';
import { NativeCacheWarming } from './catalog-warming.ts';
import { NativeWebSearch, installWebSearchAuthorization } from './catalog-websearch.ts';
import { NativeSettings } from './catalog-settings.ts';

/** A workspace process owns native catalogs and completion, never a session or transcript. */
export class StatelessWorker {
  private readonly completion: WorkerCompletion;
  private readonly models: NativeModels;
  private readonly agents: NativeAgents;
  private readonly credentials: NativeCredentials;
  private readonly oauth: NativeProviderOAuth;
  private readonly mcp: WorkerMcp | undefined;
  private readonly mcpCredentials: NativeMcpCredentials;
  private readonly fileResources: NativeFileResources;
  private readonly warming: NativeCacheWarming;
  private readonly webSearch: NativeWebSearch;
  private readonly settingsStore: NativeSettings;
  private readonly operations = new Set<Promise<WorkerOperationResult>>();
  private credentialScopeId: string;
  private activeCompletionId: string | undefined;
  private closed = false;
  private constructor(private readonly runtime: NativeWorkerRuntime, private readonly input: CompletionWorkerBootstrap, private readonly authorize: WorkerAuthorize) {
    this.credentialScopeId = input.workerGeneration;
    this.warming = new NativeCacheWarming({ cwd: input.cwd, agentDirectory: input.agentDirectory });
    nativeModelsContext(runtime, () => this.credentialScopeId);
    const models = runtime.models;
    this.models = models;
    this.credentials = new NativeCredentials(runtime.authStorage, models, input.workspaceId, input.agentDirectoryId,
      join(dirname(runtime.modelsPath), 'provider-account-labels.json'));
    this.oauth = new NativeProviderOAuth(runtime.authStorage, input.workerGeneration);
    this.webSearch = new NativeWebSearch(runtime, input.workspaceId, authorize);
    this.settingsStore = new NativeSettings(runtime.settings, input.agentDirectory);
    this.mcpCredentials = new NativeMcpCredentials(runtime.authStorage, input.workspaceId);
    this.fileResources = new NativeFileResources({
      cwd: input.cwd, agentDirectory: input.agentDirectory,
      get extensionRoots() { return nativeExtensionRoots(runtime.settings); },
      get skillOptions() { return nativeSkillOptions(runtime.settings); }
    });
    this.mcp = input.mcpConfigPath ? new WorkerMcp({
      cwd: input.cwd, configPath: input.mcpConfigPath,
      userConfigPath: join(input.agentDirectory, 'mcp.json'),
      authStorage: runtime.authStorage,
      worker: { rootSessionId: input.authorizationRootId, workspaceId: input.workspaceId, workerGeneration: input.workerGeneration },
      resolveCredentialRef: reference => this.mcpCredentials.resolve(reference),
      resolveCommand: async transport => transport.command,
      authorizeServer: (server, proposed) => authorize(
        proposed
          ? { type: 'mcp-server', server, proposed: true }
          : { type: 'mcp-server', server }
      ),
      authorizeOAuth: (server, configuration) => authorize({
        type: 'mcp-oauth',
        server,
        configuration: JsonObjectSchema.parse(Object.fromEntries(Object.entries(MCPOAuthPublicConfigurationSchema.parse(configuration)).filter(([, value]) => value !== undefined))),
      }),
      sanitizeTool: tool => tool,
      onCatalog: () => { },
      onRuntimeFailure: error => { process.stderr.write(`${JSON.stringify({ type: 'mcp.runtime.failure', error })}\n`); },
      isCurrent: () => !this.closed,
    }) : undefined;
    this.agents = new NativeAgents({
      cwd: input.cwd, agentDirectory: input.agentDirectory, models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
      get extensionRoots() { return nativeExtensionRoots(runtime.settings); },
      availableToolNames: () => BUILTIN_TOOL_NAMES,
    });
    this.completion = new WorkerCompletion(runtime.modelRegistry, input.workspaceId, async (selection, controls) => {
      const resolved = await models.selection(selection, controls);
      // The stateless worker publishes a fresh policy snapshot before every
      // operation, so the selection is checked against the live catalog.
      await authorize({ type: 'tool', toolName: 'provider.use', input: { providerId: selection.providerId, modelId: selection.modelId, endpoint: resolved.nativeModel.baseUrl } });
      return resolved;
    });
  }

  static async open(input: CompletionWorkerBootstrap, authorize: WorkerAuthorize): Promise<StatelessWorker> {
    const runtime = await openNativeRuntime(input);
    try {
      await installWebSearchAuthorization(runtime, authorize);
      return new StatelessWorker(runtime, input, authorize);
    }
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
    if (operation.type === 'web-search') return { type: 'web-search', result: await this.webSearch.operation(operation.operation) };
    if (this.webSearch.requiresRestart) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native settings require a fresh workspace worker');
    if (operation.type === 'tools.catalog') {
      const sessionContext: ToolSession = {
        cwd: this.input.cwd,
        settings: this.runtime.settings,
        hasUI: true,
        enableLsp: true,
        taskDepth: 0,
        getSessionFile: () => null,
        getSessionSpawns: () => null,
      };

      const plan = await resolveBuiltinToolPlan(sessionContext);

      const allTools = { ...BUILTIN_TOOLS, ...HIDDEN_TOOLS };
      const tools: ToolCatalogEntry[] = [];

      for (const name of BUILTIN_TOOL_NAMES) {
        let tool: ToolMetadataSubject | null = null;
        try {
          if (Object.hasOwn(allTools, name)) {
            // SAFETY: Object.hasOwn ensures name is a valid key of allTools
            const factory = allTools[name as keyof typeof allTools];
            tool = await factory(sessionContext);
          }
        } catch {
          // direct fallback
        }
        if (!tool) {
          try {
            switch (name) {
              case 'memory_edit': tool = new MemoryEditTool(sessionContext); break;
              case 'retain': tool = new MemoryRetainTool(sessionContext); break;
              case 'recall': tool = new MemoryRecallTool(sessionContext); break;
              case 'reflect': tool = new MemoryReflectTool(sessionContext); break;
              case 'learn': tool = new LearnTool(sessionContext); break;
              case 'manage_skill': tool = new ManageSkillTool(() => Promise.resolve()); break;
              case 'context_notes': tool = new ContextNotesTool(sessionContext); break;
              case 'new_context': tool = new NewContextTool(sessionContext); break;
              case 'ask': tool = new AskTool(sessionContext); break;
            }
          } catch {
            // direct instantiation fallback
          }
        }
        const tier = tool ? resolveToolTier(tool, {}) : 'exec';
        const label = tool?.label || name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
        const description = tool?.description || '';
        tools.push({
          name,
          label,
          description,
          tier,
          availability: plan.names.includes(name),
        });
      }

      // Add Host tools
      const hostToolsEnablement = normalizeHostToolEnablement(this.input.hostTools);
      for (const name of HOST_TOOL_NAMES) {
        tools.push({
          name,
          label: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
          description: HOST_TOOL_DESCRIPTIONS[name] ?? '',
          tier: 'exec',
          availability: hostToolsEnablement[name] ?? false,
        });
      }

      // MCP tools are appended by the workspace route from the workspace MCP
      // owner: this process connects no server, so it cannot name them.
      return { type: 'tools.catalog', catalog: { workspaceId: this.input.workspaceId, tools } };
    }
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
        await this.authorize({ type: 'mcp-server', server, proposed: true });
        const references = server.transport.type === 'stdio' ? Object.values(server.transport.envCredentialRefs ?? {})
          : [...Object.values(server.transport.headerCredentialRefs ?? {}), ...(server.transport.credentialRef ? [server.transport.credentialRef] : [])];
        for (const reference of references) await this.mcpCredentials.resolve(reference);
      }
      return { type: 'mcp', result: { type: 'persisted', configuration: await writeNativeMcpConfiguration(path, configuration, join(this.input.agentDirectory, 'mcp.json')) } };
    }
    if (operation.type === 'mcp') {
      if (!this.mcp) throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP storage ownership is unavailable.', true);
      const request = operation.operation;
      const expected = MCPConfigurationStateSchema.parse(request.configuration);
      const configuration = await this.readConfiguration();
      if (!configuration || JSON.stringify(configuration) !== JSON.stringify(expected)) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      switch (request.type) {
        case 'test': return { type: 'mcp', result: { type: 'tested', result: await this.mcp.test(request.serverId, configuration) } };
        case 'discover': return { type: 'mcp', result: { type: 'discovered', result: await this.mcp.discover(configuration) } };
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
    return readNativeMcpConfigurationIfPresent(path, this.input.workspaceId, join(this.input.agentDirectory, 'mcp.json'));
  }

  private async catalog(input: CatalogOperation, revision: string): Promise<CatalogResult> {
    const operation = CatalogOperationSchema.parse(input);
    CounterSchema.parse(revision);
    if ('request' in operation && 'expectedRevision' in operation.request
      && !(operation.type === 'catalog.provider.oauth' && operation.request.action !== 'commit')) {
      PositiveCounterSchema.parse(revision);
      if (BigInt(revision) !== BigInt(operation.request.expectedRevision) + 1n) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Mutation revision does not follow its expected owning revision');
    }
    const extensionOperation = NativeExtensionOperationSchema.safeParse(operation);
    if (extensionOperation.success) return CatalogResultSchema.parse(await new NativeExtensions({
      cwd: this.input.cwd, agentDirectory: this.input.agentDirectory,
      worker: { rootSessionId: this.input.authorizationRootId, workspaceId: this.input.workspaceId, workerGeneration: this.input.workerGeneration },
      settings: this.runtime.settings, extensionRoots: nativeExtensionRoots(this.runtime.settings),
    }).operation(extensionOperation.data, revision));
    const pluginOperation = NativePluginOperationSchema.safeParse(operation);
    if (pluginOperation.success) return CatalogResultSchema.parse(await new NativePlugins({
      cwd: this.input.cwd,
      agentDirectory: this.input.agentDirectory,
      worker: { rootSessionId: this.input.authorizationRootId, workspaceId: this.input.workspaceId, workerGeneration: this.input.workerGeneration },
      settings: this.runtime.settings, extensionRoots: nativeExtensionRoots(this.runtime.settings),
    }).operation(pluginOperation.data, revision));
    const providerEntry = () => this.authorize({ type: 'provider-entry' });
    const workspaceId = this.input.workspaceId;
    let result: CatalogResult;
    switch (operation.type) {
      case 'fileResources':
        await this.runtime.settings.reloadFromDisk();
        result = { type: 'fileResources', result: await this.fileResources.operation(operation.operation, workspaceId, revision) }; break;
      case 'catalog.models.read': result = { type: 'catalog.models', catalog: await this.models.readModels(workspaceId, revision) }; break;
      case 'catalog.providers.read': result = { type: 'catalog.providers', catalog: await this.models.readProviders(workspaceId, revision) }; break;
      case 'catalog.agents.read': result = { type: 'catalog.agents', catalog: await this.agents.read(workspaceId, revision) }; break;
      case 'catalog.warming.read': result = { type: 'catalog.warming', state: await this.warming.read(workspaceId, revision) }; break;
      case 'catalog.warming.persist': result = { type: 'catalog.warming', state: await this.warming.persist(workspaceId, operation.request.mode, revision) }; break;
      case 'catalog.warming.apply':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Cache warming application requires a live session runtime');
      case 'catalog.settings.apply':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Settings application requires a live session runtime');
      case 'catalog.settings.read':
        result = { type: 'catalog.settings', state: await this.settingsStore.read(workspaceId, revision) }; break;
      case 'catalog.settings.write':
        result = { type: 'catalog.settings.mutated', state: await this.settingsStore.write(workspaceId, revision, operation.request) }; break;
      case 'catalog.provider.accounts.read': result = { type: 'catalog.provider.accounts', result: await this.credentials.accounts(operation.providerId, revision) }; break;
      case 'catalog.provider.account.mutate':
        if (operation.request.action === 'remove') this.oauth.cancelProvider(operation.providerId);
        result = { type: 'catalog.provider.accounts', result: await this.credentials.account(operation.providerId, operation.request, revision) }; break;
      case 'catalog.provider.oauth.methods': result = { type: 'catalog.provider.oauth.methods', result: this.oauth.methods() }; break;
      case 'catalog.provider.oauth':
        if (['start', 'input', 'commit'].includes(operation.request.action)) await providerEntry();
        result = { type: 'catalog.provider.oauth', result: await this.oauth.execute(operation.providerId, operation.request, revision) }; break;
      case 'catalog.provider.configuration.read': result = { type: 'catalog.provider.configuration', result: await this.models.readProviderConfiguration(operation.providerId, revision) }; break;
      case 'catalog.provider.models.discover':
        await providerEntry();
        result = { type: 'catalog.provider.models.discovered', result: await this.models.discoverProviderModels(operation.request) }; break;
      case 'catalog.provider.models.enrich':
        result = { type: 'catalog.provider.models.enriched', result: await this.models.enrichProviderModels(operation.request) }; break;
      case 'catalog.provider.configure':
        await providerEntry();
        result = { type: 'catalog.provider.mutated', result: await this.models.configureProvider(operation.request, revision) }; break;
      case 'catalog.provider.delete':
        this.oauth.cancelProvider(operation.request.providerId);
        result = { type: 'catalog.provider.mutated', result: await this.models.deleteProvider(operation.request, revision) }; break;
      case 'catalog.model.configure':
        await providerEntry();
        result = { type: 'catalog.model.mutated', result: await this.models.configureModel(operation.request, revision) }; break;
      case 'catalog.image.configure':
        await providerEntry();
        result = { type: 'catalog.image.mutated', result: await this.models.configureImageModel(operation.request, revision) }; break;
      case 'catalog.image.generate':
        await providerEntry();
        result = { type: 'catalog.image.generated', result: await this.models.generate(operation.request) }; break;
      case 'catalog.model.delete': result = { type: 'catalog.model.mutated', result: await this.models.deleteModel(operation.request, revision) }; break;
      case 'catalog.credential.write':
        await providerEntry();
        result = { type: 'catalog.credential.mutated', result: await this.credentials.write(operation.request, revision) }; break;
      case 'catalog.credential.resolve':
        result = { type: 'catalog.credential.resolved', result: await this.credentials.resolve(operation.request) }; break;
      case 'catalog.credential.handoff':
        await providerEntry();
        result = { type: 'catalog.credential.handed-off', result: await this.credentials.handoff(operation.request, revision) }; break;
      case 'catalog.credential.delete':
        this.oauth.cancelProvider(operation.request.providerId);
        result = { type: 'catalog.credential.mutated', result: await this.credentials.delete(operation.request, revision) }; break;
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
      await this.oauth.close();
      await this.completion.close();
      await Promise.allSettled(this.operations);
      await this.mcp?.close();
    } finally { this.runtime.authStorage.close(); }
  }
}
