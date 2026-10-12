import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import {
  PositiveCounterSchema, ProviderCredentialMutationResultSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  type ProviderCredentialWriteRequest, type ProviderCredentialDeleteRequest,
  type ProviderCredentialMutationResult,
} from '@openchamber/agent-contract';
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
    try {
      await this.authStorage.credentials.upsert(request.providerId, credential.method === 'api-key'
        ? { type: 'api_key', key: credential.apiKey, source: 'login' }
        : { type: 'oauth', access: credential.accessToken, refresh: credential.refreshToken, expires: credential.expiresAt });
      await this.authStorage.credentials.reload();
    } catch {
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider credential persistence failed');
    }
    return ProviderCredentialMutationResultSchema.parse({
      revision, providerId: request.providerId, auth: this.models.provider(request.providerId).auth,
    });
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
