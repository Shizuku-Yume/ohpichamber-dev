import { createHash, randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { z } from 'zod';
import {
  CatalogWorkerIdentitySchema, CounterSchema, EntityIdSchema, JsonObjectSchema,
  MCPApplyRequestSchema, MCPAppliedRevisionsSchema, MCPCatalogReadSchema,
  MCPCatalogStateSchema, MCPConfigurationStateSchema, MCPConfigureRequestSchema,
  MCPOAuthConfigInputSchema, MCPOAuthPendingFlowSchema, MCPOAuthPublicConfigurationSchema,
  MCPOAuthRequestSchema, MCPOAuthResultSchema, MCPReconnectRequestSchema,
  MCPToolSchema, MCPWorkerApplyOutcomeSchema,
  type CatalogOperationError, type CatalogWorkerIdentity, type MCPApplyRequest,
  type MCPAppliedRevisions, type MCPCatalogRead, type MCPCatalogState,
  type MCPConfigurationState, type MCPConfigureRequest, type MCPOAuthConfigInput,
  type MCPOAuthPendingFlow, type MCPOAuthPublicConfiguration, type MCPOAuthRequest,
  type MCPOAuthResult, type MCPReconnectRequest, type MCPServerConfig,
  type MCPTool, type MCPWorkerApplyOutcome,
} from '@openchamber/agent-contract';
import type { MCPConnectionTestResult } from '@openchamber/agent-contract';
import { parseCallbackInput } from '@oh-my-pi/pi-ai/oauth/callback-server';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent';
import { readMCPConfigFile, writeMCPConfigFile } from '@oh-my-pi/pi-coding-agent/mcp/config-writer';
import { MCPManager, type MCPAuthHandler, type MCPLoadResult } from '@oh-my-pi/pi-coding-agent/mcp/manager';
import { discoverOAuthEndpoints, type OAuthEndpoints } from '@oh-my-pi/pi-coding-agent/mcp/oauth-discovery';
import {
  MCPOAuthFlow,
  type MCPOAuthConfig, type MCPStoredOAuthCredential,
} from '@oh-my-pi/pi-coding-agent/mcp/oauth-flow';
import { refreshStoredManagedMcpOAuthCredential } from '@oh-my-pi/pi-coding-agent/mcp/oauth-credentials';
import type { MCPConfigFile, MCPHttpServerConfig, MCPSseServerConfig, MCPServerConfig as SDKMCPServerConfig } from '@oh-my-pi/pi-coding-agent/mcp/types';
import type { AuthStorage as SDKAuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ProjectionError } from '../projection/journal.ts';

export * from './mcp/protocol.ts';

type OAuthController = ConstructorParameters<typeof MCPOAuthFlow>[1];
type NativeTools = MCPLoadResult['tools'];
type ManagedFile = MCPConfigFile & { openchamber: MCPConfigurationState };
type RemoteServerConfig = MCPServerConfig & { transport: Exclude<MCPServerConfig['transport'], { type: 'stdio' }> };

interface OAuthFlowEntry {
  readonly flowId: string;
  readonly serverId: string;
  readonly persistedRevision: string;
  readonly workerGeneration: string;
  readonly server: RemoteServerConfig;
  readonly abort: AbortController;
  requiresCallbackInput: boolean;
  settled: boolean;
  pendingFlow: MCPOAuthPendingFlow | undefined;
  error: NativeMcpError | undefined;
  cancelReason: NativeMcpError | undefined;
  submitInput: ((input: string) => void) | undefined;
  done: Promise<void>;
}
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

/** First-use storage may be absent; malformed or unreadable configured files still fail closed. */
export async function readNativeMcpConfigurationIfPresent(configPath: string, workspaceId: string): Promise<MCPConfigurationState | null> {
  try { await lstat(configPath); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration could not be read.', true);
  }
  return readNativeMcpConfiguration(configPath, workspaceId);
}

async function readNativeMcpConfiguration(configPath: string, workspaceId: string): Promise<MCPConfigurationState> {
  try {
    const file = ManagedFileSchema.parse(await readMCPConfigFile(configPath));
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
  readonly authorizeOAuth: (server: MCPServerConfig, config: MCPOAuthPublicConfiguration) => Promise<void>;
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
  #oauth = new Map<string, OAuthFlowEntry>();
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

  /** A real isolated handshake; never publishes session tools or replaces a live connection. */
  test(serverId: string, captured: MCPConfigurationState): Promise<MCPConnectionTestResult> {
    return this.#serialize(async () => {
      const configuration = this.#capture(captured);
      const owner = { workspaceId: configuration.workspaceId, serverId: EntityIdSchema.parse(serverId), persistedRevision: configuration.persistedRevision };
      const server = configuration.config.servers.find(candidate => candidate.serverId === serverId);
      if (!server) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP server is not configured.', false);
      // Authorization failures must remain refusals, not connection failures.
      await this.deps.authorizeServer(server);
      let manager: MCPManager | undefined;
      try {
        manager = await this.#stage(server);
        return { ...owner, status: 'connected', toolCount: manager.getTools().length };
      } catch (error) {
        if (error instanceof ProjectionError) throw error;
        return { ...owner, status: 'failed', error: error instanceof NativeMcpError ? error.operationError
          : { code: 'MCP_RECONNECT_FAILED', detail: 'MCP connection test failed.', retryable: true } };
      } finally { if (manager) await this.#release([manager]); }
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
      const persisted = await writeNativeMcpConfiguration(this.deps.configPath, configuration);
      await this.#retireIncompatibleOAuth(persisted);
      return persisted;
    });
  }

  apply(raw: MCPApplyRequest, captured: MCPConfigurationState): Promise<MCPWorkerApplyOutcome> {
    return this.#serialize(async () => {
      const request = MCPApplyRequestSchema.parse(raw);
      const configuration = this.#capture(captured);
      if (request.persistedRevision !== configuration.persistedRevision) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      }
      await this.#retireIncompatibleOAuth(configuration);
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

  async oauthRead(serverId: string, captured: MCPConfigurationState): Promise<MCPOAuthResult> {
    const configuration = this.#capture(captured);
    await this.#retireIncompatibleOAuth(configuration);
    const server = this.#remoteServer(serverId, configuration);
    await this.#assertPersistedServer(configuration, server);
    const authenticated = await this.#isAuthenticated(server);
    await this.#assertPersistedServer(configuration, server);
    const entry = this.#oauth.get(serverId);
    if (entry && !entry.settled && entry.pendingFlow) {
      return MCPOAuthResultSchema.parse({
        serverId,
        worker: this.deps.worker,
        persistedRevision: configuration.persistedRevision,
        status: 'pending',
        authenticated,
        pendingFlow: entry.pendingFlow,
      });
    }
    return MCPOAuthResultSchema.parse(
      authenticated
        ? {
            serverId,
            worker: this.deps.worker,
            persistedRevision: configuration.persistedRevision,
            status: 'authenticated',
            authenticated: true,
          }
        : {
            serverId,
            worker: this.deps.worker,
            persistedRevision: configuration.persistedRevision,
            status: 'unauthenticated',
            authenticated: false,
          },
    );
  }

  async oauthExecute(serverId: string, raw: MCPOAuthRequest, captured: MCPConfigurationState): Promise<MCPOAuthResult> {
    EntityIdSchema.parse(serverId);
    const request = MCPOAuthRequestSchema.parse(raw);
    if (request.workerGeneration !== this.deps.worker.workerGeneration) {
      throw new NativeMcpError('WORKER_GENERATION_CONFLICT', 'The MCP worker generation changed.', false);
    }
    const configuration = this.#capture(captured);
    await this.#retireIncompatibleOAuth(configuration);
    if (request.persistedRevision !== configuration.persistedRevision) {
      throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
    }
    const server = this.#remoteServer(serverId, configuration);
    switch (request.action) {
      case 'start':
        return this.#oauthStart(serverId, request.oauth, configuration, server);
      case 'complete':
        return this.#oauthComplete(serverId, request.flowId, request.callbackInput, configuration, server);
      case 'cancel':
        return this.#oauthCancel(serverId, request.flowId, configuration, server);
      case 'disconnect':
        return this.#oauthDisconnect(serverId, configuration, server);
    }
  }

  async #oauthStart(
    serverId: string,
    rawOAuth: MCPOAuthConfigInput | undefined,
    configuration: MCPConfigurationState,
    server: RemoteServerConfig,
  ): Promise<MCPOAuthResult> {
    const existing = this.#oauth.get(serverId);
    if (existing && !existing.settled) {
      throw new NativeMcpError('CATALOG_CONFLICT', 'MCP OAuth is already pending.', false);
    }
    const flowId = randomUUID();
    const abort = new AbortController();
    const authReady = Promise.withResolvers<MCPOAuthPendingFlow>();
    const entry: OAuthFlowEntry = {
      flowId,
      serverId,
      persistedRevision: configuration.persistedRevision,
      workerGeneration: this.deps.worker.workerGeneration,
      server,
      abort,
      requiresCallbackInput: false,
      settled: false,
      pendingFlow: undefined,
      error: undefined,
      cancelReason: undefined,
      submitInput: undefined,
      done: Promise.resolve(),
    };
    this.#oauth.set(serverId, entry);
    entry.done = this.#runOAuthFlow(entry, rawOAuth, authReady);
    try {
      const pendingFlow = await authReady.promise;
      await this.#assertPersistedFlow(entry);
      const authenticated = await this.#isAuthenticated(server);
      await this.#assertPersistedFlow(entry);
      return MCPOAuthResultSchema.parse({
        serverId,
        worker: this.deps.worker,
        persistedRevision: configuration.persistedRevision,
        status: 'pending',
        authenticated,
        pendingFlow,
      });
    } catch (error) {
      const wasAborted = entry.abort.signal.aborted;
      const capturedError = error instanceof NativeMcpError ? error : entry.error;
      entry.abort.abort();
      await entry.done;
      if (this.#oauth.get(serverId) === entry) this.#oauth.delete(serverId);
      throw this.#toOAuthError(capturedError, wasAborted, entry.cancelReason);
    }
  }

  async #runOAuthFlow(
    entry: OAuthFlowEntry,
    rawOAuth: MCPOAuthConfigInput | undefined,
    authReady: PromiseWithResolvers<MCPOAuthPendingFlow>,
  ): Promise<void> {
    try {
      const oauthInput = rawOAuth ? MCPOAuthConfigInputSchema.parse(rawOAuth) : undefined;
      const preDiscoveryPublic = this.#publicOAuthConfig(oauthInput);
      await this.#assertPersistedFlow(entry);
      await this.deps.authorizeServer(entry.server);
      this.#assertFlowCurrent(entry);
      await this.deps.authorizeOAuth(entry.server, preDiscoveryPublic);
      await this.#assertPersistedFlow(entry);
      let discovered: OAuthEndpoints | null = null;
      if (oauthInput?.authorizationUrl === undefined || oauthInput.tokenUrl === undefined) {
        discovered = await discoverOAuthEndpoints(
          entry.server.transport.url,
          oauthInput?.issuerUrl,
          oauthInput?.resourceMetadataUrl,
          { signal: entry.abort.signal },
        );
        this.#assertFlowCurrent(entry);
        if (!discovered) {
          throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth endpoints could not be discovered.', true);
        }
      }
      let clientSecret: string | undefined;
      if (oauthInput?.clientSecretRef) {
        const provider = await this.deps.resolveCredentialRef(oauthInput.clientSecretRef);
        const credential = this.deps.authStorage.credentials.get(provider);
        if (credential?.type !== 'api_key') throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'MCP OAuth client secret is unavailable.', false);
        clientSecret = credential.key;
      }
      const { publicConfig: finalPublicConfig, flowConfig, requiresCallbackInput } = this.#resolveOAuthConfigs(entry.server, oauthInput, discovered, clientSecret);
      entry.requiresCallbackInput = requiresCallbackInput;
      await this.deps.authorizeOAuth(entry.server, finalPublicConfig);
      await this.#assertPersistedFlow(entry);
      const manualInput = this.#createManualInputController(entry.abort.signal);
      entry.submitInput = manualInput.submit;
      const controller: OAuthController = {
        signal: entry.abort.signal,
        onAuth: info => {
          const pendingCandidate: MCPOAuthPendingFlow = {
            flowId: entry.flowId,
            authorizationUrl: info.url,
          };
          if (info.launchUrl !== undefined) pendingCandidate.launchUrl = info.launchUrl;
          if (info.instructions !== undefined) pendingCandidate.instructions = info.instructions;
          const pendingFlow = MCPOAuthPendingFlowSchema.parse(pendingCandidate);
          entry.pendingFlow = pendingFlow;
          authReady.resolve(pendingFlow);
        },
        onManualCodeInput: waitSignal => manualInput.waitForInput(waitSignal),
      };
      const flow = new MCPOAuthFlow(flowConfig, controller);
      const credentials = await flow.login();
      await this.#assertPersistedFlow(entry);
      const stored: MCPStoredOAuthCredential = {
        ...credentials,
        type: 'oauth',
        authorizedAt: Date.now(),
        tokenUrl: flowConfig.tokenUrl,
        clientId: flow.resolvedClientId,
        clientSecret: flowConfig.clientSecret ?? flow.registeredClientSecret,
        resource: flow.resource,
        authorizationUrl: flow.authorizationUrl,
      };
      const provider = await this.#credentialProvider(entry.server);
      await this.#assertPersistedFlow(entry);
      // Native credential replacement commits synchronously; reject retirement in this same turn.
      this.#assertFlowCurrent(entry);
      await this.deps.authStorage.credentials.set(provider, stored);
      await this.deps.authStorage.credentials.reload();
      await this.#assertPersistedFlow(entry);
      if (this.deps.authStorage.credentials.get(provider)?.type !== 'oauth') {
        throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth credential persistence failed.', true);
      }
    } catch (error) {
      const nativeError = this.#toOAuthError(error instanceof NativeMcpError ? error : undefined, entry.abort.signal.aborted, entry.cancelReason);
      entry.error = nativeError;
      if (!entry.pendingFlow) {
        if (this.#oauth.get(entry.serverId) === entry) this.#oauth.delete(entry.serverId);
        authReady.reject(nativeError);
      }
    } finally {
      entry.settled = true;
      entry.submitInput = undefined;
      if (!entry.pendingFlow && !entry.error) {
        const missingUrlError = new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth did not produce an authorization URL.', true);
        entry.error = missingUrlError;
        if (this.#oauth.get(entry.serverId) === entry) this.#oauth.delete(entry.serverId);
        authReady.reject(missingUrlError);
      }
    }
  }

  async #oauthComplete(
    serverId: string,
    flowId: string,
    callbackInput: string | undefined,
    configuration: MCPConfigurationState,
    server: RemoteServerConfig,
  ): Promise<MCPOAuthResult> {
    const entry = this.#oauth.get(serverId);
    if (!entry || entry.flowId !== flowId || !entry.pendingFlow) {
      throw new NativeMcpError('MCP_OAUTH_NOT_FOUND', 'No matching MCP OAuth flow is pending.', false);
    }
    await this.#assertPersistedFlow(entry);
    if (callbackInput !== undefined) {
      const parsed = parseCallbackInput(callbackInput);
      const expectedState = new URL(entry.pendingFlow.authorizationUrl).searchParams.get('state');
      if (!parsed.code || (expectedState && parsed.state && parsed.state !== expectedState)) {
        await this.#abortEntry(entry);
        throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth callback input is invalid.', false);
      }
      if (!entry.settled && entry.submitInput) {
        entry.submitInput(callbackInput);
      }
    } else if (!entry.settled && entry.requiresCallbackInput) {
      await this.#abortEntry(entry);
      throw new NativeMcpError('MCP_OAUTH_FAILED', 'A non-local OAuth redirect requires callbackInput to complete.', false);
    }
    await entry.done;
    if (this.#oauth.get(serverId) === entry) this.#oauth.delete(serverId);
    if (entry.error) throw entry.error;
    await this.#assertPersistedServer(configuration, server);
    const authenticated = await this.#isAuthenticated(server);
    await this.#assertPersistedServer(configuration, server);
    if (!authenticated) {
      throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth credential is not available.', true);
    }
    return MCPOAuthResultSchema.parse({
      serverId,
      worker: this.deps.worker,
      persistedRevision: configuration.persistedRevision,
      status: 'authenticated',
      authenticated: true,
    });
  }

  async #oauthCancel(
    serverId: string,
    flowId: string,
    configuration: MCPConfigurationState,
    server: RemoteServerConfig,
  ): Promise<MCPOAuthResult> {
    const entry = this.#oauth.get(serverId);
    if (!entry || entry.flowId !== flowId || entry.settled) {
      throw new NativeMcpError('MCP_OAUTH_NOT_FOUND', 'No matching MCP OAuth flow is pending.', false);
    }
    await this.#abortEntry(entry);
    await this.#assertPersistedServer(configuration, server);
    return this.oauthRead(serverId, configuration);
  }

  async #oauthDisconnect(
    serverId: string,
    configuration: MCPConfigurationState,
    server: RemoteServerConfig,
  ): Promise<MCPOAuthResult> {
    const pending = this.#oauth.get(serverId);
    if (pending) await this.#abortEntry(pending);
    return this.#serialize(async () => {
      const activeFlow = this.#oauth.get(serverId);
      if (activeFlow) await this.#abortEntry(activeFlow);
      await this.#assertPersistedServer(configuration, server);
      const provider = await this.#credentialProvider(server);
      await this.#assertPersistedServer(configuration, server);
      await this.deps.authStorage.credentials.remove(provider);
      await this.deps.authStorage.credentials.reload();
      await this.#assertPersistedServer(configuration, server);
      if (this.deps.authStorage.credentials.get(provider)?.type === 'oauth') {
        throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth credential could not be removed.', true);
      }
      // Reapply/reconnect stays explicit; the revoked bearer must not continue
      // in an old transport. Disconnecting an un-applied server is unnecessary.
      if (this.#active.has(serverId)) await this.disconnectServer(serverId);
      return this.oauthRead(serverId, configuration);
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
    let remote: MCPHttpServerConfig | MCPSseServerConfig = { type: server.transport.type, url: server.transport.url, enabled: true };
    if (server.transport.credentialRef) {
      const provider = await this.deps.resolveCredentialRef(server.transport.credentialRef);
      const credential = this.deps.authStorage.credentials.get(provider);
      if (!credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
      remote = credential.type === 'oauth'
        ? { ...remote, auth: { type: 'oauth', credentialId: provider } }
        : { ...remote, headers: { Authorization: `Bearer ${credential.key}` }, headerPolicy: 'origin-locked' };
    }
    const headerCredentialRefs = server.transport.headerCredentialRefs ?? {};
    const headers = { ...remote.headers };
    for (const [name, reference] of Object.entries(headerCredentialRefs)) {
      const provider = await this.deps.resolveCredentialRef(reference);
      const credential = this.deps.authStorage.credentials.get(provider);
      if (!credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
      if (credential.type === 'oauth') {
        const refreshed = await refreshStoredManagedMcpOAuthCredential(this.deps.authStorage, provider);
        if (!refreshed.credential) throw new NativeMcpError('MCP_CREDENTIAL_UNAVAILABLE', 'An MCP credential is not available.', false);
        headers[name] = refreshed.credential.access;
      } else headers[name] = credential.key;
    }
    if (!server.transport.credentialRef) {
      const provider = await this.#credentialProvider({ ...server, transport: server.transport });
      if (this.deps.authStorage.credentials.get(provider)?.type === 'oauth') remote = { ...remote, auth: { type: 'oauth', credentialId: provider } };
    }
    if (Object.keys(headers).length > 0) return { ...remote, headers, headerPolicy: 'origin-locked' };
    return remote;
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
    this.#markIncompatibleOAuth(configuration);
    return configuration;
  }
  #assertCurrent(): void {
    if (this.#closed || !this.deps.isCurrent()) throw new NativeMcpError('WORKER_GENERATION_CONFLICT', 'The MCP worker generation is retired.', false);
  }
  #assertFlowCurrent(entry: OAuthFlowEntry): void {
    this.#assertCurrent();
    if (this.#oauth.get(entry.serverId) !== entry) {
      throw entry.cancelReason ?? new NativeMcpError('MCP_OAUTH_CANCELLED', 'MCP OAuth was cancelled.', false);
    }
    if (entry.abort.signal.aborted) {
      throw entry.cancelReason ?? new NativeMcpError('MCP_OAUTH_CANCELLED', 'MCP OAuth was cancelled.', false);
    }
  }
  async #assertPersistedServer(configuration: MCPConfigurationState, server: RemoteServerConfig): Promise<void> {
    this.#assertCurrent();
    const persisted = await readNativeMcpConfiguration(this.deps.configPath, this.deps.worker.workspaceId);
    this.#assertCurrent();
    if (persisted.persistedRevision !== configuration.persistedRevision) {
      await this.#retireIncompatibleOAuth(persisted);
      throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
    }
    const persistedServer = this.#remoteServer(server.serverId, persisted);
    if (JSON.stringify(persistedServer) !== JSON.stringify(server)) {
      await this.#retireIncompatibleOAuth(persisted);
      throw new NativeMcpError('CATALOG_CONFLICT', 'MCP server configuration changed.', false);
    }
  }
  async #assertPersistedFlow(entry: OAuthFlowEntry): Promise<void> {
    this.#assertFlowCurrent(entry);
    const persisted = await readNativeMcpConfiguration(this.deps.configPath, this.deps.worker.workspaceId);
    this.#assertFlowCurrent(entry);
    const persistedServer = persisted.config.servers.find(item => item.serverId === entry.serverId);
    if (persisted.persistedRevision !== entry.persistedRevision
      || !persistedServer
      || JSON.stringify(persistedServer) !== JSON.stringify(entry.server)) {
      const conflict = new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration changed during OAuth.', false);
      entry.cancelReason = conflict;
      entry.abort.abort();
      if (this.#oauth.get(entry.serverId) === entry) this.#oauth.delete(entry.serverId);
      throw conflict;
    }
  }
  #markIncompatibleOAuth(configuration: MCPConfigurationState): void {
    for (const [serverId, entry] of this.#oauth) {
      const currentServer = configuration.config.servers.find(item => item.serverId === serverId);
      if (entry.persistedRevision !== configuration.persistedRevision
        || !currentServer
        || JSON.stringify(currentServer) !== JSON.stringify(entry.server)) {
        entry.cancelReason = new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration changed during OAuth.', false);
        entry.abort.abort();
      }
    }
  }
  async #retireIncompatibleOAuth(configuration: MCPConfigurationState): Promise<void> {
    const incompatible: OAuthFlowEntry[] = [];
    for (const [serverId, entry] of this.#oauth) {
      const currentServer = configuration.config.servers.find(item => item.serverId === serverId);
      if (entry.persistedRevision !== configuration.persistedRevision
        || !currentServer
        || JSON.stringify(currentServer) !== JSON.stringify(entry.server)) {
        entry.cancelReason = new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration changed during OAuth.', false);
        incompatible.push(entry);
      }
    }
    for (const entry of incompatible) await this.#abortEntry(entry);
  }
  async #abortEntry(entry: OAuthFlowEntry): Promise<void> {
    entry.abort.abort();
    await entry.done;
    if (this.#oauth.get(entry.serverId) === entry) this.#oauth.delete(entry.serverId);
  }
  async #credentialProvider(server: RemoteServerConfig): Promise<string> {
    return server.transport.credentialRef
      ? await this.deps.resolveCredentialRef(server.transport.credentialRef)
      : `openchamber-mcp-oauth-${createHash('sha256').update(JSON.stringify([this.deps.worker.workspaceId, server.serverId, server.transport.url])).digest('hex')}`;
  }
  async #isAuthenticated(server: RemoteServerConfig): Promise<boolean> {
    const provider = await this.#credentialProvider(server);
    await this.deps.authStorage.credentials.reload();
    this.#assertCurrent();
    return this.deps.authStorage.credentials.get(provider)?.type === 'oauth';
  }
  #publicOAuthConfig(input: MCPOAuthConfigInput | undefined): MCPOAuthPublicConfiguration {
    const candidate: MCPOAuthPublicConfiguration = {};
    if (!input) return MCPOAuthPublicConfigurationSchema.parse(candidate);
    if (input.authorizationUrl !== undefined) candidate.authorizationUrl = input.authorizationUrl;
    if (input.tokenUrl !== undefined) candidate.tokenUrl = input.tokenUrl;
    if (input.issuerUrl !== undefined) candidate.issuerUrl = input.issuerUrl;
    if (input.registrationUrl !== undefined) candidate.registrationUrl = input.registrationUrl;
    if (input.resourceMetadataUrl !== undefined) candidate.resourceMetadataUrl = input.resourceMetadataUrl;
    if (input.clientId !== undefined) candidate.clientId = input.clientId;
    if (input.scopes !== undefined) candidate.scopes = input.scopes;
    if (input.prompt !== undefined) candidate.prompt = input.prompt;
    if (input.redirectUri !== undefined) candidate.redirectUri = input.redirectUri;
    if (input.callbackPort !== undefined) candidate.callbackPort = input.callbackPort;
    if (input.callbackPath !== undefined) candidate.callbackPath = input.callbackPath;
    if (input.resource !== undefined) candidate.resource = input.resource;
    if (input.stripSameOriginResource !== undefined) candidate.stripSameOriginResource = input.stripSameOriginResource;
    return MCPOAuthPublicConfigurationSchema.parse(candidate);
  }
  #resolveOAuthConfigs(
    server: RemoteServerConfig,
    input: MCPOAuthConfigInput | undefined,
    discovered: OAuthEndpoints | null,
    clientSecret: string | undefined,
  ) {
    const authorizationUrl = input?.authorizationUrl ?? discovered?.authorizationUrl;
    const tokenUrl = input?.tokenUrl ?? discovered?.tokenUrl;
    if (!authorizationUrl || !tokenUrl) {
      throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth authorization and token endpoints are required.', false);
    }
    const discoveredClientId = discovered?.clientId && discovered.clientId.trim().length > 0
      ? discovered.clientId.trim()
      : undefined;
    const issuerUrl = input?.issuerUrl ?? discovered?.issuerUrl;
    const registrationUrl = input?.registrationUrl ?? discovered?.registrationUrl;
    const resourceMetadataUrl = input?.resourceMetadataUrl;
    const clientId = input?.clientId ?? discoveredClientId;
    const scopes = input?.scopes ?? discovered?.scopes;
    const prompt = input?.prompt;
    const redirectUri = input?.redirectUri;
    const callbackPort = input?.callbackPort;
    const callbackPath = input?.callbackPath;
    const advertisedResource = input?.resource ?? discovered?.resource;
    const resource = advertisedResource ?? server.transport.url;
    const stripSameOriginResource = input?.stripSameOriginResource ?? advertisedResource === undefined;
    let publicConfig: MCPOAuthPublicConfiguration;
    try {
      publicConfig = this.#publicOAuthConfig({
        authorizationUrl,
        tokenUrl,
        issuerUrl,
        registrationUrl,
        resourceMetadataUrl,
        clientId,
        scopes,
        prompt,
        redirectUri,
        callbackPort,
        callbackPath,
        resource,
        stripSameOriginResource,
      });
    } catch {
      throw new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth configuration or discovered endpoints are invalid.', false);
    }
    const flowConfig: MCPOAuthConfig = {
      authorizationUrl,
      tokenUrl,
      resource,
      stripSameOriginResource,
    };
    if (publicConfig.issuerUrl !== undefined) flowConfig.issuerUrl = publicConfig.issuerUrl;
    if (publicConfig.registrationUrl !== undefined) flowConfig.registrationUrl = publicConfig.registrationUrl;
    if (publicConfig.clientId !== undefined) flowConfig.clientId = publicConfig.clientId;
    if (clientSecret !== undefined) flowConfig.clientSecret = clientSecret;
    if (publicConfig.scopes !== undefined) flowConfig.scopes = publicConfig.scopes;
    if (publicConfig.prompt !== undefined) flowConfig.prompt = publicConfig.prompt;
    if (publicConfig.redirectUri !== undefined) flowConfig.redirectUri = publicConfig.redirectUri;
    if (publicConfig.callbackPort !== undefined) flowConfig.callbackPort = publicConfig.callbackPort;
    if (publicConfig.callbackPath !== undefined) flowConfig.callbackPath = publicConfig.callbackPath;
    const redirect = publicConfig.redirectUri ? new URL(publicConfig.redirectUri) : undefined;
    const requiresCallbackInput = redirect !== undefined
      && !(redirect.protocol === 'http:' && (redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1' || redirect.hostname === '[::1]'));
    return { publicConfig, flowConfig, requiresCallbackInput };
  }
  #createManualInputController(flowSignal: AbortSignal) {
    let queued: string | undefined;
    let waiter: ((value: string) => void) | undefined;
    return {
      submit: (input: string) => {
        if (waiter) {
          const resolve = waiter;
          waiter = undefined;
          resolve(input);
          return;
        }
        queued = input;
      },
      waitForInput: (waitSignal?: AbortSignal) => {
        if (flowSignal.aborted || waitSignal?.aborted) {
          return Promise.resolve('');
        }
        if (queued !== undefined) {
          const value = queued;
          queued = undefined;
          return Promise.resolve(value);
        }
        const deferred = Promise.withResolvers<string>();
        const cleanup = () => {
          flowSignal.removeEventListener('abort', onAbort);
          waitSignal?.removeEventListener('abort', onAbort);
        };
        const onAbort = () => {
          cleanup();
          if (waiter === resolveInput) waiter = undefined;
          deferred.resolve('');
        };
        const resolveInput = (value: string) => {
          cleanup();
          deferred.resolve(value);
        };
        waiter = resolveInput;
        flowSignal.addEventListener('abort', onAbort, { once: true });
        waitSignal?.addEventListener('abort', onAbort, { once: true });
        return deferred.promise;
      },
    };
  }
  #toOAuthError(error: NativeMcpError | undefined, aborted: boolean, cancelReason?: NativeMcpError): NativeMcpError {
    if (cancelReason) return cancelReason;
    if (error) return error;
    if (aborted) return new NativeMcpError('MCP_OAUTH_CANCELLED', 'MCP OAuth was cancelled.', false);
    return new NativeMcpError('MCP_OAUTH_FAILED', 'MCP OAuth authentication failed.', true);
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
  #remoteServer(serverId: string, configuration: MCPConfigurationState): RemoteServerConfig {
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
    const pending = this.#oauth.get(name);
    if (pending) await this.#abortEntry(pending);
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
    this.#oauth.clear();
    for (const flow of pending) flow.abort.abort();
    await Promise.allSettled(pending.map(flow => flow.done));
    await this.#release(this.#owned);
    await this.#tail;
    this.#active.clear();
    this.#session = undefined;
  }
}
