import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { replaceFileAtomically } from '@oh-my-pi/pi-coding-agent/utils/atomic-file';
import { ProviderAccountsSchema, ProviderAccountMutationRequestSchema, type ProviderAccounts, type ProviderAccountMutationRequest } from '@openchamber/agent-contract';
import { z } from 'zod';
import { resolveConfigValue } from '@oh-my-pi/pi-coding-agent/config/resolve-config-value';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import {
  PositiveCounterSchema, ProviderCredentialMutationResultSchema,
  ProviderCredentialWriteRequestSchema, ProviderCredentialDeleteRequestSchema,
  type ProviderCredentialWriteRequest, type ProviderCredentialDeleteRequest,
  type ProviderCredentialMutationResult,
} from '@openchamber/agent-contract';
import type { PrivateCredentialResolveRequest, PrivateCredentialResolveResult,
  PrivateCredentialHandoffRequest, PrivateCredentialHandoffResult } from '../catalogs/protocol.ts';
import { PrivateCredentialResolveRequestSchema, PrivateCredentialHandoffRequestSchema,
  PrivateCredentialResolveResultSchema, PrivateCredentialHandoffResultSchema } from '../catalogs/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { NativeModels, credentialReference } from './catalog-models.ts';
export class NativeCredentials {
  constructor(private readonly authStorage: AuthStorage, private readonly models: NativeModels,
    private readonly workspaceId: string, private readonly agentDirectoryId: string, private readonly labelsPath?: string) {}

  private async labels(): Promise<Record<string, string>> {
    if (!this.labelsPath) return {};
    try { return z.record(z.string(), z.string().max(128)).parse(JSON.parse(await readFile(this.labelsPath, 'utf8'))); }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return {};
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider account labels could not be read');
    }
  }

  async accounts(providerId: string, revision: string): Promise<ProviderAccounts> {
    await this.models.readProviders(this.workspaceId, revision);
    this.models.provider(providerId);
    const labels = await this.labels();
    const selected = this.models.defaultCredentialRef(providerId);
    const provider = this.models.provider(providerId);
    const selectionOverriddenBy = provider.auth.status === 'configured' && provider.auth.source !== 'stored-credential'
      ? provider.auth.source : null;
    return ProviderAccountsSchema.parse({ revision, providerId, selectionMode: selected === null ? 'automatic' : 'pinned',
      selectionOverriddenBy, accounts: this.authStorage.credentials.list(providerId).map(row => {
      const credentialRef = credentialReference(providerId, row.id);
      const account = { credentialRef, method: row.credential.type === 'oauth' ? 'oauth' : 'api-key',
        label: labels[credentialRef], active: credentialRef === selected, disabled: row.disabledCause !== null };
      if (row.credential.type !== 'oauth') return account;
      return { ...account, email: row.credential.email, accountId: row.credential.accountId };
    }) });
  }

  async account(providerId: string, input: ProviderAccountMutationRequest, revision: string): Promise<ProviderAccounts> {
    const request = ProviderAccountMutationRequestSchema.parse(input);
    await this.models.readProviders(this.workspaceId, request.expectedRevision);
    if (request.action === 'automatic') {
      await this.models.selectCredential(providerId, null, revision);
      return this.accounts(providerId, revision);
    }
    const row = this.authStorage.credentials.list(providerId).find(row => credentialReference(providerId, row.id) === request.credentialRef);
    if (!row) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Provider account is no longer stored');
    if (request.action === 'select') {
      await this.models.selectCredential(providerId, request.credentialRef, revision);
    } else if (request.action === 'remove') {
      await this.delete({ expectedRevision: request.expectedRevision, providerId, credentialRef: request.credentialRef }, revision);
    } else {
      if (!this.labelsPath) throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider account metadata storage is unavailable');
      const labels = await this.labels();
      if (request.label) labels[request.credentialRef] = request.label; else delete labels[request.credentialRef];
      try {
        await mkdir(dirname(this.labelsPath), { recursive: true, mode: 0o700 });
        const temporary = `${this.labelsPath}.${randomUUID()}.tmp`;
        try {
          await writeFile(temporary, JSON.stringify(labels), { mode: 0o600, flag: 'wx' });
          await replaceFileAtomically(temporary, this.labelsPath);
        } finally { await rm(temporary, { force: true }); }
      } catch { throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Provider account label could not be saved'); }
    }
    return this.accounts(providerId, revision);
  }

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
      await this.authStorage.credentials.upsert(request.providerId, credential.method === 'api-key'
        ? { type: 'api_key', key: credential.apiKey, source: 'login' }
        : { type: 'oauth', access: credential.accessToken, refresh: credential.refreshToken, expires: credential.expiresAt });
      await this.authStorage.credentials.reload();
      const matched = this.authStorage.credentials.list(request.providerId).filter(entry => entry.disabledCause === null && (credential.method === 'api-key'
        ? entry.credential.type === 'api_key' && entry.credential.key === credential.apiKey
        : entry.credential.type === 'oauth' && entry.credential.access === credential.accessToken)).at(-1);
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
    this.assertOwner(request);
    await this.authStorage.credentials.reload();
    const row = this.authStorage.credentials.list(request.providerId)
      .find(candidate => candidate.disabledCause === null && credentialReference(request.providerId, candidate.id) === request.credentialRef);
    if (!row) throw new ProjectionError(404, 'CREDENTIAL_UNAVAILABLE', 'Selected provider credential is unavailable');
    const credential = row.credential;
    if (credential.type === 'api_key') {
      if (credential.key.startsWith('!')) throw new ProjectionError(422, 'CREDENTIAL_UNAVAILABLE', 'Command-backed credentials require native provider authentication');
      let key: string | undefined;
      try { key = await resolveConfigValue(credential.key); } catch { /* reported as unavailable below */ }
      if (!key) throw new ProjectionError(404, 'CREDENTIAL_UNAVAILABLE', 'Selected provider credential is unavailable');
      return PrivateCredentialResolveResultSchema.parse({ ...request, credential: { type: 'api_key', key } });
    }
    let selectedCredential;
    try {
      const access = await this.authStorage.oauth.accessById(request.providerId, row.id);
      if (!access?.ok || (access.credentialId !== undefined && access.credentialId !== row.id))
        throw new Error('Selected OAuth credential is unavailable');
      await this.authStorage.credentials.reload();
      selectedCredential = this.authStorage.credentials.list(request.providerId)
        .find(candidate => candidate.id === row.id && candidate.disabledCause === null)?.credential;
    } catch {
      throw new ProjectionError(503, 'CREDENTIAL_UNAVAILABLE', 'Selected provider credential is unavailable');
    }
    const parsed = PrivateCredentialResolveResultSchema.safeParse({ ...request, credential: selectedCredential });
    if (!parsed.success) throw new ProjectionError(422, 'OAUTH_REAUTH_REQUIRED', 'Selected provider credential requires re-authentication');
    return parsed.data;
  }

  async handoff(input: PrivateCredentialHandoffRequest, revision: string): Promise<PrivateCredentialHandoffResult> {
    const request = PrivateCredentialHandoffRequestSchema.parse(input);
    this.assertOwner(request);
    const { providerId, source, credentialType } = request.selection;
    const outcome = (status: 'unsupported' | 'unavailable' | 're-auth-required', code: string) =>
      PrivateCredentialHandoffResultSchema.parse({ workspaceId: this.workspaceId, agentDirectoryId: this.agentDirectoryId,
        revision: request.expectedRevision, outcome: { providerId, source, credentialType, status, code } });
    if (providerId === 'opencode') return outcome('unsupported', 'CONSOLE_CREDENTIAL_UNSUPPORTED');
    if (credentialType === 'oauth') {
      const reauth = source === 'stored-credential' && ['anthropic', 'openai-codex', 'github-copilot', 'google-gemini-cli'].includes(providerId);
      return outcome(reauth ? 're-auth-required' : 'unsupported', reauth ? 'OAUTH_REAUTH_REQUIRED' : 'CREDENTIAL_FORMAT_UNSUPPORTED');
    }
    if (source === 'external-environment') return outcome('unavailable', 'LEGACY_ENVIRONMENT_UNAVAILABLE');
    if (providerId === 'anthropic' || providerId === 'openai' || providerId === 'google') return outcome('unavailable', 'PROVIDER_CONVERSION_UNVERIFIED');
    if (request.selection.source !== 'selected-file') return outcome('unavailable', 'SELECTED_SOURCE_UNAVAILABLE');
    const catalog = await this.models.readProviders(this.workspaceId, request.expectedRevision);
    const provider = catalog.providers.find(item => item.providerId === providerId);
    if (!provider) return outcome('unavailable', 'PROVIDER_UNAVAILABLE');
    if (provider.protocol !== 'chat-completions' || provider.endpoint === null) return outcome('unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED');
    if (!await this.models.supportsSelectedFileHandoff(providerId)) return outcome('unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED');
    // The supported legacy file is one selected auth.json API entry, never an entire account map.
    let parsed: { type: 'api'; key: string };
    try { parsed = z.strictObject({ type: z.literal('api'), key: z.string().min(1) }).parse(JSON.parse(request.selection.file.content)); }
    catch { return outcome('unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED'); }
    if (parsed.key.startsWith('!')) return outcome('unsupported', 'CREDENTIAL_FORMAT_UNSUPPORTED');
    const written = await this.write({ expectedRevision: request.expectedRevision, providerId,
      credential: { method: 'api-key', apiKey: parsed.key } }, revision);
    if (written.auth.status !== 'configured') throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Selected credential persistence failed');
    const verified = await this.resolve({ workspaceId: this.workspaceId, agentDirectoryId: this.agentDirectoryId,
      providerId, credentialRef: written.auth.credentialRef, purpose: 'routing' });
    if (verified.credential.type !== 'api_key' || verified.credential.key !== parsed.key)
      throw new ProjectionError(503, 'CREDENTIAL_WRITE_FAILED', 'Selected credential reload verification failed');
    return PrivateCredentialHandoffResultSchema.parse({ workspaceId: this.workspaceId, agentDirectoryId: this.agentDirectoryId,
      revision, outcome: { providerId, source, credentialType, status: 'imported', code: 'CREDENTIAL_IMPORTED', credentialRef: written.auth.credentialRef } });
  }

  private assertOwner(input: { workspaceId: string; agentDirectoryId: string }): void {
    if (input.workspaceId !== this.workspaceId || input.agentDirectoryId !== this.agentDirectoryId)
      throw new ProjectionError(403, 'UNAUTHORIZED', 'Selected credential owner is not authorized');
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
