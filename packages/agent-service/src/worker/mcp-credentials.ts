import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { EntityIdSchema, type MCPSecretWriteResult } from '@openchamber/agent-contract';
import { withFileLock } from '@oh-my-pi/pi-utils/file-lock';
import { readMCPConfigFile, writeMCPConfigFile } from '@oh-my-pi/pi-coding-agent/mcp/config-writer';
import type { AuthCredentialEntry, AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import type { MCPConfigFile } from '@oh-my-pi/pi-coding-agent/mcp/types';
import { ProjectionError } from '../projection/journal.ts';

const McpReferencePattern = /^mcp_[0-9a-f-]{36}$/;

export class NativeMcpCredentials {
  private readonly prefix: string;
  private readonly userPrefix = 'openchamber-mcp-user-';
  private migration: Promise<void> | undefined;
  constructor(
    private readonly storage: AuthStorage,
    private readonly workspaceId: string,
    private readonly userConfigPath?: string,
  ) {
    this.prefix = `openchamber-mcp-${createHash('sha256').update(workspaceId).digest('hex')}-`;
  }

  private projectProvider(reference: string): string {
    return `${this.prefix}${reference}`;
  }

  private userProvider(reference: string): string {
    return `${this.userPrefix}${reference}`;
  }

  private ensureMigrated(): Promise<void> {
    if (this.userConfigPath === undefined) return Promise.resolve();
    if (this.migration === undefined) {
      this.migration = this.migrateUserCredentials(this.userConfigPath).catch(error => {
        this.migration = undefined;
        throw error;
      });
    }
    return this.migration;
  }

  async resolve(reference: string, options?: { scope?: 'project' | 'user' }): Promise<string> {
    EntityIdSchema.parse(reference);
    if (!McpReferencePattern.test(reference)) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential does not belong to this workspace');
    if (options?.scope === 'user') {
      await this.ensureMigrated();
      const provider = this.userProvider(reference);
      await this.storage.credentials.reload();
      if (!this.storage.credentials.get(provider)) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential does not belong to this workspace');
      return provider;
    }
    const provider = this.projectProvider(reference);
    await this.storage.credentials.reload();
    if (!this.storage.credentials.get(provider)) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential does not belong to this workspace');
    return provider;
  }

  async write(serverId: string, persistedRevision: string, value: string, options?: { scope?: 'project' | 'user' }): Promise<MCPSecretWriteResult> {
    const credentialRef = `mcp_${randomUUID()}`;
    const provider = options?.scope === 'user' ? this.userProvider(credentialRef) : this.projectProvider(credentialRef);
    try {
      await this.storage.credentials.set(provider, { type: 'api_key', key: value, source: 'login' });
      await this.storage.credentials.reload();
      const stored = this.storage.credentials.get(provider);
      if (stored?.type !== 'api_key' || stored.key !== value) throw new Error('Credential write was not retained');
    } catch { throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'MCP credential persistence failed'); }
    return { workspaceId: this.workspaceId, serverId, persistedRevision, credentialRef };
  }

  private async legacyUserProvider(reference: string): Promise<string | undefined> {
    const suffix = `-${reference}`;
    await this.storage.credentials.reload();
    for (const stored of this.storage.credentials.list()) {
      if (!stored.provider.startsWith('openchamber-mcp-') || stored.provider.startsWith(this.userPrefix) || !stored.provider.endsWith(suffix)) continue;
      if (this.storage.credentials.get(stored.provider)) return stored.provider;
    }
    return undefined;
  }

  private async moveUserCredential(reference: string): Promise<void> {
    const target = this.userProvider(reference);
    await this.storage.credentials.reload();
    if (this.storage.credentials.get(target)?.type === 'api_key') {
      const legacy = await this.legacyUserProvider(reference);
      if (legacy) await this.storage.credentials.remove(legacy).catch(() => undefined);
      return;
    }
    const legacy = await this.legacyUserProvider(reference);
    if (!legacy) return;
    const credential = this.storage.credentials.get(legacy);
    if (!credential) return;
    const entry: AuthCredentialEntry = credential.type === 'api_key'
      ? { type: 'api_key', key: credential.key, source: 'login' }
      : credential;
    try {
      await this.storage.credentials.set(target, entry);
      await this.storage.credentials.reload();
      if (!this.storage.credentials.get(target)) throw new Error('Migrated credential was not retained');
    } catch { throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'MCP credential persistence failed'); }
    await this.storage.credentials.remove(legacy).catch(() => undefined);
  }

  async migrateUserCredentials(userConfigPath: string): Promise<void> {
    await withFileLock(userConfigPath, async () => {
      let raw: MCPConfigFile;
      try {
        raw = await readMCPConfigFile(userConfigPath);
      } catch {
        throw new ProjectionError(503, 'MCP_CONFIG_READ_FAILED', 'User MCP configuration is absent, invalid or unreadable.');
      }
      const parsed = UserCredentialFileMigrationSchema.safeParse(raw);
      if (!parsed.success) throw new ProjectionError(503, 'MCP_CONFIG_READ_FAILED', 'User MCP configuration is absent, invalid or unreadable.');
      const openchamber = parsed.data.openchamber;
      const prior = new Set(openchamber?.migratedCredentials ?? []);
      const owned = new Set(prior);
      for (const reference of collectUserFileReferences(openchamber?.credentials ?? {})) {
        if (owned.has(reference)) continue;
        await this.moveUserCredential(reference);
        await this.storage.credentials.reload();
        if (this.storage.credentials.get(this.userProvider(reference))) owned.add(reference);
      }
      const next = [...owned].sort();
      const before = [...prior].sort();
      if (next.length === before.length && next.every((reference, index) => reference === before[index])) return;
      const rewritten: UserMigrationFile = { ...raw, openchamber: { ...openchamber, migratedCredentials: next } };
      await writeMCPConfigFile(userConfigPath, rewritten);
    });
  }
}

type UserMigrationFile = MCPConfigFile & { openchamber?: NonNullable<UserCredentialMigrationFile['openchamber']> };

const CredentialReferenceMappingSchema = z.strictObject({
  credentialRef: EntityIdSchema.optional(),
  headerCredentialRefs: z.record(z.string().min(1), EntityIdSchema).optional(),
  envCredentialRefs: z.record(z.string().min(1), EntityIdSchema).optional(),
});

const UserCredentialFileMigrationSchema = z.looseObject({
  openchamber: z.looseObject({
    credentials: z.record(z.string().min(1), CredentialReferenceMappingSchema).optional(),
    migratedCredentials: z.array(EntityIdSchema).optional(),
  }).optional(),
});
type UserCredentialMigrationFile = z.infer<typeof UserCredentialFileMigrationSchema>;

function collectUserFileReferences(credentials: NonNullable<NonNullable<UserCredentialMigrationFile['openchamber']>['credentials']>): string[] {
  const references: string[] = [];
  for (const mapping of Object.values(credentials)) {
    if (mapping.credentialRef) references.push(mapping.credentialRef);
    for (const reference of Object.values(mapping.headerCredentialRefs ?? {})) references.push(reference);
    for (const reference of Object.values(mapping.envCredentialRefs ?? {})) references.push(reference);
  }
  return [...new Set(references.filter(candidate => McpReferencePattern.test(candidate)))];
}
