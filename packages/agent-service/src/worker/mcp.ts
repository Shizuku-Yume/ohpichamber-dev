import { z } from 'zod';
import {
  CatalogWorkerIdentitySchema, CounterSchema, EntityIdSchema, JsonObjectSchema,
  MCPApplyRequestSchema, MCPAppliedRevisionsSchema, MCPCatalogReadSchema,
  MCPCatalogStateSchema, MCPConfigurationStateSchema, MCPConfigureRequestSchema,
  MCPReconnectRequestSchema, MCPToolSchema, MCPWorkerApplyOutcomeSchema,
  type CatalogOperationError, type CatalogWorkerIdentity, type MCPApplyRequest,
  type MCPAppliedRevisions, type MCPCatalogRead, type MCPCatalogState,
  type MCPConfigurationState, type MCPConfigureRequest, type MCPReconnectRequest,
  type MCPServerConfig, type MCPTool, type MCPWorkerApplyOutcome,
} from '@openchamber/agent-contract';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent';
import { readMCPConfigFile, writeMCPConfigFile } from '@oh-my-pi/pi-coding-agent/mcp/config-writer';
import { MCPManager, type MCPAuthHandler, type MCPLoadResult } from '@oh-my-pi/pi-coding-agent/mcp/manager';
import {
  MCPOAuthFlow, mcpOAuthCredentialId,
  type MCPOAuthConfig, type MCPStoredOAuthCredential,
} from '@oh-my-pi/pi-coding-agent/mcp/oauth-flow';
import { refreshStoredManagedMcpOAuthCredential } from '@oh-my-pi/pi-coding-agent/mcp/oauth-credentials';
import type { MCPConfigFile, MCPServerConfig as SDKMCPServerConfig } from '@oh-my-pi/pi-coding-agent/mcp/types';
import type { AuthStorage as SDKAuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';

export * from './mcp/protocol.ts';

type OAuthController = ConstructorParameters<typeof MCPOAuthFlow>[1];
type NativeTools = MCPLoadResult['tools'];
type ManagedFile = MCPConfigFile & { openchamber: MCPConfigurationState };

// Only the service's definition-only native format is projected. An arbitrary
// SDK file containing secret headers/env is not silently rewritten or exposed.
const DefinitionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('stdio'), command: z.string().min(1), args: z.array(z.string()), enabled: z.boolean() }),
  z.strictObject({ type: z.literal('http'), url: z.string(), enabled: z.boolean() }),
  z.strictObject({ type: z.literal('sse'), url: z.string(), enabled: z.boolean() }),
]);
const ManagedFileSchema = z.strictObject({
  $schema: z.string().optional(),
  mcpServers: z.record(z.string(), DefinitionSchema),
  disabledServers: z.array(z.string()),
  openchamber: MCPConfigurationStateSchema,
});

function definition(server: MCPServerConfig): SDKMCPServerConfig {
  return server.transport.type === 'stdio'
    ? { type: 'stdio', command: server.transport.command, args: server.transport.args, enabled: server.enabled }
    : { type: server.transport.type, url: server.transport.url, enabled: server.enabled };
}

function managedFile(configuration: MCPConfigurationState): ManagedFile {
  return {
    mcpServers: Object.fromEntries(configuration.config.servers.map(server => [server.serverId, definition(server)])),
    disabledServers: configuration.config.servers.filter(server => !server.enabled).map(server => server.serverId),
    openchamber: configuration,
  };
}

/** The workspace owner supplies the durable revision; a worker never mints it. */
export async function writeNativeMcpConfiguration(configPath: string, captured: MCPConfigurationState): Promise<MCPConfigurationState> {
  const configuration = MCPConfigurationStateSchema.parse(captured);
  try {
    await writeMCPConfigFile(configPath, managedFile(configuration));
  } catch {
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'MCP configuration could not be committed.', true);
  }
  return configuration;
}

export async function readNativeMcpConfiguration(configPath: string, workspaceId: string): Promise<MCPConfigurationState> {
  try {
    const raw: unknown = await readMCPConfigFile(configPath);
    const file = ManagedFileSchema.parse(raw);
    if (file.openchamber.workspaceId !== workspaceId) throw new Error('Workspace mismatch');
    const expected = managedFile(file.openchamber);
    if (JSON.stringify(file.mcpServers) !== JSON.stringify(expected.mcpServers)
      || JSON.stringify(file.disabledServers) !== JSON.stringify(expected.disabledServers)) {
      throw new Error('Native definitions and captured state disagree');
    }
    return file.openchamber;
  } catch {
    throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration is absent, invalid or unreadable.', true);
  }
}

export class NativeMcpError extends Error {
  constructor(readonly code: string, detail: string, readonly retryable: boolean, readonly state?: MCPCatalogRead) {
    super(detail);
    this.name = 'NativeMcpError';
  }
  get operationError(): CatalogOperationError {
    return { code: this.code, detail: this.message, retryable: this.retryable };
  }
}

export interface NativeMcpDependencies {
  readonly cwd: string;
  readonly configPath: string;
  readonly worker: CatalogWorkerIdentity;
  readonly authStorage: SDKAuthStorage;
  /** Host-authorized opaque reference -> private AuthStorage provider namespace. */
  readonly resolveCredentialRef: (reference: string) => Promise<string>;
  readonly resolveCommand: (server: Extract<MCPServerConfig['transport'], { type: 'stdio' }>) => Promise<string>;
  /** Existing Host network/enterprise policy, evaluated at each crossing. */
  readonly authorizeServer: (server: MCPServerConfig) => Promise<void>;
  readonly authorizeOAuth: (server: MCPServerConfig, config: MCPOAuthConfig) => Promise<void>;
  readonly sanitizeTool: (tool: MCPTool) => MCPTool;
  readonly onCatalog: (state: MCPCatalogState) => void;
  /** Non-throwing observer; MCP_CLEANUP_FAILED does not undo a committed catalog. */
  readonly onRuntimeFailure: (error: CatalogOperationError) => void;
  readonly isCurrent: () => boolean;
}

/**
 * Stable native factory manager. Each server has a real SDK manager so replacement
 * handshakes cannot tear down the last usable connection. The root publishes all
 * definitions/tools together; reconnect replaces only its addressed server.
 */
export class WorkerMcp extends MCPManager {
  #active = new Map<string, MCPManager>();
  #owned = new Set<MCPManager>();
  #session: AgentSession | undefined;
  #closed = false;
  #tail: Promise<void> = Promise.resolve();
  #catalog: MCPCatalogState;
  #configuration: MCPConfigurationState | undefined;
  #oauth = new Map<string, { abort: AbortController; done: Promise<void> }>();
  #toolListeners = new Set<Parameters<MCPManager['addToolsChangedListener']>[0]>();
  #notificationListeners = new Set<Parameters<MCPManager['addNotificationListener']>[0]>();
  #statusListeners = new Set<Parameters<MCPManager['addConnectionStatusListener']>[0]>();
  #catalogListeners = new Set<Parameters<MCPManager['addCatalogChangeListener']>[0]>();
  #toolsHandler: Parameters<MCPManager['setOnToolsChanged']>[0] | undefined;
  #resourcesHandler: Parameters<MCPManager['setOnResourcesChanged']>[0] | undefined;
  #promptsHandler: Parameters<MCPManager['setOnPromptsChanged']>[0] | undefined;
  #authHandler: MCPAuthHandler | undefined;
  #notificationsEnabled = false;

  constructor(private readonly deps: NativeMcpDependencies) {
    super(deps.cwd, null);
    this.#catalog = MCPCatalogStateSchema.parse({
      worker: CatalogWorkerIdentitySchema.parse(deps.worker), runtimeStatus: 'unavailable',
      appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [],
    });
  }

  /** Pass this manager with enableMCP:true, then attach the factory's real session. */
  attachSession(session: AgentSession): void {
    this.#assertCurrent();
    if (this.#session && this.#session !== session) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP session is already attached.', false);
    this.#session = session;
  }

  read(captured: MCPConfigurationState): MCPCatalogRead {
    const configuration = this.#capture(captured);
    const usable = this.#catalog.runtimeStatus === 'ready' && this.#catalog.appliedRevision !== null
      && [...this.#active].every(([name, manager]) => manager.getConnectionStatus(name) === 'connected'
        && manager.getConnection(name)?.tools !== undefined);
    return MCPCatalogReadSchema.parse({
      configuration, workerCatalog: { ...this.#catalog, runtimeStatus: usable ? 'ready' : 'unavailable' },
    });
  }

  /** Called once by the serialized workspace owner, never once per fan-out root. */
  persist(raw: MCPConfigureRequest, next: MCPConfigurationState): Promise<MCPConfigurationState> {
    return this.#serialize(async () => {
      const request = MCPConfigureRequestSchema.parse(raw);
      const configuration = this.#capture(next);
      const current = await readNativeMcpConfiguration(this.deps.configPath, this.deps.worker.workspaceId);
      if (request.expectedPersistedRevision !== current.persistedRevision
        || BigInt(configuration.persistedRevision) <= BigInt(current.persistedRevision)
        || JSON.stringify(configuration.config) !== JSON.stringify(request.config)) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      }
      for (const server of configuration.config.servers) await this.deps.authorizeServer(server);
      return writeNativeMcpConfiguration(this.deps.configPath, configuration);
    });
  }

  apply(raw: MCPApplyRequest, captured: MCPConfigurationState): Promise<MCPWorkerApplyOutcome> {
    return this.#serialize(async () => {
      const request = MCPApplyRequestSchema.parse(raw);
      const configuration = this.#capture(captured);
      if (request.persistedRevision !== configuration.persistedRevision) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      }
      const next = new Map<string, MCPManager>();
      const attempts = await Promise.allSettled(configuration.config.servers.filter(server => server.enabled).map(async server => {
        const manager = await this.#stage(server);
        next.set(server.serverId, manager);
      }));
      if (attempts.some(attempt => attempt.status === 'rejected')) {
        await this.#release(next.values());
        return this.#failed(configuration, 'MCP_APPLY_FAILED', 'MCP runtime application failed; the prior catalog is retained.');
      }
      try {
        await this.#publish(next, configuration, configuration.persistedRevision);
        return MCPWorkerApplyOutcomeSchema.parse({ worker: this.deps.worker, outcome: 'applied', revisions: this.#revisions(configuration) });
      } catch {
        await this.#release([...next.values()].filter(manager => ![...this.#active.values()].includes(manager)));
        return this.#failed(configuration, 'MCP_APPLY_FAILED', 'MCP runtime application or cleanup failed.');
      }
    });
  }

  reconnect(serverId: string, raw: MCPReconnectRequest, captured: MCPConfigurationState): Promise<MCPCatalogRead> {
    return this.#serialize(async () => {
      EntityIdSchema.parse(serverId);
      const request = MCPReconnectRequestSchema.parse(raw);
      if (request.workerGeneration !== this.deps.worker.workerGeneration) {
        throw new NativeMcpError('WORKER_GENERATION_CONFLICT', 'The MCP worker generation changed.', false);
      }
      const configuration = this.#capture(captured);
      if (request.persistedRevision !== configuration.persistedRevision
        || request.expectedCatalogRevision !== this.#catalog.catalogRevision
        || this.#catalog.appliedRevision !== configuration.persistedRevision) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP applied configuration or catalog changed.', false, this.read(configuration));
      }
      const server = configuration.config.servers.find(item => item.serverId === serverId && item.enabled);
      if (!server || !this.#active.has(serverId)) {
        throw new NativeMcpError('MCP_RECONNECT_FAILED', 'The configured MCP runtime is not available.', true, this.read(configuration));
      }
      let candidate: MCPManager | undefined;
      try {
        candidate = await this.#stage(server);
        const next = new Map(this.#active);
        next.set(serverId, candidate);
        await this.#publish(next, configuration, configuration.persistedRevision);
        return this.read(configuration);
      } catch {
        if (candidate && this.#active.get(serverId) !== candidate) await this.#release([candidate]);
        throw new NativeMcpError('MCP_RECONNECT_FAILED', 'MCP reconnect failed; retained runtime state is included.', true, this.read(configuration));
      }
    });
  }

  /** Native controller delivers authorization/pasted callback; AbortSignal cancels its real listener. */
  async oauthConnect(serverId: string, captured: MCPConfigurationState, config: MCPOAuthConfig, controller: OAuthController): Promise<void> {
    const configuration = this.#capture(captured);
    const server = this.#remoteServer(serverId, configuration);
    if (this.#oauth.has(serverId)) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP OAuth is already pending.', false);
    await this.deps.authorizeServer(server);
    await this.deps.authorizeOAuth(server, config);
    if (config.redirectUri) {
      const redirect = new URL(config.redirectUri);
      const localCallback = redirect.protocol === 'http:'
        && (redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1');
      if (!localCallback && !controller.onManualCodeInput) {
        throw new NativeMcpError('MCP_OAUTH_FAILED', 'A non-local OAuth redirect requires a callback-input controller.', false);
      }
    }
    this.#assertCurrent();
    if (this.#oauth.has(serverId)) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP OAuth is already pending.', false);
    const abort = new AbortController();
    const signal = controller.signal ? AbortSignal.any([abort.signal, controller.signal]) : abort.signal;
    const flow = new MCPOAuthFlow({ ...config, resource: config.resource ?? server.transport.url,
      stripSameOriginResource: config.stripSameOriginResource ?? config.resource === undefined }, { ...controller, signal });
    const done = (async () => {
      try {
        const credentials = await flow.login();
        signal.throwIfAborted();
        this.#assertCurrent();
        const stored: MCPStoredOAuthCredential = {
          ...credentials, type: 'oauth', authorizedAt: Date.now(), tokenUrl: config.tokenUrl,
          clientId: flow.resolvedClientId, clientSecret: config.clientSecret ?? flow.registeredClientSecret,
          resource: flow.resource, authorizationUrl: flow.authorizationUrl,
        };
        const provider = server.transport.credentialRef
          ? await this.deps.resolveCredentialRef(server.transport.credentialRef)
          : mcpOAuthCredentialId(server.transport.url);
        signal.throwIfAborted();
        this.#assertCurrent();
        await this.deps.authStorage.credentials.set(provider, stored);
        await this.deps.authStorage.credentials.reload();
        signal.throwIfAborted();
        this.#assertCurrent();
        if (this.deps.authStorage.credentials.get(provider)?.type !== 'oauth') throw new Error('OAuth persistence failed');
      } catch {
        throw new NativeMcpError(signal.aborted ? 'MCP_OAUTH_CANCELLED' : 'MCP_OAUTH_FAILED',
          signal.aborted ? 'MCP OAuth was cancelled.' : 'MCP OAuth authentication failed.', !signal.aborted);
      } finally {
        this.#oauth.delete(serverId);
      }
    })();
    this.#oauth.set(serverId, { abort, done });
    await done;
  }

  async oauthCancel(serverId: string): Promise<void> {
    const pending = this.#oauth.get(EntityIdSchema.parse(serverId));
    if (!pending) throw new NativeMcpError('MCP_OAUTH_NOT_FOUND', 'No MCP OAuth flow is pending.', false);
    pending.abort.abort();
    await pending.done.catch(error => {
      if (!(error instanceof NativeMcpError) || error.code !== 'MCP_OAUTH_CANCELLED') throw error;
    });
  }

  async oauthStatus(serverId: string, captured: MCPConfigurationState): Promise<boolean> {
    const server = this.#remoteServer(serverId, this.#capture(captured));
    const provider = server.transport.credentialRef
      ? await this.deps.resolveCredentialRef(server.transport.credentialRef) : mcpOAuthCredentialId(server.transport.url);
    await this.deps.authStorage.credentials.reload();
    this.#assertCurrent();
    return this.deps.authStorage.credentials.get(provider)?.type === 'oauth';
  }

  oauthDisconnect(serverId: string, captured: MCPConfigurationState): Promise<void> {
    return this.#serialize(async () => {
      const server = this.#remoteServer(serverId, this.#capture(captured));
      if (this.#oauth.has(serverId)) await this.oauthCancel(serverId);
      const provider = server.transport.credentialRef
        ? await this.deps.resolveCredentialRef(server.transport.credentialRef) : mcpOAuthCredentialId(server.transport.url);
      this.#assertCurrent();
      await this.deps.authStorage.credentials.remove(provider);
      await this.deps.authStorage.credentials.reload();
      this.#assertCurrent();
      // Reapply/reconnect stays explicit; the revoked bearer must not continue
      // in an old transport. Disconnecting an un-applied server is unnecessary.
      if (this.#active.has(serverId)) await this.disconnectServer(serverId);
    });
  }

  async #nativeConfig(server: MCPServerConfig): Promise<SDKMCPServerConfig> {
    await this.deps.authorizeServer(server);
    await this.deps.authStorage.credentials.reload();
    if (server.transport.type === 'stdio') {
      const env: Record<string, string> = {};
      for (const [name, reference] of Object.entries(server.transport.envCredentialRefs ?? {})) {
        const provider = await this.deps.resolveCredentialRef(reference);
        const credential = this.deps.authStorage.credentials.get(provider);
        if (!credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
        if (credential.type === 'oauth') {
          const refreshed = await refreshStoredManagedMcpOAuthCredential(this.deps.authStorage, provider);
          if (!refreshed.credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
          env[name] = refreshed.credential.access;
        } else env[name] = credential.key;
      }
      return { type: 'stdio', command: await this.deps.resolveCommand(server.transport), args: server.transport.args,
        cwd: this.deps.cwd, env, envPolicy: 'literal', enabled: true };
    }
    const remote: SDKMCPServerConfig = { type: server.transport.type, url: server.transport.url, enabled: true };
    if (!server.transport.credentialRef) return remote;
    const provider = await this.deps.resolveCredentialRef(server.transport.credentialRef);
    const credential = this.deps.authStorage.credentials.get(provider);
    if (!credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
    return credential.type === 'oauth'
      ? { ...remote, auth: { type: 'oauth', credentialId: provider } }
      : { ...remote, headers: { Authorization: `Bearer ${credential.key}` }, headerPolicy: 'origin-locked' };
  }

  async #stage(server: MCPServerConfig): Promise<MCPManager> {
    const config = await this.#nativeConfig(server);
    this.#assertCurrent();
    const manager = new MCPManager(this.deps.cwd, null, async () => ({
      configs: { [server.serverId]: config }, sources: {}, exaApiKeys: [],
    }));
    manager.setAuthStorage(this.deps.authStorage);
    manager.setAuthHandler(this.#authHandler);
    manager.setNotificationsEnabled(this.#notificationsEnabled);
    this.#owned.add(manager);
    try {
      const result = await manager.connectServers({ [server.serverId]: config }, {}, undefined, 0);
      const status = await manager.waitForStartup(30_000);
      this.#assertCurrent();
      if (result.errors.size || status.pending.length || status.failed.length
        || !status.connected.includes(server.serverId) || !manager.getConnection(server.serverId)?.tools) {
        throw new Error('MCP handshake or tools failed');
      }
      this.#wire(server.serverId, manager);
      return manager;
    } catch {
      await this.#release([manager]);
      throw new NativeMcpError('MCP_APPLY_FAILED', 'An MCP server could not establish a usable tool catalog.', true);
    }
  }

  #wire(name: string, manager: MCPManager): void {
    const current = () => !this.#closed && this.deps.isCurrent() && this.#active.get(name) === manager;
    manager.setOnToolsChanged(async () => {
      if (!current()) return;
      await this.#serialize(async () => {
        if (!current() || !this.#configuration || manager.getConnection(name)?.tools === undefined) return;
        try { await this.#publish(new Map(this.#active), this.#configuration, this.#catalog.appliedRevision); }
        catch { this.deps.onRuntimeFailure({ code: 'MCP_APPLY_FAILED', detail: 'MCP tool schema rebuild failed.', retryable: true }); }
      });
    });
    manager.addConnectionStatusListener(event => {
      if (!current()) return;
      if (this.#configuration) this.deps.onCatalog(this.read(this.#configuration).workerCatalog);
      for (const listener of this.#statusListeners) {
        try { listener(event); }
        catch { this.deps.onRuntimeFailure({ code: 'MCP_OBSERVER_FAILED', detail: 'An MCP connection observer failed.', retryable: false }); }
      }
    });
    manager.addCatalogChangeListener(event => {
      if (current()) for (const listener of this.#catalogListeners) listener(event);
    });
    manager.addNotificationListener((...args) => {
      if (current()) for (const listener of this.#notificationListeners) listener(...args);
    });
    manager.setOnResourcesChanged((...args) => { if (current()) this.#resourcesHandler?.(...args); });
    manager.setOnPromptsChanged((...args) => { if (current()) this.#promptsHandler?.(...args); });
  }

  async #publish(next: Map<string, MCPManager>, configuration: MCPConfigurationState, appliedRevision: string | null): Promise<void> {
    this.#assertCurrent();
    const session = this.#session;
    if (!session || session.isDisposed) throw new NativeMcpError('MCP_APPLY_FAILED', 'The MCP session is not available.', true);
    const nativeTools = [...next.values()].flatMap(manager => manager.getTools()).sort((a, b) => a.name.localeCompare(b.name));
    const tools = nativeTools.map(tool => MCPToolSchema.parse(this.deps.sanitizeTool(MCPToolSchema.parse({
      serverId: tool.mcpServerName, toolId: tool.name, name: tool.name,
      description: tool.description ?? '', inputSchema: JsonObjectSchema.parse(tool.parameters),
    }))));
    if ([...next].some(([name, manager]) => manager.getConnectionStatus(name) !== 'connected')) throw new Error('MCP connection lost');
    const catalog = MCPCatalogStateSchema.parse({
      worker: this.deps.worker, runtimeStatus: 'ready', appliedRevision,
      catalogRevision: CounterSchema.parse((BigInt(this.#catalog.catalogRevision) + 1n).toString()),
      activeServers: [...next.keys()].sort(), tools,
    });
    const previous = this.#active;
    this.#active = next;
    try {
      await session.refreshMCPTools(nativeTools);
      await session.refreshBaseSystemPrompt();
      await this.#toolsHandler?.(nativeTools);
      this.#assertCurrent();
      if (session.isDisposed || [...next].some(([name, manager]) => manager.getConnectionStatus(name) !== 'connected')) throw new Error('MCP runtime retired');
    } catch (error) {
      this.#active = previous;
      try {
        await session.refreshMCPTools(this.getTools());
        await session.refreshBaseSystemPrompt();
        await this.#toolsHandler?.(this.getTools());
      } catch {
        this.#catalog = { ...this.#catalog, runtimeStatus: 'unavailable' };
        this.deps.onRuntimeFailure({ code: 'MCP_APPLY_FAILED', detail: 'MCP tool registry rollback failed.', retryable: false });
      }
      throw error;
    }
    this.#catalog = catalog;
    this.#configuration = configuration;
    this.deps.onCatalog(catalog);
    for (const listener of this.#toolListeners) {
      try { listener(); }
      catch { this.deps.onRuntimeFailure({ code: 'MCP_OBSERVER_FAILED', detail: 'An MCP catalog observer failed.', retryable: false }); }
    }
    try {
      await this.#release([...previous.values()].filter(manager => ![...next.values()].includes(manager)));
    } catch {
      // The new runtime is already committed. Keep ownership of the old
      // transport for close(), and report cleanup separately from apply.
      this.deps.onRuntimeFailure({ code: 'MCP_CLEANUP_FAILED', detail: 'A replaced MCP transport could not be closed.', retryable: true });
    }
  }

  #revisions(configuration: MCPConfigurationState): MCPAppliedRevisions {
    const { runtimeStatus, appliedRevision, catalogRevision } = this.read(configuration).workerCatalog;
    return MCPAppliedRevisionsSchema.parse({ runtimeStatus, appliedRevision, catalogRevision });
  }
  #failed(configuration: MCPConfigurationState, code: string, detail: string): MCPWorkerApplyOutcome {
    return MCPWorkerApplyOutcomeSchema.parse({ worker: this.deps.worker, outcome: 'failed',
      revisions: this.#revisions(configuration), error: { code, detail, retryable: true } });
  }
  #capture(raw: MCPConfigurationState): MCPConfigurationState {
    this.#assertCurrent();
    const configuration = MCPConfigurationStateSchema.parse(raw);
    if (configuration.workspaceId !== this.deps.worker.workspaceId) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP workspace does not match this worker.', false);
    if (this.#catalog.appliedRevision !== null && BigInt(configuration.persistedRevision) < BigInt(this.#catalog.appliedRevision)) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration capture is stale.', false);
    return configuration;
  }
  #assertCurrent(): void {
    if (this.#closed || !this.deps.isCurrent()) throw new NativeMcpError('WORKER_GENERATION_CONFLICT', 'The MCP worker generation is retired.', false);
  }
  #serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(() => { this.#assertCurrent(); return operation(); });
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }
  async #release(managers: Iterable<MCPManager>): Promise<void> {
    const results = await Promise.allSettled([...managers].map(async manager => {
      await manager.disconnectAll();
      this.#owned.delete(manager);
    }));
    if (results.some(result => result.status === 'rejected')) throw new NativeMcpError('MCP_APPLY_FAILED', 'MCP transport cleanup failed.', true);
  }
  #remoteServer(serverId: string, configuration: MCPConfigurationState): MCPServerConfig & { transport: Exclude<MCPServerConfig['transport'], { type: 'stdio' }> } {
    EntityIdSchema.parse(serverId);
    const server = configuration.config.servers.find(item => item.serverId === serverId);
    if (!server || server.transport.type === 'stdio') throw new NativeMcpError('MCP_OAUTH_FAILED', 'OAuth requires a configured HTTP or SSE server.', false);
    return { ...server, transport: server.transport };
  }

  override getTools(): NativeTools { return [...this.#active.values()].flatMap(manager => manager.getTools()).sort((a, b) => a.name.localeCompare(b.name)); }
  override getConnectedServers(): string[] { return [...this.#active].filter(([name, manager]) => manager.getConnectionStatus(name) === 'connected').map(([name]) => name); }
  override getAllServerNames(): string[] { return [...this.#active.keys()]; }
  override getConnection(name: string) { return this.#active.get(name)?.getConnection(name); }
  override getConnectionStatus(name: string) { return this.#active.get(name)?.getConnectionStatus(name) ?? 'disconnected'; }
  override getServerConfig(name: string) { return this.#active.get(name)?.getServerConfig(name); }
  override getSource(name: string) { return this.#active.get(name)?.getSource(name); }
  override getServerResources(name: string) { return this.#active.get(name)?.getServerResources(name); }
  override getServerPrompts(name: string) { return this.#active.get(name)?.getServerPrompts(name); }
  override getServerInstructions(): Map<string, string> { return new Map([...this.#active.values()].flatMap(manager => [...manager.getServerInstructions()])); }
  override async waitForConnection(name: string) { const manager = this.#active.get(name); if (!manager) throw new NativeMcpError('MCP_RECONNECT_FAILED', 'MCP server is not active.', true); return manager.waitForConnection(name); }
  override async ensureServerResources(name: string): Promise<void> { const manager = this.#active.get(name); if (!manager) throw new NativeMcpError('MCP_APPLY_FAILED', 'MCP server is not active.', true); await manager.ensureServerResources(name); }
  override async readServerResource(...args: Parameters<MCPManager['readServerResource']>) { return this.#active.get(args[0])?.readServerResource(...args); }
  override async executePrompt(...args: Parameters<MCPManager['executePrompt']>) { return this.#active.get(args[0])?.executePrompt(...args); }
  override async refreshServerTools(name: string): Promise<void> { const manager = this.#active.get(name); if (!manager) throw new NativeMcpError('MCP_APPLY_FAILED', 'MCP server is not active.', true); await manager.refreshServerTools(name); }
  override async refreshAllTools(): Promise<void> { await Promise.all([...this.#active.values()].map(manager => manager.refreshAllTools())); }
  override async refreshServerResources(name: string): Promise<void> {
    const manager = this.#active.get(name);
    if (!manager) throw new NativeMcpError('MCP_APPLY_FAILED', 'MCP server is not active.', true);
    await manager.refreshServerResources(name);
  }
  override async refreshServerPrompts(name: string): Promise<void> {
    const manager = this.#active.get(name);
    if (!manager) throw new NativeMcpError('MCP_APPLY_FAILED', 'MCP server is not active.', true);
    await manager.refreshServerPrompts(name);
  }
  override async reconcileBrowserFilter(enabled: boolean): Promise<void> {
    await Promise.all([...this.#active.values()].map(manager => manager.reconcileBrowserFilter(enabled)));
    if (this.#session && !this.#session.isDisposed) {
      await this.#session.refreshMCPTools(this.getTools());
      await this.#session.refreshBaseSystemPrompt();
    }
    if (this.#configuration) this.deps.onCatalog(this.read(this.#configuration).workerCatalog);
  }
  override async reconcileProjectConfig(enabled: boolean): Promise<void> {
    await Promise.all([...this.#active.values()].map(manager => manager.reconcileProjectConfig(enabled)));
    if (this.#session && !this.#session.isDisposed) {
      await this.#session.refreshMCPTools(this.getTools());
      await this.#session.refreshBaseSystemPrompt();
    }
    if (this.#configuration) this.deps.onCatalog(this.read(this.#configuration).workerCatalog);
  }
  override async waitForPendingConnections(): Promise<void> { await Promise.all([...this.#active.values()].map(manager => manager.waitForPendingConnections())); }
  override async waitForStartup(timeoutMs: number) { const states = await Promise.all([...this.#active.values()].map(manager => manager.waitForStartup(timeoutMs))); return { connected: states.flatMap(state => state.connected), pending: states.flatMap(state => state.pending), failed: states.flatMap(state => state.failed) }; }
  override setAuthStorage(storage: SDKAuthStorage): void { if (storage !== this.deps.authStorage) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP must use the session credential owner.', false); }
  override setAuthHandler(handler: MCPAuthHandler | undefined): void { this.#authHandler = handler; for (const manager of this.#active.values()) manager.setAuthHandler(handler); }
  override setNotificationsEnabled(enabled: boolean): void { this.#notificationsEnabled = enabled; for (const manager of this.#active.values()) manager.setNotificationsEnabled(enabled); }
  override getNotificationState() { return { enabled: this.#notificationsEnabled, subscriptions: new Map([...this.#active.values()].flatMap(manager => [...manager.getNotificationState().subscriptions])) }; }
  override addToolsChangedListener(listener: Parameters<MCPManager['addToolsChangedListener']>[0]): () => void { this.#toolListeners.add(listener); return () => { this.#toolListeners.delete(listener); }; }
  override addNotificationListener(listener: Parameters<MCPManager['addNotificationListener']>[0]): () => void { this.#notificationListeners.add(listener); return () => { this.#notificationListeners.delete(listener); }; }
  override addConnectionStatusListener(listener: Parameters<MCPManager['addConnectionStatusListener']>[0]): () => void { this.#statusListeners.add(listener); return () => { this.#statusListeners.delete(listener); }; }
  override addCatalogChangeListener(listener: Parameters<MCPManager['addCatalogChangeListener']>[0]): () => void { this.#catalogListeners.add(listener); return () => { this.#catalogListeners.delete(listener); }; }
  override setOnToolsChanged(handler: Parameters<MCPManager['setOnToolsChanged']>[0]): void { this.#toolsHandler = handler; }
  override setOnResourcesChanged(handler: Parameters<MCPManager['setOnResourcesChanged']>[0]): void { this.#resourcesHandler = handler; }
  override setOnPromptsChanged(handler: Parameters<MCPManager['setOnPromptsChanged']>[0]): void { this.#promptsHandler = handler; for (const name of this.getConnectedServers()) if (this.getServerPrompts(name)?.length) handler(name); }
  override async disconnectServer(name: string): Promise<void> {
    const manager = this.#active.get(name);
    if (!manager) throw new NativeMcpError('MCP_RECONNECT_FAILED', 'MCP server is not active.', false);
    await manager.disconnectServer(name);
    this.#catalog = { ...this.#catalog, runtimeStatus: 'unavailable' };
    if (this.#session && !this.#session.isDisposed) await this.#session.refreshMCPTools(this.getTools());
    this.deps.onCatalog(this.#catalog);
  }
  override async reconnectServer(name: string, options?: Parameters<MCPManager['reconnectServer']>[1]) {
    const manager = this.#active.get(name);
    if (!manager) throw new NativeMcpError('MCP_RECONNECT_FAILED', 'MCP server is not active.', true);
    return manager.reconnectServer(name, options);
  }
  override async disconnectAll(): Promise<void> { await this.close(); }
  async close(): Promise<void> {
    this.#closed = true;
    const pending = [...this.#oauth.values()];
    for (const flow of pending) flow.abort.abort();
    await Promise.allSettled(pending.map(flow => flow.done));
    await this.#release(this.#owned);
    await this.#tail;
    this.#active.clear();
    this.#session = undefined;
  }
}
