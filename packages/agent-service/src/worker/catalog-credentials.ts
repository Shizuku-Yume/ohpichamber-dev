import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import {
  PositiveCounterSchema, ProviderCredentialMutationResultSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  type ProviderCredentialWriteRequest, type ProviderCredentialDeleteRequest,
  type ProviderCredentialMutationResult,
} from '@openchamber/agent-contract';
import type { PrivateCredentialResolveRequest, PrivateCredentialResolveResult } from '../catalogs/protocol.ts';
import { PrivateCredentialResolveRequestSchema } from '../catalogs/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { NativeModels, credentialReference } from './catalog-models.ts';
export class NativeCredentials {
  constructor(private readonly authStorage: AuthStorage, private readonly models: NativeModels, private readonly workspaceId: string) {}

  async write(input: ProviderCredentialWriteRequest, revision: string): Promise<ProviderCredentialMutationResult> {
    const request = ProviderCredentialWriteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    await this.models.readProviders(this.workspaceId, request.expectedRevision);
    const provider = this.models.provider(request.providerId);
    if (!provider.authMethods.includes(request.credential.method)) {
      throw new ProjectionError(422, 'PROVIDER_UNAVAILABLE', 'Provider does not support this credential method');
    }
    const credential = request.credential;
    let upsertedId: number | undefined;
    try {
      const entries = await this.authStorage.credentials.upsert(request.providerId, credential.method === 'api-key'
        ? { type: 'api_key', key: credential.apiKey, source: 'login' }
        : { type: 'oauth', access: credential.accessToken, refresh: credential.refreshToken, expires: credential.expiresAt });
      await this.authStorage.credentials.reload();
      const matched = entries.filter(entry => credential.method === 'api-key'
        ? entry.credential.type === 'api_key' && entry.credential.key === credential.apiKey
        : entry.credential.type === 'oauth' && entry.credential.access === credential.accessToken).at(-1);
      upsertedId = matched?.id;
    } catch {
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider credential persistence failed');
    }
    if (upsertedId === undefined) {
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider credential persistence failed');
    }
    return ProviderCredentialMutationResultSchema.parse({
      revision,
      providerId: request.providerId,
      auth: {
        status: 'configured',
        credentialRef: credentialReference(request.providerId, upsertedId),
        method: credential.method,
        source: 'stored-credential',
      },
    });
  }
  async resolve(input: PrivateCredentialResolveRequest): Promise<PrivateCredentialResolveResult> {
    const request = PrivateCredentialResolveRequestSchema.parse(input);
    await this.authStorage.credentials.reload();
    const row = this.authStorage.credentials.list(request.providerId)
      .find(candidate => candidate.disabledCause === null && credentialReference(request.providerId, candidate.id) === request.credentialRef);
    if (!row) throw new ProjectionError(404, 'CREDENTIAL_UNAVAILABLE', 'Selected provider credential is unavailable');
    const credential = row.credential;
    if (credential.type === 'api_key') return {
      workspaceId: request.workspaceId, agentDirectoryId: request.agentDirectoryId,
      providerId: request.providerId, credentialRef: request.credentialRef, purpose: request.purpose,
      credential: { method: 'api-key', apiKey: credential.key },
    };
    if (credential.type === 'oauth' && credential.access && credential.refresh && Number.isFinite(credential.expires)) return {
      workspaceId: request.workspaceId, agentDirectoryId: request.agentDirectoryId,
      providerId: request.providerId, credentialRef: request.credentialRef, purpose: request.purpose,
      credential: { method: 'oauth', accessToken: credential.access, refreshToken: credential.refresh, expiresAt: credential.expires },
    };
    throw new ProjectionError(422, 'OAUTH_REAUTH_REQUIRED', 'Selected provider credential requires re-authentication');
  }


  async delete(input: ProviderCredentialDeleteRequest, revision: string): Promise<ProviderCredentialMutationResult> {
    const request = ProviderCredentialDeleteRequestSchema.parse(input);
    PositiveCounterSchema.parse(revision);
    await this.models.readProviders(this.workspaceId, request.expectedRevision);
    const stored = this.authStorage.credentials.list(request.providerId)
      .find(row => credentialReference(request.providerId, row.id) === request.credentialRef);
    if (!stored) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Credential reference is no longer stored for this provider');
    try {
      const removed = await this.authStorage.credentials.removeById(request.providerId, stored.id);
      if (!removed) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Credential reference is no longer stored for this provider');
      await this.authStorage.credentials.reload();
    } catch (error) {
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider credential removal failed');
    }
    return ProviderCredentialMutationResultSchema.parse({
      revision, providerId: request.providerId, auth: this.models.provider(request.providerId).auth,
    });
  }
}
