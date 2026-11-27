import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import {
  EntityIdSchema, JsonValueSchema,
  type MCPConfigurationState, type MCPServerConfig,
} from '@openchamber/agent-contract';
import { readMCPConfigFile, writeMCPConfigFile } from '@oh-my-pi/pi-coding-agent/mcp/config-writer';
import type { MCPConfigFile, MCPServerConfig as SDKMCPServerConfig } from '@oh-my-pi/pi-coding-agent/mcp/types';
import { withFileLock } from '@oh-my-pi/pi-utils/file-lock';
import { NativeMcpError } from './mcp-errors.ts';

export function definition(server: MCPServerConfig): SDKMCPServerConfig {
  return server.transport.type === 'stdio'
    ? { type: 'stdio', command: server.transport.command, args: server.transport.args, enabled: server.enabled }
    : { type: server.transport.type, url: server.transport.url, enabled: server.enabled };
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
  migratedCredentials: z.array(EntityIdSchema).optional(),
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
export function projectUnmanagedMcpConfiguration(
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

/** Parses the user file leniently for reads; a malformed credential map fails closed. */
export function projectUserServers(raw: MCPConfigFile, workspaceId: string): MCPServerConfig[] {
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

/**
 * Read-modify-write of the native user file under its own lock. Only user-scope
 * entries that differ are changed; native env/headers/auth/oauth, enable overrides
 * and a global server shadowed by a project server stay byte-for-byte.
 */
export async function writeUserServers(
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
          && before.label === server.label
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
        } else if (before.enabled !== server.enabled) {
          servers[key] = { ...existing, enabled: server.enabled };
        }
        if (!before || before.enabled !== server.enabled) {
          if (server.enabled) {
            disabled.delete(id);
            for (const name of keysFor(id)) disabled.delete(name);
          } else {
            disabled.add(id);
          }
        }
        const mapping = credentialMapping(server);
        if (mapping) credentials[id] = mapping;
        else delete credentials[id];
        identities[id] = { label: server.label, ...(server.managed === undefined ? {} : { managed: server.managed }) };
      }

      const file: UserFile = { ...raw, mcpServers: servers };
      if (JSON.stringify([...disabled]) !== JSON.stringify(raw.disabledServers ?? [])) file.disabledServers = [...disabled].sort();
      const migratedCredentials = UserCredentialFileSchema.parse(raw).openchamber?.migratedCredentials;
      if (Object.keys(credentials).length > 0 || Object.keys(identities).length > 0 || migratedCredentials !== undefined) {
        const openchamber: NonNullable<UserFile['openchamber']> = {};
        if (Object.keys(credentials).length > 0) openchamber.credentials = credentials;
        if (Object.keys(identities).length > 0) openchamber.servers = identities;
        if (migratedCredentials !== undefined) openchamber.migratedCredentials = migratedCredentials;
        file.openchamber = openchamber;
      } else delete file.openchamber;
      await writeMCPConfigFile(userConfigPath, file);
    });
  } catch (error) {
    if (error instanceof NativeMcpError) throw error;
    throw new NativeMcpError('MCP_CONFIG_WRITE_FAILED', 'Global user MCP configuration could not be committed.', true);
  }
}
