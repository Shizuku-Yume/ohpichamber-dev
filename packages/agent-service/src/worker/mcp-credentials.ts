import { createHash, randomUUID } from 'node:crypto';
import { EntityIdSchema, type MCPSecretWriteResult } from '@openchamber/agent-contract';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ProjectionError } from '../projection/journal.ts';

/** References are capabilities only within their admitted workspace and native agent directory. */
export class NativeMcpCredentials {
  private readonly prefix: string;
  constructor(private readonly storage: AuthStorage, private readonly workspaceId: string) {
    this.prefix = `openchamber-mcp-${createHash('sha256').update(workspaceId).digest('hex')}-`;
  }
  async resolve(reference: string): Promise<string> {
    EntityIdSchema.parse(reference);
    if (!/^mcp_[0-9a-f-]{36}$/.test(reference)) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential does not belong to this workspace');
    const provider = `${this.prefix}${reference}`;
    await this.storage.credentials.reload();
    if (!this.storage.credentials.get(provider)) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential does not belong to this workspace');
    return provider;
  }
  async write(serverId: string, persistedRevision: string, value: string): Promise<MCPSecretWriteResult> {
    const credentialRef = `mcp_${randomUUID()}`;
    const provider = `${this.prefix}${credentialRef}`;
    try {
      // Literal values are never evaluated as shell/config expressions.
      await this.storage.credentials.set(provider, { type: 'api_key', key: value, source: 'login' });
      await this.storage.credentials.reload();
      const stored = this.storage.credentials.get(provider);
      if (stored?.type !== 'api_key' || stored.key !== value) throw new Error('Credential write was not retained');
    } catch { throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'MCP credential persistence failed'); }
    return { workspaceId: this.workspaceId, serverId, persistedRevision, credentialRef };
  }
}
