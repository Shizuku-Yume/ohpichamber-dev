import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  CatalogWorkerIdentitySchema, CounterSchema, EntityIdSchema, JsonObjectSchema, JsonValueSchema,
  MCPApplyRequestSchema, MCPAppliedRevisionsSchema, MCPCatalogReadSchema,
  MCPCatalogStateSchema, MCPConfigurationStateSchema, MCPConfigureRequestSchema,
  MCP_OAUTH_LOOPBACK_CALLBACK_PATH, MCP_OAUTH_LOOPBACK_CALLBACK_PORT,
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
import { resolveMcpOAuthEndpointsFromServer } from '@oh-my-pi/pi-coding-agent/mcp/oauth-reauth';
import {
  MCPOAuthFlow,
  type MCPOAuthConfig, type MCPStoredOAuthCredential,
} from '@oh-my-pi/pi-coding-agent/mcp/oauth-flow';
import { refreshStoredManagedMcpOAuthCredential } from '@oh-my-pi/pi-coding-agent/mcp/oauth-credentials';
import type { MCPConfigFile, MCPHttpServerConfig, MCPSseServerConfig, MCPServerConfig as SDKMCPServerConfig } from '@oh-my-pi/pi-coding-agent/mcp/types';
import type { AuthStorage as SDKAuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { withFileLock } from '@oh-my-pi/pi-utils/file-lock';
import { ProjectionError } from '../projection/journal.ts';
import { mcpAuthRequired } from '../mcp-auth.ts';
import { operationErrorDetail } from '../protocol.ts';
import { MCPDiscoveredToolSchema, MCPToolDiscoverySchema, type MCPDiscoveredTool, type MCPToolDiscovery } from './mcp/protocol.ts';

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
  /** A Host policy refusal (`ProjectionError`) keeps its own code, so the panel
   * can answer it as policy instead of as a broken provider connection. */
  error: NativeMcpError | ProjectionError | undefined;
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

/** A transport/handshake failure that means the server wants authorization.
 * The rule is shared with the supervisor, because which apply path runs depends
 * only on whether a session is open. */
function isAuthError(detail: string, config?: SDKMCPServerConfig): boolean {
  return mcpAuthRequired({ detail, config });
}

/**
 * The child's own error text can quote what it was given, including an injected
 * credential (a provider that prints its DSN). The worker holds the resolved
 * values it handed this transport, so remove them from the detail here — the one
 * place a failure detail is formed — before it reaches the catalog, the problem
 * body or a toast. Values under four characters are skipped: blanking a token
 * that short would mangle ordinary prose without hiding anything.
 */
function scrubCredentialValues(detail: string, config: SDKMCPServerConfig): string {
  const remote = config.type === 'http' || config.type === 'sse';
  const values = remote
    ? Object.values(config.headers ?? {}).flatMap(value => value.startsWith('Bearer ') ? [value, value.slice('Bearer '.length)] : [value])
    : Object.values(config.env ?? {});
  let scrubbed = detail;
  for (const value of values.filter(value => value.trim().length >= 4).sort((left, right) => right.length - left.length)) {
    scrubbed = scrubbed.split(value).join('[redacted]');
  }
  return scrubbed;
}

/** Credential references OpenChamber keeps beside a server's native entry (references only, never values). */
const CredentialMappingSchema = z.strictObject({
  credentialRef: EntityIdSchema.optional(),
  headerCredentialRefs: z.record(z.string().min(1), EntityIdSchema).optional(),
  envCredentialRefs: z.record(z.string().min(1), EntityIdSchema).optional(),
});
type CredentialMapping = z.infer<typeof CredentialMappingSchema>;
/**
 * The user file is OMP's native format and OMP reads only `mcpServers` and its
 * override lists. OpenChamber keeps its credential map and each server's own
 * identity under one top-level key OMP ignores, so a reread or a second session
 * finds the same references and the same `label`/`managed` the user committed.
 * A native entry cannot express either, and the Host authorizes a server by
 * comparing it with the projection of this file.
 */
const UserServerIdentitySchema = z.strictObject({ label: z.string().min(1), managed: z.boolean().optional() });
const UserOpenchamberSchema = z.strictObject({
  credentials: z.record(z.string().min(1), CredentialMappingSchema).optional(),
  servers: z.record(z.string().min(1), UserServerIdentitySchema).optional(),
});
const UserCredentialFileSchema = z.looseObject({ openchamber: UserOpenchamberSchema.optional() });
type UserFile = MCPConfigFile & { openchamber?: z.infer<typeof UserOpenchamberSchema> };

/** Host-owned identity: the native key when valid, otherwise its sanitized form. */
function serverIdForKey(key: string): string {
  return EntityIdSchema.safeParse(key).success ? key : key.replace(/[^0-9A-Za-z._~-]/g, '-').slice(0, 256) || 'server';
}

/** The URL the UI may see: http(s) only, without credentials, query or fragment. */
function sanitizeRemoteUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return 'http://localhost';
    parsedUrl.username = '';
    parsedUrl.password = '';
    parsedUrl.search = '';
    parsedUrl.hash = '';
    return parsedUrl.toString();
  } catch {
    return 'http://localhost';
  }
}

/** The command the UI may see: a bare executable name, never a path. */
function sanitizeCommand(value: string): string {
  const command = value.trim() || 'stdio-server';
  if (command.startsWith('/') || command.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(command)) {
    return command.split(/[/\\]/).filter(Boolean).pop() || 'stdio-server';
  }
  return command;
}

const LenientStringListSchema = z.array(JsonValueSchema).catch([]).transform((items) =>
  items.flatMap((item) => {
    const parsed = z.string().safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }),
);

const MCPServerEntrySchema = z.object({
  enabled: z.boolean().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
  type: z.string().optional().catch(undefined),
  url: z.string().optional().catch(undefined),
  command: z.string().optional().catch(undefined),
  args: LenientStringListSchema.optional(),
}).passthrough();

const MCPConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), JsonValueSchema).optional(),
  disabledServers: LenientStringListSchema.optional(),
}).passthrough();

/** The workspace owner supplies the durable revision; a worker never mints it. */
function projectUnmanagedMcpConfiguration(
  raw: MCPConfigFile,
  workspaceId: string,
  scope: 'project' | 'user' = 'project',
  managed = false,
): MCPConfigurationState {
  const parsed = MCPConfigFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration is absent, invalid or unreadable.', true);
  }
  const rawObj = parsed.data;
  const mcpServers = rawObj.mcpServers;
  const disabledList = rawObj.disabledServers ?? [];
  const servers: MCPServerConfig[] = [];
  const seenIds = new Set<string>();

  for (const [key, entry] of Object.entries(mcpServers ?? {})) {
    const entryParsed = MCPServerEntrySchema.safeParse(entry);
    if (!entryParsed.success) continue;
    const cfg = entryParsed.data;
    const serverId = serverIdForKey(key);
    if (seenIds.has(serverId)) continue;
    seenIds.add(serverId);

    const enabled = cfg.enabled !== false && !disabledList.includes(key) && !disabledList.includes(serverId);
    const label = cfg.name?.trim() || key.trim() || serverId || 'server';

    let transport: MCPServerConfig['transport'];
    if (cfg.type === 'http' || cfg.type === 'sse' || cfg.url !== undefined) {
      transport = {
        type: cfg.type === 'http' ? 'http' : 'sse',
        url: cfg.url !== undefined ? sanitizeRemoteUrl(cfg.url) : 'http://localhost',
      };
    } else {
      const args = cfg.args ?? [];
      transport = {
        type: 'stdio',
        command: cfg.command !== undefined ? sanitizeCommand(cfg.command) : 'stdio-server',
        args,
      };
    }
    servers.push({ serverId, label, enabled, managed, scope, transport });
  }

  return { workspaceId, persistedRevision: '0', config: { servers } };
}

/** Credential references of one server, as stored in the user file's OpenChamber key. */
function credentialMapping(server: MCPServerConfig): CredentialMapping | undefined {
  const { transport } = server;
  if (transport.type === 'stdio') {
    return transport.envCredentialRefs ? { envCredentialRefs: transport.envCredentialRefs } : undefined;
  }
  const mapping: CredentialMapping = {};
  if (transport.credentialRef) {
    mapping.credentialRef = transport.credentialRef;
  }
  if (transport.headerCredentialRefs) {
    mapping.headerCredentialRefs = transport.headerCredentialRefs;
  }
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function nativeTransport(transport: MCPServerConfig['transport']) {
  return transport.type === 'stdio'
    ? { type: transport.type, command: transport.command, args: transport.args }
    : { type: transport.type, url: transport.url };
}

function stripManaged(server: MCPServerConfig): MCPServerConfig {
  const copy = { ...server };
  delete copy.managed;
  return copy;
}

/** Parses the user file leniently for reads; a malformed credential map fails closed. */
function projectUserServers(raw: MCPConfigFile, workspaceId: string): MCPServerConfig[] {
  const parsed = UserCredentialFileSchema.safeParse(raw);
  if (!parsed.success) throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'User MCP configuration is absent, invalid or unreadable.', true);
  const credentials = parsed.data.openchamber?.credentials ?? {};
  const identities = parsed.data.openchamber?.servers ?? {};
  return projectUnmanagedMcpConfiguration(raw, workspaceId, 'user', true).config.servers
    .map(server => {
      const identity = identities[server.serverId];
      if (identity === undefined) {
        const mapping = credentials[server.serverId];
        return mapping ? { ...server, transport: { ...server.transport, ...mapping } } : server;
      }
      // The native entry carries only transport and enabled-ness: `label` and
      // `managed` are OpenChamber's, so a reread must return exactly what the
      // writer committed. The unmanaged projection marks every entry it builds
      // as unmanaged, and the Host authorizes a server by deep-comparing it with
      // this projection, so a managed entry's real flag (or its absence) wins.
      const { managed: _unmanagedMark, ...native } = server;
      const projection: MCPServerConfig = {
        ...native, label: identity.label,
        ...(identity.managed === undefined ? {} : { managed: identity.managed }),
      };
      const mapping = credentials[server.serverId];
      return mapping ? { ...projection, transport: { ...projection.transport, ...mapping } } : projection;
    });
}

const TRANSPORT_KEYS = ['type', 'url', 'command', 'args'];

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'MCP configuration could not be checked.', true);
  }
}

/** Project ids the managed file owns. A hand-written or other-workspace file is refused, never overwritten. */
async function managedProjectServerIds(configPath: string, workspaceId: string): Promise<Set<string>> {
  if (!await pathExists(configPath)) return new Set();
  let raw: MCPConfigFile;
  try {
    raw = await readMCPConfigFile(configPath);
  } catch {
    throw new NativeMcpError('CATALOG_CONFLICT', 'Hand-written or unmanaged MCP configuration cannot be mutated in place.', false);
  }
  const managed = ManagedFileSchema.safeParse(raw);
  if (!managed.success || managed.data.openchamber.workspaceId !== workspaceId) {
    throw new NativeMcpError('CATALOG_CONFLICT', 'Hand-written or unmanaged MCP configuration cannot be mutated in place.', false);
  }
  return new Set(Object.keys(managed.data.mcpServers));
}

/** Rewrites only the project-owned managed file; the user file is never touched here. */
async function writeProjectServers(configPath: string, configuration: MCPConfigurationState): Promise<void> {
  const servers = configuration.config.servers
    .filter(server => server.scope !== 'user')
    .map(server => ({ ...stripManaged(server), scope: 'project' as const }));
  await mkdir(dirname(configPath), { recursive: true, mode: 0o700 });
  try {
    await withFileLock(configPath, () => writeMCPConfigFile(configPath, managedFile({
      workspaceId: configuration.workspaceId,
      persistedRevision: configuration.persistedRevision,
      config: { servers },
    })));
  } catch {
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'MCP configuration could not be committed.', true);
  }
}

/**
 * Read-modify-write of the native user file under its own lock. Only user-scope
 * entries that differ are changed; native env/headers/auth/oauth, enable overrides
 * and a global server shadowed by a project server stay byte-for-byte.
 */
async function writeUserServers(
  userConfigPath: string,
  workspaceId: string,
  desired: MCPServerConfig[],
  projectIds: ReadonlySet<string>,
): Promise<void> {
  await mkdir(dirname(userConfigPath), { recursive: true, mode: 0o700 });
  try {
    await withFileLock(userConfigPath, async () => {
      const raw = await readMCPConfigFile(userConfigPath);
      const prior = projectUserServers(raw, workspaceId);
      const priorById = new Map(prior.map(server => [server.serverId, server]));
      const desiredIds = new Set(desired.map(server => server.serverId));
      // Only servers the user could see before (not shadowed by a project server) and no longer list are removed.
      const removed = prior.map(server => server.serverId).filter(id => !projectIds.has(id) && !desiredIds.has(id));
      const changed = desired.filter(server => {
        const before = priorById.get(server.serverId);
        return !(before !== undefined
          && before.enabled === server.enabled
          && JSON.stringify(nativeTransport(before.transport)) === JSON.stringify(nativeTransport(server.transport))
          && JSON.stringify(credentialMapping(before)) === JSON.stringify(credentialMapping(server)));
      });
      if (removed.length === 0 && changed.length === 0) return;

      const credentials: Record<string, CredentialMapping> = { ...UserCredentialFileSchema.parse(raw).openchamber?.credentials };
      const identities: Record<string, { label: string; managed?: boolean }> = { ...UserCredentialFileSchema.parse(raw).openchamber?.servers };
      const servers: NonNullable<MCPConfigFile['mcpServers']> = { ...raw.mcpServers ?? {} };
      const disabled = new Set(raw.disabledServers ?? []);
      const keysFor = (id: string) => Object.keys(servers).filter(key => serverIdForKey(key) === id);

      for (const id of removed) {
        for (const key of keysFor(id)) {
          delete servers[key];
          disabled.delete(key);
        }
        disabled.delete(id);
        delete credentials[id];
        delete identities[id];
      }
      for (const server of changed) {
        const id = server.serverId;
        const [key] = keysFor(id);
        const existing = key === undefined ? undefined : servers[key];
        const before = priorById.get(id);
        if (key === undefined || existing === undefined) {
          servers[id] = definition(server);
        } else if (!before || JSON.stringify(nativeTransport(before.transport)) !== JSON.stringify(nativeTransport(server.transport))) {
          const native = Object.fromEntries(Object.entries(existing).filter(([name]) => !TRANSPORT_KEYS.includes(name)));
          servers[key] = { ...native, ...definition(server) };
        } else {
          servers[key] = { ...existing, enabled: server.enabled };
        }
        if (server.enabled) {
          disabled.delete(id);
          for (const name of keysFor(id)) disabled.delete(name);
        } else {
          disabled.add(id);
        }
        const mapping = credentialMapping(server);
        if (mapping) credentials[id] = mapping;
        else delete credentials[id];
        identities[id] = { label: server.label, ...(server.managed === undefined ? {} : { managed: server.managed }) };
      }

      const file: UserFile = { ...raw, mcpServers: servers };
      if (disabled.size > 0 || raw.disabledServers !== undefined) file.disabledServers = [...disabled].sort();
      if (Object.keys(credentials).length > 0 || Object.keys(identities).length > 0) {
        file.openchamber = {
          ...(Object.keys(credentials).length > 0 ? { credentials } : {}),
          ...(Object.keys(identities).length > 0 ? { servers: identities } : {}),
        };
      } else delete file.openchamber;
      await writeMCPConfigFile(userConfigPath, file);
    });
  } catch (error) {
    if (error instanceof NativeMcpError) throw error;
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'Global user MCP configuration could not be committed.', true);
  }
}

/** Project servers commit last: the project file carries the persisted revision. */
export async function writeNativeMcpConfiguration(
  configPath: string,
  captured: MCPConfigurationState,
  userConfigPath?: string,
): Promise<MCPConfigurationState> {
  const configuration = MCPConfigurationStateSchema.parse(captured);
  const userServers = configuration.config.servers.filter(server => server.scope === 'user');
  if (userServers.length > 0 && userConfigPath === undefined) {
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'Global user MCP storage is unavailable.', true);
  }
  const projectIds = await managedProjectServerIds(configPath, configuration.workspaceId);
  const committedProjectIds = new Set(configuration.config.servers.filter(server => server.scope !== 'user').map(server => server.serverId));
  const effectiveProjectIds = new Set([...projectIds, ...committedProjectIds]);
  if (userConfigPath !== undefined) {
    await writeUserServers(userConfigPath, configuration.workspaceId, userServers.map(stripManaged), effectiveProjectIds);
  }
  await writeProjectServers(configPath, configuration);
  return { ...configuration, config: { servers: configuration.config.servers.map(stripManaged) } };
}

/** First-use storage may be absent; malformed or unreadable configured files still fail closed. */
export async function readNativeMcpConfigurationIfPresent(
  configPath: string,
  workspaceId: string,
  userConfigPath?: string,
): Promise<MCPConfigurationState | null> {
  let hasProject = false;
  let hasUser = false;
  try {
    await lstat(configPath);
    hasProject = true;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration could not be read.', true);
    }
  }
  if (userConfigPath) {
    try {
      await lstat(userConfigPath);
      hasUser = true;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration could not be read.', true);
      }
    }
  }
  if (!hasProject && !hasUser) return null;
  return readNativeMcpConfiguration(configPath, workspaceId, userConfigPath);
}

async function readNativeMcpConfiguration(
  configPath: string,
  workspaceId: string,
  userConfigPath?: string,
): Promise<MCPConfigurationState> {
  let projectServers: MCPServerConfig[] = [];
  let persistedRevision = '0';

  try {
    const raw = await readMCPConfigFile(configPath);
    const managedResult = ManagedFileSchema.safeParse(raw);
    if (managedResult.success && managedResult.data.openchamber.workspaceId === workspaceId) {
      const file = managedResult.data;
      const expected = managedFile(file.openchamber);
      if (JSON.stringify(file.mcpServers) === JSON.stringify(expected.mcpServers)
        && JSON.stringify(file.disabledServers) === JSON.stringify(expected.disabledServers)) {
        projectServers = file.openchamber.config.servers.map(s => ({ ...s, scope: 'project' as const }));
        persistedRevision = file.openchamber.persistedRevision;
      } else {
        projectServers = projectUnmanagedMcpConfiguration(raw, workspaceId, 'project', false).config.servers;
      }
    } else {
      projectServers = projectUnmanagedMcpConfiguration(raw, workspaceId, 'project', false).config.servers;
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      // Absent project file is ok
    } else if (error instanceof NativeMcpError) {
      throw error;
    } else {
      throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'MCP configuration is absent, invalid or unreadable.', true);
    }
  }

  let userServers: MCPServerConfig[] = [];
  if (userConfigPath) {
    try {
      userServers = projectUserServers(await readMCPConfigFile(userConfigPath), workspaceId);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Absent user file is ok
      } else if (error instanceof NativeMcpError) {
        throw error;
      } else {
        throw new NativeMcpError('MCP_CONFIG_READ_FAILED', 'User MCP configuration is absent, invalid or unreadable.', true);
      }
    }
  }

  const seen = new Set<string>();
  const mergedServers: MCPServerConfig[] = [];
  for (const server of projectServers) {
    if (!seen.has(server.serverId)) {
      seen.add(server.serverId);
      mergedServers.push(server);
    }
  }
  for (const server of userServers) {
    if (!seen.has(server.serverId)) {
      seen.add(server.serverId);
      mergedServers.push(server);
    }
  }

  return {
    workspaceId,
    persistedRevision,
    config: { servers: mergedServers },
  };
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
  readonly userConfigPath?: string;
  readonly worker: CatalogWorkerIdentity;
  readonly authStorage: SDKAuthStorage;
  /** Host-authorized opaque reference -> private AuthStorage provider namespace. */
  readonly resolveCredentialRef: (reference: string) => Promise<string>;
  readonly resolveCommand: (server: Extract<MCPServerConfig['transport'], { type: 'stdio' }>) => Promise<string>;
  /** Existing Host network/enterprise policy, evaluated at each crossing. */
  /** `proposed` marks a server the persisting operation itself introduces. */
  readonly authorizeServer: (server: MCPServerConfig, proposed?: boolean) => Promise<void>;
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

  /**
   * The root session this catalog names. A completed `/btw` branch rekeys the
   * native session in place, so every published catalog and the persisted
   * configuration read must address the minted id.
   */
  private worker: CatalogWorkerIdentity;

  constructor(private readonly deps: NativeMcpDependencies) {
    super(deps.cwd, null);
    this.worker = CatalogWorkerIdentitySchema.parse(deps.worker);
    this.#catalog = MCPCatalogStateSchema.parse({
      worker: this.worker, runtimeStatus: 'unavailable',
      appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [],
    });
  }

  /**
   * Follow the native session rekey. The worker generation and workspace stay
   * put; only the addressed root moves, so the published catalog keeps naming
   * the live session the Host now binds.
   */
  rekey(rootSessionId: string): void {
    if (this.worker.rootSessionId === rootSessionId) return;
    this.worker = CatalogWorkerIdentitySchema.parse({ ...this.worker, rootSessionId });
    this.#catalog = { ...this.#catalog, worker: this.worker };
    this.deps.onCatalog(this.#catalog);
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
        return {
          ...owner, status: 'failed', error: error instanceof NativeMcpError ? error.operationError
            : { code: 'MCP_RECONNECT_FAILED', detail: 'MCP connection test failed.', retryable: true }
        };
      } finally { if (manager) await this.#release([manager]); }
    });
  }

  /**
   * Names the tools of every enabled server through a real isolated handshake.
   * It publishes nothing and keeps no transport, because the workspace tool
   * catalog must answer before any session owns an applied MCP runtime.
   */
  discover(captured: MCPConfigurationState): Promise<MCPToolDiscovery> {
    return this.#serialize(async () => {
      const configuration = this.#capture(captured);
      const enabled = configuration.config.servers.filter(server => server.enabled);
      const staged = await Promise.allSettled(enabled.map(async server => ({ server, manager: await this.#stage(server) })));
      const tools: MCPDiscoveredTool[] = [];
      const managers: MCPManager[] = [];
      try {
        for (const attempt of staged) {
          // A server that cannot connect contributes no tools: configure and
          // apply already report that failure, and one bad server must not hide
          // the tools a sibling server serves.
          if (attempt.status !== 'fulfilled') continue;
          managers.push(attempt.value.manager);
          for (const tool of attempt.value.manager.getTools()) {
            tools.push(MCPDiscoveredToolSchema.parse({
              serverId: attempt.value.server.serverId, name: tool.name, description: tool.description ?? '',
            }));
          }
        }
      } finally {
        await this.#release(managers).catch(() => { /* discovery commits no runtime to keep */ });
      }
      return MCPToolDiscoverySchema.parse({
        workspaceId: configuration.workspaceId, persistedRevision: configuration.persistedRevision,
        tools: tools.sort((left, right) => left.serverId.localeCompare(right.serverId) || left.name.localeCompare(right.name)),
      });
    });
  }

  /** Called once by the serialized workspace owner, never once per fan-out root. */
  persist(raw: MCPConfigureRequest, next: MCPConfigurationState): Promise<MCPConfigurationState> {
    return this.#serialize(async () => {
      const request = MCPConfigureRequestSchema.parse(raw);
      const configuration = this.#capture(next);
      const current = await readNativeMcpConfiguration(this.deps.configPath, this.worker.workspaceId, this.deps.userConfigPath);
      if (current.config.servers.some(s => s.managed === false && s.scope === 'project')) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'Hand-written or unmanaged MCP configuration cannot be mutated in place.', false);
      }
      if (request.expectedPersistedRevision !== current.persistedRevision
        || BigInt(configuration.persistedRevision) <= BigInt(current.persistedRevision)
        || JSON.stringify(configuration.config) !== JSON.stringify(request.config)) {
        throw new NativeMcpError('CATALOG_CONFLICT', 'MCP configuration revision changed.', false);
      }
      for (const server of configuration.config.servers) await this.deps.authorizeServer(server, true);
      const persisted = await writeNativeMcpConfiguration(this.deps.configPath, configuration, this.deps.userConfigPath);
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
        const rejections = attempts.filter((a): a is PromiseRejectedResult => a.status === 'rejected');
        const authRejection = rejections.find(r => r.reason instanceof NativeMcpError && r.reason.code === 'MCP_AUTH_REQUIRED');
        const chosen = authRejection ?? rejections[0];
        const code = chosen?.reason instanceof NativeMcpError ? chosen.reason.code : 'MCP_APPLY_FAILED';
        const detail = chosen?.reason instanceof Error ? chosen.reason.message : 'MCP runtime application failed; the prior catalog is retained.';
        return this.#failed(configuration, code, detail);
      }
      try {
        await this.#publish(next, configuration, configuration.persistedRevision);
        return MCPWorkerApplyOutcomeSchema.parse({ worker: this.worker, outcome: 'applied', revisions: this.#revisions(configuration) });
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
      if (request.workerGeneration !== this.worker.workerGeneration) {
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
        worker: this.worker,
        persistedRevision: configuration.persistedRevision,
        status: 'pending',
        authenticated,
        pendingFlow: entry.pendingFlow,
      });
    }
    // A flow that fails after the browser handoff settles with an error but has
    // no request left to throw it from: the panel polls this read and would
    // otherwise reset with nothing to show. Report the cause here exactly once,
    // then retire the entry so the next read is a plain unauthenticated answer.
    // A user cancel keeps its neutral result: #abortEntry retires the entry, so no
    // settled entry with an error is left to read.
    const failure = !authenticated && entry?.settled ? entry.error : undefined;
    if (failure) {
      if (this.#oauth.get(serverId) === entry) this.#oauth.delete(serverId);
      return MCPOAuthResultSchema.parse({
        serverId,
        worker: this.worker,
        persistedRevision: configuration.persistedRevision,
        status: 'unauthenticated',
        authenticated: false,
        error: failure instanceof ProjectionError
          ? { code: failure.code, detail: operationErrorDetail(failure.code, failure.message), retryable: failure.status >= 500 }
          : { code: failure.code, detail: operationErrorDetail(failure.code, failure.message), retryable: failure.retryable },
      });
    }
    return MCPOAuthResultSchema.parse(
      authenticated
        ? {
          serverId,
          worker: this.worker,
          persistedRevision: configuration.persistedRevision,
          status: 'authenticated',
          authenticated: true,
        }
        : {
          serverId,
          worker: this.worker,
          persistedRevision: configuration.persistedRevision,
          status: 'unauthenticated',
          authenticated: false,
        },
    );
  }

  async oauthExecute(serverId: string, raw: MCPOAuthRequest, captured: MCPConfigurationState): Promise<MCPOAuthResult> {
    EntityIdSchema.parse(serverId);
    const request = MCPOAuthRequestSchema.parse(raw);
    if (request.workerGeneration !== this.worker.workerGeneration) {
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
      // Single-flight stays, but a second click is not a catalog conflict the
      // user must decode: the panel renders "sign-in already in progress".
      throw new NativeMcpError('MCP_OAUTH_IN_PROGRESS', 'MCP sign-in is already in progress.', false);
    }
    const flowId = randomUUID();
    const abort = new AbortController();
    const authReady = Promise.withResolvers<MCPOAuthPendingFlow>();
    const entry: OAuthFlowEntry = {
      flowId,
      serverId,
      persistedRevision: configuration.persistedRevision,
      workerGeneration: this.worker.workerGeneration,
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
        worker: this.worker,
        persistedRevision: configuration.persistedRevision,
        status: 'pending',
        authenticated,
        pendingFlow,
      });
    } catch (error) {
      const wasAborted = entry.abort.signal.aborted;
      const capturedError = error instanceof Error ? error : entry.error;
      entry.abort.abort();
      await entry.done;
      if (this.#oauth.get(serverId) === entry) this.#oauth.delete(serverId);
      throw this.#toOAuthError(capturedError, wasAborted, entry.cancelReason);
    }
  }

  /** OMP's reauth engine probes the server anonymously and reads the
   * `WWW-Authenticate`/`Mcp-Auth-Server` challenge before falling back to
   * well-known metadata, which is the only way a challenge-only server
   * (Linear-style `resource_metadata`, path-scoped issuers) advertises where to
   * sign in. The config is bare on purpose: a saved credential would make the
   * probe succeed and report that reauthorization is unnecessary. A user who
   * names the issuer or the protected-resource metadata keeps that answer. */
  async #discoverOAuthEndpoints(entry: OAuthFlowEntry, input: MCPOAuthConfigInput | undefined): Promise<OAuthEndpoints | null> {
    if (input?.issuerUrl !== undefined || input?.resourceMetadataUrl !== undefined) {
      return discoverOAuthEndpoints(
        entry.server.transport.url,
        input.issuerUrl,
        input.resourceMetadataUrl,
        { signal: entry.abort.signal },
      );
    }
    const serverConfig: SDKMCPServerConfig = { type: entry.server.transport.type, url: entry.server.transport.url, enabled: true };
    return resolveMcpOAuthEndpointsFromServer(serverConfig, {
      signal: entry.abort.signal,
      authStorage: this.deps.authStorage,
      cwd: this.deps.cwd,
    });
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
      if (oauthInput?.authorizationUrl === undefined || oauthInput?.tokenUrl === undefined) {
        discovered = await this.#discoverOAuthEndpoints(entry, oauthInput);
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
          // OMP advertises a `/launch` URL on its loopback listener whenever the
          // redirect has a loopback hostname, even when that listener is only a
          // random-port placeholder or another program's port (an SSH tunnel's
          // route, say). When the code comes back through `complete`, no such
          // listener is serving `/launch`, so the browser would hit a dead port.
          if (info.launchUrl !== undefined && !entry.requiresCallbackInput) pendingCandidate.launchUrl = info.launchUrl;
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
      // A Host policy refusal is not a provider failure: keeping its code and
      // status lets the panel answer it as policy (enterprise mode) while the
      // provider's own sentence still travels for a genuine sign-in failure.
      const nativeError = error instanceof ProjectionError
        ? error
        : this.#toOAuthError(error instanceof Error ? error : undefined, entry.abort.signal.aborted, entry.cancelReason);
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
      worker: this.worker,
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
      return {
        type: 'stdio', command: await this.deps.resolveCommand(server.transport), args: server.transport.args,
        cwd: this.deps.cwd, env, envPolicy: 'literal', enabled: true
      };
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
      const failedEntry = status.failed.find(f => f.name === server.serverId);
      const errorMsg = failedEntry?.error || result.errors.get(server.serverId);
      if (errorMsg || status.pending.length || !status.connected.includes(server.serverId) || !manager.getConnection(server.serverId)?.tools) {
        const detail = scrubCredentialValues(errorMsg || (status.pending.length ? 'MCP handshake timed out' : 'MCP handshake or tools failed'), config);
        const isAuth = isAuthError(detail, config);
        throw new NativeMcpError(isAuth ? 'MCP_AUTH_REQUIRED' : 'MCP_APPLY_FAILED', detail, true);
      }
      this.#wire(server.serverId, manager);
      return manager;
    } catch (err) {
      await this.#release([manager]);
      if (err instanceof NativeMcpError) throw err;
      const detail = scrubCredentialValues(err instanceof Error ? err.message : String(err), config);
      const isAuth = isAuthError(detail, config);
      throw new NativeMcpError(isAuth ? 'MCP_AUTH_REQUIRED' : 'MCP_APPLY_FAILED', detail, true);
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
      worker: this.worker, runtimeStatus: 'ready', appliedRevision,
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
    return MCPWorkerApplyOutcomeSchema.parse({
      worker: this.worker, outcome: 'failed',
      revisions: this.#revisions(configuration), error: { code, detail, retryable: true }
    });
  }
  #capture(raw: MCPConfigurationState): MCPConfigurationState {
    this.#assertCurrent();
    const configuration = MCPConfigurationStateSchema.parse(raw);
    if (configuration.workspaceId !== this.worker.workspaceId) throw new NativeMcpError('CATALOG_CONFLICT', 'MCP workspace does not match this worker.', false);
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
    const persisted = await readNativeMcpConfiguration(this.deps.configPath, this.worker.workspaceId, this.deps.userConfigPath);
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
    const persisted = await readNativeMcpConfiguration(this.deps.configPath, this.worker.workspaceId, this.deps.userConfigPath);
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
      : `openchamber-mcp-oauth-${createHash('sha256').update(JSON.stringify([this.worker.workspaceId, server.serverId, server.transport.url])).digest('hex')}`;
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
    // A runtime whose browser can reach this machine signs in on the Agent
    // Service's own loopback listener. Pinning it (rather than OMP's port 3000
    // with a random fallback) keeps the redirect stable across attempts, which
    // is what a provider's registered client expects. A caller that names a
    // Host callback (remote web, mobile) keeps that URI, and the flow then
    // completes through the `complete` action instead of the loopback listener.
    const redirectUri = input?.redirectUri
      ?? `http://localhost:${input?.callbackPort ?? MCP_OAUTH_LOOPBACK_CALLBACK_PORT}${input?.callbackPath ?? MCP_OAUTH_LOOPBACK_CALLBACK_PATH}`;
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
    const listenerPort = publicConfig.callbackPort ?? MCP_OAUTH_LOOPBACK_CALLBACK_PORT;
    const listenerPath = publicConfig.callbackPath ?? MCP_OAUTH_LOOPBACK_CALLBACK_PATH;
    const redirect = publicConfig.redirectUri ? new URL(publicConfig.redirectUri) : undefined;
    // A redirect completes locally only when it is exactly the listener this
    // flow binds. Any other URI — a Host route, a custom scheme, or a loopback
    // port that belongs to something else (an SSH tunnel, say) — reaches a
    // different listener, so the code has to arrive through the `complete`
    // action instead of this one.
    const localLoopback = redirect !== undefined
      && redirect.protocol === 'http:'
      && (redirect.hostname === 'localhost' || redirect.hostname === '127.0.0.1' || redirect.hostname === '[::1]')
      && Number(redirect.port || '80') === listenerPort
      && redirect.pathname === listenerPath;
    const requiresCallbackInput = redirect !== undefined && !localLoopback;
    // A non-local redirect never returns here, and OMP would otherwise bind its
    // default port 3000 (and refuse to sign in at all when a dev server holds
    // it) or a loopback port that is already someone else's. A random port keeps
    // the unused listener out of everyone's way; the code arrives through the
    // `complete` action instead.
    if (requiresCallbackInput && flowConfig.callbackPort === undefined) flowConfig.callbackPort = 0;
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
  /** The provider's own sentence is the diagnostic: OMP writes DCR rejection,
   * issuer mismatch, token exchange, port-in-use and state-mismatch causes for a
   * reader, and replacing them with one opaque line hides the only actionable
   * detail the user has. A native code wins because it carries the status map;
   * a Host policy refusal keeps its own code so the panel can answer it as
   * policy rather than as a provider failure. */
  #toOAuthError(error: Error | undefined, aborted: boolean, cancelReason?: NativeMcpError): NativeMcpError | ProjectionError {
    if (cancelReason) return cancelReason;
    if (error instanceof NativeMcpError || error instanceof ProjectionError) return error;
    if (aborted) return new NativeMcpError('MCP_OAUTH_CANCELLED', 'MCP OAuth was cancelled.', false);
    if (error?.message.trim()) {
      // OMP folds a rejected dynamic client registration into one sentence
      // (`#missingClientIdError`: "…dynamic client registration was rejected
      // (POST … → HTTP 403 — unapproved_client)…"); the stable code lets the
      // panel pre-fill and focus its client-ID field.
      const rejected = /dynamic client registration was rejected|unapproved_client/i.test(error.message);
      return new NativeMcpError(rejected ? 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED' : 'MCP_OAUTH_FAILED', error.message, false);
    }
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
